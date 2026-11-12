# Keychron Amazon US Partner Dashboard — LingXing MCP connector

Updated against the uploaded WorkBuddy Stage-2 read-only test report (2026-11-12). This is a deployable backend starter, **not yet connected to the user's live ERP account**: the MCP key and hosting credentials must be supplied by the account owner.

## Verified business scope
- Brand ID: `304` (Keychron; from the LingXing brand dictionary)
- Marketplace: Amazon US, `mids=1`
- Shop IDs: `2177`, `2178`, `2179`, `7178`
- Time zone: `America/Los_Angeles`
- Sales tool: `statistics_sales_analysis_list` (not `query_product_performance_asin_lists`)
- Listing tool: `erp_listing`
- Inventory tool: `get_fba_stock_list`
- Gateway protocol: MCP `help` → `search` → `action`

## Important implementation rules
1. Sales are queried per shop (Top 50 per shop) for the last complete 7-day and 30-day windows. This prevents the largest shop from hiding smaller shops.
2. `date1.volume` is the selected period; `date2.volume` is the previous equal-length period. Values are parsed from comma-separated strings.
3. `erp_listing` uses `bid=304` and a multi-shop `sids` string. Do not combine brand-name keyword search with `bid`; the report found inconsistent totals. The `7178` single-SID Listing filter was observed to fail, so results are re-filtered by returned `sid`/`store_id`.
4. Listing is requested only for the SKU set present in the sales Top-N results, not all 8,274 records.
5. Inventory `sku` maps to Listing `local_sku`; inventory `seller_sku` maps to Listing `msku`. ASIN is the cross-table bridge.
6. Amazon `amzn.gr.*` ghost seller-SKU rows are grouped into the same local-SKU/ASIN inventory bucket. Rows with a stable `unique_id` are deduplicated before summing available stock.
7. Missing inventory matches remain `availableStock: null` / `status: unknown`; they are not falsely treated as zero-stock.
8. Partner API returns an explicit allowlist only. Never return raw MCP payloads, costs, profit, advertising spend, supplier data, or credentials.
9. Ranking is Keychron's internal US sales ranking calculated from the four connected shops. It is **not** Amazon Best Sellers Rank.

## 1. Configure
```bash
cp backend/.env.example backend/.env
```
Set `LINGXING_MCP_KEY`, `ADMIN_API_KEY`, and `PARTNER_API_KEY` in `backend/.env` or the host's secret manager. Do not send the MCP key in chat, commit `.env`, or place it in React/Vite variables.

The four shop IDs, brand ID, and marketplace ID are prefilled from the read-only report and revalidated at sync time against `get_my_sids`.

## 2. Deploy to Railway (recommended beginner path)

1. Create a private GitHub repository and upload the contents of this project folder (the `Dockerfile` and `railway.json` must be at repository root). Do not upload `.env`; `.gitignore` and `.dockerignore` exclude it.
2. In Railway, create a project with **New Project → GitHub Repo**, then select this repository. Railway detects the root `Dockerfile`.
3. In the service Variables tab, add the variables from `backend/.env.example`. Set `DB_PATH=/app/data/dashboard.sqlite`. Generate long random values for `ADMIN_API_KEY` and `PARTNER_API_KEY`; never reuse the LingXing key.
4. Add a Railway Volume and mount it at `/app/data` so SQLite snapshots survive redeploys.
5. In Networking, generate a domain. Confirm `/health` returns `{"ok":true}`.
6. Trigger the first sync using the admin endpoint from a private terminal; do not put the admin key in a browser URL.

Railway setup references: [Quick Start](https://docs.railway.com/quick-start), [Variables](https://docs.railway.com/variables), [Volumes](https://docs.railway.com/volumes).

**Important frontend security note:** do not put `PARTNER_API_KEY` in the public React bundle or Vite `VITE_*` variables. The current bearer-token partner endpoint is suitable for server-to-server testing only. Before sharing the current static dashboard with external agents, add a same-origin backend proxy or a proper partner login/session layer.

## 3. Run locally
Requirements: Docker + Docker Compose, or Node.js 22+.
```bash
docker compose up -d --build
```
Health check:
```bash
curl http://localhost:8080/health
```

## 4. Trigger first sync
```bash
curl -X POST -H "Authorization: Bearer YOUR_ADMIN_API_KEY" http://localhost:8080/api/admin/sync
```
The first run discovers the three MCP gateway wrappers, obtains each business tool schema, then calls read-only actions. The MCP gateway uses the verified `help` → `search` → `action` pattern and enforces a 1.1-second request gap.

## 5. Read partner data
```bash
curl -H "Authorization: Bearer YOUR_PARTNER_API_KEY" http://localhost:8080/api/partner/dashboard
```
The partner API only returns product identity, image, category, 7/30-day units, previous-period units, rank, FBA available/reserved stock, days of cover, and warning status.

## 6. Daily sync
Default: 03:30 `America/Los_Angeles` daily. Sales windows exclude the current incomplete US day. SQLite snapshots persist in the Docker volume. A failed sync does not overwrite the last successful snapshot.

## 7. Before external release
- Deploy behind HTTPS on a host with persistent storage.
- Set `PARTNER_ALLOWED_ORIGINS` to the exact partner portal origin.
- Replace the prototype shared partner bearer token with authenticated sessions or short-lived, revocable invite links.
- Do not expose `/api/admin/*` to partners.
- Verify the first real snapshot's row counts, shop coverage, product joins, stock aggregation and date boundaries before sharing.
- The report's 60-row Listing sample is not a full matching-rate test; the code queries Listings only for the SKU set in the per-shop Top-N sales results.

## 8. Tests
```bash
cd backend
node --test
```
