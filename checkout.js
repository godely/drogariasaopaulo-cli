import { readDirectory } from './stores.js';

// The São Paulo and Pacheco storefronts share a checkout. Verify each pickup
// point against its complete directory identity before exposing it to a plan.
export function withStorefrontPickup(catalog, directory = readDirectory) {
  async function basket(lines, origin) {
    const quotes = await catalog.basket(lines, origin);
    if (!quotes.some(q => q.methods.some(m => m.channel === 'pickup-in-point'))) return quotes;
    const roster = await directory().catch(() => null);
    const offers = new Map(lines.map(({offer}) => [JSON.stringify([offer.sku, offer.sellerId]), offer]));
    return quotes.map(quote => {
      if (!quote.methods.some(m => m.channel === 'pickup-in-point')) return quote;
      let unknown = 0, other = 0;
      const methods = [];
      for (const method of quote.methods) {
        if (method.channel !== 'pickup-in-point') { methods.push(method); continue; }
        const entry = roster?.identify(method);
        if (!entry) unknown++;
        else if (entry.banner !== 'drogariasaopaulo') other++;
        else methods.push({...method, directoryBranchId:entry.id, bannerSource:entry.source});
      }
      const pickupVerification = {status:!roster ? 'directory_failed' : unknown ? 'incomplete' : 'verified',
        unknownPoints:unknown, otherBannerPoints:other};
      if (methods.length) return {...quote, methods, pickupVerification};
      const offer = offers.get(JSON.stringify([quote.sku, quote.sellerId]));
      return {...offer, observedAt:quote.observedAt, requestedQuantity:quote.requestedQuantity,
        localStatus:roster ? 'unverified' : 'lookup_failed', methods, pickupVerification};
    });
  }
  return {...catalog, basket, async local(offer, origin, quantity = 1) {
    const [quote] = await basket([{offer, quantity}], origin);
    return quote;
  }};
}
