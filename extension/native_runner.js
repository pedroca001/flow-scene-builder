import { FlowClient, sleep } from './flow_client.js';
import { dispatch } from './transport.js';
import { BUILD_ID } from './build_id.js';
import { JobPool } from './job_pool.js';
import { withUi } from './ui_queue.js';
let host=null;let connecting=false;const statuses=new Map();let reporting=Promise.resolve();
function connect(){
  const port=chrome.runtime.connectNative('com.pedro.flow_scene_builder');let sequence=0;let alive=true;const pending=new Map();
  port.onMessage.addListener(m=>{const p=pending.get(m.id);if(p){pending.delete(m.id);m.ok?p.resolve(m.result):p.reject(Error(m.error));}});
  port.onDisconnect.addListener(()=>{alive=false;const error=chrome.runtime.lastError?.message||'Programa local desconectado.';for(const p of pending.values())p.reject(Error(error));pending.clear();});
  return {get alive(){return alive;},close:()=>port.disconnect(),ask:(op,args={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});try{port.postMessage({id,op,...args});}catch(e){pending.delete(id);reject(e);}})};
}
async function report(values){
  if(values.folder)statuses.set(values.folder,{...statuses.get(values.folder),...values,updated:Date.now()});
  const rows=[...statuses.values()].sort((a,b)=>b.updated-a.updated).slice(0,30);
  reporting=reporting.catch(()=>{}).then(()=>chrome.storage.local.set({executor:{...values,updated:Date.now()},executorJobs:rows}));
  return reporting;
}
const pool=new JobPool({limit:10,
  claim:exclude=>host.ask('claim',{exclude}),run:job=>runJob(host,job),
  onError:async(error,job)=>report({status:'paused',folder:job.folder,error:String(error.message||error)}),
  onIdle:async()=>{await report({status:'idle'});host?.close();host=null;}
});
export async function tick(){
  if(connecting)return;
  connecting=true;
  try{
    if(host&&!host.alive&&!pool.active.size){host.close();host=null;}
    if(!host){
      host=connect();const hello=await host.ask('hello',{build:BUILD_ID});
      if(hello.reload){host.close();host=null;chrome.runtime.reload();return;}
    }
    await pool.fill();
  }catch(e){await report({status:'paused',error:String(e.message||e)});if(!pool.active.size){host?.close();host=null;}}
  finally{connecting=false;}
}
async function projectTab(host,job){
  const key='automationTab:'+job.folder;
  const saved=await chrome.storage.local.get(key);
  let tab=saved[key]?await chrome.tabs.get(saved[key]).catch(()=>null):null;
  const creation=job.project_creation||{status:'ready'};
  if(job.project_mode==='new'&&!job.project){
    if(creation.status==='creating'){
      // An interrupted click must never create another project. Only recover the owned tab.
      if(!tab||tab.id!==creation.tab_id||!/^https:\/\/flow\.google\.com\/u\/1\/project\/[a-f0-9-]{36}$/.test(tab.url||''))throw Error('Criacao interrompida sem URL confirmada. Preservado para diagnostico, sem novo projeto.');
    }else{
      if(creation.status!=='pending')throw Error('Estado de criacao inesperado.');
      if(!tab){const win=await chrome.windows.create({url:creation.home,type:'normal',focused:false,width:1100,height:900});tab=win.tabs[0];await chrome.storage.local.set({[key]:tab.id});}
      const flow=new FlowClient(tab.id,dispatch);
      await flow.wait(()=>flow.dom('exists',{names:['New project','Novo projeto']}));
      Object.assign(creation,await host.ask('project_intent',{folder:job.folder,tab_id:tab.id}));
      await flow.createProject();
      tab=await chrome.tabs.get(tab.id);
    }
    job.project=tab.url;
    await host.ask('project_bound',{folder:job.folder,project:job.project,tab_id:tab.id});
    creation.status='created';
  }
  if(!tab?.url?.startsWith(job.project)){
    const win=await chrome.windows.create({url:job.project,type:'normal',focused:false,width:1100,height:900});tab=win.tabs[0];await chrome.storage.local.set({[key]:tab.id});
  }
  const flow=new FlowClient(tab.id,dispatch);
  await flow.wait(async()=> (await flow.dom('project')).isProject);
  await flow.backToProject();
  if(job.project_mode==='new'&&creation.status!=='ready'){
    if(await flow.dom('projectTitle')!==creation.title)await flow.renameProject(creation.title);
    await host.ask('project_ready',{folder:job.folder,title:creation.title});
  }
  return flow;
}
async function uploadVideo(host,folder,scene,blob,candidate=null){
  const bytes=new Uint8Array(await blob.arrayBuffer());
  for(let offset=0;offset<bytes.length;offset+=262144){const chunk=bytes.subarray(offset,offset+262144);let data='';
    for(let i=0;i<chunk.length;i+=8192)data+=String.fromCharCode(...chunk.subarray(i,i+8192));
    await host.ask(candidate?'candidate_chunk':'chunk',{folder,scene,candidate,offset,data:btoa(data)});}
}
async function runJob(host,job){
  try{
    await report({status:'running',folder:job.folder});
    await host.ask('progress',{folder:job.folder,phase:'Criando ou recuperando projeto exclusivo'});
    const flow=await withUi(()=>projectTab(host,job));
    flow.withUi=withUi;
    while(true){
      const scene=await host.ask('next',{folder:job.folder});
      if(scene.status==='ready_to_render'){await report({status:'rendering',folder:job.folder});await host.ask('render',{folder:job.folder});await report({status:'complete',folder:job.folder});return;}
      if(scene.status==='complete')return;
      await report({status:'running',folder:job.folder,scene:scene.number});
      const outputs=scene.outputs_per_prompt||1;
      let baseline=scene.baseline_ids;let failures=scene.failure_baseline;
      if(scene.ready_to_submit){
        await withUi(async()=>{
        const progress=phase=>host.ask('progress',{folder:job.folder,phase});
        const name=scene.existing_image_name||scene.browser_frame_path.split('/').pop();
        await progress(`Cena ${scene.number}: inventario`);baseline=(await flow.inventory()).map(v=>v.assetId);
        failures=(await flow.dom('audioFailures')).map(f=>f.key);
        await progress(`Cena ${scene.number}: configuracao`);await flow.configure('lower',outputs);
        await progress(`Cena ${scene.number}: upload`);await flow.uploadFrame(null,name,scene.existing_image_name?null:scene.browser_frame_path);
        await progress(`Cena ${scene.number}: prompt`);await flow.prompt(scene.prompt);await flow.verify('lower',outputs);
        await host.ask('submitted',{folder:job.folder,scene:scene.number,baseline,failures});await flow.submit();
        });
      }else if(scene.status!=='submitted')throw Error('Estado inesperado da cena.');
      await host.ask('progress',{folder:job.folder,phase:`Cena ${scene.number}: aguardando resultado`});
      if(outputs>1){
        let candidates=scene.candidates;
        if(!candidates){
          const batch=await flow.waitCandidates(baseline,Date.now(),failures||[],outputs);
          candidates=await host.ask('batch_results',{folder:job.folder,scene:scene.number,media_ids:batch.cards.map(c=>c.assetId),failed:batch.failed});
        }
        for(const candidate of candidates){
          if(candidate.status==='complete'||candidate.status==='failed')continue;
          const blob=await withUi(async()=>{
            await flow.backToProject();
            const found=(await flow.inventory()).filter(c=>c.assetId===candidate.media_id);
            if(found.length!==1)throw Error('Candidato vinculado nao encontrado. Nenhum novo envio.');
            await host.ask('progress',{folder:job.folder,phase:`Cena ${scene.number}: download ${candidate.label}/${outputs}`});
            return flow.originalDownload(found[0]);
          });
          await uploadVideo(host,job.folder,scene.number,blob,candidate.label);
          await host.ask('candidate_ingest',{folder:job.folder,scene:scene.number,candidate:candidate.label});
        }
        await host.ask('progress',{folder:job.folder,phase:`Cena ${scene.number}: avaliacao ${scene.evaluation?.model||'legado'}, ${scene.evaluation?.frames||15} frames por candidato`});
        await host.ask('select_candidate',{folder:job.folder,scene:scene.number});
        await withUi(()=>flow.backToProject());continue;
      }
      const retryOptions=Array.isArray(failures)?{baseline:failures,onRetry:key=>host.ask('retry_audio',{folder:job.folder,scene:scene.number,failure_key:key})}:null;
      const card=await flow.waitVideo(baseline,Date.now(),()=>{},()=>false,scene.result_asset_id,retryOptions);
      await host.ask('result',{folder:job.folder,scene:scene.number,media_id:card.assetId});
      await host.ask('progress',{folder:job.folder,phase:`Cena ${scene.number}: download`});
      const blob=await withUi(()=>flow.originalDownload(card));
      await uploadVideo(host,job.folder,scene.number,blob);
      await host.ask('ingest',{folder:job.folder,scene:scene.number,media_id:card.assetId});
      await withUi(()=>flow.backToProject());
    }
  }catch(e){
    const error=String(e.message||e);await report({status:'paused',error,folder:job?.folder});
    if(job&&host)await host.ask('pause',{folder:job.folder,error}).catch(()=>{});
  }
}
