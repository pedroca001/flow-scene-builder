#!/usr/bin/env python3
"""Continue an authorized recipe manifest with bounded recovery and slot refill."""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import platform_lock as fcntl
import bridge
import flow_scene_builder as pipeline
from recipe_batch_status import collect


def step(manifest_path, destination, admit=True):
    manifest_path = Path(manifest_path).resolve()
    manifest = json.loads(manifest_path.read_text())
    summary = collect(manifest_path)
    index = json.loads((manifest_path.parent / 'indice_producao.json').read_text())
    receipt_path = manifest_path.parent / 'entrega_editor.json'
    receipt = json.loads(receipt_path.read_text()) if receipt_path.exists() else {'entries': []}
    if receipt.get('destination') and receipt['destination'] != str(Path(destination).resolve()):
        raise ValueError('Destino diverge do recibo existente.')
    receipt.update(destination=str(Path(destination).resolve()), at=pipeline.now())
    delivered = {row['id']: row for row in receipt['entries']}
    for row in index['jobs']:
        if row['state'] != 'complete':
            continue
        if not row['verification'].get('result', {}).get('ok'):
            raise ValueError('Final sem verificacao: ' + row['id'])
        old = delivered.get(row['id'])
        target = Path(old['final']) if old else None
        if old and target.is_file() and old['sha256'] == row['verification']['sha256']:
            stat = target.stat()
            identity = [stat.st_size, stat.st_mtime_ns]
            if old.get('verified_destination_stat') == identity or pipeline.digest(target) == old['sha256']:
                old['verified_destination_stat'] = identity
                continue
        exported = {'id': row['id'], **pipeline.export_editor(row['folder'], destination)}
        stat = Path(exported['final']).stat()
        exported['verified_destination_stat'] = [stat.st_size, stat.st_mtime_ns]
        delivered[row['id']] = exported
    receipt['entries'] = sorted(delivered.values(), key=lambda row: row['id'])
    bridge.atomic(receipt_path, receipt)
    summary['editor_delivered_flow'] = len(delivered)
    if not admit:
        return summary
    # Any quota hold blocks admission of the next wave. Pauses remain untouched.
    account = 'operator@example.invalid'
    holds = bridge.APP / 'account_holds.json'
    if holds.exists() and json.loads(holds.read_text()).get(account):
        summary['blocked'] = 'account_hold'
        return summary
    production_path=manifest_path.parent/'producao_flow.json'
    production=json.loads(production_path.read_text()) if production_path.exists() else {}
    retries=production.get('retry_limit',0)
    if retries not in (0,2):raise ValueError('retry_limit deve ser0ou2.')
    available=bridge.parallel_limit()-len(summary['active'])
    recovered=[]
    if retries==2:
        for row in index['jobs']:
            if available<=0:break
            if row['state']!='paused' or not any(x in (row.get('error') or '').lower() for x in ('tempo esgotado','tempo de espera','geracao falhou','falha ao gerar audio','envio antigo ambiguo')):continue
            folder,state=pipeline.read_state(row['folder'])
            if state.get('technical_retry_limit',0)!=2:continue
            scene=next((s for s in state['scenes'] if s['status']!='complete'),None)
            if not scene or scene.get('recovery_enqueues',0)>=2 or len(scene.get('audio_retry_intents',[]))+len(scene.get('technical_retry_intents',[]))>=2:continue
            scene['recovery_enqueues']=scene.get('recovery_enqueues',0)+1
            pipeline.write_state(folder,state);bridge.enqueue(folder)
            recovered.append(row['id']);available-=1
    if recovered:summary['recovered']=recovered
    if available<=0:return summary
    if summary['active'] and not production.get('rolling_refill',False):return summary
    seen = {row['id'] for row in index['jobs']}
    pending = [row for row in manifest['pending'] if row['id'] not in seen][:available]
    if pending:
        for row in pending:
            if pipeline.digest(Path(row['path'])) != row['sha256']:
                raise ValueError('Hash de entrada diverge: ' + row['id'])
        result = bridge.start_batch(
            [row['path'] for row in pending], output_root=manifest['flow_output_root'],
            outputs=1, audio_retry_limit=retries, prepare_only=retries==2, mode='frames_continuous',
            preset_file=pipeline.ROOT / 'presets/receita_vids_v2_flow_frames_8s_fidelidade.json',
            model='lower', max_total_credits=0, account_email=account,
            home='https://flow.google.com/u/2/')
        if retries==2:
            for job in result['jobs']:
                bridge.authorize_retries(job['folder'],production['retry_authorization'])
                bridge.activate(job['folder'],production['retry_authorization'])
        bridge.atomic(manifest_path.parent / ('onda_' + pending[0]['id'] + '.json'), result)
        summary['admitted'] = [row['id'] for row in pending]
    elif not summary['active'] and not recovered:
        summary['settled'] = True
    return summary


def save_progress(manifest_path, result):
    root = Path(manifest_path).resolve().parent
    bridge.atomic(root / 'continuacao_status.json', result)
    if result.get('blocked') or result.get('settled'):
        path = root / 'producao_flow.json'
        production = json.loads(path.read_text()) if path.exists() else {}
        production.update(status='bloqueado' if result.get('blocked') else 'concluido_com_pendencias' if result.get('paused') else 'concluido',
                          continuation_finished_at=pipeline.now(), continuation_summary=result)
        bridge.atomic(path, production)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest')
    parser.add_argument('--destination', required=True)
    parser.add_argument('--watch', action='store_true')
    parser.add_argument('--poll-seconds', type=int, default=10, choices=range(1,61), help='Intervalo de reposicao entre1e60segundos (default10).')
    parser.add_argument('--no-admission', action='store_true', help='Only verify/export existing jobs, without starting a wave.')
    args = parser.parse_args()
    lock = (Path(args.manifest).resolve().parent / 'continuacao.lock').open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        parser.error('Ja existe um controlador para este manifesto.')
    last = None
    while True:
        result = step(args.manifest, args.destination, admit=not args.no_admission)
        save_progress(args.manifest, result)
        compact = {k: result[k] for k in ('updated_at', 'counts', 'editor_delivered_flow', 'admitted', 'recovered', 'blocked', 'settled') if k in result}
        signature = json.dumps({k: v for k, v in compact.items() if k != 'updated_at'}, sort_keys=True)
        if signature != last:
            print(json.dumps(compact, ensure_ascii=False), flush=True)
            last = signature
        if not args.watch or result.get('blocked') or result.get('settled'):
            break
        time.sleep(args.poll_seconds)
