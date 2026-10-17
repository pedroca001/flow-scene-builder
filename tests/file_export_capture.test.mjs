import test from 'node:test';
import assert from 'node:assert/strict';
import {flowDom} from '../extension/flow_dom.js';
test('normal File System export is collected without invoking the native save picker',async()=>{
 const previous={document:globalThis.document,window:globalThis.window,anchor:globalThis.HTMLAnchorElement};let dialogs=0;
 const picker=async()=>{dialogs++;throw Error('Native dialog must not open');};
 globalThis.window={showSaveFilePicker:picker};globalThis.document={addEventListener(){},removeEventListener(){}};
 globalThis.HTMLAnchorElement=class {click(){throw Error('Native anchor must not run');}};
 try{
  assert.equal(await flowDom('armDownload',{}),true);
  const handle=await window.showSaveFilePicker();const writer=await handle.createWritable();
  await writer.write(new Uint8Array([1,2,3]));await writer.write({type:'write',position:1,data:new Uint8Array([9])});await writer.close();
  assert.equal(dialogs,0);assert.equal(window.showSaveFilePicker,picker);
  assert.equal(await flowDom('downloadLink',{}),'captured:file-system-export');
  const chunk=await flowDom('originalChunk',{offset:0});assert.deepEqual([...Uint8Array.from(atob(chunk.data),c=>c.charCodeAt(0))],[1,9,3]);
 }finally{
  await flowDom('releaseDownload',{});globalThis.document=previous.document;globalThis.window=previous.window;globalThis.HTMLAnchorElement=previous.anchor;
 }
});
