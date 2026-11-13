
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';

import { config, assertConfig } from './config.js';

import {
  initDb,
  pool,
  createSession,
  hasSession,
  deleteSession,
  latestRun,
  getDashboard,
  getGlobalOverview
} from './db.js';

import { runFullSync } from './sync.js';
import { inspectMcp } from './mcp.js';

// ==========================================
// INITIALIZATION
// ==========================================

assertConfig();
await initDb();

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

const COOKIE = 'partner_session';
const VALID_MARKETS = ['US', 'AU'];

const hash = value =>
  crypto.createHash('sha256').update(value).digest('hex');

const eq = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));

  return (
    x.length === y.length &&
    crypto.timingSafeEqual(x, y)
  );
};

// ==========================================
// COOKIE PARSING
// ==========================================

function cookies(value = '') {
  return Object.fromEntries(
    value
      .split(';')
      .map(x => x.trim())
      .filter(Boolean)
      .map(x => {
        const i = x.indexOf('=');

        return [
          x.slice(0, i),
          decodeURIComponent(x.slice(i + 1))
        ];
      })
  );
}

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

function admin(req, res, next) {
  const token = (req.get('authorization') || '')
    .replace(/^Bearer\s+/i, '');

  if (!eq(token, config.adminKey)) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  next();
}

// ==========================================
// PARTNER AUTHENTICATION
// ==========================================

async function partner(req, res, next) {
  try {
    const token = cookies(
      req.headers.cookie
    )[COOKIE];

    if (
      token &&
      await hasSession(hash(token))
    ) {
      return next();
    }

    return res.status(401).json({
      error: 'Authentication required'
    });

  } catch (error) {
    console.error(
      'Partner authentication error:',
      error.message
    );

    return res.status(500).json({
      error: 'Authentication service unavailable'
    });
  }
}

// ==========================================
// MARKET VALIDATION
// ==========================================

function getMarket(value, res) {
  const market = String(value || 'US').toUpperCase();

  if (!VALID_MARKETS.includes(market)) {
    res.status(400).json({
      error: 'Invalid market. Use US or AU.'
    });

    return null;
  }

  return market;
}

// ==========================================
// SYNC LOCK
// ==========================================

let syncLock = false;

async function executeSync(marketCode = null) {
  if (syncLock) {
    const error = new Error('Sync already running');
    error.statusCode = 409;
    throw error;
  }

  syncLock = true;

  try {
    return await runFullSync(marketCode);

  } finally {
    syncLock = false;
  }
}

// ==========================================
// SYNC HTTP STATUS
// ==========================================

function syncHttpStatus(result) {
  if (!result || result.ok === false) {
    if (result?.partialSuccess) {
      return 207;
    }

    return 502;
  }

  if (result.partialSuccess) {
    return 207;
  }

  return 200;
}

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      ok: true,
      db: 'connected',
      version: '4.0.0',
      markets: ['US', 'AU']
    });

  } catch (error) {
    console.error('Health check failed:', error.message);

    res.status(503).json({
      ok: false,
      db: 'unavailable'
    });
  }
});

// ==========================================
// AUTHENTICATION
// ==========================================

const attempts = new Map();

app.post('/api/auth/login', async (req, res) => {
  try {
    const ip = req.ip || 'unknown';
    const now = Date.now();

    const a = attempts.get(ip) || {
      n: 0,
      until: now + 900000
    };

    if (now > a.until) {
      a.n = 0;
      a.until = now + 900000;
    }

    if (a.n >= 8) {
      return res.status(429).json({
        error: 'Too many attempts'
      });
    }

    if (
      !eq(
        String(req.body?.password || ''),
        config.partnerPassword
      )
    ) {
      a.n++;
      attempts.set(ip, a);

      return res.status(401).json({
        error: 'Incorrect password'
      });
    }

    attempts.delete(ip);

    const token = crypto.randomBytes(32).toString('base64url');

    const expires = new Date(
      Date.now() + config.sessionDays * 86400000
    );

    await createSession(hash(token), expires);

    res.cookie(COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires
    });

    res.json({
      ok: true,
      expiresAt: expires.toISOString()
    });

  } catch (error) {
    console.error('Login error:', error.message);

    res.status(500).json({
      error: 'Login service unavailable'
    });
  }
});

// ==========================================
// LOGOUT
// ==========================================

app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = cookies(
      req.headers.cookie
    )[COOKIE];

    if (token) {
      await deleteSession(hash(token));
    }

    res.clearCookie(COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/'
    });

    res.json({
      ok: true
    });

  } catch (error) {
    console.error('Logout error:', error.message);

    res.status(500).json({
      error: 'Logout failed'
    });
  }
});

// ==========================================
// AUTH STATUS
// ==========================================

app.get('/api/auth/me', partner, (_req, res) => {
  res.json({
    authenticated: true
  });
});

// ==========================================
// MARKET-SPECIFIC DASHBOARD
// ==========================================

// GET /api/partner/dashboard?market=US
// GET /api/partner/dashboard?market=AU

