import { DEFAULT_PRESET } from './preset.js';
import { newRun, validatePreset, MODELS, slug } from './core.js';
import { saveRun, listRuns, loadRun, saveAsset, loadAsset } from './store.js';
import { Runner } from './runner.js';
import { FlowClient } from './flow_client.js';
const $=id=>document.getElementById(id);
let preset=structuredClone(DEFAULT_PRESET), current=null, busy=false, image=null, runner=null, previewUrl=null, finalUrl=null;
const names={ready:'Na fila',submitted:'Gerando / aguardando',downloaded:'Baixado',complete:'Concluída',paused:'Pausada',running:'Em execução',rendering:'Montando MP4'};
function message(s,error=false){$('status').textContent=s;$('status').classList.toggle('error',error);}
function capturePreset(){return {name:$('preset_name').value.trim()||'Meu preset',model:$('model').value,prompts:[...document.querySelectorAll('#prompts textarea')].map(e=>e.value)};}
function renderPreset(){
  $('preset_name').value=preset.name;$('model').value=preset.model;$('count').value=String(preset.prompts.length);$('prompts').replaceChildren();
  preset.prompts.forEach((p,i)=>{const d=document.createElement('details'),s=document.createElement('summary'),t=document.createElement('textarea'),small=document.createElement('small');
    s.textContent=`Cena ${i+1}`;small.textContent=i<2?'Imagem original':`Último frame da cena ${i}`;s.append(small);t.value=p;t.setAttribute('aria-label',`Prompt da cena ${i+1}`);d.append(s,t);$('prompts').append(d);});renderCost();
}
function renderCost(){const count=Number($('count').value);$('cost').textContent=$('model').value==='lower'?'Lower Priority: a execução só envia se o Flow confirmar 0 créditos.':`Lite normal: até ${MODELS.lite.maxCredits} créditos por cena; teto de ${count*MODELS.lite.maxCredits} créditos nesta sequência. O valor real depende da conta e é conferido antes de cada envio.`;}
$('count').onchange=()=>{preset=capturePreset();preset.prompts=Array.from({length:Number($('count').value)},(_,i)=>preset.prompts[i]||'');renderPreset();};
$('model').onchange=renderCost;
$('save_preset').onclick=async()=>{try{preset=capturePreset();validatePreset(preset);await chrome.storage.local.set({preset});message('Preset salvo neste navegador.');}catch(e){message(e.message,true);}};
async function saveDownload(blob,filename){
  const url=URL.createObjectURL(blob);
  try{
    const id=await chrome.downloads.download({url,filename,saveAs:false,conflictAction:'uniquify'});
    const release=delta=>{if(delta.id===id && delta.state && delta.state.current!=='in_progress'){URL.revokeObjectURL(url);chrome.downloads.onChanged.removeListener(release);}};
    chrome.downloads.onChanged.addListener(release);
    return id;
  }catch(e){URL.revokeObjectURL(url);throw e;}
}
$('export_preset').onclick=async()=>{const p=capturePreset();await saveDownload(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}),`FlowSceneBuilder/${slug(p.name)}.json`);};
$('import_preset').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;const p=JSON.parse(await f.text());validatePreset(p);preset=p;renderPreset();await chrome.storage.local.set({preset});message('Preset importado.');}catch(err){message(err.message,true);}};
async function chooseImage(file){
  if(!file)return;if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>15*1024*1024)throw Error('Use PNG, JPG ou WebP de até 15 MB.');
  const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();image=await new Promise(r=>canvas.toBlob(r,'image/png'));
  if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(image);$('preview').src=previewUrl;$('preview').hidden=false;$('image_label').textContent=file.name;
  $('name').value=slug(file.name.replace(/\.[^.]+$/,''));
}
$('image').onchange=e=>chooseImage(e.target.files[0]).catch(err=>message(err.message,true));
$('dropzone').ondragover=e=>e.preventDefault();$('dropzone').ondrop=e=>{e.preventDefault();chooseImage(e.dataTransfer.files[0]).catch(err=>message(err.message,true));};
function controls(){
  $('start').disabled=busy;$('pause').disabled=!busy;$('resume').disabled=busy||!current||current.status==='complete';
  $('diagnose').disabled=busy||!current?.tabId;
}
function progress(run,status){
  if(!run)return;current=run;$('scene_status').replaceChildren();
  run.scenes.forEach(s=>{const li=document.createElement('li');li.className=s.state;const num=document.createElement('b');num.className='scene_num';num.textContent=String(s.index+1);
    const text=document.createTextNode(`Cena ${s.index+1}`),state=document.createElement('span');state.textContent=names[s.state]||s.state;li.append(num,text,state);$('scene_status').append(li);});
  if(status)message(status,!!run.error);controls();
}
async function history(){
  const runs=(await listRuns()).sort((a,b)=>b.created-a.created);$('history').replaceChildren();
  if(!runs.length){$('history').textContent='Suas sequências aparecerão aqui.';return;}
  for(const run of runs){const b=document.createElement('button');b.disabled=busy;b.textContent=`${run.name} · ${run.scenes.length} cenas`;const s=document.createElement('span');s.textContent=names[run.status]||run.status;b.append(s);b.onclick=async()=>{current=await loadRun(run.id);progress(current,current.error||`Sequência: ${current.name}`);await downloads();};$('history').append(b);}
}
async function downloads(){
  $('downloads').replaceChildren();if(finalUrl){URL.revokeObjectURL(finalUrl);finalUrl=null;}if(!current)return;
  const selected=current;
  for(const scene of selected.scenes){if(!['complete','downloaded'].includes(scene.state))continue;
    const b=document.createElement('button');b.className='ghost';b.style.margin='10px 8px 0 0';b.textContent=`Baixar cena ${scene.index+1}`;
    b.onclick=async()=>{await saveDownload(await loadAsset(`${selected.id}/scene_${scene.index+1}.mp4`),`FlowSceneBuilder/${selected.name}_${selected.id.slice(0,8)}/cena_${scene.index+1}.mp4`);};$('downloads').append(b);
  }
  const blob=await loadAsset(`${selected.id}/final.mp4`);
  if(blob){finalUrl=URL.createObjectURL(blob);const v=document.createElement('video');v.controls=true;v.src=finalUrl;
    const b=document.createElement('button');b.className='download';b.textContent=`Baixar MP4 completo · ${Math.round(selected.duration||0)}s`;
    b.onclick=()=>saveDownload(blob,`FlowSceneBuilder/${selected.name}_${selected.id.slice(0,8)}/completo.mp4`);$('downloads').append(v,b);
  }
  const pending=selected.scenes.find(s=>s.state==='submitted');
  if(pending && !busy){
    const b=document.createElement('button');b.className='ghost';b.textContent=`Reenviar cena ${pending.index+1}`;b.style.marginTop='14px';
    b.onclick=async()=>{if(!confirm('Confira o projeto do Flow antes. Use isto apenas se a geração falhou ou não foi enviada. Reenviar pode consumir créditos novamente.'))return;pending.state='ready';delete pending.started;delete pending.baseline;await saveRun(selected);progress(selected,'Cena liberada para novo envio. Clique Retomar.');await downloads();};$('downloads').append(b);
  }
}
async function execute(){
  if(busy)return;busy=true;controls();await history();runner=new Runner(progress);
  try{
    await runner.start(current);
    if(current.status==='complete'&&!current.autoDownload){
      current.autoDownload=await saveDownload(await loadAsset(`${current.id}/final.mp4`),`FlowSceneBuilder/${current.name}_${current.id.slice(0,8)}/completo.mp4`);await saveRun(current);
    }
  }catch(e){message(e.message,true);}finally{busy=false;controls();await history();await downloads();}
}
$('start').onclick=async()=>{
  try{if(!image)throw Error('Escolha a imagem do cenário.');preset=capturePreset();validatePreset(preset);
    await chrome.storage.local.set({preset});current=newRun($('name').value,preset);await saveAsset(`${current.id}/original`,image);await saveRun(current);progress(current);await downloads();await execute();
  }catch(e){message(e.message,true);}
};
$('pause').onclick=()=>runner?.pause();$('resume').onclick=execute;
$('diagnose').onclick=async()=>{try{const data=await new FlowClient(current.tabId).dom('diagnostics');await saveDownload(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'FlowSceneBuilder/diagnostico.json');message('Diagnóstico salvo. Não contém cookies, tokens ou URLs de vídeos.');}catch(e){message(e.message,true);}};
const saved=await chrome.storage.local.get('preset');if(saved.preset){try{validatePreset(saved.preset);preset=saved.preset;}catch{}}
renderPreset();await history();controls();
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
