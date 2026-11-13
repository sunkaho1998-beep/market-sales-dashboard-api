
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: process.env.PGSSLMODE === 'disable'
    ? false
    : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// ==========================================
// DATABASE INITIALIZATION
// ==========================================

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_items (
      id bigserial PRIMARY KEY,
      shop_id text NOT NULL,
      identity_key text NOT NULL,
      asin text,
      msku text,
      local_sku text,
      title text,
      image_url text,
      category text,
      listing_status text,
      last_seen_run_id uuid,
      raw jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(shop_id, identity_key)
    );

    CREATE TABLE IF NOT EXISTS sales_snapshots (
      id bigserial PRIMARY KEY,
      run_id uuid NOT NULL,
      shop_id text NOT NULL,
      period_days int NOT NULL,
      seller_sku text,
      asin text,
      units numeric NOT NULL DEFAULT 0,
      previous_units numeric NOT NULL DEFAULT 0,
      raw jsonb NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS inventory_snapshots (
      id bigserial PRIMARY KEY,
      run_id uuid NOT NULL,
      shop_id text NOT NULL,
      asin text,
      local_sku text,
      seller_sku text,
      available int,
      reserved int,
      raw jsonb NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id uuid PRIMARY KEY,
      started_at timestamptz NOT NULL,
      finished_at timestamptz,
      status text NOT NULL,
      metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
      error text
    );

    CREATE TABLE IF NOT EXISTS partner_sessions (
      token_hash text PRIMARY KEY,
      created_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL
    );

    ALTER TABLE catalog_items
      ADD COLUMN IF NOT EXISTS market_code text NOT NULL DEFAULT 'US',
      ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'USD';

    ALTER TABLE sales_snapshots
      ADD COLUMN IF NOT EXISTS market_code text NOT NULL DEFAULT 'US',
      ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'USD';

    ALTER TABLE inventory_snapshots
      ADD COLUMN IF NOT EXISTS market_code text NOT NULL DEFAULT 'US',
      ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'USD';

    ALTER TABLE sync_runs
      ADD COLUMN IF NOT EXISTS market_code text NOT NULL DEFAULT 'US',
      ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'USD';

    CREATE INDEX IF NOT EXISTS catalog_seen_idx
      ON catalog_items(last_seen_run_id, shop_id);

    CREATE INDEX IF NOT EXISTS catalog_market_idx
      ON catalog_items(market_code, shop_id);

    CREATE INDEX IF NOT EXISTS sales_run_idx
      ON sales_snapshots(run_id, period_days, shop_id);

    CREATE INDEX IF NOT EXISTS sales_market_idx
      ON sales_snapshots(market_code, run_id);

    CREATE INDEX IF NOT EXISTS sales_sku_lookup_idx
      ON sales_snapshots(run_id, shop_id, period_days, seller_sku);

    CREATE INDEX IF NOT EXISTS inv_run_idx
      ON inventory_snapshots(run_id, shop_id);

    CREATE INDEX IF NOT EXISTS inventory_market_idx
      ON inventory_snapshots(market_code, run_id);

    CREATE INDEX IF NOT EXISTS inventory_sku_lookup_idx
      ON inventory_snapshots(run_id, shop_id, seller_sku, local_sku);

    CREATE INDEX IF NOT EXISTS sync_market_idx
      ON sync_runs(market_code, started_at);
  `);
}

// ==========================================
// MARKET VALIDATION
// ==========================================

function validateMarket(marketCode, currencyCode) {
  const expected = {
    US: 'USD',
    AU: 'AUD'
  };

  if (!expected[marketCode]) {
    throw new Error(`Unsupported market: ${marketCode}`);
  }

  if (expected[marketCode] !== currencyCode) {
    throw new Error(
      `Invalid currency ${currencyCode} for ${marketCode}`
    );
  }
}

// ==========================================
// PARTNER SESSIONS
// ==========================================

export async function createSession(hash, expires) {
  await pool.query(
    `INSERT INTO partner_sessions
      (token_hash, created_at, expires_at)
     VALUES ($1, now(), $2)`,
    [hash, expires]
  );
}

export async function hasSession(hash) {
  const r = await pool.query(
    `SELECT 1 FROM partner_sessions
     WHERE token_hash = $1 AND expires_at > now()`,
    [hash]
  );

  return r.rowCount > 0;
}

export async function deleteSession(hash) {
  await pool.query(
    'DELETE FROM partner_sessions WHERE token_hash = $1',
    [hash]
  );
}

// ==========================================
// SYNC RUN MANAGEMENT
// ==========================================

export async function latestRun(marketCode = null) {
  if (marketCode && !['US', 'AU'].includes(marketCode)) {
    throw new Error(`Unsupported market: ${marketCode}`);
  }

  const result = marketCode
    ? await pool.query(
        `SELECT *
         FROM sync_runs
         WHERE status = 'success'
           AND market_code = $1
         ORDER BY finished_at DESC
         LIMIT 1`,
        [marketCode]
      )
    : await pool.query(
        `SELECT *
         FROM sync_runs
         WHERE status = 'success'
         ORDER BY finished_at DESC
         LIMIT 1`
      );

  return result.rows[0] || null;
}

export async function saveRunStart(
  id,
  marketCode = 'US',
  currencyCode = 'USD'
) {
  validateMarket(marketCode, currencyCode);

  await pool.query(
    `INSERT INTO sync_runs (
      id, started_at, status, market_code, currency_code
    )
    VALUES ($1, now(), 'running', $2, $3)`,
    [id, marketCode, currencyCode]
  );
}

export async function finishRun(
  id,
  status,
  metrics = {},
  error = null
) {
  await pool.query(
    `UPDATE sync_runs
     SET finished_at = now(),
         status = $2,
         metrics = $3::jsonb,
         error = $4
     WHERE id = $1`,
    [id, status, JSON.stringify(metrics), error]
  );
}

// ==========================================
// MARKET DATA PERSISTENCE
// ==========================================

export async function replaceRunData(
  runId,
  listingByShop,
  salesByShop,
  stockByShop,
  marketCode = 'US',
  currencyCode = 'USD'
) {
  validateMarket(marketCode, currencyCode);

  const runCheck = await pool.query(
    `SELECT id
     FROM sync_runs
     WHERE id = $1
       AND market_code = $2
       AND currency_code = $3
       AND status = 'running'`,
    [runId, marketCode, currencyCode]
  );

  if (runCheck.rowCount !== 1) {
    throw new Error(`Sync run not found or market mismatch: ${runId}`);
  }

  const c = await pool.connect();

  try {
    await c.query('BEGIN');

    // CATALOG
    for (const [sid, rows] of listingByShop) {
      for (const x of rows) {
        const identityKey =
          `${x.asin || ''}|${x.msku || ''}`;

        await c.query(`
          INSERT INTO catalog_items (
            shop_id, market_code, currency_code,
            identity_key, asin, msku, local_sku,
            title, image_url, category, listing_status,
            last_seen_run_id, raw, updated_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()
          )
          ON CONFLICT (shop_id, identity_key)
          DO UPDATE SET
            market_code = EXCLUDED.market_code,
            currency_code = EXCLUDED.currency_code,
            local_sku = EXCLUDED.local_sku,
            title = EXCLUDED.title,
            image_url = EXCLUDED.image_url,
            category = EXCLUDED.category,
            listing_status = EXCLUDED.listing_status,
            last_seen_run_id = EXCLUDED.last_seen_run_id,
            raw = EXCLUDED.raw,
            updated_at = now()
        `, [
          sid,
          marketCode,
          currencyCode,
          identityKey,
          x.asin || null,
          x.msku || null,
          x.local_sku || null,
          x.local_name || x.item_name || x.product_name || null,
          x.small_image_url || null,
          x.category_text || x.category || 'Other',
          String(x.status_text || x.status || 'Unknown'),
          runId,
          JSON.stringify(x)
        ]);
      }
    }

    // SALES
    for (const [sid, period, rows] of salesByShop) {
      for (const x of rows) {
        const units = Number(
          String(x?.date1?.volume ?? 0).replaceAll(',', '')
        ) || 0;

        const previous = Number(
          String(
            x?._previous_units ?? x?.date2?.volume ?? 0
          ).replaceAll(',', '')
        ) || 0;

        const sellerSku = (
          Array.isArray(x.seller_sku)
            ? x.seller_sku[0]
            : x.seller_sku
        ) || x.msku || null;

        await c.query(`
          INSERT INTO sales_snapshots (
            run_id, shop_id, market_code, currency_code,
            period_days, seller_sku, asin,
            units, previous_units, raw
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [
          runId,
          sid,
          marketCode,
          currencyCode,
          period,
          sellerSku,
          x.asin || null,
          units,
          previous,
          JSON.stringify(x)
        ]);
      }
    }

    // INVENTORY
    for (const [sid, rows] of stockByShop) {
      for (const x of rows) {
        await c.query(`
          INSERT INTO inventory_snapshots (
            run_id, shop_id, market_code, currency_code,
            asin, local_sku, seller_sku,
            available, reserved, raw
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [
          runId,
          sid,
          marketCode,
          currencyCode,
          x.asin || null,
          x.sku || x.local_sku || null,
          x.seller_sku || null,
          Number(x.afn_fulfillable_quantity) || 0,
          Number(x.afn_reserved_quantity) || 0,
          JSON.stringify(x)
        ]);
      }
    }

    await c.query('COMMIT');

  } catch (error) {
    await c.query('ROLLBACK');
    throw error;

  } finally {
    c.release();
  }
}

// ==========================================
// SALES LOOKUP
// SKU FIRST; ASIN FALLBACK ONLY WITHOUT SKU
// ==========================================

async function getSalesForSku(
  marketCode,
  runId,
  shopId,
  period,
  asin,
  sellerSku
) {
  const result = await pool.query(`
    SELECT
      COALESCE(SUM(units), 0) AS units,
      COALESCE(SUM(previous_units), 0) AS prev
    FROM sales_snapshots
    WHERE market_code = $1
      AND run_id = $2
      AND shop_id = $3
      AND period_days = $4
      AND (
        ($5::text IS NOT NULL AND seller_sku = $5)
        OR
        ($5::text IS NULL AND $6::text IS NOT NULL AND asin = $6)
      )
  `, [
    marketCode,
    runId,
    shopId,
    period,
    sellerSku || null,
    asin || null
  ]);

  return {
    units: Number(result.rows[0].units),
    prev: Number(result.rows[0].prev)
  };
}

// ==========================================
// INVENTORY LOOKUP
// MATCH SELLER SKU, THEN LOCAL SKU, THEN ASIN
// ==========================================

async function getInventoryForSku(
  marketCode,
  runId,
  shopId,
  asin,
  sellerSku,
  localSku
) {
  const base = `
    SELECT
      COUNT(*)::int AS rows,
      COALESCE(SUM(available), 0) AS available,
      COALESCE(SUM(reserved), 0) AS reserved
    FROM inventory_snapshots
    WHERE market_code = $1
      AND run_id = $2
      AND shop_id = $3
  `;

  const params = [marketCode, runId, shopId];

  // First: exact Seller SKU match.
  if (sellerSku) {
    const r = await pool.query(
      base + ' AND seller_sku = $4',
      [...params, sellerSku]
    );

    if (Number(r.rows[0].rows) > 0) {
      return {
        rows: Number(r.rows[0].rows),
        available: Number(r.rows[0].available),
        reserved: Number(r.rows[0].reserved),
        matchedBy: 'seller_sku'
      };
    }
  }

  // Second: inventory SKU is stored as local_sku.
  if (localSku) {
    const r = await pool.query(
      base + ' AND local_sku = $4',
      [...params, localSku]
    );

    if (Number(r.rows[0].rows) > 0) {
      return {
        rows: Number(r.rows[0].rows),
        available: Number(r.rows[0].available),
        reserved: Number(r.rows[0].reserved),
        matchedBy: 'local_sku'
      };
    }
  }

  // Last resort: ASIN fallback.
  if (asin) {
    const r = await pool.query(
      base + ' AND asin = $4',
      [...params, asin]
    );

    return {
      rows: Number(r.rows[0].rows),
      available: Number(r.rows[0].available),
      reserved: Number(r.rows[0].reserved),
      matchedBy: Number(r.rows[0].rows) > 0 ? 'asin' : 'none'
    };
  }

  return {
    rows: 0,
    available: 0,
    reserved: 0,
    matchedBy: 'none'
  };
}

// ==========================================
// MARKET DASHBOARD
// ==========================================

export async function getDashboard(marketCode = 'US') {
  if (!['US', 'AU'].includes(marketCode)) {
    throw new Error(`Unsupported market: ${marketCode}`);
  }

  const run = await latestRun(marketCode);

  if (!run) return null;

  const catalog = await pool.query(`
    SELECT
      shop_id,
      market_code,
      currency_code,
      asin,
      msku,
      local_sku,
      title,
      image_url,
      category,
      listing_status
    FROM catalog_items
    WHERE market_code = $1
      AND last_seen_run_id = $2
    ORDER BY title
  `, [marketCode, run.id]);

  const items = [];

  for (const x of catalog.rows) {
    const [s7, s30, s90, inv] = await Promise.all([
      getSalesForSku(
        marketCode, run.id, x.shop_id, 7, x.asin, x.msku
      ),
      getSalesForSku(
        marketCode, run.id, x.shop_id, 30, x.asin, x.msku
      ),
      getSalesForSku(
        marketCode, run.id, x.shop_id, 90, x.asin, x.msku
      ),
      getInventoryForSku(
        marketCode,
        run.id,
        x.shop_id,
        x.asin,
        x.msku,
        x.local_sku
      )
    ]);

    const available = inv.available;
    const units30 = s30.units;
    const velocity = units30 / 30;

    const listingStatus = String(
      x.listing_status || 'Unknown'
    );

    const normalizedStatus = listingStatus.toLowerCase();

    const inactive = [
      'inactive',
      '停售',
      '已停售',
      'deleted'
    ].some(value => normalizedStatus.includes(value));

    items.push({
      id: `${marketCode}|${x.shop_id}|${x.asin || ''}|${x.msku || ''}`,

      marketCode,
      currencyCode: x.currency_code,

      shopId: x.shop_id,
      asin: x.asin,
      sku: x.msku,
      localSku: x.local_sku,

      title: x.title,
      imageUrl: x.image_url,
      category: x.category,
      listingStatus,

      sales7: s7.units,
      previousSales7: s7.prev,
      growth7: s7.prev > 0
        ? ((s7.units - s7.prev) / s7.prev) * 100
        : null,

      sales30: units30,
      previousSales30: s30.prev,
      growth30: s30.prev > 0
        ? ((units30 - s30.prev) / s30.prev) * 100
        : null,

      sales90: s90.units,
      previousSales90: s90.prev,

      availableStock: inv.rows > 0 ? available : null,
      reservedStock: inv.rows > 0 ? inv.reserved : null,
      inventoryMatchedBy: inv.matchedBy,

      daysOfCover: velocity > 0
        ? available / velocity
        : null,

      status: inv.rows === 0
        ? 'unknown'
        : available === 0
          ? 'stockout'
          : velocity > 0 && available / velocity < config.lowStockDays
            ? 'low'
            : 'healthy',

      isInactive: inactive
    });
  }

  const shops = await pool.query(`
    SELECT
      shop_id,
      COUNT(*)::int AS count
    FROM catalog_items
    WHERE market_code = $1
      AND last_seen_run_id = $2
    GROUP BY shop_id
    ORDER BY shop_id
  `, [marketCode, run.id]);

  return {
    meta: {
      source: 'LingXing MCP',
      marketplace: marketCode === 'US'
        ? 'Amazon US'
        : 'Amazon Australia',

      marketCode,
      currencyCode: run.currency_code,
      generatedAt: run.finished_at,
      isMock: false,

      catalogCount: items.length,

      zeroSalesCount: items.filter(
        x => !x.sales7 && !x.sales30
      ).length,

      inactiveCount: items.filter(
        x => x.isInactive
      ).length,

      shopCounts: shops.rows,
      runMetrics: run.metrics
    },

    items
  };
}

// ==========================================
// GLOBAL OVERVIEW
// Sales values are UNITS, not revenue.
// US and AU remain separate.
// ==========================================

export async function getGlobalOverview() {
  const markets = {};

  for (const marketCode of ['US', 'AU']) {
    const dashboard = await getDashboard(marketCode);

    if (!dashboard) {
      markets[marketCode] = {
        available: false,
        marketCode,
        currencyCode: config.markets[marketCode].currency,
        shopCounts: [],
        data: {
          catalogCount: 0,
          zeroSalesCount: 0,
          inactiveCount: 0,
          sales7: 0,
          sales30: 0,
          sales90: 0
        }
      };

      continue;
    }

    const items = dashboard.items;

    markets[marketCode] = {
      available: true,
      marketCode,
      currencyCode: dashboard.meta.currencyCode,
      generatedAt: dashboard.meta.generatedAt,
      shopCounts: dashboard.meta.shopCounts,

      data: {
        catalogCount: dashboard.meta.catalogCount,
        zeroSalesCount: dashboard.meta.zeroSalesCount,
        inactiveCount: dashboard.meta.inactiveCount,

        sales7: items.reduce(
          (sum, item) => sum + item.sales7, 0
        ),

        sales30: items.reduce(
          (sum, item) => sum + item.sales30, 0
        ),

        sales90: items.reduce(
          (sum, item) => sum + item.sales90, 0
        )
      }
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    markets,

    note:
      'Sales figures represent units sold, not revenue. ' +
      'US and AU are reported separately. ' +
      'USD and AUD are never added together.'
  };
}
