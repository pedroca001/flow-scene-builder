import {createRequire} from 'node:module';
import {flowDom} from '../extension/flow_dom.js';
import {assertSettings} from '../extension/core.js';
const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
try{
await page.route('https://fixture.test/',route=>route.fulfill({body:'<html></html>',contentType:'text/html'}));await page.goto('https://fixture.test/');
await page.setContent(`<flow-project-page><button aria-label="Settings trigger">Video · 720p · 8s x1</button><button aria-label="Select model family">Veo 3.1 - Lite [Lower Priority]</button><button role="radio" aria-checked="true"><mat-icon aria-hidden="true">videocam</mat-icon><span class="toggle-text">Video</span></button><button role="radio" aria-checked="true"><mat-icon aria-hidden="true">crop_free</mat-icon><span class="toggle-text">Frames</span></button><button role="radio" aria-checked="true">9:16</button><button role="radio" aria-checked="true">x1</button><a href="https://support.google.com/googleone?p=g1_ai_credit_menu">0 credits</a><div contenteditable="true">hello world</div><flow-video-tile style="display:block"><img alt="Generated video thumbnail" src="https://flow-content.google/image/scene-two?Signature=fixture" width="50" height="50"></flow-video-tile><flow-video-tile style="display:block"><video aria-label="Generated video" src="https://flow-content.google/video/scene-one?Signature=fixture" width="50" height="50"></video></flow-video-tile></flow-project-page>`);
await page.evaluate(`window.fixtureDom=${flowDom.toString()}`);
const dom=(op,args={})=>page.evaluate(({op,args})=>window.fixtureDom(op,args),{op,args});
await page.evaluate(()=>{const item=document.createElement('mat-list-item');item.style.display='block';item.textContent='All media';item.onclick=()=>item.classList.add('mdc-list-item--activated');document.body.append(item);});
if(await dom('allMedia')!==false||await dom('allMedia')!==true)throw Error('All media filter did not activate and confirm');
const settings=await dom('settings');assertSettings(settings,'lower');
const cards=await dom('cards');if(cards.length!==2||cards.some(c=>!/^[a-f0-9]{64}$/.test(c.key)))throw Error('Invalid card identities');
await page.evaluate(()=>{for(const tile of document.querySelectorAll('flow-video-tile')){const clone=tile.cloneNode(true);clone.removeAttribute('data-fsb-key');tile.replaceWith(clone);}});
if(JSON.stringify(await dom('cards'))!==JSON.stringify(cards))throw Error('Identity changed after DOM reconstruction');
const video=await dom('media');if(video[0].key!==cards[1].key)throw Error('Video key mismatch');await page.evaluate(()=>document.querySelector('video').src='https://flow.google.com/asb/opaque=token');if((await dom('cards'))[1].key!==cards[1].key)throw Error('Key changed with media URL');
if(JSON.stringify(cards).includes('Signature'))throw Error('Signed URL leaked into baseline');
await dom('armDownload');await page.evaluate(()=>{const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([new Uint8Array(600000).fill(42)],{type:'video/mp4'}));link.download='scene.mp4';link.click();URL.revokeObjectURL(link.href);});
if(!(await dom('downloadLink')).startsWith('blob:'))throw Error('Original download link not captured');
let transferred=0;while(transferred<600000){const chunk=await dom('originalChunk',{offset:transferred});const bytes=Buffer.from(chunk.data,'base64');if(bytes.some(n=>n!==42))throw Error('Download bytes corrupted');transferred+=bytes.length;}
if(transferred!==600000)throw Error('Original download truncated');await dom('releaseDownload');
await page.evaluate(()=>{const error=document.createElement('flow-error-tile');error.style.display='block';error.innerHTML='<p>Failed Audio generation failed. You have not been charged for this generation.</p><button aria-label="Retry">Retry</button>';error.querySelector('button').onclick=()=>error.remove();document.body.append(error);});
const failures=await dom('audioFailures');if(failures.length!==1||!failures[0].retriable)throw Error('Confirmed audio failure not identified');
if(await dom('blockers'))throw Error('Historical error tile was treated as an active blocker');
await dom('retryAudio',{key:failures[0].key});if((await dom('audioFailures')).length)throw Error('Retry did not target the failed tile');
const point=await dom('cardPoint',{key:cards[0].key});if(!Number.isFinite(point.x))throw Error('Card not clickable');
await page.evaluate(()=>{document.querySelector('flow-project-page').addEventListener('drop',e=>{window.dropName=e.dataTransfer.files[0].name;});});
await dom('dropImage',{dataUrl:'data:image/png;base64,iVBORw0KGgo=',name:'test.png'});
if(await page.evaluate(()=>window.dropName)!=='test.png')throw Error('Image drop failed');
await page.evaluate(()=>{
 document.querySelector('[aria-label="Settings trigger"]').setAttribute('aria-label','Gatilho de configurações');
 document.querySelector('[aria-label="Select model family"]').setAttribute('aria-label','Selecionar família de modelos');
 document.querySelector('video').setAttribute('aria-label','Vídeo gerado');
 document.querySelector('img').alt='Miniatura do vídeo gerada';
 for(const tile of document.querySelectorAll('flow-video-tile'))tile.removeAttribute('data-fsb-key');
});
assertSettings(await dom('settings'),'lower');
if((await dom('cards')).length!==2)throw Error('Portuguese video cards not recognized');
await page.evaluate(()=>{const input=document.createElement('input');input.setAttribute('aria-label','Texto editável');input.value='set. 22 - 18:02';input.addEventListener('input',()=>input.dataset.saved=input.value);document.body.append(input);});
if(!await dom('setTitle',{title:'2026-09-22 18:02:54.702'}))throw Error('Title field not found');
if(await dom('projectTitle')!=='2026-09-22 18:02:54.702')throw Error('Title appended instead of replaced');
if(await page.locator('input[aria-label="Texto editável"]').getAttribute('data-saved')!=='2026-09-22 18:02:54.702')throw Error('Title input event missing');
console.log('DOM_SMOKE_OK: zero-credit settings, thumbnail/video IDs, targeted card, image upload event');
}finally{await browser.close();}
