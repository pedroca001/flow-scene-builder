import test from 'node:test';
import assert from 'node:assert/strict';
import {withUi} from '../extension/ui_queue.js';
test('focus-sensitive transactions cannot interleave across projects and failures release the queue',async()=>{
  let release;const gate=new Promise(r=>release=r);const order=[];
  const first=withUi(async()=>{order.push('a focus');await gate;order.push('a save');throw Error('a failed');});
  const second=withUi(async()=>{order.push('b focus');order.push('b save');});
  await new Promise(r=>setImmediate(r));assert.deepEqual(order,['a focus']);release();
  await assert.rejects(first,/a failed/);await second;
  assert.deepEqual(order,['a focus','a save','b focus','b save']);
});
