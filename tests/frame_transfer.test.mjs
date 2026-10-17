import test from 'node:test';
import assert from 'node:assert/strict';
import {frameDataUrl} from '../extension/frame_transfer.js';
import {FlowClient} from '../extension/flow_client.js';
const png='\x89PNG\r\n\x1a\n'+'test bytes';
test('native frame packets preserve exact bytes and offsets',async()=>{
  const offsets=[];const host={ask:async(op,{folder,offset})=>{assert.equal(op,'frame');assert.equal(folder,'current');offsets.push(offset);return {offset,size:png.length,data:btoa(png.slice(offset,offset+7))};}};
  assert.equal(await frameDataUrl(host,'current'),'data:image/png;base64,'+btoa(png));
  assert.deepEqual(offsets,[0,7,14]);
});
for(const packet of [{size:8,offset:1,data:'YQ=='},{size:8,offset:0,data:''},{size:8,offset:0,data:btoa('badbytes')},{size:8,offset:0,data:btoa(png)}])test('corrupt or incomplete frame transfer refuses upload '+JSON.stringify(packet),async()=>{
  await assert.rejects(frameDataUrl({ask:async()=>packet},'current'),/frame|PNG/);
});
for(const present of [true,false])test(`normal upload reuses exact existing name or drops one File without native drag (${present})`,async()=>{
  const f=new FlowClient(1,null,{readFrame:async()=>{calls.push('read frame');return 'data:image/png;base64,'+btoa(png);}});const calls=[];
  f.ensureAllMedia=async()=>{};f.closeSettings=async()=>{};f.wait=async fn=>assert.ok(await fn());
  f.send=async()=>{throw Error('Native drag must not run');};
  f.dom=async(op,args)=>{if(op==='exists')return args.names.includes('Start');if(op==='removeFrames')return [];if(op==='assetExists')return present;if(op==='dropImage'){assert.equal(args.name,'unique.png');calls.push('drop');return true;}throw Error(op);};
  await f.beginFrameUpload(null,'unique.png','/frame.png');
  assert.deepEqual(calls,present?[]:['read frame','drop']);
});
