# Market Sales Dashboard — V3

A same-origin React dashboard served by the existing Express service, connected to the LingXing MCP integration. The dashboard defaults to English and supports Chinese. Partner authentication uses a password exchange for a server-side, HttpOnly session cookie; no partner bearer key is embedded in the browser bundle.

## Existing Railway service upgrade

This is an in-place code upgrade for the existing `market-sales-dashboard-api` service. Keep the existing Railway project, domain, Volume mounted at `/app/data`, `LINGXING_MCP_KEY`, `ADMIN_API_KEY`, and `DB_PATH=/app/data/dashboard.sqlite`.

### Required Railway variable

Add `PARTNER_PASSWORD` with a strong password that you will share with authorised Australian agents through a secure channel. Do not commit it to GitHub or put it in frontend code.

`PARTNER_API_KEY` is no longer required for browser partner login. It may remain configured for backwards-compatible server-to-server access during migration, but the new frontend never uses it.

Recommended existing values:
- `LINGXING_MCP_URL=https://openmcp.lingxing.com/mcp-servers/lingxing-mcp`
- `SYNC_CRON=30 3 * * *`
- `SYNC_TIMEZONE=America/Los_Angeles`
- `DB_PATH=/app/data/dashboard.sqlite`

## Deploy

1. Replace repository files with this V3 project, keeping the root `Dockerfile` and `railway.json`.
2. In Railway Variables, add `PARTNER_PASSWORD` before deploying.
3. Deploy the existing service. No new Railway project or Volume is required.
4. Visit the existing Railway domain. The login page should load.
5. Sign in with `PARTNER_PASSWORD`.
6. Verify `/health` returns `{ "ok": true }` and the dashboard loads the latest snapshot.

The login endpoint is `POST /api/auth/login`; it sets a `Secure`, `HttpOnly`, `SameSite=Lax` cookie. Logout revokes the server-side session. Session records are stored in SQLite and expire after `PARTNER_SESSION_DAYS` (default 7). Login attempts are rate-limited in-process. For a multi-replica deployment, replace the in-memory rate limiter with a shared store.

## Admin endpoints

Admin operations remain protected by `Authorization: Bearer $ADMIN_API_KEY`:
- `GET /api/admin/mcp-tools`
- `POST /api/admin/sync`

Partner browser endpoints use the session cookie:
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/partner/dashboard`
- `GET /api/partner/status`

The dashboard endpoint applies an explicit public-field allowlist. Raw MCP responses, cost, profit, advertising spend, supplier and purchase data are not returned.

## Data semantics

- Brand ID `304`, Amazon US marketplace ID `1`, shops `2177`, `2178`, `2179`, `7178`.
- Sales are queried independently per shop for completed 7-day and 30-day windows; previous equal-length periods are compared.
- Inventory is bridged through ASIN and local SKU mapping. Missing stock stays `null` / `unknown`, not zero.
- Ranking is Keychron's internal Amazon US sales ranking, not Amazon Best Sellers Rank.
- Inventory is US FBA available stock, not Australian available-to-promise stock.

## Tests

```bash
cd backend && npm test
```

The frontend is built with Vite and served by Express from the same origin. This avoids exposing `PARTNER_API_KEY` in a Vite bundle and avoids CORS for the dashboard.
