import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowClient} from '../extension/flow_client.js';

test('720p original is armed before one trusted click and transferred without native download API',async()=>{
  const events=[];const f=new FlowClient(1);
  f.dom=async(op)=>{
    events.push(op);
    if(op==='assetId')return 'saved';
    if(op==='downloadLink')return 'blob:original';
    if(op==='originalChunk')return {offset:0,size:3,data:btoa('mp4')};
    return true;
  };
  f.send=async(type,args)=>{assert.equal(type,'downloadOriginal');assert.equal(args.assetId,'saved');events.push('focused transaction');};
  const blob=await f.originalDownload({key:'card',assetId:'saved'});
  assert.equal(await blob.text(),'mp4');
  assert.ok(events.indexOf('focused transaction')<events.indexOf('originalChunk'));
  assert.equal(events.filter(x=>x==='focused transaction').length,1);
  assert.equal(events.at(-1),'releaseDownload');
});

test('failed original click disarms capture immediately without native fallback or second click',async()=>{
  const f=new FlowClient(1);const events=[];
  f.dom=async op=>{events.push(op);return op==='assetId'?'saved':true;};
  f.click=async()=>{};f.send=async()=>{events.push('click');throw Error('covered');};
  await assert.rejects(f.originalDownload({key:'card',assetId:'saved'}),/covered/);
  assert.equal(events.filter(x=>x==='click').length,1);assert.equal(events.at(-1),'releaseDownload');
});
