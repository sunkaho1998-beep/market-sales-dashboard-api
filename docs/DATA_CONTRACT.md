# Partner API contract

`GET /api/partner/dashboard`

Header: `Authorization: Bearer <PARTNER_API_KEY>` (prototype only; use authenticated sessions or short-lived invite tokens for external release).

The response is an allowlisted, normalized projection. Raw MCP payloads are never returned.

```json
{
  "meta": {
    "source": "LingXing MCP",
    "brand": "Keychron",
    "brandId": 304,
    "marketplace": "Amazon US",
    "marketplaceId": "ATVPDKIKX0DER",
    "shopIds": ["2177", "2178", "2179", "7178"],
    "timezone": "America/Los_Angeles",
    "generatedAt": "ISO-8601",
    "isMock": false,
    "rankingDefinition": "Keychron US internal sales ranking; not Amazon Best Sellers Rank"
  },
  "items": [{
    "id": "ASIN",
    "sku": "seller_sku/MSKU",
    "localSku": "local SKU",
    "asin": "B0EXAMPLE",
    "title": "Product title",
    "imageUrl": "https://...",
    "category": "Keyboard",
    "sales7": 12,
    "sales30": 51,
    "previousSales7": 9,
    "previousSales30": 44,
    "salesGrowth7": 33.3,
    "salesGrowth30": 15.9,
    "availableStock": 80,
    "reservedStock": 4,
    "dailyVelocity": 1.7,
    "daysOfCover": 47.1,
    "status": "healthy",
    "shopIds": ["2177"],
    "inventoryShopIds": ["2177"],
    "rank": 1,
    "previousRank": 2,
    "rankChange": 1
  }],
  "lastSuccessfulSync": "ISO-8601"
}
```

Status values: `healthy`, `low`, `stockout`, `no_sales`, `unknown`. `unknown` means no reliable inventory match; it must not be presented as zero stock.
