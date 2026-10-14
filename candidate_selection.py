"""One bounded visual comparison per scene. No generation calls or quality retries."""
import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
import flow_scene_builder as p
from settings import read_settings

LABELS='ABCD'
MODEL='gpt-5.6-terra'
FRAMES=20
ROOT=Path(__file__).resolve().parent
RUBRIC=ROOT/'presets/avaliador_realismo.md'
SCHEMA={'type':'object','additionalProperties':False,'properties':{
    'winner':{'type':'string','enum':list(LABELS)},
    'all_have_major_defects':{'type':'boolean'},
    'ranking':{'type':'array','minItems':4,'maxItems':4,'items':{'type':'object','additionalProperties':False,'properties':{
        'candidate':{'type':'string','enum':list(LABELS)},'score':{'type':'integer','minimum':0,'maximum':100},
        'reason':{'type':'string','maxLength':180}},'required':['candidate','score','reason']}}},
    'required':['winner','all_have_major_defects','ranking']}
INTENTS={1:'Misturar com o fouet e apresentar a tigela.',2:'Adicionar bicarbonato e depois o liquido da garrafa a tigela.',
         3:'Adicionar mel e depois espremer limao na tigela.',4:'Adicionar agua, misturar com fouet e apresentar a tigela.'}
DISABLED=['plugins','apps','browser_use','computer_use','shell_tool','multi_agent','hooks','image_generation','goals','in_app_browser','view_image']

def codex_path():
    candidates=[os.environ.get('FLOW_CODEX'),read_settings().get('codex_path'),shutil.which('codex'),'/Applications/ChatGPT.app/Contents/Resources/codex','/Applications/Codex.app/Contents/Resources/codex']
    for value in candidates:
        if value and Path(value).is_file() and os.access(value,os.X_OK):return value
    raise RuntimeError('Codex CLI ausente. Configure FLOW_CODEX para avaliar imagens.')

def evaluator_preflight():
    exe=codex_path()
    result=subprocess.run([exe,'login','status'],capture_output=True,text=True,timeout=20)
    if result.returncode or 'ChatGPT' not in result.stderr+result.stdout:raise RuntimeError('Avaliacao requer Codex autenticado com ChatGPT, sem fallback para API paga.')
    if not RUBRIC.is_file():raise RuntimeError('Rubrica visual ausente.')
    return {'model':MODEL,'frames':FRAMES,'codex':exe}

def validate_selection(value,candidates):
    available={c['label'] for c in candidates if c['status']=='complete'}
    rows=value.get('ranking',[])
    if value.get('winner') not in available:raise ValueError('Avaliador nao escolheu um candidato disponivel.')
    if len(rows)!=len(candidates) or {r.get('candidate') for r in rows}!={c['label'] for c in candidates}:raise ValueError('Ranking deve incluir todos os candidatos uma unica vez.')
    if rows[0]['candidate']!=value['winner']:raise ValueError('Vencedor deve ser o primeiro do ranking.')
    if type(value.get('all_have_major_defects')) is not bool:raise ValueError('Flag de defeitos ausente.')
    for r in rows:
        if type(r.get('score')) is not int or not 0<=r['score']<=100:raise ValueError('Score invalido.')
        if not isinstance(r.get('reason'),str) or not 1<=len(r['reason'])<=180:raise ValueError('Motivo invalido.')
    if any('major_defects' in r for r in rows):
        for r in rows:
            if type(r.get('major_defects')) is not bool or not 1<=len(r.get('evidence',[]))<=4:raise ValueError('Evidencia visual ausente.')
            if r['major_defects'] and r['score']>64:raise ValueError('Nota contradiz defeito grave.')
        if value['all_have_major_defects']!=all(r['major_defects'] for r in rows if r['candidate'] in available):raise ValueError('Flag global contradiz candidatos.')
    return value

