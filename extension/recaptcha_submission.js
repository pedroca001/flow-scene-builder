// Adapted from Atualizacao 08. Keep app-issued tokens in memory only.
// Capture the real composer request, rather than inserting a dummy prompt.
const VIDEO_RPCS=new Set(['MZZa6b','eb1hJf']);
export function generationRequest(request,pageUrl){
  const url=new URL(request.url),page=new URL(pageUrl);
  if(url.origin!==page.origin||url.hostname!=='flow.google.com'||!url.pathname.endsWith('/batchexecute'))return null;
  const ids=(url.searchParams.get('rpcids')||'').split(',');
  const body=request.postData||'';
  const hasToken=/0[cC][A-Za-z0-9_-]{100,}/.test(new URLSearchParams(body).get('f.req')||'');
  if(!ids.some(id=>VIDEO_RPCS.has(id))&&!hasToken)return null;
  // Never let an unrecognized token-bearing operation reach the server.
  if(request.method!=='POST'||ids.length!==1||!VIDEO_RPCS.has(ids[0]))throw Error('RPC de geracao nao reconhecido; chamada abortada.');
  let rows;
  try{rows=JSON.parse(new URLSearchParams(body).get('f.req'))[0];}catch{throw Error('Corpo da geracao indisponivel; chamada abortada.');}
  if(!Array.isArray(rows)||rows.length!==1||rows[0][0]!==ids[0]||!hasToken)throw Error('Token ou lote da geracao invalido; chamada abortada.');
  return {url:url.href,body,rpc:ids[0],pageUrl:page.href};
}

export async function harvestAppRequest({tabId,pageUrl,send,events,click,timeout=25000}){
  let resolve,reject,timer,closed=false,captured=false,clickEvidence=null,tail=Promise.resolve();
  const result=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
  // Attach a rejection handler before clicking, since the app can respond immediately.
  result.catch(()=>{});
  const listener=(source,method,params)=>{
    if(source.tabId!==tabId||source.sessionId||method!=='Fetch.requestPaused')return;
    tail=tail.then(async()=>{
      const request={...params.request};
      if(!request.postData&&params.networkId){
        try{request.postData=(await send('Network.getRequestPostData',{requestId:params.networkId})).postData;}catch{}
      }
      let generation;
      try{generation=generationRequest(request,pageUrl);}
      catch(error){await send('Fetch.failRequest',{requestId:params.requestId,errorReason:'Aborted'});reject(error);return;}
      if(!generation){await send('Fetch.continueRequest',{requestId:params.requestId});return;}
      await send('Fetch.failRequest',{requestId:params.requestId,errorReason:'Aborted'});
      if(!closed&&!captured){captured=true;resolve(generation);}
    }).catch(()=>reject(Error('Falha na interceptacao; envio preservado para diagnostico.')));
  };
  events.addListener(listener);
  try{
    await send('Fetch.enable',{patterns:[{urlPattern:'https://flow.google.com/*batchexecute*',requestStage:'Request'}]});
    timer=setTimeout(()=>{const error=Error('Colheita sem resposta; reconciliar antes de tentar novamente.'+(clickEvidence?.inputState?' Evidencia de foco: '+JSON.stringify({focused:clickEvidence.inputState.focused,visibility:clickEvidence.inputState.visibility,hitMatches:clickEvidence.inputState.hitMatches}):''));error.kind='recaptcha_capture_timeout';reject(error);},timeout);
    clickEvidence=await click();
    return await result;
  }finally{
    closed=true;clearTimeout(timer);
    await tail;
    try{await send('Fetch.disable');}finally{events.removeListener(listener);}
  }
}

// Serialized by chrome.scripting. All helpers must remain inside this function.
export async function replayAppRequest(request){
  if(location.href!==request.pageUrl||new URL(request.url).origin!==location.origin)return {ok:false,error:'project_changed'};
  return new Promise(resolve=>{
    const xhr=new XMLHttpRequest();
    xhr.open('POST',request.url,true);xhr.withCredentials=true;xhr.timeout=60000;
    xhr.setRequestHeader('X-Same-Domain','1');
    xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded;charset=utf-8');
    xhr.onload=()=>{
      const text=xhr.responseText||'';
      const reason=(text.match(/PUBLIC_ERROR_[A-Z_]+/)||[])[0]||null;
      let frame=null;
      for(const line of text.split('\n')){
        try{
          const rows=JSON.parse(line);
          if(Array.isArray(rows))frame=rows.find(row=>Array.isArray(row)&&row[0]==='wrb.fr'&&row[1]===request.rpc)||frame;
        }catch{}
      }
      const rpcFailed=Array.isArray(frame?.[5])&&typeof frame[5][0]==='number'&&frame[5][0]!==0;
      const ids=[...new Set((frame?.[2]||'').match?.(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/gi)||[])];
      const accepted=frame&&!rpcFailed&&typeof frame[2]==='string'&&ids.length>=2;
      // HTTP 200 alone does not confirm RPC success. No raw response leaves the page.
      const definitiveRejection=xhr.status===200&&!!frame&&rpcFailed&&ids.length===0&&!!reason;
      resolve({ok:xhr.status===200&&!reason&&!!accepted,httpStatus:xhr.status,error:reason||(!accepted?'rpc_unconfirmed':null),definitiveRejection});
    };
    xhr.onerror=xhr.ontimeout=()=>resolve({ok:false,error:'delivery_uncertain'});
    xhr.send(request.body);
  });
}
