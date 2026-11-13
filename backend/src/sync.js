
import crypto from 'node:crypto';

import { config, assertConfig } from './config.js';

import {
  executeBusinessTool,
  listOf,
  totalOf,
  parseResult
} from './mcp.js';

import {
  saveRunStart,
  finishRun,
  replaceRunData
} from './db.js';

// ==========================================
// V4 MULTI-MARKET SYNC ENGINE
// US / USD + AU / AUD
// ==========================================

const wait = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const n = value =>
  Number(String(value ?? 0).replaceAll(',', '')) || 0;

const SALES_PAGE_SIZES = [20, 50, 100, 200, 500];

// ==========================================
// DATE HELPERS
// ==========================================

function dateAtTz(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const get = type =>
    parts.find(part => part.type === type).value;

  return `${get('year')}-${get('month')}-${get('day')}`;
}

function shift(day, delta) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function todayAtShanghai() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());
}

function buildWindows(timezone) {
  const today = dateAtTz(timezone);
  const lastCompleteDay = shift(today, -1);

  return {
    7: {
      current: [
        shift(lastCompleteDay, -6),
        lastCompleteDay
      ],
      previous: [
        shift(lastCompleteDay, -13),
        shift(lastCompleteDay, -7)
      ]
    },

    30: {
      current: [
        shift(lastCompleteDay, -29),
        lastCompleteDay
      ],
      previous: [
        shift(lastCompleteDay, -59),
        shift(lastCompleteDay, -30)
      ]
    },

    90: {
      current: [
        shift(lastCompleteDay, -89),
        lastCompleteDay
      ],
      previous: [
        shift(lastCompleteDay, -179),
        shift(lastCompleteDay, -90)
      ]
    }
  };
}

// ==========================================
// NORMALIZATION
// ==========================================

function firstValue(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function extractSellerSku(row) {
  return firstValue(row.seller_sku) || row.msku || null;
}

function extractAsin(row) {
  return firstValue(row.asin);
}

function normalizeSales(rows) {
  return rows.map(row => ({
    ...row,

    seller_sku: extractSellerSku(row),
    asin: extractAsin(row),

    date1: {
      ...(row.date1 || {}),
      volume: n(row.date1?.volume)
    },

    date2: {
      ...(row.date2 || {}),
      volume: n(row.date2?.volume)
    }
  }));
}

// ==========================================
// RESPONSE VALIDATION
// ==========================================

function getPayload(response) {
  return parseResult(response);
}

function hasSalesPayload(response) {
  const p = getPayload(response);

  return (
    Array.isArray(p?.data?.list) ||
    Array.isArray(p?.list)
  );
}

function assertSuccessfulResponse(response, label) {
  const p = getPayload(response);

  if (
    response?.isError ||
    p?.success === false ||
    Number(p?.code) === 102
  ) {
    throw new Error(
      `${label}: ${JSON.stringify(p)}`
    );
  }

  return p;
}

// ==========================================
// GENERIC PAGINATION
// ==========================================

export async function fetchAllPages(
  toolId,
  baseParams,
  pageSize,
  label
) {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error(`${label}: invalid page size ${pageSize}`);
  }

  let offset = 0;
  let expectedTotal = null;
  let pageCount = 0;

  const rows = [];

  while (
    expectedTotal === null ||
    offset < expectedTotal
  ) {
    const response = await executeBusinessTool(
      toolId,
      {
        ...baseParams,
        offset,
        length: pageSize
      }
    );

    assertSuccessfulResponse(response, label);

    const pageRows = listOf(response);
    const reportedTotal = totalOf(response);

    if (reportedTotal > 0) {
      if (
        expectedTotal !== null &&
        expectedTotal !== reportedTotal
      ) {
        throw new Error(
          `${label}: total changed during pagination ` +
          `(${expectedTotal} -> ${reportedTotal})`
        );
      }

      expectedTotal = reportedTotal;
    }

    pageCount++;

    if (pageCount > 1000) {
      throw new Error(`${label}: exceeded 1000 pages`);
    }

    rows.push(...pageRows);

    if (
      expectedTotal !== null &&
      rows.length < expectedTotal &&
      pageRows.length === 0
    ) {
      throw new Error(
        `${label}: empty page at offset ${offset}; ` +
        `received ${rows.length}/${expectedTotal}`
      );
    }

    if (pageRows.length === 0) {
      break;
    }

    if (
      expectedTotal === null &&
      pageRows.length < pageSize
    ) {
      break;
    }

    offset += pageRows.length;
  }

  const total = expectedTotal ?? rows.length;

  if (rows.length < total) {
    throw new Error(
      `${label}: incomplete pagination; ` +
      `received ${rows.length}/${total}`
    );
  }

  return {
    rows,
    total,
    pages: pageCount,
    complete: rows.length >= total
  };
}