def sheet(video,target,label,frames=15):
    from PIL import Image,ImageDraw,ImageFont
    meta=p.probe(video);fps=meta['fps'] or 24
    # Container duration can round up by one frame while the decoder exposes
    # one fewer frame.  Keep the sampled endpoint inside the decodable range;
    # this still spreads the board across the full eight-second clip.
    last=max(frames-1,int(meta['duration']*fps)-2)
    indices=[round(i*last/(frames-1)) for i in range(frames)]
    target=Path(target);target.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='flow_eval_frames_') as temp:
        temp=Path(temp)
        select='+'.join(f'eq(n\\,{i})' for i in indices)
        p.run_ff(['-i',video,'-an','-vf',f'select={select},scale=288:512','-vsync','0','-frames:v',frames,temp/'f_%02d.png'])
        files=sorted(temp.glob('f_*.png'))
        if len(files)!=frames:raise ValueError(f'Nao foi possivel extrair exatamente {frames} frames.')
        page_size=15 if frames==15 else 10
        pages=[]
        canvas=Image.new('RGB',(1440,548*((min(page_size,frames)+4)//5)),'white');draw=ImageDraw.Draw(canvas)
        try:font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
        except OSError:font=ImageFont.load_default()
        for i,frame in enumerate(files):
            if i and i%page_size==0:
                out=target.with_name(target.stem+f'_p{len(pages)+1:02d}.jpg');canvas.save(out,quality=92);pages.append(str(out))
                canvas=Image.new('RGB',(1440,1096),'white');draw=ImageDraw.Draw(canvas)
            x=(i%5)*288;y=((i%page_size)//5)*548
            draw.text((x+4,y+5),f'{label}  {i+1:02d}  {indices[i]/fps:.2f}s',font=font,fill='black')
            with Image.open(frame) as im:canvas.paste(im,(x,y+36))
        out=target if frames==15 else target.with_name(target.stem+f'_p{len(pages)+1:02d}.jpg')
        canvas.save(out,quality=92);pages.append(str(out))
    return {'file':pages[0],'files':pages,'frame_indices':indices,'timestamps':[round(i/fps,3) for i in indices],'sha256':p.digest(pages[0])}

def evaluate(candidates,number,directory,config=None):
    config=config or {'model':MODEL,'frames':FRAMES,'effort':'medium'}
    model=config['model'];frames=config['frames'];effort=config['effort']
    directory=Path(directory);directory.mkdir(parents=True,exist_ok=True)
    ready=[c for c in candidates if c['status']=='complete']
    if not ready:raise ValueError('Nenhum video disponivel para escolher.')
    fingerprint=p.digest(RUBRIC)+json.dumps([(c['label'],c.get('sha256'),c['status']) for c in candidates])+str(number)+json.dumps(config,sort_keys=True)
    import hashlib
    fingerprint=hashlib.sha256(fingerprint.encode()).hexdigest()
    result_path=directory/'selection.json'
    if result_path.exists():
        saved=json.loads(result_path.read_text())
        if saved.get('fingerprint')!=fingerprint:raise ValueError('Artefatos mudaram depois da avaliacao. Nao repetir automaticamente.')
        validate_selection(saved,candidates);return saved
    started_path=directory/'attempt.json'
    raw_path=directory/'answer.json'
    if started_path.exists() and not raw_path.exists():raise RuntimeError('Avaliacao ja iniciada sem resposta valida; diagnosticar, sem nova chamada automatica.')
    boards=[]
    for c in ready:
        info=sheet(c['path'],directory/f"{c['label']}_{frames}_frames.jpg",c['label'],frames)
        (directory/f"{c['label']}_frames.json").write_text(json.dumps(info))
        boards.extend(Path(path) for path in info['files'])
    labels=[c['label'] for c in candidates]
    prompt=f"Compare {len(candidates)} alternativas da cena {number}. Acao desejada: {config.get('intents', list(INTENTS.values()))[number-1]}\n"
    prompt+=f"Cada candidato tem {frames} frames cronologicos, divididos em paginas consecutivas. Letras, indices e segundos estao impressos. Leia cada pagina esquerda para direita, cima para baixo, acompanhando o mesmo candidato ate o ultimo frame.\n"
    prompt+='Indisponiveis: '+(', '.join(c['label'] for c in candidates if c['status']=='failed') or 'nenhum')+'. Score 0 para indisponiveis.\n'
    prompt+='Inspecione cada objeto e cada transicao. Compare os piores defeitos de TODOS antes de escolher. A candidata vencedora tambem precisa ter seus defeitos explicitados. Nenhuma regeneracao; escolha obrigatoria. Responda somente JSON.'
    import copy
    schema=copy.deepcopy(SCHEMA)
    schema['properties']['winner']['enum']=labels
    ranking=schema['properties']['ranking'];ranking['minItems']=ranking['maxItems']=len(labels)
    item=ranking['items'];item['properties']['candidate']['enum']=labels
    if frames>=20:
        item['properties'].update({'major_defects':{'type':'boolean'},'evidence':{'type':'array','minItems':1,'maxItems':4,'items':{'type':'string','maxLength':240}}})
        item['required']+=['major_defects','evidence']
        schema['properties']['decision_reason']={'type':'string','maxLength':500}
        schema['properties']['prompt_diagnosis']={'type':'string','maxLength':600}
        schema['required']+=['decision_reason','prompt_diagnosis']
    schema_path=directory/'schema.json';schema_path.write_text(json.dumps(schema))
    usage={};elapsed=0
    if not raw_path.exists():
        exe=evaluator_preflight()['codex']
        # Dedicated, short evaluator instructions replace coding instructions only for this invocation.
        args=[exe,'exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only',
              '-m',model,'-c','model_reasoning_effort='+json.dumps(effort),'-c','project_doc_max_bytes=0',
              '-c','model_instructions_file='+json.dumps(str(RUBRIC)),
              '--json','--output-schema',str(schema_path),'-o',str(raw_path)]
        for feature in DISABLED:args+=['--disable',feature]
        for board in boards:args+=['--image',str(board)]
        args+=['--','-']
        started_path.write_text(json.dumps({'started':p.now(),'fingerprint':fingerprint,'model':model}))
        start=time.monotonic()
        with tempfile.TemporaryDirectory(prefix='flow_visual_judge_') as cwd:
            process=subprocess.run(args,input=prompt,cwd=cwd,capture_output=True,text=True,timeout=480)
        elapsed=round(time.monotonic()-start,2)
        # Persist compact usage only, never raw CLI logs, credentials or full session context.
        for line in process.stdout.splitlines():
            try:event=json.loads(line)
            except ValueError:continue
            if event.get('type')=='turn.completed':usage=event.get('usage',{})
        (directory/'usage.json').write_text(json.dumps({'usage':usage,'seconds':elapsed,'model':model}))
        if process.returncode or not raw_path.exists():raise RuntimeError(f'Avaliador visual nao concluiu (exit {process.returncode}); nenhuma nova geracao iniciada.')
    elif (directory/'usage.json').exists():
        previous=json.loads((directory/'usage.json').read_text());usage=previous['usage'];elapsed=previous['seconds']
    result=validate_selection(json.loads(raw_path.read_text()),candidates)
    result.update(model=model,frames_per_candidate=frames,fingerprint=fingerprint,usage=usage,seconds=elapsed)
    temporary=result_path.with_suffix('.part');temporary.write_text(json.dumps(result,ensure_ascii=False,indent=2));temporary.replace(result_path)
    return result

def dispatch(m,state,folder,progress):
    count=state.get('outputs_per_prompt',1)
    if count not in (3,4):raise ValueError('Job nao usa alternativas.')
    number=m.get('scene')
    if type(number) is not int or not 1<=number<=len(state['scenes']):raise ValueError('Cena invalida.')
    scene=state['scenes'][number-1]
    if scene['status']=='complete' and m['op']=='select_candidate':return scene['selection']
    if scene['status']!='submitted' or any(s['status']!='complete' for s in state['scenes'][:number-1]):raise ValueError('Cena nao aguarda candidatos.')
    directory=p.work_dir(folder)/f'candidates_{number:02d}';directory.mkdir(exist_ok=True)
    if m['op']=='batch_results':
        ids=m.get('media_ids',[]);failed=m.get('failed',[])
        if not ids or len(ids)+len(failed)!=count or len(set(ids))!=len(ids):raise ValueError('Esperados todos os slots e pelo menos um video.')
        if any(not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',v) for v in ids):raise ValueError('UUID invalido.')
        if any(not re.fullmatch(r'[a-f0-9]{64}',v) for v in failed):raise ValueError('Falha invalida.')
        used=set(scene.get('baseline_ids',[]))|{c.get('media_id') for s in state['scenes'] if s['number']!=number for c in s.get('candidates',[])}
        if used.intersection(ids):raise ValueError('Asset nao pertence ao novo lote.')
        if scene.get('candidates'):
            if {c['media_id'] for c in scene['candidates'] if c['status']!='failed'}!=set(ids):raise ValueError('Lote ja vinculado a outros assets.')
            return scene['candidates']
        scene['candidates']=[{'label':LABELS[i],'media_id':asset,'status':'pending','path':str(directory/f'{LABELS[i]}.mp4')} for i,asset in enumerate(sorted(ids))]
        scene['candidates'] += [{'label':LABELS[len(ids)+i],'status':'failed','failure_key':key} for i,key in enumerate(failed)]
        p.write_state(folder,state);return scene['candidates']
    candidates=scene.get('candidates',[])
    if len(candidates)!=count:raise ValueError('Vincule o lote antes do download.')
    if m['op']=='select_candidate':
        if any(c['status'] not in ('complete','failed') for c in candidates):raise ValueError('Faltam candidatos.')
        for c in candidates:
            if c['status']=='complete' and p.digest(c['path'])!=c['sha256']:raise ValueError('Candidato foi alterado.')
        progress(f'Cena {number}: avaliando {count} alternativas')
        selection=scene.get('selection') or evaluate(candidates,number,directory/'evaluation',state.get('evaluation',{'model':'gpt-5.6-terra','frames':15,'effort':'low'}))
        validate_selection(selection,candidates)
        scene['selection']=selection;p.write_state(folder,state)
        winner=next(c for c in candidates if c['label']==selection['winner'])
        p.ingest(folder,number,winner['path'],winner['media_id'])
        progress(f"Cena {number}: escolhido {winner['label']}")
        return selection
    candidate=next((c for c in candidates if c['label']==m.get('candidate')),None)
    if not candidate or candidate['status']=='failed':raise ValueError('Candidato invalido.')
    target=Path(candidate['path']);partial=target.with_suffix('.part')
    if m['op']=='candidate_chunk':
        if candidate['status']=='complete':raise ValueError('Candidato ja baixado, nao sobrescrever.')
        data=base64.b64decode(m['data'],validate=True);offset=m['offset']
        if type(offset) is not int or offset<0 or not data or len(data)>262144:raise ValueError('Bloco invalido.')
        if offset and (not partial.exists() or partial.stat().st_size!=offset):raise ValueError('Bloco fora de ordem.')
        with partial.open('wb' if offset==0 else 'ab') as out:out.write(data)
        return partial.stat().st_size
    if m['op']=='candidate_ingest':
        if candidate['status']=='complete':return candidate
        meta=p.probe(partial)
        if abs(meta['duration']-8)>0.6 or (meta['width'],meta['height'])!=(720,1280):raise ValueError('Candidato com formato/duracao invalido.')
        p.run_ff(['-v','error','-i',partial,'-f','null','-'])
        checksum=p.digest(partial)
        if any(c.get('sha256')==checksum for c in candidates if c['label']!=candidate['label']):raise ValueError('Dois candidatos receberam o mesmo arquivo.')
        partial.replace(target);candidate.update(status='complete',sha256=checksum,metadata=meta)
        p.write_state(folder,state);return candidate
    raise ValueError('Operacao desconhecida.')


def report(folder):
    _,state=p.read_state(folder);rows=[];totals={}
    for scene in state['scenes']:
        selection=scene.get('selection')
        if not selection:continue
        for key,value in selection.get('usage',{}).items():
            if isinstance(value,(int,float)):totals[key]=totals.get(key,0)+value
        rows.append({'scene':scene['number'],'winner':selection['winner'],
                     'all_have_major_defects':selection['all_have_major_defects'],
                     'ranking':selection['ranking'],'decision_reason':selection.get('decision_reason'),'prompt_diagnosis':selection.get('prompt_diagnosis'),'seconds':selection.get('seconds'),
                     'usage':selection.get('usage',{}),
                     'candidates':[{'label':c['label'],'status':c['status'],'path':c.get('path')} for c in scene['candidates']]})
    return {'folder':str(folder),'evaluation':state.get('evaluation',{}),'scenes':rows,'total_usage':totals}
