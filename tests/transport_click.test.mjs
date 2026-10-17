import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatch} from '../extension/transport.js';

async function fixture(action,{disabled=false,covered=false,lostFocus=false,pressError=false}={}){
  const previous=globalThis.chrome;let moved=false,focusChecks=0;const events=[];
  globalThis.chrome={
    tabs:{get:async()=>({url:'https://flow.google.com/u/1/project/11111111-1111-4111-8111-111111111111',windowId:7}),update:async()=>{}},
    windows:{getLastFocused:async()=>({id:7}),update:async()=>{}},
    scripting:{executeScript:async({args})=>[{result:args?.[0]==='inputVisibility'?{visible:true,focused:true}:typeof args?.[0]==='object'?{hitMatches:!covered,focused:!(typeof lostFocus==='function'?lostFocus(++focusChecks):lostFocus),visibility:'visible'}:{x:moved?90:10,y:moved?70:20,disabled}}]},
    debugger:{attach:async()=>{},detach:async()=>{},sendCommand:async(_target,method,params)=>{
      if(method==='Input.dispatchMouseEvent'){events.push(params);if(params.type==='mouseMoved')moved=true;if(pressError&&params.type==='mousePressed')throw Error('press RPC disconnected');}
    }}
  };
  try{await action();return events;}catch(error){error.mouseEvents=events;throw error;}finally{globalThis.chrome=previous;}
}

test('generation control follows layout changed by hover and emits a single left click',async()=>{
  const events=await fixture(()=>dispatch({type:'clickControl',tabId:7,names:['Start generation']}));
  const press=events.filter(e=>e.type==='mousePressed');
  assert.equal(press.length,1);assert.deepEqual([press[0].x,press[0].y],[90,70]);
  assert.equal(press[0].buttons,1);assert.equal(events.find(e=>e.type==='mouseReleased').buttons,0);
});

test('named asset double click preserves final geometry and button state on both presses',async()=>{
  const events=await fixture(()=>dispatch({type:'click',tabId:7,assetName:'unique.png',x:10,y:20,clickCount:2}));
  const press=events.filter(e=>e.type==='mousePressed');
  assert.deepEqual(press.map(e=>[e.x,e.y,e.clickCount,e.buttons]),[[90,70,1,1],[90,70,2,1]]);
  assert.ok(events.filter(e=>e.type==='mouseReleased').every(e=>e.buttons===0));
});

test('disabled generation never emits a mouse press',async()=>{
  await assert.rejects(fixture(()=>dispatch({type:'clickControl',tabId:7,names:['Start generation']}),{disabled:true}),error=>error.beforeInput===true&&/desabilitado/.test(error.message)&&!error.mouseEvents.some(e=>e.type==='mousePressed'));
});

test('covered generation control never presses an unrelated UI element',async()=>{
  await assert.rejects(fixture(()=>dispatch({type:'clickControl',tabId:7,names:['Start generation']}),{covered:true}),error=>error.beforeInput===true&&/encoberto/.test(error.message)&&!error.mouseEvents.some(e=>e.type==='mousePressed'));
});

test('failed mouse press RPC remains uncertain even if Chrome did not acknowledge it',async()=>{
  await assert.rejects(fixture(()=>dispatch({type:'clickControl',tabId:7,names:['Start generation']}),{pressError:true}),error=>!error.beforeInput&&error.mouseEvents.some(e=>e.type==='mousePressed'));
});

test('losing window focus on any platform blocks the press before input',async()=>{
  await assert.rejects(fixture(()=>dispatch({type:'clickControl',tabId:7,names:['Start generation']}),{lostFocus:true}),error=>error.beforeInput===true&&!error.mouseEvents.some(e=>e.type==='mousePressed'));
});

test('a transient focus race is reacquired before exactly one mouse press',async()=>{
  const events=await fixture(()=>dispatch({type:'clickControl',tabId:7,names:['Start generation']}),{lostFocus:attempt=>attempt===1});
  assert.equal(events.filter(e=>e.type==='mousePressed').length,1);
  assert.equal(events.filter(e=>e.type==='mouseReleased').length,1);
  assert.equal(events.filter(e=>e.type==='mouseMoved').length,2);
});
