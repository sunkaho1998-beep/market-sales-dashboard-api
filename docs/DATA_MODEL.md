# V4 data model

- `catalog_items`: per-shop Listing identity (`shop_id + ASIN + MSKU`), retains inactive and zero-sales listings.
- `sales_snapshots`: append-only sales observations by run, shop and period (7/30 days).
- `inventory_snapshots`: append-only FBA inventory observations by run and shop.
- `sync_runs`: per-run status and reconciliation metrics.
- `partner_sessions`: hashed opaque session token and expiry.

Identity rules: do not collapse all variants by ASIN alone. Preserve shop + ASIN + MSKU. Cross-shop rollups must be an explicit presentation aggregation. Unknown inventory remains null/unknown; it is never coerced to zero.
