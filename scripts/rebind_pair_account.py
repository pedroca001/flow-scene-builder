"""Rebind idle, never-submitted pair jobs after UI-confirmed account index change."""
import argparse
import json
from pathlib import Path
import re
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import bridge
import flow_scene_builder as pipeline


def rebind(manifest_path, home, email, reason):
    root=Path(manifest_path).resolve().parent
    manifest=json.loads(Path(manifest_path).read_text(encoding='utf-8-sig'))
    if email!=manifest['account_email'] or not reason.strip():
        raise ValueError('Same authorized account and explicit UI confirmation required.')
    if not re.fullmatch(r'https://flow\.google\.com/u/\d+/',home):
        raise ValueError('Invalid observed Flow home.')
    ledger=json.loads((root/'flow_pairs.json').read_text(encoding='utf-8-sig'))
    current={row['folder']:row for row in bridge.queue()}
    pending=[]
    for key,item in ledger['jobs'].items():
        row=current.get(item['folder'])
        if not row:
            raise ValueError('Missing queue entry: '+key)
        if row['state']=='complete':
            continue
        if row['state']!='paused':
            raise ValueError('Wait for every pending job to be idle/paused: '+key)
        folder,state=pipeline.read_state(item['folder'])
        if state.get('account_email')!=email or any(s['status']!='ready' or s.get('submission_receipt') for s in state['scenes']):
            raise ValueError('Submitted/ambiguous jobs require individual reconciliation: '+key)
        creation=state['project_creation']
        if creation['status']=='creating':
            raise ValueError('Uncertain project creation requires UI reconciliation: '+key)
        project=state.get('project')
        if project and not re.fullmatch(r'https://flow\.google\.com/u/\d+/project/[a-f0-9-]{36}',project):
            raise ValueError('Unexpected recorded project URL: '+key)
        pending.append((key,folder,state))
    if not (root/'before_account_rebind.json').exists():
        bridge.atomic(root/'before_account_rebind.json',dict(manifest_home=manifest['flow_home'],
                                                           jobs=[dict(id=k,folder=str(f),state=s) for k,f,s in pending]))
    for key,folder,state in pending:
        old_home=state['project_creation']['home']
        state['project_creation']['home']=home
        if state.get('project'):
            state['project']=home+'project/'+state['project'].rsplit('/',1)[-1]
        state.setdefault('account_rebinds',[]).append(dict(at=pipeline.now(),email=email,old_home=old_home,home=home,reason=reason))
        pipeline.write_state(folder,state)
        ledger['jobs'][key].update(state='paused',error='',recovery_ready=True)
        bridge.update(folder,error='',phase='Conta Ultra reconectada; retomada do mesmo job pendente.')
    manifest.update(flow_home=home,account_confirmed_home=home,admission_paused=True)
    bridge.atomic(root/'manifest.json',manifest)
    bridge.atomic(root/'flow_pairs.json',ledger)
    settings=bridge.read_settings();settings['flow_home']=home;settings['max_parallel']=20
    bridge.atomic(bridge.APP/'settings.json',settings)
    return dict(rebound=len(pending),home=home,admission_paused=True)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('manifest');p.add_argument('--home',required=True);p.add_argument('--email',required=True);p.add_argument('--reason',required=True)
    a=p.parse_args();print(json.dumps(rebind(a.manifest,a.home,a.email,a.reason)))
