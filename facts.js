import {samePack, searchProducts} from 'drogasil-cli';
import {medicationIntent} from 'drogasil-cli/medication-catalog';
import {requestsDrops} from 'drogasil-cli/retailer-workflows';

const words = text => String(text ?? '').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim().replace(/\s+/g, ' ');
const startsWithName = (title, name) => (words(title)+' ').startsWith(name+' ');

async function referencesFor(gtin) {
  const {hits} = await searchProducts(gtin, {hitsPerPage:100,
    attributes:['eanCode','isActive','name','brand','details.fabricante','url']});
  return hits;
}

// A store's brand field can disagree with its product title. For a named
// medicine, corroborate the manufacturer against the identical branded pack.
async function manufacturerMatch(row, intent, verify, references) {
  const maker = words(row.brand);
  const suffix = ' '+words(intent.suffix)+' ';
  if (!row.gtin || !maker || !suffix.includes(' '+maker+' ') || /\bgen[eé]ric[oa]\b/iu.test(row.name)) return;
  const withoutMaker = {...intent, suffix:suffix.replace(' '+maker+' ', ' ').trim()};
  const verified = verify(row, withoutMaker);
  if (!verified) return;
  for (const ref of await references(row.gtin)) {
    const tradeName = words(ref.brand);
    if (ref.isActive === false || words(ref.details?.fabricante) !== maker ||
        !tradeName || tradeName === maker || tradeName === words(intent.name) ||
        !startsWithName(row.name, tradeName) || !startsWithName(ref.name, tradeName)) continue;
    if (typeof ref.url === 'string' && /^[\w%-][\w%./-]*\.html$/i.test(ref.url) &&
        samePack({gtin:String(ref.eanCode),name:ref.name},row)) {
      return {...verified, manufacturer:ref.details.fabricante,
        manufacturerSource:new URL(ref.url, 'https://www.drogasil.com.br').href};
    }
  }
}

export function verifiedFactPage(source, verify, intentFor = medicationIntent, references = referencesFor) {
  return async function factsPage(query, page=1, limit=20) {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50)
      throw new TypeError('Página inválida');
    // The caller verifies drop labels and matched barcodes before paging them.
    if (/^\d+$/.test(query) || requestsDrops(query)) return {rows:await source.facts(query,page,limit),issues:[]};
    const intent = await intentFor(query);
    if (intent.kind === 'text' && intent.suggestions.length) return {rows:[],issues:[]};
    const term = intent.kind === 'text' ? query : intent.name;
    const found = [];
    const seen = new Set();
    const start = (page-1)*limit;
    const issues = new Set();
    const result = () => ({rows:found.slice(start), issues:[...issues]});
    for (let n=1; ; n++) {
      let rows;
      try { rows = await source.facts(term,n,50); }
      catch { issues.add('retailer_catalog_failed'); return result(); }
      const before = seen.size;
      for (const row of rows) {
        if (seen.has(row.sku)) continue;
        seen.add(row.sku);
        let match = verify(row,intent);
        if (!match) {
          try { match = await manufacturerMatch(row,intent,verify,references); }
          catch { issues.add('manufacturer_lookup_failed'); }
        }
        if (match) found.push(match);
        if (found.length === start+limit) return result();
      }
      if (rows.length < 50 || seen.size === before) return result();
    }
  };
}
