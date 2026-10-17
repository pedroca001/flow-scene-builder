import {flowDom} from './flow_dom.js';

// Third-party resources can prevent load=complete after Flow is already usable.
// A different browser document ID plus the visible account/composer is fresh
// navigation evidence, not permission to generate. Callers still verify access.
export async function reloadProject(api,tabId,{timeoutMs=60000,pollMs=500}={}){
  const inspect=async()=>{
    const [injection]=await api.scripting.executeScript({target:{tabId},world:'MAIN',func:flowDom,args:['projectReady',{}]});
    return injection;
  };
  const before=await inspect().catch(()=>null);
  return new Promise((resolve,reject)=>{
    let done=false,checking=false,loading=false,complete=false,pollTimer,deadline;
    const cleanup=()=>{clearTimeout(pollTimer);clearTimeout(deadline);api.tabs.onUpdated.removeListener(updated);};
    const finish=error=>{if(done)return;done=true;cleanup();error?reject(error):resolve(true);};
    const check=async()=>{
      if(done||checking)return;checking=true;
      try{
        const current=await inspect();
        const fresh=before?.documentId&&current?.documentId?before.documentId!==current.documentId:loading&&complete;
        if(fresh&&current?.result?.ready===true)finish();
      }catch{}finally{checking=false;}
    };
    const poll=async()=>{await check();if(!done)pollTimer=setTimeout(poll,pollMs);};
    const updated=(id,change)=>{if(id!==tabId)return;if(change.status==='loading')loading=true;if(change.status==='complete'){complete=true;void check();}};
    api.tabs.onUpdated.addListener(updated);
    deadline=setTimeout(async()=>{await check();if(!done)finish(Error('Recarregamento do projeto nao concluiu.'));},timeoutMs);
    api.tabs.reload(tabId).then(()=>{if(!done)pollTimer=setTimeout(poll,pollMs);},finish);
  });
}
