import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFor,assertSettings,newVideos,mediaKey,newRun,renderPrompt,validatePreset} from '../extension/core.js';
import {readFileSync} from 'node:fs';
const DEFAULT_PRESET=JSON.parse(readFileSync(new URL('../presets/ugc_ingredientes.json',import.meta.url),'utf8'));
const settings={model:'Veo 3.1 - Lite',credits:10,video:true,frames:true,ratio:'9:16',count:'x1',summary:'Video · 720p · 8s',agent:false};
test('as duas primeiras cenas partem da foto e as seguintes do frame anterior',()=>{
  assert.deepEqual(Array.from({length:6},(_,i)=>sourceFor(i)),[{type:'original'},{type:'original'},{type:'last_frame',scene:1},{type:'last_frame',scene:2},{type:'last_frame',scene:3},{type:'last_frame',scene:4}]);
});
test('Lite normal aceita 5 ou 10 creditos, rejeita custo desconhecido e Quality',()=>{
  for(const credits of [5,10])assert.equal(assertSettings({...settings,credits},'lite'),credits);
  for(const credits of [null,undefined,100])assert.throws(()=>assertSettings({...settings,credits},'lite'));
  assert.throws(()=>assertSettings({...settings,model:'Veo 3.1 - Quality'},'lite'));
});
test('Lower Priority exige modelo certo e custo zero sem fallback',()=>{
  const s={...settings,model:'Veo 3.1 - Lite [Lower Priority]',credits:0};
  assert.equal(assertSettings(s,'lower'),0);assert.throws(()=>assertSettings({...s,credits:5},'lower'));
  assert.throws(()=>assertSettings(settings,'lower'));assert.throws(()=>assertSettings(s,'lite'));
});
test('recusa proporcao, quantidade, duracao e modo diferentes',()=>{
  for(const wrong of [{ratio:'16:9'},{count:'x2'},{summary:'Video · 1080p · 8s'},{summary:'Video · 720p · 4s'},{frames:false},{agent:true}])assert.throws(()=>assertSettings({...settings,...wrong},'lite'));
});
test('URLs renovadas do mesmo video nao sao confundidas com nova cena',()=>{
  const old='https://flow-content.google/video/123?Expires=1&Signature=a';
  const renewed='https://flow-content.google/video/123?Expires=2&Signature=b';
  const next='https://flow-content.google/video/456?Expires=2';
  assert.equal(mediaKey(old),mediaKey(renewed));assert.deepEqual(newVideos([{key:mediaKey(renewed),url:renewed},{key:mediaKey(next),url:next}],[mediaKey(old)]),[{key:mediaKey(next),url:next}]);
});
test('preset de quatro cenas e snapshot de execucao preservam texto fonte',()=>{
  validatePreset(DEFAULT_PRESET);const r=newRun('Receita lago',DEFAULT_PRESET);
  assert.equal(r.scenes.length,4);assert.equal(r.scenes[0].state,'ready');
  assert.ok(DEFAULT_PRESET.prompts[0].includes('1080x1920'));assert.ok(r.scenes[0].prompt.includes('720x1280'));
  r.preset.prompts[0]='changed';assert.notEqual(DEFAULT_PRESET.prompts[0],'changed');
  assert.equal(renderPrompt('720x1280 remains'),'720x1280 remains');
  assert.throws(()=>validatePreset({...DEFAULT_PRESET,prompts:['','']}));
});

test('x4 requires explicit count and preserves zero-credit gate',()=>{
 const s={...settings,model:'Veo 3.1 - Lite [Lower Priority]',credits:0,count:'x4'};
 assert.equal(assertSettings(s,'lower',undefined,4),0);
 assert.throws(()=>assertSettings(s,'lower'));
 assert.throws(()=>assertSettings({...s,credits:1},'lower',undefined,4));
 assert.throws(()=>assertSettings({...s,count:'x1'},'lower',undefined,4));
});
