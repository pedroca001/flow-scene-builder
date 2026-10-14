#!/usr/bin/env python3
"""Native Messaging bridge: local job queue, no generation API or browser credentials."""
import argparse, base64, json, os, struct, sys, tempfile, time, shutil, threading
import platform_lock as fcntl
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
import flow_scene_builder as pipeline
from settings import read_settings
APP=Path(os.environ.get('FLOW_APP_ROOT',str(Path.home()/'.local/share/flow_scene_builder')))
QUEUE=APP/'queue.json'

# Up to thirty separate projects share one native host.
# UI transactions remain serialized in the extension; only independent waits,
# generation, download and evaluation occupy these slots concurrently.
MAX_PARALLEL=30
# Cloud generation and local encoding have different concurrency limits.
# Thirty x264 encoders otherwise contend with Chrome and the user's apps.
RENDER_PARALLEL=2
_render_slots=threading.BoundedSemaphore(RENDER_PARALLEL)
def parallel_limit():
    value=read_settings().get('max_parallel',10)
    if type(value) is not int or not 1<=value<=MAX_PARALLEL:raise ValueError('max_parallel deve ser inteiro entre 1 e 30.')
    return value
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
        with os.fdopen(fd,'w',encoding='utf-8') as out:json.dump(value,out,ensure_ascii=False,indent=2)
        for attempt in range(6):
            try:
                os.replace(name,path)
                break
            except PermissionError:
                if os.name!='nt' or attempt==5:raise
                time.sleep(.02*(attempt+1))
    finally:
        if os.path.exists(name):os.unlink(name)
def queue():
    for attempt in range(6):
        try:return json.loads(QUEUE.read_text(encoding='utf-8-sig')) if QUEUE.exists() else []
        except PermissionError:
            if os.name!='nt' or attempt==5:raise
            time.sleep(.02*(attempt+1))
def status():
    result=[]
    for row in queue():
        item=dict(row)
        try:
            _,state=pipeline.read_state(row['folder'])
            item['scenes']=[{'number':s['number'],'status':s['status'],'candidates_complete':sum(c.get('status')=='complete' for c in s.get('candidates',[])),'winner':s.get('selection',{}).get('winner')} for s in state['scenes']]
            item['outputs_per_prompt']=state.get('outputs_per_prompt',1)
            item.update({key:state.get(key) for key in ('account_email','mode','model_key','max_total_credits','credits_reserved','activation_required','preset_sha256')})
            item['flow_home']=state.get('project_creation',{}).get('home')
            item['project']=state.get('project');item['project_title']=state.get('project_creation',{}).get('title')
            item['output']=str(Path(row['folder'])/state['final']) if state.get('final') else None
        except (OSError,ValueError) as e:item['error']=str(e)
        result.append(item)
    return result
def job_status(folder,snapshot=None):
    folder=Path(folder).expanduser().resolve()
    row=next((r for r in (status() if snapshot is None else snapshot) if r['folder']==str(folder)),None)
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
    row['next_action']='activate_after_approval' if row['state']=='prepared' else 'verify' if row['state']=='complete' else 'diagnose' if row['state']=='paused' else 'wait'
    return row
def watch(folder,timeout=55):
    if not 0<=timeout<=55:raise ValueError('Timeout deve estar entre 0 e 55 segundos.')
    first=job_status(folder);end=time.monotonic()+timeout
    meaningful=lambda row:tuple(row.get(k) for k in ['state','completed','scene','scene_status','candidates_complete','error','output'])
    while first['state'] not in ['complete','paused','prepared'] and time.monotonic()<end:
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
    while any(row['state'] not in ['complete','paused','prepared'] for row in first) and time.monotonic()<end:
        time.sleep(min(2,max(0,end-time.monotonic())))
        current=snapshot()
        if meaningful(current)!=meaningful(first):return {'jobs':current}
    return {'jobs':snapshot()}
