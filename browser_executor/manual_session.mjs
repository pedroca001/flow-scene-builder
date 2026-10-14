import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {externalRoot,launchProfile,prototypeRoot} from './runtime.mjs';
import {PlaywrightTransport} from './transport.mjs';

const alive=pid=>{if(!Number.isInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
async function receipt(){const base=await externalRoot(prototypeRoot());try{return JSON.parse(await readFile(join(base,'manual_session.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function request(state,path,method='GET'){
  if(!state?.endpoint||!state?.token)throw Error('Janela dedicada ainda esta abrindo.');
  const url=new URL(state.endpoint);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw Error('Sessao local invalida.');
  const response=await fetch(state.endpoint+path,{method,headers:{Authorization:'Bearer '+state.token},signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw Error('Sessao local indisponivel.');return response.json();
}

export async function manualStatus(){const state=await receipt();if(!state||state.status==='closed'||!alive(state.pid))return {ok:false,window_open:false,generation_enabled:false};return request(state,'/status');}

export async function openManualSession({home='https://flow.google.com/'}={}){
  if(!/^https:\/\/flow\.google\.com\/(?:u\/\d+\/)?$/.test(home))throw Error('Open exige pagina inicial do Flow.');
  const base=await externalRoot(prototypeRoot());await mkdir(base,{recursive:true});
  const file=join(base,'manual_session.json'),previous=await receipt();
  if(previous&&alive(previous.pid))return {...await request(previous,'/focus','POST'),already_open:true};
  if(previous)await unlink(file);
  // Exclusive ownership also protects two shortcut clicks during browser startup.
  const owner={pid:process.pid,token:randomUUID(),endpoint:null,status:'starting'};
  await writeFile(file,JSON.stringify(owner),{flag:'wx',mode:0o600});
  const save=async value=>{const temp=file+'.'+process.pid+'.part';await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,file);};
  let context,server;
  try{
    context=await launchProfile(join(base,'session_profile'),{headless:false});
    const closed=new Promise(resolve=>context.once('close',resolve));
    let page=context.pages().find(p=>/^https:\/\/flow\.google\.com\//.test(p.url()))||context.pages()[0]||await context.newPage();
    if(!/^https:\/\/flow\.google\.com\//.test(page.url()))await page.goto(home,{waitUntil:'domcontentloaded',timeout:45000});
    await page.bringToFront();
    const status=async()=>{
      page=context.pages().find(p=>/^https:\/\/flow\.google\.com\//.test(p.url()))||page;
      let account=null;
      if(!page.isClosed()){try{account=await new PlaywrightTransport(page,{mode:'inspect'}).dom('account');}catch{}}
      return {ok:true,stage:'manual_login',window_open:!page.isClosed(),account_visible:Boolean(account?.email),home_index:account?.home?.match(/\/u\/(\d+)\/$/)?.[1]||null,generation_enabled:false};
    };
    server=createServer(async(req,res)=>{
      const reply=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
      if(req.headers.authorization!=='Bearer '+owner.token||req.headers.origin){reply(403,{ok:false});return;}
      try{
        if(req.method==='GET'&&req.url==='/status'){reply(200,await status());return;}
        if(req.method==='POST'&&req.url==='/focus'){if(!page.isClosed())await page.bringToFront();reply(200,await status());return;}
        reply(404,{ok:false});
      }catch{reply(500,{ok:false});}
    });
    await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});
    owner.endpoint='http://127.0.0.1:'+server.address().port;owner.status='open';await save(owner);
    console.log(JSON.stringify(await status()));
    // No polling deadline: the user explicitly keeps this window for manual login.
    await closed;return {ok:true,stage:'manual_session_closed',generation_enabled:false};
  }finally{
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(context)await context.close();
    await save({pid:null,status:'closed',generation_enabled:false});
  }
}
