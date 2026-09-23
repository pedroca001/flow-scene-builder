import {readFile,readdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await readFile(`${root}/package/manifest.json`));
if(manifest.manifest_version!==3)throw Error('Manifest invalido');
for(const file of await readdir(`${root}/extension`))if(file.endsWith('.js')){
  const result=spawnSync(process.execPath,['--check',`${root}/extension/${file}`],{encoding:'utf8'});if(result.status)throw Error(result.stderr);
}
for(const file of ['dashboard.html','background.js','vendor/ffmpeg/worker.js','vendor/core/ffmpeg-core.wasm'])if(!(await stat(`${root}/package/${file}`)).size)throw Error(`Arquivo vazio: ${file}`);
console.log('Manifest, JavaScript e pacote FFmpeg verificados.');
