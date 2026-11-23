import React, { useMemo, useState } from 'react';
import mapping from './parentVariantMapping.json';

const n = value => {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const fmt = value => n(value).toLocaleString('en-US');
const growth = (current, previous) => n(previous) > 0
  ? ((n(current) - n(previous)) / n(previous)) * 100
  : null;
const pct = value => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

/**
 * Parent SKU ranking based on the reviewed Parent ASIN -> Parent SKU mapping.
 * `items` must be the `skuItems` array returned by GET /api/partner/dashboard?market=US.
 * The component never invents missing sales; catalog-mapped variants without a sales
 * record are shown with zero only when their SKU is present in the dashboard catalog.
 */
export default function BestSellerRanking({ items = [], lang = 'en' }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [period, setPeriod] = useState(30);
  const [category, setCategory] = useState('all');
  const [view, setView] = useState('parent');
  const zh = lang === 'zh';

  const rows = useMemo(() => {
    const apiByKey = new Map();
    for (const item of items) {
      const asin = String(item.asin || '').trim().toUpperCase();
      const sku = String(item.sellerSku || item.sku || '').trim().toUpperCase();
      if (asin && sku) apiByKey.set(`${asin}|${sku}`, item);
    }

    const variantMap = new Map();
    for (const m of mapping) {
      const key = `${m.asin}|${m.variantSku.toUpperCase()}`;
      const source = apiByKey.get(key);
      const existing = variantMap.get(key);
      if (!existing) {
        variantMap.set(key, {
          ...m,
          sales7: n(source?.sales7), previousSales7: n(source?.previousSales7),
          sales30: n(source?.sales30), previousSales30: n(source?.previousSales30),
          sales90: n(source?.sales90), previousSales90: n(source?.previousSales90),
          title: source?.title || '', imageUrl: source?.imageUrl || null,
          category: source?.category || '',
          matched: Boolean(source)
        });
      }
    }

    const parents = new Map();
    for (const v of variantMap.values()) {
      if (!parents.has(v.parentSku)) parents.set(v.parentSku, {
        parentSku: v.parentSku, variants: [], sales7: 0, previousSales7: 0,
        sales30: 0, previousSales30: 0, sales90: 0, previousSales90: 0,
        asins: new Set(), matchedVariants: 0
      });
      const p = parents.get(v.parentSku);
      p.variants.push(v);
      p.asins.add(v.asin);
      for (const f of ['sales7','previousSales7','sales30','previousSales30','sales90','previousSales90']) p[f] += v[f];
      if (v.matched) p.matchedVariants += 1;
    }
    return [...parents.values()].map(p => ({
      ...p,
      variantCount: p.variants.length,
      asinCount: p.asins.size,
      growth7: growth(p.sales7,p.previousSales7),
      growth30: growth(p.sales30,p.previousSales30),
      growth90: growth(p.sales90,p.previousSales90),
      variants: p.variants.sort((a,b) => n(b.sales30)-n(a.sales30) || a.variantSku.localeCompare(b.variantSku))
    }));
  }, [items]);

  const field = `sales${period}`;
  const previousField = `previousSales${period}`;
  const growthField = `growth${period}`;
  const filtered = useMemo(() => {
    const q = category;
    const list = rows.filter(p => q === 'all' || p.variants.some(v => {
      const c = String(v.category || '').toLowerCase();
      return q === 'keyboard' ? c.includes('keyboard') : q === 'mouse' ? c.includes('mouse') : !c.includes('keyboard') && !c.includes('mouse');
    }));
    return list.sort((a,b) => n(b[field])-n(a[field]) || a.parentSku.localeCompare(b.parentSku));
  }, [rows, category, field]);

  const toggle = sku => setExpanded(old => {
    const next = new Set(old);
    next.has(sku) ? next.delete(sku) : next.add(sku);
    return next;
  });

  const columns = [7,30,90];
  const max = Math.max(1, ...filtered.map(x => n(x[field])));
  const title = zh ? '畅销产品排行榜' : 'Best-seller ranking';

  return <section className="ranking-page">
    <div className="ranking-heading">
      <div><div className="ranking-eyebrow">KEYCHRON · UNITED STATES</div><h1>{title}</h1>
        <p>{zh ? '父 SKU 排名 — 展开查看各子变体的独立销量' : 'Parent SKU ranking — expand to view individual variant sales'}</p>
      </div>
      <div className="ranking-periods" aria-label="Sales period">
        {columns.map(p => <button key={p} className={period===p?'active':''} onClick={()=>setPeriod(p)}>{`D${p}`}</button>)}
      </div>
    </div>

    <div className="ranking-toolbar">
      <div className="ranking-tabs">
        <button className={view==='parent'?'active':''} onClick={()=>setView('parent')}>{zh?'按父 SKU':'By Parent SKU'}</button>
        <button className={view==='variant'?'active':''} onClick={()=>setView('variant')}>{zh?'按变体 SKU':'By Variant SKU'}</button>
      </div>
      <div className="ranking-categories">
        {[['all',zh?'全部':'All'],['keyboard',zh?'键盘':'Keyboards'],['mouse',zh?'鼠标':'Mice'],['accessory',zh?'配件':'Accessories']].map(([v,label])=><button key={v} className={category===v?'active':''} onClick={()=>setCategory(v)}>{label}</button>)}
      </div>
    </div>

    <div className="ranking-table-wrap">
      <table className="ranking-table">
        <thead><tr><th>#</th><th>{zh?'SKU / 变体':'Parent SKU / Variant SKU'}</th><th>D7</th><th>D30</th><th>D90</th><th>{zh?'增长':'Growth'}</th></tr></thead>
        <tbody>
          {view==='parent' ? filtered.map((p,i)=><React.Fragment key={p.parentSku}>
            <tr className="ranking-parent-row">
              <td className="rank-number">{i+1}</td>
              <td><button className="ranking-expand" onClick={()=>toggle(p.parentSku)} aria-expanded={expanded.has(p.parentSku)}><span className="ranking-chevron">{expanded.has(p.parentSku)?'▾':'▸'}</span><span className="ranking-sku">{p.parentSku}</span><span className="ranking-badge">Parent SKU</span></button><div className="ranking-subline">{p.variantCount} {zh?'个子变体':'variants'} · {p.matchedVariants}/{p.variantCount} {zh?'已匹配销量数据':'matched to API sales'}</div></td>
              <td><strong>{fmt(p.sales7)}</strong></td><td><strong>{fmt(p.sales30)}</strong></td><td><strong>{fmt(p.sales90)}</strong></td><td className={p[growthField]>=0?'rank-up':'rank-down'}>{pct(p[growthField])}</td>
            </tr>
            {expanded.has(p.parentSku) && p.variants.map(v=><tr className="ranking-variant-row" key={`${v.asin}|${v.variantSku}`}>
              <td></td><td><span className="variant-indent">↳</span><span className="variant-sku">{v.variantSku}</span><span className="variant-asin">{v.asin}</span></td>
              <td>{fmt(v.sales7)}</td><td>{fmt(v.sales30)}</td><td>{fmt(v.sales90)}</td><td className={growth(v[field],v[previousField])>=0?'rank-up':'rank-down'}>{pct(growth(v[field],v[previousField]))}</td>
            </tr>)}
          </React.Fragment>) : filtered.flatMap(p=>p.variants.map(v=>({...v,parentSku:p.parentSku}))).sort((a,b)=>n(b[field])-n(a[field])).map((v,i)=><tr className="ranking-variant-row" key={`${v.asin}|${v.variantSku}`}><td className="rank-number">{i+1}</td><td><span className="variant-sku">{v.variantSku}</span><span className="variant-asin">{v.parentSku} · {v.asin}</span></td><td>{fmt(v.sales7)}</td><td>{fmt(v.sales30)}</td><td>{fmt(v.sales90)}</td><td className={growth(v[field],v[previousField])>=0?'rank-up':'rank-down'}>{pct(growth(v[field],v[previousField]))}</td></tr>)}
          {filtered.length===0 && <tr><td colSpan="6" className="ranking-empty">{zh?'暂无可展示的映射数据':'No mapped Parent SKU data available.'}</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="ranking-footnote"><strong>{zh?'统计规则':'Aggregation rule'}</strong><span>{zh?'父 SKU 的 D7、D30、D90 分别等于其全部子变体在对应周期的销量之和。四个美国店铺先合并同一 ASIN + Seller SKU，再汇总父级。':'Parent D7, D30 and D90 each equal the sum of their child variants for that period. US stores are consolidated by ASIN + Seller SKU before parent roll-up.'}</span></div>
  </section>;
}
