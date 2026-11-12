import 'dotenv/config';
export const config = {
  port: Number(process.env.PORT || 8080),
  mcpUrl: process.env.LINGXING_MCP_URL || 'https://openmcp.lingxing.com/mcp-servers/lingxing-mcp',
  mcpKey: process.env.LINGXING_MCP_KEY || '',
  adminKey: process.env.ADMIN_API_KEY || '',
  partnerKey: process.env.PARTNER_API_KEY || '',
  partnerPassword: process.env.PARTNER_PASSWORD || '',
  sessionDays: Number(process.env.PARTNER_SESSION_DAYS || 7),
  dbPath: process.env.DB_PATH || './data/dashboard.sqlite',
  cron: process.env.SYNC_CRON || '30 3 * * *',
  timezone: process.env.SYNC_TIMEZONE || 'America/Los_Angeles',
  usShopIds: JSON.parse(process.env.US_SHOP_IDS_JSON || '["2177","2178","2179","7178"]'),
  brandId: String(process.env.BRAND_ID || '304'),
  marketId: String(process.env.MARKET_ID || '1'),
  topNPerShop: Number(process.env.TOP_N_PER_SHOP || 50)
};
export function assertConfig() {
  const missing = [];
  if (!config.mcpKey) missing.push('LINGXING_MCP_KEY');
  if (!config.adminKey) missing.push('ADMIN_API_KEY');
  if (!config.partnerPassword && !config.partnerKey) missing.push('PARTNER_PASSWORD (or legacy PARTNER_API_KEY)');
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}
