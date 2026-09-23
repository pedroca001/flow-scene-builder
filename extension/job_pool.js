// One coordinator, independent jobs. A failing job never cancels its neighbours.
export class JobPool {
  constructor({limit=10,claim,run,onError=()=>{},onIdle=()=>{}}){Object.assign(this,{limit,claim,run,onError,onIdle});this.active=new Map();this.filling=false;this.rerun=false;}
  async fill(){
    if(this.filling){this.rerun=true;return;}
    this.filling=true;
    try{
      do{
        this.rerun=false;
        while(this.active.size<this.limit){
          const job=await this.claim([...this.active.keys()]);
          if(!job)break;
          if(this.active.has(job.folder))throw Error('Fila devolveu trabalho ja ativo.');
          const task=Promise.resolve().then(()=>this.run(job)).catch(error=>this.onError(error,job)).finally(()=>{this.active.delete(job.folder);void this.fill().catch(error=>this.onError(error,{folder:''}));});
          this.active.set(job.folder,task);
        }
      }while(this.rerun);
      if(!this.active.size)await this.onIdle();
    }finally{this.filling=false;}
  }
}
