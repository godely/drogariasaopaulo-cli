import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

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
    if (url.pathname.includes('catalog_system')) return Response.json([{items:[{itemId:'42',name:'Example',sellers:[{sellerId:'1'}]}]}]);
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
});
