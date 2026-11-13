
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard, Package, Star, GitCompare, BarChart3,
  Store, TrendingUp, Warehouse, AlertTriangle, PackageX,
  RefreshCw, FileText, Settings, Search, LogOut, Languages,
  Globe, Flag, ChevronDown, ArrowUpRight, Menu, X,
  CircleAlert, Boxes, Activity
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';
import './style.css';

const STORE_IDS = ['2177', '2178', '2179', '7178'];
const WATCH_KEY = 'keychron-v41-watchlist';
const LANG_KEY = 'dash-lang';

const TEXT = {
  en: {
    brandSub: 'GLOBAL OPERATIONS INTELLIGENCE',
    global: 'Global Dashboard',
    catalog: 'Product Catalog',
    watchlist: 'Product Watchlist',
    compare: 'Product Comparison',
    sales: 'Sales Analytics',
    storeAnalysis: 'Store Performance',
    trends: 'SKU Sales Trends',
    inventory: 'FBA Inventory',
    alerts: 'Inventory Alerts',
    zeroSales: 'Zero Sales & Dead Stock',
    usStores: 'US Store Management',
    auStore: 'Australia Store',
    sync: 'Sync Center',
    logs: 'Sync Logs',
    settings: 'Settings & Permissions',
    overview: 'Business overview',
    market: 'Market',
    store: 'Store',
    allUS: 'All US Stores',
    us: 'United States',
    au: 'Australia',
    globalMarket: 'Global',
    products: 'Products',
    units7: 'Units sold · 7D',
    units30: 'Units sold · 30D',
    units90: 'Units sold · 90D',
    stock: 'FBA available',
    reserved: 'Reserved stock',
    low: 'Low stock',
    out: 'Out of stock',
    healthy: 'Healthy',
    unknown: 'Unknown',
    search: 'Search SKU, ASIN or product',
    allStatuses: 'All statuses',
    active: 'Active',
    inactive: 'Inactive / deleted',
    allCategories: 'All categories',
    keyboard: 'Keyboards',
    mouse: 'Mice',
    accessory: 'Accessories',
    product: 'Product',
    sku: 'Seller SKU',
    asin: 'ASIN',
    category: 'Category',
    status: 'Listing status',
    sales7: '7D sales',
    sales30: '30D sales',
    sales90: '90D sales',
    previous: 'Previous period',
    available: 'Available',
    daysCover: 'Days of cover',
    actions: 'Actions',
    rank: 'Rank',
    dashboard: 'Dashboard',
    open: 'Open',
    loading: 'Loading data…',
    noData: 'No matching products',
    noSync: 'No successful sync yet',
    updated: 'Last successful sync',
    refresh: 'Refresh data',
    signOut: 'Sign out',
    signIn: 'Sign in',
    partner: 'Partner access',
    password: 'Enter access password',
    loginError: 'Login failed',
    zero: 'Zero sales',
    tracked: 'Products tracked',
    salesByMarket: 'Sales by market',
    marketNote: 'US and AU are reported separately. Units are not revenue.',
    storeBreakdown: 'US store breakdown',
    storeNote: 'Select a store to inspect its products and performance.',
    attention: 'Attention required',
    watchEmpty: 'No watched products yet. Add products from the catalog.',
    addWatch: 'Add to watchlist',
    removeWatch: 'Remove',
    compareHint: 'Select up to five products in Product Catalog to compare them here.',
    addCompare: 'Add to comparison',
    removeCompare: 'Remove from comparison',
    clear: 'Clear selection',
    inventoryHealth: 'Inventory health',
    noInventory: 'Inventory data unavailable',
    zeroStock: 'Zero sales with stock',
    inactiveStock: 'Inactive listings with stock',
    syncStatus: 'Market sync status',
    lastRun: 'Last successful run',
    statusLabel: 'Status',
    successful: 'Successful',
    failed: 'Failed',
    running: 'Running',
    notSynced: 'Not synced',
    syncReadOnly: 'Sync status is read-only. Run sync from the protected admin workflow.',
    language: 'Language',
    currency: 'Reporting currency',
    globalNoSum: 'USD and AUD are never added together.',
    marketUnavailable: 'This market has not completed a successful sync.',
    salesTrend: 'Sales trend by product',
    topProducts: 'Top products by units sold',
    period: 'Period',
    days7: '7 days',
    days30: '30 days',
    days90: '90 days',
    totalCatalog: 'Catalog items',
    activeListings: 'Active listings',
    zero7: 'Zero sales · 7D',
    lowCover: 'Low stock alerts',
    storeId: 'Store ID',
    viewStore: 'View store',
    savedLocal: 'Watchlist is saved in this browser.',
    searchEmpty: 'Try changing your search or filters.',
    reservedNote: 'Reserved quantities are shown separately from available FBA stock.',
    footer: 'Internal Keychron operations data · Market and currency remain separate.',
    compareLimit: 'You can compare up to five products.',
    remove: 'Remove',
    selected: 'Selected products',
    noCompare: 'No products selected for comparison.',
    marketColumn: 'Market'
  },

  zh: {
    brandSub: '全球运营管理中心',
    global: '全球经营总览',
    catalog: '商品目录',
    watchlist: '重点关注商品',
    compare: '商品对比',
    sales: '销售分析',
    storeAnalysis: '店铺表现',
    trends: 'SKU 销售趋势',
    inventory: 'FBA 库存管理',
    alerts: '库存预警',
    zeroSales: '零销量与滞销商品',
    usStores: '美国店铺管理',
    auStore: '澳洲店铺',
    sync: '同步中心',
    logs: '同步日志',
    settings: '设置与权限',
    overview: '经营概览',
    market: '市场',
    store: '店铺',
    allUS: '美国四店铺合计',
    us: '美国站',
    au: '澳洲站',
    globalMarket: '全球',
    products: '商品数量',
    units7: '销量 · 7天',
    units30: '销量 · 30天',
    units90: '销量 · 90天',
    stock: 'FBA 可售库存',
    reserved: '预留库存',
    low: '低库存',
    out: '缺货',
    healthy: '库存健康',
    unknown: '未知',
    search: '搜索 SKU、ASIN 或商品名称',
    allStatuses: '全部状态',
    active: '在售',
    inactive: '停售 / 已删除',
    allCategories: '全部分类',
    keyboard: '键盘',
    mouse: '鼠标',
    accessory: '配件',
    product: '商品',
    sku: 'Seller SKU',
    asin: 'ASIN',
    category: '分类',
    status: 'Listing 状态',
    sales7: '7天销量',
    sales30: '30天销量',
    sales90: '90天销量',
    previous: '上一周期',
    available: '可售库存',
    daysCover: '库存覆盖天数',
    actions: '操作',
    rank: '排名',
    dashboard: '总览',
    open: '查看',
    loading: '正在加载数据…',
    noData: '没有符合条件的商品',
    noSync: '尚无成功同步记录',
    updated: '最近成功同步',
    refresh: '刷新数据',
    signOut: '退出登录',
    signIn: '登录',
    partner: '合作伙伴登录',
    password: '请输入访问密码',
    loginError: '登录失败',
    zero: '零销量',
    tracked: '跟踪商品',
    salesByMarket: '各市场销量',
    marketNote: '美国与澳洲分别统计。销量单位不代表销售额。',
    storeBreakdown: '美国店铺表现',
    storeNote: '选择店铺查看该店铺商品与表现。',
    attention: '需要关注',
    watchEmpty: '暂无关注商品。请从商品目录添加。',
    addWatch: '加入关注',
    removeWatch: '移除',
    compareHint: '在商品目录中选择最多五个商品进行对比。',
    addCompare: '加入对比',
    removeCompare: '移出对比',
    clear: '清空选择',
    inventoryHealth: '库存健康度',
    noInventory: '暂无库存数据',
    zeroStock: '有库存但零销量',
    inactiveStock: '停售但仍有库存',
    syncStatus: '市场同步状态',
    lastRun: '最近成功同步',
    statusLabel: '状态',
    successful: '成功',
    failed: '失败',
    running: '运行中',
    notSynced: '尚未同步',
    syncReadOnly: '当前版本仅展示同步状态，请通过受保护的管理员流程执行同步。',
    language: '语言',
    currency: '报表币种',
    globalNoSum: 'USD 与 AUD 不会直接相加。',
    marketUnavailable: '该市场尚无成功同步记录。',
    salesTrend: '商品销量趋势',
    topProducts: '商品销量排行',
    period: '周期',
    days7: '7天',
    days30: '30天',
    days90: '90天',
    totalCatalog: '目录商品数',
    activeListings: '在售商品',
    zero7: '零销量 · 7天',
    lowCover: '低库存预警',
    storeId: '店铺 ID',
    viewStore: '查看店铺',
    savedLocal: '关注清单保存在当前浏览器。',
    searchEmpty: '请尝试修改搜索词或筛选条件。',
    reservedNote: '预留库存与 FBA 可售库存分开显示。',
    footer: 'Keychron 内部运营数据 · 市场与币种独立统计。',
    compareLimit: '最多同时对比 5 个商品。',
    remove: '移除',
    selected: '已选择商品',
    noCompare: '尚未选择对比商品。',
    marketColumn: '市场'
  }
};

