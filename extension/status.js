async function refresh(){
  const {executor:s,executorJobs:jobs=[],executorParallelLimit:limit=10}=await chrome.storage.local.get(['executor','executorJobs','executorParallelLimit']);
  const names={idle:'Aguardando imagens do Codex',starting:'Preparando projeto e primeira cena',running:'Produzindo cenas',rendering:'Montando vídeo',complete:'Concluído',paused:'Precisa de atenção'};
  const active=jobs.filter(j=>['running','rendering'].includes(j.status));
  const starting=jobs.filter(j=>j.status==='starting');
  document.getElementById('state').textContent=active.length||starting.length?`${active.length} em produção · ${starting.length} em preparação (limite ${limit})`:names[s?.status]||'Aguardando conexão local';
  document.getElementById('detail').textContent=jobs.map(j=>`${names[j.status]||j.status}${j.scene?` · Cena ${j.scene}`:''} · ${j.folder}${j.error?`\nUltima ocorrencia registrada: ${j.error}`:''}`).join('\n');
  document.getElementById('detail').style.whiteSpace='pre-line';
  document.getElementById('error').textContent=jobs.filter(j=>j.error&&j.status==='paused').map(j=>`${j.folder}: ${j.error}`).join('\n')||s?.error||'';
}
document.getElementById('refresh').onclick=()=>{chrome.runtime.sendMessage({type:'tick'}).catch(()=>{});refresh();};
chrome.storage.onChanged.addListener(refresh);
refresh();
chrome.runtime.sendMessage({type:'tick'}).catch(()=>{});
setInterval(()=>{chrome.runtime.sendMessage({type:'tick'}).catch(()=>{});refresh();},2000);
