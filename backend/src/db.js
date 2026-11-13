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

// ------------------------------------------
// Database initialization and safe migrations
// ------------------------------------------

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

    -- Multi-market columns. Existing records default to US/USD.
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

    CREATE INDEX IF NOT EXISTS inv_run_idx
      ON inventory_snapshots(run_id, shop_id);

    CREATE INDEX IF NOT EXISTS inventory_market_idx
      ON inventory_snapshots(market_code, run_id);

    CREATE INDEX IF NOT EXISTS sync_market_idx
      ON sync_runs(market_code, started_at);
  `);
}

// ------------------------------------------
// Partner sessions
// ------------------------------------------

export async function createSession(hash, expires) {
  await pool.query(
    'INSERT INTO partner_sessions(token_hash,created_at,expires_at) VALUES($1,now(),$2)',
    [hash, expires]
  );
}

export async function hasSession(hash) {
  const r = await pool.query(
    'SELECT 1 FROM partner_sessions WHERE token_hash=$1 AND expires_at>now()',
    [hash]
  );
  return r.rowCount > 0;
}

export async function deleteSession(hash) {
  await pool.query(
    'DELETE FROM partner_sessions WHERE token_hash=$1',
    [hash]
  );
}

// ------------------------------------------
// Market-aware synchronization records
// ------------------------------------------

export async function latestRun(marketCode = null) {
  const r = marketCode
    ? await pool.query(
        "SELECT * FROM sync_runs WHERE status='success' AND market_code=$1 ORDER BY finished_at DESC LIMIT 1",
        [marketCode]
      )
    : await pool.query(
        "SELECT * FROM sync_runs WHERE status='success' ORDER BY finished_at DESC LIMIT 1"
      );

  return r.rows[0] || null;
}

export async function saveRunStart(
  id,
  marketCode = 'US',
  currencyCode = 'USD'
) {
  await pool.query(
    "INSERT INTO sync_runs(id,started_at,status,market_code,currency_code) VALUES($1,now(),'running',$2,$3)",
    [id, marketCode, currencyCode]
  );
}

export async function finishRun(id, status, metrics = {}, error = null) {
  await pool.query(
    'UPDATE sync_runs SET finished_at=now(),status=$2,metrics=$3::jsonb,error=$4 WHERE id=$1',
    [id, status, JSON.stringify(metrics), error]
  );
}

// ------------------------------------------
// Multi-market data persistence
// ------------------------------------------

export async function replaceRunData(
  runId,
  listingByShop,
  salesByShop,
  stockByShop,
  marketCode = 'US',
  currencyCode = 'USD'
) {
  if (!['US', 'AU'].includes(marketCode)) {
    throw new Error('Unsupported market: ' + marketCode);
  }

  if (!['USD', 'AUD'].includes(currencyCode)) {
    throw new Error('Unsupported currency: ' + currencyCode);
  }

  const c = await pool.connect();

  try {
    await c.query('BEGIN');

    for (const [sid, rows] of listingByShop) {
      for (const x of rows) {
        const identityKey = `${x.asin || ''}|${x.msku || ''}`;

        await c.query(`
          INSERT INTO catalog_items(
            shop_id,market_code,currency_code,
            identity_key,asin,msku,local_sku,
            title,image_url,category,listing_status,
            last_seen_run_id,raw,updated_at
          )
          VALUES(
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()
          )
          ON CONFLICT(shop_id,identity_key)
          DO UPDATE SET
            market_code=EXCLUDED.market_code,
            currency_code=EXCLUDED.currency_code,
            local_sku=EXCLUDED.local_sku,
            title=EXCLUDED.title,
            image_url=EXCLUDED.image_url,
            category=EXCLUDED.category,
            listing_status=EXCLUDED.listing_status,
            last_seen_run_id=EXCLUDED.last_seen_run_id,
            raw=EXCLUDED.raw,
            updated_at=now()
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

    for (const [sid, period, rows] of salesByShop) {
      for (const x of rows) {
        const units = Number(
          String(x?.date1?.volume ?? 0).replaceAll(',', '')
        ) || 0;

        const previous = Number(
          String(x?._previous_units ?? x?.date2?.volume ?? 0)
            .replaceAll(',', '')
        ) || 0;

        await c.query(`
          INSERT INTO sales_snapshots(
            run_id,shop_id,market_code,currency_code,
            period_days,seller_sku,asin,
            units,previous_units,raw
          )
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [
          runId,
          sid,
          marketCode,
          currencyCode,
          period,
          (Array.isArray(x.seller_sku)
            ? x.seller_sku[0]
            : x.seller_sku) || x.msku || null,
          x.asin || null,
          units,
          previous,
          JSON.stringify(x)
        ]);
      }
    }

    for (const [sid, rows] of stockByShop) {
      for (const x of rows) {
        await c.query(`
          INSERT INTO inventory_snapshots(
            run_id,shop_id,market_code,currency_code,
            asin,local_sku,seller_sku,
            available,reserved,raw
          )
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [
          runId,
          sid,
          marketCode,
          currencyCode,
          x.asin || null,
          x.sku || null,
          x.seller_sku || null,
          Number(x.afn_fulfillable_quantity) || 0,
          Number(x.afn_reserved_quantity) || 0,
          JSON.stringify(x)
        ]);
      }
    }

    await c.query('COMMIT');

  } catch (e) {
    await c.query('ROLLBACK');
    throw e;

  } finally {
    c.release();
  }
}

// ------------------------------------------
// Market-specific dashboard
// ------------------------------------------

