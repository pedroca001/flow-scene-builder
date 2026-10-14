import test from 'node:test';
import assert from 'node:assert/strict';
import {stableControlPoint} from '../extension/trusted_control.js';
test('generation target follows changing layout before returning one click position',async()=>{
  const points=[{x:10,y:10},{x:100,y:300},{x:100,y:300}];let reads=0;
  assert.deepEqual(await stableControlPoint(async()=>{reads++;return points.shift();},async()=>{}),{x:100,y:300});
  assert.equal(reads,3);
  await assert.rejects(stableControlPoint(async()=>({x:1,y:1,disabled:true}),async()=>{}),/nenhum clique/);
  await assert.rejects(stableControlPoint(async()=>({x:++reads,y:1}),async()=>{}),/nao estabilizou/);
});
