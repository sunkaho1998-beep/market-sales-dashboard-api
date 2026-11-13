# Keychron Sales Intelligence V4

A clean-room rebuild for four Amazon US LingXing stores, using PostgreSQL, full paginated listing ingestion, sales and FBA inventory snapshots, and password-based partner sessions.

## Important deployment boundary
V4 is a separate staging deployment. Do not replace the existing V3 service or delete its SQLite Volume. Provision a NEW Railway PostgreSQL service and a NEW V4 application service. Only cut over after real MCP schema tests, four-store reconciliation, partner-auth tests, and data validation pass.

## Environment
- `LINGXING_MCP_URL` (defaults to LingXing MCP endpoint)
- `LINGXING_MCP_KEY`
- `ADMIN_API_KEY`
- `PARTNER_PASSWORD`
- `DATABASE_URL` (Railway PostgreSQL reference variable)
- `US_SHOP_IDS_JSON` defaults to `2177,2178,2179,7178`
- `BRAND_ID=304`, `MARKET_ID=1`
- `SYNC_CRON=30 3 * * *`, `SYNC_TIMEZONE=America/Los_Angeles`

## Local
1. Provision PostgreSQL and set `DATABASE_URL`.
2. `cd backend && npm install`
3. `cd ../frontend && npm install && npm run build`
4. `cd ../backend && npm start`

## Sync
Admin endpoint: `POST /api/admin/sync`, Bearer `ADMIN_API_KEY`.
Partner login: `POST /api/auth/login` with `{ "password": "..." }`; session cookie is HttpOnly, Secure, SameSite=Lax.
Partner data: `GET /api/partner/dashboard`.
Health: `GET /health` (includes PostgreSQL connectivity only).

## Data design
- `catalog_items`: one row per shop + ASIN/MSKU identity; listings are not filtered by listing status, so inactive and zero-sales products remain represented.
- `sales_snapshots`: shop- and period-scoped 7/30-day records.
- `inventory_snapshots`: shop-scoped FBA inventory rows.
- `sync_runs`: audit trail for each sync.
- `partner_sessions`: hashed session tokens only.

## MCP reliability
Each business tool call opens a fresh MCP session, obtains the current wrapper tools, calls `help` and `search` to rediscover the business tool schema, then calls `action`. If LingXing returns its explicit stale-schema 422/code 102 response, V4 opens a new session and retries that read once. It does not blindly retry other errors.

## Caveats before production
The LingXing MCP business-tool schemas and exact response envelopes are controlled by LingXing and may change. This code must be tested against current live schemas before full sync. It deliberately stops if any configured shop has no listing rows. Verify each shop's returned total against the source ERP before partner launch. FBA inventory aggregation and cross-shop product identity should be reconciled against raw rows; do not interpret unknown stock as zero.
