#!/usr/bin/env python3
"""Local media/state companion. Generation is performed by Codex in the Flow UI."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from settings import flow_home

ROOT = Path(__file__).resolve().parent
DEFAULT_PROJECT = None
DEFAULT_HOME = flow_home()

def now(): return datetime.now(timezone.utc).isoformat()
def slug(text):
    text=unicodedata.normalize('NFKD', text).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','_',text).strip('_')[:70] or 'cenario'
def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for data in iter(lambda:f.read(1048576),b''):h.update(data)
    return h.hexdigest()
def ffmpeg():
    override=os.environ.get('FLOW_FFMPEG')
    if override:return override
    installed=shutil.which('ffmpeg')
    if installed:return installed
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError as e:raise RuntimeError('Instale requirements.txt no ambiente local da ferramenta.') from e

def run_ff(args, timeout=600):
    p=subprocess.run([ffmpeg(),'-hide_banner','-nostdin','-y',*map(str,args)],capture_output=True,text=True,timeout=timeout)
    if p.returncode:raise RuntimeError('FFmpeg falhou: '+p.stderr[-2000:])
    return p

def probe(path):
    p=subprocess.run([ffmpeg(),'-hide_banner','-i',str(path)],capture_output=True,text=True)
    s=p.stderr
    m=re.search(r'Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)',s)
    video=next((line for line in s.splitlines() if 'Video:' in line),'')
    size=re.search(r'\b(\d{2,5})x(\d{2,5})\b',video)
    rate=re.search(r'(\d+(?:\.\d+)?) fps',video)
    if not m or not size:raise RuntimeError('Video invalido ou sem duracao legivel: '+Path(path).name)
    return {'duration':int(m[1])*3600+int(m[2])*60+float(m[3]),'width':int(size[1]),'height':int(size[2]),
            'fps':float(rate[1]) if rate else None,'audio':'Audio:' in s}

def work_dir(folder):
    root=Path(os.environ.get('FLOW_WORK_ROOT',str(Path.home()/'.local/share/flow_scene_builder/jobs')))
    folder=Path(folder).expanduser().resolve()
    return root/(folder.name+'_'+hashlib.sha256(str(folder).encode()).hexdigest()[:12])

def write_state(folder, state):
    state['updated']=now()
    work=work_dir(folder);work.mkdir(parents=True,exist_ok=True)
    temp=work/'execucao.json.part'
    temp.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    temp.replace(work/'execucao.json')

def read_state(folder):
    folder=Path(folder).expanduser().resolve()
    return folder,json.loads((work_dir(folder)/'execucao.json').read_text(encoding='utf8'))

def migrate(folder):
    folder=Path(folder).expanduser().resolve();work=work_dir(folder)
    legacy=folder/'execucao.json'
    if not legacy.exists():return {'folder':str(folder),'work':str(work)}
    state=json.loads(legacy.read_text(encoding='utf8'));work.mkdir(parents=True,exist_ok=True)
    for s in state['scenes']:
        for key in ['start_image','last_frame']:
            source=folder/s[key];target=work/source.name
            if source.exists():
                if target.exists() and digest(source)!=digest(target):raise ValueError('Conflito na migracao de frame.')
                shutil.move(str(source),str(target))
            s[key]=str(target)
    for name in ['prompts.json','LEIA_ME.txt']:
        if (folder/name).exists():shutil.move(str(folder/name),str(work/name))
    state['version']=2;write_state(folder,state)
    legacy.rename(work/'execucao_legado.json')
    return {'folder':str(folder),'work':str(work)}

def validate_preset(preset):
    prompts=preset.get('prompts')
    if not isinstance(prompts,list) or not 2<=len(prompts)<=6 or any(not isinstance(p,str) or not p.strip() for p in prompts):
        raise ValueError('Preset deve conter de 2 a 6 prompts preenchidos.')
    if preset.get('model')!='lower':raise ValueError('O fluxo Codex usa somente Lite Lower Priority.')

def prepare(image, name, preset_file=ROOT/'presets/ugc_ingredientes.json', downloads=None, project=DEFAULT_PROJECT, outputs=1):
    if outputs not in (1,3,4):raise ValueError("Use x1, x3 ou x4.")
    from PIL import Image, ImageOps
    source=Path(image).expanduser().resolve()
    preset=json.loads(Path(preset_file).read_text(encoding='utf8'));validate_preset(preset)
    if not source.is_file():raise ValueError('Imagem base nao encontrada.')
    if project is not None and not re.fullmatch(r'https://flow\.google\.com/(?:u/\d+/)?project/[A-Za-z0-9_-]+',project):raise ValueError('URL de projeto Flow invalida.')
    with Image.open(source) as im:
        normalized=ImageOps.exif_transpose(im).convert('RGB')
    base=Path(downloads).expanduser() if downloads else Path.home()/'Downloads'
    base.mkdir(parents=True,exist_ok=True)
    prefix=f'{slug(name)}_{datetime.now():%Y%m%d_%H%M%S}'
    folder=base/prefix
    for i in range(100):
        try:folder.mkdir();break
        except FileExistsError:folder=base/f'{prefix}_{i+1:02d}'
    else:raise RuntimeError('Nao foi possivel criar pasta exclusiva.')
    original='imagem_original'+source.suffix.lower();shutil.copy2(source,folder/original)
    work=work_dir(folder);work.mkdir(parents=True,exist_ok=True)
    normalized.save(work/'cena_01_inicio.png');shutil.copy2(work/'cena_01_inicio.png',work/'cena_02_inicio.png')
    (work/'prompts.json').write_text(json.dumps(preset,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    state={'version':2,'name':slug(name),'created':now(),'project':project,'model':'Veo 3.1 - Lite [Lower Priority]',
           'resolution':'720p','aspect_ratio':'9:16','duration_seconds':8,'outputs_per_prompt':outputs,'credits_per_generation':0,
           'original':original,'original_sha256':digest(folder/original),'status':'ready','scenes':[]}
    state['project_mode']='existing' if project else 'new'
    state['project_creation']={'status':'ready' if project else 'pending','home':DEFAULT_HOME}
    for i,prompt in enumerate(preset['prompts'],1):
        state['scenes'].append({'number':i,'source':'original' if i<=2 else f'last_frame_scene_{i-1:02d}',
          'start_image':str(work/f'cena_{i:02d}_inicio.png'),'video':f'cena_{i:02d}.mp4','last_frame':str(work/f'cena_{i:02d}_ultimo_frame.png'),
          'prompt':re.sub(r'1080\s*[x×]\s*1920','720x1280',prompt,flags=re.I),'status':'ready'})
    if outputs>1:
        state['evaluation']={'model':'gpt-5.6-terra','frames':20 if outputs==3 else 15,'effort':'medium' if outputs==3 else 'low'}
    write_state(folder,state);return folder

def next_scene(folder):
    folder,state=read_state(folder)
    for s in state['scenes']:
        if s['status']!='complete':
            result={**s,'evaluation':state.get('evaluation',{}),'existing_image_name':state.get('existing_image_name') if s['number']<=2 else None,'outputs_per_prompt':state.get('outputs_per_prompt',1),'folder':str(folder),'project':state['project'],'start_image_path':str(folder/s['start_image']),
                    'ready_to_submit':s['status']=='ready' and (folder/s['start_image']).exists()}
            return result
    return {'status':'ready_to_render' if state['status']!='complete' else 'complete','folder':str(folder)}

def mark_submitted(folder,number,baseline=None):
    folder,state=read_state(folder)
    if not 1<=number<=len(state['scenes']):raise ValueError('Numero da cena invalido.')
    s=state['scenes'][number-1]
    if s['number']!=number or s['status']!='ready':raise ValueError('Cena ja enviada ou concluida; consulte o Flow antes de reenviar.')
    if not (folder/s['start_image']).exists():raise ValueError('Frame inicial ainda nao existe.')
    if any(x['status']!='complete' for x in state['scenes'][:number-1]):raise ValueError('Conclua a cena anterior primeiro.')
    # Persist asset IDs only. Signed download URLs or auth values never enter manifests.
    if baseline and any(not re.fullmatch(r'[A-Za-z0-9_-]{1,160}',x) for x in baseline):raise ValueError('Use IDs de midia, nunca URLs assinadas.')
    s.update(status='submitted',submitted=now(),baseline_ids=baseline or []);state['status']='running';write_state(folder,state)

def last_frame(video,output):
    run_ff(['-sseof','-0.5','-i',video,'-map','0:v:0','-vf','reverse','-frames:v','1','-update','1',output])

def ingest(folder,number,video,media_id=None):
    folder,state=read_state(folder)
    if not 1<=number<=len(state['scenes']):raise ValueError('Numero da cena invalido.')
    s=state['scenes'][number-1];source=Path(video).expanduser().resolve()
    if media_id and not re.fullmatch(r'[A-Za-z0-9_-]{1,160}',media_id):raise ValueError('ID de midia invalido.')
    if s['status']=='complete':
        if digest(source)==s['sha256']:return s
        raise ValueError('Cena ja concluida. Nao substituir automaticamente por outro video.')
    if any(x['status']!='complete' for x in state['scenes'][:number-1]):raise ValueError('Importe as cenas na ordem.')
    metadata=probe(source)
    if abs(metadata['duration']-8)>0.6 or metadata['width']!=720 or metadata['height']!=1280:
        raise ValueError(f'Esperado 720x1280 e 8s; recebido {metadata}.')
    if media_id and any(x.get('media_id')==media_id for x in state['scenes'] if x['number']!=number):raise ValueError('Esse video ja pertence a outra cena.')
    if any(x.get('sha256')==digest(source) for x in state['scenes'] if x['number']!=number):raise ValueError('Video duplicado em cenas diferentes.')
    target=folder/s['video']
    if target.exists() and target.resolve()!=source and digest(target)!=digest(source):raise ValueError('Arquivo de cena existente difere. Nao sobrescrevi.')
    if target.resolve()!=source:
        tmp=target.with_suffix('.mp4.part');shutil.copy2(source,tmp);tmp.replace(target)
    # A failed extraction leaves the original MP4 in place for a safe retry.
    with tempfile.TemporaryDirectory(prefix='flow_frame_') as temp:
        frame=Path(temp)/'last.png';last_frame(target,frame);shutil.copy2(frame,folder/s['last_frame'])
    if 2<=number<len(state['scenes']):shutil.copy2(folder/s['last_frame'],folder/state['scenes'][number]['start_image'])
    s.update(status='complete',completed=now(),sha256=digest(target),metadata=metadata,media_id=media_id)
    s['start_sha256']=digest(folder/s['start_image']);s['last_frame_sha256']=digest(folder/s['last_frame'])
    write_state(folder,state);return s

def render(folder):
    folder,state=read_state(folder)
    if any(s['status']!='complete' for s in state['scenes']):raise ValueError('Ainda faltam cenas.')
    verify(folder,final=False)
    state['status']='rendering';write_state(folder,state)
    try:
        with tempfile.TemporaryDirectory(prefix='flow_render_') as tmp:
            tmp=Path(tmp);parts=[]
            for s in state['scenes']:
                source=folder/s['video'];part=tmp/f'part_{s["number"]:02d}.mp4';parts.append(part)
                args=['-i',source]
                if not s['metadata']['audio']:args+=['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']
                args+=['-map','0:v:0','-map','0:a:0' if s['metadata']['audio'] else '1:a:0',
                  '-vf','setsar=1,fps=24','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',
                  '-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-af','apad','-t',str(s['metadata']['duration']),'-movflags','+faststart',part]
                run_ff(args)
            listing=tmp/'concat.txt';listing.write_text('\n'.join("file '"+p.name+"'" for p in parts)+'\n')
            output=tmp/'video_completo.mp4'
            run_ff(['-f','concat','-safe','0','-i',listing,'-c','copy','-movflags','+faststart',output])
            meta=probe(output);expected=sum(s['metadata']['duration'] for s in state['scenes'])
            if abs(meta['duration']-expected)>0.6:raise RuntimeError('Duracao final diverge da soma das cenas.')
            run_ff(['-v','error','-i',output,'-f','null','-'])
            # New Flow projects receive a timestamp title. On filesystems which
            # permit it, the delivery MP4 must carry that exact title. Existing
            # jobs retain their historic technical filename.
            title=state.get('project_creation',{}).get('title')
            final_name=f'{title}.mp4' if isinstance(title,str) and re.fullmatch(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}',title) else 'video_completo.mp4'
            final=folder/final_name
            if final.exists() and state.get('final_sha256')!=digest(final):raise ValueError('MP4 final existente foi alterado. Nao sobrescrevi.')
            partial=folder/(final_name+'.part');shutil.copy2(output,partial);partial.replace(final)
            state.update(status='complete',final=final_name,final_sha256=digest(final),final_metadata=meta,finished=now())
            write_state(folder,state)
            return verify(folder)
    except Exception:
        state['status']='render_failed';write_state(folder,state);raise

def verify(folder,final=True):
    folder,state=read_state(folder);errors=[]
    if digest(folder/state['original'])!=state['original_sha256']:errors.append('Imagem original alterada.')
    for s in state['scenes']:
        if s['status']!='complete':errors.append(f"Cena {s['number']} incompleta.");continue
        for key,hash_key in [('video','sha256'),('start_image','start_sha256'),('last_frame','last_frame_sha256')]:
            p=folder/s[key]
            if not p.exists() or digest(p)!=s[hash_key]:errors.append(f"Integridade invalida: {s[key]}")
        if s['number']<=2:expected=Path(state['scenes'][0]['start_image'])
        else:expected=folder/state['scenes'][s['number']-2]['last_frame']
        if digest(folder/s['start_image'])!=digest(expected):errors.append(f"Origem incorreta da cena {s['number']}")
    if state.get('outputs_per_prompt',1)>1:
        for s in state['scenes']:
            selection=s.get('selection',{});candidates=s.get('candidates',[])
            chosen=next((c for c in candidates if c['label']==selection.get('winner')),None)
            if len(candidates)!=state['outputs_per_prompt'] or not chosen or chosen.get('status')!='complete' or chosen.get('sha256')!=s.get('sha256') or chosen.get('media_id')!=s.get('media_id'):
                errors.append(f"Selecao invalida da cena {s['number']}")
    if final:
        p=folder/state.get('final','video_completo.mp4')
        if not p.exists() or digest(p)!=state.get('final_sha256'):errors.append('MP4 final ausente ou alterado.')
    if errors:raise ValueError('\n'.join(errors))
    return {'ok':True,'folder':str(folder),'scenes':len(state['scenes']),'status':state['status'],'final':str(folder/state['final']) if final else None,'metadata':state.get('final_metadata')}

def main():
    p=argparse.ArgumentParser(description=__doc__);cmd=p.add_subparsers(dest='command',required=True)
    c=cmd.add_parser('prepare');c.add_argument('--image',required=True);c.add_argument('--name',required=True);c.add_argument('--preset',default=str(ROOT/'presets/ugc_ingredientes.json'));c.add_argument('--downloads');c.add_argument('--project',default=DEFAULT_PROJECT)
    for name in ['next','status','render','verify','migrate']:
        c=cmd.add_parser(name);c.add_argument('folder')
    c=cmd.add_parser('submitted');c.add_argument('folder');c.add_argument('--scene',type=int,required=True);c.add_argument('--baseline',nargs='*',default=[])
    c=cmd.add_parser('ingest');c.add_argument('folder');c.add_argument('--scene',type=int,required=True);c.add_argument('--video',required=True);c.add_argument('--media-id')
    cmd.add_parser('doctor');args=p.parse_args()
    try:
        if args.command=='prepare':result={'folder':str(prepare(args.image,args.name,args.preset,args.downloads,args.project))}
        elif args.command=='migrate':result=migrate(args.folder)
        elif args.command=='next':result=next_scene(args.folder)
        elif args.command=='status':result=read_state(args.folder)[1]
        elif args.command=='submitted':mark_submitted(args.folder,args.scene,args.baseline);result=next_scene(args.folder)
        elif args.command=='ingest':result=ingest(args.folder,args.scene,args.video,args.media_id)
        elif args.command=='render':result=render(args.folder)
        elif args.command=='verify':result=verify(args.folder)
        else:
            import PIL
            result={'ffmpeg':ffmpeg(),'pillow':PIL.__version__,'preset':str(ROOT/'presets/ugc_ingredientes.json')}
        print(json.dumps(result,ensure_ascii=False,indent=2))
    except Exception as e:print(json.dumps({'error':str(e)},ensure_ascii=False),file=sys.stderr);sys.exit(1)
if __name__=='__main__':main()