// ==========================================
// MARKET STORE VERIFICATION
// ==========================================

async function verifyMarketStores(market) {
  const response = await executeBusinessTool(
    'customer_review_country_sellers',
    {}
  );

  const p = assertSuccessfulResponse(
    response,
    `${market.code} store verification`
  );

  const sellers = p?.data?.sellers;

  if (!Array.isArray(sellers)) {
    throw new Error(
      `${market.code}: cannot read data.sellers`
    );
  }

  const allowed = new Set(
    market.shopIds.map(String)
  );

  const actual = sellers.filter(shop => {
    const sid = String(shop.sid);
    const countryId = String(shop.country_id);

    return (
      allowed.has(sid) &&
      countryId === String(market.marketId)
    );
  });

  const ids = actual.map(
    shop => String(shop.sid)
  );

  const missing = [...allowed].filter(
    id => !ids.includes(id)
  );

  if (
    ids.length !== allowed.size ||
    missing.length > 0
  ) {
    throw new Error(
      `${market.code} store verification incomplete. ` +
      `Verified: ${ids.join(',') || 'none'}. ` +
      `Missing: ${missing.join(',') || 'none'}`
    );
  }

  console.log(
    `[V4] ${market.code} verified stores: ${ids.join(', ')}`
  );

  return ids;
}

// ==========================================
// SALES API PARAMETERS
// ==========================================

function getSalesPageSize() {
  const requested = Number(config.salesPageSize);

  return SALES_PAGE_SIZES.includes(requested)
    ? requested
    : 200;
}

function salesParams(market, sid, start, end) {
  return {
    asin_type: 'seller_sku',

    date_type: '5',
    start_date: start,
    end_date: end,

    today_date: todayAtShanghai(),

    sids: String(sid),
    mids: String(market.marketId),
    bid: String(config.brandId),

    stat_field: 'volume',
    sort_field: 'volume',
    sort_type: 'desc',
    sort_date: 'date1',

    delivery_methods: [],
    developers: [],
    principal_uids: '',

    turn_on_summary: '0',
    compare_this_time_yesterday: 0,

    currency_code: '',
    search_field: 'seller_sku',
    search_value: [],

    parent_asin: '',
    gtag_ids: '',
    cid: ''
  };
}

// ==========================================
// SALES PAGE
// One action per page.
// No repeated creation of the same request.
// ==========================================

async function fetchSalesPage(params, label) {
  const response = await executeBusinessTool(
    'statistics_sales_analysis_list',
    params
  );

  const p = assertSuccessfulResponse(
    response,
    label
  );

  if (hasSalesPayload(response)) {
    return response;
  }

  const requireId =
    p?.data?.require_id ||
    p?.require_id ||
    'not provided';

  throw new Error(
    `${label}: sales list not returned. ` +
    `require_id=${requireId}. ` +
    `Response=${JSON.stringify(p)}`
  );
}

// ==========================================
// SALES PAGINATION
// ==========================================

async function fetchAllSalesPages(
  market,
  sid,
  start,
  end,
  pageSize,
  label
) {
  if (!SALES_PAGE_SIZES.includes(pageSize)) {
    throw new Error(
      `${label}: unsupported sales page size ${pageSize}`
    );
  }

  let offset = 0;
  let expectedTotal = null;
  let pageCount = 0;

  const rows = [];

  while (
    expectedTotal === null ||
    offset < expectedTotal
  ) {
    const params = salesParams(
      market,
      sid,
      start,
      end
    );

    params.offset = offset;
    params.length = pageSize;

    const response = await fetchSalesPage(
      params,
      `${label} offset ${offset}`
    );

    const pageRows = listOf(response);
    const reportedTotal = totalOf(response);

    if (reportedTotal > 0) {
      if (
        expectedTotal !== null &&
        expectedTotal !== reportedTotal
      ) {
        throw new Error(
          `${label}: sales total changed during pagination`
        );
      }

      expectedTotal = reportedTotal;
    }

    pageCount++;

    if (pageCount > 1000) {
      throw new Error(`${label}: exceeded 1000 pages`);
    }

    rows.push(...pageRows);

    if (
      expectedTotal !== null &&
      rows.length < expectedTotal &&
      pageRows.length === 0
    ) {
      throw new Error(
        `${label}: incomplete sales pagination`
      );
    }

    if (pageRows.length === 0) {
      break;
    }

    if (
      expectedTotal === null &&
      pageRows.length < pageSize
    ) {
      break;
    }

    offset += pageRows.length;
  }

  const total = expectedTotal ?? rows.length;

  if (rows.length < total) {
    throw new Error(
      `${label}: received ${rows.length}/${total} sales rows`
    );
  }

  return {
    rows,
    total,
    pages: pageCount,
    complete: rows.length >= total
  };
}

