const number = value => {
  const parsed = Number(String(value ?? '0').replaceAll(',', '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};
const clean = value => String(value ?? '').trim();
const normSku = value => clean(value).toUpperCase().replace(/[\s-]+/g, '');
const isGhost = value => clean(value).toLowerCase().startsWith('amzn.gr.');

export function parseVolume(row, dateKey) {
  return number(row?.[dateKey]?.volume);
}

export function shopIdOf(row, fallback = '') {
  return clean(row?.sid ?? row?.store_id ?? row?.shop_id ?? fallback);
}

export function salesIdentity(row, sid) {
  const sidMsku = (row?.sid_mskus || []).find(x => String(x.sid) === String(sid));
  const sellerSku = clean(sidMsku?.seller_sku ?? row?.seller_sku?.[0] ?? row?.seller_sku ?? row?.msku);
  const asin = clean(row?.asin);
  if (!asin && !sellerSku) return null;
  return { sid: String(sid), asin: asin || null, sellerSku: sellerSku || null };
}

export function normalizeDashboard({ sales7Rows, sales30Rows, listingRows, stockRows, generatedAt, period }) {
  const listingByAsin = new Map();
  const listingByMsku = new Map();
  for (const row of listingRows) {
    const asin = clean(row.asin);
    const msku = clean(row.msku);
    const item = {
      asin: asin || null,
      msku: msku || null,
      localSku: clean(row.local_sku) || null,
      title: clean(row.local_name ?? row.item_name ?? row.product_name) || null,
      imageUrl: clean(row.small_image_url) || null,
      category: clean(row.category_text ?? row.category) || 'Other',
      sid: String(row.sid ?? row.store_id ?? '')
    };
    if (asin) listingByAsin.set(asin, item);
    if (msku) listingByMsku.set(`${item.sid}|${normSku(msku)}`, item);
  }

  // Sales are requested per shop. Keep shop-level rows first, then aggregate the same ASIN/SKU across US shops.
  const salesMap = new Map();
  const mergeSales = (rows, currentField, previousField) => {
    for (const row of rows) {
      const sidCandidates = Array.isArray(row.sid) ? row.sid : [row.sid];
      const sid = String(sidCandidates[0] ?? row.sid_mskus?.[0]?.sid ?? '');
      const identity = salesIdentity(row, sid);
      if (!identity) continue;
      const key = `${identity.asin || ''}|${normSku(identity.sellerSku)}`;
      const entry = salesMap.get(key) || {
        key, asin: identity.asin, sellerSku: identity.sellerSku, sales7: 0,
        previousSales7: 0, sales30: 0, previousSales30: 0, shopIds: new Set(),
        title: clean(row.local_info?.[0]?.local_name) || null,
        imageUrl: clean(row.image_url) || null,
        category: clean(row.rank_info?.category) || 'Other'
      };
      entry[currentField] += parseVolume(row, 'date1');
      entry[previousField] += parseVolume(row, 'date2');
      entry.shopIds.add(sid);
      if (!entry.title && row.local_info?.[0]?.local_name) entry.title = row.local_info[0].local_name;
      if (!entry.imageUrl && row.image_url) entry.imageUrl = row.image_url;
      salesMap.set(key, entry);
    }
  };
  mergeSales(sales7Rows, 'sales7', 'previousSales7');
  mergeSales(sales30Rows, 'sales30', 'previousSales30');

  // Inventory: stock.sku is the local SKU; stock.seller_sku is the marketplace/MSKU.
  // Amazon ghost seller_sku rows are folded into the local sku + ASIN bucket.
  const stockByAsin = new Map();
  const seenStockRows = new Set();
  for (const row of stockRows) {
    const asin = clean(row.asin);
    const localSku = clean(row.sku);
    const sid = String(row.sid ?? '');
    if (!asin || !localSku) continue;
    const dedupeKey = clean(row.unique_id) || `${sid}|${asin}|${localSku}|${clean(row.seller_sku)}`;
    if (seenStockRows.has(dedupeKey)) continue;
    seenStockRows.add(dedupeKey);
    const bucket = stockByAsin.get(asin) || { availableStock: 0, reservedStock: 0, localSkus: new Set(), shopIds: new Set() };
    bucket.availableStock += number(row.afn_fulfillable_quantity);
    bucket.reservedStock += number(row.afn_reserved_quantity);
    bucket.localSkus.add(localSku);
    bucket.shopIds.add(sid);
    stockByAsin.set(asin, bucket);
  }

  const items = [...salesMap.values()].map(s => {
    const listing = listingByAsin.get(s.asin) || [...s.shopIds].map(id => listingByMsku.get(`${id}|${normSku(s.sellerSku)}`)).find(Boolean);
    const stock = stockByAsin.get(s.asin);
    const availableStock = stock ? stock.availableStock : null;
    const dailyVelocity = s.sales30 / 30;
    const daysOfCover = availableStock == null ? null : dailyVelocity > 0 ? availableStock / dailyVelocity : null;
    const salesGrowth7 = s.previousSales7 > 0 ? (s.sales7 - s.previousSales7) / s.previousSales7 * 100 : null;
    const salesGrowth30 = s.previousSales30 > 0 ? (s.sales30 - s.previousSales30) / s.previousSales30 * 100 : null;
    return {
      id: s.asin || s.key,
      sku: s.sellerSku,
      localSku: listing?.localSku || [...(stock?.localSkus || [])][0] || null,
      asin: s.asin,
      title: listing?.title || s.title || s.sellerSku || s.asin,
      imageUrl: listing?.imageUrl || s.imageUrl || null,
      category: listing?.category || s.category || 'Other',
      sales7: s.sales7,
      sales30: s.sales30,
      previousSales7: s.previousSales7,
      previousSales30: s.previousSales30,
      salesGrowth7,
      salesGrowth30,
      availableStock,
      reservedStock: stock?.reservedStock ?? null,
      dailyVelocity,
      daysOfCover,
      status: availableStock == null ? 'unknown' : s.sales30 === 0 ? 'no_sales' : availableStock === 0 ? 'stockout' : daysOfCover < 14 ? 'low' : 'healthy',
      shopIds: [...s.shopIds],
      inventoryShopIds: [...(stock?.shopIds || [])],
      rank: null,
      previousRank: null,
      rankChange: null
    };
  }).sort((a, b) => b.sales30 - a.sales30);

  items.forEach((item, index) => { item.rank = index + 1; });
  const previous = [...items].sort((a, b) => b.previousSales30 - a.previousSales30);
  const previousRankMap = new Map(previous.map((item, index) => [item.id, index + 1]));
  items.forEach(item => {
    item.previousRank = previousRankMap.get(item.id) ?? null;
    item.rankChange = item.previousRank == null ? null : item.previousRank - item.rank;
  });

  return {
    meta: {
      source: 'LingXing MCP', brand: 'Keychron', brandId: 304,
      marketplace: 'Amazon US', marketplaceId: 'ATVPDKIKX0DER',
      shopIds: ['2177', '2178', '2179', '7178'], timezone: 'America/Los_Angeles',
      generatedAt, period, isMock: false,
      rankingDefinition: 'Keychron US internal sales ranking; not Amazon Best Sellers Rank'
    },
    items
  };
}

export const __test__ = { number, normSku, isGhost };
