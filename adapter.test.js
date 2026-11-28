import assert from 'node:assert/strict';
import test from 'node:test';
import { retailer, verifyProduct } from './index.js';

const site = 'https://www.drogariasaopaulo.com.br';

test('CEP lookup uses the DSP checkout and ranks branches from its longitude/latitude pair', async () => {
  const paths = [];
  const rows = await retailer.stores('01310-100', async url => {
    assert.equal(url.origin, site);
    paths.push(url.pathname);
    if (paths.length === 1) return Response.json({ geoCoordinates: [-46, -23] });
    return Response.json({ retorno: [
      { codigo: 1, nome: 'DSP Sem coordenadas', latitude: '', longitude: -46 },
      { codigo: 2, nome: 'DSP Centro', latitude: '-23,0', longitude: '-46,0', telefoneUm: '1133334444' },
      { codigo: 3, nome: 'DSP Norte', latitude: -22.9, longitude: -46 },
    ] });
  });
  assert.equal(paths[0], '/api/checkout/pub/postal-code/BRA/01310100');
  assert.match(paths[1], /\/nossas-lojas\.js$/);
  assert.deepEqual(rows.map(row => row.id), ['2', '3', '1']);
  assert.equal(rows[0].distanceKm, 0);
  assert.equal(rows[0].phone, '1133334444');
  assert.ok(rows[1].distanceKm > 11 && rows[1].distanceKm < 12);
  assert.equal(rows[2].distanceKm, null);
});

test('an unresolved CEP cannot silently fall back to the national directory', async () => {
  let calls = 0;
  await assert.rejects(retailer.stores('01310100', async () => {
    calls++;
    return Response.json({ geoCoordinates: [] });
  }), /Invalid directory origin/);
  assert.equal(calls, 1);
});

test('directory outages and invalid payloads are distinct from an empty national directory', async () => {
  await assert.rejects(retailer.stores(null, async () => new Response(null, { status: 503 })), /HTTP 503/);
  await assert.rejects(retailer.stores(null, async () => Response.json({})), /Unexpected.*directory/);
  assert.deepEqual(await retailer.stores(null, async () => Response.json({ retorno: [] })), []);
});

test('ingredient title fallback excludes mention-only products, other strengths and concentrations', () => {
  const intent = { kind: 'ingredient', name: 'dipirona', suffix: '500 mg' };
  const result = verifyProduct({ name: 'Dipirona 500 mg comprimidos' }, intent);
  assert.equal(result.ingredientEvidence.source, 'retailer_title');
  for (const name of ['Kit para dipirona 500 mg', 'Dipirona 500 mg/mL', 'Dipirona 50 mg']) {
    assert.equal(verifyProduct({ name }, intent), undefined, name);
  }
});

test('verified DSP search paginates matching products and keeps their sellers and ingredient evidence', async t => {
  function product(id, ingredient) {
    return {
      allSpecifications: ['Princípio Ativo'], 'Princípio Ativo': [ingredient],
      items: [{ itemId: id, name: 'Comprimidos 500 mg', sellers: [{ sellerId: '1' }, { sellerId: '2' }] }],
    };
  }
  const products = [product('10', 'Dipirona'), product('11', 'Paracetamol'), product('12', 'Dipirona')];
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (url.host === 'drogasil-prod.topsort.workers.dev') return Response.json({ results: [{ facets: {} }] });
    assert.equal(url.origin, site);
    assert.equal(url.pathname, '/api/catalog_system/pub/products/search');
    assert.equal(url.searchParams.get('ft'), 'dipirona');
    return Response.json(products);
  });
  const rows = await retailer.search('dipirona 500 mg', 2, 1);
  assert.deepEqual(rows.map(row => [row.sku, row.sellerId, row.ingredientEvidence.field]), [
    ['12', '1', 'Princípio Ativo'], ['12', '2', 'Princípio Ativo'],
  ]);
  assert.deepEqual(await retailer.search('dipirona 500 mg', 3, 1), []);
});
