import test from 'node:test';
import assert from 'node:assert/strict';
import {withUi,createUiQueue,UI_PRIORITY} from '../extension/ui_queue.js';
test('focus-sensitive transactions cannot interleave across projects and failures release the queue',async()=>{
  let release;const gate=new Promise(r=>release=r);const order=[];
  const first=withUi(async()=>{order.push('a focus');await gate;order.push('a save');throw Error('a failed');});
  const second=withUi(async()=>{order.push('b focus');order.push('b save');});
  await new Promise(r=>setImmediate(r));assert.deepEqual(order,['a focus']);release();
  await assert.rejects(first,/a failed/);await second;
  assert.deepEqual(order,['a focus','a save','b focus','b save']);
});
test('new projects and scene submissions outrank result polling',async()=>{
  const ui=createUiQueue(),order=[];let release;
  const first=ui(()=>new Promise(r=>release=r));await new Promise(r=>setImmediate(r));
  const poll=ui(()=>order.push('poll'),UI_PRIORITY.poll);
  const project=ui(()=>order.push('project'),UI_PRIORITY.project);
  const scene=ui(()=>order.push('scene'),UI_PRIORITY.scene+1);
  release();await Promise.all([first,poll,project,scene]);
  assert.deepEqual(order,['scene','project','poll']);
});
test('aged startup cannot starve behind continuously arriving scene preparation',async()=>{
  let clock=0,release;const ui=createUiQueue({now:()=>clock}),order=[];
  const first=ui(()=>new Promise(r=>release=r));await new Promise(r=>setImmediate(r));
  const project=ui(()=>order.push('old project'),UI_PRIORITY.project);
  clock=61000;
  const scene=ui(()=>order.push('fresh scene'),UI_PRIORITY.scene+4);
  release();await Promise.all([first,project,scene]);
  assert.deepEqual(order,['old project','fresh scene']);
});
test('ready results and downloads outrank a whole aged wave of preparation',async()=>{
  let clock=0,release;const ui=createUiQueue({now:()=>clock}),order=[];
  const first=ui(()=>new Promise(r=>release=r));await new Promise(r=>setImmediate(r));
  const preparations=Array.from({length:30},(_,i)=>ui(()=>order.push(`prepare${i}`),UI_PRIORITY.scene+4));
  clock=120000;
  const result=ui(()=>order.push('ready result'),UI_PRIORITY.result);
  const download=ui(()=>order.push('download'),UI_PRIORITY.download);
  release();await Promise.all([first,...preparations,result,download]);
  assert.deepEqual(order.slice(0,2),['download','ready result']);assert.equal(order.length,32);
});
test('downloads and final scenes preempt queued new project setup while one transaction remains atomic',async()=>{
  let release;const gate=new Promise(r=>release=r),order=[];
  const first=withUi(async()=>{order.push('running');await gate;order.push('saved');});
  await new Promise(r=>setImmediate(r));
  const newProject=withUi(()=>order.push('new project'),-1);
  const firstScene=withUi(()=>order.push('scene1'),1);
  const finalScene=withUi(()=>order.push('scene4'),4);
  const download=withUi(()=>order.push('download'),100);
  release();await Promise.all([first,newProject,firstScene,finalScene,download]);
  assert.deepEqual(order,['running','saved','download','scene4','scene1','new project']);
});
