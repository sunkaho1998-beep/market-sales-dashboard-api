import crypto from 'node:crypto';
import { config, assertConfig } from './config.js';
import { executeBusinessTool, listOf, totalOf } from './mcp.js';
import { pool, saveRunStart, finishRun, replaceRunData } from './db.js';

const n = value => Number(String(value ?? 0).replaceAll(',', '')) || 0;
function dateAtTz(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function shift(day, delta) { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0, 10); }

// Every page is checked against the server-reported total. A short/empty page
// before the total is reached is treated as an incomplete sync, never success.
export async function fetchAllPages(toolId, baseParams, pageSize, label) {
  let offset = 0, expectedTotal = null, pageCount = 0;
  const rows = [];
  while (expectedTotal === null || offset < expectedTotal) {
    const response = await executeBusinessTool(toolId, { ...baseParams, offset, length: pageSize });
    const pageRows = listOf(response);
    const reportedTotal = totalOf(response);
    if (reportedTotal > 0) {
      if (expectedTotal !== null && expectedTotal !== reportedTotal) {
        throw new Error(`${label}: total changed during pagination (${expectedTotal} -> ${reportedTotal}); rerun required`);
      }
      expectedTotal = reportedTotal;
    }
    pageCount += 1;
    rows.push(...pageRows);
    if (pageCount > 1000) throw new Error(`${label}: exceeded 1000 pages`);
    if (expectedTotal === null) {
      if (pageRows.length < pageSize) break;
    } else if (rows.length < expectedTotal && pageRows.length === 0) {
      throw new Error(`${label}: empty page at offset ${offset}; received ${rows.length}/${expectedTotal}`);
    }
    if (pageRows.length === 0 || pageRows.length < pageSize) break;
    offset += pageRows.length;
  }
  const total = expectedTotal ?? rows.length;
  if (rows.length < total) throw new Error(`${label}: incomplete pagination; received ${rows.length}/${total} rows across ${pageCount} pages`);
  return { rows, total, pages: pageCount, complete: rows.length >= total };
}

function salesParams(sid, start, end) {
  // Parameters are restricted to fields confirmed in the user's LingXing MCP report.
  return {
    asin_type: 'seller_sku', date_type: '5', start_date: start, end_date: end,
    sids: sid, mids: config.marketId, bid: config.brandId, stat_field: 'volume',
    sort_field: 'volume', sort_type: 'desc', sort_date: 'date1',
    delivery_methods: [], developers: [], turn_on_summary: '0',
    currency_code: '', search_field: 'seller_sku', search_value: [], parent_asin: ''
  };
}
function extractSellerSku(row) {
  if (Array.isArray(row.seller_sku)) return row.seller_sku[0] ?? null;
  return row.seller_sku ?? row.msku ?? null;
}
function salesRows(rows) {
  return rows.map(row => ({ ...row, seller_sku: extractSellerSku(row), date1: { ...(row.date1 || {}), volume: n(row.date1?.volume) }, date2: { ...(row.date2 || {}), volume: n(row.date2?.volume) } }));
}

