import { config, assertConfig } from './config.js';
import { withLingxingClient, createLingxingGateway, extractList, extractTotal } from './mcp.js';
import { normalizeDashboard } from './normalize.js';
import { saveSnapshot, saveFailure, latestSnapshot } from './db.js';

const US_SHOPS = config.usShopIds.map(String);
const BRAND_ID = config.brandId;
const MARKET_ID = config.marketId;
const TOP_N_PER_SHOP = config.topNPerShop;

function dateInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const part = type => parts.find(x => x.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function ranges(now = new Date()) {
  const today = dateInTimezone(now, config.timezone);
  const end = addDays(today, -1); // exclude the current, incomplete US business day
  const start7 = addDays(end, -6);
  const start30 = addDays(end, -29);
  return {
    end,
    seven: { start: start7, end, previousStart: addDays(start7, -7), previousEnd: addDays(start7, -1) },
    thirty: { start: start30, end, previousStart: addDays(start30, -30), previousEnd: addDays(start30, -1) }
  };
}

export async function runSync() {
  assertConfig();
  try {
    const payload = await withLingxingClient(async client => {
      const gateway = await createLingxingGateway(client);
      const call = (toolId, params) => gateway.execute(toolId, params);

      // Validate the configured shop allowlist against the live account's read-only shop list.
      const shopResult = await call('get_my_sids', {});
      const shops = extractList(shopResult);
      const allowed = new Set(US_SHOPS);
      const liveUsShops = shops.filter(shop =>
        String(shop.country_code || '').toUpperCase() === 'US' && allowed.has(String(shop.id ?? shop.sid))
      );
      const verifiedIds = liveUsShops.map(shop => String(shop.id ?? shop.sid));
      if (verifiedIds.length !== US_SHOPS.length) {
        throw new Error(`US shop verification failed. Expected ${US_SHOPS.join(',')}; verified ${verifiedIds.join(',') || 'none'}.`);
      }

      const dateRanges = ranges();
      const sales7Rows = [];
      const sales30Rows = [];
      const querySales = async (sid, range) => {
        const args = {
          asin_type: 'seller_sku', date_type: '5',
          start_date: range.start, end_date: range.end,
          sids: sid, mids: MARKET_ID, bid: BRAND_ID,
          stat_field: 'volume', sort_field: 'volume', sort_type: 'desc',
          sort_date: 'date1', currency_code: 'USD',
          delivery_methods: [], developers: [], turn_on_summary: '0',
          compare_this_time_yesterday: 0, search_field: 'seller_sku', search_value: [],
          parent_asin: '', offset: 0, length: TOP_N_PER_SHOP
        };
        const result = await call('statistics_sales_analysis_list', args);
        return extractList(result);
      };

      // Take Top N independently per shop so the largest seller cannot hide smaller shops.
      for (const sid of verifiedIds) {
        sales7Rows.push(...await querySales(sid, dateRanges.seven));
        sales30Rows.push(...await querySales(sid, dateRanges.thirty));
      }
      if (!sales30Rows.length) throw new Error('Sales query returned zero rows; partner dashboard remains on its previous snapshot.');

      const uniqueMskus = [...new Set([...sales7Rows, ...sales30Rows]
        .flatMap(row => Array.isArray(row.seller_sku) ? row.seller_sku : [row.seller_sku])
        .map(value => String(value ?? '').trim()).filter(Boolean))];
      const listingRows = [];
      // Listing search is multi-SID (never a single 7178 request) and then client-side scoped.
      for (let i = 0; i < uniqueMskus.length; i += 100) {
        const result = await call('erp_listing', {
          offset: 0, length: 200, pvi_ids: '', sids: verifiedIds.join(','),
          mids: MARKET_ID, bid: BRAND_ID,
          search_field: 'msku', search_value: uniqueMskus.slice(i, i + 100), exact_search: '1',
          status: '1'
        });
        listingRows.push(...extractList(result));
      }
      const scopedListings = listingRows.filter(row => verifiedIds.includes(String(row.sid ?? row.store_id ?? '')));

      // Inventory is paginated at the documented 500-row size; zero-stock rows are required for alerts.
      const stockRows = [];
      let offset = 0;
      let total = Infinity;
      while (offset < total) {
        const result = await call('get_fba_stock_list', {
          sid: verifiedIds.join(','), search_field: 'sku',
          fulfillment_channel_type: 'FBA', status: '1',
          is_hide_zero_stock: '0', is_parant_asin_merge: '0',
          offset, length: 500
        });
        const page = extractList(result);
        stockRows.push(...page);
        const reportedTotal = extractTotal(result);
        total = reportedTotal || (page.length < 500 ? offset + page.length : offset + 100000);
        offset += page.length;
        if (!page.length) break;
      }
      const scopedStocks = stockRows.filter(row => verifiedIds.includes(String(row.sid ?? '')));

      const generatedAt = new Date().toISOString();
      const normalized = normalizeDashboard({
        sales7Rows, sales30Rows, listingRows: scopedListings,
        stockRows: scopedStocks, generatedAt,
        period: { days7: dateRanges.seven, days30: dateRanges.thirty }
      });
      normalized.meta.shopNames = liveUsShops.map(s => ({ sid: String(s.id ?? s.sid), name: s.name }));
      normalized.meta.sourceRows = {
        sales7: sales7Rows.length, sales30: sales30Rows.length,
        listingMatches: scopedListings.length, inventoryRows: scopedStocks.length
      };
      return normalized;
    });

    if (!payload.items.length) throw new Error('Normalization returned zero products. Previous successful snapshot is retained.');
    const previous = latestSnapshot()?.payload;
    if (previous?.items?.length) {
      const previousRanks = new Map(previous.items.map(item => [item.id, item.rank]));
      for (const item of payload.items) {
        if (item.previousRank == null) item.previousRank = previousRanks.get(item.id) ?? null;
        item.rankChange = item.previousRank == null ? null : item.previousRank - item.rank;
      }
    }
    saveSnapshot(payload);
    console.log(`Daily sync successful: ${payload.items.length} products; ${payload.meta.generatedAt}`);
    return payload;
  } catch (error) {
    saveFailure(error.message || error);
    console.error('LingXing daily sync failed:', error);
    throw error;
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  runSync().then(() => process.exit(0)).catch(() => process.exit(1));
}
