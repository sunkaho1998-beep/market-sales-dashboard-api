# V4 staging and go-live checklist

- [ ] Create `v4-development` Git branch; keep V3 production branch unchanged.
- [ ] Create new Railway V4 staging service and NEW PostgreSQL service/database.
- [ ] Set DATABASE_URL, LINGXING_MCP_URL, LINGXING_MCP_KEY, ADMIN_API_KEY, PARTNER_PASSWORD only in V4 service.
- [ ] Keep V3 service, V3 domain, V3 SQLite Volume and variables untouched.
- [ ] Verify /health and PostgreSQL connectivity.
- [ ] Verify MCP wrapper tools; live search current schemas for get_my_sids, erp_listing, statistics_sales_analysis_list, get_fba_stock_list.
- [ ] One-page read-only call for each tool; validate current schema and response envelope.
- [ ] Listing full pagination for each SID; reconcile returned total and fetched rows.
- [ ] Sales 7/30/90 and previous windows; verify actual API semantics. Daily history only if source supplies daily rows.
- [ ] Inventory pagination and Ghost SKU/duplicate ownership audit.
- [ ] Catalog contains zero-sales and inactive listings.
- [ ] Partial failure does not replace last successful snapshot.
- [ ] Implement and test Rising/Best Sellers/New Launch/Declining classification and insufficient-data safeguards.
- [ ] Implement product detail, four-store comparison, watchlist, product compare, Excel export.
- [ ] Verify no US price, cost, margin, profit, procurement, supplier, ad spend fields in partner payload/export.
- [ ] Verify unauthenticated 401, wrong password 401, rate limit, HttpOnly Secure cookie, logout, expired session, admin endpoint 401 for partner.
- [ ] Enable daily cron only after a successful reconciled full sync.
- [ ] Keep V3 running until V4 passes at least one full sync and acceptance sign-off.
