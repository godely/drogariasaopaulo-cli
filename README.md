# Drogaria São Paulo CLI
Independent CLI for the Drogaria São Paulo storefront. Install with `npm ci` on Node 20 or newer. The shared VTEX adapter is pinned to a tested revision.

```sh
node cli.js search paracetamol --limit 10
node cli.js product 848778 --json
node cli.js gtin 7899547543766 --json
node cli.js info 848778
node cli.js stock 848778 --cep "$CEP"
```

The source distinguishes an online offer from fulfillment verified for the exact seller, SKU, quantity and CEP. Each method includes the channel and fee when supplied. Inventory levels, equivalents, prescription classifications and multi-store plans require separate evidence.

[Retailer](https://www.drogariasaopaulo.com.br/) · [VTEX checkout simulation](https://developers.vtex.com/docs/api-reference/checkout-api)

Search checks medication names with the shared Drogasil resolver. Use `drogariasaopaulo suggest <prefix>` for spelling suggestions. Ingredient matches use the retailer's Princípio Ativo field when available and carry the evidence in JSON.

### Consultas do CLI

`info` aceita vários nomes ou SKUs e `--brazil` para apresentações nacionais. Use `compare` para equivalentes verificados, `plan` para consultar a cesta inteira e `snapshot collect|read|export` para consultas persistidas. `stock` aceita CEP ou coordenadas. A quantidade solicitada é confirmada por simulação de atendimento.

`drogariasaopaulo stores --json` consulta o diretório nacional publicado no localizador “Nossas Lojas”. Os registros precisam identificar a bandeira Drogaria São Paulo. Com CEP ou coordenadas, as filiais com localização conhecida são ordenadas por distância em linha reta. O diretório fornece endereço e os telefones publicados. A quantidade na prateleira continua sem confirmação.
