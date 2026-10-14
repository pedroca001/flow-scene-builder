import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,realpath,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FlowClient} from '../extension/flow_client.js';
import {assertOperation,PlaywrightTransport,PlaywrightFlowClient} from '../browser_executor/transport.mjs';
import {externalRoot,ROOT} from '../browser_executor/runtime.mjs';
import {manualChromeArguments} from '../browser_executor/manual_browser.mjs';

const origin='http://127.0.0.1:41783',fixture={mode:'fixture',fixtureOrigin:origin};
const live='https://flow.google.com/u/1/project/11111111-1111-4111-8111-111111111111';

test('real preflight allows a preparation click through its lease but rejects generation and submit keys',async()=>{
  let clicks=0;
  const page={url:()=> 'https://flow.google.com/',bringToFront:async()=>{},waitForTimeout:async()=>{},mouse:{move:async()=>{},click:async()=>{clicks++;}}};
  const transport=new PlaywrightTransport(page,{mode:'preflight',home:'https://flow.google.com/'});
  transport.dom=async op=>op==='inputVisibility'?{visible:true,focused:true}:op==='controlHit'?{matches:true,visible:true,focused:true}:{x:10,y:20,disabled:false};
  await transport.dispatch({type:'clickControl',names:['Novo projeto']});assert.equal(clicks,1);
  for(const message of [{type:'clickControl',names:['Gerar']},{type:'dom',op:'retryAudio'},{type:'key',key:'Enter'}])await assert.rejects(transport.dispatch(message),/Preflight/);
  assert.equal(clicks,1);
});

test('preflight input and reload cannot operate another project',()=>{
  const options={mode:'preflight',home:'https://flow.google.com/',project:'https://flow.google.com/project/11111111-1111-4111-8111-111111111111'};
  assert.throws(()=>assertOperation(live,{type:'reload'},options),/possui este projeto/);
  assert.doesNotThrow(()=>assertOperation(options.project,{type:'text',text:'approved prompt'},options));
});

test('manual login uses ordinary Chrome with no automation connection or identity overrides',()=>{
  const args=manualChromeArguments('/dedicated/session_profile');
  assert.deepEqual(args,['--user-data-dir=/dedicated/session_profile','https://flow.google.com/']);
  for(const url of ['http://flow.google.com/','https://evil.test/','https://user:pass@flow.google.com/','https://flow.google.com/u/0/project/uuid'])assert.throws(()=>manualChromeArguments('/dedicated/session_profile',url),/home do Flow/);
});

test('live inspection rejects mutation and unknown operations before any browser call',async()=>{
  let touched=0;const page={url:()=>live,evaluate:async()=>{touched++;},bringToFront:async()=>{touched++;}};
  const transport=new PlaywrightTransport(page);
  for(const message of [{type:'clickControl',names:['Start generation']},{type:'dom',op:'clickControl'},{type:'dom',op:'retryAudio'},{type:'dom',op:'armDownload'},{type:'dom',op:'point'},{type:'text',text:'new prompt'},{type:'uploadDrop',path:'/tmp/frame.png'},{type:'reload'}])await assert.rejects(transport.dispatch(message),/somente leitura/);
  assert.equal(touched,0);
  for(const op of ['account','project','blockers','audioFailures','settings'])assert.doesNotThrow(()=>assertOperation(live,{type:'dom',op}));
});

test('fixture cannot opt into a live site, another port or a lookalike host',()=>{
  for(const url of [live,'http://127.0.0.1:41784/project','http://127.0.0.1.evil.test:41783/project','http://localhost:41783/project'])assert.throws(()=>assertOperation(url,{type:'clickControl'},fixture),/loopback exato/);
  assert.doesNotThrow(()=>assertOperation(origin+'/project',{type:'uploadDrop'},fixture));
  assert.throws(()=>assertOperation(live,{type:'dom',op:'account'},{mode:'production'}),/Modo/);
  assert.throws(()=>assertOperation(origin,{type:'dom',op:'retryAudio'},fixture),/desconhecida/);
  assert.throws(()=>assertOperation(origin,{type:'unknown'},fixture),/desconhecido/);
});

