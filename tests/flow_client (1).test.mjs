import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowClient} from '../extension/flow_client.js';
import {UI_PRIORITY} from '../extension/ui_queue.js';
const old='11111111-1111-4111-8111-111111111111';
const next='22222222-2222-4222-8222-222222222222';
const client=rows=>{const f=new FlowClient(1);f.checkBlockers=async()=>{};f.dom=async()=>false;f.videos=async()=>rows;f.inventory=async()=>rows;return f;};

test('RPC result polling refreshes only the saved project and finds the result without another submission',async()=>{
  const project='https://flow.google.com/u/2/project/saved';
  const f=client([]);let reloads=0;const priorities=[];
  f.dom=async op=>op==='project'?{isProject:true,url:project}:op==='audioFailures'?[]:false;
  f.send=async type=>{assert.equal(type,'reload');reloads++;};
  f.wait=async fn=>assert.ok(await fn());f.ensureAllMedia=async()=>{};
  f.withUi=()=>{throw Error('Result refresh must not take the global UI lease');};
  f.readyInventory=async()=>reloads?[{assetId:next}]:[];
  const result=await f.waitVideo([],Date.now(),()=>{},()=>false,null,{baseline:[],onRetry:null,refreshWhileWaiting:true,refreshIntervalMs:0,project});
  assert.equal(result.assetId,next);assert.equal(reloads,1);assert.deepEqual(priorities,[]);
  f.dom=async()=>({isProject:true,url:project+'-other'});
  await assert.rejects(f.refreshSubmittedProject({refreshWhileWaiting:true,refreshIntervalMs:0,project},0),/Projeto mudou/);
  assert.equal(reloads,1);
});

test('normal UI polling never reloads for the RPC observer option when disabled',async()=>{
  const f=new FlowClient(1);f.send=async()=>{throw Error('No reload');};
  assert.equal(await f.refreshSubmittedProject(null,123),123);
  assert.equal(await f.refreshSubmittedProject({refreshWhileWaiting:false},123),123);
});

test('provider failure details survive pause without URLs, UI actions or extra retries',async()=>{
  const f=client([]);
  f.dom=async()=>[{key:'new-failure',retriable:false,reason:'Generation unavailable. https://example.test/private?token=secret'}];
  f.withUi=()=>{throw Error('A diagnostic must not perform UI actions');};
  await assert.rejects(f.waitVideo([],Date.now(),()=>{},()=>false,null,{baseline:[],onRetry:null}),e=>{
    assert.equal(e.kind,'generation_failed');
    assert.match(e.message,/Generation unavailable\. \[link\]/);
    assert.ok(!e.message.includes('token=secret'));
    return true;
  });
});
test('pending generation never takes a focus-sensitive UI slot just to poll',async()=>{
  const f=client([{key:'old'}]);f.assetIds.set('old',old);f.dom=async()=>false;
  f.withUi=()=>{throw Error('Pending polling must remain read-only');};
  await assert.rejects(f.waitVideo([old],Date.now(),()=>{},()=>true),/Pausado enquanto/);
});
test('a visible new card promotes permanent-ID resolution ahead of scene preparation',async()=>{
  const f=client([{key:'cached',assetId:old},{key:'new',assetId:next}]);f.assetIds.set('cached',old);
  const priorities=[];f.withUi=async(action,priority)=>{priorities.push(priority);return action();};
  assert.equal((await f.waitVideo([old],Date.now(),()=>{},()=>false)).assetId,next);
  assert.deepEqual(priorities,[UI_PRIORITY.result]);
});
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
  f.dom=async(op)=>{if(op==='gridState')return {needsRestore:false};if(op==='audioFailures')return failed?[{key:'failure',retriable:true}]:[];
    assert.equal(op,'retryAudio');assert.equal(intents,1);assert.ok(verified);failed=false;return true;};
  f.verify=async model=>{assert.equal(model,'lower');verified=true;};
  const result=await f.waitVideo([],Date.now(),()=>{},()=>false,null,{baseline:[],onRetry:async()=>{intents++;}});
  assert.equal(result.assetId,next);assert.equal(intents,1);
});
test('submission uses trusted transport and rejects disabled generation controls',async()=>{
  for(const disabled of [true,false]){
    const events=[];
    const f=new FlowClient(1,async m=>{events.push(m);if(m.type==='dom'&&m.op==='blockers')return null;if(m.type==='dom'&&m.op==='generationState')return {pending:events.some(e=>e.type==='clickControl')?1:0,videos:0,errors:0};if(m.type==='clickControl'){if(disabled)throw Error('Controle desabilitado');return true;}throw Error('Unexpected transport');});
    if(disabled)await assert.rejects(f.submit(),/desabilitado/);else await f.submit();
    assert.equal(events.filter(m=>m.type==='clickControl').length,1);
  }
});
test('single generation detects explicit failure without retry and ignores historic failures',async()=>{
  const f=client([{assetId:next}]);
  f.dom=async()=>[{key:'historic',retriable:true}];
  assert.equal((await f.waitVideo([],Date.now(),()=>{},()=>false,null,{baseline:['historic'],onRetry:null})).assetId,next);
  f.dom=async()=>[{key:'new',retriable:true}];
  await assert.rejects(f.waitVideo([],Date.now(),()=>{},()=>false,null,{baseline:[],onRetry:null}),e=>e.kind==='generation_failed');
  f.dom=async()=>[{key:'new',kind:'account_limit'}];
  await assert.rejects(f.waitVideo([],Date.now(),()=>{},()=>false,null,{baseline:[],onRetry:null}),e=>e.kind==='account_limit');
});

