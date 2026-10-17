const VIDEO_RPCS=new Set(['MZZa6b','eb1hJf','ogiZ0b','as29s','YhhmEf']);
export function generationRequest(request,pageUrl){
  const url=new URL(request.url),page=new URL(pageUrl);
  if(url.origin!==page.origin||url.hostname!=='flow.google.com'||!url.pathname.endsWith('/batchexecute'))return null;
  const ids=(url.searchParams.get('rpcids')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const body=request.postData||'';
  const hasToken=/0[cC][A-Za-z0-9_-]{100,}/.test(new URLSearchParams(body).get('f.req')||body);
  const validRpc=ids.find(id=>VIDEO_RPCS.has(id)||/^[a-zA-Z0-9]{6}$/.test(id));
  if(!validRpc&&!hasToken)return null;
  if(request.method!=='POST'||!validRpc)throw Error('RPC de geracao nao reconhecido ('+ids.join(',')+'); chamada abortada.');
  let rows;
  try{rows=JSON.parse(new URLSearchParams(body).get('f.req'))[0];}catch{throw Error('Corpo da geracao indisponivel; chamada abortada.');}
  if(!Array.isArray(rows)||!hasToken)throw Error('Token ou lote da geracao invalido; chamada abortada.');
  return {url:url.href,body,rpc:validRpc,pageUrl:page.href};
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

  const rawBody=request.body||'';
  const u=new URL(request.url,location.origin);
  const PROJ=(location.pathname?.match(/project\/([0-9a-fA-F\-]+)/)||location.href?.match(/project\/([0-9a-fA-F\-]+)/)||(u.searchParams.get('source-path')||'').match(/project\/([0-9a-fA-F\-]+)/)||[])[1]||'';
  const W=typeof window!=='undefined'&&window.WIZ_global_data?window.WIZ_global_data:{};
  const at=()=>W.SNlM0e||new URLSearchParams(rawBody).get('at')||'';
  const fsid=W.FdrFJe||u.searchParams.get('f.sid')||'';
  const bl=W.cfb2h||u.searchParams.get('bl')||'';
  const U=()=>crypto.randomUUID().toUpperCase();
  const RID=()=>Math.floor(1000000+Math.random()*8000000);
  const reqPath=u.pathname.endsWith('/batchexecute')?u.pathname:'/_/AiSandboxAngularFrontend/data/batchexecute';

  let token=null;
  let appInner=null;
  let imgId=null;
  let prompt='';

  try{
    const fReqRaw=new URLSearchParams(rawBody).get('f.req');
    if(fReqRaw){
      const parsed=JSON.parse(fReqRaw);
      const rows=Array.isArray(parsed[0])?parsed[0]:parsed;
      const row=Array.isArray(rows[0])?rows[0]:rows;
      if(typeof row?.[1]==='string')appInner=JSON.parse(row[1]);
      if(Array.isArray(appInner?.[1]?.[10]))token=appInner[1][10][0];
    }
  }catch{}

  if(!token){
    try{
      const decoded=decodeURIComponent(rawBody.replace(/\+/g,' '));
      token=(decoded.match(/0[cC][A-Za-z0-9_-]{100,}/)||[])[0];
    }catch{}
  }
  if(!token){
    token=(rawBody.match(/0[cC][A-Za-z0-9_-]{100,}/)||[])[0];
  }

  if(request.prompt)prompt=request.prompt;
  else if(appInner){
    prompt=appInner?.[0]?.[0]?.[0]?.[2]?.[0]?.[0]||prompt;
  }
  if(request.imgId)imgId=request.imgId;
  else if(appInner){
    const imgFromApp=appInner?.[0]?.[0]?.[4]?.[1]||appInner?.[0]?.[0]?.[1]?.[0]?.[1]||appInner?.[0]?.[0]?.[1]?.[0]?.[0];
    if(typeof imgFromApp==='string'&&imgFromApp.length===36)imgId=imgFromApp;
  }
  while(Array.isArray(prompt))prompt=prompt[0];
  if(typeof prompt!=='string')prompt=String(prompt||'');

  function parseText(text, status, expectedRpc){
    const cleanText=text.replace(/\\+u([0-9a-fA-F]{4})/g,(m,h)=>String.fromCharCode(parseInt(h,16))).replace(/\\+\//g,'/');
    const ids=Array.from(new Set(cleanText.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)||[]));
    const reason=(text.match(/PUBLIC_ERROR_[A-Z_]+/)||[])[0]||null;
    const hasUnusual=/UNUSUAL_ACTIVITY/i.test(text);
    const hasE3=/,\[3\]/.test(text);
    let frame=null;
    for(const line of text.split('\n')){
      try{
        const rows=JSON.parse(line);
        if(Array.isArray(rows))frame=rows.find(row=>Array.isArray(row)&&row[0]==='wrb.fr'&&row[1]===expectedRpc)||frame;
      }catch{}
    }
    if(!frame){
      const wrbIdx=text.indexOf('["wrb.fr"');
      if(wrbIdx!==-1){
        try{
          const sub=text.slice(wrbIdx-1);
          const parsed=JSON.parse(sub.slice(0,sub.lastIndexOf(']')+1));
          if(Array.isArray(parsed))frame=parsed.find(row=>Array.isArray(row)&&row[0]==='wrb.fr'&&row[1]===expectedRpc)||frame;
        }catch{}
      }
    }
    const rpcFailed=Array.isArray(frame?.[5])&&typeof frame[5][0]==='number'&&frame[5][0]!==0;
    const accepted=Boolean(status===200&&!reason&&!hasUnusual&&!hasE3&&!rpcFailed&&(ids.length>=1||(frame&&typeof frame[2]==='string')));
    const definitiveRejection=Boolean(status===200&&(hasUnusual||!!reason));
    const videoId=ids.length>=2?ids[1]:(ids[0]||null);
    return {
      ok:accepted,
      httpStatus:status,
      error:reason||(hasUnusual?'PUBLIC_ERROR_UNUSUAL_ACTIVITY':(!accepted?'rpc_unconfirmed':null)),
      definitiveRejection,
      videoId,
      rpc:expectedRpc,
      raw:cleanText.slice(0,500),
      rpcFailed,hasUnusual,hasE3
    };
  }

  function sendCall(url, body, expectedRpc){
    return new Promise(resolve=>{
      const xhr=new XMLHttpRequest();
      xhr.open('POST',url,true);xhr.withCredentials=true;xhr.timeout=60000;
      xhr.setRequestHeader('X-Same-Domain','1');
      xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded;charset=utf-8');
      xhr.onload=()=>resolve(parseText(xhr.responseText||'', xhr.status, expectedRpc));
      xhr.onerror=async(evt)=>{
        let fetchErr=null;
        try {
          if(typeof fetch==='function'){
            const res=await fetch(url,{method:'POST',body,credentials:'include',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=utf-8','X-Same-Domain':'1'}});
            const text=await res.text();
            return resolve(parseText(text, res.status, expectedRpc));
          }
        }catch(e){fetchErr=e;}
        resolve({ok:false,httpStatus:0,error:'delivery_uncertain',definitiveRejection:false,raw:'xhr_err:'+String(xhr.status)+'/'+String(xhr.statusText)+' fetch_err:'+String(fetchErr?.message||fetchErr||'none')+' url:'+url,rpc:expectedRpc});
      };
      xhr.ontimeout=()=>resolve({ok:false,httpStatus:0,error:'delivery_uncertain',definitiveRejection:false,raw:'timeout',rpc:expectedRpc});
      xhr.send(body);
    });
  }

  // If request has no valid array appInner (like in unit tests), replay request.body directly
  if(!Array.isArray(appInner)){
    const r=await sendCall(request.url, request.body, request.rpc);
    return {ok:r.ok,httpStatus:r.httpStatus,error:r.error,definitiveRejection:r.definitiveRejection,videoId:r.videoId};
  }

  try {
    const CTX=(tk)=>[null,22,null,null,null,PROJ,null,null,null,null,[tk,1]];
    const imageSlot=imgId?[[null,imgId]]:null;

    // Attempt 0: Replay exact intercepted request using relative batch URL
    const batchUrl = reqPath + '?rpcids=' + request.rpc + '&source-path=%2Fproject%2F' + PROJ
      + '&bl=' + encodeURIComponent(bl) + '&f.sid=' + encodeURIComponent(fsid) + '&hl=pt&_reqid=' + RID() + '&rt=c';
    let resExact=null;
    if(request.body && request.rpc){
      resExact=await sendCall(batchUrl, request.body, request.rpc);
      if(resExact.ok)return {ok:true,httpStatus:resExact.httpStatus,videoId:resExact.videoId,definitiveRejection:false,diag:{attempt:'exact',rpc:request.rpc,raw:resExact.raw}};
    }

    // Attempt 1: MZZa6b with veo_3_1_r2v_lite_low_priority (canonical zero-credit model from ATUALIZACAO-08)
    const innerMzzLow=[[[[null,null,[[[prompt]]]],imageSlot,'veo_3_1_r2v_lite_low_priority',1,null,[null,null,null,null,U(),U()]]],CTX(token),[U(),1]];
    const url1=reqPath+'?rpcids=MZZa6b&source-path=%2Fproject%2F'+PROJ
      +'&bl='+encodeURIComponent(bl)+'&f.sid='+encodeURIComponent(fsid)+'&hl=pt&_reqid='+RID()+'&rt=c';
    const body1='f.req='+encodeURIComponent(JSON.stringify([[["MZZa6b",JSON.stringify(innerMzzLow),null,'generic']]]))+'&at='+encodeURIComponent(at())+'&';

    let res1=await sendCall(url1, body1, 'MZZa6b');
    if(res1.ok)return {ok:true,httpStatus:res1.httpStatus,videoId:res1.videoId,definitiveRejection:false,diag:{attempt:1,rpc:'MZZa6b',raw:res1.raw}};

    // Attempt 2: MZZa6b with veo_3_1_r2v_lite (standard fallback if account lacks low_priority)
    const innerMzzFallback=[[[[null,null,[[[prompt]]]],imageSlot,'veo_3_1_r2v_lite',1,null,[null,null,null,null,U(),U()]]],CTX(token),[U(),1]];
    const url2=reqPath+'?rpcids=MZZa6b&source-path=%2Fproject%2F'+PROJ
      +'&bl='+encodeURIComponent(bl)+'&f.sid='+encodeURIComponent(fsid)+'&hl=pt&_reqid='+RID()+'&rt=c';
    const body2='f.req='+encodeURIComponent(JSON.stringify([[["MZZa6b",JSON.stringify(innerMzzFallback),null,'generic']]]))+'&at='+encodeURIComponent(at())+'&';

    let res2=await sendCall(url2, body2, 'MZZa6b');
    if(res2.ok)return {ok:true,httpStatus:res2.httpStatus,videoId:res2.videoId,definitiveRejection:false,diag:{attempt:2,rpc:'MZZa6b',raw:res2.raw}};

    // Attempt 3: Try eb1hJf with refreshed _reqid and new UUIDs (legacy path if not attempted yet)
    let res3={ok:false};
    if(request.rpc!=='eb1hJf'){
      if(Array.isArray(appInner?.[0]?.[0]?.[5])){
        appInner[0][0][5]=[null,null,null,null,U(),U()];
      }
      const url3=reqPath+'?rpcids=eb1hJf&source-path=%2Fproject%2F'+PROJ
        +'&bl='+encodeURIComponent(bl)+'&f.sid='+encodeURIComponent(fsid)+'&hl=pt&_reqid='+RID()+'&rt=c';
      const body3='f.req='+encodeURIComponent(JSON.stringify([[["eb1hJf",JSON.stringify(appInner),null,'generic']]]))+'&at='+encodeURIComponent(at())+'&';
      res3=await sendCall(url3, body3, 'eb1hJf');
      if(res3.ok)return {ok:true,httpStatus:res3.httpStatus,videoId:res3.videoId,definitiveRejection:false,diag:{attempt:3,rpc:'eb1hJf',raw:res3.raw}};
    }

    // Attempt 4: Try captured RPC with inner format if different from MZZa6b
    let resCap=null;
    if(request.rpc && request.rpc!=='MZZa6b' && request.rpc!=='eb1hJf'){
      const innerCap=[[[[null,null,[[[prompt]]]],imageSlot,'veo_3_1_r2v_lite_low_priority',1,null,[null,null,null,null,U(),U()]]],CTX(token),[U(),1]];
      const urlCap=reqPath+'?rpcids='+request.rpc+'&source-path=%2Fproject%2F'+PROJ
        +'&bl='+encodeURIComponent(bl)+'&f.sid='+encodeURIComponent(fsid)+'&hl=pt&_reqid='+RID()+'&rt=c';
      const bodyCap='f.req='+encodeURIComponent(JSON.stringify([[[request.rpc,JSON.stringify(innerCap),null,'generic']]]))+'&at='+encodeURIComponent(at())+'&';
      resCap=await sendCall(urlCap, bodyCap, request.rpc);
      if(resCap.ok)return {ok:true,httpStatus:resCap.httpStatus,videoId:resCap.videoId,definitiveRejection:false,diag:{attempt:'capturedRpc',rpc:request.rpc,raw:resCap.raw}};
    }

    // Attempt 5: Try captured RPC with modified appInner
    let resApp=null;
    if(request.rpc && appInner){
      try {
        if(Array.isArray(appInner?.[0]?.[0]?.[0]?.[2]?.[0])) appInner[0][0][0][2][0][0]=prompt;
        if(imageSlot && Array.isArray(appInner?.[0]?.[0])) appInner[0][0][1]=imageSlot;
        if(Array.isArray(appInner?.[0]?.[0]?.[5])) appInner[0][0][5]=[null,null,null,null,U(),U()];
      }catch{}
      const urlApp=reqPath+'?rpcids='+request.rpc+'&source-path=%2Fproject%2F'+PROJ
        +'&bl='+encodeURIComponent(bl)+'&f.sid='+encodeURIComponent(fsid)+'&hl=pt&_reqid='+RID()+'&rt=c';
      const bodyApp='f.req='+encodeURIComponent(JSON.stringify([[[request.rpc,JSON.stringify(appInner),null,'generic']]]))+'&at='+encodeURIComponent(at())+'&';
      resApp=await sendCall(urlApp, bodyApp, request.rpc);
      if(resApp.ok)return {ok:true,httpStatus:resApp.httpStatus,videoId:resApp.videoId,definitiveRejection:false,diag:{attempt:'appInner',rpc:request.rpc,raw:resApp.raw}};
    }

    // Return the best diagnostic failure
    const candidates=[resExact,resCap,resApp,res1,res2,res3].filter(Boolean);
    const best=candidates.find(c=>c.error)||resExact||res1;
    return {
      ok:false,
      httpStatus:best.httpStatus||0,
      error:best.error||'delivery_uncertain',
      definitiveRejection:best.definitiveRejection===true,
      videoId:best.videoId||null,
      diag:{
        attExact:resExact?{rpc:resExact.rpc,err:resExact.error,status:resExact.httpStatus,raw:resExact.raw}:null,
        att1:{rpc:res1?.rpc,err:res1?.error,status:res1?.httpStatus,raw:res1?.raw},
        att2:{rpc:res2?.rpc,err:res2?.error,status:res2?.httpStatus,raw:res2?.raw},
        att3:{rpc:res3?.rpc,err:res3?.error,status:res3?.httpStatus,raw:res3?.raw},
        attCap:resCap?{rpc:resCap.rpc,err:resCap.error,raw:resCap.raw}:null,
        attApp:resApp?{rpc:resApp.rpc,err:resApp.error,raw:resApp.raw}:null,
        capturedRpc:request.rpc,
        imgId:imgId||'null',
        tokenLength:token?token.length:0,
        appInner:JSON.stringify(appInner),
        requestBodySnippet:request.body?request.body.slice(0,1500):''
      }
    };
  } catch(err) {
    return {
      ok:false,
      httpStatus:0,
      error:'exception: '+String(err.message||err),
      definitiveRejection:false,
      videoId:null,
      diag:{exception:String(err.stack||err)}
    };
  }
}
