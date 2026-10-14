// Own one background window. Never merge or focus the user's other tabs.
export function automationTabs(api){
  const key='automationWindow';let tail=Promise.resolve();
  const serial=action=>{const task=tail.catch(()=>{}).then(action);tail=task.catch(()=>{});return task;};
  async function savedWindow(){
    const saved=await api.storage.local.get(key);
    return saved[key]?api.windows.get(saved[key]).catch(()=>null):null;
  }
  async function remember(win){await api.storage.local.set({[key]:win.id});return win;}
  return {
    retire:(tabId,project)=>serial(async()=>{
      const win=await savedWindow();
      const tab=await api.tabs.get(tabId).catch(()=>null);
      if(!win||!tab||tab.windowId!==win.id||!(tab.url===project||tab.url.startsWith(project+'/')))return false;
      const current=await api.windows.get(win.id,{populate:true});
      // Keep the last tab as the anchor so the next wave reuses this same window.
      if(current.tabs.length<=1)return false;
      await api.tabs.remove(tabId);return true;
    }),
    open:url=>serial(async()=>{
      const win=await savedWindow();
      if(win)return api.tabs.create({windowId:win.id,url,active:false});
      const created=await remember(await api.windows.create({url,type:'normal',focused:false,width:1100,height:900}));
      return created.tabs[0];
    }),
    adopt:tab=>serial(async()=>{
      let win=await savedWindow();
      if(!win){
        const old=await api.windows.get(tab.windowId,{populate:true});
        if(old.tabs.length===1&&old.tabs[0].id===tab.id)win=await remember(old);
        else{
          win=await remember(await api.windows.create({url:'about:blank',type:'normal',focused:false,width:1100,height:900}));
          const moved=await api.tabs.move(tab.id,{windowId:win.id,index:-1});
          await api.tabs.remove(win.tabs[0].id);
          return moved;
        }
      }
      return tab.windowId===win.id?tab:api.tabs.move(tab.id,{windowId:win.id,index:-1});
    })
  };
}
