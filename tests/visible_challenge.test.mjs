import test from 'node:test';
import assert from 'node:assert/strict';
import {flowDom} from '../extension/flow_dom.js';
test('visible challenge stops recovery but hidden bootstrap iframe does not',async()=>{
 const oldDocument=globalThis.document,oldStyle=globalThis.getComputedStyle;
 let width=300;const frame={src:'https://www.google.com/recaptcha/enterprise/bframe',getClientRects:()=>[{}],getBoundingClientRect:()=>({width,height:500})};
 globalThis.document={querySelectorAll:selector=>selector==='iframe'?[frame]:[]};
 globalThis.getComputedStyle=()=>({visibility:'visible'});
 try{assert.match(await flowDom('blockers'),/reCAPTCHA/);width=0;assert.equal(await flowDom('blockers'),null);}
 finally{globalThis.document=oldDocument;globalThis.getComputedStyle=oldStyle;}
});
