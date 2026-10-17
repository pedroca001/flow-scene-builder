import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadMedia} from '../extension/programmatic_download.js';
import {FlowClient} from '../extension/flow_client.js';
const assetId='11111111-1111-1111-1111-111111111111';
function fixture(saved=null){
 const events=[];let stored=saved;
 const api={storage:{local:{get:async()=>({['programmaticMedia:'+assetId]:stored}),set:async v=>{stored=Object.values(v)[0];}}},
 downloads:{download:async opts=>{events.push(opts);return 7;},search:async()=>[{id:7,state:'complete',danger:'safe',filename:'/Downloads/flow_scene_builder_downloads/'+assetId+'_1.mp4'}]}};
 return {api,events};
}
test('programmatic media save disables the chooser and returns its exact download receipt',async()=>{
 const {api,events}=fixture();const receipt=await downloadMedia(api,{assetId,url:'https://flow-content.google/video.mp4'});
 assert.equal(events.length,1);assert.equal(events[0].saveAs,false);assert.equal(events[0].conflictAction,'uniquify');assert.match(events[0].filename,/^flow_scene_builder_downloads\//);
 assert.equal(receipt.media_id,assetId);assert.equal(receipt.download_id,7);
});
test('recovery reuses the existing download ID instead of downloading again',async()=>{
 const {api,events}=fixture({id:7});await downloadMedia(api,{assetId,url:'https://flow-content.google/video.mp4'});assert.equal(events.length,0);
});
test('client pins the asset without opening the Flow download menu',async()=>{
 const f=new FlowClient(1),calls=[];
 f.dom=async(op,args)=>{calls.push(op);if(op==='assetId')return assetId;return {assetId,url:'https://flow-content.google/video.mp4'};};
 f.send=async(type,args)=>{assert.equal(type,'programmaticDownload');assert.equal(args.assetId,assetId);return {download_id:7};};
 assert.equal((await f.programmaticDownload({key:'card',assetId})).download_id,7);
 assert.deepEqual(calls,['openCard','assetId','downloadSource']);
});
test('unsafe download warnings never get accepted automatically',async()=>{
 const {api}=fixture({id:7});api.downloads.search=async()=>[{id:7,state:'complete',danger:'dangerous'}];
 await assert.rejects(downloadMedia(api,{assetId,url:'https://flow-content.google/video.mp4'}),/seguranca/);
});
test('canvas editor exports bytes through capture when no DOM media URL exists',async()=>{
 const f=new FlowClient(1),calls=[];
 f.dom=async op=>op==='assetId'?assetId:op==='downloadSource'?null:op==='downloadLink'?'captured:file':op==='originalChunk'?{offset:0,size:3,data:btoa('mp4')}:true;
 f.send=async type=>{calls.push(type);};
 const result=await f.programmaticDownload({key:'card',assetId});
 assert.equal(result.captured_export,true);assert.equal(await result.blob.text(),'mp4');assert.deepEqual(calls,['downloadOriginal']);
});
