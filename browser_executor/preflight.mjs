import {spawn} from 'node:child_process';
import {access,mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {externalRoot,prototypeRoot,ROOT,launchProfile} from './runtime.mjs';
import {openManualBrowser} from './manual_browser.mjs';
import {PlaywrightFlowClient,PlaywrightTransport} from './transport.mjs';
import {projectMatchesHome} from '../extension/core.js';

export async function sharedAccountSnapshot(email){
  const base=join(homedir(),'.local/share/flow_scene_builder');
  const read=async(name,fallback)=>{try{return JSON.parse(await readFile(join(base,name),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
  const holds=await read('account_holds.json',{}),queue=await read('queue.json',[]),settings=await read('settings.json',{});
  return {account_held:Boolean(holds[email.toLowerCase()]),legacy_running:queue.filter(row=>row.state==='running').length,max_parallel:settings.max_parallel||10};
}

async function prepare(root,image,email,home,preset){
  const prefix=join(homedir(),'.local/share/flow_scene_builder/venv');
  let python=process.env.FLOW_PLAYWRIGHT_PYTHON||join(prefix,...(process.platform==='win32'?['Scripts','python.exe']:['bin','python3']));
  try{await access(python);}catch{python=process.platform==='win32'?'python':'python3';}
  return new Promise((ok,no)=>{
    const child=spawn(python,['-X','utf8',join(ROOT,'scripts/playwright_preflight_job.py'),'--root',root,'--image',image,'--email',email,'--home',home,'--preset',preset],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let out='',err='';child.stdout.on('data',data=>out+=data);child.stderr.on('data',data=>err+=data);child.once('error',no);child.once('close',code=>{if(code)no(Error(err.slice(-1400)));else{try{ok(JSON.parse(out));}catch{no(Error('Preflight helper returned invalid JSON.'));}}});
  });
}

export async function preflight({image,email,home,preset,folder}={}){
  if(!image||!email||!/^https:\/\/flow\.google\.com\/(?:u\/\d+\/)?$/.test(home||''))throw Error('Preflight exige imagem, email e home confirmados.');
  await access(image);preset=preset||join(ROOT,'presets/receita_vids_v2_flow_frames_8s_fidelidade.json');
  const base=await externalRoot(prototypeRoot());await mkdir(join(base,'pilots'),{recursive:true});
  const run=folder?await externalRoot(folder):await mkdtemp(join(base,'pilots','pilot_'));
  const manifest=join(run,'preflight.json');let job;
  if(folder){job=JSON.parse(await readFile(manifest,'utf8'));if(job.email!==email||job.home!==home||job.image!==image)throw Error('Retomada diverge do piloto.');}
  else{job={version:1,email,home,image,preset,...await prepare(run,image,email,home,preset),creation:'pending',project:null,checks:{},generation_sent:false};}
  const save=()=>writeFile(manifest,JSON.stringify(job,null,2)+'\n');await save();
  let context,flow;
  const progress=async(stage)=>{job.stage=stage;await save();process.stderr.write(stage+'\n');};
  try{
    await progress('connecting_authenticated_profile');context=await launchProfile(join(base,'session_profile'),{headless:false});
    const page=context.pages()[0]||await context.newPage();
    await page.goto(job.project||home,{waitUntil:'domcontentloaded',timeout:45000});
    const transport=new PlaywrightTransport(page,{mode:'preflight',home,project:job.project});flow=new PlaywrightFlowClient(transport);
    await progress('verifying_account');
    await flow.wait(async()=>{try{return await flow.verifyAccount(email,home);}catch{return false;}},20000,'conta autenticada no Flow');
    job.checks.account=true;job.checks.ultra=await flow.wait(()=>page.evaluate(()=>[...document.querySelectorAll('[aria-label],header,button')].some(e=>e.getClientRects().length>0&&/\bULTRA\b/i.test((e.getAttribute('aria-label')||'')+' '+e.innerText))),20000,'plano Ultra carregar');
    if(!job.checks.ultra)throw Error('Plano Ultra nao confirmado.');await flow.checkBlockers();
    if(!job.project){
      if(job.creation!=='pending')throw Error('Criacao anterior incerta; preservar piloto sem segundo clique.');
      job.creation='creating';await progress('creating_project');
      job.project=await flow.createProject();if(!projectMatchesHome(job.project,home))throw Error('Projeto criado fora da home.');
      job.creation='created';transport.options.project=job.project;await save();
    }
    await progress('persisting_project_title');await flow.renameProject(job.title);job.checks.title_persisted=true;
    await progress('configuring_zero_credit_model');const settings=await flow.configure('lower',1,8);job.checks.settings=settings;
    await progress('uploading_named_frame');await flow.uploadFrame(null,job.frame_path.split(/[\\/]/).pop(),job.frame_path);job.checks.upload_and_frame=true;
    await progress('verifying_prompt');await flow.prompt(job.prompt);await flow.verify('lower',1,8);job.checks.prompt=true;
    const generation=await flow.dom('generationState');
    if(generation.pending||generation.videos||generation.errors)throw Error('Projeto novo possui atividade inesperada; nenhum envio.');
    job.checks.no_generation=true;job.shared_guard=await sharedAccountSnapshot(email);
    job.status='prepared';job.next_action=job.shared_guard.account_held?'resolve_shared_account_hold':job.shared_guard.legacy_running?'wait_for_legacy_idle':'implement_guarded_generation';
    await progress('preflight_complete_no_generation');
    return {ok:true,stage:'real_preflight',folder:run,manifest,project:job.project,title:job.title,checks:job.checks,shared_guard:job.shared_guard,generation_sent:false,next_action:job.next_action};
  }catch(error){
    job.status='paused';job.error=String(error.message).replace(/https?:\/\/\S+/gi,'[link]');
    if(context){const page=context.pages()[0];if(page){
      if(job.creation==='creating'&&!job.project){try{const observed=await flow.dom('project');if(observed.isProject&&projectMatchesHome(observed.url,home)){job.project=observed.url;job.creation='created';}}catch{}}
      if(job.creation==='creating'&&!job.project&&error.beforeInput){job.creation='pending';job.creation_recovery={at:new Date().toISOString(),before_input:true,reason:'Input lease rejected before browser input.'};}
      await page.screenshot({path:join(run,'preflight_error.png')}).catch(()=>{});
    }}
    await save();return {ok:false,stage:job.stage,folder:run,manifest,error:job.error,generation_sent:false};
  }finally{await save();if(context){await context.close();await openManualBrowser({home}).catch(()=>{});}}
}
