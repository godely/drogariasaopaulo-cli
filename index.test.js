import test from 'node:test';
import assert from 'node:assert/strict';
import { retailer } from './index.js';
test('the sibling uses its own storefront and rejects invalid product identifiers', async () => {
  assert.equal(retailer.site, 'https://www.drogariasaopaulo.com.br');
  await assert.rejects(retailer.byGtin('123'), /GTIN/);
  await assert.rejects(retailer.product('text'), /SKU/);
});

test('requires whole ingredient tokens and rejects conflicting product evidence', async () => {
  const {verifyProduct}=await import('./index.js');
  const intent={name:'morfina',kind:'ingredient',suffix:''};
  const row={name:'Dimorf',facts:{'Princípio Ativo':['Com Sulfato de Morfina Pentaidratado']}};
  assert.equal(verifyProduct(row,intent).ingredientEvidence.field,'Princípio Ativo');
  assert.equal(verifyProduct({...row,name:'Morfina',facts:{'Princípio Ativo':['Tramadol']}},intent),undefined);
});
