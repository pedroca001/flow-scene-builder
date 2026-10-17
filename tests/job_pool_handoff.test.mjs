import test from 'node:test';
import assert from 'node:assert/strict';
import {JobPool} from '../extension/job_pool.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(attempts){
  const jobs=[{folder:'first'}],timers=new Map(),runs=[],releases=[];let id=0,idle=0;
  const pool=new JobPool({limit:1,idleRefillAttempts:attempts,claim:async()=>jobs.shift(),
    run:job=>{runs.push(job.folder);return new Promise(r=>releases.push(r));},onIdle:()=>{idle++;},
    setTimer:fn=>{timers.set(++id,fn);return id;},clearTimer:key=>timers.delete(key)});
  return {pool,jobs,timers,runs,releases,get idle(){return idle;},async timer(){const [key,fn]=timers.entries().next().value;timers.delete(key);fn();await flush();}};
}
test('serial completion picks up controller handoff without next Chrome alarm',async()=>{
  const f=fixture(3);await f.pool.fill();await flush();f.releases.shift()();await flush();
  assert.equal(f.idle,0);assert.equal(f.timers.size,1);
  f.jobs.push({folder:'second'});await f.timer();
  assert.deepEqual(f.runs,['first','second']);assert.equal(f.pool.active.size,1);assert.equal(f.timers.size,0);
});
test('handoff polling stops after bounded attempts when batch is finished',async()=>{
  const f=fixture(2);await f.pool.fill();await flush();f.releases.shift()();await flush();
  await f.timer();await f.timer();
  assert.equal(f.idle,1);assert.equal(f.timers.size,0);assert.equal(f.pool.active.size,0);
});
test('empty initial queue does not start fast idle polling',async()=>{
  const f=fixture(3);f.jobs.length=0;await f.pool.fill();
  assert.equal(f.idle,1);assert.equal(f.timers.size,0);
});
