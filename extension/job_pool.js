// One coordinator, independent jobs. A failing job never cancels its neighbours.
export class JobPool {
  constructor({limit=10,claim,run,onError=()=>{},onIdle=()=>{},retryDelayMs=2000,idleRefillAttempts=0,setTimer=setTimeout,clearTimer=clearTimeout}){Object.assign(this,{limit,claim,run,onError,onIdle,retryDelayMs,idleRefillAttempts,setTimer,clearTimer});this.active=new Map();this.filling=false;this.rerun=false;this.retryTimer=null;this.idleRefillsRemaining=0;}
  async fill(){
    if(this.filling){this.rerun=true;return;}
    if(this.retryTimer!==null){this.clearTimer(this.retryTimer);this.retryTimer=null;}
    this.filling=true;
    try{
      do{
        this.rerun=false;
        while(this.active.size<this.limit){
          const job=await this.claim([...this.active.keys()]);
          if(!job)break;
          if(this.active.has(job.folder))throw Error('Fila devolveu trabalho ja ativo.');
          this.idleRefillsRemaining=0;
          const task=Promise.resolve().then(()=>this.run(job)).catch(error=>this.onError(error,job)).finally(()=>{this.active.delete(job.folder);this.idleRefillsRemaining=this.idleRefillAttempts;void this.fill().catch(error=>this.onError(error,{folder:''}));});
          this.active.set(job.folder,task);
        }
      }while(this.rerun);
      if(!this.active.size){
        // The serial controller admits the next job just after completion.
        // Give it a bounded handoff window instead of waiting for an alarm.
        if(this.idleRefillsRemaining>0){
          this.idleRefillsRemaining--;
          this.retryTimer=this.setTimer(()=>{this.retryTimer=null;void this.fill().catch(error=>this.onError(error,{folder:''}));},this.retryDelayMs);
        }else await this.onIdle();
      }
    }finally{
      this.filling=false;
      // Admission can happen after the completion-triggered claim found no job.
      // Keep checking vacancies while the other jobs run, without waiting for
      // the next Chrome alarm or for a second video to finish.
      if(this.active.size&&this.active.size<this.limit&&this.retryTimer===null){
        this.retryTimer=this.setTimer(()=>{this.retryTimer=null;void this.fill().catch(error=>this.onError(error,{folder:''}));},this.retryDelayMs);
      }
    }
  }
}
