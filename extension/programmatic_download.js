// Download only the media URL exposed by the currently pinned Flow asset.
// saveAs:false applies to this request, leaving personal Chrome preferences alone.
export async function downloadMedia(api,{url,assetId},wait=ms=>new Promise(r=>setTimeout(r,ms))){
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(assetId)||!['https:','blob:'].includes(new URL(url).protocol))throw Error('Fonte de video invalida.');
  const key='programmaticMedia:'+assetId;
  const saved=(await api.storage.local.get(key))[key];let item=saved? (await api.downloads.search({id:saved.id}))[0]:null;
  if(item?.state==='interrupted')item=null;
  if(item?.exists===false)item=null;
  if(!item){
    const filename=`flow_scene_builder_downloads/${assetId}_${Date.now()}.mp4`;
    const id=await api.downloads.download({url,filename,saveAs:false,conflictAction:'uniquify'});
    await api.storage.local.set({[key]:{id,assetId,filename}});item={id};
  }
  for(let attempt=0;attempt<240;attempt++){
    const current=(await api.downloads.search({id:item.id}))[0];
    if(!current)throw Error('Download programatico desapareceu.');
    if(current.state==='interrupted')throw Error('Download programatico interrompido: '+current.error);
    if(current.state==='complete'){
      if(current.danger&&current.danger!=='safe')throw Error('Download requer revisao de seguranca do Chrome.');
      return {download_id:current.id,path:current.filename,media_id:assetId,method:'chrome.downloads.saveAsFalse'};
    }
    await wait(500);
  }
  throw Error('Download programatico ainda pendente; retomar o mesmo ID.');
}
