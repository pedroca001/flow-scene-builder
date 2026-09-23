import { loadAsset, saveAsset, saveRun } from './store.js';
import { FlowClient } from './flow_client.js';
import { MediaEngine } from './media.js';
export class Runner {
  constructor(onUpdate){this.onUpdate=onUpdate;this.paused=false;this.media=new MediaEngine(s=>this.status(s));}
  status(message){this.onUpdate(this.run,message);}
  async persist(){await saveRun(this.run);this.onUpdate(this.run);}
  pause(){this.paused=true;this.status('Pausa solicitada. O progresso sera preservado.');}
  async start(run){
    this.run=run;this.paused=false;
    await navigator.locks.request('flow_scene_builder_runner',{ifAvailable:true},async lock=>{
      if(!lock)throw Error('Outra aba da extensao ja esta executando uma sequencia.');
      try {
        run.status='running';run.error='';await this.persist();
        if(run.scenes.some(s=>s.state!=='complete')){
          let tab;
          if(run.tabId)tab=await chrome.tabs.get(run.tabId).catch(()=>null);
          // Never operate a tab the user navigated away from the dedicated project.
          if(tab && run.projectUrl && tab.url?.split('?')[0]!==run.projectUrl.split('?')[0]) tab=null;
          if(!tab)tab=await chrome.tabs.create({url:run.projectUrl||'https://flow.google.com/',active:true});
          run.tabId=tab.id;await this.persist();this.flow=new FlowClient(tab.id);
          run.projectUrl=await this.flow.ensureProject(`FSB ${run.name} ${run.id.slice(0,6)}`);await this.persist();
          for(const scene of run.scenes){
            if(this.paused)break;if(scene.state==='complete')continue;
            const key=`${run.id}/scene_${scene.index+1}`;
            if(!await loadAsset(`${key}.mp4`)){
              if(scene.state==='ready'){
                this.status(`Cena ${scene.index+1}: preparando imagem e prompt...`);
                const source=scene.source.type==='original'?`${run.id}/original`:`${run.id}/scene_${scene.source.scene+1}.png`;
                const frame=await loadAsset(source);if(!frame)throw Error('Frame de origem nao encontrado.');
                const frameName=scene.source.type==='original'?`fsb_${run.id.slice(0,8)}_original.png`:`fsb_${run.id.slice(0,8)}_frame_${scene.index}.png`;
                scene.baseline=(await this.flow.inventory()).map(v=>v.assetId);
                const settings=await this.flow.prepare(frame,frameName,scene.prompt,run.preset.model);
                if(this.paused)break;
                scene.credits=settings.credits;scene.started=Date.now();scene.state='submitted';
                // Persist the intent BEFORE clicking. An uncertain click never causes an automatic duplicate.
                await this.persist();await this.flow.submit();
              }
              this.status(`Cena ${scene.index+1}: esperando geracao...`);
              const result=await this.flow.waitVideo(scene.baseline,Date.now(),s=>this.status(`Cena ${scene.index+1}: ${s}`),()=>this.paused);
              const blob=await this.flow.originalDownload(result);await saveAsset(`${key}.mp4`,blob);
              await this.flow.backToProject();scene.mediaKey=result.assetId;scene.state='downloaded';await this.persist();
            }
            if(scene.index>=1 && scene.index<run.scenes.length-1 && !await loadAsset(`${key}.png`)){
              await saveAsset(`${key}.png`,await this.media.lastFrame(await loadAsset(`${key}.mp4`)));
            }
            scene.state='complete';scene.finished=Date.now();await this.persist();
          }
        }
        if(run.scenes.every(s=>s.state==='complete') && !this.paused){
          run.status='rendering';await this.persist();
          const videos=await Promise.all(run.scenes.map(s=>loadAsset(`${run.id}/scene_${s.index+1}.mp4`)));
          if(videos.some(v=>!v))throw Error('Falta um video salvo para a montagem.');
          const result=await this.media.concat(videos);await saveAsset(`${run.id}/final.mp4`,result.blob);
          run.duration=result.duration;run.status='complete';run.finished=Date.now();await this.persist();this.status('MP4 pronto. Todas as cenas foram salvas.');
        }else {run.status='paused';await this.persist();}
      }catch(e){run.status='paused';run.error=String(e.message||e);await this.persist();this.status(run.error);}
      finally{this.media.dispose();}
    });
    return run;
  }
}
