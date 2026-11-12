import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDashboard, parseVolume, __test__ } from '../src/normalize.js';

test('parses comma-separated sales numbers from date1/date2', () => {
  assert.equal(parseVolume({ date1: { volume: '2,683.21' } }, 'date1'), 2683.21);
});

test('joins inventory by ASIN and folds ghost seller SKUs into local SKU stock', () => {
  const payload = normalizeDashboard({
    generatedAt: '2026-11-12T00:00:00.000Z',
    period: {},
    sales7Rows: [{ asin: 'B0EXAMPLE', sid: [2177], seller_sku: ['KEY-01'], date1: { volume: '20' }, date2: { volume: '10' }, sid_mskus: [{ sid: 2177, seller_sku: 'KEY-01' }] }],
    sales30Rows: [{ asin: 'B0EXAMPLE', sid: [2177], seller_sku: ['KEY-01'], date1: { volume: '80' }, date2: { volume: '60' }, sid_mskus: [{ sid: 2177, seller_sku: 'KEY-01' }] }],
    listingRows: [{ asin: 'B0EXAMPLE', msku: 'KEY-01', local_sku: 'KEY01', local_name: 'Keyboard', small_image_url: 'https://example.test/a.jpg', category_text: 'Keyboard', sid: 2177 }],
    stockRows: [
      { unique_id: '1', asin: 'B0EXAMPLE', sku: 'KEY01', seller_sku: 'KEY-01', sid: 2177, afn_fulfillable_quantity: 10, afn_reserved_quantity: 2 },
      { unique_id: '2', asin: 'B0EXAMPLE', sku: 'KEY01', seller_sku: 'amzn.gr.KEY01-LN', sid: 2177, afn_fulfillable_quantity: 3, afn_reserved_quantity: 0 }
    ]
  });
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].sales7, 20);
  assert.equal(payload.items[0].sales30, 80);
  assert.equal(payload.items[0].availableStock, 13);
  assert.equal(payload.items[0].localSku, 'KEY01');
  assert.equal(payload.items[0].title, 'Keyboard');
  assert.equal(payload.items[0].daysOfCover, 4.875);
});

test('does not invent zero stock when ASIN has no inventory match', () => {
  const payload = normalizeDashboard({
    generatedAt: '2026-11-12T00:00:00.000Z', period: {},
    sales7Rows: [],
    sales30Rows: [{ asin: 'B0NO-STOCK', sid: [2177], seller_sku: ['NO-STOCK'], date1: { volume: '30' }, date2: { volume: '20' }, sid_mskus: [{ sid: 2177, seller_sku: 'NO-STOCK' }] }],
    listingRows: [], stockRows: []
  });
  assert.equal(payload.items[0].availableStock, null);
  assert.equal(payload.items[0].status, 'unknown');
});

test('normalizes SKU punctuation for lookup and detects Amazon ghost rows', () => {
  assert.equal(__test__.normSku('k8-a1'), 'K8A1');
  assert.equal(__test__.isGhost('amzn.gr.K8A1-LN'), true);
});
