import { dispatch } from './transport.js';
import { tick } from './native_runner.js';
chrome.action.onClicked.addListener(async () => {
  const url=chrome.runtime.getURL('status.html');
  const [existing]=await chrome.tabs.query({url});
  if(existing) {await chrome.tabs.update(existing.id,{active:true});await chrome.windows.update(existing.windowId,{focused:true});}
  else await chrome.tabs.create({url});
});
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(m.type==='tick'){tick().then(()=>reply({ok:true})).catch(e=>reply({ok:false,error:e.message}));return true;}
  if(sender.id!==chrome.runtime.id || sender.tab || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  dispatch(m).then(result=>reply({ok:true,result})).catch(e=>reply({ok:false,error:e.message}));return true;
});

chrome.alarms.create('flow_queue',{periodInMinutes:0.5});
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='flow_queue')tick();});
chrome.runtime.onStartup.addListener(()=>tick());
chrome.runtime.onInstalled.addListener(()=>tick());
tick();
