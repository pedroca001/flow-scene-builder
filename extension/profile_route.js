export async function profileRoute(api,routes){
  const tabs=await api.tabs.query({url:['https://flow.google.com/*']});
  const matches=routes.map(route=>({route,tab:tabs.find(tab=>{
    try{const u=new URL(tab.url);u.search='';u.hash='';return u.href===route.project||u.href.startsWith(route.project+'/');}catch{return false;}
  })})).filter(match=>match.tab);
  if(matches.length>1)throw Error('Dois projetos de filas diferentes abertos no mesmo perfil; preserve um projeto de producao por perfil.');
  const saved=(await api.storage.local.get('nativeProfileRoute')).nativeProfileRoute;
  const previous=routes.find(route=>route.id===saved);
  // A profile explicitly retired from production cannot silently adopt the
  // remaining queue, even if its user later opens the current project there.
  if(saved&&!previous)return null;
  if(previous&&matches.length&&matches[0].route.id!==previous.id)throw Error('Projeto aberto difere da fila vinculada a este perfil.');
  const selected=matches[0]||(previous?{route:previous,tab:null}:null);
  if(!selected)return null;
  await api.storage.local.set({nativeProfileRoute:selected.route.id});
  return {...selected.route,tab:selected.tab};
}
