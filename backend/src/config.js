import 'dotenv/config';
export const config={
 port:Number(process.env.PORT||8080),
 mcpUrl:process.env.LINGXING_MCP_URL||'https://openmcp.lingxing.com/mcp-servers/lingxing-mcp',
 mcpKey:process.env.LINGXING_MCP_KEY||'', adminKey:process.env.ADMIN_API_KEY||'',
 partnerPassword:process.env.PARTNER_PASSWORD||'', sessionDays:Number(process.env.PARTNER_SESSION_DAYS||7),
 databaseUrl:process.env.DATABASE_URL||'', cron:process.env.SYNC_CRON||'30 3 * * *', timezone:process.env.SYNC_TIMEZONE||'America/Los_Angeles',
 shopIds:JSON.parse(process.env.US_SHOP_IDS_JSON||'["2177","2178","2179","7178"]'), brandId:String(process.env.BRAND_ID||'304'), marketId:String(process.env.MARKET_ID||'1'),
 listingPageSize:Number(process.env.LISTING_PAGE_SIZE||200), salesPageSize:Number(process.env.SALES_PAGE_SIZE||200), stockPageSize:Number(process.env.STOCK_PAGE_SIZE||200), lowStockDays:Number(process.env.LOW_STOCK_DAYS||14)
};
export function assertConfig(){const missing=[];for(const k of ['mcpKey','adminKey','partnerPassword','databaseUrl'])if(!config[k])missing.push(({mcpKey:'LINGXING_MCP_KEY',adminKey:'ADMIN_API_KEY',partnerPassword:'PARTNER_PASSWORD',databaseUrl:'DATABASE_URL'})[k]);if(missing.length)throw new Error('Missing required environment variables: '+missing.join(', '));}
