import { flowDom } from './flow_dom.js';
const allowed = url => { const u=new URL(url);return u.protocol==='https:' && (u.hostname==='flow.google.com'||u.hostname==='labs.google'); };
const queues = new Map();
let inputTail=Promise.resolve();
async function debug(tabId, action) {
  const prior=inputTail;
  const task=prior.catch(()=>{}).then(async()=>{
    if(!allowed((await chrome.tabs.get(tabId)).url)) throw Error('Aba nao pertence ao Flow.');
    // Activate the dedicated tab before trusted input to satisfy focus-dependent upload widgets.
    await chrome.tabs.update(tabId,{active:true});
    await chrome.debugger.attach({tabId},'1.3');
    try { return await action((method,params={})=>chrome.debugger.sendCommand({tabId},method,params)); }
    finally { await chrome.debugger.detach({tabId}).catch(()=>{}); }
  });
  inputTail=task.catch(()=>{});
  queues.set(tabId,task);try{return await task;}finally{if(queues.get(tabId)===task)queues.delete(tabId);}
}
export async function dispatch(m) {
  const tab=await chrome.tabs.get(m.tabId);
  if(!allowed(tab.url)) throw Error('Abra o Flow na aba da automacao.');
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
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:m.x,y:m.y});
    await new Promise(r=>setTimeout(r,100));
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:m.x,y:m.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:m.x,y:m.y,button:'left',clickCount:1});
  });
  if(m.type==='hover') return debug(m.tabId,async send=>{
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:m.x,y:m.y});
  });
  if(m.type==='uploadDrop') return debug(m.tabId,async send=>{
    if(typeof m.path!=='string'||!m.path.startsWith('/')||!m.path.endsWith('.png'))throw Error('Frame local invalido.');
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
    if(typeof m.path!=='string'||!m.path.startsWith('/')||!m.path.endsWith('.png'))throw Error('Frame local invalido.');
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
