import test from 'node:test';
import assert from 'node:assert/strict';
import {flowDom} from '../extension/flow_dom.js';
import {FlowClient} from '../extension/flow_client.js';

test('named grid media ID must match loaded composer frame despite different CDN URLs',async()=>{
  const prev={document:globalThis.document,getComputedStyle:globalThis.getComputedStyle};
  const id='11111111-1111-4111-8111-111111111111';
  const source={complete:true,naturalWidth:720,src:'https://flow.google.com/asb/thumbnail',getAttribute:k=>k==='data-media-id'?id:null};
  const chip={complete:true,naturalWidth:720,src:`https://flow-content.google/image/${id}`,getClientRects:()=>[{}],getAttribute:()=>null};
  const asset={getClientRects:()=>[{}],getAttribute:()=> 'named.png',querySelector:()=>source};
  globalThis.document={querySelectorAll:s=>s==='flow-image-ingredient-chip img,flow-image-chip img'?[chip]:s==='flow-grid-tile-container[aria-label]'?[asset]:[]};
  globalThis.getComputedStyle=()=>({visibility:'visible'});
  try{
    assert.equal(await flowDom('frameMatches',{name:'named.png'}),true);
    chip.src='https://flow-content.google/image/22222222-2222-4222-8222-222222222222';
    assert.equal(await flowDom('frameMatches',{name:'named.png'}),false);
  }finally{Object.assign(globalThis,prev);}
});

test('frame confirmation sends one trusted click after preview, before identity verification',async()=>{
  const flow=new FlowClient(1);let attached=false;const calls=[];
  flow.wait=async fn=>{const value=await fn();assert.ok(value);return value;};
  flow.click=async names=>{calls.push(['open',names]);};
  flow.send=async(type,args)=>{assert.equal(type,'clickControl');assert.ok(args.names.includes('Incluir no comando'));calls.push(['confirm']);attached=true;};
  flow.confirmFrame=async()=>{assert.ok(attached);calls.push(['identity']);};
  flow.dom=async(op,args)=>{
    if(op==='frameMatches')return false;
    if(op==='frameState')return {hasImage:false,empty:true};
    if(op==='chooseAsset')return true;
    if(op==='acceptFrame'){assert.equal(args.probeOnly,true);return true;}
    if(op==='frameSource')return attached?'loaded':null;
    if(op==='exists'){
      if(args.names.includes('Start'))return !attached;
      return true;
    }
    throw Error(op);
  };
  await flow.finishFrameUpload('named.png');
  assert.deepEqual(calls.map(x=>x[0]),['open','confirm','identity']);
});