export async function getDashboard(marketCode = 'US') {
  if (!['US', 'AU'].includes(marketCode)) {
    throw new Error('Unsupported market: ' + marketCode);
  }

  const run = await latestRun(marketCode);
  if (!run) return null;

  const catalog = await pool.query(`
    SELECT shop_id,market_code,currency_code,
      asin,msku,local_sku,title,image_url,category,listing_status
    FROM catalog_items
    WHERE market_code=$1 AND last_seen_run_id=$2
    ORDER BY title
  `, [marketCode, run.id]);

  const items = [];

  for (const x of catalog.rows) {
    const [s7, s30, s90, inv] = await Promise.all([
      pool.query(`
        SELECT COALESCE(sum(units),0) units,
          COALESCE(sum(previous_units),0) prev
        FROM sales_snapshots
        WHERE market_code=$1 AND run_id=$2 AND shop_id=$3
          AND period_days=7 AND (asin=$4 OR seller_sku=$5)
      `, [marketCode, run.id, x.shop_id, x.asin, x.msku]),

      pool.query(`
        SELECT COALESCE(sum(units),0) units,
          COALESCE(sum(previous_units),0) prev
        FROM sales_snapshots
        WHERE market_code=$1 AND run_id=$2 AND shop_id=$3
          AND period_days=30 AND (asin=$4 OR seller_sku=$5)
      `, [marketCode, run.id, x.shop_id, x.asin, x.msku]),

      pool.query(`
        SELECT COALESCE(sum(units),0) units,
          COALESCE(sum(previous_units),0) prev
        FROM sales_snapshots
        WHERE market_code=$1 AND run_id=$2 AND shop_id=$3
          AND period_days=90 AND (asin=$4 OR seller_sku=$5)
      `, [marketCode, run.id, x.shop_id, x.asin, x.msku]),

      pool.query(`
        SELECT count(*)::int rows,
          COALESCE(sum(available),0) available,
          COALESCE(sum(reserved),0) reserved
        FROM inventory_snapshots
        WHERE market_code=$1 AND run_id=$2 AND shop_id=$3 AND asin=$4
      `, [marketCode, run.id, x.shop_id, x.asin])
    ]);

    const available = Number(inv.rows[0].available);
    const units30 = Number(s30.rows[0].units);
    const velocity = units30 / 30;
    const previous7 = Number(s7.rows[0].prev);
    const previous30 = Number(s30.rows[0].prev);

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
      listingStatus: x.listing_status,

      sales7: Number(s7.rows[0].units),
      previousSales7: previous7,
      growth7: previous7 > 0
        ? (Number(s7.rows[0].units) - previous7) / previous7 * 100
        : null,

      sales30: units30,
      previousSales30: previous30,
      growth30: previous30 > 0
        ? (units30 - previous30) / previous30 * 100
        : null,

      sales90: Number(s90.rows[0].units),
      previousSales90: Number(s90.rows[0].prev),
      dailyAverage30: units30 / 30,

      availableStock: Number(inv.rows[0].rows) > 0 ? available : null,
      reservedStock: Number(inv.rows[0].rows) > 0
        ? Number(inv.rows[0].reserved)
        : null,

      daysOfCover: velocity > 0 ? available / velocity : null,

      status: Number(inv.rows[0].rows) === 0
        ? 'unknown'
        : available === 0
          ? 'stockout'
          : velocity > 0 && available / velocity < config.lowStockDays
            ? 'low'
            : 'healthy'
    });
  }

  const shops = await pool.query(`
    SELECT shop_id,count(*)::int AS count
    FROM catalog_items
    WHERE market_code=$1
    GROUP BY shop_id
    ORDER BY shop_id
  `, [marketCode]);

  return {
    meta: {
      source: 'LingXing MCP',
      marketCode,
      currencyCode: run.currency_code,
      generatedAt: run.finished_at,
      isMock: false,
      catalogCount: items.length,
      zeroSalesCount: items.filter(x => !x.sales7 && !x.sales30).length,
      inactiveCount: items.filter(x =>
        ['inactive', '停售', '已停售', '已删除', 'deleted']
          .some(s => String(x.listingStatus).toLowerCase().includes(s))
      ).length,
      shopCounts: shops.rows,
      runMetrics: run.metrics
    },
    items
  };
}

// ------------------------------------------
// Global overview: never combine currencies
// ------------------------------------------

export async function getGlobalOverview() {
  const markets = {};

  for (const marketCode of ['US', 'AU']) {
    const dashboard = await getDashboard(marketCode);

    markets[marketCode] = dashboard
      ? {
          available: true,
          currencyCode: dashboard.meta.currencyCode,
          generatedAt: dashboard.meta.generatedAt,
          catalogCount: dashboard.meta.catalogCount,
          zeroSalesCount: dashboard.meta.zeroSalesCount,
          inactiveCount: dashboard.meta.inactiveCount,
          shopCounts: dashboard.meta.shopCounts,
          runMetrics: dashboard.meta.runMetrics,
          sales7: dashboard.items.reduce((s, x) => s + x.sales7, 0),
          sales30: dashboard.items.reduce((s, x) => s + x.sales30, 0),
          sales90: dashboard.items.reduce((s, x) => s + x.sales90, 0)
        }
      : {
          available: false,
          currencyCode: marketCode === 'US' ? 'USD' : 'AUD',
          catalogCount: 0,
          sales7: 0,
          sales30: 0,
          sales90: 0
        };
  }

  return {
    generatedAt: new Date().toISOString(),
    markets,
    note: 'US and AU figures are reported separately. Different currencies are never added together.'
  };
}
