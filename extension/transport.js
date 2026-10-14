import { flowDom } from './flow_dom.js';
import { harvestAppRequest, replayAppRequest } from './recaptcha_submission.js';
import { stableControlPoint, waitForVisibleInput } from './trusted_control.js';
import { isLocalPngPath } from './core.js';
const allowed = url => { const u=new URL(url);return u.protocol==='https:' && (u.hostname==='flow.google.com'||u.hostname==='labs.google'); };
const queues = new Map();
let inputTail=Promise.resolve();
const harvested=new Map();
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
      const hit=document.elementFromPoint(a.point.x,a.point.y)?.closest('button,[role="button"]');
      const label=hit?.getAttribute('aria-label')||hit?.textContent?.trim()||null;
      return {focused:document.hasFocus(),visibility:document.visibilityState,hitLabel:label?.slice(0,80),hitMatches:a.names.includes(label),dpr:devicePixelRatio};
    },args:[{point,names:names}]});
    if(inputState?.hitMatches===false)throw Error('Controle de geracao encoberto; nenhum clique enviado.');
    const windows=/win/i.test(navigator.platform||'');
    if(inputState?.visibility==='hidden'||inputState?.focused===false){const error=Error('Janela do Flow ficou oculta ou sem foco antes do clique; nenhum input enviado.');error.beforeInput=true;throw error;}
    const zoom=windows&&chrome.tabs.getZoom?await chrome.tabs.getZoom(tabId):null;
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,modifiers:0,clickCount:1});
    if(windows)await new Promise(r=>setTimeout(r,50));
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,modifiers:0,clickCount:1});
    return {inputState,zoom,point:{x:point.x,y:point.y}};
}
export async function dispatch(m) {
  const tab=await chrome.tabs.get(m.tabId);
  if(!allowed(tab.url)) throw Error('Abra o Flow na aba da automacao.');
  if(m.type==='harvestGeneration')return debug(m.tabId,async send=>{
    if(harvested.has(m.tabId))throw Error('Colheita anterior ainda nao reconciliada.');
    const request=await harvestAppRequest({tabId:m.tabId,pageUrl:tab.url,send,events:chrome.debugger.onEvent,
      click:()=>clickControl(send,m.tabId,['Start generation','Iniciar geração','Gerar'])});
    const handle=crypto.randomUUID();
    const timer=setTimeout(()=>harvested.delete(m.tabId),60000);
    harvested.set(m.tabId,{handle,request,created:Date.now(),timer});
    return {handle,rpc:request.rpc,requestAborted:true};
  });
  if(m.type==='discardHarvest'){
    const saved=harvested.get(m.tabId);
    if(saved?.handle===m.handle){clearTimeout(saved.timer);harvested.delete(m.tabId);}return true;
  }
  if(m.type==='replayGeneration'){
    const saved=harvested.get(m.tabId);
    if(!saved||saved.handle!==m.handle)throw Error('Token ausente ou ja consumido; nao repetir.');
    clearTimeout(saved.timer);harvested.delete(m.tabId); // Consume before any network operation.
    const captureToSendMs=Date.now()-saved.created;
    if(captureToSendMs>45000||tab.url!==saved.request.pageUrl)throw Error('Token expirou ou projeto mudou; nenhum reenvio.');
    const [{result}]=await chrome.scripting.executeScript({target:{tabId:m.tabId},world:'MAIN',func:replayAppRequest,args:[saved.request]});
    if(!result?.ok){
      const error=Error(`Flow recusou ou nao confirmou o envio: ${result?.error||'delivery_uncertain'}.`);
      error.rpcError=result?.error||'delivery_uncertain';error.httpStatus=result?.httpStatus||0;error.definitiveRejection=result?.definitiveRejection===true;error.captureToSendMs=captureToSendMs;
      if(result?.error==='PUBLIC_ERROR_UNUSUAL_ACTIVITY')error.kind='recaptcha_rejected';
      else if(result?.httpStatus===429||/THROTTL|QUOTA|LIMIT|RESOURCE_EXHAUSTED/.test(result?.error||''))error.kind='account_limit';
      throw error;
    }
    return {ok:true,captureToSendMs};
  }
  if(m.type==='reload'){
    await new Promise((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(timer);chrome.tabs.onUpdated.removeListener(updated);};
      const updated=(id,change)=>{if(id===m.tabId&&change.status==='complete'){cleanup();resolve();}};
      const timer=setTimeout(()=>{cleanup();reject(Error('Recarregamento do projeto nao concluiu.'));},60000);
      chrome.tabs.onUpdated.addListener(updated);
      chrome.tabs.reload(m.tabId).catch(error=>{cleanup();reject(error);});
    });return true;
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
  if(m.type==='clickControl') return debug(m.tabId,send=>clickControl(send,m.tabId,m.names));
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
