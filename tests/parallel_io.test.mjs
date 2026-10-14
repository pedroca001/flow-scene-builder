import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowClient} from '../extension/flow_client.js';
import {createUiQueue} from '../extension/ui_queue.js';
import {submitScene} from '../extension/scene_submission.js';
import {parallelIoEnabled} from '../extension/core.js';

test('original bytes wait outside UI lease, allowing another project to submit',async()=>{
  const queue=createUiQueue();let release;const network=new Promise(r=>release=r);
  const f=new FlowClient(1);f.withUi=queue;const order=[];
  f.beginOriginalDownload=async()=>{order.push('original menu');};
  f.backToProject=async()=>{order.push('grid');};
  f.readOriginalDownload=async()=>{order.push('network');await network;return new Blob(['original']);};
  const download=f.concurrentOriginalDownload({assetId:'saved'});
  await new Promise(r=>setImmediate(r));
  await queue(async()=>order.push('other submit'));
  assert.deepEqual(order,['original menu','grid','network','other submit']);
  release();assert.equal(await (await download).text(),'original');
});

test('wrong original asset cannot arm or download another result',async()=>{
  const f=new FlowClient(1);const ops=[];
  f.dom=async op=>{ops.push(op);return op==='assetId'?'wrong':true;};
  await assert.rejects(f.concurrentOriginalDownload({assetId:'saved'}),/difere/);
  assert.deepEqual(ops,['openCard','assetId']);
});

test('failed/truncated original transfers release their per-tab buffer',async()=>{
  for(const response of [Error('fetch failed'),{offset:0,size:10,data:''}]){
    const f=new FlowClient(1);let released=0;
    f.dom=async op=>{if(op==='releaseDownload'){released++;return true;}
      if(response instanceof Error)throw response;return response;};
    await assert.rejects(f.readOriginalDownload(),/fetch failed|interrompida/);
    assert.equal(released,1);
  }
});

function submissionFixture(){
  const events=[];const host={ask:async(op,args)=>{events.push([op,args]);}};
  const job={folder:'job',account_email:'owner@example.com',project_creation:{home:'https://flow.google.com/u/1/'},model_key:'lower',duration_seconds:6};
  const scene={number:1,outputs_per_prompt:1,browser_frame_path:'C:\\frames\\one.png',prompt:'same original prompt'};
  const flow={
    verifyAccount:async()=>({email:job.account_email,home:job.project_creation.home}),
    inventory:async()=>[{assetId:'old'}],dom:async()=>[{key:'historic'}],
    configure:async(...args)=>events.push(['configure',args]),
    beginFrameUpload:async()=>events.push(['drop']),waitFrameUpload:async()=>{},
    finishFrameUpload:async()=>events.push(['frame verified']),uploadFrame:async()=>events.push(['legacy upload']),
    prompt:async text=>events.push(['prompt',text]),verify:async()=>({credits:0}),submit:async()=>events.push(['click'])};
  return {flow,host,job,scene,events};
}

for (const platform of ['Win32','MacIntel']) test(`${platform}: slow upload frees UI and revalidates settings before exactly one submission`,async()=>{
  const fixture=submissionFixture();const queue=createUiQueue();let release;
  fixture.flow.waitFrameUpload=()=>new Promise(r=>release=r);
  const task=submitScene({...fixture,withUi:queue,parallelIo:parallelIoEnabled(platform)});
  await new Promise(r=>setImmediate(r));
  await queue(async()=>fixture.events.push(['other 8s project']));
  assert.ok(!fixture.events.some(e=>e[0]==='click'));
  release();const baseline=await task;
  assert.deepEqual(baseline,{baseline:['old'],failures:['historic']});
  assert.deepEqual(fixture.events.filter(e=>e[0]==='configure').map(e=>e[1]),[['lower',1,6],['lower',1,6]]);
  assert.ok(fixture.events.findIndex(e=>e[0]==='other 8s project')<fixture.events.findIndex(e=>e[0]==='frame verified'));
  assert.equal(fixture.events.filter(e=>e[0]==='submitted').length,1);
  assert.equal(fixture.events.filter(e=>e[0]==='click').length,1);
});

test('mismatched frame pauses before prompt/submission after asynchronous upload',async()=>{
  const fixture=submissionFixture();fixture.flow.finishFrameUpload=async()=>{throw Error('Wrong frame');};
  await assert.rejects(submitScene({...fixture,withUi:createUiQueue(),parallelIo:true}),/Wrong frame/);
  assert.ok(!fixture.events.some(e=>['prompt','submitted','click'].includes(e[0])));
});

test('macOS path retains one whole UI transaction and its original upload method',async()=>{
  const fixture=submissionFixture();let leases=0;
  await submitScene({...fixture,withUi:async action=>{leases++;return action();},parallelIo:false});
  assert.equal(leases,1);assert.equal(fixture.events.filter(e=>e[0]==='configure').length,1);
  assert.ok(fixture.events.some(e=>e[0]==='legacy upload'));
  assert.ok(!fixture.events.some(e=>e[0]==='drop'));
});
