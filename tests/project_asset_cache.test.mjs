import test from 'node:test';
import assert from 'node:assert/strict';
import {projectAssetCache} from '../extension/project_asset_cache.js';
import {FlowClient} from '../extension/flow_client.js';

const storage=()=>{const values={};return {values,get:async key=>({[key]:values[key]}),set:async row=>Object.assign(values,row)};};
test('verified old cards are reused across jobs; new cards still open the editor',async()=>{
  const store=storage();const project='https://flow.google.com/u/2/project/cache-one';
  const first=await projectAssetCache(store,project,'one@example.com');
  const a=new FlowClient(1,null,first);let opened=0;
  a.dom=async op=>{if(op==='openCard')opened++;return op==='assetId'?'permanent-old':[{key:'old'}];};
  a.backToProject=async()=>{};
  assert.equal((await a.identifyCard({key:'old'})).assetId,'permanent-old');
  const second=await projectAssetCache(store,project,'one@example.com');
  const b=new FlowClient(2,null,second);
  b.dom=async(op,args)=>{if(op==='openCard'){opened++;assert.equal(args.key,'new');}return op==='assetId'?'permanent-new':[{key:'old'},{key:'new'}];};
  b.backToProject=async()=>{};
  assert.deepEqual((await b.inventory()).map(c=>c.assetId),['permanent-old','permanent-new']);
  assert.equal(opened,2);
  assert.deepEqual(Object.values(store.values)[0],[['old','permanent-old'],['new','permanent-new']]);
});
test('cache separates exact project, account and home',async()=>{
  const store=storage();const root='https://flow.google.com/u/2/project/cache-two';
  const base=await projectAssetCache(store,root,'base@example.com');base.assetIds.set('same','old');
  for(const [project,account] of [[root+'-other','base@example.com'],[root,'other@example.com'],[root.replace('/u/2/','/u/1/'),'base@example.com']]){
    assert.equal((await projectAssetCache(store,project,account)).assetIds.has('same'),false);
  }
});
test('persisted cache survives worker restart and ignores malformed entries',async()=>{
  const project='https://flow.google.com/u/2/project/cache-three';
  const key='verifiedAssetIds:v1:reload@example.com:'+project;
  const store=storage();store.values[key]=[['old','asset'],['invalid'],[null,'id']];
  const cache=await projectAssetCache(store,project,'reload@example.com');
  assert.deepEqual([...cache.assetIds],[['old','asset']]);
});
test('cached inventory never bypasses exact asset verification for download',async()=>{
  const f=new FlowClient(1,null,{assetIds:new Map([['old','expected']])});
  const operations=[];f.dom=async op=>{operations.push(op);return op==='assetId'?'different':true;};
  await assert.rejects(f.beginOriginalDownload(await f.identifyCard({key:'old'})),/difere/);
  assert.deepEqual(operations,['openCard','assetId']);
});

test('hundreds of cached cards require one DOM read, while unknown navigation refreshes the grid',async()=>{
  const cards=Array.from({length:250},(_,i)=>({key:'old'+i}));
  const f=new FlowClient(1,null,{assetIds:new Map(cards.map(c=>[c.key,c.key+'-id']))});
  f.dom=async()=>({needsRestore:false});
  let reads=0;f.videos=async()=>{reads++;return cards;};
  assert.equal((await f.inventory()).length,250);assert.equal(reads,1);
  let visited=false;
  f.videos=async()=>visited?[{key:'replacement'}]:[{key:'new'},...cards];
  f.identifyCard=async card=>{visited=true;return {...card,assetId:card.key+'-id'};};
  const ids=(await f.inventory()).map(c=>c.assetId);
  assert.ok(ids.includes('new-id'));assert.ok(ids.includes('replacement-id'));
});
