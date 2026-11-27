
import React, { useCallback, useEffect, useMemo, useState } from 'react';

const API_URL = '/api/partner/ranking?market=US';

const n = value => {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
};

const fmt = value => n(value).toLocaleString('en-US');

const growth = (current, previous) =>
  n(previous) > 0
    ? ((n(current) - n(previous)) / n(previous)) * 100
    : null;

const pct = value =>
  value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

export default function BestSellerRanking({ lang = 'en' }) {
  const [rows, setRows] = useState([]);
  const [period, setPeriod] = useState(30);
  const [category, setCategory] = useState('all');
  const [view, setView] = useState('parent');
  const [expanded, setExpanded] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const zh = lang === 'zh';

  const loadRanking = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(API_URL, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json'
        }
      });

      if (response.status === 401) {
        throw new Error(
          zh ? '登录已过期，请重新登录。' : 'Session expired. Please sign in again.'
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || `Ranking API failed: HTTP ${response.status}`
        );
      }

      if (data.market !== 'US') {
        throw new Error('Unexpected marketplace returned by API.');
      }

      if (!Array.isArray(data.items)) {
        throw new Error('Invalid ranking API response: items is missing.');
      }

      setRows(data.items);
      setMeta(data);
      setLastUpdated(new Date().toISOString());

    } catch (err) {
      setError(err.message || 'Failed to load ranking data.');
    } finally {
      setLoading(false);
    }
  }, [zh]);

  useEffect(() => {
    loadRanking();
  }, [loadRanking]);

  const field = `sales${period}`;
  const previousField = `previousSales${period}`;
  const growthField = `growth${period}`;

  const filtered = useMemo(() => {
    const list = rows.filter(parent => {
      if (category === 'all') return true;

      return (parent.variants || []).some(variant => {
        const c = String(variant.category || '').toLowerCase();

        if (category === 'keyboard') {
          return c.includes('keyboard');
        }

        if (category === 'mouse') {
          return c.includes('mouse');
        }

        return (
          !c.includes('keyboard') &&
          !c.includes('mouse')
        );
      });
    });

    return [...list].sort(
      (a, b) =>
        n(b[field]) - n(a[field]) ||
        String(a.parentSku).localeCompare(String(b.parentSku))
    );
  }, [rows, category, field]);

  const variantRows = useMemo(() => {
    return filtered
      .flatMap(parent =>
        (parent.variants || []).map(variant => ({
          ...variant,
          parentSku: parent.parentSku
        }))
      )
      .sort(
        (a, b) =>
          n(b[field]) - n(a[field]) ||
          String(a.variantSku).localeCompare(String(b.variantSku))
      );
  }, [filtered, field]);

  const toggle = sku => {
    setExpanded(old => {
      const next = new Set(old);

      if (next.has(sku)) {
        next.delete(sku);
      } else {
        next.add(sku);
      }

      return next;
    });
  };

  const columns = [7, 30, 90];

  const totalVariants = rows.reduce(
    (sum, item) => sum + n(item.variantCount),
    0
  );

  const matchedVariants = rows.reduce(
    (sum, item) => sum + n(item.matchedVariants),
    0
  );

  const title = zh
    ? '畅销产品排行榜'
    : 'Best-seller ranking';

  const emptyMessage = loading
    ? (zh ? '正在加载排行榜...' : 'Loading ranking data...')
    : (zh ? '暂无可展示的映射数据' : 'No ranking data available.');

  return (
    <section className="ranking-page">

      <div className="ranking-heading">
        <div>
          <div className="ranking-eyebrow">
            KEYCHRON · UNITED STATES
          </div>

          <h1>{title}</h1>

          <p>
            {zh
              ? '父 SKU 排名 — 展开查看各子变体的独立销量'
              : 'Parent SKU ranking — expand to view individual variant sales'}
          </p>

          {meta && (
            <div className="ranking-subline">
              {zh ? '数据来源' : 'Source'}: {meta.source || 'Ranking API'}
              {' · '}
              {zh ? '映射记录' : 'Mappings'}: {fmt(meta.mappingCount)}
              {' · '}
              {zh ? '匹配变体' : 'Matched variants'}: {fmt(matchedVariants)}/{fmt(totalVariants)}
            </div>
          )}
        </div>

        <div className="ranking-periods" aria-label="Sales period">
          {columns.map(p => (
            <button
              key={p}
              className={period === p ? 'active' : ''}
              onClick={() => setPeriod(p)}
            >
              {`D${p}`}
            </button>
          ))}

          <button
            onClick={loadRanking}
            disabled={loading}
            title={zh ? '刷新数据' : 'Refresh data'}
          >
            {loading ? '...' : '↻'}
          </button>
        </div>
      </div>

      {error && (
        <div className="ranking-error" role="alert">
          <strong>
            {zh ? '排行榜加载失败' : 'Ranking load failed'}
          </strong>
          <span>{error}</span>
          <button onClick={loadRanking}>
            {zh ? '重试' : 'Retry'}
          </button>
        </div>
      )}

      <div className="ranking-toolbar">

        <div className="ranking-tabs">
          <button
            className={view === 'parent' ? 'active' : ''}
            onClick={() => setView('parent')}
          >
            {zh ? '按父 SKU' : 'By Parent SKU'}
          </button>

          <button
            className={view === 'variant' ? 'active' : ''}
            onClick={() => setView('variant')}
          >
            {zh ? '按变体 SKU' : 'By Variant SKU'}
          </button>
        </div>

        <div className="ranking-categories">
          {[
            ['all', zh ? '全部' : 'All'],
            ['keyboard', zh ? '键盘' : 'Keyboards'],
            ['mouse', zh ? '鼠标' : 'Mice'],
            ['accessory', zh ? '配件' : 'Accessories']
          ].map(([value, label]) => (
            <button
              key={value}
              className={category === value ? 'active' : ''}
              onClick={() => setCategory(value)}
            >
              {label}
            </button>
          ))}
        </div>

      </div>

      <div className="ranking-table-wrap">

        <table className="ranking-table">

          <thead>
            <tr>
              <th>#</th>
              <th>
                {zh ? 'SKU / 变体' : 'Parent SKU / Variant SKU'}
              </th>
              <th>D7</th>
              <th>D30</th>
              <th>D90</th>
              <th>{zh ? '增长' : 'Growth'}</th>
            </tr>
          </thead>

          <tbody>

            {loading && rows.length === 0 && (
              <tr>
                <td colSpan="6" className="ranking-empty">
                  {emptyMessage}
                </td>
              </tr>
            )}

            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan="6" className="ranking-empty">
                  {emptyMessage}
                </td>
              </tr>
            )}

            {view === 'parent' && filtered.map((parent, index) => (
              <React.Fragment key={parent.parentSku}>

                <tr className="ranking-parent-row">

                  <td className="rank-number">
                    {index + 1}
                  </td>

                  <td>
                    <button
                      className="ranking-expand"
                      onClick={() => toggle(parent.parentSku)}
                      aria-expanded={expanded.has(parent.parentSku)}
                    >
                      <span className="ranking-chevron">
                        {expanded.has(parent.parentSku) ? '▾' : '▸'}
                      </span>

                      <span className="ranking-sku">
                        {parent.parentSku}
                      </span>

                      <span className="ranking-badge">
                        Parent SKU
                      </span>
                    </button>

                    <div className="ranking-subline">
                      {fmt(parent.variantCount)} {zh ? '个子变体' : 'variants'}
                      {' · '}
                      {fmt(parent.matchedVariants)}/{fmt(parent.variantCount)}
                      {' '}
                      {zh ? '已匹配销量数据' : 'matched'}
                    </div>
                  </td>

                  <td><strong>{fmt(parent.sales7)}</strong></td>
                  <td><strong>{fmt(parent.sales30)}</strong></td>
                  <td><strong>{fmt(parent.sales90)}</strong></td>

                  <td className={
                    parent[growthField] > 0
                      ? 'rank-up'
                      : parent[growthField] < 0
                        ? 'rank-down'
                        : ''
                  }>
                    {pct(parent[growthField])}
                  </td>

                </tr>

                {expanded.has(parent.parentSku) &&
                  (parent.variants || []).map(variant => {
                    const g = growth(
                      variant[field],
                      variant[previousField]
                    );

                    return (
                      <tr
                        className="ranking-variant-row"
                        key={`${variant.asin}|${variant.variantSku}`}
                      >
                        <td></td>

                        <td>
                          <span className="variant-indent">↳</span>
                          <span className="variant-sku">
                            {variant.variantSku}
                          </span>
                          <span className="variant-asin">
                            {variant.asin}
                          </span>
                        </td>

                        <td>{fmt(variant.sales7)}</td>
                        <td>{fmt(variant.sales30)}</td>
                        <td>{fmt(variant.sales90)}</td>

                        <td className={
                          g > 0 ? 'rank-up' : g < 0 ? 'rank-down' : ''
                        }>
                          {pct(g)}
                        </td>
                      </tr>
                    );
                  })}

              </React.Fragment>
            ))}

            {view === 'variant' && variantRows.map((variant, index) => {
              const g = growth(
                variant[field],
                variant[previousField]
              );

              return (
                <tr
                  className="ranking-variant-row"
                  key={`${variant.asin}|${variant.variantSku}`}
                >
                  <td className="rank-number">
                    {index + 1}
                  </td>

                  <td>
                    <span className="variant-sku">
                      {variant.variantSku}
                    </span>

                    <span className="variant-asin">
                      {variant.parentSku} · {variant.asin}
                    </span>
                  </td>

                  <td>{fmt(variant.sales7)}</td>
                  <td>{fmt(variant.sales30)}</td>
                  <td>{fmt(variant.sales90)}</td>

                  <td className={
                    g > 0 ? 'rank-up' : g < 0 ? 'rank-down' : ''
                  }>
                    {pct(g)}
                  </td>
                </tr>
              );
            })}

          </tbody>
        </table>

      </div>

      <div className="ranking-footnote">
        <strong>
          {zh ? '统计规则' : 'Aggregation rule'}
        </strong>

        <span>
          {zh
            ? '父 SKU 的 D7、D30、D90 分别等于其全部子变体在对应周期的销量之和。四个美国店铺合并统计。'
            : 'Parent D7, D30 and D90 equal the sum of their child variants. All four US stores are consolidated.'}
        </span>
      </div>

      <div className="ranking-subline">
        {meta?.sourceDate
          ? `${zh ? '数据日期' : 'Source date'}: ${meta.sourceDate}`
          : ''}
        {lastUpdated
          ? ` · ${zh ? '页面刷新' : 'Page refreshed'}: ${new Date(lastUpdated).toLocaleString()}`
          : ''}
      </div>

    </section>
  );
}
