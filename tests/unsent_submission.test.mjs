import test from 'node:test';
import assert from 'node:assert/strict';
import {submitScene} from '../extension/scene_submission.js';
import {FlowClient} from '../extension/flow_client.js';

for(const proven of [true,false])test(`only proven pre-input failure clears its reserved intent (${proven})`,async()=>{
  const calls=[];const failure=Error('UI failure');if(proven)failure.beforeInput=true;
  const flow={verifyAccount:async()=>({email:'owner',home:'home'}),inventory:async()=>[],dom:async()=>[],configure:async()=>{},uploadFrame:async()=>{},prompt:async()=>{},verify:async()=>({credits:0}),submit:async()=>{throw failure;}};
  await assert.rejects(submitScene({flow,host:{ask:async(op,args)=>calls.push({op,args})},job:{folder:'job'},scene:{number:1,browser_frame_path:'/frame.png',prompt:'exact'},withUi:fn=>fn()}),/UI failure/);
  assert.equal(calls.filter(c=>c.op==='submission_not_sent').length,proven?1:0);
  assert.equal(calls.filter(c=>c.op==='submitted').length,1);
  assert.equal(calls.filter(c=>c.op==='submission_observed').length,0);
});
test('preflight failure is unsent but acknowledgement timeout after click stays uncertain',async()=>{
  const before=new FlowClient(1);before.checkBlockers=async()=>{throw Error('preflight');};
  await assert.rejects(before.submit(),e=>e.beforeInput===true);
  const after=new FlowClient(2);after.checkBlockers=async()=>{};after.dom=async()=>({pending:0,videos:0,errors:0});after.send=async()=>({clicked:true});after.wait=async()=>{throw Error('ack timeout');};
  await assert.rejects(after.submit(),e=>!e.beforeInput&&/ack timeout/.test(e.message));
});
