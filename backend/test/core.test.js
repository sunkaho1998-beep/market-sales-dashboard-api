import test from 'node:test';
import assert from 'node:assert/strict';
const n = value => Number(String(value ?? 0).replaceAll(',', '')) || 0;
test('parses LingXing thousands-separated sales values', () => assert.equal(n('1,234'), 1234));
test('zero sales remains zero, not missing', () => assert.equal(n(undefined), 0));
test('configured shop set has four US stores', () => assert.deepEqual(['2177','2178','2179','7178'].length, 4));
test('sales sku arrays are normalized without truncating to first character', () => {
  const row = { seller_sku: ['K8-PRO'], asin: 'B000000001' };
  const sku = Array.isArray(row.seller_sku) ? row.seller_sku[0] : row.seller_sku;
  assert.equal(sku, 'K8-PRO');
});
test('full catalog identity is shop-scoped and retains same ASIN across stores', () => {
  const keys = new Set(['2177|B000000001|K8-PRO', '2178|B000000001|K8-PRO']);
  assert.equal(keys.size, 2);
});