app.get(
  '/api/partner/dashboard',
  partner,
  async (req, res) => {
    try {
      const market = getMarket(req.query.market, res);

      if (!market) return;

      const dashboard = await getDashboard(market);

      if (!dashboard) {
        return res.status(503).json({
          error: `No successful ${market} sync yet`,
          market,
          available: false
        });
      }

      res.json(dashboard);

    } catch (error) {
      console.error(
        'Dashboard error:',
        error.message
      );

      res.status(500).json({
        error: 'Dashboard query failed'
      });
    }
  }
);

// ==========================================
// GLOBAL OVERVIEW
// ==========================================

app.get(
  '/api/partner/global-overview',
  partner,
  async (_req, res) => {
    try {
      const overview = await getGlobalOverview();

      res.json(overview);

    } catch (error) {
      console.error(
        'Global overview error:',
        error.message
      );

      res.status(500).json({
        error: 'Global overview query failed'
      });
    }
  }
);

// ==========================================
// MARKET SYNC STATUS
// ==========================================

// GET /api/partner/status?market=US
// GET /api/partner/status?market=AU

app.get(
  '/api/partner/status',
  partner,
  async (req, res) => {
    try {
      const market = getMarket(req.query.market, res);

      if (!market) return;

      const r = await latestRun(market);

      res.json({
        market,

        status: r?.status || 'not_synced',

        currencyCode:
          r?.currency_code ||
          config.markets[market].currency,

        lastSuccessfulSync:
          r?.finished_at || null,

        metrics:
          r?.metrics || {}
      });

    } catch (error) {
      console.error(
        'Market status error:',
        error.message
      );

      res.status(500).json({
        error: 'Status query failed'
      });
    }
  }
);

// ==========================================
// GLOBAL SYNC STATUS
// ==========================================

app.get(
  '/api/partner/global-status',
  partner,
  async (_req, res) => {
    try {
      const result = {};

      for (const market of VALID_MARKETS) {
        const r = await latestRun(market);

        result[market] = {
          status: r?.status || 'not_synced',

          currencyCode:
            config.markets[market].currency,

          lastSuccessfulSync:
            r?.finished_at || null,

          metrics:
            r?.metrics || {}
        };
      }

      res.json({
        markets: result
      });

    } catch (error) {
      console.error(
        'Global status error:',
        error.message
      );

      res.status(500).json({
        error: 'Global status query failed'
      });
    }
  }
);

// ==========================================
// ADMIN MCP TOOLS
// ==========================================

app.get(
  '/api/admin/mcp-tools',
  admin,
  async (_req, res) => {
    try {
      res.json({
        tools: await inspectMcp()
      });

    } catch (error) {
      console.error(
        'MCP inspection error:',
        error.message
      );

      res.status(502).json({
        error: error.message
      });
    }
  }
);

// ==========================================
// ADMIN MARKET SYNC
// ==========================================

// POST /api/admin/sync
// Body: {}             = all markets
// Body: {market:"US"}  = US only
// Body: {market:"AU"}  = AU only

app.post(
  '/api/admin/sync',
  admin,
  async (req, res) => {
    try {
      const requestedMarket = req.body?.market;

      let market = null;

      if (requestedMarket != null) {
        market = getMarket(requestedMarket, res);

        if (!market) return;
      }

      const result = await executeSync(market);

      const statusCode = syncHttpStatus(result);

      console.log(
        'Admin sync result:',
        JSON.stringify(result.summary || {
          market,
          ok: result.ok
        })
      );

      res.status(statusCode).json(result);

    } catch (error) {
      console.error(
        'Admin sync error:',
        error.message
      );

      res.status(error.statusCode || 502).json({
        ok: false,
        error: error.message
      });
    }
  }
);

// ==========================================
// STATIC FRONTEND
// ==========================================

const dir = path.dirname(
  fileURLToPath(import.meta.url)
);

const frontendDist = path.resolve(
  dir,
  '../../frontend/dist'
);

app.use(express.static(frontendDist));

app.get('/{*splat}', (_req, res) => {
  res.sendFile(
    path.join(frontendDist, 'index.html')
  );
});

// ==========================================
// SCHEDULED MULTI-MARKET SYNC
// ==========================================

cron.schedule(
  config.cron,
  async () => {
    if (syncLock) {
      console.log(
        'Scheduled sync skipped: another sync is running'
      );

      return;
    }

    console.log(
      '[V4] Scheduled multi-market sync started'
    );

    try {
      const result = await executeSync();

      console.log(
        '[V4] Scheduled sync result:',
        JSON.stringify(result.summary)
      );

      if (result.summary?.failed > 0) {
        console.error(
          '[V4] Some markets failed synchronization'
        );
      }

    } catch (error) {
      console.error(
        '[V4] Scheduled sync failed:',
        error.message
      );
    }
  },
  {
    timezone: config.timezone
  }
);

// ==========================================
// START SERVER
// ==========================================

app.listen(config.port, () => {
  console.log(
    `Keychron V4 Multi-Market API listening on ${config.port}`
  );

  console.log(
    'Enabled markets: US/USD, AU/AUD'
  );

  console.log(
    `Scheduled sync: ${config.cron} (${config.timezone})`
  );
});
