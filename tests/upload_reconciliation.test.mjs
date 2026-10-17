import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowClient} from '../extension/flow_client.js';

for(const blocked of [false,true])test(`missing upload restores its grid once without repeating upload (blocker=${blocked})`,async()=>{
  const f=new FlowClient(1);const ops=[];let grid=false;let elapsed=0;
  const originalNow=Date.now;Date.now=()=>elapsed;
  f.dom=async op=>{ops.push(op);if(op==='assetExists')return grid;if(op==='project')return {url:'https://flow.google.com/u/2/project/p/edit/11111111-1111-4111-8111-111111111111'};throw Error(op);};
  f.checkBlockers=async()=>{if(blocked)throw Error('Active blocker');};
  f.backToProject=async()=>{ops.push('restore grid');grid=true;};
  f.withUi=async fn=>{ops.push('UI lease');return fn();};
  f.send=async()=>{throw Error('No new upload allowed');};
  f.wait=async probe=>{assert.equal(await probe(),false);elapsed=16000;return probe();};
  try{
    if(blocked)await assert.rejects(f.waitFrameUpload('named.png'),/Active blocker/);
    else {assert.equal(await f.waitFrameUpload('named.png'),undefined);assert.equal(ops.filter(op=>op==='restore grid').length,1);}
    assert.equal(ops.filter(op=>op==='UI lease').length,1);
    if(blocked)assert.ok(!ops.includes('restore grid'));
  }finally{Date.now=originalNow;}
});
