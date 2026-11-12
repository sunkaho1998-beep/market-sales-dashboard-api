# V3 partner data contract

## Login
`POST /api/auth/login` JSON `{ "password": "..." }`.
Success returns `{ "ok": true, "expiresAt": "..." }` and sets an HttpOnly secure session cookie. Incorrect passwords return 401; excessive attempts return 429.

`GET /api/auth/me` requires the session cookie and returns `{ "authenticated": true }`.
`POST /api/auth/logout` revokes the session and clears the cookie.

## Dashboard
`GET /api/partner/dashboard` requires a valid session cookie and returns:

```json
{
  "meta": {
    "source": "LingXing MCP",
    "brand": "Keychron",
    "marketplace": "Amazon US",
    "timezone": "America/Los_Angeles",
    "generatedAt": "ISO-8601",
    "isMock": false,
    "rankingDefinition": "Keychron US internal sales ranking; not Amazon Best Sellers Rank"
  },
  "items": [
    {
      "id": "ASIN-or-stable-key",
      "sku": "seller SKU",
      "localSku": "local SKU",
      "asin": "ASIN",
      "title": "Product title",
      "imageUrl": "https://...",
      "category": "Keyboard",
      "sales7": 10,
      "sales30": 42,
      "previousSales7": 8,
      "previousSales30": 39,
      "availableStock": 15,
      "daysOfCover": 10.7,
      "status": "low",
      "rank": 1,
      "previousRank": 2,
      "rankChange": 1
    }
  ],
  "lastSuccessfulSync": "ISO-8601"
}
```

Only allowlisted product, sales and stock fields are exposed. Financial and internal procurement fields are excluded.
