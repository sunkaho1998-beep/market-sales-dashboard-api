# V4 Phase 1 — Data Foundation

## Scope
- Four configured US stores: 2177, 2178, 2179, 7178.
- Complete brand-filtered Listing pagination (including zero-sales/inactive listings when LingXing returns them without a status filter).
- Separate 7/30/90-day current and previous complete-period sales queries.
- FBA stock pagination with zero-stock and deleted-listing inclusion flags.
- PostgreSQL snapshot persistence and per-run/per-store pagination metrics.
- Fail-closed behavior: incomplete pages or missing stores fail the run and do not publish a successful snapshot.

## Confirmed query constraints from the supplied LingXing MCP report
- `erp_listing`: `pvi_ids` is required; pass `""` when not filtering attributes; max page length 200.
- `statistics_sales_analysis_list`: page length must be one of 20/50/100/200/500; `parent_asin` must be `""`; no unverified parameters are sent.
- `get_fba_stock_list`: page length supports 20/50/100/200/500/1000; `is_hide_zero_stock="0"`; `is_parant_asin_merge="0"`; `is_contain_del_ls="1"`.

## Period definitions
All periods end on the previous complete US Pacific calendar day. Current and previous windows are equal length: 7, 30, and 90 days. 90-day period totals are available from the sales list query. Per-SKU daily historical curves are NOT backfilled by this phase; they require the row-trend API or daily snapshots collected prospectively.

## Safety
- A failed or incomplete sync is recorded as failed.
- Existing successful snapshots remain queryable; catalog rows are tagged with the latest successful run.
- This phase does not expose revenue, price, cost, profit, ad spend, or procurement fields to the partner API.
- Never commit `.env` or credentials.

## Verification still required
The code is prepared against the user's supplied MCP tool report, but a live read-only run against the connected LingXing tenant is required to confirm current schemas, totals, and pagination behavior. Do not claim full-catalog completeness until each store's returned total equals fetched rows.
