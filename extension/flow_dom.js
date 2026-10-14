// Executed in the Flow tab; only DOM/UI, no internal API, account state or cookies.
export async function flowDom(op, a) {
  try {
    const visible=e=>!!e && e.getClientRects().length>0 && getComputedStyle(e).visibility!=='hidden';
    const all=s=>[...document.querySelectorAll(s)];
    const clean=s=>(s||'').replace(/\s+/g,' ').trim();
    const aliases={'Gatilho de configurações':'Settings trigger','Selecionar família de modelos':'Select model family','Incluir no comando':'Add to prompt','Elemento':'Image ingredient','Elemento de imagem':'Image ingredient','Limpar comando':'Clear prompt','Apagar comando':'Clear prompt','Botão "Voltar" para acessar a página anterior':'Back button to go to previous page','Baixar mídia':'Download media','Fechar':'Close','Vídeo':'Video','Início':'Start','Iniciar geração':'Start generation','Todas as mídias':'All media','Agente':'Agent'};
    const canonical=text=>aliases[clean(text)]||clean(text);
    const label=e=>{const explicit=e.getAttribute('aria-label')||e.querySelector('.toggle-text,.label')?.textContent;if(explicit)return canonical(explicit);const copy=e.cloneNode(true);copy.querySelectorAll('mat-icon,svg,[aria-hidden="true"]').forEach(n=>n.remove());return canonical(copy.textContent);};
    const buttons=()=>all('button,[role="button"],[role="menuitem"],[role="radio"]').filter(visible);
    const find=(names)=>{const candidates=buttons();for(const name of names){const found=candidates.find(e=>label(e)===name);if(found)return found;}};
    const point=e=>{if(!e)throw Error('Controle do Flow nao encontrado.');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,disabled:e.disabled||e.getAttribute('aria-disabled')==='true'};};
    const tileList=()=>all('flow-media-tile,[aria-label]').filter(e=>visible(e) && e.querySelector('video[aria-label="Generated video"]'));
    const settings=()=>{
      const model=find(['Select model family','Selecionar familia de modelos','Selecionar modelo']);
      const summary=find(['Settings trigger','Configuracoes','Configurações']);
      const radios=all('[role="radio"]').filter(e=>e.getAttribute('aria-checked')==='true');
      const checked=radios.map(label);
      const cost=all('a').find(e=>visible(e)&&/credit_menu/.test(e.href));
      const m=clean(cost?.textContent).match(/^(\d+)\s*(credits?|créditos?)/i);
      const agent=all('[role="checkbox"],input[type=checkbox]').find(e=>/agent|agente/i.test(label(e)));
      return {model:clean(model?.innerText),summary:clean(summary?.innerText),credits:m?Number(m[1]):null,
        video:checked.includes('Video')||checked.includes('Vídeo'),frames:checked.includes('Frames')||checked.includes('Quadros'),
        ratio:checked.find(t=>/^(9:16|16:9)$/.test(t)),count:checked.find(t=>/^x[1-4]$/.test(t)),
        agent:!!agent && (agent.checked||agent.getAttribute('aria-checked')==='true')};
    };
    if(op==='account'){
      const account=buttons().find(e=>/^(Google Account:|Conta do Google:)/i.test(e.getAttribute('aria-label')||''));
      const email=(account?.getAttribute('aria-label')||'').match(/\(([^()\s]+@[^()\s]+)\)/)?.[1]||null;
      return {email,home:location.origin+(location.pathname.match(/^\/u\/\d+\//)?.[0]||'/')};
    }
    if(op==='point')return point(a.css?all(a.css).find(visible):find(a.names));
    if(op==='inputVisibility')return {visible:document.visibilityState==='visible',focused:document.hasFocus()};
    if(op==='controlHit'){
      const hit=document.elementFromPoint(a.point.x,a.point.y)?.closest('button,[role="button"],[role="radio"],[role="menuitem"],[role="option"],[mat-list-item]');
      return {matches:!!hit&&hit===find(a.names||[]),label:hit?label(hit):null,visible:document.visibilityState==='visible',focused:document.hasFocus()};
    }
    if(op==='exists')return !!(a.css?all(a.css).find(visible):find(a.names));
    if(op==='clickControl'){const e=find(a.names);if(!e||e.disabled||e.getAttribute('aria-disabled')==='true')throw Error('Controle do Flow desabilitado ou indisponivel: '+a.names.join('/'));e.click();return true;}
    if(op==='focusEditor'){const e=all('[contenteditable="true"]').find(visible);if(!e)throw Error('Editor ausente.');e.focus();return true;}
    if(op==='acceptFrame'){
      const overlay=all('.cdk-overlay-pane').find(e=>visible(e)&&/Select a frame image|Selecione uma imagem de frame/i.test(e.innerText));
      if(!overlay){
        const chip=find(['Image ingredient','Elemento de imagem','Elemento'])||all('flow-image-chip,flow-image-ingredient-chip').find(visible);
        return !!chip&&!find(['Start','Início','Inicio']);
      }
      const baseName=a.name?(a.name.endsWith('.png')?a.name.slice(0,-4):a.name):'';
      const preview=[...overlay.querySelectorAll('img')].find(e=>visible(e)&&(
        /^(Preview of|Pr[eé]via de|Visualiza[çc][ãa]o de) /i.test(e.alt||'')||
        (a.name&&(e.alt?.includes(a.name)||(baseName&&e.alt?.includes(baseName))))||
        !e.closest('flow-grid-tile-container,flow-media-tile')
      ));
      if(preview&&(!preview.complete||!preview.naturalWidth))return false;
      const confirm=[...overlay.querySelectorAll('button')].find(e=>['Add to prompt','Adicionar ao prompt','Incluir no comando','Adicionar ao comando'].includes(label(e)));
      if(confirm&&!confirm.disabled&&confirm.getAttribute('aria-disabled')!=='true'&&!confirm.dataset.fsbConfirmed){confirm.dataset.fsbConfirmed='true';confirm.click();}
      return false;
    }
    if(op==='generationState')return {pending:all('flow-pending-tile').filter(visible).length,videos:all('flow-video-tile').filter(e=>visible(e)&&!e.querySelector('flow-error-tile,flow-pending-tile')).length,errors:all('flow-error-tile').filter(visible).length};
    if(op==='pendingComplete')return all('flow-pending-tile').filter(visible).some(tile=>/\b100\s*%/.test(tile.innerText));
    if(op==='settings')return settings();
    if(op==='allMedia'){
      const item=all('mat-list-item,[mat-list-item]').find(e=>visible(e)&&['All media','Todas as midias','Todas as mídias'].includes(label(e)));
      if(!item)throw Error('Filtro All media nao encontrado.');
      if(item.classList.contains('mdc-list-item--activated'))return true;
      item.click();return false;
    }
    if(op==='audioFailures'||op==='retryAudio'){
      const failures=await Promise.all(all('flow-error-tile').filter(visible).map(async tile=>{
        const text=clean(tile.innerText);const title=tile.closest('flow-grid-tile-container')?.getAttribute('aria-label')||'';
        const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(title+'\n'+text));
        const key=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
        const retry=[...tile.querySelectorAll('button')].find(b=>['Retry','Tentar de novo','Tentar novamente'].includes(label(b)));
        const kind=/unusual activity|atividade incomum|quota|hit your limits|insufficient credits|not enough credits|créditos? insuficientes|limite.*gera|too many|muitas solicita|rate limit/i.test(text)?'account_limit':null;
        return {key,tile,retry,kind,reason:text,retriable:!kind&&/not been charged|não houve cobrança|nao houve cobranca|não foi cobrado/i.test(text)&&!!retry};
      }));
      if(op==='audioFailures')return failures.map(({key,retriable,kind,reason})=>({key,retriable,kind,reason}));
      const found=failures.filter(f=>f.key===a.key&&f.retriable);
      if(found.length!==1)throw Error('Falha de audio nao e unica ou nao confirma ausencia de cobranca.');
      found[0].retry.click();return true;
    }
    if(op==='radio') {const e=all('[role="radio"]').find(e=>visible(e)&&a.names.includes(label(e)));return {selected:e?.getAttribute('aria-checked')==='true',...point(e)};}
    if(op==='modelOption'){
      const candidates=all('[role="menuitem"],[role="option"]').filter(visible).filter(e=>/veo\s*3[.,]1.*lite/i.test(label(e)));
      const match=candidates.find(e=>/lower\s*priority|baixa\s*prioridade|prioridade\s*(mais\s*)?baixa/i.test(label(e))===a.lower);
      return point(match);
    }
    if(op==='editor')return point(all('[contenteditable="true"]').find(visible));
    if(op==='promptText')return clean(all('[contenteditable="true"]').find(visible)?.innerText);
    if(op==='project')return {url:location.href,isProject:/\/project\//.test(location.pathname)};
    if(op==='projectTitle')return document.querySelector('input[aria-label="Editable text"],input[aria-label="Texto editável"]')?.value||null;
    if(op==='focusTitle'){const e=document.querySelector('input[aria-label="Editable text"],input[aria-label="Texto editável"]');if(!e)throw Error('Nome editavel ausente.');e.focus();e.select();return {value:e.value,selectionStart:e.selectionStart,selectionEnd:e.selectionEnd,active:document.activeElement===e};}
    if(op==='setTitle') {
      const e=document.querySelector('input[aria-label="Editable text"],input[aria-label="Texto editável"]');
      if(e){e.focus();const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,a.title);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}return !!e;
    }
    if(op==='commitTitle') {
      const e=document.querySelector('input[aria-label="Editable text"],input[aria-label="Texto editável"]');
      if(!e||e.value!==a.title)throw Error('Nome editavel difere antes de concluir.');
      const navigation=e.closest('nav,[role="navigation"]');
      const button=[...navigation?.querySelectorAll('button')||[]].find(b=>visible(b)&&['Done','Concluir'].includes(label(b)));
      if(!button)throw Error('Controle de concluir nome nao encontrado; projeto preservado.');
      button.click();return true;
    }
    const cards=async()=> (await Promise.all(all('flow-video-tile').filter(visible).map(async tile=>{
      const container=tile.closest('flow-grid-tile-container')||tile;
      const media=tile.querySelector('video[aria-label="Generated video"],video[aria-label="Vídeo gerado"],img[alt="Generated video thumbnail"],img[alt="Miniatura do vídeo gerada"]');
      const src=media?.currentSrc||media?.src;
      let key=container.getAttribute('data-fsb-key');
      if(!key && !src)return null;
      if(!key){const u=new URL(src);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(u.origin+u.pathname));key=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');container.setAttribute('data-fsb-key',key);}
      return {key,tile};
    }))).filter(Boolean);
    if(op==='cards')return (await cards()).map(({key})=>({key}));
    if(op==='cardPoint')return point((await cards()).find(c=>c.key===a.key)?.tile);
    if(op==='openCard'){const c=(await cards()).find(c=>c.key===a.key);if(!c)throw Error('Cartao nao encontrado.');c.tile.click();return true;}
    if(op==='assetId')return location.pathname.match(/\/edit\/([a-f0-9-]{36})$/i)?.[1]||null;
    if(op==='armDownload'){
      const state={url:null};const original=HTMLAnchorElement.prototype.click;let timer;
      const restore=()=>{clearTimeout(timer);HTMLAnchorElement.prototype.click=original;document.removeEventListener('click',capture,true);};
      const take=anchor=>{if(anchor?.hasAttribute('download')){
        state.url=anchor.href;
        state.promise=fetch(anchor.href,{signal:AbortSignal.timeout(45000)}).then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.arrayBuffer();}).then(buffer=>{state.bytes=new Uint8Array(buffer);}).catch(e=>{state.error=`Arquivo original (${new URL(state.url).protocol}): ${e.message}`;});
        restore();return true;}return false;};
      const capture=event=>{if(take(event.target.closest?.('a'))){event.preventDefault();event.stopImmediatePropagation();}};
      HTMLAnchorElement.prototype.click=function(){if(!take(this))return original.call(this);};
      document.addEventListener('click',capture,true);document.fsbDownload=state;
      timer=setTimeout(restore,30000);return true;
    }
    if(op==='downloadLink')return document.fsbDownload?.url||null;
    if(op==='originalChunk'){
      const state=document.fsbDownload;if(!state?.promise)throw Error('Menu nao produziu um arquivo original.');
      await state.promise;if(state.error)throw Error(state.error);
      const bytes=state.bytes;const offset=Number(a.offset||0);
      if(!Number.isSafeInteger(offset)||offset<0||offset>bytes.length)throw Error('Offset invalido.');
      const chunk=bytes.subarray(offset,offset+262144);let text='';
      for(let i=0;i<chunk.length;i+=8192)text+=String.fromCharCode(...chunk.subarray(i,i+8192));
      return {data:btoa(text),size:bytes.length,offset};
    }
    if(op==='releaseDownload'){delete document.fsbDownload;return true;}
    if(op==='media'){
      await cards();
      return all('video[aria-label="Generated video"]').map(e=>{
        const url=e.currentSrc||e.src;if(!url)return null;
        const container=e.closest('flow-grid-tile-container')||e.closest('flow-video-tile');
        return {key:container?.getAttribute('data-fsb-key'),url};
      }).filter(v=>v?.key);
    }
    if(op==='blockers') {
      // Historical error cards remain in the project grid for audit; they are
      // not active account or UI blockers for the next scene.
      const alerts=all('[role="alert"],mat-snack-bar-container,.error-message').filter(e=>visible(e)&&!e.closest('flow-error-tile')).map(e=>clean(e.innerText));
      const dialogs=all('[role="dialog"],.cdk-overlay-pane').filter(visible).map(e=>clean(e.innerText));
      // Inspect visible messages only. Hidden recaptcha containers are normal and not a challenge.
      const words=[...alerts,...dialogs].join('\n');
      const limit=/unusual activity|atividade incomum|quota|credits? remaining|insufficient credits|not enough credits|créditos? insuficientes|limite.*gera|hit your limits|too many|muitas solicita|rate limit|try again later|tente novamente mais tarde|verify you are human|verifique.*humano|generation failed|falha na gera|couldn.t generate|não foi possível gerar/i;
      const terms=/terms of service|termos de serviço|i agree|concordo/i;
      return (limit.test(words)||terms.test(words))?words.slice(0,700):null;
    }
    if(op==='dropImage') {
      const response=await fetch(a.dataUrl);const blob=await response.blob();
      const file=new File([blob],a.name,{type:blob.type});const dt=new DataTransfer();dt.items.add(file);
      const target=document.querySelector('flow-project-page');
      if(!target)throw Error('Layout do Flow nao reconhecido para upload.');
      for(const type of ['dragenter','dragover','drop'])target.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:dt}));
      return true;
    }
    if(op==='assetExists')return all('[aria-label],.label,.title,.asset-name,.asset-title').some(e=>visible(e)&& (e.getAttribute('aria-label')===a.name||clean(e.textContent)===a.name));
    if(op==='selectAsset'||op==='chooseAsset') {
      const root=all('.cdk-overlay-pane').find(e=>visible(e)&&/Select a frame image|Selecione uma imagem de frame/.test(e.innerText)) || document;
      const matches=[...root.querySelectorAll('[aria-label],img,.label,.title,.asset-name,.asset-title')].filter(e=>visible(e)&&(e.getAttribute('aria-label')===a.name||e.getAttribute('alt')===a.name||clean(e.textContent)===a.name));
      const e=matches.sort((x,y)=>x.querySelectorAll('*').length-y.querySelectorAll('*').length)[0];
      if(op==='chooseAsset'){if(!e)throw Error('Asset nao encontrado: '+a.name);const option=e.closest('button,[role="option"]')||e;if(option.getAttribute('aria-selected')!=='true')option.click();return true;}
      // Filename buttons rename the asset; preview opens from its image.
      const tile=e?.closest('flow-grid-tile-container');
      const image=tile?.querySelector('img');
      if(!image||!visible(image))throw Error('Miniatura do asset nomeado nao encontrada.');
      return {...point(image),assetName:a.name};
    }
    if(op==='frameState') {
      const start=find(['Start','Início','Inicio']);
      const chip=find(['Image ingredient','Elemento de imagem','Elemento'])||all('flow-image-chip,flow-image-ingredient-chip').find(visible);
      return {empty:!!start,hasImage:!!chip,images:all('img').filter(visible).map(e=>({alt:e.alt,src:e.src})).filter(e=>/blob:|flow-content/.test(e.src)).length};
    }
    if(op==='frameMatches') {
      const chips=all('flow-image-ingredient-chip img,flow-image-chip img').filter(visible);
      const assets=all('flow-grid-tile-container[aria-label]').filter(e=>visible(e)&&e.getAttribute('aria-label')===a.name);
      if(chips.length!==1||assets.length!==1||find(['Start','Início','Inicio']))return false;
      const source=assets[0].querySelector('img');
      if(!source?.complete||!source.naturalWidth||!chips[0].complete||!chips[0].naturalWidth)return false;
      const key=e=>{try{const u=new URL(e.src);return u.origin+u.pathname;}catch{return null;}};
      return !!key(source)&&key(source)===key(chips[0]);
    }
    if(op==='openNamedImagePreview'){
      // Read-only image navigation only. Never used for Generate or Retry.
      if(!/^\/(?:u\/\d+\/)?project\/[a-f0-9-]{36}\/?$/i.test(location.pathname))throw Error('Preview exige a grade do projeto.');
      const assets=all('flow-grid-tile-container[aria-label]').filter(e=>visible(e)&&e.getAttribute('aria-label')===a.name);
      const chips=all('flow-image-ingredient-chip img,flow-image-chip img').filter(visible);
      const image=assets.length===1?assets[0].querySelector('img'):null;
      if(!image?.complete||!image.naturalWidth||!visible(image)||chips.length!==1||find(['Start','Início','Inicio'])||!chips[0].complete||!chips[0].naturalWidth)throw Error('Imagem nomeada ou frame anexado indisponivel.');
      const chipUrl=new URL(chips[0].currentSrc||chips[0].src);
      if(chipUrl.origin+chipUrl.pathname!==a.source)throw Error('Frame mudou antes da preview; nenhum envio.');
      const p=point(image);
      // Some grid components open on click.detail=2, others on dblclick.
      // Both events belong to the normal double-click sequence. They target
      // only the verified image, never a generation or Retry control.
      const event={bubbles:true,cancelable:true,composed:true,view:window,button:0,buttons:0,detail:2,clientX:p.x,clientY:p.y};
      image.dispatchEvent(new MouseEvent('click',event));
      if(image.isConnected)image.dispatchEvent(new MouseEvent('dblclick',event));
      return true;
    }
    if(op==='frameSource'||op==='imageAssetSource'){
      let image;
      if(op==='frameSource'){
        const chips=all('flow-image-ingredient-chip img,flow-image-chip img').filter(visible);
        if(chips.length!==1||find(['Start','Início','Inicio']))return null;
        image=chips[0];
      }else{
        const title=document.querySelector('input[aria-label="Editable text"],input[aria-label="Texto editável"]')?.value;
        if(!/\/edit\/[a-f0-9-]{36}$/i.test(location.pathname)||title!==a.name)return null;
        image=all('img').find(e=>visible(e)&&['Read only image preview','Read-only image preview','Visualização de imagem somente para leitura'].includes(e.alt));
      }
      if(!image?.complete||!image.naturalWidth)return null;
      try{const url=new URL(image.currentSrc||image.src);return url.origin+url.pathname;}catch{return null;}
    }
    if(op==='removeFrames'){
      // Targets composer frame chips only, never project media delete actions.
      return all('flow-image-chip button[aria-label],flow-image-ingredient-chip button[aria-label]').filter(visible).filter(e=>/remove|remover/i.test(label(e))||label(e)==='Image ingredient').map(point);
    }
    if(op==='diagnostics')return {
      project:/\/project\//.test(location.pathname),buttons:buttons().map(label).slice(-100),
      inputs:all('input').map(e=>({type:e.type,aria:e.getAttribute('aria-label')})),
      editors:all('[contenteditable=true]').length,settings:settings(),videos:all('video').length,
      components:[...new Set(all('*').map(e=>e.tagName.toLowerCase()).filter(t=>t.startsWith('flow-')))].slice(-100)
    };
    throw Error('Operacao DOM invalida.');
  } catch(e){return {error:e.message};}
}
