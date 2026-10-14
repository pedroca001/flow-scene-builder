import {createRequire} from 'node:module';
import {access, mkdir, realpath, rm, stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PLAYWRIGHT_VERSION='1.64.0';
export const prototypeRoot=()=>resolve(process.env.FLOW_PLAYWRIGHT_ROOT||join(homedir(),'.local','share','flow_scene_builder','playwright_prototype'));
export const platform=()=>process.platform==='win32'?'Win32':process.platform==='darwin'?'MacIntel':'Linux';

export async function externalRoot(path){
  const target=resolve(path);
  // Resolve existing ancestors to reject a symlink/junction back into the checkout.
  let ancestor=target, suffix=[];
  while(true){try{ancestor=await realpath(ancestor);break;}catch(e){if(e.code!=='ENOENT')throw e;const parent=dirname(ancestor);if(parent===ancestor)throw e;suffix.unshift(ancestor.slice(parent.length).replace(/^[/\\]+/,''));ancestor=parent;}}
  const actual=resolve(ancestor,...suffix),repo=await realpath(ROOT),brain=resolve(repo,'..','..','brain');
  for(const forbidden of [dirname(repo),brain]){
    const diff=relative(forbidden,actual);
    if(!diff||(!diff.startsWith('..'+sep)&&diff!=='..'&&!isAbsolute(diff)))throw Error('Runtime Playwright deve ficar fora do codigo/Brain.');
  }
  return actual;
}

export async function loadPlaywright(){
  const require=createRequire(import.meta.url);
  const candidates=[process.env.FLOW_PLAYWRIGHT_DEPS,join(prototypeRoot(),'deps'),join(homedir(),'.local','share','flow_scene_builder','test_deps')].filter(Boolean);
  for(const base of candidates){
    try{const req=createRequire(join(resolve(base),'package.json'));const lib=req('playwright');const version=req('playwright/package.json').version;return {chromium:lib.chromium,version,dependencyRoot:resolve(base)};}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
  }
  try{return {chromium:require('playwright').chromium,version:require('playwright/package.json').version,dependencyRoot:ROOT};}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
  throw Error(`Playwright ausente. Instale playwright@${PLAYWRIGHT_VERSION} no runtime externo indicado em docs/playwright_prototipo.md.`);
}

export async function chromeExecutable(){
  if(process.env.FLOW_PLAYWRIGHT_CHROME){const value=resolve(process.env.FLOW_PLAYWRIGHT_CHROME);await access(value);return value;}
  const candidates=process.platform==='win32'?[join(process.env.PROGRAMFILES||'C:/Program Files','Google/Chrome/Application/chrome.exe'),join(process.env['PROGRAMFILES(X86)']||'C:/Program Files (x86)','Google/Chrome/Application/chrome.exe'),join(process.env.LOCALAPPDATA||join(homedir(),'AppData/Local'),'Google/Chrome/Application/chrome.exe')]:process.platform==='darwin'?['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']:['/usr/bin/google-chrome','/usr/bin/google-chrome-stable'];
  for(const path of candidates){try{await access(path);return path;}catch(e){if(e.code!=='ENOENT')throw e;}}
  throw Error('Chrome nao encontrado. Configure FLOW_PLAYWRIGHT_CHROME com o executavel local.');
}

export async function launchProfile(profile,{headless=true}={}){
  const dir=await externalRoot(profile);await mkdir(dir,{recursive:true});
  const {chromium}=await loadPlaywright();
  return chromium.launchPersistentContext(dir,{executablePath:await chromeExecutable(),headless,acceptDownloads:true,viewport:{width:1100,height:850},args:['--disable-extensions']});
}

export async function removeOwnDirectory(path,parent){
  const base=await realpath(parent),target=await realpath(path),diff=relative(base,target);
  if(!diff||diff==='..'||diff.startsWith('..'+sep)||isAbsolute(diff))throw Error('Limpeza fora do runtime proprio rejeitada.');
  const info=await stat(target);if(!info.isDirectory())throw Error('Limpeza exige diretorio proprio.');
  await rm(target,{recursive:true,force:true});
}

export async function doctor(){
  const dependency=await loadPlaywright();
  return {ok:true,stage:'prototype',playwright:dependency.version,chrome:await chromeExecutable(),runtime:await externalRoot(prototypeRoot()),extension_required:false,native_messaging_required:false,live_generation_enabled:false};
}
