# V3.2 Partner Data Contract

`GET /api/partner/dashboard` requires a valid partner session cookie.

Response:
- `meta.generatedAt`: snapshot generation time
- `meta.catalogCount`: number of normalized catalog entries
- `meta.zeroSalesCount`: entries with 0 units in both 7-day and 30-day windows
- `meta.inactiveCount`: entries whose Listing status is inactive
- `meta.sourceRows`: counts and pagination metadata for sales, Listing and inventory source rows
- `items[]`: product catalog entries

Each item includes only partner-safe fields: `id`, `sku`, `localSku`, `asin`, `title`, `imageUrl`, `category`, `listingStatus`, `sales7`, `sales30`, previous-period sales, growth percentages, available/reserved stock, daily velocity, days of cover, stock status and rank fields.

No cost, purchase price, profit, advertising spend, supplier, or internal procurement fields are returned.
