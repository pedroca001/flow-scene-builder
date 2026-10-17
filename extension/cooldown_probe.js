import {sameFlowProject} from './core.js';
import {UI_PRIORITY} from './ui_queue.js';

// This phase never presses Generate or Retry. Native validation must succeed
// before runJob is allowed to enter the normal scene submission loop.
export async function cooldownProbe({flow,host,job,withUi}){
  return withUi(async()=>{
    await flow.checkBlockers();
    let project=await flow.dom('project');
    if(!sameFlowProject(project.url,job.project))throw Error('Projeto mudou na recuperacao; nenhum envio.');
    await flow.send('reload');
    await flow.wait(async()=>sameFlowProject((await flow.dom('project')).url,job.project),30000,'reconsultar o mesmo projeto');
    await flow.backToProject();await flow.checkBlockers();
    const account=await flow.verifyAccount(job.account_email,job.project_creation.home);
    const settings=await flow.configure('lower',1,job.duration_seconds||8);
    const ids=(await flow.inventory()).map(v=>v.assetId);
    const generation=await flow.dom('generationState');
    const blockers=await flow.dom('blockers');project=await flow.dom('project');
    return host.ask('cooldown_ready',{folder:job.folder,
      observation:{...account,model_key:'lower',outputs:1,credits:settings.credits},
      evidence:{asset_ids:ids,pending:generation.pending,errors:generation.errors,blockers,project:project.url,checked_at:Date.now()/1000}});
  },UI_PRIORITY.project);
}
