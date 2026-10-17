import test from 'node:test';
import assert from 'node:assert/strict';
import {reloadProject} from '../extension/reload_project.js';
function fixture({newDocument=true,ready=true}={}){
 let reloaded=false;const listeners=new Set();let submissions=0;
 const api={tabs:{reload:async()=>{reloaded=true;},onUpdated:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)}},
 scripting:{executeScript:async({args})=>{assert.equal(args[0],'projectReady');return [{documentId:reloaded&&newDocument?'new':'old',result:{ready:reloaded&&ready}}];}}};
 return {api,listeners,get submissions(){return submissions;}};
}
test('a fresh usable Flow document completes reload without waiting for third-party resources',async()=>{
 const f=fixture();assert.equal(await reloadProject(f.api,7,{pollMs:1,timeoutMs:100}),true);assert.equal(f.listeners.size,0);
});
for(const option of [{newDocument:false},{ready:false}])test('reload refuses stale or incomplete UI '+JSON.stringify(option),async()=>{
 const f=fixture(option);await assert.rejects(reloadProject(f.api,7,{pollMs:1,timeoutMs:15}),/nao concluiu/);assert.equal(f.listeners.size,0);
});
test('a rejected reload cleans listeners without accepting the old page',async()=>{
 const f=fixture();f.api.tabs.reload=async()=>{throw Error('Reload denied');};
 await assert.rejects(reloadProject(f.api,7,{pollMs:1,timeoutMs:100}),/Reload denied/);assert.equal(f.listeners.size,0);
});
