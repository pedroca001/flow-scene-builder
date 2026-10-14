import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatch} from '../extension/transport.js';

test('trusted input focuses only its Flow window on Mac and Windows and restores focus after failure',async()=>{
  const old=globalThis.chrome;
  const events=[];
  globalThis.chrome={tabs:{get:async()=>({url:'https://flow.google.com/u/2/project/test',windowId:7}),update:async()=>{}},
    windows:{getLastFocused:async()=>({id:9}),update:async(id)=>events.push(['focus',id])},
    scripting:{executeScript:async()=>[{result:{visible:true,focused:true}}]},
    debugger:{attach:async()=>{},detach:async()=>events.push(['detach']),sendCommand:async(_target,method)=>{
      events.push([method]);
      if(method==='Input.dispatchMouseEvent')throw Error('test input failure');
    }}};
  try{
    await assert.rejects(dispatch({type:'click',tabId:12,x:20,y:30}),/test input failure/);
    assert.deepEqual(events,[['focus',7],['Page.bringToFront'],['Input.dispatchMouseEvent'],['detach'],['focus',9]]);
  }finally{globalThis.chrome=old;}
});