test('inspection does not trust arbitrary sites with Flow-looking paths',()=>{
  for(const url of ['https://flow.google.com.evil.test/u/1/','http://flow.google.com/u/1/','https://evil.test/project/123','https://user:pass@flow.google.com/u/1/'])assert.throws(()=>assertOperation(url,{type:'dom',op:'account'}),/exige pagina Flow/);
});

test('shared FlowClient uses the injected browser platform in Node without replacing navigator',async()=>{
  const calls=[];const before=globalThis.navigator;
  const flow=new FlowClient('test',async m=>{calls.push(m);if(m.type==='dom'&&m.op==='promptText')return 'test prompt';return true;},{platform:'MacIntel'});
  await flow.prompt('test prompt');assert.equal(calls.find(m=>m.type==='text').mac,true);assert.equal(globalThis.navigator,before);
});

async function withFiles(action){
  const base=await mkdtemp(join(tmpdir(),'flow_playwright_guard_'));const root=join(base,'downloads');await mkdir(root);
  try{return await action({base,root});}finally{const parent=await realpath(tmpdir());assert.ok((await realpath(base)).startsWith(parent));await rm(base,{recursive:true,force:true});}
}

test('download rejects traversal before creating outside directories',async()=>withFiles(async({base,root})=>{
  const transport=new PlaywrightTransport({url:()=>origin}, {...fixture,downloadRoot:root});
  const target=join(base,'outside','new','file.mp4');
  await assert.rejects(transport.destination(target),/fora do runtime/);
  await assert.rejects(stat(join(base,'outside')),e=>e.code==='ENOENT');
}));

test('download rejects a junction or symlink escape before creating nested directories',async()=>withFiles(async({base,root})=>{
  const outside=join(base,'outside');await mkdir(outside);await symlink(outside,join(root,'redirect'),process.platform==='win32'?'junction':'dir');
  const transport=new PlaywrightTransport({url:()=>origin}, {...fixture,downloadRoot:root});
  await assert.rejects(transport.destination(join(root,'redirect','new','file.mp4')),/fora do runtime/);
  await assert.rejects(stat(join(outside,'new')),e=>e.code==='ENOENT');
}));

test('UI-byte download never overwrites an existing file and rejects empty originals',async()=>withFiles(async({root})=>{
  const transport=new PlaywrightTransport({url:()=>origin},{...fixture,downloadRoot:root});const flow=new PlaywrightFlowClient(transport);const target=join(root,'existing.mp4');
  await writeFile(target,'preserved');flow.originalDownload=async()=>new Blob(['replacement']);
  await assert.rejects(flow.downloadOriginalTo({},target),e=>e.code==='EEXIST');assert.equal(await readFile(target,'utf8'),'preserved');
  flow.originalDownload=async()=>new Blob([]);const empty=join(root,'empty.mp4');
  await assert.rejects(flow.downloadOriginalTo({},empty),/vazio/);await assert.rejects(stat(empty),e=>e.code==='ENOENT');
}));

test('native download refuses a different UUID before opening the download menu',async()=>withFiles(async({root})=>{
  const transport=new PlaywrightTransport({url:()=>origin},{...fixture,downloadRoot:root});const flow=new PlaywrightFlowClient(transport);let clicks=0;
  flow.dom=async op=>op==='assetId'?'wrong-id':true;flow.click=async()=>{clicks++;};
  await assert.rejects(flow.downloadOriginalTo({key:'card',assetId:'expected-id'},join(root,'wrong.mp4'),{strategy:'browser'}),/UUID.*diverge/);assert.equal(clicks,0);
}));

test('persistent profiles and media cannot be placed in code or Brain',async()=>{
  await assert.rejects(externalRoot(join(ROOT,'prototype_profile')),/fora do codigo/);
  await assert.rejects(externalRoot(join(ROOT,'..','..','brain','tmp','prototype')),/fora do codigo/);
});
