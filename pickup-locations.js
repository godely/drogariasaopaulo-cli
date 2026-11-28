// A municipality or a nearby branch can center a public pickup search. Only the
// retailer's uniquely identified pickup address can supply the store coordinates.
import {readFile} from 'node:fs/promises';

let seatIndex;
const shop = 'https://www.drogariasaopaulo.com.br';
const fold = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().trim();
const digits = value => String(value ?? '').replace(/\D/g,'');
const caches = new WeakMap();
const roadTypes = new Set(['RUA','AVENIDA','ESTRADA','RODOVIA','ALAMEDA','PRACA','TRAVESSA','DOUTOR','PROFESSOR','PRESIDENTE']);

function point(pair) {
  if (!Array.isArray(pair) || pair.length !== 2) return;
  const [longitude, latitude] = pair;
  if (Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) &&
      Math.abs(longitude) <= 180 && (latitude || longitude)) return {latitude,longitude};
}

async function query(url, request) {
  const response = await request(url, {signal:AbortSignal.timeout(5000)});
  if (!response.ok) return;
  return response.json();
}

function pickupFor(store, items) {
  if (!Array.isArray(items)) return;
  const id = String(store.codigo);
  const matches = items.map(item => item?.pickupPoint).filter(p =>
    p?.id === store.contaVtex + '_' + id && String(p.address?.addressId) === id);
  if (matches.length !== 1) return;
  const address = matches[0].address;
  if (address.country !== 'BRA' || (store.uf && fold(address.state) !== fold(store.uf))) return;
  const cityWords = fold(store.cidade).match(/[A-Z]+/g) ?? [];
  const pickupCity = new Set(fold(address.city).match(/[A-Z]+/g));
  if (cityWords.length && (!pickupCity.has(cityWords[0]) || !pickupCity.has(cityWords.at(-1)))) return;
  const street = fold(store.endereco).split(',');
  const number = fold(store.numero || street[1]).match(/^(\d+[A-Z]?|S\s*\/\s*N)\b/)?.[1];
  if (!number || number.replace(/\s/g,'') !== fold(address.number).replace(/\s/g,'')) return;
  const officialWords = new Set(fold(address.street).match(/[A-Z]+/g));
  if (!street[0].split(/\W+/).some(w => w.length >= 4 && !roadTypes.has(w) && officialWords.has(w))) return;
  return point(address.geoCoordinates);
}

async function municipalCenter(city, state) {
  if (!city) return;
  if (!seatIndex) {
    seatIndex = readFile(new URL('./data/municipal-seats.tsv',import.meta.url),'utf8').then(contents => {
      const byName = new Map();
      for (const line of contents.trimEnd().split('\n')) {
        const [name,uf,x,y] = line.split('\t');
        const key = fold(name);
        if (!byName.has(key)) byName.set(key,[]);
        byName.get(key).push({state:uf,longitude:Number(x),latitude:Number(y)});
      }
      return byName;
    });
  }
  const places = (await seatIndex).get(city) ?? [];
  const candidates = state ? places.filter(p=>p.state===fold(state)) : places;
  if (candidates.length===1) return candidates[0];
}

async function lookup(store, anchors, request) {
  const post = digits(store.cep);
  const city = fold(store.cidade);
  const near = anchors.filter(a => /^(?:\d{8})$/.test(digits(a.address.postalCode)));
  near.sort((a,b) => Number(fold(a.address.city)!==city)-Number(fold(b.address.city)!==city) ||
    Math.abs(Number(digits(a.address.postalCode))-Number(post))-Math.abs(Number(digits(b.address.postalCode))-Number(post)));
  const find = async params => {
    const url = new URL('/api/checkout/pub/pickup-points',shop);
    url.search = new URLSearchParams(params);
    try { return pickupFor(store,(await query(url,request))?.items); } catch { return undefined; }
  };
  const around = p => find({geoCoordinates:p.longitude+';'+p.latitude});
  if (near.length && post.length === 8) {
    const coordinates = await around(near[0].address);
    if (coordinates) return coordinates;
  }
  if (post.length === 8) {
    const coordinates = await find({postalCode:post,countryCode:'BRA'});
    if (coordinates) return coordinates;
  }
  const center = await municipalCenter(city,store.uf);
  if (center) return around(center);
}

export async function completePickupLocations(missing, anchors, request) {
  if (!caches.has(request)) caches.set(request,new Map());
  const cache = caches.get(request);
  const now = Date.now();
  for (const [key,entry] of cache) if (entry.expires <= now) cache.delete(key);
  const pending = [];
  const lanes = Array.from({length: 3}, () => Promise.resolve());
  let started = 0;
  for (const {raw,row} of missing) {
    if (!raw.contaVtex || !raw.endereco) continue;
    const key = JSON.stringify([row.id,raw.contaVtex,raw.endereco,raw.numero,raw.cep,raw.cidade,raw.uf]);
    let entry = cache.get(key);
    // Keep a damaged national directory from triggering a lookup per store.
    if (!entry && started < 12 && cache.size < 2048) {
      const lane = started++ % lanes.length;
      entry = {expires:Infinity};
      cache.set(key,entry);
      entry.result = lanes[lane].then(()=>lookup(raw,anchors,request)).catch(()=>undefined)
        .then(value=>{ entry.expires=Date.now()+(value ? 3600000 : 60000); return value; });
      lanes[lane] = entry.result;
    }
    if (entry) pending.push(entry.result.then(coords=>{
      if (coords) { Object.assign(row.address,coords); row.coordinateSource='retailer_pickup_point'; }
    }));
  }
  await Promise.all(pending);
}
