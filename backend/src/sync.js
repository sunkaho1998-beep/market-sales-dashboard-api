import { config, assertConfig } from './config.js';
import { withLingxingClient, createLingxingGateway, extractList, extractTotal } from './mcp.js';
import { normalizeDashboard } from './normalize.js';
import { saveSnapshot, saveFailure, latestSnapshot } from './db.js';

const US_SHOPS = config.usShopIds.map(String);
const BRAND_ID = config.brandId;
const MARKET_ID = config.marketId;
const SALES_PAGE_SIZE = 500; // documented enum: 20/50/100/200/500
const LISTING_PAGE_SIZE = 200; // documented maximum
const STOCK_PAGE_SIZE = 500; // documented enum includes 500

function dateInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = type => parts.find(x => x.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function addDays(isoDate, days) { const d = new Date(`${isoDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function ranges(now = new Date()) {
  const today = dateInTimezone(now, config.timezone); const end = addDays(today, -1); const start7 = addDays(end, -6); const start30 = addDays(end, -29);
  return { end, seven: { start: start7, end, previousStart: addDays(start7, -7), previousEnd: addDays(start7, -1) }, thirty: { start: start30, end, previousStart: addDays(start30, -30), previousEnd: addDays(start30, -1) } };
}

async function fetchAllPages(fetchPage, pageSize, label) {
  const rows = []; let offset = 0; let expectedTotal = Infinity; let pageCount = 0;
  while (offset < expectedTotal) {
    const result = await fetchPage(offset, pageSize);
    const page = extractList(result);
    const total = extractTotal(result);
    if (total > 0) expectedTotal = total;
    rows.push(...page); pageCount += 1;
    if (!page.length || page.length < pageSize) break;
    offset += page.length;
    if (pageCount > 1000) throw new Error(`${label}: pagination safety limit exceeded`);
  }
  return { rows, reportedTotal: Number.isFinite(expectedTotal) ? expectedTotal : rows.length, pages: pageCount };
}

export async function runSync() {
  assertConfig();
  try {
    const payload = await withLingxingClient(async client => {
      const gateway = await createLingxingGateway(client);
      const call = (toolId, params) => gateway.execute(toolId, params);
      const shopResult = await call('get_my_sids', {});
      const shops = extractList(shopResult);
      const allowed = new Set(US_SHOPS);
      const liveUsShops = shops.filter(shop => String(shop.country_code || '').toUpperCase() === 'US' && allowed.has(String(shop.id ?? shop.sid)));
      const verifiedIds = liveUsShops.map(shop => String(shop.id ?? shop.sid));
      if (verifiedIds.length !== US_SHOPS.length) throw new Error(`US shop verification failed. Expected ${US_SHOPS.join(',')}; verified ${verifiedIds.join(',') || 'none'}.`);

      const dateRanges = ranges();
      const querySalesPage = (sid, range, offset, length) => call('statistics_sales_analysis_list', {
        asin_type: 'seller_sku', date_type: '5', start_date: range.start, end_date: range.end,
        sids: sid, mids: MARKET_ID, bid: BRAND_ID, stat_field: 'volume', sort_field: 'volume', sort_type: 'desc',
        sort_date: 'date1', currency_code: 'USD', delivery_methods: [], developers: [], turn_on_summary: '0',
        compare_this_time_yesterday: 0, search_field: 'seller_sku', search_value: [], parent_asin: '', offset, length
      });
      const sales7Rows = []; const sales30Rows = []; const salesPageStats = [];
      // Fetch every sales page per shop, not only Top 50; otherwise products outside Top 50 are falsely treated as zero-sales.
      for (const sid of verifiedIds) {
        const seven = await fetchAllPages((offset, length) => querySalesPage(sid, dateRanges.seven, offset, length), SALES_PAGE_SIZE, `7-day sales SID ${sid}`);
        const thirty = await fetchAllPages((offset, length) => querySalesPage(sid, dateRanges.thirty, offset, length), SALES_PAGE_SIZE, `30-day sales SID ${sid}`);
        sales7Rows.push(...seven.rows); sales30Rows.push(...thirty.rows);
        salesPageStats.push({ sid, sales7Total: seven.reportedTotal, sales7Pages: seven.pages, sales30Total: thirty.reportedTotal, sales30Pages: thirty.pages });
      }

      // Full Keychron catalog: paginate all listing statuses. Do not pass status=1; stopped listings are part of the requested catalog.
      const listingFetch = await fetchAllPages((offset, length) => call('erp_listing', {
        offset, length, pvi_ids: '', sids: verifiedIds.join(','), mids: MARKET_ID, bid: BRAND_ID,
        sort_field: 'msku', sort_type: 'asc'
      }), LISTING_PAGE_SIZE, 'Full Listing catalog');
      const scopedListings = listingFetch.rows.filter(row => verifiedIds.includes(String(row.sid ?? row.store_id ?? '')));
      if (!scopedListings.length) throw new Error('Full Listing query returned zero scoped rows; previous successful snapshot retained.');

      const stockFetch = await fetchAllPages((offset, length) => call('get_fba_stock_list', {
        sid: verifiedIds.join(','), search_field: 'sku', fulfillment_channel_type: 'FBA',
        is_hide_zero_stock: '0', is_parant_asin_merge: '0', offset, length
      }), STOCK_PAGE_SIZE, 'FBA inventory');
      const scopedStocks = stockFetch.rows.filter(row => verifiedIds.includes(String(row.sid ?? '')));

      const generatedAt = new Date().toISOString();
      const normalized = normalizeDashboard({ sales7Rows, sales30Rows, listingRows: scopedListings, stockRows: scopedStocks, generatedAt,
        period: { days7: dateRanges.seven, days30: dateRanges.thirty } });
      normalized.meta.shopNames = liveUsShops.map(s => ({ sid: String(s.id ?? s.sid), name: s.name }));
      normalized.meta.sourceRows = { sales7: sales7Rows.length, sales30: sales30Rows.length, listingRows: scopedListings.length,
        listingReportedTotal: listingFetch.reportedTotal, listingPages: listingFetch.pages,
        inventoryRows: scopedStocks.length, inventoryReportedTotal: stockFetch.reportedTotal, inventoryPages: stockFetch.pages };
      normalized.meta.catalogScope = 'All Keychron US listings across configured US shops, including inactive listings and zero-sales SKUs';
      normalized.meta.salesCoverage = 'All pages returned by statistics_sales_analysis_list for each configured shop and period';
      return normalized;
    });
    if (!payload.items.length) throw new Error('Normalization returned zero products. Previous successful snapshot is retained.');
    const previous = latestSnapshot()?.payload;
    if (previous?.items?.length) {
      const previousRanks = new Map(previous.items.map(item => [item.id, item.rank]));
      for (const item of payload.items) { if (item.previousRank == null) item.previousRank = previousRanks.get(item.id) ?? null; item.rankChange = item.previousRank == null || item.sales30 === 0 ? null : item.previousRank - item.rank; }
    }
    saveSnapshot(payload);
    console.log(`Full catalog sync successful: ${payload.items.length} products; source rows ${JSON.stringify(payload.meta.sourceRows)}; ${payload.meta.generatedAt}`);
    return payload;
  } catch (error) { saveFailure(error.message || error); console.error('LingXing full catalog sync failed:', error); throw error; }
}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) runSync().then(() => process.exit(0)).catch(() => process.exit(1));