def doctor():
    extension=Path(__file__).parent/'package'
    host=Path.home()/'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.pedro.flow_scene_builder.json'
    if os.name == 'nt':host=APP/'com.pedro.flow_scene_builder.json'
    connection=APP/'connection.json'
    recent=json.loads(connection.read_text()) if connection.exists() else None
    # Compare to the current package, not the expected build at an older hello.
    # Otherwise doctor can claim current=true during the idle reload window.
    if recent:
        build_file=extension/'build_id.json'
        if build_file.exists():
            recent={**recent,'expected':json.loads(build_file.read_text())['build']}
            recent['current']=recent.get('build')==recent['expected']
    return {'python':sys.executable,'ffmpeg':pipeline.ffmpeg(),'package_exists':(extension/'manifest.json').exists(),
            'host_registered':host.exists(),'extension_connection':recent,
            'connection_age_seconds':round(time.time()-recent['time']) if recent else None,
            'flow_home':pipeline.flow_home(),'recaptcha_harvest':read_settings().get('recaptcha_harvest') is True}
def enqueue(folder):
    folder,state=pipeline.read_state(folder)
    if state['status']=='complete':raise ValueError('Execucao ja concluida.')
    if state.get('activation_required'):raise ValueError('Preparacao exige activate depois da autorizacao de geracao.')
    if account_held(state):raise ValueError('Conta pausada por quota; release-account exige nova liberacao explicita.')
    key=str(folder)
    with queue_lock():
        rows=queue()
        if not any(r['folder']==key and r['state'] in ['queued','running'] for r in rows):
            rows=[r for r in rows if r['folder']!=key];rows.append({'folder':key,'state':'queued','queued':time.time()});atomic(QUEUE,rows)
    return {'folder':key,'queued':key,'state':'queued','next_action':'wait'}