// ==========================================
// INVENTORY PAGINATION
// ==========================================

function getStockPageSize() {
  const allowed = [20, 50, 100, 200, 500, 1000];

  const requested = Number(config.stockPageSize);

  return allowed.includes(requested)
    ? requested
    : 200;
}

// ==========================================
// PREVIOUS PERIOD MATCHING
// ==========================================

function salesKey(row) {
  return [
    extractSellerSku(row) || '',
    extractAsin(row) || ''
  ].join('|');
}

function normalizeCurrentSales(currentRows, previousRows) {
  const previousByKey = new Map();

  for (const row of previousRows) {
    const key = salesKey(row);

    previousByKey.set(
      key,
      n(row.date1?.volume)
    );
  }

  return normalizeSales(currentRows).map(row => {
    const key = salesKey(row);

    return {
      ...row,

      _previous_units:
        previousByKey.get(key) ??
        n(row.date2?.volume)
    };
  });
}

// ==========================================
// RUN ONE MARKET
// ==========================================

async function runMarketSync(market) {
  const runId = crypto.randomUUID();

  const metrics = {
    scope: `market-${market.code}`,

    marketCode: market.code,
    currencyCode: market.currency,
    marketId: market.marketId,
    timezone: market.timezone,

    brandId: config.brandId,

    shops: {},

    startedAt: new Date().toISOString(),

    complete: false
  };

  let runStarted = false;

  try {
    console.log(
      `[V4] Starting ${market.code} synchronization`
    );

    // --------------------------------------
    // START RUN
    // --------------------------------------

    await saveRunStart(
      runId,
      market.code,
      market.currency
    );

    runStarted = true;

    // --------------------------------------
    // VERIFY SHOPS
    // --------------------------------------

    const ids = await verifyMarketStores(market);

    const windows = buildWindows(
      market.timezone
    );

    const salesPageSize = getSalesPageSize();

    // --------------------------------------
    // DATA COLLECTION
    // --------------------------------------

    const listings = new Map();
    const sales = [];
    const stocks = new Map();

    for (const sid of ids) {
      console.log(
        `[V4] ${market.code}: processing SID ${sid}`
      );

      // ------------------------------------
      // LISTING
      // ------------------------------------

      const listing = await fetchAllPages(
        'erp_listing',
        {
          pvi_ids: '',
          sids: String(sid),
          search_field: 'msku',
          exact_search: '0'
        },
        Math.min(config.listingPageSize, 200),
        `Listing ${market.code} SID ${sid}`
      );

      if (!listing.rows.length) {
        throw new Error(
          `Listing returned zero rows for ${market.code} SID ${sid}`
        );
      }

      listings.set(sid, listing.rows);

      metrics.shops[sid] = {
        listingRows: listing.rows.length,
        listingReportedTotal: listing.total,
        listingPages: listing.pages,
        listingComplete: listing.complete
      };

      // ------------------------------------
      // SALES 7 / 30 / 90 DAYS
      // ------------------------------------

      for (const period of [7, 30, 90]) {
        const range = windows[period];

        console.log(
          `[V4] ${market.code} SID ${sid}: sales ${period}D`
        );

        const current = await fetchAllSalesPages(
          market,
          sid,
          ...range.current,
          salesPageSize,
          `Sales ${market.code} ${period}D current SID ${sid}`
        );

        const previous = await fetchAllSalesPages(
          market,
          sid,
          ...range.previous,
          salesPageSize,
          `Sales ${market.code} ${period}D previous SID ${sid}`
        );

        const normalized = normalizeCurrentSales(
          current.rows,
          previous.rows
        );

        sales.push([
          sid,
          period,
          normalized
        ]);

        metrics.shops[sid][`sales${period}Rows`] =
          current.rows.length;

        metrics.shops[sid][`sales${period}Total`] =
          current.total;

        metrics.shops[sid][`sales${period}Pages`] =
          current.pages;

        metrics.shops[sid][`sales${period}PreviousRows`] =
          previous.rows.length;

        metrics.shops[sid][`sales${period}Complete`] =
          current.complete && previous.complete;
      }

      // ------------------------------------
      // FBA INVENTORY
      // ------------------------------------

      const stock = await fetchAllPages(
        'get_fba_stock_list',
        {
          sid: String(sid),
          search_field: 'sku',
          fulfillment_channel_type: 'FBA',
          is_hide_zero_stock: '0',
          is_parant_asin_merge: '0',
          is_contain_del_ls: '1'
        },
        getStockPageSize(),
        `Inventory ${market.code} SID ${sid}`
      );

      stocks.set(sid, stock.rows);

      metrics.shops[sid].inventoryRows =
        stock.rows.length;

      metrics.shops[sid].inventoryReportedTotal =
        stock.total;

      metrics.shops[sid].inventoryPages =
        stock.pages;

      metrics.shops[sid].inventoryComplete =
        stock.complete;
    }

    // --------------------------------------
    // VALIDATE MARKET DATA
    // --------------------------------------

    const listingRows = [...listings.values()]
      .reduce(
        (sum, rows) => sum + rows.length,
        0
      );

    if (!listingRows) {
      throw new Error(
        `${market.code}: catalog empty; refusing to save`
      );
    }

    const uniqueShopSku = new Set(
      [...listings.entries()].flatMap(([sid, rows]) =>
        rows.map(row =>
          `${sid}|${row.asin || ''}|${row.msku || ''}`
        )
      )
    );

    const uniqueAsins = new Set(
      [...listings.values()]
        .flat()
        .map(row => firstValue(row.asin))
        .filter(Boolean)
    );

    const salesRows = sales.reduce(
      (sum, entry) => sum + entry[2].length,
      0
    );

    const inventoryRows = [...stocks.values()]
      .reduce(
        (sum, rows) => sum + rows.length,
        0
      );

    metrics.listingRows = listingRows;
    metrics.uniqueShopSku = uniqueShopSku.size;
    metrics.uniqueAsins = uniqueAsins.size;
    metrics.salesRows = salesRows;
    metrics.inventoryRows = inventoryRows;

    metrics.zeroSalesListingCandidates = [
      ...listings.values()
    ].flat().filter(row =>
      !n(row.seven_volume) &&
      !n(row.thirty_volume)
    ).length;

    metrics.complete = true;
    metrics.windows = windows;

    // --------------------------------------
    // SAVE MARKET SNAPSHOT
    // --------------------------------------

    await replaceRunData(
      runId,
      listings,
      sales,
      stocks,
      market.code,
      market.currency
    );

    await finishRun(
      runId,
      'success',
      metrics
    );

    console.log(
      `[V4] ${market.code} synchronization completed`
    );

    return {
      ok: true,
      runId,
      marketCode: market.code,
      currencyCode: market.currency,
      metrics
    };

  } catch (error) {
    metrics.complete = false;

    console.error(
      `[V4] ${market.code} synchronization failed:`,
      error.message
    );

    if (runStarted) {
      try {
        await finishRun(
          runId,
          'failed',
          metrics,
          error.message
        );

      } catch (dbError) {
        console.error(
          `[V4] ${market.code} failed to record error status:`,
          dbError.message
        );
      }
    }

    return {
      ok: false,
      runId,
      marketCode: market.code,
      currencyCode: market.currency,
      error: error.message,
      metrics
    };
  }
}

// ==========================================
// FULL MULTI-MARKET SYNC
// ==========================================

export async function runFullSync(marketCode = null) {
  assertConfig();

  const selectedMarkets = marketCode
    ? [config.markets[marketCode]]
    : Object.values(config.markets);

  if (
    selectedMarkets.length === 0 ||
    selectedMarkets.some(market => !market)
  ) {
    throw new Error(
      `Unknown market: ${marketCode}`
    );
  }

  const results = [];

  // Run markets sequentially.
  // A failure in one market does not stop the next market.

  for (const market of selectedMarkets) {
    const result = await runMarketSync(market);
    results.push(result);
  }

  const successful = results.filter(
    result => result.ok
  ).length;

  const failed = results.length - successful;

  return {
    ok: failed === 0,

    partialSuccess:
      successful > 0 && failed > 0,

    markets: results,

    summary: {
      total: results.length,
      successful,
      failed
    }
  };
}
