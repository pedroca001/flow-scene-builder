import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSettings,validatePreset} from '../extension/core.js';

const settings={model:'Veo 3.1 - Lite [Lower Priority]',credits:0,video:true,frames:true,ratio:'9:16',count:'x1',summary:'Video · 720p · 6s',agent:false};
test('short duration is explicit and still enforces zero credits and exact UI duration',()=>{
  assert.equal(assertSettings(settings,'lower',undefined,1,6),0);
  assert.throws(()=>assertSettings(settings,'lower'));
  assert.throws(()=>assertSettings({...settings,credits:1},'lower',undefined,1,6));
  assert.throws(()=>assertSettings(settings,'lower',undefined,1,5));
  for(const seconds of [4,6,8]) validatePreset({model:'lower',seconds,prompts:['Hook']});
  for(const seconds of [5,true,'6']) assert.throws(()=>validatePreset({model:'lower',seconds,prompts:['Hook']}));
});
