#!/usr/bin/env python3
"""Supervise two isolated serial profile queues and merge one delivery manifest."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import bridge
import flow_scene_builder as pipeline
import platform_lock


def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def live_child(pid, lane, root):
    result=subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True)
    return result.returncode==0 and 'scripts/run_serial_300_flow.py' in result.stdout and f'--lane {lane}' in result.stdout and str(root) in result.stdout


def merge_manifests(master, lanes):
    result={**master,'jobs':dict(master['jobs']),'deliveries':dict(master['deliveries'])}
    assigned=set()
    for lane in lanes:
        ids={pair['id'] for pair in lane['pairs']}
        if assigned&ids:raise ValueError('Pares sobrepostos entre perfis.')
        assigned.update(ids)
        for key,item in lane['jobs'].items():
            if key.split('_',1)[0] not in ids:raise ValueError('Job fora da particao do perfil.')
            if key in result['jobs'] and result['jobs'][key]['folder']!=item['folder']:raise ValueError('Job duplicado no manifesto mestre.')
            result['jobs'][key]=item
        for key,receipt in lane['deliveries'].items():
            if key not in ids:raise ValueError('Entrega fora da particao do perfil.')
            if key in result['deliveries'] and result['deliveries'][key]['sha256']!=receipt['sha256']:raise ValueError('Duas entregas diferentes para o mesmo par.')
            result['deliveries'][key]=receipt
    return result


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',required=True)
    parser.add_argument('--output',default=str(Path.home()/'Downloads/15_de_outubro_300_videos_flow'))
    parser.add_argument('--poll-seconds',type=float,default=30)
    args=parser.parse_args();root=Path(args.root).resolve();output=Path(args.output).resolve()
    if not os.path.ismount('/Volumes/EXTERNAL_DRIVE') or not root.is_dir():raise ValueError('EXTERNAL_DRIVE nao montado.')
    work=root/'relatorios/flow/producao_serial_2026_10_16';config=load(work/'profile_lanes.json')
    if config.get('mode','dual')!='dual':raise ValueError('Producao voltou a um perfil; controlador duplo desativado.')
    lock=(work/'controller.lock').open('a');platform_lock.flock(lock,platform_lock.LOCK_EX|platform_lock.LOCK_NB)
    (work/'dual_controller.pid').write_text(str(os.getpid())+'\n')
    children={}
    for lane in config['lanes']:
        lane_id=lane['id'];lane_work=work/'lanes'/lane_id;pid_file=lane_work/'controller.pid'
        pid=int(pid_file.read_text()) if pid_file.exists() else None
        if pid and live_child(pid,lane_id,root):children[lane_id]={'pid':pid,'process':None};continue
        env=os.environ.copy();env['FLOW_APP_ROOT']=lane['app_root'];env['FLOW_SHARED_ROOT']=config['shared_root']
        with (lane_work/'controller.log').open('ab') as log:
            process=subprocess.Popen([sys.executable,'scripts/run_serial_300_flow.py','--root',str(root),'--output',str(output),'--lane',lane_id],cwd=Path(__file__).resolve().parents[1],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        pid_file.write_text(str(process.pid)+'\n');children[lane_id]={'pid':process.pid,'process':process}
    while True:
        master=load(work/'manifest.json');lanes=[load(work/'lanes'/lane['id']/'manifest.json') for lane in config['lanes']]
        merged=merge_manifests(master,lanes)
        if merged!=master:bridge.atomic(work/'manifest.json',merged)
        statuses={}
        for lane in config['lanes']:
            lane_id=lane['id'];path=work/'lanes'/lane_id/'controller_status.json'
            state=load(path) if path.exists() else {'status':'starting'}
            statuses[lane_id]={'pid':children[lane_id]['pid'],'alive':live_child(children[lane_id]['pid'],lane_id,root),'project':lane['project'],'state':state}
        summary={'updated_at':pipeline.now(),'completed_pairs':len(merged['deliveries']),'expected_pairs':len(merged['pairs']),'lanes':statuses}
        bridge.atomic(work/'dual_status.json',summary)
        primary=statuses['a']['state']
        bridge.atomic(work/'controller_status.json',{**summary,'current_folder':primary.get('current_folder')})
        if len(merged['deliveries'])==len(merged['pairs']):return
        failed=[lane for lane,data in statuses.items() if not data['alive'] and data['state'].get('status')!='complete']
        if failed:
            print(json.dumps({'failed_lanes':failed,'status':summary},ensure_ascii=False),flush=True)
            return 1
        time.sleep(max(2,args.poll_seconds))


if __name__=='__main__':
    sys.exit(main())
