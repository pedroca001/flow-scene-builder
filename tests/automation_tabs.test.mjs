import test from 'node:test';
import assert from 'node:assert/strict';
import {automationTabs} from '../extension/automation_tabs.js';
function fixture(){
  const stored={},windows=new Map(),tabs=new Map(),calls=[];let id=100,windowId=10;
  const api={storage:{local:{get:async()=>({...stored}),set:async value=>Object.assign(stored,value)}},
    windows:{get:async n=>{if(!windows.has(n))throw Error('Closed');return windows.get(n);},create:async options=>{
      calls.push(['window',options]);const tab={id:++id,windowId:++windowId,url:options.url};tabs.set(tab.id,tab);
      const win={id:windowId,tabs:[tab]};windows.set(win.id,win);return win;
    }},tabs:{get:async n=>{if(!tabs.has(n))throw Error('Closed');return tabs.get(n);},create:async options=>{calls.push(['tab',options]);const tab={id:++id,...options};tabs.set(tab.id,tab);windows.get(tab.windowId).tabs.push(tab);return tab;},
      move:async(n,options)=>{calls.push(['move',n,options]);const tab=tabs.get(n);const old=windows.get(tab.windowId);old.tabs=old.tabs.filter(t=>t.id!==n);tab.windowId=options.windowId;windows.get(tab.windowId).tabs.push(tab);return tab;},
      remove:async n=>{calls.push(['remove',n]);const tab=tabs.get(n);windows.get(tab.windowId).tabs=windows.get(tab.windowId).tabs.filter(t=>t.id!==n);tabs.delete(n);}}};
  return {api,stored,windows,tabs,calls};
}
test('simultaneous projects open tabs in exactly one unfocused window',async()=>{
  const f=fixture(),owner=automationTabs(f.api);
  const tabs=await Promise.all(Array.from({length:5},(_,n)=>owner.open('https://flow.google.com/project/'+n)));
  assert.equal(f.calls.filter(c=>c[0]==='window').length,1);
  assert.equal(new Set(tabs.map(t=>t.windowId)).size,1);
  assert.equal(f.calls[0][1].focused,false);
  assert.ok(f.calls.filter(c=>c[0]==='tab').every(c=>c[1].active===false));
});
test('adopts old dedicated windows but moves only owned job tabs',async()=>{
  const f=fixture(),owner=automationTabs(f.api);
  const a=await f.api.windows.create({url:'a'}),b=await f.api.windows.create({url:'b'});
  await owner.adopt(a.tabs[0]);await owner.adopt(b.tabs[0]);
  assert.equal(f.calls.filter(c=>c[0]==='window').length,2);
  assert.equal(b.tabs.length,0);assert.equal(a.tabs.length,2);
  assert.equal(f.calls.filter(c=>c[0]==='move').length,1);
});
test('does not adopt a user window containing other tabs',async()=>{
  const f=fixture(),owner=automationTabs(f.api);
  const user=await f.api.windows.create({url:'user'});
  const own=await f.api.tabs.create({windowId:user.id,url:'job',active:false});
  await owner.adopt(own);
  assert.deepEqual(user.tabs.map(t=>t.url),['user']);
  assert.equal(f.calls.filter(c=>c[0]==='window').length,2);
  assert.equal(f.calls.filter(c=>c[0]==='remove').length,1);
  assert.equal(f.windows.get(f.stored.automationWindow).tabs.length,1);
});
test('retiring completed projects keeps one window anchor and never closes changed user content',async()=>{
  const f=fixture(),owner=automationTabs(f.api);
  const a=await owner.open('https://flow.google.com/project/a');
  const b=await owner.open('https://flow.google.com/project/b');
  assert.equal(await owner.retire(a.id,a.url),true);
  assert.equal(await owner.retire(b.id,b.url),false);
  const changed=await owner.open('https://example.com/personal');
  assert.equal(await owner.retire(changed.id,'https://flow.google.com/project/c'),false);
  assert.ok(f.tabs.has(changed.id));assert.ok(f.tabs.has(b.id));
  assert.equal(f.calls.filter(c=>c[0]==='window').length,1);
});

test('serial jobs reuse the loaded project anchor without a new tab or navigation',async()=>{
  const f=fixture(),owner=automationTabs(f.api),url='https://flow.google.com/u/2/project/serial';
  const first=await owner.open(url);first.url=url+'/edit/asset';
  assert.equal((await owner.open(url,{reuseProject:true})).id,first.id);
  assert.equal(f.calls.filter(c=>c[0]==='tab').length,0);
  assert.equal(f.calls.filter(c=>c[0]==='window').length,1);
  assert.notEqual((await owner.open(url)).id,first.id);
});

test('reuse never selects a personal tab, a prefix collision, or an ambiguous project',async()=>{
  const f=fixture(),owner=automationTabs(f.api),url='https://flow.google.com/u/2/project/serial';
  const anchor=await owner.open(url+'-other');
  const personal=await f.api.windows.create({url});
  const next=await owner.open(url,{reuseProject:true});
  assert.notEqual(next.id,anchor.id);assert.notEqual(next.id,personal.tabs[0].id);
  await owner.open(url);
  const created=await owner.open(url,{reuseProject:true});
  assert.notEqual(created.id,next.id);
});

test('serial project anchor is retained even when another tab exists in the owned window',async()=>{
  const f=fixture(),owner=automationTabs(f.api),url='https://flow.google.com/u/2/project/serial';
  const tab=await owner.open(url);await owner.open('https://example.com/another');
  assert.equal(await owner.retire(tab.id,url,{keepProjectAnchor:true}),false);
  assert.equal((await owner.open(url,{reuseProject:true})).id,tab.id);
  assert.equal(f.calls.filter(c=>c[0]==='remove').length,0);
});
