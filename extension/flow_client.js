import { assertSettings } from './core.js';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export class FlowClient {
  constructor(tabId,transport=null){this.tabId=tabId;this.transport=transport;this.assetIds=new Map();this.withUi=action=>action();}
  async send(type,args={}){
    if(this.transport)return this.transport({type,tabId:this.tabId,...args});
    const r=await chrome.runtime.sendMessage({type,tabId:this.tabId,...args});
    if(!r?.ok)throw Error(r?.error||'Sem resposta da extensao.');return r.result;
  }
  async dom(op,args={}){try{return await this.send('dom',{op,args});}catch(e){throw Error(`${op}${args.names?` (${args.names.join('/')})`:''}: ${e.message}`);}}
  async clickPoint(p){if(p.disabled)throw Error('Controle do Flow desabilitado.');await this.send('click',p);}
  async click(names){await this.dom('clickControl',{names});}
  async wait(fn,timeout=30000,why='resposta da interface'){const until=Date.now()+timeout;let last;while(Date.now()<until){try{const r=await fn();if(r)return r;}catch(e){last=e;}await sleep(600);}throw last||Error(`Tempo esgotado: ${why}.`);}
  async checkBlockers(){const b=await this.dom('blockers');if(b)throw Error(`Flow precisa de atencao: ${b}`);}
  async createProject(){
    const p=await this.dom('project');
    if(p.isProject||!/^https:\/\/flow\.google\.com\/u\/\d+\/?$/.test(p.url))throw Error('Novo projeto exige pagina inicial da conta configurada.');
    await this.wait(()=>this.dom('exists',{names:['New project','Novo projeto']}));
    await this.click(['New project','Novo projeto']);
    return this.wait(async()=>{const next=await this.dom('project');return next.isProject?next.url:null;},60000,'criacao do projeto');
  }
  async renameProject(title){
    if(!title)throw Error('Nome de projeto vazio.');
    await this.wait(()=>this.dom('projectTitle'));
    // Flow displays a DOM-set value but only persists a trusted keyboard edit.
    // Use CDP's native input path, as used for prompt text, before committing.
    await this.send('setTitle',{title,mac:(navigator.platform||navigator.userAgent).toLowerCase().includes('mac')});
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
  async configure(model,outputs=1){
    await this.checkBlockers();await this.openSettings();
    for(const names of [['Video','Vídeo'],['Frames','Quadros'],['9:16'],['8s'],[`x${outputs}`]]){
      const p=await this.dom('radio',{names});if(!p.selected){await this.click(names);await sleep(300);}
    }
    const current=await this.dom('settings');
    const lower=/lower\s*priority|baixa\s*prioridade|prioridade\s*(mais\s*)?baixa/i.test(current.model);
    if(!/veo\s*3[.,]1.*lite/i.test(current.model)||lower!==(model==='lower')){
      await this.click(['Select model family','Selecionar modelo']);await sleep(250);
      await this.clickPoint(await this.dom('modelOption',{lower:model==='lower'}));await sleep(400);
    }
    const s=await this.dom('settings');assertSettings(s,model,undefined,outputs);await this.closeSettings();return s;
  }
  async verify(model,outputs=1){await this.openSettings();const s=await this.dom('settings');assertSettings(s,model,undefined,outputs);await this.closeSettings();return s;}
  async uploadFrame(blob,name,localPath=null){
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
      await this.wait(()=>this.dom('assetExists',{name}),120000,`asset de upload ${name}`);
    }
    await this.click(['Start','Início','Inicio']);
    await this.wait(()=>this.dom('exists',{names:['Close','Fechar']}),30000,'abrir selecao do frame');
    await this.dom('chooseAsset',{name});
    // Confirm atomically only when the preview is ready, or accept the automatic-close path.
    try {
      await this.wait(()=>this.dom('acceptFrame'),120000,'carregar previa e anexar frame');
    } catch (error) {
      const state=await this.dom('frameState');
      throw Error(`${error.message} Frame: ${JSON.stringify(state)}`);
    }
    // A selected start frame replaces the Start placeholder.
    await this.wait(async()=>!await this.dom('exists',{names:['Start','Início','Inicio']}));
  }
  async prompt(text){
    await this.dom('focusEditor');await this.send('text',{text,mac:(navigator.platform||navigator.userAgent).toLowerCase().includes('mac')});
    const actual=await this.dom('promptText');
    if(actual!==text.replace(/\s+/g,' ').trim())throw Error('O prompt no Flow ficou diferente do preset.');
  }
  async prepare(blob,name,prompt,model,localPath=null){await this.configure(model);await this.uploadFrame(blob,name,localPath);await this.prompt(prompt);return this.verify(model);}
  async submit(){
    await this.checkBlockers();
    const before=await this.dom('generationState');
    await this.clickPoint(await this.dom('point',{names:['Start generation','Iniciar geração','Gerar']}));
    await this.wait(async()=>{const after=await this.dom('generationState');return ['pending','videos','errors'].some(k=>after[k]>before[k]);},20000,'confirmar aceite da geracao no Flow; envio preservado para diagnostico');
  }
  async videos(){return this.dom('cards');}
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
  async originalDownload(card){
    await this.dom('openCard',{key:card.key});
    const assetId=await this.wait(()=>this.dom('assetId'),15000,'abrir asset para download');
    if(assetId!==card.assetId)throw Error('Asset aberto difere do resultado esperado.');
    await this.wait(()=>this.dom('exists',{names:['Download media']}),15000,'menu de download do asset');
    await this.click(['Download media']);
    await this.wait(()=>this.dom('exists',{names:['720p']}),15000,'opcao original 720p');
    await this.dom('armDownload');await this.click(['720p']);
    await this.wait(()=>this.dom('downloadLink'),30000,'arquivo de download original do Flow');
    let offset=0;const parts=[];
    while(true){const r=await this.dom('originalChunk',{offset});const bytes=Uint8Array.from(atob(r.data),c=>c.charCodeAt(0));
      if(r.offset!==offset||!bytes.length)throw Error('Transferencia do original interrompida.');
      parts.push(bytes);offset+=bytes.length;if(offset>=r.size)break;}
    await this.dom('releaseDownload');return new Blob(parts,{type:'video/mp4'});
  }
  async ensureAllMedia(){await this.wait(()=>this.dom('allMedia'),15000,'selecionar All media');}
  async backToProject(){if(await this.dom('exists',{names:['Back button to go to previous page']})){await this.click(['Back button to go to previous page']);await this.wait(()=>this.dom('exists',{names:['Settings trigger']}));}await this.ensureAllMedia();}
  async waitCandidates(baseline,started,failureBaseline=[],outputs=4){
    if(baseline.some(id=>!/^[a-f0-9-]{36}$/i.test(id)))throw Error('Baseline sem IDs permanentes.');
    while(Date.now()<started+45*60*1000){
      const {observed,failures}=await this.withUi(async()=>({observed:await this.inventory(),failures:await this.dom('audioFailures')}));
      const cards=observed.filter(v=>!baseline.includes(v.assetId));
      const remaining=[...failureBaseline];const failed=[];
      for(const f of failures){
        const old=remaining.indexOf(f.key);if(old>=0)remaining.splice(old,1);else failed.push(f.key);
      }
      if(cards.length+failed.length>outputs)throw Error(`Mais de ${outputs} resultados novos: lote ambiguo.`);
      if(cards.length+failed.length===outputs){
        if(!cards.length)throw Error('Todas as alternativas falharam no Flow. Nenhum reenvio automatico.');
        return {cards:cards.sort((a,b)=>a.assetId.localeCompare(b.assetId)),failed};
      }
      // Known audio failures occupy a slot; x4 never retries generation for quality or audio.
      if(!failed.length)await this.checkBlockers();
      await sleep(5000);
    }
    throw Error(`Lote x${outputs} incompleto. Retomar busca os mesmos resultados, sem novo envio.`);
  }
  async waitVideo(baseline,started,onStatus,stop,resultAssetId=null,failureOptions=null){
    if(!resultAssetId&&baseline.some(id=>!/^[a-f0-9-]{36}$/i.test(id)))throw Error('Baseline legado sem IDs permanentes. Recuperar a cena enviada por bind-result, sem reenviar.');
    const deadline=started+45*60*1000;
    while(Date.now()<deadline){
      if(failureOptions&&!resultAssetId){
        const failures=(await this.dom('audioFailures')).filter(f=>!failureOptions.baseline.includes(f.key));
        if(failures.length===1&&failures[0].retriable){
          await this.verify('lower');await failureOptions.onRetry(failures[0].key);
          await this.dom('retryAudio',{key:failures[0].key});
          await this.wait(async()=>!(await this.dom('audioFailures')).some(f=>f.key===failures[0].key),15000,'aceite da repeticao de audio');
          continue;
        }
      }
      await this.checkBlockers();
      const observed=await this.withUi(()=>this.inventory());
      const found=observed.filter(v=>resultAssetId?v.assetId===resultAssetId:!baseline.includes(v.assetId));
      if(found.length>1)throw Error('Mais de um resultado novo. Pausei para evitar encadear a cena errada.');
      if(found.length===1)return found[0];
      if(stop())throw Error('Pausado enquanto o Flow gera. Retomar vai buscar o resultado sem reenviar.');
      onStatus('Aguardando o Flow concluir a cena...');await sleep(5000);
    }
    throw Error('Tempo de espera excedido. Retomar consulta o resultado; nao gera novamente.');
  }
}
