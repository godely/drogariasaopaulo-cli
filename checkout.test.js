import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetailer } from 'paguemenos-cli/vtex';
import { withStorefrontPickup } from './checkout.js';
import { classifyDirectory } from './branch-identity.js';
import { readDirectory } from './stores.js';

const raw = [
  {codigo:1,contaVtex:'drogariaspachecoabc',nome:' Drogaria São Paulo Sul'},
  {codigo:2,contaVtex:'drogariasaopaulosul',nome:'Drogarias Pacheco Sul'},
  {codigo:3,contaVtex:'centro',nome:'Centro'},
];
const offer={sku:'99',sellerId:'1',priceScope:'anonymous_online',currentPrice:8,listPrice:10};
const origin={latitude:1,longitude:1};
const sla = (id, name='Filial Centro') => ({id:'Balcão',deliveryChannel:'pickup-in-point',pickupPointId:id,
  pickupStoreInfo:{friendlyName:name}});
function fixture(slas, getDirectory) {
  const request=async (_url,{body}) => {
    const {items}=JSON.parse(body);
    return Response.json({items:items.map(item=>({...item,availability:'available',sellingPrice:540,listPrice:800})),
      logisticsInfo:items.map((item,itemIndex)=>({itemIndex,itemId:item.id,slas}))});
  };
  const base=createRetailer({name:'Drogaria São Paulo',site:'https://example.org'},request);
  return withStorefrontPickup(base,getDirectory);
}

test('local and combined quotes verify the complete pickup point even when the account suggests another banner',async()=>{
  const roster=classifyDirectory(raw);
  let reads=0;
  const api=fixture([sla('drogariaspachecoabc_1'),sla('drogariasaopaulosul_2'),sla('unrelated_1'),
    sla('centro_3'),sla('drogariaspachecoabc_1','Filial Drogarias Pacheco Sul')],async()=>{reads++;return roster;});
  const local=await api.local(offer,origin);
  const lines=[{offer,quantity:1},{offer,quantity:2},{offer:{...offer,sku:'100'},quantity:1}];
  const quotes=await api.basket(lines,origin);
  assert.deepEqual(quotes.map(q=>q.requestedQuantity),[3,1]);
  assert.equal(reads,2);
  for(const quote of [local,...quotes]){
    assert.deepEqual(quote.methods.map(m=>m.directoryBranchId),['1']);
    assert.equal(quote.currentPrice,5.4);
    assert.deepEqual(quote.pickupVerification,{status:'incomplete',unknownPoints:3,otherBannerPoints:1});
  }
});
test('other-banner quotes revert to the catalog price and unknown identities never prove stock or absence',async()=>{
  for(const [id,status,other] of [['drogariasaopaulosul_2','verified',1],['unknown_2','incomplete',0]]){
    const api=fixture([sla(id)],async()=>classifyDirectory(raw));
    const quote=await api.local(offer,origin);
    assert.deepEqual(quote.methods,[]);
    assert.equal(quote.localStatus,'unverified');
    assert.equal(quote.priceScope,offer.priceScope);assert.equal(quote.currentPrice,8);
    assert.equal(quote.pickupVerification.status,status);assert.equal(quote.pickupVerification.otherBannerPoints,other);
  }
});
test('delivery survives a directory failure, pure delivery skips the directory, and pickup only reports failure',async()=>{
  const delivery={deliveryChannel:'delivery',id:'Entrega',price:100};
  const failed=async()=>{throw Error('directory failed')};
  for(const [slas,read,status] of [[[sla('a_1'),delivery],failed,'available'],[[sla('a_1')],failed,'lookup_failed'],[[delivery],assert.fail,'available']]){
    const quote=await fixture(slas,read).local(offer,origin);
    assert.equal(quote.localStatus,status);
    assert.deepEqual(quote.methods.map(m=>m.channel),slas.includes(delivery)?['delivery']:[]);
    assert.equal(quote.currentPrice,slas.includes(delivery)?5.4:8);
    assert.equal(quote.pickupVerification?.status,slas.length===1 && slas[0]===delivery?undefined:'directory_failed');
  }
});
test('neighborhood names need a documented full address and repeated branch identities stay unresolved',()=>{
  const address={nome:'Ponte Preta',uf:'SP',cidade:'Campinas',endereco:'Av. da Saudade',numero:'888'};
  const data=[...raw,{...address,codigo:4,contaVtex:'a'}, {...address,codigo:5,numero:'889'},
    {...address,codigo:6,cidade:'Outra'}, {...address,codigo:7,nome:'Pacheco'},
    {...raw[0],codigo:8},{...raw[1],codigo:8}];
  const roster=classifyDirectory(data);
  assert.deepEqual(roster.stores.map(s=>s.id),['1','4']);
  assert.match(roster.identify({pickupPointId:'a_4'}).source,/campinas/);
  assert.equal(roster.identify({pickupPointId:'drogariaspachecoabc_8'}),null);
});
test('concurrent directory reads share one fetch and recover after a failure',async()=>{
  let calls=0;
  const request=async()=>++calls===1 ? Response.json({}, {status:503}) : Response.json({retorno:raw});
  const requests=await Promise.allSettled([readDirectory(request),readDirectory(request)]);
  assert.ok(requests.every(r=>r.status==='rejected'));assert.equal(calls,1);
  assert.equal((await readDirectory(request)).stores.length,1);
  assert.equal((await readDirectory(request)).stores.length,1);assert.equal(calls,2);
});

test('the exported retailer applies the physical banner filter at both shopping entry points',async t=>{
  t.mock.method(globalThis,'fetch', async (url, options) => {
    if (url.pathname.endsWith('nossas-lojas.js')) return Response.json({retorno:raw});
    assert.ok(url.pathname.endsWith('/simulation'));
    const {items}=JSON.parse(options.body);
    return Response.json({items:items.map(i=>({...i,availability:'available',sellingPrice:400})),
      logisticsInfo:items.map((i,itemIndex)=>({itemIndex,itemId:i.id,slas:[sla('drogariasaopaulosul_2'),sla('drogariaspachecoabc_1')]}))});
  });
  const {retailer} = await import('./index.js');
  const local=await retailer.local(offer,origin);
  const [joint]=await retailer.basket([{offer,quantity:2}],origin);
  for (const row of [local,joint]) {
    assert.deepEqual(row.methods.map(p=>p.pickupPointId),['drogariaspachecoabc_1']);
    assert.equal(row.pickupVerification.otherBannerPoints,1);
  }
});
