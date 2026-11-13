# Keychron Sales Intelligence V4 — Locked Product Requirements

Status: requirements locked; staging only. V3 production must remain unchanged.

## Audience and access
- External audience: Australian partners.
- Default locale: English; optional Simplified Chinese.
- Partner login: shared password for initial release, verified server-side; opaque HttpOnly Secure SameSite=Lax session cookie.
- Do not expose US selling price, cost, margin, profit, purchase price, supplier, ad spend, or internal procurement fields to partners.
- Partner access is read-only except partner-owned watchlists/comparison selections. Admin sync endpoints are never partner-accessible.

## Scope
- Four US stores: 2177, 2178, 2179, 7178; store-level records remain distinct and may be rolled up explicitly.
- PostgreSQL for V4; new database only. Do not connect V4 to V3 SQLite Volume or mutate V3 production.
- Full catalog includes all returned listing statuses, zero-sales listings, and inactive/delisted listings.
- Sales windows: 7, 30, 90 days and equal-length preceding windows. Use complete days in America/Los_Angeles.
- Growth metrics: current units, previous units, growth %, average daily units, 90-day trend, acceleration. If prior period is zero, return null growth and label New/No baseline; never infinity.
- Growth Opportunities categories: Rising, Best Sellers, New Launch Watchlist, Declining. Labels can overlap. New Launch requires reliable launch date, minimum observation window, and positive sales evidence; insufficient evidence is labelled Insufficient Data.
- Product detail: image, title, model/SKU/MSKU/ASIN/parent ASIN, category, listing status/date, 7/30/90 sales, daily series where source supports it, growth, four-store performance, inventory, BSR only when an authoritative BSR field/source is available. Never label Seller Rank as BSR.
- Inventory: available, reserved, inbound where available; distinguish zero from unknown; Ghost SKU handling must be reconciled before aggregate stock is trusted.
- Store comparison: 4 stores, periods, category mix, sales contribution, listing coverage.
- Exports: Excel catalog export; partner-safe columns only.
- Watchlist and product comparison (3–5 products) are partner features; persist per partner identity if individual accounts are introduced. Shared-password mode must not imply individual attribution.
- Sync & Data Health: per-store/per-tool/per-page counts, totals, duration, errors, MCP schema version/discovery timestamp, partial success. Partial sync is never reported as full success. Previous successful snapshot remains active if a run fails.

## Data source and correctness rules
- LingXing MCP is the internal source; discover current `help`, `search`, `action` schemas before business calls.
- Validate tool schemas against live read-only one-page calls before full pagination.
- Listing is the catalog spine; sales and inventory enrich it. Missing sales = 0 only when listing exists and sales query for the complete period succeeded. Missing inventory = unknown, not zero.
- Store + ASIN + seller SKU/MSKU identity; preserve variants and store-specific listing records. Rollups are explicit and traceable.
- Reconcile per-store reported total, fetched row count, page count, unique listing keys, duplicate count, and filtered brand count. Abort promotion if totals disagree beyond explained pagination/duplicate rules.
- Historical daily trend must come from actual daily records. If LingXing only returns period aggregates, V4 starts daily snapshots at go-live and must not fabricate pre-launch daily series.

## Priority
1. Data foundation and reconciled full catalog.
2. Product Growth and Growth Opportunities.
3. Product Detail and 4-store comparison.
4. Inventory, Excel export, watchlist, compare.
5. Partner UX, monitoring, and production acceptance.
