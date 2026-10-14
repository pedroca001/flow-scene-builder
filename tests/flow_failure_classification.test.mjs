import test from 'node:test';
import assert from 'node:assert/strict';
import {flowDom} from '../extension/flow_dom.js';

async function failure(text){
  const priorDocument=globalThis.document;
  const priorStyle=globalThis.getComputedStyle;
  const retry={getAttribute:name=>name==='aria-label'?'Retry':null};
  const tile={innerText:text,getClientRects:()=>[{}],closest:()=>null,querySelectorAll:()=>[retry]};
  globalThis.document={querySelectorAll:selector=>selector==='flow-error-tile'?[tile]:[]};
  globalThis.getComputedStyle=()=>({visibility:'visible'});
  try{return (await flowDom('audioFailures'))[0];}
  finally{globalThis.document=priorDocument;globalThis.getComputedStyle=priorStyle;}
}

test('unusual activity cards freeze the account in both languages despite a Retry button',async()=>{
  for(const text of ['Notamos uma atividade incomum. Não foi cobrado.',
                     'We noticed unusual activity. You have not been charged.']){
    const result=await failure(text);
    assert.equal(result.kind,'account_limit');
    assert.equal(result.retriable,false);
    assert.equal(result.reason,text);
  }
});

test('ordinary no-charge audio failures retain the bounded retry contract',async()=>{
  const result=await failure('Falha ao gerar audio. Não foi cobrado.');
  assert.equal(result.kind,null);
  assert.equal(result.retriable,true);
});
