import test from 'node:test';
import assert from 'node:assert/strict';
import {profileRoute} from '../extension/profile_route.js';
import {sharedUi} from '../extension/shared_ui.js';
const routes=[{id:'a',project:'https://flow.google.com/u/2/project/aaa',host:'a'},{id:'b',project:'https://flow.google.com/project/bbb',host:'b'}];
function api(urls,saved){let state={nativeProfileRoute:saved};return {tabs:{query:async()=>urls.map((url,id)=>({url,id,windowId:id+1}))},storage:{local:{get:async()=>state,set:async v=>Object.assign(state,v)}}};}
test('profile route isolates both projects and survives idle without tabs',async()=>{
 assert.equal((await profileRoute(api([routes[0].project+'/edit/123']),routes)).host,'a');
 assert.equal((await profileRoute(api([routes[1].project]),routes)).host,'b');
 assert.equal((await profileRoute(api([],'b'),routes)).host,'b');
 assert.equal(await profileRoute(api(['https://flow.google.com/']),routes),null);
 await assert.rejects(profileRoute(api(routes.map(r=>r.project)),routes),/Dois projetos/);
 await assert.rejects(profileRoute(api([routes[0].project],'b'),routes),/difere/);
});
test('retired profile cannot reconnect to the sole remaining queue',async()=>{
 assert.equal(await profileRoute(api([routes[1].project],'b'),[routes[0]]),null);
 assert.equal(await profileRoute(api([routes[0].project],'b'),[routes[0]]),null);
 assert.equal((await profileRoute(api([routes[0].project],'a'),[routes[0]])).host,'a');
});
test('shared input waits for lease and releases on action error',async()=>{
 const calls=[];let attempts=0;
 const host={ask:async(op,args)=>{calls.push([op,args]);return op==='ui_acquire'?{acquired:++attempts>1,token:'token'}:true;}};
 const input=sharedUi(host,'folder',fn=>fn(),async()=>calls.push(['wait']));
 await assert.rejects(input(async()=>{calls.push(['action']);throw Error('failed');}),/failed/);
 assert.deepEqual(calls.map(c=>c[0]),['ui_acquire','wait','ui_acquire','action','ui_release']);
 assert.equal(calls.at(-1)[1].token,'token');
});
