import {createRequire} from 'node:module';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const root=path.resolve(import.meta.dirname,'..');const profile=await mkdtemp(path.join(tmpdir(),'flow_scene_builder_test_'));
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}/package`,`--load-extension=${root}/package`]});
try{
  let [sw]=context.serviceWorkers();if(!sw)sw=await context.waitForEvent('serviceworker');
  const id=new URL(sw.url()).host;const page=await context.newPage();await page.goto(`chrome-extension://${id}/dashboard.html`);
  page.on('pageerror',e=>console.error('PAGE ERROR',e.message));
  await page.screenshot({path:path.join(profile,'dashboard.png'),fullPage:true});
  console.log('DASHBOARD',path.join(profile,'dashboard.png'));
  const result=await page.evaluate(async()=>{
    const {MediaEngine}=await import('./media.js');const e=new MediaEngine();await e.load();
    // Two tiny videos with visibly different colors; one has audio, the other has none.
    await e.exec(['-f','lavfi','-i','color=c=red:s=180x320:r=24:d=0.5','-f','lavfi','-i','sine=frequency=440:duration=0.5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest','test_a.mp4']);
    await e.exec(['-f','lavfi','-i','color=c=blue:s=180x320:r=24:d=0.5','-c:v','libx264','-pix_fmt','yuv420p','test_b.mp4']);
    const a=await e.blob('test_a.mp4','video/mp4'),b=await e.blob('test_b.mp4','video/mp4');
    const frame=await e.lastFrame(b);const bmp=await createImageBitmap(frame);const c=new OffscreenCanvas(bmp.width,bmp.height);const ctx=c.getContext('2d');ctx.drawImage(bmp,0,0);const pixel=[...ctx.getImageData(20,20,1,1).data];bmp.close();
    if(pixel[2]<200 || pixel[0]>40)throw Error('O ultimo frame nao e azul.');
    const joined=await e.concat([a,b]);await e.put('verify.mp4',joined.blob);const meta=await e.inspect('verify.mp4');
    const v=meta.streams.find(s=>s.codec_type==='video'),audio=meta.streams.find(s=>s.codec_type==='audio');
    if(v.width!==720||v.height!==1280||!audio||joined.duration<0.9||joined.duration>1.3)throw Error('Saida MP4 invalida.');
    const first=await e.lastFrame(joined.blob); // Final frame must still be the second (blue) scene.
    const last=await createImageBitmap(first);const cc=new OffscreenCanvas(last.width,last.height);const cx=cc.getContext('2d');cx.drawImage(last,0,0);const p=[...cx.getImageData(20,20,1,1).data];
    if(p[2]<200||p[0]>40)throw Error('Ordem da concatenacao incorreta.');
    e.dispose();return {frameBytes:frame.size,framePixel:pixel,outputBytes:joined.blob.size,duration:joined.duration,width:v.width,height:v.height,audio:audio.codec_name};
  });
  console.log(JSON.stringify(result,null,2));
}finally{await context.close();}
