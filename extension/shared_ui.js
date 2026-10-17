// Native queues are independent; actual UI input shares a short cross-profile
// lease so the two service workers cannot steal focus from each other.
export function sharedUi(host,folder,queue,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
  return (action,priority)=>queue(async()=>{
    let lease;
    while(true){
      lease=await host.ask('ui_acquire',{folder});
      if(lease.acquired)break;
      await wait(Math.max(100,Math.min(1000,lease.wait_ms||250)));
    }
    try{return await action();}
    finally{await host.ask('ui_release',{folder,token:lease.token});}
  },priority);
}
