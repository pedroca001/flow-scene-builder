import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {access, mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {doctor, externalRoot, launchProfile, prototypeRoot, ROOT, removeOwnDirectory} from '../browser_executor/runtime.mjs';
import {PlaywrightTransport, PlaywrightFlowClient} from '../browser_executor/transport.mjs';
import {startFixture} from '../browser_executor/fixture.mjs';
import {submitScene} from '../extension/scene_submission.js';
import {withUi} from '../extension/ui_queue.js';
import {openManualBrowser,manualBrowserStatus} from '../browser_executor/manual_browser.mjs';
import {preflight} from '../browser_executor/preflight.mjs';

function options(args){
  const result={command:args.shift()||'doctor',headed:false,keep:false,seconds:55};
  for(let i=0;i<args.length;i++){
    const value=args[i];if(value==='--headed'){result.headed=true;continue;}if(value==='--keep'){result.keep=true;continue;}
    const keys={'--home':'home','--account-email':'email','--seconds':'seconds','--image':'image','--preset':'preset','--folder':'folder'};
    if(!keys[value]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Argumento desconhecido ou incompleto.');result[keys[value]]=args[++i];
  }
  result.seconds=Number(result.seconds);if(!Number.isInteger(result.seconds)||result.seconds<1||result.seconds>55)throw Error('Use seconds de 1 a 55.');
  return result;
}

async function pythonExecutable(){
  if(process.env.FLOW_PLAYWRIGHT_PYTHON){await access(process.env.FLOW_PLAYWRIGHT_PYTHON);return process.env.FLOW_PLAYWRIGHT_PYTHON;}
  const prefix=join(homedir(),'.local','share','flow_scene_builder','venv');
  const candidate=join(prefix,...(process.platform==='win32'?['Scripts','python.exe']:['bin','python3']));
  try{await access(candidate);return candidate;}catch(e){if(e.code!=='ENOENT')throw e;}
  return process.platform==='win32'?'python':'python3';
}

async function helper(action,root,extras=[]){
  const exe=await pythonExecutable();
  return new Promise((ok,no)=>{
    const child=spawn(exe,['-X','utf8',join(ROOT,'scripts','playwright_fixture.py'),action,'--root',root,...extras],{windowsHide:true,env:{...process.env,PYTHONUTF8:'1'},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',part=>stdout+=part);child.stderr.on('data',part=>stderr+=part);child.on('error',no);
    const timer=setTimeout(()=>child.kill(),60000);
    child.on('close',code=>{clearTimeout(timer);if(code!==0){no(Error(`Offline media helper failed (${action}): ${stderr.slice(-1800)}`));return;}try{ok(JSON.parse(stdout));}catch{no(Error('Offline media helper returned invalid JSON.'));}});
  });
}

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function smoke({headed=false,keep=false}={}){
  const base=await externalRoot(prototypeRoot());await mkdir(join(base,'proofs'),{recursive:true});
  const run=await mkdtemp(join(base,'proofs','smoke_'));let context,fixture;
  try{
    const manifest=await helper('prepare',run);fixture=await startFixture(manifest.clips);
    const downloads=join(run,'downloads');await mkdir(downloads);
    const profile=join(run,'profile');
    const open=async()=>{
      context=await launchProfile(profile,{headless:!headed});
      await context.route('**/*',route=>new URL(route.request().url()).origin===fixture.origin?route.continue():route.abort());
      const page=context.pages()[0]||await context.newPage();await page.goto(fixture.url);
      assert.equal(context.serviceWorkers().length,0);
      assert.equal(await page.evaluate(()=>typeof globalThis.chrome?.runtime?.connectNative),'undefined');
      const cdp=await context.newCDPSession(page);const targets=await cdp.send('Target.getTargets');
      assert.ok(!targets.targetInfos.some(target=>target.url.startsWith('chrome-extension://')));await cdp.detach();
      const transport=new PlaywrightTransport(page,{mode:'fixture',fixtureOrigin:fixture.origin,downloadRoot:downloads});
      const flow=new PlaywrightFlowClient(transport);flow.withUi=withUi;return {page,transport,flow};
    };
    let browser=await open();
    await browser.flow.renameProject('2000-01-01 00:00:00.000');
    await browser.page.locator('#generate').evaluate(e=>e.disabled=true);
    await assert.rejects(browser.transport.dispatch({type:'clickControl',names:['Start generation']}),/desabilitado/);
    assert.equal(await browser.page.evaluate(()=>JSON.parse(localStorage.fixtureState).count),0);
    await browser.page.locator('#generate').evaluate(e=>e.disabled=false);
    const host={ask:async(op,args)=>{
      if(op==='progress'){process.stderr.write(args.phase+'\n');return true;}
      if(op==='submitted')return helper('submitted',run,['--scene',String(args.scene),'--baseline',JSON.stringify(args.baseline)]);
      throw Error('Unknown fixture host operation.');
    }};
    const downloadsReport=[];
    for(let number=1;number<=4;number++){
      let scene=await helper('next',run);
      assert.equal(scene.number,number);assert.equal(scene.ready_to_submit,true);
      const job={folder:manifest.folder,account_email:'fixture@example.invalid',project_creation:{home:fixture.origin+'/u/0/'},model_key:'lower',duration_seconds:8};
      const receipt=await submitScene({flow:browser.flow,host,job,scene,withUi,parallelIo:true});
      if(number===1){
        // Stop after the persisted intent and one click, before collecting the result.
        await browser.page.evaluate(()=>localStorage.prototypePersistence='confirmed');
        await context.close();context=null;browser=await open();
        assert.equal(await browser.page.evaluate(()=>localStorage.prototypePersistence),'confirmed');
        assert.equal(await browser.flow.dom('projectTitle'),'2000-01-01 00:00:00.000');
        scene=await helper('next',run);assert.equal(scene.status,'submitted');assert.equal(Boolean(scene.ready_to_submit),false);
      }
      const card=await browser.flow.waitVideo(receipt.baseline,Date.now(),()=>{},()=>false,null,{baseline:receipt.failures,onRetry:null});
      const strategy=number%2?'browser':'ui_bytes',target=join(downloads,`scene_${number}.mp4`);
      await browser.flow.downloadOriginalTo(card,target,{strategy});
      assert.equal(sha(await readFile(target)),sha(await readFile(manifest.clips[number-1])));
      await helper('ingest',run,['--scene',String(number),'--video',target,'--asset-id',card.assetId]);
      downloadsReport.push({scene:number,strategy,sha256:sha(await readFile(target))});
      await browser.flow.backToProject();
    }
    const state=await browser.page.evaluate(()=>JSON.parse(localStorage.fixtureState));
    assert.equal(state.count,4);assert.equal(state.clicks.length,4);assert.ok(state.clicks.every(e=>e.trusted));
    assert.equal(state.uploads.length,4);assert.ok(state.uploads.every(e=>e.trusted&&e.size>0));
    const final=await helper('render',run);assert.equal(final.ok,true);assert.equal(final.lineage_verified,true);
    assert.ok(Math.abs(final.metadata.duration-32)<.6);assert.equal(final.metadata.width,720);assert.equal(final.metadata.height,1280);assert.equal(final.metadata.audio,true);
    const report={ok:true,stage:'offline_prototype',extension_required:false,native_messaging_required:false,live_flow_tested:false,trusted_uploads:4,trusted_submission_clicks:4,browser_restart_recovered:true,duplicate_submissions:0,downloads:downloadsReport,media:final.metadata,lineage_verified:true,final_sha256:sha(await readFile(final.final)),proof_files_retained:keep};
    const reportPath=join(base,'last_smoke.json');await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{encoding:'utf8'});
    return {...report,report:reportPath,...(keep?{proof_folder:run,final:final.final}:{})};
  }finally{
    if(context)await context.close();if(fixture)await fixture.close();
    if(!keep)await removeOwnDirectory(run,join(base,'proofs'));
  }
}

export async function inspectSession({home,email,seconds=55}={}){
  if(!/^https:\/\/flow\.google\.com\/u\/\d+\/$/.test(home||'')||!email||!email.includes('@'))throw Error('Session exige --home confirmada e --account-email.');
  const base=await externalRoot(prototypeRoot()),profile=join(base,'session_profile');
  const context=await launchProfile(profile,{headless:false});
  try{
    const pages=context.pages();const page=pages.find(p=>p.url().startsWith(home))||pages[0]||await context.newPage();
    await page.goto(home,{waitUntil:'domcontentloaded',timeout:45000});
    process.stderr.write('Chrome dedicado aberto para login manual. Inspecao somente leitura por ate '+seconds+' segundos.\n');
    const transport=new PlaywrightTransport(page,{mode:'inspect'}),flow=new PlaywrightFlowClient(transport);
    const deadline=Date.now()+seconds*1000;let verified=false;
    while(Date.now()<deadline){
      try{await flow.verifyAccount(email,home);verified=true;break;}catch{if(page.isClosed())break;await new Promise(r=>setTimeout(r,1000));}
    }
    let blockers=null;if(verified){const observed=await flow.dom('blockers');blockers=observed?String(observed).replace(/https?:\/\/\S+/gi,'[link]').slice(0,700):null;}
    return {ok:verified,stage:'read_only_session',account_matches:verified,blocker_present:Boolean(blockers),generation_enabled:false,profile_persisted:true};
  }finally{await context.close();}
}

export async function main(args=process.argv.slice(2)){
  const parsed=options([...args]);
  if(parsed.command==='doctor')return doctor();
  if(parsed.command==='smoke')return smoke(parsed);
  if(parsed.command==='session')return inspectSession(parsed);
  if(parsed.command==='open')return openManualBrowser({home:parsed.home});
  if(parsed.command==='open-status')return manualBrowserStatus();
  if(parsed.command==='preflight')return preflight(parsed);
  if(parsed.command==='help')return {commands:['doctor','smoke [--headed] [--keep]','open [--home URL]','open-status','preflight --image PNG --home URL --account-email EMAIL [--folder PILOT]','session --home URL --account-email EMAIL [--seconds 1..55]'],production_start_available:false};
  throw Error('Comando invalido. Use doctor, smoke, open, open-status, preflight, session ou help.');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().then(result=>{console.log(JSON.stringify(result,null,2));if(result.ok===false)process.exitCode=1;},error=>{console.error(JSON.stringify({ok:false,error:String(error.message).replace(/https?:\/\/\S+/gi,'[link]')}));process.exitCode=1;});
}
