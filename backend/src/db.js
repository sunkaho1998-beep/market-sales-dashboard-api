
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
// HELPERS
// ==========================================

const clean = value => String(value ?? '').trim();

const normalizeAsin = value => clean(value).toUpperCase();
const normalizeSku = value => clean(value).toUpperCase();

const isGhostSku = value =>
  clean(value).toLowerCase().startsWith('amzn.gr.');

const number = value => {
  const parsed = Number(
    String(value ?? 0).replaceAll(',', '').trim()
  );
  return Number.isFinite(parsed) ? parsed : 0;
};

const validTitle = value => {
  const title = clean(value);
  return !title || title === '/' || title === '-' ? null : title;
};

const growthRate = (current, previous) =>
  previous > 0
    ? ((current - previous) / previous) * 100
    : null;

function validateMarket(marketCode, currencyCode) {
  const expected = { US: 'USD', AU: 'AUD' };

  if (!expected[marketCode]) {
    throw new Error(`Unsupported market: ${marketCode}`);
  }

  if (expected[marketCode] !== currencyCode) {
    throw new Error(`Invalid currency ${currencyCode} for ${marketCode}`);
  }
}

function isInactiveStatus(value) {
  return [
    '0', 'inactive', 'deleted', '停售', '已停售'
  ].includes(clean(value).toLowerCase());
}

function isActiveStatus(value) {
  return [
    '1', 'active', '在售'
  ].includes(clean(value).toLowerCase());
}

// ==========================================
// DATABASE INITIALIZATION
// Existing history is preserved.
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
  const result = await pool.query(
    `SELECT 1 FROM partner_sessions
     WHERE token_hash = $1 AND expires_at > now()`,
    [hash]
  );
  return result.rowCount > 0;
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
        `SELECT * FROM sync_runs
         WHERE status = 'success' AND market_code = $1
         ORDER BY finished_at DESC LIMIT 1`,
        [marketCode]
      )
    : await pool.query(
        `SELECT * FROM sync_runs
         WHERE status = 'success'
         ORDER BY finished_at DESC LIMIT 1`
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

  const check = await pool.query(
    `SELECT id FROM sync_runs
     WHERE id = $1
       AND market_code = $2
       AND currency_code = $3
       AND status = 'running'`,
    [runId, marketCode, currencyCode]
  );

  if (check.rowCount !== 1) {
    throw new Error(`Sync run not found or market mismatch: ${runId}`);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const [sid, rows] of listingByShop) {
      for (const item of rows) {
        const asin = normalizeAsin(item.asin);
        const msku = clean(item.msku);
        const identityKey = `${asin}|${msku}`;

        await client.query(`
          INSERT INTO catalog_items (
            shop_id, market_code, currency_code,
            identity_key, asin, msku, local_sku,
            title, image_url, category, listing_status,
            last_seen_run_id, raw, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
          ON CONFLICT (shop_id, identity_key)
          DO UPDATE SET
            market_code = EXCLUDED.market_code,
            currency_code = EXCLUDED.currency_code,
            asin = EXCLUDED.asin,
            msku = EXCLUDED.msku,
            local_sku = EXCLUDED.local_sku,
            title = EXCLUDED.title,
            image_url = EXCLUDED.image_url,
            category = EXCLUDED.category,
            listing_status = EXCLUDED.listing_status,
            last_seen_run_id = EXCLUDED.last_seen_run_id,
            raw = EXCLUDED.raw,
            updated_at = now()
        `, [
          String(sid),
          marketCode,
          currencyCode,
          identityKey,
          asin || null,
          msku || null,
          item.local_sku || null,
          item.local_name || item.item_name || item.product_name || null,
          item.small_image_url || null,
          item.category_text || item.category || 'Other',
          String(item.status_text || item.status || 'Unknown'),
          runId,
          JSON.stringify(item)
        ]);
      }
    }

    for (const [sid, period, rows] of salesByShop) {
      for (const item of rows) {
        const units = number(item?.date1?.volume);
        const previous = number(
          item?._previous_units ?? item?.date2?.volume
        );

        const sellerSku = (
          Array.isArray(item.seller_sku)
            ? item.seller_sku[0]
            : item.seller_sku
        ) || item.msku || null;

        await client.query(`
          INSERT INTO sales_snapshots (
            run_id, shop_id, market_code, currency_code,
            period_days, seller_sku, asin,
            units, previous_units, raw
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [
          runId,
          String(sid),
          marketCode,
          currencyCode,
          period,
          sellerSku,
          normalizeAsin(item.asin) || null,
          units,
          previous,
          JSON.stringify(item)
        ]);
      }
    }

    for (const [sid, rows] of stockByShop) {
      for (const item of rows) {
        await client.query(`
          INSERT INTO inventory_snapshots (
            run_id, shop_id, market_code, currency_code,
            asin, local_sku, seller_sku,
            available, reserved, raw
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [
          runId,
          String(sid),
          marketCode,
          currencyCode,
          normalizeAsin(item.asin) || null,
          item.sku || item.local_sku || null,
          item.seller_sku || null,
          number(item.afn_fulfillable_quantity),
          number(item.afn_reserved_quantity),
          JSON.stringify(item)
        ]);
      }
    }

    await client.query('COMMIT');

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;

  } finally {
    client.release();
  }
}

