import test from 'node:test';
import assert from 'node:assert/strict';
import { retailer } from './index.js';
import {compareOffers} from 'paguemenos-cli/compare';

test('a Drogaria São Paulo quote for a different storefront or farther branch cannot fill the closest branch',async()=>{
  const origin={latitude:-21,longitude:-43};
  const row={sku:'50',sellerId:'1',name:'Teste'};
  const source={stores:place=>retailer.stores(place,async()=>Response.json({retorno:[
    {nome:'DSP Centro',codigo:3,latitude:-21,longitude:-43},
    {nome:'DROGARIA SÃO PAULO Leste',codigo:7,latitude:-21.1,longitude:-43},
  ]})),local:async()=>({...row,requestedQuantity:1,localStatus:'available',methods:[
    {channel:'pickup-in-point',pickupPointId:'drogariaspzona_7'},
    {channel:'pickup-in-point',pickupPointId:'outraredecentro_3'},
  ]})};
  const result=await compareOffers({retailer:'drogariasaopaulo',coordinates:origin,store:'nearest'},
    source,async()=>({products:[row]}));
  assert.equal(result.fixedStore.branch.storeName,'DSP Centro');
  assert.equal(result.products[0].pickupAtStore,'unconfirmed');
  assert.deepEqual(result.products[0].methods,[]);
  assert.equal(result.products[0].branchQuantity,null);
});
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

test('São Paulo directory verifies the banner, normalizes coordinates and sorts by the origin',async()=>{
  const common={latitude:'-22,0',longitude:'-43,0'};
  const request=async()=>Response.json({retorno:[
    {...common,nome:'DROGARIAS PACHECO CENTRO',codigo:1},
    {...common,nome:'DROGARIA SÃO PAULO CENTRO',codigo:2},
    {...common,nome:'DSP PERTO',codigo:3,latitude:'-21,0'},
    {...common,nome:'INDEFINIDA',codigo:4},
  ]});
  assert.deepEqual((await retailer.stores({latitude:-21,longitude:-43},request)).map(s=>s.id),['3','2']);
});
