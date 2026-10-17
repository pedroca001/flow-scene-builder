import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowClient} from '../extension/flow_client.js';
import {dispatch} from '../extension/transport.js';

test('capture mode is rejected before any DOM read or browser action',async()=>{
  const calls=[];
  const client=new FlowClient(1,async action=>calls.push(action));
  await assert.rejects(client.submit({harvest:true}),/controles normais/);
  assert.deepEqual(calls,[]);
});

test('obsolete capture and replay commands cannot reach browser transport',async()=>{
  for(const type of ['harvestGeneration','replayGeneration']){
    await assert.rejects(dispatch({type,tabId:1}),/desativados/);
  }
});

test('normal submission clicks once and preserves uncertain outcome without replay',async()=>{
  const calls=[];let reads=0;
  const client=new FlowClient(1,async action=>{
    calls.push(action.type);
    if(action.type==='dom'&&action.op==='blockers')return null;
    if(action.type==='dom'&&action.op==='generationState')return {pending:reads++?1:0,videos:0,errors:0};
    return true;
  });
  await client.submit();
  assert.equal(calls.filter(x=>x==='clickControl').length,1);
  assert.ok(!calls.some(x=>/harvest|replay/i.test(x)));
});
