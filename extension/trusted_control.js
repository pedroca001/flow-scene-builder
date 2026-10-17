// Read the button after the target tab is active. Layout may change on activation.
export async function stableControlPoint(read, pause=ms=>new Promise(r=>setTimeout(r,ms))){
  let prior=null, sawDisabled=false;
  for(let i=0;i<20;i++){
    const point=await read();
    if(!point||point.disabled){
      sawDisabled=true;
      await pause(100);
      continue;
    }
    if(prior&&Math.abs(point.x-prior.x)<0.5&&Math.abs(point.y-prior.y)<0.5)return point;
    prior=point;await pause(100);
  }
  if(sawDisabled&&!prior)throw Error('Controle do Flow desabilitado; nenhum clique enviado.');
  throw Error('Posicao do controle nao estabilizou; nenhum clique enviado.');
}

// Window focus alone is insufficient on Windows: a focused web contents can
// still be hidden. Restore only its window and reselect the same tab once.
export async function waitForVisibleInput(read,activate,pause=ms=>new Promise(r=>setTimeout(r,ms)),attempts=50){
  let restored=false,last;
  for(let i=0;i<attempts;i++){
    last=await read();
    if(last?.visible===true&&last?.focused===true&&last?.tabActive!==false)return last;
    if(!restored){restored=true;await activate();}
    await pause(100);
  }
  throw Error('Janela do Flow permanece oculta ou sem foco; nenhum input enviado. '+JSON.stringify(last));
}