const fmt = value =>
  value == null
    ? '—'
    : Number(value).toLocaleString('en-US', {
        maximumFractionDigits: 1
      });

const getSales = (item, period) =>
  Number(
    period === 7
      ? item.sales7
      : period === 90
        ? item.sales90
        : item.sales30
  ) || 0;

function Login({ lang, setLang, onLogin }) {
  const t = TEXT[lang];
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t.loginError);
      }

      onLogin();
    } catch (err) {
      setError(err.message);
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
            <Languages size={15}/>
            {lang.toUpperCase()}
          </button>
        </div>

        <h1>{t.partner}</h1>
        <p>Global Operations Intelligence · V4.1</p>
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

function Metric({ label, value, icon: Icon, tone = 'blue' }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}>
        <Icon size={19}/>
      </div>
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function StatusPill({ item, t }) {
  const status = item.status || 'unknown';

  const label =
    status === 'stockout' ? t.out :
    status === 'low' ? t.low :
    status === 'healthy' ? t.healthy :
    t.unknown;

  return (
    <span className={`status-pill ${status}`}>
      {label}
    </span>
  );
}

function ProductTable({
  items,
  t,
  watched,
  compared,
  onWatch,
  onCompare,
  showStore = false
}) {
  if (!items.length) {
    return (
      <div className="empty-state">
        <Package size={26}/>
        <strong>{t.noData}</strong>
        <span>{t.searchEmpty}</span>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t.product}</th>
            {showStore && <th>{t.store}</th>}
            <th>{t.category}</th>
            <th>{t.sales7}</th>
            <th>{t.sales30}</th>
            <th>{t.sales90}</th>
            <th>{t.available}</th>
            <th>{t.reserved}</th>
            <th>{t.daysCover}</th>
            <th>{t.status}</th>
            <th>{t.actions}</th>
          </tr>
        </thead>

        <tbody>
          {items.map(item => {
            const key = item.id ||
              `${item.marketCode}|${item.shopId}|${item.asin}|${item.sku}`;

            return (
              <tr key={key}>
                <td>
                  <div className="product-cell">
                    <div className="product-thumb">
                      {item.imageUrl
                        ? (
                          <img
                            src={item.imageUrl}
                            alt=""
                            onError={e => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )
                        : <Package size={18}/>
                      }
                    </div>

                    <div className="product-name">
                      <strong>{item.title || item.sku || '—'}</strong>
                      <span>{item.sku || '—'} · {item.asin || '—'}</span>
                    </div>
                  </div>
                </td>

                {showStore && (
                  <td>
                    <span className="store-chip">{item.shopId}</span>
                  </td>
                )}

                <td>{item.category || '—'}</td>
                <td className="numeric">{fmt(item.sales7)}</td>
                <td className="numeric">{fmt(item.sales30)}</td>
                <td className="numeric">{fmt(item.sales90)}</td>
                <td className="numeric">{fmt(item.availableStock)}</td>
                <td className="numeric">{fmt(item.reservedStock)}</td>
                <td className="numeric">
                  {item.daysOfCover == null
                    ? '—'
                    : `${fmt(item.daysOfCover)}d`}
                </td>
                <td><StatusPill item={item} t={t}/></td>

                <td>
                  <div className="row-actions">
                    <button
                      className={watched.has(key)
                        ? 'mini-action selected'
                        : 'mini-action'}
                      title={t.addWatch}
                      onClick={() => onWatch(key, item)}
                    >
                      <Star
                        size={15}
                        fill={watched.has(key) ? 'currentColor' : 'none'}
                      />
                    </button>

                    <button
                      className={compared.has(key)
                        ? 'mini-action selected'
                        : 'mini-action'}
                      title={t.addCompare}
                      onClick={() => onCompare(key, item)}
                    >
                      <GitCompare size={15}/>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ComparisonTable({ records, t, onRemove, onClear }) {
  if (!records.length) {
    return (
      <div className="empty-state">
        <GitCompare size={26}/>
        <strong>{t.noCompare}</strong>
        <span>{t.compareHint}</span>
      </div>
    );
  }

  const rows = [
    { label: t.sku, field: 'sku' },
    { label: t.asin, field: 'asin' },
    { label: t.marketColumn, field: 'marketCode' },
    { label: t.store, field: 'shopId' },
    { label: t.sales7, field: 'sales7' },
    { label: t.sales30, field: 'sales30' },
    { label: t.sales90, field: 'sales90' },
    { label: t.available, field: 'availableStock' },
    { label: t.reserved, field: 'reservedStock' },
    { label: t.daysCover, field: 'daysOfCover' },
    { label: t.status, field: 'status' }
  ];

  return (
    <div className="section-card">
      <div className="section-heading">
        <div>
          <h2>{t.selected} · {records.length}/5</h2>
          <p>{t.compareHint}</p>
        </div>
        <button className="secondary-button" onClick={onClear}>
          {t.clear}
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t.product}</th>
              {records.map(record => (
                <th key={record.key}>
                  <div className="product-name">
                    <strong>{record.item.title || record.item.sku}</strong>
                    <span>{record.item.sku}</span>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => onRemove(record.key)}
                  >
                    {t.remove}
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map(row => (
              <tr key={row.field}>
                <td><strong>{row.label}</strong></td>
                {records.map(record => {
                  const value = record.item[row.field];

                  return (
                    <td key={record.key} className="numeric">
                      {row.field === 'daysOfCover'
                        ? value == null ? '—' : `${fmt(value)}d`
                        : row.field === 'status'
                          ? value || 'unknown'
                          : value == null ? '—' : fmtOrText(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmtOrText(value) {
  return typeof value === 'number' ? fmt(value) : String(value);
}

function App() {
  const [lang, setLang] = useState(
    () => localStorage.getItem(LANG_KEY) || 'en'
  );

  const t = TEXT[lang] || TEXT.en;

  const [authed, setAuthed] = useState(false);
  const [activePage, setActivePage] = useState('dashboard');
  const [market, setMarket] = useState('GLOBAL');
  const [selectedStore, setSelectedStore] = useState('all');

  const [marketData, setMarketData] = useState({
    US: null,
    AU: null
  });

  const [overview, setOverview] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [period, setPeriod] = useState(30);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [mobileNav, setMobileNav] = useState(false);

  const [watchRecords, setWatchRecords] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
    } catch {
      return [];
    }
  });

  const [compareRecords, setCompareRecords] = useState([]);

  const watched = useMemo(
    () => new Set(watchRecords.map(x => x.key)),
    [watchRecords]
  );

  const compared = useMemo(
    () => new Set(compareRecords.map(x => x.key)),
    [compareRecords]
  );

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem(WATCH_KEY, JSON.stringify(watchRecords));
  }, [watchRecords]);

  async function requestJson(url) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store'
    });

    if (response.status === 401) {
      setAuthed(false);
      throw new Error('Authentication required');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  }

  async function loadCurrent() {
    if (!authed) return;

    setBusy(true);
    setError('');

    try {
      if (market === 'GLOBAL') {
        const [ov, usStatus, auStatus] = await Promise.all([
          requestJson('/api/partner/global-overview'),
          requestJson('/api/partner/status?market=US'),
          requestJson('/api/partner/status?market=AU')
        ]);

        setOverview(ov);
        setStatuses({ US: usStatus, AU: auStatus });
      } else {
        const [dashboard, status] = await Promise.all([
          requestJson(`/api/partner/dashboard?market=${market}`),
          requestJson(`/api/partner/status?market=${market}`)
        ]);

        setMarketData(old => ({
          ...old,
          [market]: dashboard
        }));

        setStatuses(old => ({
          ...old,
          [market]: status
        }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    fetch('/api/auth/me', {
      credentials: 'same-origin'
    })
      .then(response => {
        if (response.ok) setAuthed(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (authed) loadCurrent();
  }, [authed, market]);

  const currentMarket = market === 'GLOBAL'
    ? null
    : marketData[market];

  const marketItems = currentMarket?.items || [];

  const scopedItems = (
    market === 'US' && selectedStore !== 'all'
  )
    ? marketItems.filter(
        item => String(item.shopId) === selectedStore
      )
    : marketItems;

  const filteredItems = useMemo(() => {
    return scopedItems.filter(item => {
      const text = query.trim().toLowerCase();
      const cat = String(item.category || '').toLowerCase();

      const categoryOk =
        category === 'all' ||
        (category === 'keyboard' && cat.includes('keyboard')) ||
        (category === 'mouse' && cat.includes('mouse')) ||
        (
          category === 'accessory' &&
          !cat.includes('keyboard') &&
          !cat.includes('mouse')
        );

      const statusOk =
        statusFilter === 'all' ||
        (statusFilter === 'active' && !item.isInactive) ||
        (statusFilter === 'inactive' && item.isInactive) ||
        (statusFilter === 'low' && item.status === 'low') ||
        (statusFilter === 'stockout' && item.status === 'stockout') ||
        (statusFilter === 'zero' && !item.sales30);

      const textOk =
        !text ||
        [
          item.title,
          item.sku,
          item.localSku,
          item.asin,
          item.shopId
        ].some(value =>
          String(value || '').toLowerCase().includes(text)
        );

      return categoryOk && statusOk && textOk;
    });
  }, [scopedItems, query, category, statusFilter]);

  const activeNav = [
    {
      group: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: t.global, icon: LayoutDashboard }
      ]
    },
    {
      group: 'PRODUCT MANAGEMENT',
      items: [
        { id: 'catalog', label: t.catalog, icon: Package },
        { id: 'watchlist', label: t.watchlist, icon: Star },
        { id: 'compare', label: t.compare, icon: GitCompare }
      ]
    },
    {
      group: 'SALES ANALYTICS',
      items: [
        { id: 'sales', label: t.sales, icon: BarChart3 },
        { id: 'stores', label: t.storeAnalysis, icon: Store },
        { id: 'trends', label: t.trends, icon: TrendingUp }
      ]
    },
    {
      group: 'INVENTORY',
      items: [
        { id: 'inventory', label: t.inventory, icon: Warehouse },
        { id: 'alerts', label: t.alerts, icon: AlertTriangle },
        { id: 'zero', label: t.zeroSales, icon: PackageX }
      ]
    },
    {
      group: 'MARKETS',
      items: [
        { id: 'us', label: t.usStores, icon: Flag },
        { id: 'au', label: t.auStore, icon: Flag }
      ]
    },
    {
      group: 'SYSTEM',
      items: [
        { id: 'sync', label: t.sync, icon: RefreshCw },
        { id: 'logs', label: t.logs, icon: FileText },
        { id: 'settings', label: t.settings, icon: Settings }
      ]
    }
  ];

  function choosePage(id) {
    setActivePage(id);
    setMobileNav(false);
    setQuery('');
    setCategory('all');
    setStatusFilter('all');

    if (id === 'us' || id === 'stores') {
      setMarket('US');
      setSelectedStore('all');
    } else if (id === 'au') {
      setMarket('AU');
      setSelectedStore('all');
    } else if (id === 'dashboard') {
      setMarket('GLOBAL');
      setSelectedStore('all');
    } else if (
      ['catalog', 'watchlist', 'compare', 'sales', 'trends',
        'inventory', 'alerts', 'zero'].includes(id) &&
      market === 'GLOBAL'
    ) {
      setMarket('US');
      setSelectedStore('all');
    }
  }

  function toggleWatch(key, item) {
    setWatchRecords(old =>
      old.some(record => record.key === key)
        ? old.filter(record => record.key !== key)
        : [...old, {
            key,
            item,
            savedAt: new Date().toISOString()
          }]
    );
  }

  function toggleCompare(key, item) {
    setCompareRecords(old => {
      if (old.some(record => record.key === key)) {
        return old.filter(record => record.key !== key);
      }

      if (old.length >= 5) {
        setError(t.compareLimit);
        return old;
      }

      return [...old, { key, item }];
    });
  }

  async function logout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin'
    });

    setAuthed(false);
    setOverview(null);
    setMarketData({ US: null, AU: null });
  }

  const displayItems = useMemo(() => {
    if (activePage === 'watchlist') {
      return watchRecords
        .map(record => record.item)
        .filter(Boolean)
        .filter(item =>
          item.marketCode === market || market === 'GLOBAL'
        );
    }

    if (activePage === 'zero') {
      return filteredItems.filter(
        item =>
          !item.sales7 &&
          !item.sales30 &&
          (item.availableStock || 0) > 0
      );
    }

    if (activePage === 'alerts') {
      return filteredItems.filter(
        item => ['low', 'stockout'].includes(item.status)
      );
    }

    if (activePage === 'inventory') {
      return [...filteredItems].sort(
        (a, b) =>
          (a.daysOfCover ?? Infinity) -
          (b.daysOfCover ?? Infinity)
      );
    }

    if (activePage === 'sales' || activePage === 'trends') {
      return [...filteredItems].sort(
        (a, b) => getSales(b, period) - getSales(a, period)
      );
    }

    return filteredItems;
  }, [activePage, watchRecords, market, filteredItems, period]);

  if (!authed) {
    return (
      <Login
        lang={lang}
        setLang={setLang}
        onLogin={() => setAuthed(true)}
      />
    );
  }

  const pageTitle =
    activeNav.flatMap(group => group.items)
      .find(item => item.id === activePage)?.label || t.global;

  const currentCurrency = market === 'AU' ? 'AUD' : 'USD';

  const sum = (arr, field) =>
    arr.reduce(
      (total, item) => total + (Number(item[field]) || 0),
      0
    );

  const alertsCount = scopedItems.filter(
    item => ['low', 'stockout'].includes(item.status)
  ).length;

  const topProducts = [...scopedItems]
    .sort((a, b) => b.sales30 - a.sales30)
    .slice(0, 10)
    .map(item => ({
      name: item.sku || item.title,
      units: item.sales30 || 0
    }));

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brandmark">K</div>
          <div>
            <strong>KEYCHRON</strong>
            <span>{t.brandSub}</span>
          </div>
          <button
            className="mobile-close"
            onClick={() => setMobileNav(false)}
          >
            <X size={18}/>
          </button>
        </div>

        <div className="sidebar-scroll">
          {activeNav.map(group => (
            <div className="nav-group" key={group.group}>
              <div className="nav-caption">{group.group}</div>

              {group.items.map(item => (
                <button
                  key={item.id}
                  className={`nav-item ${
                    activePage === item.id ? 'active' : ''
                  }`}
                  onClick={() => choosePage(item.id)}
                >
                  <item.icon size={17}/>
                  <span>{item.label}</span>

                  {item.id === 'alerts' && alertsCount > 0 && (
                    <em>{alertsCount}</em>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="user-avatar">K</div>
          <div className="user-meta">
            <strong>Keychron Partner</strong>
            <span>Operations Workspace</span>
          </div>
          <button
            className="sidebar-logout"
            onClick={logout}
            title={t.signOut}
          >
            <LogOut size={17}/>
          </button>
        </div>
      </aside>

      {mobileNav && (
        <button
          className="nav-scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Close navigation"
        />
      )}

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20}/>
            </button>
            <div className="breadcrumb">
              Workspace <span>/</span> <strong>{pageTitle}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <span className="market-indicator">
              <i/>
              {market === 'GLOBAL'
                ? 'GLOBAL'
                : `${market} · ${currentCurrency}`}
            </span>

            <button
              className="topbar-button"
              onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
            >
              <Languages size={17}/>
              <span>{lang.toUpperCase()}</span>
            </button>

            <button
              className="topbar-button"
              onClick={loadCurrent}
              disabled={busy}
            >
              <RefreshCw size={17} className={busy ? 'spin' : ''}/>
              <span>{t.refresh}</span>
            </button>
          </div>
        </header>

        <main className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                KEYCHRON · {
                  market === 'GLOBAL'
                    ? 'GLOBAL OPERATIONS'
                    : market === 'US'
                      ? 'UNITED STATES'
                      : 'AUSTRALIA'
                }
              </div>
              <h1>{pageTitle}</h1>
              <p>
                {activePage === 'dashboard'
                  ? t.overview
                  : `${pageTitle} · ${market} / ${currentCurrency}`}
              </p>
            </div>

            <div className="heading-meta">
              <span>{t.updated}</span>
              <strong>
                {market === 'GLOBAL'
                  ? overview?.generatedAt
                    ? new Date(overview.generatedAt).toLocaleString()
                    : '—'
                  : marketData[market]?.meta?.generatedAt
                    ? new Date(
                        marketData[market].meta.generatedAt
                      ).toLocaleString()
                    : '—'}
              </strong>
            </div>
          </div>

          {error && (
            <div className="error banner">
              <CircleAlert size={17}/>
              {error}
              <button onClick={() => setError('')}>
                <X size={15}/>
              </button>
            </div>
          )}

          <section className="global-filter">
            <div className="filter-label">
              <Globe size={16}/>
              {t.market}
            </div>

            <div className="segmented">
              <button
                className={market === 'GLOBAL' ? 'active' : ''}
                onClick={() => {
                  setMarket('GLOBAL');
                  setActivePage('dashboard');
                }}
              >
                Global
              </button>

              <button
                className={market === 'US' ? 'active' : ''}
                onClick={() => {
                  setMarket('US');
                  setActivePage('us');
                  setSelectedStore('all');
                }}
              >
                US · USD
              </button>

              <button
                className={market === 'AU' ? 'active' : ''}
                onClick={() => {
                  setMarket('AU');
                  setActivePage('au');
                }}
              >
                AU · AUD
              </button>
            </div>

            {market === 'US' && (
              <label className="store-select">
                <Store size={15}/>
                <select
                  value={selectedStore}
                  onChange={e => setSelectedStore(e.target.value)}
                >
                  <option value="all">{t.allUS}</option>
                  {STORE_IDS.map(id => (
                    <option value={id} key={id}>
                      Store {id}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14}/>
              </label>
            )}
          </section>

          {activePage === 'dashboard' && market === 'GLOBAL' && (
            <>
              <section className="market-summary-grid">
                {['US', 'AU'].map(code => {
                  const m = overview?.markets?.[code];
                  const data = m?.data || {};

                  return (
                    <article className="market-summary-card" key={code}>
                      <div className="summary-top">
                        <span className="market-flag">
                          <Flag size={19}/>
                        </span>
                        <span className="market-code">
                          {code} · {m?.currencyCode ||
                            (code === 'US' ? 'USD' : 'AUD')}
                        </span>
                      </div>

                      <h2>{code === 'US' ? t.us : t.au}</h2>

                      <div className="summary-metrics">
                        <div>
                          <span>{t.products}</span>
                          <strong>{m?.available ? fmt(data.catalogCount) : '—'}</strong>
                        </div>
                        <div>
                          <span>{t.units7}</span>
                          <strong>{m?.available ? fmt(data.sales7) : '—'}</strong>
                        </div>
                        <div>
                          <span>{t.units30}</span>
                          <strong>{m?.available ? fmt(data.sales30) : '—'}</strong>
                        </div>
                        <div>
                          <span>{t.units90}</span>
                          <strong>{m?.available ? fmt(data.sales90) : '—'}</strong>
                        </div>
                      </div>

                      <div className="summary-footer">
                        <span className={m?.available ? 'live-label' : 'offline-label'}>
                          {m?.available ? t.successful : t.notSynced}
                        </span>
                        <button onClick={() => {
                          setMarket(code);
                          setActivePage(code === 'US' ? 'us' : 'au');
                          setSelectedStore('all');
                        }}>
                          {t.open} <ArrowUpRight size={15}/>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>

              <section className="section-card">
                <div className="section-heading">
                  <div>
                    <h2>{t.storeBreakdown}</h2>
                    <p>{t.storeNote}</p>
                  </div>
                  <span className="section-tag">4 US STORES</span>
                </div>

                <div className="store-grid">
                  {STORE_IDS.map(id => {
                    const count =
                      overview?.markets?.US?.shopCounts?.find(
                        x => String(x.shop_id) === id
                      )?.count ?? '—';

                    return (
                      <button
                        className="store-tile"
                        key={id}
                        onClick={() => {
                          setMarket('US');
                          setSelectedStore(id);
                          setActivePage('stores');
                        }}
                      >
                        <span className="store-tile-icon">
                          <Store size={18}/>
                        </span>
                        <span>
                          <strong>Store {id}</strong>
                          <small>{fmt(count)} {t.products}</small>
                        </span>
                        <ArrowUpRight size={16}/>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="section-card">
                <div className="section-heading">
                  <div>
                    <h2>{t.attention}</h2>
                    <p>{t.marketNote}</p>
                  </div>
                </div>
                <div className="attention-grid">
                  <div>
                    <AlertTriangle size={18}/>
                    <span>{t.low}</span>
                    <strong>—</strong>
                  </div>
                  <div>
                    <PackageX size={18}/>
                    <span>{t.zero}</span>
                    <strong>—</strong>
                  </div>
                  <div>
                    <Warehouse size={18}/>
                    <span>{t.stock}</span>
                    <strong>US / AU</strong>
                  </div>
                </div>
              </section>
            </>
          )}

          {activePage === 'compare' && (
            <ComparisonTable
              records={compareRecords}
              t={t}
              onRemove={key => toggleCompare(
                key,
                compareRecords.find(x => x.key === key)?.item
              )}
              onClear={() => setCompareRecords([])}
            />
          )}

          {activePage === 'watchlist' && (
            <section className="section-card">
              <div className="section-heading">
                <div>
                  <h2>{t.watchlist}</h2>
                  <p>{t.savedLocal} · {watchRecords.length}</p>
                </div>
              </div>

              <ProductTable
                items={displayItems}
                t={t}
                watched={watched}
                compared={compared}
                onWatch={toggleWatch}
                onCompare={toggleCompare}
                showStore
              />
            </section>
          )}

          {activePage !== 'dashboard' &&
            !['sync', 'logs', 'settings', 'compare', 'watchlist'].includes(activePage) && (
              <>
                {market === 'GLOBAL' ? (
                  <div className="notice-banner">
                    Select US or AU to view market-level data.
                  </div>
                ) : (
                  <>
                    <section className="metric-grid">
                      <Metric
                        label={t.products}
                        value={fmt(scopedItems.length)}
                        icon={Package}
                      />
                      <Metric
                        label={t.units7}
                        value={fmt(sum(scopedItems, 'sales7'))}
                        icon={TrendingUp}
                      />
                      <Metric
                        label={t.stock}
                        value={fmt(sum(scopedItems, 'availableStock'))}
                        icon={Boxes}
                      />
                      <Metric
                        label={t.lowCover}
                        value={fmt(alertsCount)}
                        icon={AlertTriangle}
                        tone={alertsCount ? 'orange' : 'blue'}
                      />
                    </section>

                    {['catalog', 'sales', 'trends', 'inventory', 'alerts', 'zero', 'us', 'au', 'stores'].includes(activePage) && (
                      <section className="section-card">
                        <div className="section-heading">
                          <div>
                            <h2>
                              {activePage === 'catalog' ? t.catalog :
                                activePage === 'inventory' ? t.inventory :
                                activePage === 'alerts' ? t.alerts :
                                activePage === 'zero' ? t.zeroSales :
                                activePage === 'stores' || activePage === 'us' || activePage === 'au' ? t.storeAnalysis :
                                activePage === 'trends' ? t.trends : t.sales}
                            </h2>
                            <p>{fmt(displayItems.length)} products · {market} / {currentCurrency}</p>
                          </div>

                          <div className="table-filters">
                            <label className="search-box">
                              <Search size={16}/>
                              <input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder={t.search}
                              />
                            </label>

                            <select
                              value={statusFilter}
                              onChange={e => setStatusFilter(e.target.value)}
                            >
                              <option value="all">{t.allStatuses}</option>
                              <option value="active">{t.active}</option>
                              <option value="inactive">{t.inactive}</option>
                              <option value="low">{t.low}</option>
                              <option value="stockout">{t.out}</option>
                              <option value="zero">{t.zero}</option>
                            </select>

                            <select
                              value={category}
                              onChange={e => setCategory(e.target.value)}
                            >
                              <option value="all">{t.allCategories}</option>
                              <option value="keyboard">{t.keyboard}</option>
                              <option value="mouse">{t.mouse}</option>
                              <option value="accessory">{t.accessory}</option>
                            </select>
                          </div>
                        </div>

                        <div className="period-toolbar">
                          <span>{t.period}</span>
                          {[7, 30, 90].map(p => (
                            <button
                              key={p}
                              className={period === p ? 'active' : ''}
                              onClick={() => setPeriod(p)}
                            >
                              {p}D
                            </button>
                          ))}
                        </div>

                        {activePage === 'sales' || activePage === 'trends' ? (
                          <div className="chart-area">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={topProducts}>
                                <CartesianGrid strokeDasharray="3 3"/>
                                <XAxis dataKey="name"/>
                                <YAxis/>
                                <Tooltip/>
                                <Bar dataKey="units" fill="#2775c7" radius={[5, 5, 0, 0]}/>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : null}

                        <ProductTable
                          items={displayItems}
                          t={t}
                          watched={watched}
                          compared={compared}
                          onWatch={toggleWatch}
                          onCompare={toggleCompare}
                          showStore={market === 'US' && selectedStore === 'all'}
                        />
                      </section>
                    )}
                  </>
                )}
              </>
            )}

          {(activePage === 'sync' || activePage === 'logs') && (
            <section className="section-card">
              <div className="section-heading">
                <div>
                  <h2>{t.syncStatus}</h2>
                  <p>{t.syncReadOnly}</p>
                </div>
                <Activity size={20}/>
              </div>

              <div className="sync-grid">
                {['US', 'AU'].map(code => {
                  const s = statuses[code];

                  return (
                    <div className="sync-card" key={code}>
                      <strong>{code} · {code === 'US' ? 'USD' : 'AUD'}</strong>
                      <span className={`status-pill ${
                        s?.status === 'success' ? 'healthy' :
                        s?.status === 'running' ? 'low' : 'unknown'
                      }`}>
                        {s?.status || 'not_synced'}
                      </span>
                      <small>
                        {t.lastRun}: {s?.lastSuccessfulSync
                          ? new Date(s.lastSuccessfulSync).toLocaleString()
                          : '—'}
                      </small>
                      <small>{t.statusLabel}: {s?.status || t.notSynced}</small>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {activePage === 'settings' && (
            <section className="section-card">
              <div className="section-heading">
                <div>
                  <h2>{t.settings}</h2>
                  <p>{t.language}: {lang.toUpperCase()}</p>
                </div>
                <Settings size={20}/>
              </div>
              <p className="market-disclaimer">{t.footer}</p>
            </section>
          )}

          {busy && (
            <div className="loading-line">
              <RefreshCw size={15} className="spin"/>
              {t.loading}
            </div>
          )}

          <footer className="app-footer">{t.footer}</footer>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
