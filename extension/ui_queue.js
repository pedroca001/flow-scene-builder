// Serialize whole transactions. Polls must never monopolize project startup.
export const UI_PRIORITY=Object.freeze({download:100,result:90,scene:40,project:20,poll:0});
export function createUiQueue({now=()=>performance.now(),maxWaitMs=60000}={}){
  let busy=false,sequence=0;const waiting=[];
  async function drain(){
    if(busy)return;busy=true;
    try{
      while(waiting.length){
        const urgent=waiting.filter(task=>task.priority>=UI_PRIORITY.result);
        const oldest=waiting.reduce((a,b)=>a.sequence<b.sequence?a:b);
        // Ready results/downloads free slots and cannot wait behind a whole
        // aged wave of scene preparation. Age still protects ordinary tasks.
        waiting.sort(urgent.length
          ?(a,b)=>(b.priority>=UI_PRIORITY.result)-(a.priority>=UI_PRIORITY.result)||b.priority-a.priority||a.sequence-b.sequence
          :now()-oldest.queuedAt>=maxWaitMs
            ?(a,b)=>a.sequence-b.sequence
            :(a,b)=>b.priority-a.priority||a.sequence-b.sequence);
        const task=waiting.shift();
        try{task.resolve(await task.action());}catch(error){task.reject(error);}
      }
    }finally{busy=false;}
  }
  return function(action,priority=0){
    const result=new Promise((resolve,reject)=>waiting.push({action,priority,queuedAt:now(),sequence:sequence++,resolve,reject}));
    queueMicrotask(()=>void drain());return result;
  };
}
export const withUi=createUiQueue();
