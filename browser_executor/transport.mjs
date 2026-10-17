import {constants} from 'node:fs';
import {copyFile, mkdir, realpath, rm, stat, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {FlowClient} from '../extension/flow_client.js';
import {flowDom} from '../extension/flow_dom.js';
import {isLocalPngPath} from '../extension/core.js';
import {stableControlPoint, waitForVisibleInput} from '../extension/trusted_control.js';
import {platform} from './runtime.mjs';

const READ_OPS=new Set(['account','project','projectTitle','settings','cards','generationState','pendingComplete','audioFailures','blockers','exists','controlHit','inputVisibility','promptText','assetId','assetExists','frameState','frameMatches','frameSource','imageAssetSource','diagnostics']);
const FIXTURE_OPS=new Set([...READ_OPS,'point','radio','modelOption','focusEditor','allMedia','focusTitle','setTitle','commitTitle','openCard','armDownload','downloadLink','originalChunk','releaseDownload','selectAsset','chooseAsset','acceptFrame','removeFrames','openNamedImagePreview']);
const PREPARE_OPS=new Set([...READ_OPS,'point','radio','modelOption','focusEditor','allMedia','focusTitle','setTitle','commitTitle','selectAsset','chooseAsset','acceptFrame','removeFrames','openNamedImagePreview']);
const PREPARE_NAMES=new Set(['New project','Novo projeto','Settings trigger','Configurações','Select model family','Selecionar modelo','Video','Vídeo','Frames','Quadros','9:16','8s','x1','Clear prompt','Limpar prompt','Start','Início','Inicio','Back button to go to previous page','All media','Todas as mídias']);

function prepareGuard(u,message,options){
  const h=new URL(options.home||'https://invalid.test/');
  if(!/^https:\/\/flow\.google\.com\/(?:u\/\d+\/)?$/.test(h.href)||u.origin!==h.origin||u.username||u.password)throw Error('Preflight exige home autorizada.');
  if(message.type==='dom'&&READ_OPS.has(message.op))return;
  const project=options.project;
  if(project){const p=new URL(project);if(u.pathname!==p.pathname&&!u.pathname.startsWith(p.pathname+'/edit/'))throw Error('Preflight nao possui este projeto.');}
  else if(u.pathname!==h.pathname)throw Error('Vincular o projeto antes de operar.');
  if(['dom','clickControl'].includes(message.type)&&((message.type==='dom'&&message.op==='clickControl')||message.type==='clickControl')){
    const names=message.names||message.args?.names;
    if(!Array.isArray(names)||!names.length||names.some(n=>!PREPARE_NAMES.has(n)))throw Error('Preflight nao permite Generate, Retry ou controle nao autorizado.');return;
  }
  if(message.type==='dom'&&PREPARE_OPS.has(message.op))return;
  if(message.type==='key'){if(message.key!=='Escape')throw Error('Preflight permite somente Escape, sem tecla de envio.');return;}
  if(['reload','text','uploadDrop','setTitle','click'].includes(message.type))return;
  throw Error('Preflight nao permite esta operacao.');
}

export function assertOperation(url,message,options={}){
  const {mode='inspect',fixtureOrigin=null}=options;
  const u=new URL(url);
  if(mode==='preflight')return prepareGuard(u,message,options);
  if(mode==='fixture'){
    const local=fixtureOrigin?new URL(fixtureOrigin):null;
    if(!local||local.protocol!=='http:'||local.hostname!=='127.0.0.1'||local.username||local.password||local.search||local.hash||u.origin!==local.origin)throw Error('Fixture exige o origin loopback exato.');
    if(message.type==='dom'&&!FIXTURE_OPS.has(message.op)&&message.op!=='clickControl')throw Error('Operacao DOM desconhecida no prototipo.');
    if(!['dom','clickControl','click','hover','text','key','uploadDrop','setTitle','reload'].includes(message.type))throw Error('Transporte desconhecido no prototipo.');
    return;
  }
  if(mode!=='inspect')throw Error('Modo Playwright invalido.');
  if(u.protocol!=='https:'||!['flow.google.com','labs.google'].includes(u.hostname)||u.username||u.password)throw Error('Inspecao exige pagina Flow.');
  if(message.type!=='dom'||!READ_OPS.has(message.op))throw Error('Prototipo permite somente leitura no Flow real.');
}

export class PlaywrightTransport{
  constructor(page,{mode='inspect',fixtureOrigin=null,downloadRoot=null,home=null,project=null}={}){this.page=page;this.options={mode,fixtureOrigin,home,project};this.downloadRoot=downloadRoot;this.tail=Promise.resolve();this.session=null;this.points=new Map();this.dispatch=this.dispatch.bind(this);}
  guard(message){assertOperation(this.page.url(),message,this.options);}
  async dom(op,args={}){
    this.guard({type:'dom',op});
    const result=await this.page.evaluate(({source,op,args})=>(0,eval)(`(${source})`)(op,args),{source:flowDom.toString(),op,args});
    if(result?.error)throw Error(result.error);
    if(this.options.mode==='preflight'&&['modelOption','selectAsset'].includes(op)&&Number.isFinite(result?.x)&&Number.isFinite(result?.y)){
      const token=randomUUID();this.points.set(token,{op,args,time:Date.now()});return {...result,preparePoint:token};
    }
    return result;
  }
  async cdp(){return this.session??=await this.page.context().newCDPSession(this.page);}
  async input(action){
    const task=this.tail.catch(()=>{}).then(async()=>{
      // Recheck after waiting for this transport's input lease.
      try{this.guard({type:'key',key:'Escape'});}catch(error){error.beforeInput=true;throw error;}
      await this.page.bringToFront();
      await waitForVisibleInput(()=>this.dom('inputVisibility'),()=>this.page.bringToFront());
      return action();
    });this.tail=task.catch(()=>{});return task;
  }
  async pointClick(message){
    let descriptor=null;
    if(this.options.mode==='preflight'&&!message.names){descriptor=this.points.get(message.preparePoint);this.points.delete(message.preparePoint);if(!descriptor||Date.now()-descriptor.time>15000)throw Error('Clique sem controle de preparo identificado.');}
    const read=()=>message.names?this.dom('point',{names:message.names}):descriptor?this.dom(descriptor.op,descriptor.args):message.assetName?this.dom('selectAsset',{name:message.assetName}):Promise.resolve({x:message.x,y:message.y,disabled:message.disabled});
    let p=await stableControlPoint(read);await this.page.mouse.move(p.x,p.y);await this.page.waitForTimeout(100);p=await stableControlPoint(read);
    if(message.names){
      const hit=await this.dom('controlHit',{point:p,names:message.names});
      if(!hit.matches||!hit.visible||!hit.focused)throw Error('Controle encoberto, oculto ou sem foco; nenhum clique enviado.');
    }
    if(this.options.mode==='preflight'&&!message.names){const hit=await this.dom('controlHit',{point:p,names:[]});if(/gerar|generation|retry|tentar.*novo|excluir|delete/i.test(hit.label||''))throw Error('Preflight encontrou controle proibido no ponto.');}
    const count=message.clickCount??1;if(!Number.isInteger(count)||count<1||count>2)throw Error('Contagem de clique invalida.');
    await this.page.mouse.click(p.x,p.y,{clickCount:count,delay:50});return {point:{x:p.x,y:p.y}};
  }
  async dispatch(m){
    this.guard(m);
    if(m.type==='dom'){
      if(m.op==='clickControl')return this.input(()=>this.pointClick({names:m.args?.names}));
      return this.dom(m.op,m.args||{});
    }
    if(m.type==='reload'){await this.page.reload({waitUntil:'domcontentloaded'});return true;}
    return this.input(async()=>{
      if(m.type==='clickControl'||m.type==='click')return this.pointClick(m);
      if(m.type==='hover'){await this.page.mouse.move(m.x,m.y);return true;}
      if(m.type==='key'){await this.page.keyboard.press(m.key);return true;}
      if(m.type==='text'){await this.page.keyboard.press(m.mac?'Meta+A':'Control+A');await this.page.keyboard.insertText(m.text);return true;}
      if(m.type==='setTitle'){
        const field=await this.dom('focusTitle');if(!field.active||field.selectionStart!==0||field.selectionEnd!==field.value.length)throw Error('Nome nao selecionado.');
        await this.page.keyboard.insertText(m.title);
        if(await this.dom('projectTitle')!==m.title)throw Error('Nome nao entrou no campo.');
        await this.dom('commitTitle',{title:m.title});return true;
      }
      if(m.type==='uploadDrop'){
        if(!isLocalPngPath(m.path)||(await stat(m.path)).isFile()!==true)throw Error('Frame PNG local invalido.');
        const cdp=await this.cdp(),metrics=await cdp.send('Page.getLayoutMetrics'),view=metrics.cssVisualViewport;
        const x=view.clientWidth*.6,y=view.clientHeight*.4,data={files:[resolve(m.path)],items:[],dragOperationsMask:1};
        for(const type of ['dragEnter','dragOver','drop']){await cdp.send('Input.dispatchDragEvent',{type,x,y,data});await this.page.waitForTimeout(100);}return true;
      }
      throw Error('Transporte nao implementado.');
    });
  }
  async destination(path){
    if(!this.downloadRoot)throw Error('Destino de download nao configurado.');
    const declaredRoot=resolve(this.downloadRoot),target=resolve(path);
    const lexicalCandidate=relative(declaredRoot,target);
    if(!lexicalCandidate||lexicalCandidate==='..'||lexicalCandidate.startsWith('..'+sep)||isAbsolute(lexicalCandidate))throw Error('Download fora do runtime proprio rejeitado.');
    const root=await realpath(declaredRoot),candidate=lexicalCandidate;
    let ancestor=dirname(target);
    while(true){try{ancestor=await realpath(ancestor);break;}catch(e){if(e.code!=='ENOENT')throw e;const next=dirname(ancestor);if(next===ancestor)throw e;ancestor=next;}}
    const ancestorDiff=relative(root,ancestor);
    if(ancestorDiff==='..'||ancestorDiff.startsWith('..'+sep)||isAbsolute(ancestorDiff))throw Error('Download fora do runtime proprio rejeitado.');
    await mkdir(dirname(target),{recursive:true});
    const parent=await realpath(dirname(target)),diff=relative(root,parent);
    if(diff==='..'||diff.startsWith('..'+sep)||isAbsolute(diff))throw Error('Download fora do runtime proprio rejeitado.');
    return target;
  }
}

export class PlaywrightFlowClient extends FlowClient{
  constructor(transport){super('playwright',transport.dispatch,{platform:platform()});this.browserTransport=transport;}
  async downloadOriginalTo(card,path,{strategy='ui_bytes'}={}){
    const transport=this.browserTransport;transport.guard({type:'clickControl'});
    if(!['browser','ui_bytes'].includes(strategy))throw Error('Estrategia de download invalida.');
    const target=await transport.destination(path);
    if(strategy==='ui_bytes'){
      const blob=await this.originalDownload(card);if(!blob.size)throw Error('Download original vazio.');await writeFile(target,Buffer.from(await blob.arrayBuffer()),{flag:'wx'});
    }else{
      await this.dom('openCard',{key:card.key});
      const id=await this.wait(()=>this.dom('assetId'),15000,'UUID do download');
      if(id!==card.assetId)throw Error('UUID do download diverge.');
      await this.wait(()=>this.dom('exists',{names:['Download media']}));await this.click(['Download media']);
      await this.wait(()=>this.dom('exists',{names:['720p']}));
      const pending=transport.page.waitForEvent('download',{timeout:30000});
      // Observe rejection if the single menu click fails. Never click twice.
      pending.catch(()=>{});await this.click(['720p']);const download=await pending;
      const temp=join(transport.downloadRoot,`.download_${randomUUID()}.part`);
      try{await download.saveAs(temp);if(!(await stat(temp)).size)throw Error('Download original vazio.');await copyFile(temp,target,constants.COPYFILE_EXCL);}finally{await rm(temp,{force:true});}
    }
    if(!(await stat(target)).size)throw Error('Download original vazio.');
    return {path:target,size:(await stat(target)).size,strategy};
  }
}
