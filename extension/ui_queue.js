// Serialize complete focus-sensitive UI transactions, not generation waits.
let tail=Promise.resolve();
export function withUi(action){
  const task=tail.catch(()=>{}).then(action);
  tail=task.catch(()=>{});
  return task;
}
