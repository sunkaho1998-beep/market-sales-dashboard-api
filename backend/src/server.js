import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { config, assertConfig } from './config.js';
import { latestSnapshot, latestStatus } from './db.js';
import { listLingxingTools } from './mcp.js';
import { runSync } from './sync.js';

assertConfig();
const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(cors({ origin: (process.env.PARTNER_ALLOWED_ORIGINS || '').split(',').filter(Boolean) }));

function auth(expected) {
  return (req, res, next) => {
    const supplied = req.header('Authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!expected || supplied.length !== expected.length || !cryptoSafeEqual(supplied, expected)) return res.status(401).json({ error: 'Unauthorized' });
    next();
  };
}
function cryptoSafeEqual(a,b) {
  return Buffer.byteLength(a) === Buffer.byteLength(b) && (awaitImportTimingSafeEqual(a,b));
}
import { timingSafeEqual } from 'node:crypto';
function awaitImportTimingSafeEqual(a,b) { return timingSafeEqual(Buffer.from(a), Buffer.from(b)); }

app.get('/health', (_req,res) => res.json({ ok: true }));
app.get('/api/partner/dashboard', auth(config.partnerKey), (_req,res) => {
  const snapshot = latestSnapshot();
  if (!snapshot) return res.status(503).json({ error: 'No successful data snapshot yet', status: latestStatus() });
  // Explicit allowlist: never return raw MCP payloads or internal financial fields.
  const items = snapshot.payload.items.map(x => ({
    id:x.id, sku:x.sku, localSku:x.localSku, asin:x.asin, title:x.title, imageUrl:x.imageUrl,
    category:x.category, sales7:x.sales7, sales30:x.sales30,
    previousSales7:x.previousSales7, previousSales30:x.previousSales30,
    salesGrowth7:x.salesGrowth7, salesGrowth30:x.salesGrowth30,
    availableStock:x.availableStock, reservedStock:x.reservedStock, dailyVelocity:x.dailyVelocity,
    daysOfCover:x.daysOfCover, status:x.status, rank:x.rank,
    previousRank:x.previousRank, rankChange:x.rankChange
  }));
  const sourceMeta = snapshot.payload.meta || {};
  const meta = {
    source: sourceMeta.source, brand: sourceMeta.brand, marketplace: sourceMeta.marketplace,
    timezone: sourceMeta.timezone, generatedAt: sourceMeta.generatedAt,
    period: sourceMeta.period, isMock: false, rankingDefinition: sourceMeta.rankingDefinition
  };
  res.json({ meta, items, lastSuccessfulSync: snapshot.createdAt });
});
app.get('/api/partner/status', auth(config.partnerKey), (_req,res) => {
  const status = latestStatus();
  res.json({ status: status?.status || 'not_synced', lastSuccessfulSync: latestSnapshot()?.createdAt || null });
});
app.post('/api/admin/sync', auth(config.adminKey), async (_req,res) => {
  try { const result = await runSync(); res.json({ ok:true, count:result.items.length, generatedAt:result.meta.generatedAt }); }
  catch (e) { res.status(502).json({ ok:false, error:e.message }); }
});
app.get('/api/admin/mcp-tools', auth(config.adminKey), async (_req,res) => {
  try { res.json({ tools: await listLingxingTools() }); }
  catch (e) { res.status(502).json({ error:e.message }); }
});

cron.schedule(config.cron, () => runSync().catch(() => {}), { timezone: config.timezone });
app.listen(config.port, () => console.log(`Keychron partner API listening on :${config.port}; daily cron ${config.cron} (${config.timezone})`));
