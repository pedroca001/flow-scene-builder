const dbPromise = new Promise((resolve,reject) => {
  const req = indexedDB.open('flow_scene_builder', 1);
  req.onupgradeneeded = () => { req.result.createObjectStore('runs', {keyPath:'id'}); req.result.createObjectStore('assets'); };
  req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
});
async function request(store, mode, action) {
  const db = await dbPromise;
  return new Promise((resolve,reject) => {
    const tx = db.transaction(store, mode); const req = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export const saveRun = run => request('runs','readwrite',s=>s.put(run));
export const loadRun = id => request('runs','readonly',s=>s.get(id));
export const listRuns = () => request('runs','readonly',s=>s.getAll());
export const saveAsset = (key,blob) => request('assets','readwrite',s=>s.put(blob,key));
export const loadAsset = key => request('assets','readonly',s=>s.get(key));
export async function deleteRun(id) {
  const db = await dbPromise;
  await new Promise((resolve,reject) => {
    const tx = db.transaction(['runs','assets'],'readwrite');
    tx.objectStore('runs').delete(id);
    tx.objectStore('assets').delete(IDBKeyRange.bound(`${id}/`, `${id}/\uffff`));
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}
export async function asDataUrl(blob) {
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return `data:${blob.type||'application/octet-stream'};base64,${btoa(binary)}`;
}
