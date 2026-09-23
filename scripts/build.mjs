import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
await mkdir(`${root}/package`,{recursive:true});
await cp(`${root}/extension`,`${root}/package`,{recursive:true});
await cp(`${root}/presets/ugc_ingredientes.json`,`${root}/package/preset.json`);
await mkdir(`${root}/package/vendor/ffmpeg`,{recursive:true});
await cp(`${root}/node_modules/@ffmpeg/ffmpeg/dist/esm`,`${root}/package/vendor/ffmpeg`,{recursive:true});
await cp(`${root}/node_modules/@ffmpeg/core/dist/esm`,`${root}/package/vendor/core`,{recursive:true});
for (const [name,pkg] of [['ffmpeg','@ffmpeg/ffmpeg'],['core','@ffmpeg/core']]){
  try{await cp(`${root}/node_modules/${pkg}/LICENSE`,`${root}/package/vendor/${name}/LICENSE`);}catch{}
}
console.log('Extensao pronta em package/. Carregue essa pasta no Chrome.');

const hash=createHash('sha256');
for(const file of (await readdir(`${root}/extension`)).sort())hash.update(await readFile(`${root}/extension/${file}`));
const build=hash.digest('hex').slice(0,16);
await writeFile(`${root}/package/build_id.js`,`export const BUILD_ID = ${JSON.stringify(build)};\n`);
await writeFile(`${root}/package/build_id.json`,JSON.stringify({build}));
