import test from 'node:test';
import assert from 'node:assert/strict';
import {mayRecoverSubmission,recoverSubmission} from '../extension/submission_recovery.js';
import {sameFlowProject} from '../extension/core.js';

const job={folder:'/job',project:'https://flow.google.com/u/2/project/test',recaptcha_harvest:true,technical_retry_limit:2,account_email:'test@example.com',project_creation:{home:'https://flow.google.com/u/2/'}};
const scene={number:4,status:'submitted',baseline_ids:['prior'],recaptcha_delivery:{state:'rejected',definitive_rejection:true}};

test('recovery is bounded and never resets an accepted, uncertain or bound result',()=>{
  assert.equal(mayRecoverSubmission(job,scene),true);
  for(const delivery of [{state:'accepted'},{state:'prepared'},{state:'uncertain'},{state:'rejected',definitive_rejection:false}])assert.equal(mayRecoverSubmission(job,{...scene,recaptcha_delivery:delivery}),false);
  assert.equal(mayRecoverSubmission(job,{...scene,result_asset_id:'new'}),false);
  assert.equal(mayRecoverSubmission(job,{...scene,technical_retry_intents:[{},{}]}),false);
  assert.equal(mayRecoverSubmission(job,{...scene,technical_retry_intents:[{}],audio_retry_intents:[{}]}),false);
  assert.equal(mayRecoverSubmission({...job,technical_retry_limit:0},scene),false);
});

function fixture({ids=['prior'],pending=0,errors=0,project=job.project}={}){
  const calls=[];
  const flow={backToProject:async()=>calls.push('grid'),dom:async op=>op==='project'?{url:project}:({pending,errors}),
    send:async type=>calls.push(type),wait:async fn=>assert.equal(await fn(),true),ensureAllMedia:async()=>calls.push('allMedia'),
    inventory:async()=>ids.map(assetId=>({assetId})),configure:async()=>({credits:0}),verifyAccount:async()=>({email:job.account_email,home:job.project_creation.home})};
  const host={ask:async(op,args)=>{calls.push(op);assert.equal(op,'retry_missing');assert.deepEqual(args.evidence,{asset_ids:ids,pending:0,errors:0});assert.equal(args.observation.credits,0);}};
  return {calls,args:{flow,host,job,scene,seconds:8,withUi:async fn=>fn()}};
}

test('a confirmed rejection refreshes the same project and reconciles before authorizing a fresh attempt',async()=>{
  const f=fixture();assert.equal(await recoverSubmission(f.args),true);
  assert.deepEqual(f.calls,['grid','reload','allMedia','retry_missing']);
});

test('new video, pending generation or persisted error prevents any retry',async()=>{
  for(const evidence of [{ids:['prior','new']},{pending:1},{errors:1}]){
    const f=fixture(evidence);assert.equal(await recoverSubmission(f.args),false);assert.ok(!f.calls.includes('retry_missing'));
  }
  const f=fixture({project:job.project+'/other'});await assert.rejects(recoverSubmission(f.args),/Projeto mudou/);assert.ok(!f.calls.includes('reload'));
});

test('Google pli marker preserves exact account and project checks',async()=>{
  const f=fixture({project:job.project+'?pli=1'});assert.equal(await recoverSubmission(f.args),true);
  for(const other of [job.project.replace('/u/2/','/u/1/'),job.project+'-other',job.project+'/tools',job.project+'?pli=2',job.project+'?other=1',job.project.replace('flow.google.com','other.example')])assert.equal(sameFlowProject(other,job.project),false);
});