def start(image,name=None,project=None,outputs=3,existing_image_name=None,output_root=None,prepare_only=False,mode='legacy',account_email=None,home=None,model='lower',max_total_credits=0,preset_file=None,audio_retry_limit=2):
    # Serialize CLI starts as well as native queue mutations, across processes.
    APP.mkdir(parents=True,exist_ok=True)
    with (APP/'start.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        return _start(image,name,project,outputs,existing_image_name,output_root,prepare_only,mode,account_email,home,model,max_total_credits,preset_file,audio_retry_limit)
def _start(image,name,project,outputs,existing_image_name,output_root,prepare_only,mode,account_email,home,model,max_total_credits,preset_file,audio_retry_limit):
    source=Path(image).expanduser().resolve()
    if not source.is_file():raise ValueError('Imagem base nao encontrada.')
    if audio_retry_limit not in (0,2):raise ValueError('audio_retry_limit deve ser 0 ou 2.')
    name=name or source.stem
    if existing_image_name and not project:raise ValueError('Imagem existente exige projeto explicitamente indicado.')
    if outputs not in (1,3,4):raise ValueError('Use x1, x3 ou x4.')
    if model=='lite' and not prepare_only:raise ValueError('Lite pago exige --prepare-only e activate autorizado separadamente.')
    if outputs>1 and not prepare_only:
        from candidate_selection import evaluator_preflight
        evaluator_preflight()
    preset_file=Path(preset_file or pipeline.ROOT/'presets/ugc_ingredientes.json').resolve()
    cfg=read_settings();account_email=account_email or cfg.get('account_email');home=home or pipeline.DEFAULT_HOME
    checksum=pipeline.digest(source)
    for row in reversed(queue()):
        if row['state']=='complete':continue
        try:folder,state=pipeline.read_state(row['folder'])
        except (OSError,ValueError):continue
        if state['name']==pipeline.slug(name) and ((project is None and state.get('project_mode')=='new') or (project is not None and state['project']==project)) and state['original_sha256']==checksum and state.get('outputs_per_prompt',1)==outputs and state.get('mode','legacy')==mode and state.get('model_key','lower')==model and state.get('account_email')==account_email and state.get('project_creation',{}).get('home',pipeline.DEFAULT_HOME)==home and state.get('max_total_credits',0)==max_total_credits and state.get('preset_sha256',pipeline.digest(preset_file))==pipeline.digest(preset_file) and state.get('audio_retry_limit',2)==audio_retry_limit and (output_root is None or folder.parent==Path(output_root).expanduser().resolve()):
            return {'folder':str(folder),'queued':str(folder),'reused':True,'state':row['state'],'next_action':'activate_after_approval' if row['state']=='prepared' else 'diagnose' if row['state']=='paused' else 'wait'}
    folder=pipeline.prepare(source,name,preset_file=preset_file,project=project,outputs=outputs,downloads=output_root,mode=mode,account_email=account_email,home=home,model=model,max_total_credits=max_total_credits).resolve()
    _,state=pipeline.read_state(folder);state['audio_retry_limit']=audio_retry_limit;pipeline.write_state(folder,state)
    if existing_image_name:
        _,state=pipeline.read_state(folder);state['existing_image_name']=existing_image_name;pipeline.write_state(folder,state)
    if prepare_only:
        _,state=pipeline.read_state(folder);state['activation_required']=True;pipeline.write_state(folder,state)
        with queue_lock():
            rows=queue();rows.append({'folder':str(folder),'state':'prepared','queued':time.time()});atomic(QUEUE,rows)
        return {'folder':str(folder),'state':'prepared','next_action':'activate_after_approval','mode':mode,'seconds':len(state['scenes'])*state.get('duration_seconds',8),'model':model,'max_total_credits':max_total_credits,'account_email':account_email,'home':home}
    return enqueue(folder)
def account_key(state):
    return (state.get('account_email') or state.get('project_creation',{}).get('home','')).lower()

def account_held(state):
    p=APP/'account_holds.json'
    holds=json.loads(p.read_text()) if p.exists() else {}
    return state.get('account_hold') or holds.get(account_key(state))

def hold_account(email, reason):
    """Record a confirmed provider restriction without impersonating a job."""
    key=(email or '').strip().lower()
    if not key or not reason.strip():raise ValueError('Informe conta/home e evidencia do bloqueio.')
    with queue_lock():
        holds_path=APP/'account_holds.json'
        holds=json.loads(holds_path.read_text(encoding='utf-8-sig')) if holds_path.exists() else {}
        holds[key]={'at':pipeline.now(),'error':str(reason)[:1000]};atomic(holds_path,holds)
        rows=queue()
        for row in rows:
            if row['state']!='queued':continue
            _,state=pipeline.read_state(row['folder'])
            if account_key(state)==key:row.update(state='paused',error=str(reason)[:1000])
        atomic(QUEUE,rows)
    return {'account':key,'held':True}


def release_account(email, reason):
    if not email or not reason.strip():raise ValueError('Informe conta e nova liberacao humana.')
    with queue_lock():
        rows=queue()
        if any(row['state']=='running' and account_key(pipeline.read_state(row['folder'])[1])==email.lower() for row in rows):raise ValueError('Espere os jobs ativos da conta pausarem antes de liberar quota.')
        p=APP/'account_holds.json';holds=json.loads(p.read_text()) if p.exists() else {}
        holds.pop(email.lower(),None);atomic(p,holds)
        for row in queue():
            folder,state=pipeline.read_state(row['folder'])
            if account_key(state)==email.lower() and state.get('account_hold'):
                state.pop('account_hold');state.setdefault('account_releases',[]).append({'at':pipeline.now(),'reason':reason})
                pipeline.write_state(folder,state)
    return {'account':email,'released':True,'next_action':'enqueue_individually_after_diagnosis'}

def activate(folder, reason):
    folder,state=pipeline.read_state(folder)
    if not isinstance(reason,str) or not reason.strip():raise ValueError('Informe autorizacao humana especifica.')
    if not state.get('activation_required'):raise ValueError('Job nao aguarda ativacao.')
    if account_held(state):raise ValueError('Quota pendente; release-account antes de ativar.')
    if not state.get('account_email'):raise ValueError('Prepare novamente com email exato da conta, sem indice presumido.')
    if state.get('outputs_per_prompt',1)>1:
        from candidate_selection import evaluator_preflight
        evaluator_preflight()
    state['activation_required']=False;state['authorization']={'at':pipeline.now(),'reason':reason,'max_total_credits':state.get('max_total_credits',0)}
    pipeline.write_state(folder,state);return enqueue(folder)

def reserve_submission(folder, state, number, observation):
    if not state.get('account_email'):raise ValueError('Email da conta ainda nao confirmado no job.')
    if not isinstance(observation,dict):raise ValueError('Falta evidencia de conta/modelo/custo antes do clique.')
    model=state.get('model_key','lower');credits=observation.get('credits')
    if observation.get('email','').lower()!=state['account_email'].lower():raise ValueError('Conta visivel difere do job.')
    if observation.get('home')!=state['project_creation']['home']:raise ValueError('Home visivel difere do job.')
    if observation.get('model_key')!=model or type(credits) is not int or credits<0 or (model=='lower' and credits!=0):raise ValueError('Modelo/custo nao corresponde ao contrato.')
    if observation.get('outputs')!=state['outputs_per_prompt']:raise ValueError('Quantidade visivel difere do job.')
    if not 1<=number<=len(state['scenes']):raise ValueError('Cena invalida.')
    scene=state['scenes'][number-1]
    if scene['status']!='ready' or scene.get('submission_receipt'):raise ValueError('Envio ja registrado; diagnosticar antes de repetir.')
    if any(s['status']!='complete' for s in state['scenes'][:number-1]) or not (folder/scene['start_image']).exists():raise ValueError('Antecessor/frame ainda nao confirmado.')
    total=state.get('credits_reserved',0)+credits
    if total>state.get('max_total_credits',0):raise ValueError('Teto total de creditos excedido; nenhum clique autorizado.')
    remaining=sum(s['status']=='ready' for s in state['scenes'])
    if state.get('credits_reserved',0)+credits*remaining>state.get('max_total_credits',0):raise ValueError('Custo atual nao cabe nas cenas restantes do video completo; reautorizar antes de gastar.')
    scene['submission_receipt']={'at':pipeline.now(),**{k:observation[k] for k in ('email','home','model_key','credits','outputs')}}
    state['credits_reserved']=total
    pipeline.write_state(folder,state)

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

def start_batch(images,output_root=None,**options):
    paths=[Path(v).expanduser().resolve() for v in images]
    if not paths or len(set(paths))!=len(paths):raise ValueError('Informe imagens diferentes, sem duplicatas.')
    from PIL import Image
    for path in paths:
        with Image.open(path) as image:image.verify()
    return {'max_parallel':parallel_limit(),'jobs':[start(str(path),output_root=output_root,**options) for path in paths]}

def authorize_retries(folder, reason):
    if not reason.strip():raise ValueError('Informe autorizacao humana para repeticoes.')
    with job_lock(folder):
        folder,state=pipeline.read_state(folder)
        row=next((r for r in queue() if r['folder']==str(folder)),None)
        if row and row['state']=='running':raise ValueError('Autorizar somente com o job ocioso.')
        if state.get('model_key')!='lower' or state.get('outputs_per_prompt')!=1 or state.get('max_total_credits',0)!=0:raise ValueError('Recuperacao somente x1 Lower gratuito.')
        state.update(audio_retry_limit=2,technical_retry_limit=2)
        state.setdefault('retry_authorizations',[]).append({'at':pipeline.now(),'reason':reason,'max_additional_attempts_per_scene':2})
        pipeline.write_state(folder,state)
        return {'folder':str(folder),'max_additional_attempts_per_scene':2}

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
        return {'reload':m.get('build')!=expected,'max_parallel':parallel_limit()}
    if op=='claim':
        # Active folders belong to this single native-host session. Running jobs not
        # in that set are resumable after a service-worker restart.
        exclude=set(m.get('exclude',[]))
        if len(exclude)>=parallel_limit():return None
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
                if account_held(candidate_state) and candidate['state']=='queued':
                    candidate.update(state='paused',error='Conta pausada por quota.');continue
                if candidate_state.get('project') in busy_projects:continue
                row=candidate;folder,state=candidate_folder,candidate_state;break
            if not row:atomic(QUEUE,rows);return None
            row.update(state='running',error='');atomic(QUEUE,rows)
        return {'folder':str(folder),'project':state['project'],'project_mode':state.get('project_mode','existing'),'project_creation':state.get('project_creation',{'status':'ready'}),'max_parallel':parallel_limit(),'account_email':state.get('account_email'),'model_key':state.get('model_key','lower'),'duration_seconds':state.get('duration_seconds',8),'audio_retry_limit':state.get('audio_retry_limit',2),'technical_retry_limit':state.get('technical_retry_limit',0),'manual_send':state.get('manual_send',False),'recaptcha_harvest':read_settings().get('recaptcha_harvest') is True}
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
    if op in ('manual_ready','manual_sent'):
        scene=next((s for s in state['scenes'] if s['status']!='complete'),None)
        if state.get('manual_send') is not True or not scene or scene['number']!=m.get('scene') or scene['status']!='submitted' or not scene.get('submission_receipt'):
            raise ValueError('Envio manual nao reservado para esta cena.')
        if op=='manual_ready':
            scene['manual_send_ready']={'at':pipeline.now(),'tab_id':int(m['tab_id'])}
            pipeline.write_state(folder,state)
            update(folder,phase=f"Cena {scene['number']}: colar prompt e enviar pelo Computer Use")
        else:
            scene['manual_send_observed_at']=pipeline.now();pipeline.write_state(folder,state)
        return True
    if op=='next':
        if account_held(state) and pipeline.next_scene(folder).get('status')=='ready':raise ValueError('Conta pausada por quota. Nova liberacao explicita necessaria.')
        if state.get('project_mode')=='new' and state.get('project_creation',{}).get('status')!='ready':raise ValueError('Criar e nomear o projeto antes de gerar.')
        result=pipeline.next_scene(folder)
        if result.get('ready_to_submit'):
            name=f"fsb_{folder.name}_{'original' if result['source']=='original' else 'frame_'+str(result['number'])}.png"
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
        number=int(m['scene'])
        if not 1<=number<=len(state['scenes']) or state['scenes'][number-1]['status']!='ready':raise ValueError('Cena ja enviada ou invalida.')
        if account_held(state):raise ValueError('Conta pausada por quota.')
        # Old manifests retain their historic protocol; new pinned jobs require a receipt.
        if state.get('account_email'):reserve_submission(folder,state,number,m.get('observation'))
        pipeline.mark_submitted(folder,number,m.get('baseline',[]))
        _,state=pipeline.read_state(folder)
        state['scenes'][int(m['scene'])-1]['failure_baseline']=m.get('failures',[])
        pipeline.write_state(folder,state);return True
    if op=='harvested':
        import re
        if account_held(state):raise ValueError('Conta pausada; nenhum envio autorizado.')
        number=m.get('scene')
        if type(number) is not int or not 1<=number<=len(state['scenes']):raise ValueError('Cena invalida.')
        scene=state['scenes'][number-1]
        if scene['status']!='submitted' or scene.get('recaptcha_harvest'):raise ValueError('Colheita ja registrada ou cena nao reservada.')
        failures=m.get('failures');previous=scene.get('failure_baseline',[])
        count=state.get('outputs_per_prompt',1)
        if m.get('request_aborted') is not True:raise ValueError('Abort do transporte nao confirmado.')
        if not isinstance(failures,list) or not len(previous)<=len(failures)<=len(previous)+count or any(not isinstance(key,str) or not re.fullmatch(r'[a-f0-9]{64}',key) for key in failures):raise ValueError('Baseline da colheita invalido.')
        remaining=list(failures)
        for key in previous:
            if key not in remaining:raise ValueError('Falhas anteriores desapareceram durante colheita.')
            remaining.remove(key)
        if len(remaining)>count or m.get('rpc') not in ('MZZa6b','eb1hJf'):raise ValueError('Abort da colheita nao corresponde ao lote.')
        # Aborted UI cards disappear on the post-replay reload. Keep them in
        # the receipt, not in the baseline that could hide a real later error.
        scene['failure_baseline']=previous
        scene['recaptcha_harvest']={'at':pipeline.now(),'rpc':m['rpc'],'request_aborted':True,'aborted_failures':remaining,'original_failure_baseline':previous}
        scene['recaptcha_delivery']={'state':'prepared','at':pipeline.now()}
        pipeline.write_state(folder,state);return True
    if op=='recaptcha_delivery':
        import re
        scene=next((s for s in state['scenes'] if s['status']!='complete'),None)
        status=m.get('state');reason=m.get('reason');http=m.get('http_status')
        if not scene or scene['number']!=m.get('scene') or scene['status']!='submitted' or not scene.get('recaptcha_harvest',{}).get('request_aborted'):raise ValueError('Entrega sem colheita confirmada.')
        if scene.get('recaptcha_delivery',{}).get('state') not in (None,'prepared'):raise ValueError('Resposta desta tentativa ja registrada.')
        if status not in ('accepted','rejected','uncertain') or type(http) is not int or not 0<=http<=599:raise ValueError('Resposta invalida.')
        if status=='accepted' and (http!=200 or reason is not None or m.get('definitive_rejection') is not False):raise ValueError('Aceite invalido.')
        if status=='rejected' and (http!=200 or m.get('definitive_rejection') is not True or not isinstance(reason,str) or not re.fullmatch(r'PUBLIC_ERROR_[A-Z_]+',reason)):raise ValueError('Recusa nao confirmada.')
        if status=='uncertain' and (m.get('definitive_rejection') is not False or not isinstance(reason,str) or not re.fullmatch(r'PUBLIC_ERROR_[A-Z_]+|rpc_unconfirmed|delivery_uncertain',reason)):raise ValueError('Resultado incerto invalido.')
        scene['recaptcha_delivery']={'at':pipeline.now(),'state':status,'reason':reason,'http_status':http,'definitive_rejection':m.get('definitive_rejection') is True}
        age=m.get('capture_to_send_ms')
        if age is not None:
            if type(age) is not int or not 0<=age<=45000:raise ValueError('Tempo da captura invalido.')
            scene['recaptcha_delivery']['capture_to_send_ms']=age
        pipeline.write_state(folder,state);return True
    if op=='retry_audio':
        if account_held(state):raise ValueError('Conta pausada por quota; nenhum retry autorizado.')
        if state.get('model_key','lower')!='lower' or state.get('outputs_per_prompt',1)!=1:raise ValueError('Retry automatico permitido somente para x1 gratuito confirmado.')
        import re
        scene=next((s for s in state['scenes'] if s['status']!='complete'),None)
        key=m.get('failure_key','')
        if not scene or scene['number']!=m.get('scene') or scene['status']!='submitted' or scene.get('result_asset_id'):raise ValueError('Cena nao permite repetir falha de audio.')
        if not re.fullmatch(r'[a-f0-9]{64}',key) or key in scene.get('failure_baseline',[]):raise ValueError('Falha nao pertence ao novo envio.')
        attempts=scene.setdefault('audio_retry_intents',[])
        if state.get('audio_retry_limit',2)==0:raise ValueError('Job autorizado para uma geracao somente; retry de audio desativado.')
        if len(attempts)+len(scene.get('technical_retry_intents',[]))>=2:raise ValueError('Flow falhou apos duas repeticoes. Execucao preservada para manutencao.')
        attempts.append({'failure_key':key,'time':time.time()});pipeline.write_state(folder,state)
        update(folder,phase=f"Cena {scene['number']}: repeticao de audio {len(attempts)}/2")
        return True
    if op=='retry_missing':
        if account_held(state):raise ValueError('Conta pausada por quota.')
        if state.get('technical_retry_limit',0)!=2 or not state.get('retry_authorizations'):raise ValueError('Repeticao tecnica nao autorizada.')
        scene=next((s for s in state['scenes'] if s['status']!='complete'),None)
        if not scene or scene['number']!=m.get('scene') or scene['status']!='submitted' or scene.get('result_asset_id'):raise ValueError('Cena nao permite novo envio.')
        delivery=scene.get('recaptcha_delivery')
        if delivery and not (delivery.get('state')=='rejected' and delivery.get('definitive_rejection') is True):raise ValueError('Entrega aceita, preparada ou incerta; consultar resultado sem reenviar.')
        observed=m.get('observation',{})
        if state.get('model_key')!='lower' or state.get('outputs_per_prompt')!=1 or observed.get('credits')!=0 or observed.get('model_key')!='lower' or observed.get('outputs')!=1 or observed.get('email')!=state.get('account_email') or observed.get('home')!=state['project_creation']['home']:raise ValueError('Conta/modelo/custo divergem na recuperacao.')
        evidence=m.get('evidence',{})
        if evidence.get('pending')!=0 or evidence.get('errors')!=0 or set(evidence.get('asset_ids',[]))!=set(scene.get('baseline_ids',[])):raise ValueError('Envio ainda pendente, falho ou resultado existente; nao reenviar.')
        attempts=scene.setdefault('technical_retry_intents',[])
        if len(attempts)+len(scene.get('audio_retry_intents',[]))>=2:raise ValueError('Limite de duas repeticoes por cena atingido.')
        archived={k:scene.get(k) for k in ('submitted','submission_receipt','baseline_ids','failure_baseline','recaptcha_harvest','recaptcha_delivery')}
        attempts.append({'at':pipeline.now(),'evidence':evidence,'previous_submission':archived})
        for key in ('submitted','submission_receipt','baseline_ids','failure_baseline','recaptcha_harvest','recaptcha_delivery'):scene.pop(key,None)
        scene['status']='ready';pipeline.write_state(folder,state)
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
        update(folder,phase='Aguardando montagem local')
        with _render_slots:
            update(folder,phase='Montando final local')
            result=pipeline.render(folder)
        update(folder,state='complete',finished=time.time());return result
    if op=='pause':
        error=str(m.get('error',''))[:1000]
        if m.get('kind')=='account_limit':
            # Shared hold is authoritative; do not race running manifests.
            hold_account(account_key(state),error)
        update(folder,state='paused',error=error);return True
    raise ValueError('Comando invalido.')

def serve():
    # Only one installed profile may run the queue at a time. Port lifetime holds the lease.
    if os.name == "nt":
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    APP.mkdir(parents=True,exist_ok=True)
    lease=(APP/'executor.lock').open('a')
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
    target=Path.home()/'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.pedro.flow_scene_builder.json'
    if os.name == 'nt':
        launcher=APP/'native_host.cmd'
        cmd_quote=lambda value: str(value).replace('%','%%')
        launcher.write_text('@echo off\nset "PYTHONUTF8=1"\nset "FLOW_APP_ROOT='+cmd_quote(APP)+'"\n"'+cmd_quote(sys.executable)+'" "'+cmd_quote(Path(__file__).resolve())+'" serve\n',encoding='utf-8')
        target=APP/'com.pedro.flow_scene_builder.json'
    else:
        launcher.write_text('#!/bin/sh\n'+prefix+'exec '+shlex.quote(sys.executable)+' '+shlex.quote(str(Path(__file__).resolve()))+' serve\n');launcher.chmod(0o700)
    atomic(target,{'name':'com.pedro.flow_scene_builder','description':'Local Flow scene queue and rendering','path':str(launcher),'type':'stdio','allowed_origins':[f'chrome-extension://{extension_id}/']})
    if os.name == 'nt':
        import winreg
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r'Software\Google\Chrome\NativeMessagingHosts\com.pedro.flow_scene_builder') as key:
            winreg.SetValueEx(key,'',0,winreg.REG_SZ,str(target))
    return {'native_host':str(target),'extension_id':extension_id}


