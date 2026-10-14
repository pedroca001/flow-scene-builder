import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowClient} from '../extension/flow_client.js';

for(const doubleRequired of [false,true]){
  test(`named frame identity is verified with ${doubleRequired?'double':'legacy single'} click preview`,async()=>{
    const base='https://flow.google.com/u/1/project/known';
    const asset=base+'/edit/00000000-0000-0000-0000-000000000001';
    const source='https://example.invalid/named-frame';
    let url=base;const clicks=[];
    const client=new FlowClient(1,async m=>{
      assert.equal(m.type,'click');clicks.push(m.clickCount);
      if(!doubleRequired||m.clickCount===2)url=asset;
    });
    client.dom=async op=>{
      if(op==='frameMatches')return false;
      if(op==='frameSource')return source;
      if(op==='selectAsset')return {x:20,y:30};
      if(op==='project')return {url};
      if(op==='assetExists')return url===base;
      if(op==='imageAssetSource')return url===asset?source:null;
      throw Error('Unexpected UI operation '+op);
    };
    client.backToProject=async()=>{url=base;};
    assert.equal(await client.confirmFrame('frame.png'),true);
    assert.deepEqual(clicks,doubleRequired?[1,2]:[1]);
  });
}

test('unexpected navigation never double-clicks another page',async()=>{
  let clicks=0;
  const client=new FlowClient(1,async()=>{clicks++;});
  client.dom=async op=>({frameMatches:false,frameSource:'named-source',selectAsset:{x:20,y:30},project:{url:'https://flow.google.com/u/1/'},assetExists:false}[op]);
  client.backToProject=async()=>{};
  await assert.rejects(client.confirmFrame('frame.png'),/Asset nomeado deixou/);
  assert.equal(clicks,1);
});

test('Windows can open only the named read-only preview when native image clicks stall',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'navigator',{value:{platform:'Win32'},configurable:true});
  try{
    const base='https://flow.google.com/u/1/project/known';
    const asset=base+'/edit/00000000-0000-0000-0000-000000000001';
    const source='https://example.invalid/named-frame';let url=base;let fallback=0;
    const client=new FlowClient(1,async()=>{});
    client.dom=async(op,args)=>{
      if(op==='frameMatches')return false;
      if(op==='frameSource')return source;
      if(op==='selectAsset')return {x:20,y:30};
      if(op==='project')return {url};
      if(op==='assetExists')return url===base;
      if(op==='imageAssetSource')return url===asset?source:null;
      if(op==='openNamedImagePreview'){
        assert.deepEqual(args,{name:'frame.png',source});fallback++;url=asset;return true;
      }
      throw Error('Unexpected UI operation '+op);
    };
    client.wait=async fn=>{const result=await fn();if(!result)throw Error('preview did not open');return result;};
    client.backToProject=async()=>{url=base;};
    assert.equal(await client.confirmFrame('frame.png'),true);
    assert.equal(fallback,1);assert.equal(url,base);
  }finally{
    if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;
  }
});
