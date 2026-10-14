import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

export const PROJECT_ID='11111111-1111-4111-8111-111111111111';
export const ASSET_IDS=[1,2,3,4].map(n=>`${n}2222222-2222-4222-8222-222222222222`);

// An offline provider simulator, not an assertion that this is the real Flow DOM.
const html=`<!doctype html><html><meta charset="utf-8"><title>Flow offline prototype</title>
<style>body{font-family:Arial}button{margin:5px;padding:8px}#settings{display:none}#assets{display:flex;gap:10px}flow-grid-tile-container,flow-video-tile,flow-project-page,flow-pending-tile{display:block}img{width:35px;height:45px}video{width:45px;height:70px}#editor{border:1px solid #aaa;min-height:45px}#menu{display:none}</style>
<button aria-label="Google Account: Offline fixture (fixture@example.invalid)">Fixture account</button>
<nav><input aria-label="Editable text"><button aria-label="Done">Done</button></nav>
<button aria-label="Settings trigger">Video Frames 9:16 720p 8s x1</button>
<button mat-list-item class="mdc-list-item--activated" aria-label="All media">All media</button>
<div id="settings"><button aria-label="Select model family">Veo 3.1 Lite [Lower Priority]</button><a href="/credit_menu">0 credits</a>
<button role="radio" aria-checked="true" aria-label="Video">Video</button><button role="radio" aria-checked="true" aria-label="Frames">Frames</button><button role="radio" aria-checked="true" aria-label="9:16">9:16</button><button role="radio" aria-checked="true" aria-label="8s">8s</button><button role="radio" aria-checked="true" aria-label="x1">x1</button></div>
<flow-project-page><button aria-label="Clear prompt">Clear prompt</button><button id="start" aria-label="Start">Start</button><div id="chip"></div><div contenteditable="true" id="editor"></div><button id="generate" aria-label="Start generation">Start generation</button></flow-project-page>
<div id="assets"></div><div id="pending"></div>
<button id="back" aria-label="Back button to go to previous page" style="display:none">Back</button>
<button id="download" aria-label="Download media" style="display:none">Download media</button><div id="menu"><button aria-label="720p">720p</button></div>
<script>
const ids=${JSON.stringify(ASSET_IDS)},project='/u/0/project/${PROJECT_ID}';
let state=JSON.parse(localStorage.fixtureState||'null')||{count:0,clicks:[],uploads:[],title:'Offline fixture'};
const save=()=>localStorage.fixtureState=JSON.stringify(state);
const one=s=>document.querySelector(s);one('input').value=state.title;
one('[aria-label="Done"]').onclick=()=>{state.title=one('input').value;save();};
one('[aria-label="Settings trigger"]').onclick=()=>{one('#settings').style.display=one('#settings').style.display==='block'?'none':'block';};
one('[aria-label="All media"]').onclick=()=>{};
one('[aria-label="Clear prompt"]').onclick=()=>{one('#editor').textContent='';one('#chip').textContent='';one('#start').style.display='inline-block';};
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',async e=>{e.preventDefault();const file=e.dataTransfer.files[0];if(!file)return;const data=await file.arrayBuffer();state.uploads.push({name:file.name,trusted:e.isTrusted,size:data.byteLength});save();const src=URL.createObjectURL(file);const tile=document.createElement('flow-grid-tile-container');tile.setAttribute('aria-label',file.name);const im=document.createElement('img');im.src=src;tile.append(im);one('#assets').append(tile);one('#chip').innerHTML='<flow-image-ingredient-chip><img><button aria-label="Remove image">X</button></flow-image-ingredient-chip>';one('#chip img').src=src;one('#chip button').onclick=()=>{one('#chip').textContent='';one('#start').style.display='inline-block';};one('#start').style.display='none';});
const addVideo=n=>{const tile=document.createElement('flow-grid-tile-container');tile.setAttribute('aria-label','offline_scene_'+n);const videoTile=document.createElement('flow-video-tile');const video=document.createElement('video');video.setAttribute('aria-label','Generated video');video.src='/media/'+n+'.mp4';videoTile.append(video);tile.append(videoTile);videoTile.onclick=()=>{history.pushState({},'',project+'/edit/'+ids[n-1]);one('#download').style.display='inline-block';one('#back').style.display='inline-block';};one('#assets').append(tile);};
for(let n=1;n<=state.count;n++)addVideo(n);
one('#generate').onclick=e=>{state.count++;state.clicks.push({trusted:e.isTrusted,prompt:one('#editor').innerText});save();const pending=document.createElement('flow-pending-tile');pending.textContent='50%';one('#pending').append(pending);const number=state.count;setTimeout(()=>{pending.remove();addVideo(number);},100);};
one('#back').onclick=()=>{history.pushState({},'',project);one('#download').style.display='none';one('#back').style.display='none';one('#menu').style.display='none';};
one('#download').onclick=()=>one('#menu').style.display='block';
one('[aria-label="720p"]').onclick=async()=>{const n=ids.indexOf(location.pathname.split('/').pop())+1;if(n<1)throw Error('Unknown asset');const bytes=await fetch('/media/'+n+'.mp4').then(r=>r.blob());const url=URL.createObjectURL(bytes);const a=document.createElement('a');a.href=url;a.download='offline_scene_'+n+'.mp4';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};
</script></html>`;

export async function startFixture(clips){
  const payloads=await Promise.all(clips.map(p=>readFile(p)));
  const server=createServer((request,response)=>{
    const path=new URL(request.url,'http://127.0.0.1').pathname;
    const match=path.match(/^\/media\/([1-4])\.mp4$/);
    if(match){response.writeHead(200,{'Content-Type':'video/mp4'});response.end(payloads[Number(match[1])-1]);return;}
    if(/^\/u\/0\/project\//.test(path)){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(html);return;}
    response.writeHead(404);response.end();
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  return {origin,url:`${origin}/u/0/project/${PROJECT_ID}`,close:()=>new Promise((ok,no)=>server.close(e=>e?no(e):ok()))};
}
