import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromeExecutable,externalRoot,prototypeRoot} from './runtime.mjs';

export function manualChromeArguments(profile,home='https://flow.google.com/'){
  if(!/^https:\/\/flow\.google\.com\/(?:u\/\d+\/)?$/.test(home))throw Error('Login manual exige a home do Flow.');
  // This is a genuine manual browser phase. No Playwright, CDP connection,
  // automation flags, fingerprint patches or credentials are used here.
  return [`--user-data-dir=${profile}`,home];
}

export async function openManualBrowser({home='https://flow.google.com/'}={}){
  const base=await externalRoot(prototypeRoot()),profile=join(base,'session_profile');await mkdir(profile,{recursive:true});
  const args=manualChromeArguments(profile,home),executable=await chromeExecutable();
  const child=spawn(executable,args,{detached:true,stdio:'ignore',windowsHide:false});
  await new Promise((ok,no)=>{child.once('spawn',ok);child.once('error',no);});child.unref();
  await writeFile(join(base,'manual_browser.json'),JSON.stringify({mode:'manual',launched_at:new Date().toISOString(),generation_enabled:false})+'\n',{mode:0o600});
  return {ok:true,stage:'manual_browser',automation_connected:false,profile_persisted:true,generation_enabled:false};
}

export async function manualBrowserStatus(){
  const base=await externalRoot(prototypeRoot());
  try{const state=JSON.parse(await readFile(join(base,'manual_browser.json'),'utf8'));return {ok:true,stage:'manual_browser',last_launch_recorded:state.mode==='manual',window_state:'not_observed',automation_connected:false,generation_enabled:false};}
  catch(e){if(e.code!=='ENOENT')throw e;return {ok:false,stage:'manual_browser_not_opened',generation_enabled:false};}
}
