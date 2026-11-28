import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';

test('stock executable joins only this banner and prints explicit zero and dated quantities', async t => {
  const folder = await mkdtemp(join(tmpdir(),'dsp-stock-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const database = join(folder,'stock.db'), csv = join(folder,'inventory.csv');
  const time = new Date(Date.now()-60000).toISOString();
  const rows=['retailer,id,store_code,quantity,timestamp', ...['1','2','3'].map((id,i)=>['drogariasaopaulo','42',id,i,time].join(','))];
  await writeFile(csv,rows.join('\n'));
  execFileSync('python3',['node_modules/paguemenos-cli/branch_inventory.py','import','--retailer','drogariasaopaulo',
    '--database',database,'--snapshot-at',time,csv]);
  const mock = join(folder,'storefront.mjs');
  await writeFile(mock,`globalThis.fetch=async input=>{
    const url=new URL(input);
    if (url.host!=='www.drogariasaopaulo.com.br') throw Error('unexpected retailer');
    if (url.pathname.includes('catalog_system')) return Response.json([{items:[{itemId:'42',name:'Example',sellers:[{sellerId:'1',sellerName:'Drogaria São Paulo',commertialOffer:{Price:10}}]}]}]);
    if (!url.pathname.endsWith('nossas-lojas.js')) throw Error('unexpected URL');
    return Response.json({retorno:[
      {codigo:1,nome:'DSP Centro',latitude:1,longitude:1},
      {codigo:2,nome:'DSP Norte',latitude:1.01,longitude:1},
      {codigo:3,nome:'Drogarias Pacheco',latitude:1.001,longitude:1},
    ]});
  };`);
  const cmd = ['--import',mock,'cli.js','stock','42','--lat','1','--lon','1','--all'];
  const options={encoding:'utf8',env:{...process.env,DROGARIASAOPAULO_BRANCH_STOCK_DB:database,DROGARIASAOPAULO_BRANCH_STOCK_MAX_AGE_MINUTES:'30'}};
  const result = JSON.parse(execFileSync(process.execPath,[...cmd,'--json'],options));
  assert.deepEqual(result.stores.map(s=>[s.id,s.quantity]),[['1',0],['2',1]]);
  assert.equal(result.coverage.checkedStores,2);
  assert.match(execFileSync(process.execPath,cmd,options),/DSP Norte/);
  const run=(command,args)=> {
    const result=spawnSync(process.execPath,['--import',mock,'cli.js',command,...args,'--lat','1','--lon','1','--json'],options);
    assert.ok([0,3].includes(result.status),result.stderr);
    return JSON.parse(result.stdout);
  };
  const fixed=run('compare',['42','--store','nearest','--brand-only']);
  assert.equal(fixed.purchase.fixedBranchId,'1'); assert.equal(fixed.products[0].branchQuantity,0);
  const elsewhere=run('compare',['42','--brand-only']);
  assert.equal(elsewhere.products[0].closestStore.id,'2');
  const basket=run('plan',['42','42']);
  assert.equal(basket.status,'partial');
  assert.equal(basket.plans[0].totalBRL,10);
  const fixedBasket=run('plan',['42','42','--store','nearest']);
  assert.equal(fixedBasket.tables[1].rows[0].store.id,'1');
  assert.equal(fixedBasket.tables[1].rows[0].store.quantity,0);

});

test('plan quotes only resolved lines at checkout and keeps an unknown pack out of the total', async t => {
  const folder = await mkdtemp(join(tmpdir(),'dsp-partial-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const mock = join(folder,'checkout.mjs');
  await writeFile(mock,`import assert from 'node:assert/strict';
    globalThis.fetch=async (input,options)=>{
      const url=new URL(input);
      assert.equal(url.hostname,'www.drogariasaopaulo.com.br');
      if(url.pathname.includes('catalog_system')) {
        const sku=url.searchParams.get('fq');
        assert.ok(['skuId:42','skuId:99'].includes(sku));
        return Response.json(sku==='skuId:99' ? [] : [{items:[{itemId:'42',name:'Pack 42',
          sellers:[{sellerId:'1',sellerName:'Drogaria São Paulo',commertialOffer:{Price:10}}]}]}]);
      }
      assert.ok(url.pathname.endsWith('orderForms/simulation'));
      assert.deepEqual(JSON.parse(options.body).items,[{id:'42',seller:'1',quantity:2}]);
      return Response.json({items:[{id:'42',seller:'1',availability:'available',quantity:2,sellingPrice:850,listPrice:1000}],
        logisticsInfo:[{itemIndex:0,itemId:'42',slas:[{id:'Entrega',deliveryChannel:'delivery'}]}]});
    };`);
  const env={...process.env};
  delete env.DROGARIASAOPAULO_BRANCH_STOCK_DB;
  const run=spawnSync(process.execPath,['--import',mock,'cli.js','plan','42','99','--lat','1','--lon','1','--quantity','A=2','--json'],{encoding:'utf8',env});
  assert.equal(run.status,3,run.stderr);
  const plan=JSON.parse(run.stdout);
  assert.equal(plan.status,'partial');
  assert.equal(plan.estimatedProductTotalBRL,null);
  assert.deepEqual(plan.pending.map(p=>[p.label,p.status]),[['B','unknown_sku']]);
  assert.deepEqual(plan.partialQuote.labels,['A']);
  assert.equal(plan.partialQuote.estimatedProductTotalBRL,17);
  assert.equal(plan.partialQuote.items[0].localStatus,'available');
});
