import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, assertConfig } from './config.js';
import { latestSnapshot, latestStatus, createPartnerSession, hasPartnerSession, deletePartnerSession } from './db.js';
import { listLingxingTools } from './mcp.js';
import { runSync } from './sync.js';

assertConfig();
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(cors({ origin: (process.env.PARTNER_ALLOWED_ORIGINS || '').split(',').filter(Boolean), credentials: true }));
const COOKIE = 'partner_session';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('='); return [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
  }));
}
function adminAuth(req, res, next) {
  const supplied = req.header('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!safeEqual(supplied, config.adminKey)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
function partnerAuth(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token && hasPartnerSession(hash(token))) return next();
  // Legacy bearer remains available only for private server-to-server migration/testing.
  const bearer = req.header('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (config.partnerKey && safeEqual(bearer, config.partnerKey)) return next();
  return res.status(401).json({ error: 'Authentication required' });
}
const loginAttempts = new Map();
app.get('/health', (_req, res) => res.json({ ok: true }));
app.post('/api/auth/login', (req, res) => {
  const ip = req.ip || 'unknown'; const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
  if (now > attempt.until) { attempt.count = 0; attempt.until = now + 15 * 60 * 1000; }
  if (attempt.count >= 8) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  const password = String(req.body?.password || '');
  if (!config.partnerPassword || !safeEqual(password, config.partnerPassword)) {
    attempt.count += 1; loginAttempts.set(ip, attempt);
    return res.status(401).json({ error: 'Incorrect password' });
  }
  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionDays * 86400000);
  createPartnerSession(hash(token), expiresAt.toISOString());
  res.cookie(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires: expiresAt });
  res.json({ ok: true, expiresAt: expiresAt.toISOString() });
});
app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) deletePartnerSession(hash(token));
  res.clearCookie(COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  res.json({ ok: true });
});
app.get('/api/auth/me', partnerAuth, (_req, res) => res.json({ authenticated: true }));
app.get('/api/partner/dashboard', partnerAuth, (_req, res) => {
  const snapshot = latestSnapshot();
  if (!snapshot) return res.status(503).json({ error: 'No successful data snapshot yet', status: latestStatus() });
  const items = snapshot.payload.items.map(x => ({
    id:x.id, sku:x.sku, localSku:x.localSku, asin:x.asin, title:x.title, imageUrl:x.imageUrl,
    category:x.category, listingStatus:x.listingStatus, sales7:x.sales7, sales30:x.sales30,
    previousSales7:x.previousSales7, previousSales30:x.previousSales30,
    salesGrowth7:x.salesGrowth7, salesGrowth30:x.salesGrowth30,
    availableStock:x.availableStock, reservedStock:x.reservedStock, dailyVelocity:x.dailyVelocity,
    daysOfCover:x.daysOfCover, status:x.status, rank:x.rank,
    previousRank:x.previousRank, rankChange:x.rankChange
  }));
  const sourceMeta = snapshot.payload.meta || {};
  res.json({ meta: {
    source: sourceMeta.source, brand: sourceMeta.brand, marketplace: sourceMeta.marketplace,
    timezone: sourceMeta.timezone, generatedAt: sourceMeta.generatedAt, period: sourceMeta.period,
    isMock: false, rankingDefinition: sourceMeta.rankingDefinition, shopNames: sourceMeta.shopNames,
    sourceRows: sourceMeta.sourceRows, catalogCount: sourceMeta.catalogCount, zeroSalesCount: sourceMeta.zeroSalesCount, inactiveCount: sourceMeta.inactiveCount, catalogScope: sourceMeta.catalogScope
  }, items, lastSuccessfulSync: snapshot.createdAt });
});
app.get('/api/partner/status', partnerAuth, (_req,res) => {
  const status = latestStatus();
  res.json({ status: status?.status || 'not_synced', lastSuccessfulSync: latestSnapshot()?.createdAt || null });
});
app.post('/api/admin/sync', adminAuth, async (_req,res) => {
  try { const result = await runSync(); res.json({ ok:true, count:result.items.length, generatedAt:result.meta.generatedAt }); }
  catch (e) { res.status(502).json({ ok:false, error:e.message }); }
});
app.get('/api/admin/mcp-tools', adminAuth, async (_req,res) => {
  try { res.json({ tools: await listLingxingTools() }); }
  catch (e) { res.status(502).json({ error:e.message }); }
});
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../frontend/dist');
app.use(express.static(webDist));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
cron.schedule(config.cron, () => runSync().catch(err => console.error('Scheduled sync failed:', err.message)), { timezone: config.timezone });
app.listen(config.port, () => console.log(`Keychron dashboard listening on :${config.port}; daily cron ${config.cron} (${config.timezone})`));
