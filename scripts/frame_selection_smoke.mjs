import {createRequire} from 'node:module';
import {flowDom} from '../extension/flow_dom.js';
const require=createRequire(import.meta.url);const {chromium}=require('playwright');
globalThis.indexedDB={open:()=>({})};
const {FlowClient}=await import('../extension/flow_client.js');
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
try{
 for(const automatic of [true,false]){
  await page.setContent('<mat-list-item class="mdc-list-item--activated" style="display:block">All media</mat-list-item><button id="start">Start</button><div aria-label="frame.png">frame.png</div>');
  await page.evaluate(({source,automatic})=>{
   window.dom=(0,eval)(`(${source})`);
   document.querySelector('#start').onclick=()=>{
    const overlay=document.createElement('div');overlay.className='cdk-overlay-pane';overlay.innerHTML='<h2>Select a frame image</h2><button>Close</button><button role="option"><span class="asset-title">frame.png</span></button><button id="add">Add to prompt</button>';document.body.append(overlay);
    const accept=()=>{if(!document.querySelector('#start'))return;overlay.remove();document.querySelector('#start').remove();const chip=document.createElement('button');chip.setAttribute('aria-label','Image ingredient');document.body.append(chip);};
    overlay.querySelector('#add').disabled=true;overlay.querySelector('[role=option]').onclick=()=>{if(automatic)setTimeout(accept,200);else setTimeout(()=>{overlay.querySelector('#add').disabled=false;},2400);};overlay.querySelector('#add').onclick=accept;
   };
  },{source:flowDom.toString(),automatic});
  const client=new FlowClient(1,async m=>{if(m.type==='key')return;const r=await page.evaluate(({op,args})=>window.dom(op,args),m);if(r?.error)throw Error(r.error);return r;});
  await client.uploadFrame(null,'frame.png','/unused.png');
  if(await page.locator('[aria-label="Image ingredient"]').count()!==1)throw Error('Frame not accepted');
 }
 console.log('FRAME_SELECTION_OK: delayed auto-accept and explicit confirmation');
}finally{await browser.close();}