test('unacknowledged click pauses without sending a second generation',async()=>{
  let clicks=0;
  const f=new FlowClient(1,async m=>{if(m.type==='clickControl'){clicks++;return;}if(m.op==='blockers')return null;if(m.op==='point')return {x:10,y:20};if(m.op==='generationState')return {pending:0,videos:0,errors:0};throw Error('Unexpected transport');});
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


test('account identity is required and matched by email, independent of index',async()=>{
 const f=new FlowClient(1,async m=>({email:'owner@example.com',home:'https://flow.google.com/u/2/'}));
 await assert.rejects(f.verifyAccount(null),/vinculado/);
 await assert.rejects(f.verifyAccount('another@example.com'),/difere/);
 assert.equal((await f.verifyAccount('OWNER@example.com','https://flow.google.com/u/2/')).home,'https://flow.google.com/u/2/');
 await assert.rejects(f.verifyAccount('owner@example.com','https://flow.google.com/u/1/'),/Home visivel/);
});
test('active quota signals are classified and ordinary errors remain local',async()=>{
 const f=new FlowClient(1,async()=> 'You have hit your limits for generating videos');
 await assert.rejects(f.checkBlockers(),e=>e.kind==='account_limit');
 f.transport=async()=> 'Could not generate video';
 await assert.rejects(f.checkBlockers(),e=>!e.kind);
});

test('new quota card stops both candidate and free-x1 waits without retry',async()=>{
 const f=client([]);let retries=0;f.dom=async()=>[{key:'new_quota',kind:'account_limit',retriable:false}];
 await assert.rejects(f.waitCandidates([],Date.now(),[],1),e=>e.kind==='account_limit');
 await assert.rejects(f.waitVideo([],Date.now(),()=>{},()=>false,null,{baseline:[],onRetry:()=>{retries++;}}),e=>e.kind==='account_limit');
 assert.equal(retries,0);
});

test('auto-attached upload is accepted only after named frame identity matches',async()=>{
 const f=new FlowClient(1);const clicks=[];
 f.ensureAllMedia=async()=>{};f.closeSettings=async()=>{};
 f.dom=async(op,args)=>{
   if(op==='exists')return args.names.includes('Start');
   if(op==='removeFrames')return [];
   if(op==='assetExists'||op==='frameMatches')return true;
   throw Error('Unexpected '+op);
 };
 f.click=async names=>{clicks.push(names);};
 await f.uploadFrame(null,'frame_2.png','/frame_2.png');
 assert.equal(clicks.length,0);
});

test('Start disappearing is not accepted when the displayed frame is wrong',async()=>{
 const f=new FlowClient(1);
 f.ensureAllMedia=async()=>{};f.closeSettings=async()=>{};
 f.dom=async(op,args)=>{
   if(op==='exists')return args.names.includes('Start');
   if(op==='removeFrames')return [];
   if(op==='assetExists')return true;
   if(op==='frameMatches')return false;
   if(op==='frameState')return {hasImage:false,empty:true};
   throw Error('Unexpected '+op);
 };
 f.click=async()=>{throw Error('Start absent');};
 await assert.rejects(f.uploadFrame(null,'frame_2.png','/frame_2.png'),/Start absent/);
});

test('auto frame loading waits for identity instead of clicking absent Start',async()=>{
 const f=new FlowClient(1);let checks=0;
 f.ensureAllMedia=async()=>{};f.closeSettings=async()=>{};
 f.dom=async(op,args)=>{
   if(op==='exists')return args.names.includes('Start');
   if(op==='removeFrames')return [];
   if(op==='assetExists')return true;
   if(op==='frameMatches')return ++checks>1;
   if(op==='frameState')return {hasImage:true,empty:false};
   if(op==='frameSource')return 'loaded-frame';
   throw Error('Unexpected '+op);
 };
 f.click=async()=>{throw Error('Must not click absent Start');};
 await f.uploadFrame(null,'frame_2.png','/frame_2.png');
 assert.equal(checks,2);
});

test('different thumbnail host is verified against named read-only image preview',async()=>{
 for(const expected of ['correct','wrong']){
  const f=new FlowClient(1);let opened=0,returned=0;
  f.dom=async op=>({frameMatches:false,frameSource:'correct',selectAsset:{x:1,y:2},imageAssetSource:expected})[op];
  f.clickPoint=async()=>{opened++;};f.backToProject=async()=>{returned++;};
  if(expected==='correct')assert.equal(await f.confirmFrame('unique_frame.png'),true);
  else await assert.rejects(f.confirmFrame('unique_frame.png'),/difere do asset/);
  assert.equal(opened,1);assert.equal(returned,1);
 }
});
