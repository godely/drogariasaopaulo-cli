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

### Arquivo de estoque por filial

Se a rede fornecer um inventário físico autorizado, importe o CSV completo com o utilitário incluído e defina a idade máxima aceitável da observação. A configuração é exclusiva da Drogaria São Paulo.

```sh
python3 node_modules/paguemenos-cli/branch_inventory.py import --retailer drogariasaopaulo --database "$STOCK_DB" --snapshot-at "$FEED_TIME" "$FULL_CSV"
export DROGARIASAOPAULO_BRANCH_STOCK_DB="$STOCK_DB"
export DROGARIASAOPAULO_BRANCH_STOCK_MAX_AGE_MINUTES="$AGREED_MAX_AGE_MINUTES"
node cli.js stock "$SKU" --cep "$CEP" --all --json
```

As colunas são `retailer,id,store_code,quantity,timestamp`. O SKU e a filial usam os identificadores da Drogaria São Paulo. Quantidades ausentes ou antigas ficam desconhecidas. Após zeros explícitos nas filiais próximas, `--expand` permite consultar até 25 km e mostrar até dez filiais. A disponibilidade de um arquivo real com essas informações continua em investigação.
