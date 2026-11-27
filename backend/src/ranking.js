import express from 'express';
import { readFileSync } from 'node:fs';

const seed = JSON.parse(readFileSync(new URL('./ranking-seed-us.json', import.meta.url), 'utf8'));
const mapping = JSON.parse(readFileSync(new URL('./parentVariantMapping.json', import.meta.url), 'utf8'));
const num = v => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

export function createRankingRouter({ partner, getDashboard, latestRun }) {
  const router = express.Router();
  router.get('/', partner, async (req, res) => {
    try {
      const market = String(req.query.market || 'US').toUpperCase();
      if (market !== 'US') return res.status(400).json({ error: 'Ranking is currently available for US only.' });

      const run = await latestRun('US');
      let source = 'historical-workbook-seed';
      let sourceDate = seed.salesEndDate;
      let skuIndex = new Map();

      if (run) {
        const dashboard = await getDashboard('US');
        const skuItems = Array.isArray(dashboard?.skuItems) ? dashboard.skuItems : [];
        for (const item of skuItems) {
          const asin = String(item.asin || '').trim().toUpperCase();
          const sku = String(item.sellerSku || item.sku || '').trim().toUpperCase();
          if (asin && sku) skuIndex.set(`${asin}|${sku}`, item);
        }
        source = 'latest-successful-us-sync';
        sourceDate = run.finished_at || null;
      }

      const seedIndex = new Map(seed.variants.map(v => [`${v.asin}|${v.variantSku.toUpperCase()}`, v]));
      const variants = mapping.map(m => {
        const key = `${String(m.asin).toUpperCase()}|${String(m.variantSku).toUpperCase()}`;
        const live = skuIndex.get(key);
        const historic = seedIndex.get(key);
        const useLive = Boolean(run && live);
        const row = run ? live : historic;
        return {
          parentSku: m.parentSku,
          parentAsin: m.parentAsin,
          variantSku: m.variantSku,
          asin: m.asin,
          title: row?.title || '',
          category: row?.category || m.category || 'accessory',
          imageUrl: row?.imageUrl || null,
          sales7: num(row?.sales7), previousSales7: num(row?.previousSales7),
          sales30: num(row?.sales30), previousSales30: num(row?.previousSales30),
          sales90: num(row?.sales90), previousSales90: num(row?.previousSales90),
          matched: Boolean(row),
          dataSource: run ? (live ? 'live' : 'unmatched') : (historic ? 'historical' : 'unmatched')
        };
      });

      const parents = new Map();
      for (const v of variants) {
        if (!parents.has(v.parentSku)) parents.set(v.parentSku, {
          parentSku: v.parentSku, variants: [], sales7: 0, previousSales7: 0,
          sales30: 0, previousSales30: 0, sales90: 0, previousSales90: 0,
          matchedVariants: 0, variantCount: 0
        });
        const p = parents.get(v.parentSku);
        p.variants.push(v); p.variantCount += 1;
        for (const f of ['sales7','previousSales7','sales30','previousSales30','sales90','previousSales90']) p[f] += v[f];
        if (v.matched) p.matchedVariants += 1;
      }
      const growth = (a,b) => b > 0 ? ((a-b)/b)*100 : null;
      const items = [...parents.values()].map(p => ({ ...p,
        growth7: growth(p.sales7,p.previousSales7),
        growth30: growth(p.sales30,p.previousSales30),
        growth90: growth(p.sales90,p.previousSales90),
        variants: p.variants.sort((a,b) => b.sales30-a.sales30 || a.variantSku.localeCompare(b.variantSku))
      }));
      res.set('Cache-Control','no-store');
      res.json({ market:'US', source, sourceDate, mappingCount:mapping.length,
        matchedVariants:variants.filter(v=>v.matched).length,
        totalVariants:variants.length, items });
    } catch (error) {
      console.error('Ranking API error:', error);
      res.status(500).json({ error:'Ranking data query failed' });
    }
  });
  return router;
}
