import { FFmpeg } from './vendor/ffmpeg/index.js';
export class MediaEngine {
  constructor(status=()=>{}) {this.ff=new FFmpeg();this.status=status;this.loaded=false;}
  async load(){if(this.loaded)return;this.status('Preparando renderizador local...');await this.ff.load({coreURL:new URL('./vendor/core/ffmpeg-core.js',import.meta.url).href,wasmURL:new URL('./vendor/core/ffmpeg-core.wasm',import.meta.url).href});this.loaded=true;}
  async exec(args){const code=await this.ff.exec(['-hide_banner','-y',...args]);if(code!==0)throw Error(`Renderizacao local falhou (FFmpeg ${code}). Os videos continuam salvos.`);}
  async put(name,blob){await this.ff.writeFile(name,new Uint8Array(await blob.arrayBuffer()));}
  async blob(name,type){const bytes=await this.ff.readFile(name);return new Blob([bytes],{type});}
  async clean(names){for(const name of names)await this.ff.deleteFile(name).catch(()=>{});}
  async inspect(name){
    const logs=[];const listener=({message})=>logs.push(message);
    this.ff.on('log',listener);
    try {await this.ff.exec(['-hide_banner','-i',name]);} finally {this.ff.off('log',listener);}
    const text=logs.join('\n');const duration=text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    const line=logs.find(l=>l.includes('Video:'))||'';const size=line.match(/\b(\d{2,5})x(\d{2,5})\b/);
    if(!duration||!size)throw Error('Nao foi possivel ler os metadados do video.');
    const streams=[{codec_type:'video',width:Number(size[1]),height:Number(size[2])}];
    if(text.includes('Audio:'))streams.push({codec_type:'audio',codec_name:'aac'});
    return {streams,format:{duration:Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3])}};
  }
  async lastFrame(video){
    await this.load();await this.put('input.mp4',video);
    try {
      const info=await this.inspect('input.mp4');const stream=info.streams.find(s=>s.codec_type==='video');
      if(!stream)throw Error('Arquivo nao contem video.');
      this.status('Extraindo o ultimo frame da cena...');
      // Decode the tail, reverse frame order, emit the actual final decoded frame.
      await this.exec(['-sseof','-0.5','-i','input.mp4','-map','0:v:0','-vf','reverse','-frames:v','1','-update','1','last.png']);
      return await this.blob('last.png','image/png');
    } finally {await this.clean(['input.mp4','last.png','probe.json']);}
  }
  async concat(videos){
    await this.load();const files=[];let expectedDuration=0;
    try {
      for(let i=0;i<videos.length;i++){
        this.status(`Preparando cena ${i+1}/${videos.length} para o MP4...`);
        await this.put('input.mp4',videos[i]);const info=await this.inspect('input.mp4');
        const duration=Number(info.format.duration);if(!Number.isFinite(duration)||duration<=0)throw Error('Duracao de cena invalida.');
        expectedDuration+=duration;
        const hasAudio=info.streams.some(s=>s.codec_type==='audio');const output=`part_${i}.mp4`;files.push(output);
        await this.exec(['-i','input.mp4',...(!hasAudio?['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']:[]),
          '-map','0:v:0','-map',hasAudio?'0:a:0':'1:a:0',
          '-vf','scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=24',
          '-c:v','libx264','-preset','ultrafast','-crf','20','-pix_fmt','yuv420p',
          '-c:a','aac','-b:a','128k','-ar','48000','-ac','2','-af','apad','-t',String(duration),'-movflags','+faststart',output]);
        await this.clean(['input.mp4','probe.json']);
      }
      this.status('Juntando todas as cenas no MP4 final...');
      await this.ff.writeFile('concat.txt',new TextEncoder().encode(files.map(f=>`file '${f}'`).join('\n')));
      await this.exec(['-f','concat','-safe','0','-i','concat.txt','-c','copy','-movflags','+faststart','final.mp4']);
      const metadata=await this.inspect('final.mp4');const actual=Number(metadata.format.duration);
      if(Math.abs(actual-expectedDuration)>Math.max(1,videos.length*0.12))throw Error('A duracao final nao corresponde a soma das cenas.');
      return {blob:await this.blob('final.mp4','video/mp4'),duration:actual};
    } finally {await this.clean([...files,'input.mp4','probe.json','concat.txt','final.mp4']);}
  }
  dispose(){this.ff.terminate();this.loaded=false;}
}
