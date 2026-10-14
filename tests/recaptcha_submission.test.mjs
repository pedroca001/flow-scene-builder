import test from 'node:test';
import assert from 'node:assert/strict';
import {generationRequest,harvestAppRequest,replayAppRequest} from '../extension/recaptcha_submission.js';
import {FlowClient} from '../extension/flow_client.js';
import {dispatch} from '../extension/transport.js';
const pageUrl='https://flow.google.com/project/11111111-1111-4111-8111-111111111111';
const token='0c'+'a'.repeat(120);
const request=(rpc='MZZa6b',bodyToken=token)=>({url:`https://flow.google.com/_/AiSandboxAngularFrontend/data/batchexecute?rpcids=${rpc}`,method:'POST',postData:new URLSearchParams({'f.req':JSON.stringify([[[rpc,JSON.stringify({prompt:'canonical',frame:'frame-id',model:'lower',token:bodyToken}),null,'generic']]]),at:'fixture-session'}).toString()});
function eventBus(){const listeners=new Set();return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit:(params,tabId=1)=>{for(const fn of listeners)fn({tabId},'Fetch.requestPaused',params);},get size(){return listeners.size;}};}

test('only the recognized same-origin video request is captured without modifying payload',()=>{
  const input=request(),output=generationRequest(input,pageUrl);
  assert.equal(output.body,input.postData);assert.equal(output.rpc,'MZZa6b');
  assert.equal(generationRequest({...input,url:input.url.replace('flow.google.com','example.com')},pageUrl),null);
  assert.equal(generationRequest(request('metadata',''),pageUrl),null);
  assert.throws(()=>generationRequest(request('unknown'),pageUrl),/nao reconhecido/);
  assert.throws(()=>generationRequest(request('MZZa6b',''),pageUrl),/invalido/);
});
test('metadata continues, generation aborts, and another tab never participates',async()=>{
  const events=eventBus(),commands=[];
  const result=await harvestAppRequest({tabId:1,pageUrl,events,send:async(method,args)=>commands.push({method,args}),click:async()=>{
    events.emit({requestId:'other',request:request()},2);
    events.emit({requestId:'metadata',request:request('metadata','')});
    events.emit({requestId:'generation',request:request()});
  }});
  assert.equal(result.body,request().postData);
  assert.deepEqual(commands.filter(c=>c.method==='Fetch.continueRequest').map(c=>c.args.requestId),['metadata']);
  assert.deepEqual(commands.filter(c=>c.method==='Fetch.failRequest').map(c=>c.args.requestId),['generation']);
  assert.equal(commands.at(-1).method,'Fetch.disable');assert.equal(events.size,0);
});
test('missing postData uses Network networkId, never the Fetch requestId',async()=>{
  const events=eventBus(),commands=[];
  await harvestAppRequest({tabId:1,pageUrl,events,send:async(method,args)=>{commands.push({method,args});if(method==='Network.getRequestPostData')return {postData:request().postData};},click:async()=>events.emit({requestId:'fetch-id',networkId:'network-id',request:{...request(),postData:undefined}})});
  assert.deepEqual(commands.find(c=>c.method==='Network.getRequestPostData').args,{requestId:'network-id'});
});
test('unrecognized token-bearing and tokenless generation fail closed; cleanup runs',async()=>{
  for(const input of [request('unknown'),request('MZZa6b','')]){
    const events=eventBus(),commands=[];
    await assert.rejects(harvestAppRequest({tabId:1,pageUrl,events,send:async method=>commands.push(method),click:async()=>events.emit({requestId:'generation',request:input})}),/abortada|invalido/);
    assert.ok(commands.includes('Fetch.failRequest'));assert.ok(!commands.includes('Fetch.continueRequest'));assert.equal(events.size,0);
  }
});
test('timeout sends one click and cleans interception without replay or retry',async()=>{
  const events=eventBus(),commands=[];let clicks=0;
  await assert.rejects(harvestAppRequest({tabId:1,pageUrl,events,send:async method=>commands.push(method),click:async()=>clicks++,timeout:5}),error=>error.kind==='recaptcha_capture_timeout');
  assert.equal(clicks,1);assert.equal(commands.at(-1),'Fetch.disable');assert.equal(events.size,0);
});
test('replay preserves exact body once and rejects HTTP200 unusual activity and changed project',async()=>{
  const previous={location:globalThis.location,XMLHttpRequest:globalThis.XMLHttpRequest};let response='',sent=[];
  globalThis.location={href:pageUrl,origin:'https://flow.google.com'};
  globalThis.XMLHttpRequest=class{open(){}setRequestHeader(){}send(body){sent.push(body);this.status=200;this.responseText=response;this.onload();}};
  const input=generationRequest(request(),pageUrl);
  try{
    response=JSON.stringify([['wrb.fr','MZZa6b','[["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222"]]',null,null,null,'generic']]);
    assert.equal((await replayAppRequest(input)).ok,true);assert.equal(sent[0],input.body);
    response=JSON.stringify([['wrb.fr','MZZa6b',null,null,null,[7,'PUBLIC_ERROR_UNUSUAL_ACTIVITY'],'generic']]);
    const failed=await replayAppRequest(input);assert.equal(failed.ok,false);assert.equal(failed.error,'PUBLIC_ERROR_UNUSUAL_ACTIVITY');assert.equal(failed.definitiveRejection,true);assert.equal(failed.raw,undefined);
    response='200 without an RPC frame';assert.equal((await replayAppRequest(input)).ok,false);
    globalThis.location.href=pageUrl+'/edit/other';assert.equal((await replayAppRequest(input)).error,'project_changed');assert.equal(sent.length,3);
  }finally{Object.assign(globalThis,previous);}
});
test('client persists abort baseline before replay; no phantom result and no second send',async()=>{
  const calls=[];let aborted=false;
  const f=new FlowClient(1,async m=>{
    calls.push(m.type);
    if(m.type==='dom'){
      if(m.op==='blockers')return null;
      if(m.op==='generationState')return {pending:0,videos:0,errors:aborted?1:0};
      if(m.op==='audioFailures')return aborted?[{key:'a'.repeat(64),kind:null}]:[];
      if(m.op==='project')return {isProject:true};
    }
    if(m.type==='harvestGeneration'){aborted=true;return {handle:'opaque',rpc:'MZZa6b',requestAborted:true};}
    return true;
  });
  await f.submit({harvest:true,onHarvested:async keys=>{calls.push('receipt');assert.deepEqual(keys,['a'.repeat(64)]);}});
  assert.ok(calls.indexOf('receipt')<calls.indexOf('replayGeneration'));assert.equal(calls.filter(c=>c==='replayGeneration').length,1);assert.ok(calls.includes('reload'));assert.equal(calls.at(-1),'discardHarvest');
});
test('receipt failure discards the fresh token and never replays',async()=>{
  const calls=[];let aborted=false;
  const f=new FlowClient(1,async m=>{
    calls.push(m.type);
    if(m.op==='blockers')return null;
    if(m.op==='generationState')return {pending:0,videos:0,errors:aborted?1:0};
    if(m.op==='audioFailures')return aborted?[{key:'a'.repeat(64)}]:[];
    if(m.type==='harvestGeneration'){aborted=true;return {handle:'opaque',rpc:'MZZa6b',requestAborted:true};}
    return true;
  });
  await assert.rejects(f.submit({harvest:true,onHarvested:async()=>{throw Error('receipt unavailable');}}),/receipt unavailable/);
  assert.ok(!calls.includes('replayGeneration'));assert.equal(calls.at(-1),'discardHarvest');
});
test('transport keeps token internal and consumes handle once even if replay fails',async()=>{
  const previous=globalThis.chrome,events=eventBus();let replays=0;
  globalThis.chrome={tabs:{get:async()=>({url:pageUrl}),update:async()=>{}},
    debugger:{onEvent:events,attach:async()=>{},detach:async()=>{},sendCommand:async(_target,method,args)=>{
      if(method==='Input.dispatchMouseEvent'&&args.type==='mouseReleased')events.emit({requestId:'generation',request:request()});
    }},
    scripting:{executeScript:async({func})=>{
      if(func===replayAppRequest){replays++;return [{result:{ok:false,httpStatus:200,error:'PUBLIC_ERROR_UNUSUAL_ACTIVITY',definitiveRejection:true}}];}
      return [{result:{x:10,y:20,disabled:false}}];
    }}};
  try{
    const receipt=await dispatch({type:'harvestGeneration',tabId:1});
    assert.deepEqual(Object.keys(receipt).sort(),['handle','requestAborted','rpc']);assert.ok(!JSON.stringify(receipt).includes(token));
    await assert.rejects(dispatch({type:'replayGeneration',tabId:1,handle:receipt.handle}),error=>error.kind==='recaptcha_rejected'&&error.definitiveRejection===true);
    await assert.rejects(dispatch({type:'replayGeneration',tabId:1,handle:receipt.handle}),/ja consumido/);
    assert.equal(replays,1);assert.equal(events.size,0);
  }finally{globalThis.chrome=previous;}
});
test('batch abort preserves duplicate historical failure hashes and original output count',async()=>{
  const key='a'.repeat(64),calls=[];let aborted=false;
  const f=new FlowClient(1,async m=>{
    calls.push(m.type);
    if(m.op==='blockers')return null;
    if(m.op==='generationState')return {pending:0,videos:0,errors:aborted?4:1};
    if(m.op==='audioFailures')return Array.from({length:aborted?4:1},()=>({key}));
    if(m.op==='project')return {isProject:true};
    if(m.type==='harvestGeneration'){aborted=true;return {handle:'opaque',rpc:'MZZa6b',requestAborted:true};}
    return true;
  });
  await f.submit({harvest:true,outputs:3,onHarvested:async keys=>assert.deepEqual(keys,[key,key,key,key])});
  assert.equal(calls.filter(c=>c==='harvestGeneration').length,1);assert.equal(calls.filter(c=>c==='replayGeneration').length,1);
});
test('confirmed CDP abort works without a Failed card and with a transient pending placeholder',async()=>{
  const calls=[];let aborted=false;
  const f=new FlowClient(1,async m=>{
    calls.push(m.type);
    if(m.op==='blockers')return null;
    if(m.op==='generationState')return {pending:aborted?1:0,videos:0,errors:0};
    if(m.op==='audioFailures')return [];
    if(m.op==='project')return {isProject:true};
    if(m.type==='harvestGeneration'){aborted=true;return {handle:'opaque',rpc:'MZZa6b',requestAborted:true};}
    return true;
  });
  await f.submit({harvest:true,onHarvested:async(keys,rpc,proof)=>{
    assert.deepEqual(keys,[]);assert.equal(rpc,'MZZa6b');assert.equal(proof.requestAborted,true);calls.push('receipt');
  }});
  assert.ok(calls.indexOf('receipt')<calls.indexOf('replayGeneration'));
  assert.equal(calls.filter(c=>c==='replayGeneration').length,1);assert.ok(calls.includes('reload'));
});