// ==========================================
// SALES LOOKUP
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
    marketCode, runId, shopId, period,
    sellerSku || null, asin || null
  ]);

  return {
    units: number(result.rows[0].units),
    prev: number(result.rows[0].prev)
  };
}

// ==========================================
// INVENTORY LOOKUP
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

  if (sellerSku) {
    const result = await pool.query(
      base + ' AND seller_sku = $4',
      [...params, sellerSku]
    );

    if (number(result.rows[0].rows) > 0) {
      return {
        ...result.rows[0],
        rows: number(result.rows[0].rows),
        available: number(result.rows[0].available),
        reserved: number(result.rows[0].reserved),
        matchedBy: 'seller_sku'
      };
    }
  }

  if (localSku) {
    const result = await pool.query(
      base + ' AND local_sku = $4',
      [...params, localSku]
    );

    if (number(result.rows[0].rows) > 0) {
      return {
        ...result.rows[0],
        rows: number(result.rows[0].rows),
        available: number(result.rows[0].available),
        reserved: number(result.rows[0].reserved),
        matchedBy: 'local_sku'
      };
    }
  }

  if (asin) {
    const result = await pool.query(
      base + ' AND asin = $4',
      [...params, asin]
    );

    return {
      rows: number(result.rows[0].rows),
      available: number(result.rows[0].available),
      reserved: number(result.rows[0].reserved),
      matchedBy: number(result.rows[0].rows) > 0 ? 'asin' : 'none'
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
// Product identity = ASIN
// ==========================================

export async function getDashboard(marketCode = 'US') {
  if (!['US', 'AU'].includes(marketCode)) {
    throw new Error(`Unsupported market: ${marketCode}`);
  }

  const run = await latestRun(marketCode);
  if (!run) return null;

  const catalog = await pool.query(`
    SELECT
      id, shop_id, market_code, currency_code,
      asin, msku, local_sku, title, image_url,
      category, listing_status, last_seen_run_id, raw
    FROM catalog_items
    WHERE market_code = $1
      AND asin IS NOT NULL
      AND asin <> ''
    ORDER BY updated_at DESC
  `, [marketCode]);

  const products = new Map();
  const skuToAsin = new Map();
  const localSkuToAsin = new Map();

  for (const row of catalog.rows) {
    const asin = normalizeAsin(row.asin);
    const shopId = String(row.shop_id);

    if (!asin) continue;

    const key = `ASIN:${asin}`;
    const msku = clean(row.msku);
    const localSku = clean(row.local_sku);

    let item = products.get(key);

    if (!item) {
      item = {
        id: asin,
        asin,
        marketCode,
        currencyCode: row.currency_code,
        title: validTitle(row.title),
        imageUrl: row.image_url || null,
        category: row.category || 'Other',
        sku: null,
        localSku: null,
        sellerSkus: [],
        localSkus: [],
        listingCount: 0,
        listingStatuses: [],
        lastSeenRunIds: [],
        sales7: 0,
        previousSales7: 0,
        sales30: 0,
        previousSales30: 0,
        sales90: 0,
        previousSales90: 0,
        availableStock: 0,
        reservedStock: 0,
        inventoryRows: 0
      };

      products.set(key, item);
    }

    item.listingCount += 1;

    if (!item.title && validTitle(row.title)) {
      item.title = validTitle(row.title);
    }

    if (!item.imageUrl && row.image_url) {
      item.imageUrl = row.image_url;
    }

    if (
      (!item.category || item.category === 'Other') &&
      row.category
    ) {
      item.category = row.category;
    }

    // Keep all SKU mappings internally.
    // Ghost SKUs are filtered only from the returned display fields.
    if (msku && !item.sellerSkus.includes(msku)) {
      item.sellerSkus.push(msku);
    }

    if (localSku && !item.localSkus.includes(localSku)) {
      item.localSkus.push(localSku);
    }

    // Prefer a normal Seller SKU as the primary displayed SKU.
    if (msku && !isGhostSku(msku)) {
      if (!item.sku || isGhostSku(item.sku)) {
        item.sku = msku;
      }
    }

    if (!item.localSku && localSku) {
      item.localSku = localSku;
    }

    if (row.listing_status) {
      item.listingStatuses.push(clean(row.listing_status));
    }

    if (row.last_seen_run_id) {
      item.lastSeenRunIds.push(String(row.last_seen_run_id));
    }

    // Ghost SKU mappings remain available for internal matching.
    if (msku) {
      skuToAsin.set(
        `${shopId}|${normalizeSku(msku)}`,
        asin
      );
    }

    if (localSku) {
      localSkuToAsin.set(
        `${shopId}|${normalizeSku(localSku)}`,
        asin
      );
    }
  }

  // --------------------------------------
  // SALES: latest successful run
  // --------------------------------------

  const sales = await pool.query(`
    SELECT shop_id, period_days, seller_sku, asin,
           units, previous_units
    FROM sales_snapshots
    WHERE market_code = $1
      AND run_id = $2
      AND period_days IN (7, 30, 90)
  `, [marketCode, run.id]);

  for (const row of sales.rows) {
    const shopId = String(row.shop_id);
    const sellerSku = clean(row.seller_sku);

    let asin = normalizeAsin(row.asin);

    if (!asin && sellerSku) {
      asin = skuToAsin.get(
        `${shopId}|${normalizeSku(sellerSku)}`
      ) || '';
    }

    if (!asin) continue;

    const item = products.get(`ASIN:${asin}`);
    if (!item) continue;

    const period = Number(row.period_days);
    const units = number(row.units);
    const previous = number(row.previous_units);

    if (period === 7) {
      item.sales7 += units;
      item.previousSales7 += previous;
    } else if (period === 30) {
      item.sales30 += units;
      item.previousSales30 += previous;
    } else if (period === 90) {
      item.sales90 += units;
      item.previousSales90 += previous;
    }

    // Do not expose Ghost SKU to the partner.
    // Keep it internally available through skuToAsin.
    if (
      sellerSku &&
      !isGhostSku(sellerSku) &&
      !item.sellerSkus.includes(sellerSku)
    ) {
      item.sellerSkus.push(sellerSku);
    }

    if (
      sellerSku &&
      !isGhostSku(sellerSku) &&
      (!item.sku || isGhostSku(item.sku))
    ) {
      item.sku = sellerSku;
    }
  }

  // --------------------------------------
  // INVENTORY: deduplicate by shop + unique_id
  // --------------------------------------

  const inventory = await pool.query(`
    WITH deduplicated AS (
      SELECT
        id, shop_id, asin, local_sku, seller_sku,
        available, reserved, raw,
        ROW_NUMBER() OVER (
          PARTITION BY
            shop_id,
            COALESCE(
              NULLIF(raw->>'unique_id', ''),
              id::text
            )
          ORDER BY id
        ) AS duplicate_rank
      FROM inventory_snapshots
      WHERE market_code = $1
        AND run_id = $2
    )
    SELECT *
    FROM deduplicated
    WHERE duplicate_rank = 1
  `, [marketCode, run.id]);

  for (const row of inventory.rows) {
    const shopId = String(row.shop_id);
    const sellerSku = clean(row.seller_sku);
    const localSku = clean(row.local_sku);

    let asin = normalizeAsin(row.asin);

    if (!asin && sellerSku) {
      asin = skuToAsin.get(
        `${shopId}|${normalizeSku(sellerSku)}`
      ) || '';
    }

    if (!asin && localSku) {
      asin = localSkuToAsin.get(
        `${shopId}|${normalizeSku(localSku)}`
      ) || '';
    }

    if (!asin) continue;

    const item = products.get(`ASIN:${asin}`);
    if (!item) continue;

    item.availableStock += number(row.available);
    item.reservedStock += number(row.reserved);
    item.inventoryRows += 1;
  }

  // --------------------------------------
  // CALCULATE PRODUCT METRICS
  // --------------------------------------

  const items = [...products.values()].map(item => {
    const velocity = item.sales30 / 30;

    const daysOfCover = velocity > 0
      ? item.availableStock / velocity
      : null;

    const hasLatestListing = item.lastSeenRunIds.includes(
      String(run.id)
    );

    const hasActiveListing = item.listingStatuses.some(
      isActiveStatus
    );

    const allInactive =
      item.listingStatuses.length > 0 &&
      item.listingStatuses.every(isInactiveStatus);

    let listingStatus = 'Unknown';

    if (allInactive) {
      listingStatus = 'Inactive';
    } else if (hasActiveListing) {
      listingStatus = 'Active';
    } else if (!hasLatestListing) {
      listingStatus = 'Not seen in latest sync';
    } else if (item.listingStatuses.length > 0) {
      listingStatus = item.listingStatuses[0];
    }

    const status = item.inventoryRows === 0
      ? 'unknown'
      : item.availableStock === 0
        ? 'stockout'
        : item.sales30 === 0
          ? 'no_sales'
          : daysOfCover !== null &&
            daysOfCover < config.lowStockDays
            ? 'low'
            : 'healthy';

    return {
      id: item.asin,
      asin: item.asin,
      marketCode: item.marketCode,
      currencyCode: item.currencyCode,
      title: item.title || item.sku || item.asin,
      imageUrl: item.imageUrl,
      category: item.category,

      sku: item.sku,
      localSku: item.localSku,

      // Final display filtering.
      sellerSkus: [...new Set(item.sellerSkus)]
        .filter(sku => !isGhostSku(sku)),

      localSkus: [...new Set(item.localSkus)],

      listingCount: item.listingCount,
      listingStatus,
      isInactive: allInactive,
      isHistorical: !hasLatestListing,

      sales7: item.sales7,
      previousSales7: item.previousSales7,
      salesGrowth7: growthRate(
        item.sales7, item.previousSales7
      ),

      sales30: item.sales30,
      previousSales30: item.previousSales30,
      salesGrowth30: growthRate(
        item.sales30, item.previousSales30
      ),

      sales90: item.sales90,
      previousSales90: item.previousSales90,
      salesGrowth90: growthRate(
        item.sales90, item.previousSales90
      ),

      availableStock: item.inventoryRows > 0
        ? item.availableStock
        : null,

      reservedStock: item.inventoryRows > 0
        ? item.reservedStock
        : null,

      inventoryRows: item.inventoryRows,
      dailyVelocity: velocity,
      daysOfCover,
      status,
      rank: null,
      previousRank: null,
      rankChange: null
    };
  });

  // --------------------------------------
  // MARKET-WIDE RANKING
  // --------------------------------------

  items.sort((a, b) => b.sales30 - a.sales30);

  items.forEach((item, index) => {
    item.rank = index + 1;
  });

  const previousRanked = [...items].sort(
    (a, b) => b.previousSales30 - a.previousSales30
  );

  const previousRankMap = new Map(
    previousRanked.map((item, index) => [
      item.id,
      index + 1
    ])
  );

  items.forEach(item => {
    item.previousRank = previousRankMap.get(item.id) ?? null;
    item.rankChange = item.previousRank == null
      ? null
      : item.previousRank - item.rank;
  });

  // --------------------------------------
  // MARKET SUMMARY
  // --------------------------------------

  const total = field =>
    items.reduce((sum, item) => sum + number(item[field]), 0);

  const inventoryAlertCount = items.filter(
    item => ['low', 'stockout'].includes(item.status)
  ).length;

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
      aggregation: 'ASIN',
      consolidated: true,

      catalogCount: items.length,
      listingCount: catalog.rowCount,

      zeroSalesCount: items.filter(
        item => item.sales7 === 0 && item.sales30 === 0
      ).length,

      inactiveCount: items.filter(
        item => item.isInactive
      ).length,

      historicalCount: items.filter(
        item => item.isHistorical
      ).length,

      sales7: total('sales7'),
      previousSales7: total('previousSales7'),
      salesGrowth7: growthRate(
        total('sales7'), total('previousSales7')
      ),

      sales30: total('sales30'),
      previousSales30: total('previousSales30'),
      salesGrowth30: growthRate(
        total('sales30'), total('previousSales30')
      ),

      sales90: total('sales90'),
      previousSales90: total('previousSales90'),
      salesGrowth90: growthRate(
        total('sales90'), total('previousSales90')
      ),

      dailyAverage30: total('sales30') / 30,
      availableStock: total('availableStock'),
      reservedStock: total('reservedStock'),
      inventoryAlertCount,

      rankingDefinition:
        'Internal market-wide ASIN sales ranking; not Amazon Best Sellers Rank',

      runMetrics: run.metrics
    },
    items
  };
}

