import test from 'node:test';
import assert from 'node:assert/strict';
import {JobPool} from '../extension/job_pool.js';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('ten simultaneous jobs, independent failure and refill, no duplicate ownership',async()=>{
  const queued=Array.from({length:12},(_,i)=>({folder:`job${i}`}));const gates=new Map();const errors=[];let count=0,peak=0;
  const pool=new JobPool({claim:async exclude=>{const job=queued.shift();assert.ok(!job||!exclude.includes(job.folder));return job;},run:job=>new Promise((resolve,reject)=>{count++;peak=Math.max(peak,count);gates.set(job.folder,{resolve:()=>{count--;resolve();},reject:()=>{count--;reject(Error('one job failed'));}});}),onError:(e,j)=>errors.push(j.folder)});
  await Promise.all([pool.fill(),pool.fill()]);await turn();
  assert.equal(pool.active.size,10);assert.equal(gates.size,10);
  gates.get('job2').reject();await turn();await turn();
  assert.deepEqual(errors,['job2']);assert.equal(pool.active.size,10);assert.ok(gates.has('job10'));
  gates.get('job0').resolve();await turn();await turn();assert.ok(gates.has('job11'));
  for(const name of ['job1','job3','job4','job5','job6','job7','job8','job9','job10','job11'])gates.get(name).resolve();
  await turn();await turn();assert.equal(pool.active.size,0);assert.equal(peak,10);
});
