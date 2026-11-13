
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Search, RefreshCw, LogOut, Languages, Package,
  TrendingUp, AlertTriangle, Boxes, Globe,
  Flag, ArrowUpRight
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';
import './style.css';

const copy = {
  en: {
    global: 'Global Overview',
    us: 'United States',
    au: 'Australia',
    globalSub: 'Global business overview',
    usSub: 'Amazon US · USD',
    auSub: 'Amazon Australia · AUD',
    products: 'Products tracked',
    sales: 'Units sold',
    stock: 'Available FBA stock',
    alerts: 'Inventory alerts',
    seven: '7 days',
    thirty: '30 days',
    refresh: 'Refresh',
    updated: 'Last successful sync',
    catalog: 'Product catalog',
    ranking: 'Sales ranking',
    product: 'Product',
    category: 'Category',
    search: 'Search SKU, ASIN or product',
    all: 'All categories',
    keyboard: 'Keyboards',
    mouse: 'Mice',
    accessory: 'Accessories',
    allStatus: 'All statuses',
    active: 'Active',
    inactive: 'Inactive',
    inventory: 'FBA stock',
    cover: 'Days of cover',
    previous: 'Previous period',
    rank: 'Rank',
    login: 'Partner access',
    password: 'Enter access password',
    signIn: 'Sign in',
    logout: 'Sign out',
    loading: 'Loading dashboard...',
    failed: 'Unable to load dashboard',
    noData: 'No products match this filter',
    noSync: 'No successful sync yet',
    stockout: 'Out of stock',
    low: 'Low stock',
    healthy: 'Healthy',
    unknown: 'Unknown',
    salesTrend: 'Top products by units sold',
    sales30: 'Last 30 days',
    noSales: 'Zero-sales products',
    disclaimer: 'Internal Keychron sales data. US and AU are displayed separately.',
    successful: 'Successful',
    unavailable: 'Not synced',
    currency: 'Reporting currency',
    units: 'Units',
    openMarket: 'Open dashboard',
    globalSales: 'Sales by market',
    globalProducts: 'Products by market',
    totalShops: 'Stores',
    errorLogin: 'Login failed',
    marketNotReady: 'This market has not completed a successful sync.',
    sales7: '7-day units',
    sales30Label: '30-day units',
    sales90: '90-day units',
    noInventory: 'Inventory not available'
  },
  zh: {
    global: '全球经营总览',
    us: '美国站',
    au: '澳洲站',
    globalSub: '全球市场经营概览',
    usSub: 'Amazon US · 美元 USD',
    auSub: 'Amazon Australia · 澳元 AUD',
    products: '跟踪商品',
    sales: '商品销量',
    stock: 'FBA 可售库存',
    alerts: '库存预警',
    seven: '近 7 天',
    thirty: '近 30 天',
    refresh: '刷新数据',
    updated: '最近成功同步',
    catalog: '完整产品库',
    ranking: '销量排行榜',
    product: '产品',
    category: '分类',
    search: '搜索 SKU、ASIN 或产品名称',
    all: '全部分类',
    keyboard: '键盘',
    mouse: '鼠标',
    accessory: '配件',
    allStatus: '全部状态',
    active: '在售',
    inactive: '停售',
    inventory: 'FBA 库存',
    cover: '预计可售天数',
    previous: '上期销量',
    rank: '排名',
    login: '合作伙伴登录',
    password: '请输入访问密码',
    signIn: '登录',
    logout: '退出登录',
    loading: '正在加载数据...',
    failed: '无法加载看板',
    noData: '没有符合筛选条件的商品',
    noSync: '尚无成功同步记录',
    stockout: '缺货',
    low: '低库存',
    healthy: '库存充足',
    unknown: '库存待确认',
    salesTrend: '热销商品销量排行',
    sales30: '近 30 天销量',
    noSales: '零销量商品',
    disclaimer: 'Keychron 内部销售数据。美国和澳洲分别展示，不混合统计。',
    successful: '同步成功',
    unavailable: '尚未同步',
    currency: '报表币种',
    units: '件',
    openMarket: '查看市场看板',
    globalSales: '各市场销量',
    globalProducts: '各市场商品',
    totalShops: '店铺数',
    errorLogin: '登录失败',
    marketNotReady: '该市场尚未完成成功同步。',
    sales7: '近 7 天销量',
    sales30Label: '近 30 天销量',
    sales90: '近 90 天销量',
    noInventory: '暂无库存数据'
  }
};

