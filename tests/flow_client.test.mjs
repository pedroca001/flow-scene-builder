import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowClient} from '../extension/flow_client.js';
const old='11111111-1111-4111-8111-111111111111';
const next='22222222-2222-4222-8222-222222222222';
const client=rows=>{const f=new FlowClient(1);f.checkBlockers=async()=>{};f.inventory=async()=>rows;return f;};
test('recreated cards retain identity through permanent asset IDs',async()=>{
  const f=client([{key:'new-dom-key',assetId:old},{key:'candidate',assetId:next}]);
  assert.equal((await f.waitVideo([old],Date.now(),()=>{},()=>false)).assetId,next);
});
test('ambiguous results pause and legacy recovery requires explicit binding',async()=>{
  const f=client([{key:'a',assetId:old},{key:'b',assetId:next}]);
  await assert.rejects(f.waitVideo([],Date.now(),()=>{},()=>false),/Mais de um/);
  await assert.rejects(f.waitVideo(['legacy'],Date.now(),()=>{},()=>false),/Baseline legado/);
  assert.equal((await f.waitVideo(['legacy'],Date.now(),()=>{},()=>false,next)).assetId,next);
});
test('only a new explicitly recoverable audio failure receives a verified bounded retry',async()=>{
  const f=client([{key:'candidate',assetId:next}]);let failed=true;let intents=0;let verified=false;
  f.dom=async(op)=>{if(op==='audioFailures')return failed?[{key:'failure',retriable:true}]:[];
    assert.equal(op,'retryAudio');assert.equal(intents,1);assert.ok(verified);failed=false;return true;};
  f.verify=async model=>{assert.equal(model,'lower');verified=true;};
  const result=await f.waitVideo([],Date.now(),()=>{},()=>false,null,{baseline:[],onRetry:async()=>{intents++;}});
  assert.equal(result.assetId,next);assert.equal(intents,1);
});
test('submission uses trusted transport and rejects disabled generation controls',async()=>{
  for(const disabled of [true,false]){
    const events=[];
    const f=new FlowClient(1,async m=>{events.push(m);if(m.type==='dom'&&m.op==='blockers')return null;if(m.type==='dom'&&m.op==='generationState')return {pending:events.some(e=>e.type==='click')?1:0,videos:0,errors:0};if(m.type==='dom'&&m.op==='point')return {x:10,y:20,disabled};if(m.type==='click')return true;throw Error('Unexpected transport');});
    if(disabled)await assert.rejects(f.submit(),/desabilitado/);else await f.submit();
    assert.equal(events.filter(m=>m.type==='click').length,disabled?0:1);
  }
});

test('unacknowledged click pauses without sending a second generation',async()=>{
  let clicks=0;
  const f=new FlowClient(1,async m=>{if(m.type==='click'){clicks++;return;}if(m.op==='blockers')return null;if(m.op==='point')return {x:10,y:20};if(m.op==='generationState')return {pending:0,videos:0,errors:0};throw Error('Unexpected transport');});
  f.wait=async fn=>{assert.equal(await fn(),false);throw Error('No acknowledgement');};
  await assert.rejects(f.submit(),/No acknowledgement/);assert.equal(clicks,1);
});

test('x4 collects four unique new results and treats partial audio failure as unavailable',async()=>{
 const ids=[old,next,'33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
 const f=client(ids.map(assetId=>({assetId})));f.dom=async()=>[];
 assert.equal((await f.waitCandidates([],Date.now(),[])).cards.length,4);
 f.inventory=async()=>ids.slice(0,3).map(assetId=>({assetId}));f.dom=async()=>[{key:'a'.repeat(64)},{key:'a'.repeat(64)}];
 const partial=await f.waitCandidates([],Date.now(),['a'.repeat(64)]);
 assert.equal(partial.cards.length,3);assert.equal(partial.failed.length,1);
 f.inventory=async()=>[...ids,'55555555-5555-4555-8555-555555555555'].map(assetId=>({assetId}));f.dom=async()=>[];
 await assert.rejects(f.waitCandidates([],Date.now()),/Mais de 4/);
 f.inventory=async()=>[];f.dom=async()=>ids.map(key=>({key}));
 await assert.rejects(f.waitCandidates([],Date.now()),/alternativas falharam/);
});

test('x3 finishes at three results',async()=>{
 const f=new FlowClient(1,()=>{});
 f.inventory=async()=>[1,2,3].map(i=>({assetId:`${i}0000000-1111-4111-8111-111111111111`}));
 f.dom=async()=>[];
 assert.equal((await f.waitCandidates([],Date.now(),[],3)).cards.length,3);
});

test('new project is created by the home button once, never from an existing project',async()=>{
  let created=false,clicks=0;
  const f=new FlowClient(12,async m=>{
    if(m.op==='project')return {isProject:created,url:created?'https://flow.google.com/u/1/project/11111111-1111-4111-8111-111111111111':'https://flow.google.com/u/1/'};
    if(m.op==='exists')return true;
    if(m.op==='clickControl'){assert.ok(m.args.names.includes('Novo projeto'));clicks++;created=true;return true;}
    throw Error('Unexpected operation');
  });
  assert.match(await f.createProject(),/\/project\//);assert.equal(clicks,1);
  await assert.rejects(f.createProject(),/pagina inicial/);assert.equal(clicks,1);
});

test('the home account index can differ on another Mac',async()=>{
  let created=false;
  const f=new FlowClient(12,async m=>{
    if(m.op==='project')return {isProject:created,url:created?'https://flow.google.com/u/0/project/11111111-1111-4111-8111-111111111111':'https://flow.google.com/u/0/'};
    if(m.op==='exists')return true;
    if(m.op==='clickControl'){created=true;return true;}
    throw Error('Unexpected operation');
  });
  assert.match(await f.createProject(),/\/u\/0\/project\//);
});
