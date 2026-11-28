import { completePickupLocations } from './pickup-locations.js';
const site = 'https://www.drogariasaopaulo.com.br';
const directory = '/api/dataentities/PR/documents/f52e9e7f-a02c-11ea-8337-0a8ac637298d/arquivo/attachments/nossas-lojas.js';

function coordinate(value, limit) {
  if (value == null || String(value).trim() === '') return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}
function distanceKm(a,b) {
  const rad = Math.PI / 180;
  const d = Math.sin((a.latitude-b.latitude)*rad/2)**2 +
    Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin((a.longitude-b.longitude)*rad/2)**2;
  return 12742.0176*Math.asin(Math.sqrt(Math.min(1,d)));
}
async function json(path, request) {
  const response = await request(new URL(path,site),{signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error('Drogaria São Paulo directory HTTP '+response.status);
  return response.json();
}
export async function stores(origin, request=fetch) {
  let point = origin;
  if (typeof origin==='string') {
    if (!/^\d{5}-?\d{3}$/.test(origin)) throw TypeError('Invalid CEP');
    const address=await json('/api/checkout/pub/postal-code/BRA/'+origin.replace('-',''),request);
    const [longitude,latitude]=address.geoCoordinates??[];
    point={latitude,longitude};
  }
  if(point && (coordinate(point.latitude,90)==null || coordinate(point.longitude,180)==null)) throw TypeError('Invalid directory origin');
  const data=await json(directory,request);
  if(!Array.isArray(data.retorno)) throw Error('Unexpected Drogaria São Paulo directory');
  const rows=[];
  const missing=[];
  for(const store of data.retorno) {
    const banner = String(store.nome??'').normalize('NFD').replace(/\p{M}/gu,'').toUpperCase();
    if (!/^(?:DROGARIA\s+SAO PAULO|DSP\b|DROGARIASP\b)/.test(banner) || store.codigo == null) continue;
    const address={street:store.endereco,number:store.numero,city:store.cidade,state:store.uf,district:store.bairro,
      postalCode:store.cep,latitude:coordinate(store.latitude,90),longitude:coordinate(store.longitude,180)};
    const row={id:String(store.codigo),storeName:store.nome.trim(),address,phone:store.telefoneUm||null,whatsapp:store.whatsapp||null};
    rows.push(row);
    if (address.latitude==null || address.longitude==null) missing.push({raw:store,row});
  }
  if (point && missing.length) {
    const anchors=rows.filter(r=>r.address.latitude!=null && r.address.longitude!=null);
    await completePickupLocations(missing,anchors,request);
  }
  if (point) for (const row of rows) {
    const address=row.address;
    row.distanceKm=address.latitude==null || address.longitude==null ? null : distanceKm(point,address);
  }
  return point?rows.sort((a,b)=>(a.distanceKm??Infinity)-(b.distanceKm??Infinity)):rows;
}
