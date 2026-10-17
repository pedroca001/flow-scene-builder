// Only IDs observed in the normal asset editor are cached. Scope includes
// account and exact project, so another job can reuse verified old cards.
const scopes=new Map();
export async function projectAssetCache(storage,project,account){
  const url=new URL(project);url.search='';url.hash='';
  const key='verifiedAssetIds:v1:'+account.trim().toLowerCase()+':'+url.href.replace(/\/$/,'');
  if(!scopes.has(key))scopes.set(key,(async()=>{
    const saved=(await storage.get(key))[key];
    const assetIds=new Map(Array.isArray(saved)?saved.filter(row=>Array.isArray(row)&&row.length===2&&row.every(v=>typeof v==='string'&&v)):[]);
    return {assetIds,onAssetIdentified:async()=>{
      // Optimization only: a storage failure must not repeat a real submission.
      await storage.set({[key]:[...assetIds].slice(-5000)}).catch(()=>{});
    }};
  })());
  return scopes.get(key);
}
