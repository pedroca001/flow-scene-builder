import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatch} from '../extension/transport.js';

test('Windows reconciles dropped title text before committing without another project',async()=>{
  const prior=globalThis.chrome;
  const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  let title='Old title';const ops=[];const keys=[];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{platform:'Win32'}});
  globalThis.chrome={
    tabs:{get:async()=>({url:'https://flow.google.com/u/1/project/known',windowId:1}),update:async()=>({})},
    windows:{getLastFocused:async()=>({id:1}),update:async()=>({})},
    debugger:{attach:async()=>{},detach:async()=>{},sendCommand:async(_,method,args)=>{
      if(method==='Input.dispatchKeyEvent')keys.push(args.key);
      // Native insertText drops the edit, simulating the observed Windows issue.
      return {};
    }},
    scripting:{executeScript:async({args:[op,arg]})=>{
      ops.push(op);
      if(op==='inputVisibility')return [{result:{visible:true,focused:true}}];
      if(op==='focusTitle')return [{result:{active:true,selectionStart:0,selectionEnd:title.length,value:title}}];
      if(op==='projectTitle')return [{result:title}];
      if(op==='setTitle'){title=arg.title;return [{result:true}];}
      if(op==='commitTitle'){assert.equal(title,arg.title);return [{result:true}];}
      throw Error('Unexpected UI operation '+op);
    }}
  };
  try{
    await dispatch({tabId:1,type:'setTitle',title:'Saved title'});
    assert.equal(title,'Saved title');
    assert.deepEqual(ops,['inputVisibility','focusTitle','projectTitle','setTitle','projectTitle','commitTitle']);
    assert.deepEqual(keys,[]);
  }finally{
    globalThis.chrome=prior;
    if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator;
  }
});
