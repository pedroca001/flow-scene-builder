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
test('legacy capture mode is rejected before upload, prompt or submission',async()=>{
  const f=fixture(true);f.args.job.recaptcha_harvest=true;
  await assert.rejects(submitScene(f.args),/captura desativado/);
  assert.deepEqual(f.calls,[]);
});

test('shared project baseline retains saved assets absent from virtualized grid',async()=>{
  const f=fixture(false);f.args.scene.known_project_asset_ids=['old-hidden','old-visible'];
  f.args.flow.inventory=async()=>[{assetId:'old-visible'},{assetId:'visible'}];
  let saved;
  f.args.host.ask=async(op,args)=>{if(op==='submitted')saved=args;return true;};
  await submitScene(f.args);
  assert.deepEqual(saved.baseline,['old-hidden','old-visible','visible']);
});

test('cadence acknowledgement is persisted only after the normal click is accepted',async()=>{
  const f=fixture(false);f.args.job.min_submission_interval_seconds=120;let clicked=false;const events=[];
  f.args.flow.submit=async()=>{clicked=true;events.push('click accepted');};
  f.args.host.ask=async(op)=>{
    if(op==='submission_gate')return {ready:true};
    if(op==='submitted')events.push('reserved');
    if(op==='submission_observed'){assert.ok(clicked);events.push('observed');}
    return true;
  };
  await submitScene(f.args);
  assert.deepEqual(events,['reserved','click accepted','observed']);
});
