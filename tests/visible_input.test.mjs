import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForVisibleInput} from '../extension/trusted_control.js';

test('focused but hidden Windows contents must be restored before trusted input',async()=>{
  let restored=0,reads=0;
  const states=[{visible:false,focused:true,tabActive:true},{visible:false,focused:true,tabActive:true},{visible:true,focused:true,tabActive:true}];
  const ready=await waitForVisibleInput(async()=>{reads++;return states.shift();},async()=>{restored++;},async()=>{});
  assert.equal(ready.visible,true);assert.equal(restored,1);assert.equal(reads,3);
});

test('already visible focused tab does not change any window state',async()=>{
  const ready={visible:true,focused:true,tabActive:true};
  assert.equal(await waitForVisibleInput(async()=>ready,async()=>{throw Error('Unexpected window change');}),ready);
});

test('hidden or inactive tab fails without granting permission to send input',async()=>{
  for(const state of [{visible:false,focused:true,tabActive:true},{visible:true,focused:true,tabActive:false}]){
    let restored=0;
    await assert.rejects(waitForVisibleInput(async()=>state,async()=>{restored++;},async()=>{},3),/nenhum input enviado/);
    assert.equal(restored,1);
  }
});