def configure_recaptcha_harvest(enabled):
    if type(enabled) is not bool:raise ValueError('recaptcha_harvest deve ser booleano.')
    with queue_lock():
        if any(row['state'] in ('queued','running') for row in queue()):raise ValueError('Espere o executor ocioso antes de trocar o envio.')
        config=read_settings();config['recaptcha_harvest']=enabled;atomic(APP/'settings.json',config)
    return {'recaptcha_harvest':enabled,'applies_to':'next_claim','account_holds_changed':False}

if __name__=='__main__':
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='cmd',required=True)
    sub.add_parser('serve');sub.add_parser('doctor')
    a=sub.add_parser('recaptcha-harvest');a.add_argument('mode',choices=['enable','disable'])
    a=sub.add_parser('status');a.add_argument('--folder')
    a=sub.add_parser('selection-report');a.add_argument('folder')
    a=sub.add_parser('watch');a.add_argument('folder');a.add_argument('--timeout',type=int,default=55)
    a=sub.add_parser('enqueue');a.add_argument('folder')
    a=sub.add_parser('authorize-retries');a.add_argument('folder');a.add_argument('--reason',required=True)
    a=sub.add_parser('bind-result');a.add_argument('folder');a.add_argument('--asset-id',required=True)
    a=sub.add_parser('install');a.add_argument('extension_id')
    a=sub.add_parser('start');a.add_argument('--image',required=True);a.add_argument('--name');a.add_argument('--output-root');a.add_argument('--project');a.add_argument('--outputs',type=int,choices=[1,3,4],default=3);a.add_argument('--existing-image-name')
    for flag,kw in [('--prepare-only',{'action':'store_true'}),('--mode',{'choices':['legacy','frames_continuous'],'default':'legacy'}),('--account-email',{}),('--home',{}),('--model',{'choices':['lower','lite'],'default':'lower'}),('--max-total-credits',{'type':int,'default':0}),('--preset',{}),('--audio-retry-limit',{'type':int,'choices':[0,2],'default':2})]:a.add_argument(flag,**kw)
    a=sub.add_parser('release-account');a.add_argument('--account-email',required=True);a.add_argument('--reason',required=True)
    a=sub.add_parser('activate');a.add_argument('folder');a.add_argument('--reason',required=True)
    a=sub.add_parser('watch-batch');a.add_argument('folders',nargs='+');a.add_argument('--timeout',type=int,default=55)
    a=sub.add_parser('start-batch');a.add_argument('--images',nargs='+',required=True);a.add_argument('--output-root')
    for flag,kw in [('--prepare-only',{'action':'store_true'}),('--mode',{'choices':['legacy','frames_continuous'],'default':'legacy'}),('--account-email',{}),('--home',{}),('--model',{'choices':['lower','lite'],'default':'lower'}),('--max-total-credits',{'type':int,'default':0}),('--preset',{}),('--audio-retry-limit',{'type':int,'choices':[0,2],'default':2})]:a.add_argument(flag,**kw)
    a.add_argument('--outputs',type=int,choices=[1,3,4],default=3)
    args=p.parse_args()
    if args.cmd=='serve':serve()
    else:
        if args.cmd=='start':result=start(args.image,args.name,args.project,args.outputs,args.existing_image_name,args.output_root,args.prepare_only,args.mode,args.account_email,args.home,args.model,args.max_total_credits,args.preset,args.audio_retry_limit)
        elif args.cmd=='release-account':result=release_account(args.account_email,args.reason)
        elif args.cmd=='activate':result=activate(args.folder,args.reason)
        elif args.cmd=='watch-batch':result=watch_batch(args.folders,args.timeout)
        elif args.cmd=='start-batch':result=start_batch(args.images,args.output_root,outputs=args.outputs,prepare_only=args.prepare_only,mode=args.mode,account_email=args.account_email,home=args.home,model=args.model,max_total_credits=args.max_total_credits,preset_file=args.preset,audio_retry_limit=args.audio_retry_limit)
        elif args.cmd=='authorize-retries':result=authorize_retries(args.folder,args.reason)
        elif args.cmd=='status':result=job_status(args.folder) if args.folder else status()
        elif args.cmd=='selection-report':
            from candidate_selection import report
            result=report(args.folder)
        elif args.cmd=='watch':result=watch(args.folder,args.timeout)
        elif args.cmd=='doctor':result=doctor()
        elif args.cmd=='recaptcha-harvest':result=configure_recaptcha_harvest(args.mode=='enable')
        elif args.cmd=='enqueue':result=enqueue(args.folder)
        elif args.cmd=='bind-result':result=bind_result(args.folder,args.asset_id)
        else:result=install(args.extension_id)
        print(json.dumps(result,ensure_ascii=False,indent=2))