export async function runFullSync() {
  assertConfig();
  const runId = crypto.randomUUID();
  await saveRunStart(runId);
  const metrics = { scope: 'four-us-stores', brandId: config.brandId, marketId: config.marketId, shops: {}, startedAt: new Date().toISOString(), complete: false };
  try {
    const shopResponse = await executeBusinessTool('get_my_sids', {});
    const shops = listOf(shopResponse);
    const allow = new Set(config.shopIds.map(String));
    const actual = shops.filter(shop => { const sid = String(shop.sid ?? shop.id); const isUS = shop.country_id != null ? String(shop.country_id) === '1' : String(shop.country_code || 'US').toUpperCase() === 'US'; return allow.has(sid) && isUS; });
    const ids = actual.map(shop => String(shop.sid ?? shop.id));
    const missing = [...allow].filter(id => !ids.includes(id));
    if (ids.length !== 4 || missing.length) throw new Error(`Store verification incomplete. Verified: ${ids.join(',') || 'none'}; missing: ${missing.join(',') || 'none'}`);

    const today = dateAtTz();
    const lastCompleteDay = shift(today, -1);
    const windows = {
      7: { current: [shift(lastCompleteDay, -6), lastCompleteDay], previous: [shift(lastCompleteDay, -13), shift(lastCompleteDay, -7)] },
      30: { current: [shift(lastCompleteDay, -29), lastCompleteDay], previous: [shift(lastCompleteDay, -59), shift(lastCompleteDay, -30)] },
      90: { current: [shift(lastCompleteDay, -89), lastCompleteDay], previous: [shift(lastCompleteDay, -179), shift(lastCompleteDay, -90)] }
    };
    const listings = new Map(), sales = [], stocks = new Map();

    for (const sid of ids) {
      const listing = await fetchAllPages('erp_listing', {
        pvi_ids: '', sids: sid, mids: config.marketId, bid: config.brandId,
        sort_field: 'msku', sort_type: 'asc'
      }, Math.min(config.listingPageSize, 200), `Listing SID ${sid}`);
      if (!listing.rows.length) throw new Error(`Listing returned zero rows for SID ${sid}; refusing to replace catalog`);
      listings.set(sid, listing.rows);
      metrics.shops[sid] = { listingRows: listing.rows.length, listingReportedTotal: listing.total, listingPages: listing.pages, listingComplete: listing.complete };

      for (const period of [7, 30, 90]) {
        const range = windows[period];
        const current = await fetchAllPages('statistics_sales_analysis_list', salesParams(sid, ...range.current), config.salesPageSize, `Sales ${period}D current SID ${sid}`);
        const previous = await fetchAllPages('statistics_sales_analysis_list', salesParams(sid, ...range.previous), config.salesPageSize, `Sales ${period}D previous SID ${sid}`);
        const previousByKey = new Map(previous.rows.map(row => [`${extractSellerSku(row) || ''}|${row.asin || ''}`, n(row.date1?.volume)]));
        const normalized = salesRows(current.rows).map(row => ({ ...row, _previous_units: previousByKey.get(`${row.seller_sku || ''}|${row.asin || ''}`) ?? n(row.date2?.volume) }));
        sales.push([sid, period, normalized]);
        metrics.shops[sid][`sales${period}Rows`] = current.rows.length;
        metrics.shops[sid][`sales${period}Pages`] = current.pages;
        metrics.shops[sid][`sales${period}PreviousRows`] = previous.rows.length;
      }

      const stock = await fetchAllPages('get_fba_stock_list', {
        sid, search_field: 'sku', fulfillment_channel_type: 'FBA',
        is_hide_zero_stock: '0', is_parant_asin_merge: '0', is_contain_del_ls: '1'
      }, config.stockPageSize, `FBA inventory SID ${sid}`);
      stocks.set(sid, stock.rows);
      metrics.shops[sid].inventoryRows = stock.rows.length;
      metrics.shops[sid].inventoryPages = stock.pages;
      metrics.shops[sid].inventoryComplete = stock.complete;
    }

    const listingRows = [...listings.values()].reduce((sum, rows) => sum + rows.length, 0);
    if (!listingRows) throw new Error('Full catalog empty; previous successful snapshot remains available');
    metrics.listingRows = listingRows;
    metrics.uniqueShopSku = new Set([...listings.entries()].flatMap(([sid, rows]) => rows.map(row => `${sid}|${row.asin || ''}|${row.msku || ''}`))).size;
    metrics.uniqueAsins = new Set([...listings.values()].flat().map(row => row.asin).filter(Boolean)).size;
    metrics.salesRows = sales.reduce((sum, entry) => sum + entry[2].length, 0);
    metrics.inventoryRows = [...stocks.values()].reduce((sum, rows) => sum + rows.length, 0);
    metrics.zeroSalesListingCandidates = [...listings.values()].flat().filter(row => !n(row.seven_volume) && !n(row.thirty_volume)).length;
    metrics.complete = true;
    metrics.windows = Object.fromEntries(Object.entries(windows).map(([key, value]) => [key, value]));

    await replaceRunData(runId, listings, sales, stocks);
    await finishRun(runId, 'success', metrics);
    return { ok: true, runId, metrics };
  } catch (error) {
    await finishRun(runId, 'failed', metrics, error.message);
    throw error;
  }
}
