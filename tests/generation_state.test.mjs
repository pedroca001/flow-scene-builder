import test from 'node:test';
import assert from 'node:assert/strict';
import {flowDom} from '../extension/flow_dom.js';

test('Failed and pending video wrappers do not count as completed generation results',async()=>{
  const oldDocument=globalThis.document,oldStyle=globalThis.getComputedStyle;
  const tile=child=>({getClientRects:()=>[{}],querySelector:()=>child?{}:null});
  const done=tile(false),failed=tile(true),pending=tile(true),error=tile(false),waiting=tile(false);
  globalThis.document={querySelectorAll:selector=>({'flow-video-tile':[done,failed,pending],'flow-error-tile':[error],'flow-pending-tile':[waiting]})[selector]||[]};
  globalThis.getComputedStyle=()=>({visibility:'visible'});
  try{assert.deepEqual(await flowDom('generationState'),{videos:1,errors:1,pending:1});}
  finally{globalThis.document=oldDocument;globalThis.getComputedStyle=oldStyle;}
});
