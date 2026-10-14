import { assertSettings, sameFlowProject } from './core.js';
import { UI_PRIORITY } from './ui_queue.js';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export class FlowClient {
  constructor(tabId,transport=null,environment={}){this.tabId=tabId;this.transport=transport;this.environment=environment;this.assetIds=new Map();this.withUi=action=>action();}
  get platform(){return this.environment.platform??(globalThis.navigator?.platform||globalThis.navigator?.userAgent||'');}
  async send(type,args={}){
    if(this.transport)return this.transport({type,tabId:this.tabId,...args});
    const r=await chrome.runtime.sendMessage({type,tabId:this.tabId,...args});
    if(!r?.ok)throw Error(r?.error||'Sem resposta da extensao.');return r.result;
  }
  async dom(op,args={}){try{return await this.send('dom',{op,args});}catch(e){const error=Error(`${op}${args.names?` (${args.names.join('/')})`:''}: ${e.message}`,{cause:e});if(e.beforeInput)error.beforeInput=true;throw error;}}
  async clickPoint(p,clickCount=1){if(p.disabled)throw Error('Controle do Flow desabilitado.');await this.send('click',{...p,clickCount});}
  async click(names){await this.dom('clickControl',{names});}
  async wait(fn,timeout=30000,why='resposta da interface'){const until=Date.now()+timeout;let last;while(Date.now()<until){try{const r=await fn();if(r)return r;}catch(e){last=e;}await sleep(600);}throw last||Error(`Tempo esgotado: ${why}.`);}
  async checkBlockers(){const b=await this.dom('blockers');if(b){const error=Error(`Flow precisa de atencao: ${b}`);if(/quota|hit your limits|insufficient credits|not enough credits|créditos? insuficientes|limite.*gera|too many|muitas solicita|rate limit/i.test(b))error.kind='account_limit';throw error;}}
  async verifyAccount(expected,expectedHome=null){
    if(!expected)throw Error('Email da conta nao foi vinculado. Nenhuma geracao enviada.');
    const account=await this.dom('account');
    if(account.email?.toLowerCase()!==expected.toLowerCase())throw Error('Conta visivel difere do email autorizado.');
    if(expectedHome&&account.home!==expectedHome)throw Error('Home visivel difere da sessao confirmada.');
    return account;
  }
  async createProject(){
    const p=await this.dom('project');
    if(p.isProject||!/^https:\/\/flow\.google\.com\/(?:u\/\d+\/?)?$/.test(p.url))throw Error('Novo projeto exige pagina inicial da conta configurada.');
    await this.wait(()=>this.dom('exists',{names:['New project','Novo projeto']}));
    await this.click(['New project','Novo projeto']);
    return this.wait(async()=>{const next=await this.dom('project');return next.isProject?next.url:null;},60000,'criacao do projeto');
  }
  async renameProject(title){
    if(!title)throw Error('Nome de projeto vazio.');
    await this.wait(()=>this.dom('projectTitle'));
    if(/win/i.test(this.platform) && await this.dom('projectTitle')===title)return title;
    // Flow displays a DOM-set value but only persists a trusted keyboard edit.
    // Use CDP's native input path, as used for prompt text, before committing.
    await this.send('setTitle',{title,mac:this.platform.toLowerCase().includes('mac')});
    await this.wait(async()=>await this.dom('projectTitle')===title,15000,'nome do projeto');
    await sleep(1000);
    await this.send('reload');
    await this.wait(async()=>await this.dom('projectTitle')===title,30000,'nome salvo apos recarregar');
    return title;
  }
  async ensureProject(title){
    const p=await this.dom('project');
    if(!p.isProject){await this.wait(()=>this.dom('exists',{names:['New project','Novo projeto']}));await this.click(['New project','Novo projeto']);await this.wait(async()=> (await this.dom('project')).isProject);}
    await this.wait(()=>this.dom('exists',{names:['Settings trigger','Configurações']}));
    if(!p.isProject)await this.dom('setTitle',{title});return (await this.dom('project')).url;
  }
  async openSettings(){
    if(!await this.dom('exists',{names:['Select model family','Selecionar modelo']})){
      await this.send('key',{key:'Escape'});
      await this.click(['Settings trigger','Configurações']);
    }
    await this.wait(()=>this.dom('exists',{names:['Select model family','Selecionar modelo']}));
  }
  async closeSettings(){if(await this.dom('exists',{names:['Select model family','Selecionar modelo']})){
    await this.click(['Settings trigger','Configurações']);
    await this.wait(async()=>!await this.dom('exists',{names:['Select model family','Selecionar modelo']}));
  }}
  async configure(model,outputs=1,seconds=8){
    await this.checkBlockers();await this.openSettings();
    for(const names of [['Video','Vídeo'],['Frames','Quadros'],['9:16'],[`${seconds}s`],[`x${outputs}`]]){
      const p=await this.dom('radio',{names});if(!p.selected){await this.click(names);await sleep(300);}
    }
    const current=await this.dom('settings');
    const lower=/lower\s*priority|baixa\s*prioridade|prioridade\s*(mais\s*)?baixa/i.test(current.model);
    if(!/veo\s*3[.,]1.*lite/i.test(current.model)||lower!==(model==='lower')){
      await this.click(['Select model family','Selecionar modelo']);await sleep(250);
      await this.clickPoint(await this.dom('modelOption',{lower:model==='lower'}));await sleep(400);
    }
    const s=await this.dom('settings');assertSettings(s,model,undefined,outputs,seconds);await this.closeSettings();return s;
  }
  async verify(model,outputs=1,seconds=8){await this.openSettings();const s=await this.dom('settings');assertSettings(s,model,undefined,outputs,seconds);await this.closeSettings();return s;}
  async uploadFrame(blob,name,localPath=null){
    await this.beginFrameUpload(blob,name,localPath);
    await this.waitFrameUpload(name);
    return this.finishFrameUpload(name);
  }
  async beginFrameUpload(blob,name,localPath=null){
    await this.ensureAllMedia();
    await this.closeSettings();
    if(await this.dom('exists',{names:['Clear prompt','Limpar prompt']}))await this.click(['Clear prompt','Limpar prompt']);
    for(let i=0;i<3;i++) {const pts=await this.dom('removeFrames');if(!pts.length)break;await this.clickPoint(pts[0]);await sleep(200);}
    await this.wait(()=>this.dom('exists',{names:['Start','Início','Inicio']}),10000,'limpar compositor e encontrar Start');
    if(!await this.dom('assetExists',{name})){
      if(localPath){
        await this.send('key',{key:'Escape'});
        await this.send('uploadDrop',{path:localPath});
      }else {if(!blob)throw Error('Imagem existente nao encontrada pelo nome exato; nenhum upload substituto.');const {asDataUrl}=await import('./store.js');await this.dom('dropImage',{dataUrl:await asDataUrl(blob),name});}
    }
  }
  async waitFrameUpload(name){
    // Read-only upload wait is per tab. It does not need the global focus lease.
    await this.wait(()=>this.dom('assetExists',{name}),120000,`asset de upload ${name}`);
  }
  async finishFrameUpload(name){
    // Current Flow can attach a freshly dropped upload automatically. Accept
    // only the uniquely named asset whose displayed image matches the chip.
    if(await this.dom('frameMatches',{name}))return;
    const confirmAuto=async()=>{
      const state=await this.dom('frameState');
      if(!state.hasImage||state.empty)return false;
      await this.wait(()=>this.dom('frameSource'),120000,'carregar frame automatico');
      await this.confirmFrame(name);
      return true;
    };
    if(await confirmAuto())return;
    try{await this.click(['Start','Início','Inicio']);}
    catch(error){if(await confirmAuto())return;throw error;}
    await this.wait(()=>this.dom('exists',{names:['Close','Fechar']}),30000,'abrir selecao do frame');
    await this.dom('chooseAsset',{name});
    // Confirm atomically only when the preview is ready, or accept the automatic-close path.
    try {
      await this.wait(()=>this.dom('acceptFrame',{name}),120000,'carregar previa e anexar frame');
    } catch (error) {
      const state=await this.dom('frameState');
      throw Error(`${error.message} Frame: ${JSON.stringify(state)}`);
    }
    // A selected start frame replaces the Start placeholder.
    await this.wait(async()=>!await this.dom('exists',{names:['Start','Início','Inicio']}));
    await this.wait(()=>this.dom('frameSource'),30000,'carregar frame anexado');
    await this.confirmFrame(name);
  }
  async confirmFrame(name){
    if(await this.dom('frameMatches',{name}))return true;
    // Flow's grid thumbnail can use /asb/ while the chip uses flow-content.
    // Open the uniquely named image's read-only preview and compare that
    // loaded source with the chip, without using internal state or APIs.
    const source=await this.dom('frameSource');
    if(!source)throw Error('Frame anexado ainda nao carregou.');
    let expected;
    try{
      await this.clickPoint(await this.dom('selectAsset',{name}));
      // Current Flow selects images on a single click, opens their read-only
      // preview on a double click. Keep single-click legacy layouts working.
      expected=await this.dom('imageAssetSource',{name});
      if(!expected){
        await sleep(500);
        if(!/\/edit\/[a-f0-9-]{36}$/i.test((await this.dom('project')).url)){
          if(!await this.dom('assetExists',{name}))throw Error('Asset nomeado deixou o grid; preservar frame.');
          await this.clickPoint(await this.dom('selectAsset',{name}),2);
        }
      }
      if(!expected&&/win/i.test(this.platform)){
        try{expected=await this.wait(()=>this.dom('imageAssetSource',{name}),2000,'abrir preview nativa da imagem');}
        catch(error){
          const project=await this.dom('project');
          if(/\/edit\/[a-f0-9-]{36}$/i.test(project.url))throw error;
          await this.dom('openNamedImagePreview',{name,source});
        }
      }
      expected??=await this.wait(()=>this.dom('imageAssetSource',{name}),120000,'preview do asset de frame nomeado');
    }finally{await this.backToProject();}
    if(expected!==source||await this.dom('frameSource')!==source)throw Error('Frame anexado difere do asset nomeado; nenhum envio.');
    return true;
  }
  async prompt(text){
    await this.dom('focusEditor');await this.send('text',{text,mac:this.platform.toLowerCase().includes('mac')});
    const actual=await this.dom('promptText');
    if(actual!==text.replace(/\s+/g,' ').trim())throw Error('O prompt no Flow ficou diferente do preset.');
  }
  async prepare(blob,name,prompt,model,localPath=null){await this.configure(model);await this.uploadFrame(blob,name,localPath);await this.prompt(prompt);return this.verify(model);}
  async submit({harvest=false,outputs=1,onHarvested=null,onDelivery=null}={}){
    await this.checkBlockers();
    if(harvest){
      if(typeof onHarvested!=='function')throw Error('Colheita exige recibo persistente antes do envio.');
      const before=await this.dom('generationState');
      if(before.pending)throw Error('Projeto ja tem geracao pendente; nenhum novo envio.');
      const previous=(await this.dom('audioFailures')).map(f=>f.key);
      const receipt=await this.send('harvestGeneration');
      try{
        if(receipt.requestAborted!==true)throw Error('Transporte nao confirmou o abort; nenhum replay.');
        const state=await this.dom('generationState');
        const rows=await this.dom('audioFailures');
        if(state.videos!==before.videos||rows.length<previous.length||rows.length>previous.length+outputs)throw Error('Inventario mudou durante colheita; nenhum replay. '+JSON.stringify({before,after:state,failuresBefore:previous.length,failuresAfter:rows.length}));
        const added=[...rows];
        for(const key of previous){const index=added.findIndex(f=>f.key===key);if(index<0)throw Error('Inventario mudou durante colheita.');added.splice(index,1);}
        if(added.some(f=>f.kind))throw Error('Conta bloqueada durante colheita; nenhum replay.');
        // Current Flow may leave a pending placeholder or no failure tile when
        // Fetch aborts locally. The CDP abort acknowledgement is authoritative.
        // A reload after replay removes transient app placeholders.
        const failures=rows.map(f=>f.key);
        await onHarvested(failures,receipt.rpc,{requestAborted:true});
        let delivery;
        try{delivery=await this.send('replayGeneration',{handle:receipt.handle});}
        catch(error){
          if(onDelivery)await onDelivery({state:error.definitiveRejection===true?'rejected':'uncertain',reason:error.rpcError||'delivery_uncertain',http_status:error.httpStatus||0,definitive_rejection:error.definitiveRejection===true,capture_to_send_ms:error.captureToSendMs});
          throw error;
        }
        if(onDelivery)await onDelivery({state:'accepted',http_status:200,definitive_rejection:false,capture_to_send_ms:delivery?.captureToSendMs});
        // The aborted app call has no result to poll. Refresh the same project
        // so the existing UUID/inventory pipeline sees the accepted generation.
        await this.send('reload');
        await this.wait(async()=>(await this.dom('project')).isProject,30000,'recuperar projeto apos envio');
        return;
      }finally{await this.send('discardHarvest',{handle:receipt.handle}).catch(()=>{});}
    }
    const before=await this.dom('generationState');
    const clickEvidence=await this.send('clickControl',{names:['Start generation','Iniciar geração','Gerar']});
    try{
      await this.wait(async()=>{const after=await this.dom('generationState');return ['pending','videos','errors'].some(k=>after[k]>before[k]);},20000,'confirmar aceite da geracao no Flow; envio preservado para diagnostico');
    }catch(error){throw Error(error.message+(clickEvidence?'; evidencia do clique: '+JSON.stringify(clickEvidence):''));}
  }
  async videos(){return this.dom('cards');}
  async readyInventory(baseline,resultAssetId=null){
    // This is a read-only hint in this tab. Permanent IDs still decide which
    // result belongs to the saved submission, inside the serialized inventory.
    const cards=await this.videos();
    const ready=cards.some(card=>{
      const id=this.assetIds.get(card.key);
      return !id||(resultAssetId?id===resultAssetId:!baseline.includes(id));
    });
    return ready?this.withUi(()=>this.inventory(),UI_PRIORITY.result):[];
  }
  async identifyCard(card){
    if(this.assetIds.has(card.key))return {...card,assetId:this.assetIds.get(card.key)};
    await this.dom('openCard',{key:card.key});
    const assetId=await this.wait(()=>this.dom('assetId'),15000,'identificador permanente do asset');
    this.assetIds.set(card.key,assetId);
    await this.backToProject();
    await this.wait(async()=>(await this.videos()).length>0,15000,'carregar cartoes do projeto');
    return {...card,assetId};
  }
  async inventory(){
    const result=new Map();const checked=new Set();
    // Re-read after every visit: Angular can replace the entire grid on navigation.
    for(let i=0;i<300;i++){
      const cards=await this.videos();const card=cards.find(c=>!checked.has(c.key));
      if(!card)return [...result.values()];
      checked.add(card.key);const identified=await this.identifyCard(card);result.set(identified.assetId,identified);
    }
    throw Error('Inventario de assets nao estabilizou. Nenhuma geracao enviada.');
  }
  async beginOriginalDownload(card){
    await this.dom('openCard',{key:card.key});
    const assetId=await this.wait(()=>this.dom('assetId'),15000,'abrir asset para download');
    if(assetId!==card.assetId)throw Error('Asset aberto difere do resultado esperado.');
    await this.wait(()=>this.dom('exists',{names:['Download media']}),15000,'menu de download do asset');
    await this.click(['Download media']);
    await this.wait(()=>this.dom('exists',{names:['720p']}),15000,'opcao original 720p');
    await this.dom('armDownload');await this.click(['720p']);
    await this.wait(()=>this.dom('downloadLink'),30000,'arquivo de download original do Flow');
  }
  async readOriginalDownload(){
    let offset=0;const parts=[];
    try{
    while(true){const r=await this.dom('originalChunk',{offset});const bytes=Uint8Array.from(atob(r.data),c=>c.charCodeAt(0));
      if(r.offset!==offset||!bytes.length)throw Error('Transferencia do original interrompida.');
      parts.push(bytes);offset+=bytes.length;if(offset>=r.size)break;}
    return new Blob(parts,{type:'video/mp4'});
    }finally{await this.dom('releaseDownload');}
  }
  async originalDownload(card){
    await this.beginOriginalDownload(card);
    return this.readOriginalDownload();
  }
  async concurrentOriginalDownload(card){
    await this.withUi(async()=>{
      await this.beginOriginalDownload(card);
      // The menu captured the original file in this document. Returning to
      // the grid is SPA navigation; other tabs may now use the focus lease.
      await this.backToProject();
    },UI_PRIORITY.download);
    return this.readOriginalDownload();
  }
  async ensureAllMedia(){await this.wait(()=>this.dom('allMedia'),15000,'selecionar All media');}
  async backToProject(){if(await this.dom('exists',{names:['Back button to go to previous page']})){await this.click(['Back button to go to previous page']);await this.wait(()=>this.dom('exists',{names:['Settings trigger']}));}await this.ensureAllMedia();}
  async refreshSubmittedProject(options,lastReload){
    if(!options?.refreshWhileWaiting||Date.now()-lastReload<(options.refreshIntervalMs??30000))return lastReload;
    // This job owns its tab and is only waiting for a saved submission.
    // Reload/DOM filtering do not acquire focus or wait behind other uploads.
    const project=await this.dom('project');
    if(!project.isProject||(options.project&&!sameFlowProject(project.url,options.project)))throw Error('Projeto mudou antes da consulta de resultados; nenhum envio.');
    await this.send('reload');
    await this.wait(async()=>{const current=await this.dom('project');return current.isProject&&(!options.project||sameFlowProject(current.url,options.project));},30000,'reconsultar resultados do mesmo projeto');
    await this.ensureAllMedia();
    return Date.now();
  }
  async waitCandidates(baseline,started,failureBaseline=[],outputs=4,refreshOptions=null){
    if(baseline.some(id=>!/^[a-f0-9-]{36}$/i.test(id)))throw Error('Baseline sem IDs permanentes.');
    let lastReload=Date.now();
    while(Date.now()<started+45*60*1000){
      const {observed,failures}=await this.withUi(async()=>({observed:await this.inventory(),failures:await this.dom('audioFailures')}));
      const cards=observed.filter(v=>!baseline.includes(v.assetId));
      const remaining=[...failureBaseline];const failed=[];
      for(const f of failures){
        const old=remaining.indexOf(f.key);if(old>=0)remaining.splice(old,1);else {if(f.kind==='account_limit'){const error=Error('Quota da conta confirmada em novo cartao de falha.');error.kind='account_limit';throw error;}failed.push(f.key);}
      }
      if(cards.length+failed.length>outputs)throw Error(`Mais de ${outputs} resultados novos: lote ambiguo.`);
      if(cards.length+failed.length===outputs){
        if(!cards.length)throw Error('Todas as alternativas falharam no Flow. Nenhum reenvio automatico.');
        return {cards:cards.sort((a,b)=>a.assetId.localeCompare(b.assetId)),failed};
      }
      // Known audio failures occupy a slot; x4 never retries generation for quality or audio.
      if(!failed.length)await this.checkBlockers();
      const reloaded=await this.refreshSubmittedProject(refreshOptions,lastReload);
      if(reloaded!==lastReload){lastReload=reloaded;continue;}
      await sleep(5000);
    }
    throw Error(`Lote x${outputs} incompleto. Retomar busca os mesmos resultados, sem novo envio.`);
  }
  async waitVideo(baseline,started,onStatus,stop,resultAssetId=null,failureOptions=null){
    if(!resultAssetId&&baseline.some(id=>!/^[a-f0-9-]{36}$/i.test(id)))throw Error('Baseline legado sem IDs permanentes. Recuperar a cena enviada por bind-result, sem reenviar.');
    const deadline=started+45*60*1000;
    let completeSince=null,refreshed=false,lastReload=Date.now();
    while(Date.now()<deadline){
      if(failureOptions&&!resultAssetId){
        const failures=[...await this.dom('audioFailures')];
        for(const key of failureOptions.baseline){const index=failures.findIndex(f=>f.key===key);if(index>=0)failures.splice(index,1);}
        const reason=failures.map(f=>String(f.reason||'').replace(/https?:\/\/\S+/gi,'[link]')).filter(Boolean).join(' | ').slice(0,600);
        if(failures.some(f=>f.kind==='account_limit')){const error=Error('Quota da conta confirmada em novo cartao de falha.'+(reason?' Mensagem do Flow: '+reason:''));error.kind='account_limit';throw error;}
        if(failures.length===1&&failures[0].retriable&&typeof failureOptions.onRetry==='function'){
          await this.withUi(async()=>{
            await this.verify('lower');await failureOptions.onRetry(failures[0].key);
            await this.dom('retryAudio',{key:failures[0].key});
            await this.wait(async()=>!(await this.dom('audioFailures')).some(f=>f.key===failures[0].key),15000,'aceite da repeticao de audio');
          },UI_PRIORITY.result);
          continue;
        }
        if(failures.length){const error=Error('Geracao falhou no Flow. Primeiro envio preservado, sem repetir audio ou prompt.'+(reason?' Mensagem do Flow: '+reason:''));error.kind='generation_failed';throw error;}
      }
      await this.checkBlockers();
      const observed=await this.readyInventory(baseline,resultAssetId);
      const found=observed.filter(v=>resultAssetId?v.assetId===resultAssetId:!baseline.includes(v.assetId));
      if(found.length>1)throw Error('Mais de um resultado novo. Pausei para evitar encadear a cena errada.');
      if(found.length===1)return found[0];
      const reloaded=await this.refreshSubmittedProject(failureOptions,lastReload);
      if(reloaded!==lastReload){lastReload=reloaded;continue;}
      if(!refreshed){
        if(await this.dom('pendingComplete')){
          completeSince??=Date.now();
          if(Date.now()-completeSince>=30000){
            await this.withUi(async()=>{await this.send('reload');await this.wait(async()=>(await this.dom('project')).isProject,30000,'recarregar resultado pendente');},UI_PRIORITY.result);
            refreshed=true;continue;
          }
        }else completeSince=null;
      }
      if(stop())throw Error('Pausado enquanto o Flow gera. Retomar vai buscar o resultado sem reenviar.');
      onStatus('Aguardando o Flow concluir a cena...');await sleep(5000);
    }
    throw Error('Tempo de espera excedido. Retomar consulta o resultado; nao gera novamente.');
  }
}