// ==========================================
// GLOBAL OVERVIEW
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
        data: {
          catalogCount: 0,
          listingCount: 0,
          zeroSalesCount: 0,
          inactiveCount: 0,
          sales7: 0,
          sales30: 0,
          sales90: 0,
          availableStock: 0,
          reservedStock: 0
        }
      };
      continue;
    }

    const meta = dashboard.meta;

    markets[marketCode] = {
      available: true,
      marketCode,
      currencyCode: meta.currencyCode,
      generatedAt: meta.generatedAt,

      data: {
        catalogCount: meta.catalogCount,
        listingCount: meta.listingCount,
        zeroSalesCount: meta.zeroSalesCount,
        inactiveCount: meta.inactiveCount,

        sales7: meta.sales7,
        previousSales7: meta.previousSales7,
        salesGrowth7: meta.salesGrowth7,

        sales30: meta.sales30,
        previousSales30: meta.previousSales30,
        salesGrowth30: meta.salesGrowth30,

        sales90: meta.sales90,
        previousSales90: meta.previousSales90,
        salesGrowth90: meta.salesGrowth90,

        dailyAverage30: meta.dailyAverage30,
        availableStock: meta.availableStock,
        reservedStock: meta.reservedStock,
        inventoryAlertCount: meta.inventoryAlertCount
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
