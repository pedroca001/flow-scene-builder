#!/usr/bin/env python3
"""Native Messaging bridge: local job queue, no generation API or browser credentials."""
import argparse, base64, json, os, struct, sys, tempfile, time, shutil, threading, fcntl
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
import flow_scene_builder as pipeline
from settings import read_settings
APP=Path(os.environ.get('FLOW_APP_ROOT',str(Path.home()/'.local/share/flow_scene_builder')))
QUEUE=APP/'queue.json'

# Up to ten separate projects share one native host.
# UI transactions remain serialized in the extension; only independent waits,
# generation, download and evaluation occupy these slots concurrently.
MAX_PARALLEL=10
_queue_thread_lock=threading.RLock()
_job_locks={}
_job_locks_guard=threading.Lock()
_project_binding_lock=threading.Lock()
@contextmanager
def queue_lock():
    APP.mkdir(parents=True,exist_ok=True)
    with _queue_thread_lock, (APP/'queue.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        try:yield
        finally:fcntl.flock(lock,fcntl.LOCK_UN)
def job_lock(folder):
    with _job_locks_guard:return _job_locks.setdefault(str(Path(folder).resolve()),threading.RLock())
def atomic(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    fd,name=tempfile.mkstemp(prefix=path.name+'.',suffix='.part',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as out:json.dump(value,out,ensure_ascii=False,indent=2)
        os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)
def queue():return json.loads(QUEUE.read_text()) if QUEUE.exists() else []
def status():
    result=[]
    for row in queue():
        item=dict(row)
        try:
            _,state=pipeline.read_state(row['folder'])
            item['scenes']=[{'number':s['number'],'status':s['status'],'candidates_complete':sum(c.get('status')=='complete' for c in s.get('candidates',[])),'winner':s.get('selection',{}).get('winner')} for s in state['scenes']]
            item['outputs_per_prompt']=state.get('outputs_per_prompt',1)
            item['project']=state.get('project');item['project_title']=state.get('project_creation',{}).get('title')
            item['output']=str(Path(row['folder'])/state['final']) if state.get('final') else None
        except (OSError,ValueError) as e:item['error']=str(e)
        result.append(item)
    return result
def job_status(folder):
    folder=Path(folder).expanduser().resolve()
    row=next((r for r in status() if r['folder']==str(folder)),None)
    if not row:raise ValueError('Pasta nao esta na fila. Nao criar outra execucao para retomar.')
    row['queued_at']=row.pop('queued',None)
    row['queue_age_seconds']=round(time.time()-row['queued_at']) if row['queued_at'] else None
    scenes=row.pop('scenes',[])
    row['completed']=sum(s['status']=='complete' for s in scenes);row['total']=len(scenes)
    current=next((s for s in scenes if s['status']!='complete'),None)
    row['scene']=current['number'] if current else None
    row['scene_status']=current['status'] if current else None
    row['candidates_complete']=current.get('candidates_complete',0) if current else 0
    row['winners']=[{'scene':s['number'],'winner':s['winner']} for s in scenes if s.get('winner')]
    row['next_action']='verify' if row['state']=='complete' else 'diagnose' if row['state']=='paused' else 'wait'
    return row
def watch(folder,timeout=55):
    if not 0<=timeout<=55:raise ValueError('Timeout deve estar entre 0 e 55 segundos.')
    first=job_status(folder);end=time.monotonic()+timeout
    meaningful=lambda row:tuple(row.get(k) for k in ['state','completed','scene','scene_status','candidates_complete','error','output'])
    while first['state'] not in ['complete','paused'] and time.monotonic()<end:
        time.sleep(min(2,max(0,end-time.monotonic())))
        current=job_status(folder)
        if meaningful(current)!=meaningful(first):return current
    return job_status(folder)
def watch_batch(folders,timeout=55):
    if not 0<=timeout<=55:raise ValueError('Timeout deve estar entre 0 e 55 segundos.')
    if not folders:raise ValueError('Informe as pastas do lote.')
    snapshot=lambda:[job_status(folder) for folder in folders]
    meaningful=lambda rows:[tuple(row.get(k) for k in ['state','completed','scene','scene_status','candidates_complete','error','output']) for row in rows]
    first=snapshot();end=time.monotonic()+timeout
    while any(row['state'] not in ['complete','paused'] for row in first) and time.monotonic()<end:
        time.sleep(min(2,max(0,end-time.monotonic())))
        current=snapshot()
        if meaningful(current)!=meaningful(first):return {'jobs':current}
    return {'jobs':snapshot()}
def doctor():
    extension=Path(__file__).parent/'package'
    host=Path.home()/'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.pedro.flow_scene_builder.json'
    connection=APP/'connection.json'
    recent=json.loads(connection.read_text()) if connection.exists() else None
    return {'python':sys.executable,'ffmpeg':pipeline.ffmpeg(),'package_exists':(extension/'manifest.json').exists(),
            'host_registered':host.exists(),'extension_connection':recent,
            'connection_age_seconds':round(time.time()-recent['time']) if recent else None,
            'flow_home':pipeline.DEFAULT_HOME}
def enqueue(folder):
    folder,state=pipeline.read_state(folder)
    if state['status']=='complete':raise ValueError('Execucao ja concluida.')
    key=str(folder)
    with queue_lock():
        rows=queue()
        if not any(r['folder']==key and r['state'] in ['queued','running'] for r in rows):
            rows=[r for r in rows if r['folder']!=key];rows.append({'folder':key,'state':'queued','queued':time.time()});atomic(QUEUE,rows)
    return {'folder':key,'queued':key,'state':'queued','next_action':'wait'}
def start(image,name=None,project=None,outputs=3,existing_image_name=None,output_root=None):
    # Serialize CLI starts as well as native queue mutations, across processes.
    APP.mkdir(parents=True,exist_ok=True)
    with (APP/'start.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        return _start(image,name,project,outputs,existing_image_name,output_root)
def _start(image,name,project,outputs,existing_image_name,output_root):
    source=Path(image).expanduser().resolve()
    if not source.is_file():raise ValueError('Imagem base nao encontrada.')
    name=name or source.stem
    if existing_image_name and not project:raise ValueError('Imagem existente exige projeto explicitamente indicado.')
    if outputs not in (1,3,4):raise ValueError('Use x1, x3 ou x4.')
    if outputs>1:
        from candidate_selection import evaluator_preflight
        evaluator_preflight()
    checksum=pipeline.digest(source)
    for row in reversed(queue()):
        if row['state']=='complete':continue
        try:folder,state=pipeline.read_state(row['folder'])
        except (OSError,ValueError):continue
        if state['name']==pipeline.slug(name) and ((project is None and state.get('project_mode')=='new') or (project is not None and state['project']==project)) and state['original_sha256']==checksum and state.get('outputs_per_prompt',1)==outputs and (output_root is None or folder.parent==Path(output_root).expanduser().resolve()):
            return {'folder':str(folder),'queued':str(folder),'reused':True,'state':row['state'],'next_action':'diagnose' if row['state']=='paused' else 'wait'}
    folder=pipeline.prepare(source,name,project=project,outputs=outputs,downloads=output_root)
    if existing_image_name:
        _,state=pipeline.read_state(folder);state['existing_image_name']=existing_image_name;pipeline.write_state(folder,state)
    return enqueue(folder)
def bind_result(folder,asset_id):
    import re
    if not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',asset_id):raise ValueError('Use somente UUID da pagina /edit/ do asset confirmado.')
    folder,state=pipeline.read_state(folder)
    row=next((r for r in queue() if r['folder']==str(folder)),None)
    if not row or row['state']!='paused':raise ValueError('Pause a execucao antes de vincular um resultado.')
    scene=next((s for s in state['scenes'] if s['status']!='complete'),None)
    if not scene or scene['status']!='submitted':raise ValueError('Vinculo permitido somente para cena ja enviada.')
    if any(s.get('media_id')==asset_id for s in state['scenes']):raise ValueError('Asset ja usado nesta execucao.')
    scene['result_asset_id']=asset_id;pipeline.write_state(folder,state)
    return {'folder':str(folder),'scene':scene['number'],'result_asset_id':asset_id,'next_action':'enqueue'}
def update(folder,**values):
    with queue_lock():
        rows=queue()
        for row in rows:
            if row['folder']==str(folder):row.update(**values)
        atomic(QUEUE,rows)

def start_batch(images,output_root=None):
    paths=[Path(v).expanduser().resolve() for v in images]
    if not paths or len(set(paths))!=len(paths):raise ValueError('Informe imagens diferentes, sem duplicatas.')
    from PIL import Image
    for path in paths:
        with Image.open(path) as image:image.verify()
    return {'max_parallel':MAX_PARALLEL,'jobs':[start(str(path),output_root=output_root) for path in paths]}

def dispatch(m):
    if m.get('folder'):
        with job_lock(m['folder']):
            if m.get('op')=='project_bound':
                with _project_binding_lock:return _dispatch(m)
            return _dispatch(m)
    return _dispatch(m)

def _dispatch(m):
    op=m.get('op')
    if op=='hello':
        expected=json.loads((Path(__file__).parent/'package/build_id.json').read_text())['build']
        atomic(APP/'connection.json',{'time':time.time(),'build':m.get('build'),'expected':expected,'current':m.get('build')==expected})
        return {'reload':m.get('build')!=expected}
    if op=='claim':
        # Active folders belong to this single native-host session. Running jobs not
        # in that set are resumable after a service-worker restart.
        exclude=set(m.get('exclude',[]))
        if len(exclude)>=MAX_PARALLEL:return None
        with queue_lock():
            rows=queue()
            busy_projects=set()
            for active in rows:
                if active['folder'] in exclude:
                    _,active_state=pipeline.read_state(active['folder'])
                    if active_state.get('project'):busy_projects.add(active_state['project'])
            row=None
            for candidate in rows:
                if candidate['state'] not in ['queued','running'] or candidate['folder'] in exclude:continue
                candidate_folder,candidate_state=pipeline.read_state(candidate['folder'])
                if candidate_state.get('project') in busy_projects:continue
                row=candidate;folder,state=candidate_folder,candidate_state;break
            if not row:return None
            row.update(state='running',error='');atomic(QUEUE,rows)
        return {'folder':str(folder),'project':state['project'],'project_mode':state.get('project_mode','existing'),'project_creation':state.get('project_creation',{'status':'ready'}),'max_parallel':MAX_PARALLEL}
    folder=Path(m['folder']).resolve()
    if not any(r['folder']==str(folder) and r['state']=='running' for r in queue()):raise ValueError('Job nao autorizado na fila local.')
    _,state=pipeline.read_state(folder)
    if op=='project_intent':
        creation=state.get('project_creation',{})
        if state.get('project_mode')!='new' or creation.get('status')!='pending':raise ValueError('Criacao ja iniciada. Recuperar aba existente, sem novo clique.')
        creation.update(status='creating',title=datetime.now(ZoneInfo('America/Sao_Paulo')).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],tab_id=int(m['tab_id']))
        state['project_creation']=creation;pipeline.write_state(folder,state);return creation
    if op=='project_bound':
        import re
        url=m.get('project','');creation=state.get('project_creation',{})
        if state.get('project_mode')!='new' or creation.get('status') not in ['creating','created','ready']:raise ValueError('Sem intencao de novo projeto.')
        if int(m['tab_id'])!=creation.get('tab_id'):raise ValueError('Aba nao pertence a criacao.')
        home=creation.get('home',pipeline.DEFAULT_HOME)
        if not re.fullmatch(re.escape(home)+r'project/[a-f0-9-]{36}',url):raise ValueError('Projeto criado invalido para a conta configurada.')
        if state.get('project') and state['project']!=url:raise ValueError('Projeto ja vinculado; nao substituir.')
        for row in queue():
            if row['folder']==str(folder):continue
            try:_,other=pipeline.read_state(row['folder'])
            except (OSError,ValueError):continue
            if other.get('project')==url:raise ValueError('Projeto ja pertence a outro trabalho.')
        state['project']=url;creation['status']='created';pipeline.write_state(folder,state);return True
    if op=='project_ready':
        creation=state.get('project_creation',{})
        if not state.get('project') or m.get('title')!=creation.get('title'):raise ValueError('Nome do projeto nao confirmado.')
        creation['status']='ready';pipeline.write_state(folder,state);return True
    if op=='progress':update(folder,phase=str(m.get('phase',''))[:200]);return True
    if op=='next':
        if state.get('project_mode')=='new' and state.get('project_creation',{}).get('status')!='ready':raise ValueError('Criar e nomear o projeto antes de gerar.')
        result=pipeline.next_scene(folder)
        if result.get('ready_to_submit'):
            name=f"fsb_{folder.name}_{'original' if result['number']<=2 else 'frame_'+str(result['number'])}.png"
            upload=pipeline.work_dir(folder)/name
            if not upload.exists():shutil.copy2(result['start_image_path'],upload)
            result['browser_frame_path']=str(upload)
        return result
    if op in ['batch_results','candidate_chunk','candidate_ingest','select_candidate']:
        from candidate_selection import dispatch as candidate_dispatch
        return candidate_dispatch(m,state,folder,lambda phase:update(folder,phase=phase))
    if op=='frame':
        scene=pipeline.next_scene(folder)
        if not scene.get('ready_to_submit'):raise ValueError('Cena nao esta pronta para upload.')
        path=Path(scene['start_image_path']);offset=int(m.get('offset',0))
        if offset<0 or offset>path.stat().st_size:raise ValueError('Offset invalido.')
        with path.open('rb') as f:f.seek(offset);chunk=f.read(262144)
        return {'data':base64.b64encode(chunk).decode(),'size':path.stat().st_size,'offset':offset,'name':path.name}
    if op=='submitted':
        pipeline.mark_submitted(folder,int(m['scene']),m.get('baseline',[]))
        _,state=pipeline.read_state(folder)
        state['scenes'][int(m['scene'])-1]['failure_baseline']=m.get('failures',[])
        pipeline.write_state(folder,state);return True
    if op=='retry_audio':
        import re
        scene=next((s for s in state['scenes'] if s['status']!='complete'),None)
        key=m.get('failure_key','')
        if not scene or scene['number']!=m.get('scene') or scene['status']!='submitted' or scene.get('result_asset_id'):raise ValueError('Cena nao permite repetir falha de audio.')
        if not re.fullmatch(r'[a-f0-9]{64}',key) or key in scene.get('failure_baseline',[]):raise ValueError('Falha nao pertence ao novo envio.')
        attempts=scene.setdefault('audio_retry_intents',[])
        if len(attempts)>=2:raise ValueError('Flow falhou no audio apos duas repeticoes. Execucao preservada para manutencao.')
        attempts.append({'failure_key':key,'time':time.time()});pipeline.write_state(folder,state)
        update(folder,phase=f"Cena {scene['number']}: repeticao de audio {len(attempts)}/2")
        return True
    if op=='result':
        import re
        scene=next((s for s in state['scenes'] if s['status']!='complete'),None)
        asset_id=m.get('media_id','')
        if not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',asset_id):raise ValueError('ID permanente invalido.')
        if not scene or scene['number']!=m.get('scene') or scene['status']!='submitted':raise ValueError('Cena nao aguarda resultado.')
        if scene.get('result_asset_id',asset_id)!=asset_id:raise ValueError('Resultado ja vinculado a outro asset.')
        if asset_id in scene.get('baseline_ids',[]) or any(s.get('media_id')==asset_id for s in state['scenes']):raise ValueError('Asset anterior nao pode ser um resultado novo.')
        scene['result_asset_id']=asset_id;pipeline.write_state(folder,state);return True
    if op in ['chunk','ingest']:
        scene=pipeline.next_scene(folder)
        if scene.get('number')!=m.get('scene') or scene.get('status')!='submitted':raise ValueError('Cena nao aguarda resultado.')
        path=pipeline.work_dir(folder)/f"download_{scene['number']:02d}.mp4"
        if op=='chunk':
            data=base64.b64decode(m['data'],validate=True);offset=int(m['offset'])
            if len(data)>262144 or offset<0:raise ValueError('Bloco invalido.')
            if offset==0:mode='wb'
            elif path.exists() and path.stat().st_size==offset:mode='ab'
            else:raise ValueError('Bloco fora de ordem.')
            with path.open(mode) as f:f.write(data)
            return path.stat().st_size
        result=pipeline.ingest(folder,scene['number'],path,m['media_id'])
        return {'number':result['number'],'status':result['status'],'metadata':result['metadata']}
    if op=='render':
        result=pipeline.render(folder);update(folder,state='complete',finished=time.time());return result
    if op=='pause':update(folder,state='paused',error=str(m.get('error',''))[:1000]);return True
    raise ValueError('Comando invalido.')

def serve():
    # Only one installed profile may run the queue at a time. Port lifetime holds the lease.
    import fcntl
    APP.mkdir(parents=True,exist_ok=True)
    lease=(APP/'executor.lock').open('w')
    try:fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:return
    output_lock=threading.Lock()
    def handle(raw):
        m={}
        try:
            m=json.loads(raw);reply={'id':m.get('id'),'ok':True,'result':dispatch(m)}
        except Exception as e:reply={'id':m.get('id'),'ok':False,'error':str(e)}
        data=json.dumps(reply,ensure_ascii=False).encode()
        with output_lock:
            sys.stdout.buffer.write(struct.pack('<I',len(data))+data);sys.stdout.buffer.flush()
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL+3) as pool:
        while True:
            head=sys.stdin.buffer.read(4)
            if not head:return
            size=struct.unpack('<I',head)[0]
            if size>1048576:raise ValueError('Mensagem excede limite.')
            raw=sys.stdin.buffer.read(size)
            if len(raw)!=size:return
            pool.submit(handle,raw)

def install(extension_id):
    if len(extension_id)!=32 or any(c not in 'abcdefghijklmnop' for c in extension_id):raise ValueError('ID de extensao invalido.')
    launcher=APP/'native_host';APP.mkdir(parents=True,exist_ok=True)
    import shlex
    config=read_settings()
    bins=[str(Path(config[key]).parent) for key in ['node_path','codex_path'] if config.get(key)]
    prefix='export PATH='+shlex.quote(':'.join(dict.fromkeys(bins)))+':"$PATH"\n' if bins else ''
    launcher.write_text('#!/bin/sh\n'+prefix+'exec '+shlex.quote(sys.executable)+' '+shlex.quote(str(Path(__file__).resolve()))+' serve\n');launcher.chmod(0o700)
    target=Path.home()/'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.pedro.flow_scene_builder.json'
    atomic(target,{'name':'com.pedro.flow_scene_builder','description':'Local Flow scene queue and rendering','path':str(launcher),'type':'stdio','allowed_origins':[f'chrome-extension://{extension_id}/']})
    return {'native_host':str(target),'extension_id':extension_id}

if __name__=='__main__':
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='cmd',required=True)
    sub.add_parser('serve');sub.add_parser('doctor')
    a=sub.add_parser('status');a.add_argument('--folder')
    a=sub.add_parser('selection-report');a.add_argument('folder')
    a=sub.add_parser('watch');a.add_argument('folder');a.add_argument('--timeout',type=int,default=55)
    a=sub.add_parser('enqueue');a.add_argument('folder')
    a=sub.add_parser('bind-result');a.add_argument('folder');a.add_argument('--asset-id',required=True)
    a=sub.add_parser('install');a.add_argument('extension_id')
    a=sub.add_parser('start');a.add_argument('--image',required=True);a.add_argument('--name');a.add_argument('--output-root');a.add_argument('--project');a.add_argument('--outputs',type=int,choices=[1,3,4],default=3);a.add_argument('--existing-image-name')
    a=sub.add_parser('watch-batch');a.add_argument('folders',nargs='+');a.add_argument('--timeout',type=int,default=55)
    a=sub.add_parser('start-batch');a.add_argument('--images',nargs='+',required=True);a.add_argument('--output-root')
    args=p.parse_args()
    if args.cmd=='serve':serve()
    else:
        if args.cmd=='start':result=start(args.image,args.name,args.project,args.outputs,args.existing_image_name,args.output_root)
        elif args.cmd=='watch-batch':result=watch_batch(args.folders,args.timeout)
        elif args.cmd=='start-batch':result=start_batch(args.images,args.output_root)
        elif args.cmd=='status':result=job_status(args.folder) if args.folder else status()
        elif args.cmd=='selection-report':
            from candidate_selection import report
            result=report(args.folder)
        elif args.cmd=='watch':result=watch(args.folder,args.timeout)
        elif args.cmd=='doctor':result=doctor()
        elif args.cmd=='enqueue':result=enqueue(args.folder)
        elif args.cmd=='bind-result':result=bind_result(args.folder,args.asset_id)
        else:result=install(args.extension_id)
        print(json.dumps(result,ensure_ascii=False,indent=2))
