import {UI_PRIORITY} from './ui_queue.js';
import {sameFlowProject} from './core.js';

export function mayRecoverSubmission(job,scene){
  if(job.manual_send||job.technical_retry_limit!==2||scene.status!=='submitted'||scene.result_asset_id)return false;
  const delivery=scene.recaptcha_delivery;
  if(!delivery)return false; // An uncertain normal UI click is never evidence for another submission.
  if(delivery&&!(delivery.state==='rejected'&&delivery.definitive_rejection===true))return false;
  return (scene.technical_retry_intents?.length||0)+(scene.audio_retry_intents?.length||0)<2;
}

// Refresh removes only the local aborted composer placeholder. Permanent IDs,
// absence of server errors/pending work and the saved budget decide recovery.
export async function recoverSubmission({flow,host,job,scene,withUi,seconds}){
  if(!mayRecoverSubmission(job,scene))return false;
  return withUi(async()=>{
    await flow.backToProject();
    if(job.recaptcha_harvest){
      const project=await flow.dom('project');
      if(!sameFlowProject(project.url,job.project))throw Error('Projeto mudou antes da recuperacao; nenhum novo envio.');
      await flow.send('reload');
      await flow.wait(async()=>sameFlowProject((await flow.dom('project')).url,job.project),30000,'reconciliar o mesmo projeto');
      await flow.ensureAllMedia();
    }
    const ids=(await flow.inventory()).map(v=>v.assetId),baseline=scene.baseline_ids||[];
    const visible=await flow.dom('generationState');
    // A visible Flow failure is positive evidence that the previous attempt ended.
    // It is safe to reserve a technical retry when nothing is pending and no new
    // asset appeared. The native host still enforces the shared two-retry limit.
    const discovered=ids.filter(id=>!baseline.includes(id));
    // Flow sometimes exposes older project assets only after a reload. When a
    // visible generation failure is present, those newly discovered IDs are a
    // stale baseline expansion rather than a successful result for this scene.
    if(visible.pending||discovered.length&&visible.errors<=0)return false;
    const observed=await flow.configure('lower',1,seconds);
    const account=await flow.verifyAccount(job.account_email,job.project_creation?.home);
    await host.ask('retry_missing',{folder:job.folder,scene:scene.number,evidence:{asset_ids:ids,pending:visible.pending,errors:visible.errors},observation:{...account,model_key:'lower',outputs:1,credits:observed.credits}});
    return true;
  },UI_PRIORITY.scene+scene.number);
}
