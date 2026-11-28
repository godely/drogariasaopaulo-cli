import test from 'node:test';
import assert from 'node:assert/strict';
import {stores} from './stores.js';

const raw={codigo:12,nome:'DSP Centro',contaVtex:'dspcentro',endereco:'Rua das Palmeiras, 35',cidade:'Lavras',uf:'MG'};
const pickup={id:'dspcentro_12',address:{addressId:'12',country:'BRA',state:'MG',city:'Lavras',street:'Rua das Palmeiras',number:'35',geoCoordinates:[-47,-22]}};
const origin={latitude:-22,longitude:-47};
function source(items,{rawStore=raw}={}) {
  const calls=[];
  const request=async url=>{
    calls.push(url);
    if (url.pathname.endsWith('nossas-lojas.js')) return Response.json({retorno:[rawStore]});
    if (url.pathname.endsWith('pickup-points')) return Response.json({items:items.map(pickupPoint=>({pickupPoint}))});
    throw Error('unexpected URL '+url);
  };
  return {request,calls};
}

test('only a retailer pickup supplies store coordinates and the cache stores no customer origin',async()=>{
  const {request,calls}=source([pickup]);
  assert.equal((await stores(null,request))[0].coordinateSource,undefined);
  assert.equal(calls.length,1);
  const [first]=await stores(origin,request);
  assert.equal(first.distanceKm,0);
  assert.equal(first.coordinateSource,'retailer_pickup_point');
  assert.ok(calls.every(url=>url.host==='www.drogariasaopaulo.com.br'));
  const [longitude,latitude]=calls[2].searchParams.get('geoCoordinates').split(';').map(Number);
  assert.ok(Math.abs(longitude+45)<0.1 && Math.abs(latitude+21.25)<0.1);
  const [second]=await stores({...origin,latitude:-21},request);
  assert.ok(second.distanceKm>110);
  assert.equal(calls.length,4);
});

test('a wrong branch, ambiguous point, moved address, missing geometry or lookup outage leaves the distance unknown',async()=>{
  for(const items of [[],[pickup,pickup],[{...pickup,id:'other_12'}],
    ...[{city:'Outra'},{street:'Rua das Acácias'},{number:'37'},{state:'SP'},{addressId:'42'},{geoCoordinates:[null,-22]}]
      .map(change=>[{...pickup,address:{...pickup.address,...change}}])]){
    const {request}=source(items);
    assert.equal((await stores(origin,request))[0].distanceKm,null);
  }
  const {request}=source([pickup],{rawStore:{...raw,cidade:'Sem Centro Verificável'}});
  assert.equal((await stores(origin,request))[0].distanceKm,null);
  const offline=async url=>url.pathname.endsWith('nossas-lojas.js')
    ? Response.json({retorno:[raw]}) : new Response(null,{status:503});
  assert.equal((await stores(origin,offline))[0].distanceKm,null);
});

test('new branches can be discovered from their directory CEP without a municipal lookup',async()=>{
  const {request,calls}=source([pickup],{rawStore:{...raw,cep:'12345-678'}});
  const [branch]=await stores(origin,request);
  assert.equal(branch.distanceKm,0);
  assert.equal(calls.length,2);
  assert.equal(calls[1].searchParams.get('postalCode'),'12345678');
});
