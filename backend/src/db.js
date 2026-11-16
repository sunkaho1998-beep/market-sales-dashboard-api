
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
// Existing tables and historical data preserved
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
// HELPERS
// ==========================================

const clean = value => String(value ?? '').trim();

const normalizeAsin = value =>
  clean(value).toUpperCase();

const normalizeSku = value =>
  clean(value).toUpperCase().replace(/[\s-]+/g, '');

const validTitle = value => {
  const title = clean(value);
  if (!title || title === '/' || title === '-') return null;
  return title;
};

const numeric = value => {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};

const growthRate = (current, previous) => {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
};

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
    `SELECT 1
     FROM partner_sessions
     WHERE token_hash = $1
       AND expires_at > now()`,
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
// Keep original shop-level records.
// No destructive replacement of historical runs.
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
    throw new Error(
      `Sync run not found or market mismatch: ${runId}`
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // CATALOG
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
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()
          )
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

    // SALES
    for (const [sid, period, rows] of salesByShop) {
      for (const item of rows) {
        const units = numeric(
          String(item?.date1?.volume ?? 0).replaceAll(',', '')
        );

        const previous = numeric(
          String(
            item?._previous_units ?? item?.date2?.volume ?? 0
          ).replaceAll(',', '')
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

    // INVENTORY
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
          numeric(item.afn_fulfillable_quantity),
          numeric(item.afn_reserved_quantity),
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
// CONSOLIDATED MARKET DASHBOARD
// US = all four stores combined
// AU = independent Australian market
// Product identity = ASIN
// ==========================================

export async function getDashboard(marketCode = 'US') {
  if (!['US', 'AU'].includes(marketCode)) {
    throw new Error(`Unsupported market: ${marketCode}`);
  }

  const run = await latestRun(marketCode);
  if (!run) return null;

  // ------------------------------------------
  // 1. CATALOG
  // ------------------------------------------

  const catalogResult = await pool.query(`
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

  const catalogRows = catalogResult.rows;

  const products = new Map();
  const skuToAsin = new Map();
  const localSkuToAsin = new Map();
  const shopListingCounts = new Map();

  for (const row of catalogRows) {
    const asin = normalizeAsin(row.asin);
    const shopId = String(row.shop_id);

    if (!asin) continue;

    shopListingCounts.set(
      shopId,
      (shopListingCounts.get(shopId) || 0) + 1
    );

    const key = `ASIN:${asin}`;

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

        sku: row.msku || null,
        localSku: row.local_sku || null,

        sellerSkus: [],
        localSkus: [],
        shopIds: [],

        listingCount: 0,
        listingStatuses: [],

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

    if (row.msku && !item.sellerSkus.includes(row.msku)) {
      item.sellerSkus.push(row.msku);
    }

    if (
      row.local_sku &&
      !item.localSkus.includes(row.local_sku)
    ) {
      item.localSkus.push(row.local_sku);
    }

    if (!item.sku && row.msku) item.sku = row.msku;
    if (!item.localSku && row.local_sku) {
      item.localSku = row.local_sku;
    }

    if (!item.shopIds.includes(shopId)) {
      item.shopIds.push(shopId);
    }

    if (row.listing_status) {
      item.listingStatuses.push(row.listing_status);
    }

    if (row.msku) {
      skuToAsin.set(
        `${shopId}|${normalizeSku(row.msku)}`,
        asin
      );
    }

    if (row.local_sku) {
      localSkuToAsin.set(
        `${shopId}|${normalizeSku(row.local_sku)}`,
        asin
      );
    }
  }

  // ------------------------------------------
  // 2. SALES
  // ------------------------------------------

  const salesResult = await pool.query(`
    SELECT
      shop_id,
      period_days,
      seller_sku,
      asin,
      units,
      previous_units
    FROM sales_snapshots
    WHERE market_code = $1
      AND run_id = $2
      AND period_days IN (7, 30, 90)
  `, [marketCode, run.id]);

  for (const row of salesResult.rows) {
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
    const units = numeric(row.units);
    const previous = numeric(row.previous_units);

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

    if (
      sellerSku &&
      !item.sellerSkus.includes(sellerSku)
    ) {
      item.sellerSkus.push(sellerSku);
    }

    if (!item.shopIds.includes(shopId)) {
      item.shopIds.push(shopId);
    }
  }

  // ------------------------------------------
  // 3. INVENTORY
  // ------------------------------------------

  const inventoryResult = await pool.query(`
    SELECT
      shop_id,
      asin,
      local_sku,
      seller_sku,
      available,
      reserved
    FROM inventory_snapshots
    WHERE market_code = $1
      AND run_id = $2
  `, [marketCode, run.id]);

  for (const row of inventoryResult.rows) {
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

    item.availableStock += numeric(row.available);
    item.reservedStock += numeric(row.reserved);
    item.inventoryRows += 1;
  }

  // ------------------------------------------
  // 4. PRODUCT METRICS
  // ------------------------------------------

  const items = [...products.values()].map(item => {
    const velocity = item.sales30 / 30;

    const daysOfCover =
      velocity > 0
        ? item.availableStock / velocity
        : null;

    const statuses = item.listingStatuses.map(
      value => clean(value).toLowerCase()
    );

    const isInactive =
      statuses.length > 0 &&
      statuses.every(status =>
        ['inactive', '停售', '已停售', 'deleted', '0'].includes(status)
      );

    let status = 'unknown';

    if (item.inventoryRows > 0) {
      if (item.availableStock === 0) {
        status = 'stockout';
      } else if (item.sales30 === 0) {
        status = 'no_sales';
      } else if (
        daysOfCover !== null &&
        daysOfCover < config.lowStockDays
      ) {
        status = 'low';
      } else {
        status = 'healthy';
      }
    }

    return {
      ...item,

      shopIds: [...new Set(item.shopIds)].sort(),
      sellerSkus: [...new Set(item.sellerSkus)],
      localSkus: [...new Set(item.localSkus)],

      shopCount: new Set(item.shopIds).size,

      salesGrowth7: growthRate(
        item.sales7,
        item.previousSales7
      ),

      salesGrowth30: growthRate(
        item.sales30,
        item.previousSales30
      ),

      salesGrowth90: growthRate(
        item.sales90,
        item.previousSales90
      ),

      dailyVelocity: velocity,
      daysOfCover,

      availableStock:
        item.inventoryRows > 0
          ? item.availableStock
          : null,

      reservedStock:
        item.inventoryRows > 0
          ? item.reservedStock
          : null,

      status,
      isInactive
    };
  });

  // ------------------------------------------
  // 5. MARKET RANKING
  // ------------------------------------------

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
    item.rankChange =
      item.previousRank == null
        ? null
        : item.previousRank - item.rank;
  });

  // ------------------------------------------
  // 6. MARKET TOTALS
  // ------------------------------------------

  const total = field =>
    items.reduce(
      (sum, item) => sum + numeric(item[field]),
      0
    );

  const shopCounts = [...shopListingCounts.entries()]
    .map(([shop_id, count]) => ({
      shop_id,
      count
    }))
    .sort((a, b) => a.shop_id.localeCompare(b.shop_id));

  const totalListings = catalogRows.length;

  return {
    meta: {
      source: 'LingXing MCP',

      marketplace:
        marketCode === 'US'
          ? 'Amazon US'
          : 'Amazon Australia',

      marketCode,
      currencyCode: run.currency_code,
      generatedAt: run.finished_at,
      isMock: false,

      aggregation: 'ASIN',
      consolidated: true,

      catalogCount: items.length,
      listingCount: totalListings,

      zeroSalesCount: items.filter(
        item => item.sales7 === 0 && item.sales30 === 0
      ).length,

      inactiveCount: items.filter(
        item => item.isInactive
      ).length,

      sales7: total('sales7'),
      previousSales7: total('previousSales7'),
      salesGrowth7: growthRate(
        total('sales7'),
        total('previousSales7')
      ),

      sales30: total('sales30'),
      previousSales30: total('previousSales30'),
      salesGrowth30: growthRate(
        total('sales30'),
        total('previousSales30')
      ),

      sales90: total('sales90'),
      previousSales90: total('previousSales90'),
      salesGrowth90: growthRate(
        total('sales90'),
        total('previousSales90')
      ),

      dailyAverage30: total('sales30') / 30,

      availableStock: total('availableStock'),
      reservedStock: total('reservedStock'),

      inventoryAlertCount: items.filter(
        item => ['low', 'stockout'].includes(item.status)
      ).length,

      shopCounts,
      runMetrics: run.metrics
    },

    items
  };
}

// ==========================================
// GLOBAL OVERVIEW
// US and AU remain separate.
// Currency values are never combined.
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

    markets[marketCode] = {
      available: true,
      marketCode,
      currencyCode: dashboard.meta.currencyCode,
      generatedAt: dashboard.meta.generatedAt,

      data: {
        catalogCount: dashboard.meta.catalogCount,
        listingCount: dashboard.meta.listingCount,
        zeroSalesCount: dashboard.meta.zeroSalesCount,
        inactiveCount: dashboard.meta.inactiveCount,

        sales7: dashboard.meta.sales7,
        sales30: dashboard.meta.sales30,
        sales90: dashboard.meta.sales90,

        previousSales7: dashboard.meta.previousSales7,
        previousSales30: dashboard.meta.previousSales30,
        previousSales90: dashboard.meta.previousSales90,

        salesGrowth7: dashboard.meta.salesGrowth7,
        salesGrowth30: dashboard.meta.salesGrowth30,
        salesGrowth90: dashboard.meta.salesGrowth90,

        dailyAverage30: dashboard.meta.dailyAverage30,

        availableStock: dashboard.meta.availableStock,
        reservedStock: dashboard.meta.reservedStock,

        inventoryAlertCount: dashboard.meta.inventoryAlertCount
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
