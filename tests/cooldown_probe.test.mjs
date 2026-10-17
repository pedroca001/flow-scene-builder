import test from 'node:test';
import assert from 'node:assert/strict';
import {cooldownProbe} from '../extension/cooldown_probe.js';
const project='https://flow.google.com/u/2/project/test';
function fixture(block=false){
 const calls=[];const flow={checkBlockers:async()=>{calls.push('check');if(block)throw Error('Active challenge');},dom:async op=>op==='project'?{url:project}:op==='generationState'?{pending:0,errors:1}:null,
 send:async type=>calls.push(type),wait:async fn=>assert.equal(await fn(),true),backToProject:async()=>{},
 verifyAccount:async()=>({email:'owner',home:'https://flow.google.com/u/2/'}),configure:async()=>({credits:0}),inventory:async()=>[{assetId:'prior'}]};
 const host={ask:async(op,args)=>{calls.push(op);assert.equal(op,'cooldown_ready');assert.equal(args.evidence.blockers,null);return {resume:true};}};
 return {calls,args:{flow,host,job:{folder:'same',project,account_email:'owner',project_creation:{home:'https://flow.google.com/u/2/'}},withUi:fn=>fn()}};
}
test('cooldown probe verifies current UI and never presses generation or retry',async()=>{
 const f=fixture();assert.equal((await cooldownProbe(f.args)).resume,true);
 assert.deepEqual(f.calls,['check','reload','check','cooldown_ready']);
});
test('active blocker prevents every recovery authorization and generation',async()=>{
 const f=fixture(true);await assert.rejects(cooldownProbe(f.args),/Active challenge/);
 assert.deepEqual(f.calls,['check']);
});
