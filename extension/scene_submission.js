import { UI_PRIORITY } from './ui_queue.js';

// One worker owns each tab. Only read-only upload waiting leaves the UI lease.
export async function submitScene({flow,host,job,scene,withUi,parallelIo=false}){
  if(job.recaptcha_harvest)throw Error('Modo de captura desativado; retomar pela interface normal.');
  const outputs=scene.outputs_per_prompt||1;
  const seconds=scene.duration_seconds||job.duration_seconds||8;
  const model=job.model_key||'lower';
  const name=scene.existing_image_name||scene.browser_frame_path.split(/[\\/]/).pop();
  const manual=job.manual_send&&!job.recaptcha_harvest;
  const progress=phase=>host.ask('progress',{folder:job.folder,phase:`Cena ${scene.number}: ${phase}`});
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const awaitSubmissionSlot=async()=>{
    if(!(Number(job.min_submission_interval_seconds)>0))return;
    while(true){
      const gate=await host.ask('submission_gate',{folder:job.folder,scene:scene.number});
      if(gate.ready)return;
      const delay=Math.max(250,Math.min(Number(gate.wait_ms)||1000,30000));
      await progress(`aguardando intervalo minimo (${Math.ceil((Number(gate.wait_ms)||0)/1000)}s)`);
      await wait(delay);
    }
  };
  let baseline,failures;
  const prepare=async()=>{
    await flow.verifyAccount(job.account_email,job.project_creation?.home);
    await progress('inventario');baseline=[...new Set([...(scene.known_project_asset_ids||[]),...(await flow.inventory()).map(v=>v.assetId)])];
    failures=(await flow.dom('audioFailures')).map(f=>f.key);
    await progress('configuracao');await flow.verifyAccount(job.account_email,job.project_creation?.home);
    await flow.configure(model,outputs,seconds);
    await progress('upload');
    const path=scene.existing_image_name?null:scene.browser_frame_path;
    if(parallelIo)await flow.beginFrameUpload(null,name,path);
    else await flow.uploadFrame(null,name,path);
  };
  const send=async()=>{
    if(parallelIo){
      await progress('anexando frame');await flow.finishFrameUpload(name);
      // Concurrent workers can change the shared settings during upload.
      // A serial job keeps its first configuration and still verifies the
      // visible model, cost and dimensions immediately before submission.
      await flow.verifyAccount(job.account_email,job.project_creation?.home);
      if(job.max_parallel!==1)await flow.configure(model,outputs,seconds);
    }
    if(!manual){await progress('prompt');await flow.prompt(scene.prompt);}
    await progress('controle de cadencia');await awaitSubmissionSlot();
    const observed=await flow.verify(model,outputs,seconds);
    const account=await flow.verifyAccount(job.account_email,job.project_creation?.home);
    await host.ask('submitted',{folder:job.folder,scene:scene.number,baseline,failures,
      observation:{...account,model_key:model,credits:observed.credits,outputs}});
    if(manual){
      await host.ask('manual_ready',{folder:job.folder,scene:scene.number,tab_id:flow.tabId});
    }else {
      try{await flow.submit();}
      catch(error){
        if(error.beforeInput===true){
          await host.ask('submission_not_sent',{folder:job.folder,scene:scene.number,before_input:true,error:String(error.message||error)});
        }
        throw error;
      }
      if(Number(job.min_submission_interval_seconds)>0){
        await host.ask('submission_observed',{folder:job.folder,scene:scene.number});
      }
    }
  };
  if(parallelIo){
    await withUi(prepare,UI_PRIORITY.scene+scene.number);
    await progress('aguardando upload');await flow.waitFrameUpload(name);
    await withUi(send,UI_PRIORITY.scene+scene.number);
  }else{
    // Preserve the existing single transaction on macOS.
    await withUi(async()=>{await prepare();await send();},UI_PRIORITY.scene+scene.number);
  }
  if(manual){
    // The operator pastes the canonical prompt and clicks Send through CUA.
    // Never own the UI lease while waiting, and never click or retry here.
    await flow.wait(async()=>{
      const visible=await flow.dom('generationState');
      return visible.pending>0||visible.errors>failures.length||(await flow.videos()).length>baseline.length;
    },600000,'envio manual pelo Computer Use; nenhum clique automatico');
    await host.ask('manual_sent',{folder:job.folder,scene:scene.number});
  }
  return {baseline,failures};
}
