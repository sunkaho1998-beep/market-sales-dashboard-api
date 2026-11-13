
import 'dotenv/config';

const usShopIds = JSON.parse(
  process.env.US_SHOP_IDS_JSON || '["2177","2178","2179","7178"]'
);

const auShopIds = JSON.parse(
  process.env.AU_SHOP_IDS_JSON || '["14119"]'
);

export const config = {
  port: Number(process.env.PORT || 8080),

  mcpUrl: process.env.LINGXING_MCP_URL ||
    'https://openmcp.lingxing.com/mcp-servers/lingxing-mcp',

  mcpKey: process.env.LINGXING_MCP_KEY || '',
  adminKey: process.env.ADMIN_API_KEY || '',
  partnerPassword: process.env.PARTNER_PASSWORD || '',
  sessionDays: Number(process.env.PARTNER_SESSION_DAYS || 7),

  databaseUrl: process.env.DATABASE_URL || '',
  cron: process.env.SYNC_CRON || '30 3 * * *',

  // Legacy default timezone
  timezone: process.env.SYNC_TIMEZONE || 'America/Los_Angeles',

  brandId: String(process.env.BRAND_ID || '304'),

  // Multi-market configuration
  markets: {
    US: {
      code: 'US',
      name: 'United States',
      country: 'US',
      currency: 'USD',
      marketId: '1',
      timezone: 'America/Los_Angeles',
      shopIds: usShopIds
    },

    AU: {
      code: 'AU',
      name: 'Australia',
      country: 'AU',
      currency: 'AUD',
      marketId: String(process.env.AU_MARKET_ID || '12'),
      timezone: 'Australia/Sydney',
      shopIds: auShopIds
    }
  },

  // Legacy US compatibility
  shopIds: usShopIds,
  marketId: String(process.env.MARKET_ID || '1'),

  listingPageSize: Number(process.env.LISTING_PAGE_SIZE || 200),
  salesPageSize: Number(process.env.SALES_PAGE_SIZE || 200),
  stockPageSize: Number(process.env.STOCK_PAGE_SIZE || 200),

  lowStockDays: Number(process.env.LOW_STOCK_DAYS || 14)
};

export function assertConfig() {
  const missing = [];

  for (const key of [
    'mcpKey',
    'adminKey',
    'partnerPassword',
    'databaseUrl'
  ]) {
    if (!config[key]) {
      missing.push(key);
    }
  }

  if (missing.length) {
    throw new Error(
      'Missing required environment variables: ' + missing.join(', ')
    );
  }

  for (const market of Object.values(config.markets)) {
    if (!market.shopIds.length) {
      throw new Error('No shops configured for market ' + market.code);
    }
  }
}
