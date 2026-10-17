import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatch} from '../extension/transport.js';

async function fixture(assetId='saved'){
  const old=globalThis.chrome;const events=[];
  globalThis.chrome={
    tabs:{get:async()=>({url:'https://flow.google.com/u/2/project/test',windowId:7}),update:async()=>{}},
    windows:{getLastFocused:async()=>({id:9}),update:async id=>events.push('focus '+id)},
    scripting:{executeScript:async({args})=>{
      const op=args?.[0];events.push(typeof op==='string'?op:'hit test');
      if(op==='inputVisibility')return [{result:{visible:true,focused:true}}];
      if(op==='assetId')return [{result:assetId}];
      if(op==='point')return [{result:{x:10,y:20}}];
      if(typeof op==='object')return [{result:{hitMatches:true,focused:true,visibility:'visible'}}];
      return [{result:true}];
    }},
    debugger:{attach:async()=>{},detach:async()=>{},sendCommand:async(_target,method,params)=>{
      if(method==='Input.dispatchMouseEvent')events.push(params.type);
    }}
  };
  try{await dispatch({type:'downloadOriginal',tabId:7,assetId:'saved'});return events;}
  catch(error){error.events=events;throw error;}
  finally{globalThis.chrome=old;}
}
test('opening menu and trusted 720p click keep one focus lease until release',async()=>{
  const events=await fixture();
  assert.deepEqual(events.filter(e=>e.startsWith('focus ')),['focus 7','focus 9']);
  assert.ok(events.indexOf('focus 7')<events.indexOf('clickControl'));
  assert.ok(events.indexOf('clickControl')<events.indexOf('armDownload'));
  assert.ok(events.indexOf('armDownload')<events.indexOf('mousePressed'));
  assert.ok(events.indexOf('mouseReleased')<events.indexOf('focus 9'));
  assert.equal(events.filter(e=>e==='mousePressed').length,1);
});
test('asset change before focused download never opens menu or clicks',async()=>{
  await assert.rejects(fixture('other'),error=>/Asset mudou/.test(error.message)&&!error.events.includes('clickControl')&&!error.events.includes('mousePressed'));
});