const fmt = value =>
  value == null
    ? '—'
    : Number(value).toLocaleString('en-US', {
        maximumFractionDigits: 1
      });

function Login({ onLogin, lang, setLang }) {
  const t = copy[lang];
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password })
      });

      const j = await r.json();

      if (!r.ok) {
        throw new Error(j.error || t.errorLogin);
      }

      onLogin();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brandmark">K</div>

        <div className="topline">
          <span>KEYCHRON</span>
          <button
            type="button"
            className="lang"
            onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
          >
            <Languages size={15} />
            {lang.toUpperCase()}
          </button>
        </div>

        <h1>{t.login}</h1>
        <p>Keychron Sales Intelligence V4</p>

        <label>{t.password}</label>

        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />

        <button className="primary" disabled={busy}>
          {busy ? '…' : t.signIn}
        </button>

        {error && <div className="error">{error}</div>}

        <small>Access is restricted to authorised partners.</small>
      </form>
    </main>
  );
}

function Kpi({ icon, label, value, alert = false }) {
  return (
    <div className={'kpi-card ' + (alert ? 'alert' : '')}>
      <div className="kpi-icon">{icon}</div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Stock({ item, t }) {
  const status = item.status;

  const label =
    status === 'stockout' ? t.stockout :
    status === 'low' ? t.low :
    status === 'healthy' ? t.healthy :
    t.unknown;

  return (
    <div className="stock">
      <b>
        {item.availableStock == null
          ? '—'
          : fmt(item.availableStock)}
      </b>

      <span className={
        'pill ' +
        (status === 'stockout' || status === 'low' ? 'warn' : '')
      }>
        {label}
      </span>
    </div>
  );
}

// ==========================================
// GLOBAL OVERVIEW
// ==========================================

function GlobalOverview({ overview, onOpen, t }) {
  const markets = overview?.markets || {};
  const us = markets.US;
  const au = markets.AU;

  const marketCards = [
    {
      code: 'US',
      data: us,
      name: t.us,
      currency: 'USD'
    },
    {
      code: 'AU',
      data: au,
      name: t.au,
      currency: 'AUD'
    }
  ];

  return (
    <>
      <div className="intro">
        <div>
          <div className="eyebrow">
            MULTI-MARKET MANAGEMENT
          </div>

          <h1>{t.global}</h1>
          <p>{t.globalSub}</p>
        </div>

        <div className="updated">
          {t.updated}
          <b>
            {overview?.generatedAt
              ? new Date(overview.generatedAt).toLocaleString()
              : '—'}
          </b>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{t.globalSales}</h2>
            <p>{t.disclaimer}</p>
          </div>
        </div>

        <div className="market-grid">
          {marketCards.map(m => {
            const data = m.data?.data;
            const available = m.data?.available === true;

            return (
              <article className="market-card" key={m.code}>
                <div className="market-card-top">
                  <div className="market-icon">
                    <Flag size={22} />
                  </div>

                  <span className="market-code">
                    {m.code}
                  </span>
                </div>

                <h2>{m.name}</h2>

                <p>
                  {t.currency}: {m.currency}
                </p>

                {available ? (
                  <div className="market-metrics">
                    <div>
                      <span>{t.products}</span>
                      <b>{fmt(data?.catalogCount ?? 0)}</b>
                    </div>

                    <div>
                      <span>{t.sales7}</span>
                      <b>
                        {fmt(data?.sales7 ?? 0)} {t.units}
                      </b>
                    </div>

                    <div>
                      <span>{t.sales30Label}</span>
                      <b>
                        {fmt(data?.sales30 ?? 0)} {t.units}
                      </b>
                    </div>

                    <div>
                      <span>{t.sales90}</span>
                      <b>
                        {fmt(data?.sales90 ?? 0)} {t.units}
                      </b>
                    </div>
                  </div>
                ) : (
                  <div className="market-metrics">
                    <div>
                      <span>{t.marketStatus}</span>
                      <b>{t.unavailable}</b>
                    </div>
                    <div>
                      <span>{t.products}</span>
                      <b>—</b>
                    </div>
                  </div>
                )}

                <div className="market-footer">
                  <span className={
                    available ? 'status-live' : 'status-off'
                  }>
                    {available ? t.successful : t.unavailable}
                  </span>

                  <button
                    className="primary market-open"
                    onClick={() => onOpen(m.code)}
                  >
                    {t.openMarket}
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="kpis">
        <Kpi
          icon={<Globe />}
          label={`${t.totalShops} · US`}
          value={fmt(
            us?.shopCounts?.length ?? 0
          )}
        />

        <Kpi
          icon={<Package />}
          label={`${t.products} · US`}
          value={fmt(us?.data?.catalogCount ?? 0)}
        />

        <Kpi
          icon={<Flag />}
          label={`${t.totalShops} · AU`}
          value={fmt(
            au?.shopCounts?.length ?? 0
          )}
        />

        <Kpi
          icon={<Package />}
          label={`${t.products} · AU`}
          value={fmt(au?.data?.catalogCount ?? 0)}
        />
      </section>

      <footer>{t.disclaimer}</footer>
    </>
  );
}

// ==========================================
// MARKET DASHBOARD
// ==========================================

function MarketDashboard({
  market,
  items,
  meta,
  period,
  setPeriod,
  category,
  setCategory,
  catalogView,
  setCatalogView,
  statusFilter,
  setStatusFilter,
  query,
  setQuery,
  t,
  busy
}) {
  const isAU = market === 'AU';
  const currency = isAU ? 'AUD' : 'USD';

  const filtered = useMemo(() => {
    return items.filter(x => {
      const sales = period === 7
        ? x.sales7
        : x.sales30;

      if (catalogView === 'ranking' && !sales) {
        return false;
      }

      const c = String(x.category || '').toLowerCase();

      const cat =
        category === 'all' ||
        (category === 'keyboard' && c.includes('keyboard')) ||
        (category === 'mouse' && c.includes('mouse')) ||
        (
          category === 'accessory' &&
          !c.includes('keyboard') &&
          !c.includes('mouse')
        );

      const q = query.toLowerCase();

      const st =
        statusFilter === 'all' ||
        (
          statusFilter === 'active' &&
          !x.isInactive
        ) ||
        (
          statusFilter === 'inactive' &&
          x.isInactive
        );

      return cat && st && (
        !q ||
        [x.title, x.sku, x.asin, x.localSku]
          .some(v =>
            String(v || '').toLowerCase().includes(q)
          )
      );
    }).sort((a, b) => (
      catalogView === 'ranking'
        ? (
            period === 7
              ? b.sales7 - a.sales7
              : b.sales30 - a.sales30
          )
        : String(a.title || '').localeCompare(
            String(b.title || '')
          )
    ));
  }, [
    items,
    category,
    query,
    period,
    catalogView,
    statusFilter
  ]);

  const maxSales = Math.max(
    1,
    ...filtered.map(x =>
      period === 7 ? x.sales7 : x.sales30
    )
  );

  const alerts = items.filter(
    x => x.status === 'stockout' || x.status === 'low'
  );

  return (
    <>
      <div className="intro">
        <div>
          <div className="eyebrow">
            {isAU ? 'AMAZON AUSTRALIA' : 'AMAZON UNITED STATES'}
          </div>

          <h1>
            {isAU ? t.au : t.us} Sales Dashboard
          </h1>

          <p>{isAU ? t.auSub : t.usSub}</p>
        </div>

        <div className="updated">
          {t.updated}
          <b>
            {meta?.generatedAt
              ? new Date(meta.generatedAt).toLocaleString()
              : '—'}
          </b>
        </div>
      </div>

      {!meta && !busy && (
        <div className="error banner">
          {t.marketNotReady}
        </div>
      )}

      <section className="kpis">
        <Kpi
          icon={<Package />}
          label={t.products}
          value={fmt(items.length)}
        />

        <Kpi
          icon={<TrendingUp />}
          label={t.sales}
          value={`${fmt(items.reduce(
            (s, x) => s + (
              period === 7 ? x.sales7 : x.sales30
            ), 0
          ))} ${t.units}`}
        />

        <Kpi
          icon={<Boxes />}
          label={t.stock}
          value={fmt(items.reduce(
            (s, x) => s + (x.availableStock || 0), 0
          ))}
        />

        <Kpi
          icon={<AlertTriangle />}
          label={t.alerts}
          value={fmt(alerts.length)}
          alert={alerts.length > 0}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{t.salesTrend}</h2>
            <p>{t.disclaimer}</p>
          </div>

          <div className="tabs">
            <button
              className={period === 7 ? 'active' : ''}
              onClick={() => setPeriod(7)}
            >
              {t.seven}
            </button>

            <button
              className={period === 30 ? 'active' : ''}
              onClick={() => setPeriod(30)}
            >
              {t.thirty}
            </button>
          </div>
        </div>

        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={filtered.slice(0, 10).map(x => ({
                name: x.sku || x.title,
                units: period === 7 ? x.sales7 : x.sales30
              }))}
              layout="vertical"
              margin={{
                left: 10,
                right: 24,
                top: 4,
                bottom: 4
              }}
            >
              <XAxis type="number" hide />

              <YAxis
                type="category"
                dataKey="name"
                width={95}
                tick={{
                  fontSize: 11,
                  fill: '#667085'
                }}
              />

              <Tooltip />

              <Bar
                dataKey="units"
                fill="#2775c7"
                radius={[0, 5, 5, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <div className="table-head">
          <div>
            <h2>
              {catalogView === 'catalog'
                ? t.catalog
                : t.ranking}
            </h2>

            <p>
              {filtered.length} products ·{' '}
              {meta?.zeroSalesCount ?? 0} {t.noSales}
            </p>
          </div>

          <div className="filters">
            <div className="tabs">
              <button
                className={
                  catalogView === 'catalog' ? 'active' : ''
                }
                onClick={() => setCatalogView('catalog')}
              >
                {t.catalog}
              </button>

              <button
                className={
                  catalogView === 'ranking' ? 'active' : ''
                }
                onClick={() => setCatalogView('ranking')}
              >
                {t.ranking}
              </button>
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">{t.allStatus}</option>
              <option value="active">{t.active}</option>
              <option value="inactive">{t.inactive}</option>
            </select>

            <div className="search">
              <Search size={16} />

              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t.search}
              />
            </div>

            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              <option value="all">{t.all}</option>
              <option value="keyboard">{t.keyboard}</option>
              <option value="mouse">{t.mouse}</option>
              <option value="accessory">{t.accessory}</option>
            </select>
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t.rank}</th>
                <th>{t.product}</th>
                <th>{t.category}</th>
                <th>
                  {period === 7 ? t.seven : t.sales30}
                </th>
                <th>{t.previous}</th>
                <th>{t.inventory}</th>
                <th>{t.cover}</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((x, i) => (
                <tr key={x.id || `${x.shopId}-${x.asin}-${x.sku}`}>
                  <td>
                    <b className="rank">{i + 1}</b>
                  </td>

                  <td>
                    <div className="product">
                      <img
                        src={x.imageUrl || ''}
                        alt=""
                        onError={e => {
                          e.currentTarget.style.visibility = 'hidden';
                        }}
                      />

                      <div>
                        <b>{x.title || x.sku}</b>
                        <span>
                          {x.sku} · {x.asin || '—'}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td>
                    {x.category || '—'}
                    <div className="muted">
                      {x.listingStatus || 'Unknown'}
                    </div>
                  </td>

                  <td>
                    <div className="salescell">
                      <b>
                        {fmt(
                          period === 7 ? x.sales7 : x.sales30
                        )}
                      </b>

                      <div className="bar">
                        <i
                          style={{
                            width: `${
                              Math.max(
                                0,
                                (
                                  period === 7
                                    ? x.sales7
                                    : x.sales30
                                ) / maxSales * 100
                              )
                            }%`
                          }}
                        />
                      </div>
                    </div>
                  </td>

                  <td>
                    {fmt(
                      period === 7
                        ? x.previousSales7
                        : x.previousSales30
                    )}
                  </td>

                  <td>
                    <Stock item={x} t={t} />
                  </td>

                  <td>
                    {x.daysOfCover == null
                      ? '—'
                      : `${fmt(x.daysOfCover)}d`}
                  </td>
                </tr>
              ))}

              {!filtered.length && (
                <tr>
                  <td colSpan="7" className="empty">
                    {busy ? t.loading : t.noData}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
        {t.disclaimer} · {currency}
      </footer>
    </>
  );
}

// ==========================================
// MAIN APP
// ==========================================

function App() {
  const [lang, setLang] = useState(
    localStorage.getItem('dash-lang') || 'en'
  );

  const [authed, setAuthed] = useState(false);
  const [market, setMarket] = useState('GLOBAL');

  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [overview, setOverview] = useState(null);

  const [period, setPeriod] = useState(30);
  const [category, setCategory] = useState('all');
  const [catalogView, setCatalogView] = useState('catalog');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const t = copy[lang];

  useEffect(() => {
    localStorage.setItem('dash-lang', lang);
  }, [lang]);

  async function load() {
    if (!authed) return;

    setBusy(true);
    setError('');

    try {
      if (market === 'GLOBAL') {
        const r = await fetch(
          '/api/partner/global-overview',
          {
            credentials: 'same-origin',
            cache: 'no-store'
          }
        );

        if (r.status === 401) {
          setAuthed(false);
          return;
        }

        const j = await r.json();

        if (!r.ok) {
          throw new Error(j.error || `HTTP ${r.status}`);
        }

        setOverview(j);
        setItems([]);
        setMeta(null);

      } else {
        const r = await fetch(
          `/api/partner/dashboard?market=${market}`,
          {
            credentials: 'same-origin',
            cache: 'no-store'
          }
        );

        if (r.status === 401) {
          setAuthed(false);
          return;
        }

        const j = await r.json();

        if (!r.ok) {
          throw new Error(j.error || `HTTP ${r.status}`);
        }

        setItems(j.items || []);
        setMeta(j.meta || null);
        setOverview(null);
      }

    } catch (e) {
      setError(e.message);

    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetch('/api/auth/me', {
      credentials: 'same-origin'
    })
      .then(r => {
        if (r.ok) setAuthed(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (authed) load();
  }, [authed, market]);

  async function logout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin'
    });

    setAuthed(false);
    setItems([]);
    setMeta(null);
    setOverview(null);
  }

  function openMarket(code) {
    setMarket(code);
    setPeriod(30);
    setCategory('all');
    setCatalogView('catalog');
    setStatusFilter('all');
    setQuery('');
  }

  if (!authed) {
    return (
      <Login
        lang={lang}
        setLang={setLang}
        onLogin={() => setAuthed(true)}
      />
    );
  }

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          <div className="brandmark small">K</div>

          <div>
            <b>KEYCHRON</b>
            <span>Sales Intelligence V4</span>
          </div>
        </div>

        <div className="header-actions">
          <span className="live">
            <i />
            {market === 'GLOBAL' ? 'GLOBAL' : `${market} DATA`}
          </span>

          <button
            className="iconbtn"
            onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
          >
            <Languages size={17} />
            {lang.toUpperCase()}
          </button>

          <button
            className="iconbtn"
            onClick={load}
            disabled={busy}
          >
            <RefreshCw
              size={16}
              className={busy ? 'spin' : ''}
            />
            {t.refresh}
          </button>

          <button
            className="iconbtn logout"
            onClick={logout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <nav className="market-nav">
        <button
          className={market === 'GLOBAL' ? 'active' : ''}
          onClick={() => setMarket('GLOBAL')}
        >
          <Globe size={17} />
          {t.global}
        </button>

        <button
          className={market === 'US' ? 'active' : ''}
          onClick={() => openMarket('US')}
        >
          <Flag size={17} />
          {t.us}
          <small>USD</small>
        </button>

        <button
          className={market === 'AU' ? 'active' : ''}
          onClick={() => openMarket('AU')}
        >
          <Flag size={17} />
          {t.au}
          <small>AUD</small>
        </button>
      </nav>

      <main className="main">
        {error && (
          <div className="error banner">
            {t.failed}: {error}
          </div>
        )}

        {market === 'GLOBAL' ? (
          <GlobalOverview
            overview={overview}
            onOpen={openMarket}
            t={t}
          />
        ) : (
          <MarketDashboard
            market={market}
            items={items}
            meta={meta}
            period={period}
            setPeriod={setPeriod}
            category={category}
            setCategory={setCategory}
            catalogView={catalogView}
            setCatalogView={setCatalogView}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            query={query}
            setQuery={setQuery}
            t={t}
            busy={busy}
          />
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
