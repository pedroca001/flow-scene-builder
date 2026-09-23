import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const temp=await mkdtemp(join(tmpdir(),'flow_upload_test_'));const file=join(temp,'frame.png');
await writeFile(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
await page.route('https://flow.google.com/**',r=>r.fulfill({contentType:'text/html',body:'<button role="menuitem" style="margin:100px;width:150px;height:40px">Upload</button><div id="result"></div><script>document.querySelector("button").onmouseenter=()=>{if(document.querySelector("input"))return;const input=document.createElement("input");input.type="file";input.name="Filedata";input.style.display="none";input.onchange=e=>document.querySelector("#result").textContent=e.target.files[0].name;document.body.append(input);}</script>'}));
await page.goto('https://flow.google.com/test');const cdp=await page.context().newCDPSession(page);
globalThis.chrome={tabs:{get:async()=>({url:page.url()}),update:async()=>({})},debugger:{attach:async()=>{},detach:async()=>{},sendCommand:async(_,method,params)=>cdp.send(method,params)},scripting:{executeScript:async({func,args})=>[{result:await page.evaluate(({source,args})=>(0,eval)(`(${source})`)(...args),{source:func.toString(),args})}]}};
try{const {dispatch}=await import('../extension/transport.js');await dispatch({type:'upload',tabId:1,path:file});const name=await page.locator('#result').textContent();if(name!=='frame.png')throw Error('Upload change event missing');await page.evaluate(()=>{document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>{e.preventDefault();window.dropped={name:e.dataTransfer.files[0]?.name,trusted:e.isTrusted};});});await dispatch({type:'uploadDrop',tabId:1,path:file});const dropped=await page.evaluate(()=>window.dropped);if(dropped?.name!=='frame.png'||!dropped.trusted)throw Error('Trusted file drop failed');console.log('UPLOAD_SMOKE_OK: Chromium/CDP input and trusted file drop');}
finally{await browser.close();await rm(temp,{recursive:true,force:true});}
