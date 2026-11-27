import test from 'node:test';
import assert from 'node:assert/strict';
import { retailer } from './index.js';
test('the sibling uses its own storefront and rejects invalid product identifiers', async () => {
  assert.equal(retailer.site, 'https://www.drogariasaopaulo.com.br');
  await assert.rejects(retailer.byGtin('123'), /GTIN/);
  await assert.rejects(retailer.product('text'), /SKU/);
});
