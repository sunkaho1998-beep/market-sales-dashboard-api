# Market Sales Dashboard V3.2 — Full US Catalog

This release upgrades the existing V3 app to synchronize the complete Keychron Amazon US Listing catalog, including inactive listings and SKUs with zero sales.

## Important behavior
- `erp_listing` is paginated using 200-row pages across the configured four US SIDs and brand ID 304. The `status` filter is intentionally omitted so inactive listings are not excluded.
- `statistics_sales_analysis_list` is paginated using the documented 500-row page size for each US shop and both 7-day and 30-day periods. This prevents products outside a Top-N sample from being incorrectly classified as zero-sales.
- FBA inventory is paginated with 500-row pages and includes zero-stock rows.
- The product catalog merges Listing rows with sales rows. Listing-only products remain present with zero sales and `listingStatus` metadata.
- Partner API returns a strict field allowlist; financial, cost, profit, advertising and supplier fields are not exposed.

## Deploy to the existing Railway service
1. Keep the existing Railway service, domain, environment variables and Volume.
2. Keep `DB_PATH=/app/data/dashboard.sqlite` and the Volume mount `/app/data`.
3. Replace the repository contents with this release and commit to the existing GitHub repository.
4. Wait for Railway to build and deploy.
5. Trigger one admin sync using the existing admin-only endpoint, or wait for the next scheduled sync.
6. Verify `/api/partner/dashboard` after partner login. `meta.catalogCount`, `meta.zeroSalesCount`, `meta.inactiveCount`, and `meta.sourceRows` show catalog coverage.

## Notes
- Catalog identity is ASIN + normalized MSKU. Store IDs are retained as associated shop IDs.
- Amazon US internal sales ranking is not Amazon Best Sellers Rank.
- Inventory mapping and ghost-SKU aggregation remain conservative; unmatched inventory is `unknown`, not zero stock.
- Do not commit `.env` files or secrets.
