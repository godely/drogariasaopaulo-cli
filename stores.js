import { classifyDirectory } from './branch-identity.js';
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
function publishedRange(open,close) {
  const valid = time => typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
  return valid(open) && valid(close) ? open + ' às ' + close : null;
}
async function json(path, request) {
  const response = await request(new URL(path,site),{signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error('Drogaria São Paulo directory HTTP '+response.status);
  return response.json();
}
// Cache only store identities and published directory fields. Local checkout
// offers and shopper locations are never cached here.
const directoryCache = new WeakMap();
export async function readDirectory(request = fetch) {
  const previous = directoryCache.get(request);
  if (previous && previous.expires > Date.now()) return previous.promise;
  const promise = json(directory, request).then(data => {
    if (!Array.isArray(data.retorno) || !data.retorno.length) throw Error('Unexpected Drogaria São Paulo directory');
    return classifyDirectory(data.retorno);
  });
  const entry = {promise, expires:Date.now() + 300_000};
  directoryCache.set(request, entry);
  try { return await promise; }
  catch (error) {
    if (directoryCache.get(request) === entry) directoryCache.delete(request);
    throw error;
  }
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
  const roster = await readDirectory(request);
  const rows=[];
  for (const {raw:store,id,point:checkoutPointId,source:bannerSource} of roster.stores) {
    const address={street:store.endereco,number:store.numero,city:store.cidade,state:store.uf,district:store.bairro,
      postalCode:store.cep,latitude:coordinate(store.latitude,90),longitude:coordinate(store.longitude,180)};
    const openingHours = {
      weekdays:publishedRange(store.horarioAberturaSegsex,store.horarioFechamentoSegsex),
      saturday:publishedRange(store.horarioAberturaSabado,store.horarioFechamentoSabado),
      sunday:publishedRange(store.horarioAberturaDomingo,store.horarioFechamentoDomingo),
      holidays:store.indicadorAbreFeriado === false ? 'Fechada' : null,
    };
    rows.push({id,checkoutPointId,bannerSource,storeName:store.nome?.trim() || 'Drogaria São Paulo',address,phone:store.telefoneUm||store.telefoneDois||null,whatsapp:store.whatsapp||null,
      openingHours, opensOnHolidays:typeof store.indicadorAbreFeriado === 'boolean' ? store.indicadorAbreFeriado : null,
      ...(point && {distanceKm:address.latitude==null||address.longitude==null?null:distanceKm(point,address)})});
  }
  return point?rows.sort((a,b)=>(a.distanceKm??Infinity)-(b.distanceKm??Infinity)):rows;
}
