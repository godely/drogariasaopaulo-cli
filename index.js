import { createRetailer } from 'paguemenos-cli/vtex';
import { medicationCatalog, verifiedRow } from 'drogasil-cli/medication-catalog';

const storefront = { name: 'Drogaria São Paulo', site: 'https://www.drogariasaopaulo.com.br' };
export function verifyProduct(row, intent) {
  const ingredients = [row.facts?.['Princípio Ativo']].flat().filter(value=>typeof value === 'string' && value.trim());
  return verifiedRow(row,intent,{ingredients,evidence:{source:'retailer_field',field:'Princípio Ativo'}});
}
export const retailer = medicationCatalog(createRetailer(storefront), {
  async searchVerified(intent,page,limit) {
    const text = intent.kind === 'text' ? [intent.name,intent.suffix].filter(Boolean).join(' ') : intent.name;
    const catalog = createRetailer({...storefront,prepareSearch:() => ({
      text, matches:row=>Boolean(verifyProduct(row,intent)),
    })});
    return (await catalog.search(text,page,limit)).map(row=>verifyProduct(row,intent));
  },
});
