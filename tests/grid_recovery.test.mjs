import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowClient} from '../extension/flow_client.js';
import {flowDom} from '../extension/flow_dom.js';
import {UI_PRIORITY} from '../extension/ui_queue.js';

test('missing header waits for identity; a real different email is never accepted',async()=>{
 const f=new FlowClient(1);let reads=0,waits=0;
 f.checkBlockers=async()=>{};
 f.dom=async()=>++reads===1?{email:null}:{email:'owner@example.com',home:'https://flow.google.com/u/2/'};
 f.wait=async probe=>{waits++;return probe();};
 assert.equal((await f.verifyAccount('owner@example.com')).email,'owner@example.com');assert.equal(waits,1);
 f.dom=async()=>({email:'other@example.com'});
 await assert.rejects(f.verifyAccount('owner@example.com'),/difere/);assert.equal(waits,1);
});

test('scroll diagnosis is read-only; normal grid restoration preserves editor scroll',async()=>{
 const prior={document:globalThis.document,location:globalThis.location,getComputedStyle:globalThis.getComputedStyle};
 const scroll={scrollTop:500,clientHeight:600};
 const item={getClientRects:()=>[{}],getAttribute:()=> 'All media',classList:{contains:()=>true}};
 const page={parentElement:null,querySelectorAll:()=>[scroll]};
 globalThis.document={scrollingElement:null,querySelector:()=>page,querySelectorAll:()=>[item]};
 globalThis.location={pathname:'/u/2/project/one'};globalThis.getComputedStyle=()=>({visibility:'visible',overflowY:'auto'});
 try{
  assert.deepEqual(await flowDom('gridState'),{needsRestore:true});assert.equal(scroll.scrollTop,500);
  assert.equal(await flowDom('allMedia'),false);assert.equal(scroll.scrollTop,0);assert.equal(await flowDom('allMedia'),true);
  scroll.scrollTop=500;globalThis.location.pathname+='/edit/asset';
  assert.equal(await flowDom('allMedia'),true);assert.equal(scroll.scrollTop,500);
 }finally{Object.assign(globalThis,prior);}
});

test('scrolled result wait restores the grid once before resolving an existing result',async()=>{
 const f=new FlowClient(1);let restored=false;const priorities=[];
 f.dom=async()=>({needsRestore:!restored});f.ensureAllMedia=async()=>{restored=true;};
 f.withUi=async(fn,priority)=>{priorities.push(priority);return fn();};
 f.videos=async()=>restored?[{key:'result'}]:[];
 f.inventory=async()=>[{assetId:'existing-result'}];
 assert.deepEqual(await f.readyInventory([]),[{assetId:'existing-result'}]);
 assert.deepEqual(priorities,[UI_PRIORITY.poll,UI_PRIORITY.result]);
});
