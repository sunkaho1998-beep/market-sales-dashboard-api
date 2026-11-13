# V4 implementation status

This archive is a staging development baseline and UI/requirements prototype, not a production-ready deployment artifact.

## Present in baseline
- React/Vite partner UI scaffold and password login flow.
- Express service, PostgreSQL connection/schema bootstrap, partner session table.
- MCP wrapper discovery and business tool invocation scaffold.
- Listing + 7/30-period sales + FBA inventory ingestion scaffold.
- Staging deployment and data acceptance checklist.

## Not yet implemented or not verified (must not claim complete)
- 90-day and daily sales history ingestion.
- Opportunity classification and calibrated score.
- Product detail endpoints and daily trend endpoint.
- Store comparison endpoint and category aggregation.
- Partner watchlist persistence and 3–5 product comparison.
- Excel export endpoint.
- Robust per-page/per-tool sync checkpoints and partial-success promotion.
- Live LingXing schema validation and one-page test for all four SIDs.
- Full reconciliation of Ghost SKU / inventory ownership.
- Frontend production build and end-to-end auth/API browser tests.

Do not deploy this baseline over V3. Provision isolated V4 staging and validate each item above before partner launch.

## Phase 1 development update
- Implemented separate 7/30/90-day current and previous complete-period sales windows.
- Restricted MCP business parameters to fields documented in the supplied LingXing report.
- Added strict pagination completeness checks and total-stability checks.
- Added per-store Listing, Sales, and Inventory page/row metrics.
- Added `last_seen_run_id` so stale Listing records are not mixed into the latest full-catalog view.
- Fixed seller_sku array normalization when writing sales snapshots.
- Added Phase 1 data-foundation notes and clarified that historical per-SKU daily curves are not backfilled by this phase.
- Live MCP tenant validation remains pending.
