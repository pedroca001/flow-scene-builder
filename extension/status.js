async function refresh(){
  const {executor:s,executorJobs:jobs=[]}=await chrome.storage.local.get(['executor','executorJobs']);
  const names={idle:'Aguardando imagens do Codex',running:'Gerando cenas',rendering:'Montando vídeo',complete:'Concluído',paused:'Precisa de atenção'};
  const active=jobs.filter(j=>['running','rendering'].includes(j.status));
  document.getElementById('state').textContent=active.length?`${active.length} trabalhos simultâneos (até 5)`:names[s?.status]||'Aguardando conexão local';
  document.getElementById('detail').textContent=jobs.map(j=>`${names[j.status]||j.status}${j.scene?` · Cena ${j.scene}`:''} · ${j.folder}`).join('\n');
  document.getElementById('detail').style.whiteSpace='pre-line';
  document.getElementById('error').textContent=jobs.filter(j=>j.error&&j.status==='paused').map(j=>`${j.folder}: ${j.error}`).join('\n')||s?.error||'';
}
document.getElementById('refresh').onclick=refresh;chrome.storage.onChanged.addListener(refresh);refresh();
