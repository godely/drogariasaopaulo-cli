// Entries identified only by neighborhood in the retailer's locator. A branch
// must still be listed today at the full address in the cited public record.
const addresses = new Map([
  ['SP|CAMPINAS|AVENIDA DA SAUDADE 888', 'https://portal-adm.campinas.sp.gov.br/sites/default/files/publicacoes-dom/dom/1920641425340514253419206428.pdf#page=28'],
  ['SP|CATANDUVA|RUA DEPUTADO ORLANDO ZANCANER 36', 'https://cnes2.datasus.gov.br/Mod_Conjunto.asp?VCo_Unidade=3511105467454'],
  ['SP|INDAIATUBA|AVENIDA CONCEICAO 2535', 'https://www.indaiatuba.sp.gov.br/download/72664/#page=44'],
]);

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ').trim();
}
function namedBanner(name) {
  const value = normalize(name);
  if (/^(?:DROGARIAA? SAO PAULO|DSP|DROGARIASP)\b/.test(value)) return 'drogariasaopaulo';
  if (/^(?:DROGARIAS? )?PACHECO\b/.test(value)) return 'pacheco';
  return null;
}
function branchIdentity(store) {
  const named = namedBanner(store.nome);
  let street = normalize(store.endereco).replace(/^AV /, 'AVENIDA ').replace(/^R /, 'RUA ');
  const number = normalize(store.numero);
  if (number && !street.endsWith(' ' + number)) street += ' ' + number;
  const reference = addresses.get([normalize(store.uf),normalize(store.cidade),street].join('|'));
  if (reference && named !== 'pacheco') return {banner:'drogariasaopaulo', source:reference};
  return {banner:named, source:'retailer_directory'};
}

export function classifyDirectory(rows) {
  const branches = new Map();
  const byPoint = new Map();
  for (const raw of rows) {
    const id = String(raw?.codigo ?? '').trim();
    if (!/^\d+$/.test(id)) continue;
    const account = String(raw.contaVtex ?? '').trim().toLowerCase();
    const point = account ? account + '_' + id : null;
    const entry = {raw, id, point, ...branchIdentity(raw)};
    // A repeated branch code cannot uniquely identify a physical store.
    branches.set(id, branches.has(id) ? null : entry);
    if (point) byPoint.set(point, entry);
  }
  return {
    stores:[...branches.values()].filter(row => row?.banner === 'drogariasaopaulo'),
    identify(method) {
      const row = byPoint.get(String(method.pickupPointId ?? '').trim().toLowerCase());
      if (!row?.banner || branches.get(row.id) !== row) return null;
      const name = namedBanner(String(method.branch ?? '').replace(/^\s*filial\s*[-:]?\s*/i,''));
      return name && name !== row.banner ? null : row;
    },
  };
}
