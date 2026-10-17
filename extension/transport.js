import { flowDom } from './flow_dom.js';
import { stableControlPoint, waitForVisibleInput } from './trusted_control.js';
import { isLocalPngPath } from './core.js';
import {downloadMedia} from './programmatic_download.js';
import {reloadProject} from './reload_project.js';
const allowed = url => { const u=new URL(url);return u.protocol==='https:' && (u.hostname==='flow.google.com'||u.hostname==='labs.google'); };
const queues = new Map();
let inputTail=Promise.resolve();
async function debug(tabId, action) {
  const prior=inputTail;
  const task=prior.catch(()=>{}).then(async()=>{
    const tab=await chrome.tabs.get(tabId);
    if(!allowed(tab.url)) throw Error('Aba nao pertence ao Flow.');
    const windows=/win/i.test(navigator.platform||'');
    const canFocus=!!chrome.windows?.getLastFocused;
    const previous=canFocus?await chrome.windows.getLastFocused().catch(()=>null):null;
    // Focus the window before selecting its tab. Windows can restore another
    // selected tab when the window regains focus.
    if(canFocus)await chrome.windows.update(tab.windowId,{focused:true});
    await chrome.tabs.update(tabId,{active:true});
    let attached=false;
    try {
      await chrome.debugger.attach({tabId},'1.3');attached=true;
      if(canFocus){
        const front=()=>chrome.debugger.sendCommand({tabId},'Page.bringToFront');
        await front();
        await waitForVisibleInput(async()=>{
          const [{result}]=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:flowDom,args:['inputVisibility',{}]});
          if(result?.error)throw Error(result.error);
          const current=await chrome.tabs.get(tabId);
          const win=chrome.windows.get?await chrome.windows.get(tab.windowId).catch(()=>null):null;
          return {...result,tabActive:current.active!==false,windowState:win?.state};
        },async()=>{
          const win=chrome.windows.get?await chrome.windows.get(tab.windowId).catch(()=>null):null;
          await chrome.windows.update(tab.windowId,{...(windows||win?.state==='minimized'?{state:'normal'}:{}),focused:true});
          await chrome.tabs.update(tabId,{active:true});
          await front();
        });
      }
      return await action((method,params={})=>chrome.debugger.sendCommand({tabId},method,params));
    }
    finally {
      if(attached)await chrome.debugger.detach({tabId}).catch(()=>{});
      if(previous&&previous.id!==tab.windowId)await chrome.windows.update(previous.id,{focused:true}).catch(()=>{});
    }
  });
  inputTail=task.catch(()=>{});
  queues.set(tabId,task);try{return await task;}finally{if(queues.get(tabId)===task)queues.delete(tabId);}
}
async function clickControl(send,tabId,names){
    let pressAttempted=false;
    try{
    const locate=async()=>{
      const [{result}]=await chrome.scripting.executeScript({target:{tabId:tabId},world:'MAIN',func:flowDom,args:['point',{names:names}]});
      if(result?.error)throw Error(result.error);
      return result;
    };
    let point=await stableControlPoint(locate);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
    await new Promise(r=>setTimeout(r,100));
    point=await stableControlPoint(locate);
    const [{result:inputState}]=await chrome.scripting.executeScript({target:{tabId:tabId},world:'MAIN',func:a=>{
      const hit=document.elementFromPoint(a.point.x,a.point.y)?.closest('button,[role="button"],[role="menuitem"]');
      const label=(hit?.getAttribute('aria-label')||hit?.querySelector('.label')?.textContent||hit?.textContent||'').replace(/\s+/g,' ').trim()||null;
      return {focused:document.hasFocus(),visibility:document.visibilityState,hitLabel:label?.slice(0,80),hitMatches:a.names.includes(label),dpr:devicePixelRatio};
    },args:[{point,names:names}]});
    if(inputState?.hitMatches===false)throw Error('Controle de geracao encoberto; nenhum clique enviado.');
    const windows=/win/i.test(navigator.platform||'');
    if(inputState?.visibility==='hidden'||inputState?.focused===false){const error=Error('Janela do Flow ficou oculta ou sem foco antes do clique; nenhum input enviado.');error.beforeInput=true;error.focusLost=true;throw error;}
    const zoom=windows&&chrome.tabs.getZoom?await chrome.tabs.getZoom(tabId):null;
    pressAttempted=true;
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,modifiers:0,clickCount:1});
    if(windows)await new Promise(r=>setTimeout(r,50));
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,modifiers:0,clickCount:1});
    return {inputState,zoom,point:{x:point.x,y:point.y}};
    }catch(error){
      // Missing/covered controls are proven unsent only before the first press
      // command. A failed press RPC itself can have reached Chrome.
      if(!pressAttempted)error.beforeInput=true;
      throw error;
    }
}
export async function dispatch(m) {
  if(['harvestGeneration','replayGeneration'].includes(m.type))throw Error('Captura e replay de reCAPTCHA desativados; use os controles normais do Flow.');
  if(m.type==='clickControl'){
    for(let attempt=0;attempt<3;attempt++){
      let actionStarted=false;
      try{return await debug(m.tabId,send=>{actionStarted=true;return clickControl(send,m.tabId,m.names);});}
      catch(error){
        if(!actionStarted)error.beforeInput=true;
        // A focus race before mousePressed cannot have submitted anything.
        // Reacquire focus and geometry, never repeat a press or an unknown RPC.
        if(error.beforeInput===true&&error.focusLost===true&&attempt<2)continue;
        throw error;
      }
    }
  }
  const tab=await chrome.tabs.get(m.tabId);
  if(!allowed(tab.url)) throw Error('Abra o Flow na aba da automacao.');
  if(m.type==='reload'){
    return reloadProject(chrome,m.tabId);
  }
  if(m.type==='dom') {
    const [{result}]=await chrome.scripting.executeScript({target:{tabId:m.tabId},world:'MAIN',func:flowDom,args:[m.op,m.args||{}]});
    if(result?.error) throw Error(result.error);
    return result;
  }
  if(m.type==='click') return debug(m.tabId,async send=>{
    const clicks=m.clickCount??1;
    if(!Number.isInteger(clicks)||clicks<1||clicks>2)throw Error('Contagem de clique invalida.');
    const locate=async()=>{
      if(!m.assetName)return {x:m.x,y:m.y};
      const [{result}]=await chrome.scripting.executeScript({target:{tabId:m.tabId},world:'MAIN',func:flowDom,args:['selectAsset',{name:m.assetName}]});
      if(result?.error)throw Error(result.error);
      return result;
    };
    let point=await stableControlPoint(locate);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
    await new Promise(r=>setTimeout(r,100));
    if(m.assetName)point=await stableControlPoint(locate);
    for(let clickCount=1;clickCount<=clicks;clickCount++){
      await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,clickCount});
    }
  });
  if(m.type==='programmaticDownload'){
    const tab=await chrome.tabs.get(m.tabId);if(!allowed(tab.url))throw Error('Aba nao pertence ao Flow.');
    const [{result}]=await chrome.scripting.executeScript({target:{tabId:m.tabId},world:'MAIN',func:flowDom,args:['downloadSource',{assetId:m.assetId}]});
    if(result?.error)throw Error(result.error);if(!result||result.assetId!==m.assetId)throw Error('Fonte do asset nao carregou.');
    return downloadMedia(chrome,{url:result.url,assetId:m.assetId});
  }
  if(m.type==='downloadOriginal')return debug(m.tabId,async send=>{
    const dom=async(op,args={})=>{
      const [{result}]=await chrome.scripting.executeScript({target:{tabId:m.tabId},world:'MAIN',func:flowDom,args:[op,args]});
      if(result?.error)throw Error(`Download original (${op}): ${result.error}`);
      return result;
    };
    if(await dom('assetId')!==m.assetId)throw Error('Asset mudou antes do download original; nenhum clique enviado.');
    await dom('clickControl',{names:['Download media']});
    let ready=false;
    for(let attempt=0;attempt<25;attempt++){
      if(await dom('exists',{names:['720p']})){ready=true;break;}
      await new Promise(resolve=>setTimeout(resolve,600));
    }
    if(!ready)throw Error('Opcao original 720p nao abriu; nenhum download iniciado.');
    await dom('armDownload');
    try{return await clickControl(send,m.tabId,['720p']);}
    catch(error){await dom('releaseDownload').catch(()=>{});throw Error(`Download original (720p): ${error.message}`);}
  });
  if(m.type==='hover') return debug(m.tabId,async send=>{
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:m.x,y:m.y});
  });
  if(m.type==='uploadDrop') return debug(m.tabId,async send=>{
    if(!isLocalPngPath(m.path))throw Error('Frame local invalido.');
    const metrics=await send('Page.getLayoutMetrics');
    const viewport=metrics.cssVisualViewport;
    const x=viewport.clientWidth*0.6,y=viewport.clientHeight*0.4;
    const data={files:[m.path],items:[],dragOperationsMask:1};
    for(const type of ['dragEnter','dragOver','drop']){
      await send('Input.dispatchDragEvent',{type,x,y,data});
      await new Promise(r=>setTimeout(r,200));
    }
    return true;
  });
  if(m.type==='upload') return debug(m.tabId,async send=>{
    if(!isLocalPngPath(m.path))throw Error('Frame local invalido.');
    await send('Page.enable');
    await send('Page.setInterceptFileChooserDialog',{enabled:true});
    try{
      const root=await send('DOM.getDocument',{depth:0});
      let input=await send('DOM.querySelector',{nodeId:root.root.nodeId,selector:'input[type="file"][name="Filedata"]'});
      if(!input.nodeId){
        const [{result:p}]=await chrome.scripting.executeScript({target:{tabId:m.tabId},world:'MAIN',func:flowDom,args:['point',{names:['Upload']}]});
        if(p.error)throw Error(p.error);
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
        await new Promise(r=>setTimeout(r,350));
        await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
        await chrome.scripting.executeScript({target:{tabId:m.tabId},world:'MAIN',func:flowDom,args:['clickControl',{names:['Upload']}]});
        for(let i=0;i<20&&!input.nodeId;i++){
          await new Promise(r=>setTimeout(r,250));
          input=await send('DOM.querySelector',{nodeId:root.root.nodeId,selector:'input[type="file"][name="Filedata"]'});
        }
      }
      if(!input.nodeId)throw Error('Input Filedata de upload nao encontrado.');
      await send('DOM.setFileInputFiles',{files:[m.path],nodeId:input.nodeId});
      return true;
    }finally{await send('Page.setInterceptFileChooserDialog',{enabled:false}).catch(()=>{});}
  });
  if(m.type==='text') return debug(m.tabId,async send=>{
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:m.mac?4:2,windowsVirtualKeyCode:65});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:m.mac?4:2,windowsVirtualKeyCode:65});
    await send('Input.insertText',{text:m.text});
  });
  if(m.type==='setTitle') return debug(m.tabId,async send=>{
    const [{result}]=await chrome.scripting.executeScript({target:{tabId:m.tabId},world:'MAIN',func:flowDom,args:['focusTitle',{}]});
    if(!result?.active||result.selectionStart!==0||result.selectionEnd!==result.value.length)throw Error(`Selecao do nome nao confirmou: ${JSON.stringify(result)}`);
    await send('Input.insertText',{text:m.title});
    if(/win/i.test(navigator.platform||'')){
      // Windows can report successful trusted input while keeping the old
      // value. Reconcile the same textbox before Enter, never create a project.
      const readTitle=async()=>{
        const [{result:value}]=await chrome.scripting.executeScript({target:{tabId:m.tabId},world:'MAIN',func:flowDom,args:['projectTitle',{}]});
        return value;
      };
      if(await readTitle()!==m.title){
        const [{result:set}]=await chrome.scripting.executeScript({target:{tabId:m.tabId},world:'MAIN',func:flowDom,args:['setTitle',{title:m.title}]});
        if(!set||await readTitle()!==m.title)throw Error('Nome nao entrou no campo; projeto existente preservado.');
      }
      // Let React commit the input before the trusted Enter/blur events.
      await new Promise(r=>setTimeout(r,250));
      // The current Flow title editor exposes an explicit Done control. The
      // synthetic fallback changes the field but Enter/Tab may lose the save.
      const [{result:committed}]=await chrome.scripting.executeScript({target:{tabId:m.tabId},world:'MAIN',func:flowDom,args:['commitTitle',{title:m.title}]});
      if(!committed)throw Error('Nome nao foi concluido; projeto existente preservado.');
      return;
    }
    for(const [key,code,keyCode] of [['Enter','Enter',13],['Tab','Tab',9]]){
      await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:keyCode});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:keyCode});
    }
  });
  if(m.type==='key') return debug(m.tabId,async send=>{
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:m.key,code:m.key,windowsVirtualKeyCode:m.key==='Escape'?27:m.key==='Enter'?13:9});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:m.key,code:m.key,windowsVirtualKeyCode:m.key==='Escape'?27:m.key==='Enter'?13:9});
  });
  throw Error('Comando invalido.');
}
