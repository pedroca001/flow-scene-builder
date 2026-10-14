import test from 'node:test';
import assert from 'node:assert/strict';
import {submitScene} from '../extension/scene_submission.js';

function fixture(manual_send,parallelIo=true){
  const calls=[];
  const flow={tabId:17,verifyAccount:async()=>({email:'test@example.com',home:'https://flow.google.com/u/1/'}),
    inventory:async()=>[],dom:async op=>op==='audioFailures'?[]:{pending:1,errors:0},
    configure:async()=>calls.push('configure'),beginFrameUpload:async()=>calls.push('upload'),
    uploadFrame:async()=>calls.push('upload'),waitFrameUpload:async()=>{},finishFrameUpload:async()=>calls.push('attach'),
    prompt:async()=>calls.push('prompt'),verify:async()=>({credits:0}),submit:async()=>calls.push('send'),
    wait:async predicate=>assert.equal(await predicate(),true),videos:async()=>[]};
  const host={ask:async(op)=>{calls.push(op);return true;}};
  return {calls,args:{flow,host,job:{folder:'/job',manual_send,model_key:'lower',account_email:'test@example.com'},
    scene:{number:1,prompt:'canonical',browser_frame_path:'C:/frame.png'},withUi:async fn=>fn(),parallelIo}};
}
test('manual mode uploads and reserves but never pastes or clicks Send',async()=>{
  const f=fixture(true);await submitScene(f.args);
  assert.ok(f.calls.includes('upload'));assert.ok(f.calls.includes('attach'));
  assert.ok(f.calls.indexOf('submitted')<f.calls.indexOf('manual_ready'));
  assert.ok(f.calls.includes('manual_sent'));assert.ok(!f.calls.includes('prompt'));assert.ok(!f.calls.includes('send'));
});
test('default retains automatic prompt and Send',async()=>{
  const f=fixture(false);await submitScene(f.args);
  assert.ok(f.calls.includes('prompt'));assert.ok(f.calls.includes('send'));assert.ok(!f.calls.includes('manual_ready'));
});
test('Mac default retains original transaction',async()=>{
  const f=fixture(false,false);await submitScene(f.args);
  assert.ok(f.calls.includes('prompt'));assert.ok(f.calls.includes('send'));assert.ok(!f.calls.includes('attach'));
});
test('recaptcha mode uses automatic canonical prompt with a persisted abort receipt',async()=>{
  const f=fixture(true);f.args.job.recaptcha_harvest=true;
  f.args.flow.submit=async options=>{assert.equal(options.harvest,true);assert.equal(options.outputs,1);f.calls.push('send');await options.onHarvested(['a'.repeat(64)],'MZZa6b',{requestAborted:true});};
  const result=await submitScene(f.args);
  assert.ok(f.calls.includes('prompt'));assert.ok(f.calls.includes('send'));assert.ok(f.calls.includes('harvested'));assert.ok(!f.calls.includes('manual_ready'));
  assert.deepEqual(result.failures,[]);
});
