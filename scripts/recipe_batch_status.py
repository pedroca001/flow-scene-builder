#!/usr/bin/env python3
"""Idempotent manifest index and compact watcher. Never submits or retries generation."""
import argparse
import json
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import bridge
import flow_scene_builder as pipeline


def collect(manifest_path):
    manifest_path = Path(manifest_path).resolve()
    manifest = json.loads(manifest_path.read_text())
    root = Path(manifest['flow_output_root'])
    report_dir = manifest_path.parent
    index_path = report_dir / 'indice_producao.json'
    old = json.loads(index_path.read_text()) if index_path.exists() else {}
    verified = old.get('verified', {})
    pending = {x['id']: x for x in manifest['pending']}
    reviews_path = report_dir / 'revisao_visual.json'
    reviews = json.loads(reviews_path.read_text()) if reviews_path.exists() else {}
    rows = []
    seen = set()
    status_snapshot = bridge.status()
    queued_folders = {row['folder'] for row in status_snapshot}
    for folder in sorted(root.iterdir()):
        image_id = folder.name.split('_')[0]
        if not folder.is_dir() or image_id not in pending:
            continue
        if image_id in seen:
            raise ValueError('Mais de um job para imagem ' + image_id + '; diagnosticar antes de continuar.')
        try:
            _, state = pipeline.read_state(folder)
        except FileNotFoundError:
            # prepare creates the output folder before atomically saving state.
            # The watcher may see that short interval; a registered job is
            # different and must still report missing state as an error.
            if str(folder) in queued_folders:
                raise
            continue
        seen.add(image_id)
        if state['original_sha256'] != pending[image_id]['sha256']:
            raise ValueError('Hash de entrada diverge do manifesto: ' + image_id)
        status = bridge.job_status(folder,snapshot=status_snapshot if str(folder) in queued_folders else None)
        row = {'id': image_id, 'image': pending[image_id]['path'], 'image_sha256': state['original_sha256'],
               'folder': str(folder), 'project': state.get('project'), 'project_title': status.get('project_title'),
               'state': status['state'], 'phase': status.get('phase'), 'error': status.get('error'),
               'completed_scenes': sum(x['status'] == 'complete' for x in state['scenes']),
               'preset_sha256': state['preset_sha256'], 'final': status.get('output'),
               'visual_review': reviews.get(image_id), 'created': state['created'],
               'finished': state.get('finished'), 'duration': state.get('final_metadata', {}).get('duration'),
               'receipts': [x.get('submission_receipt') for x in state['scenes']],
               'generation_started': any(x.get('submitted') for x in state['scenes']),
               'scene_seconds': [
                   (datetime.fromisoformat(x['completed']) - datetime.fromisoformat(x['submitted'])).total_seconds()
                   for x in state['scenes'] if x.get('completed') and x.get('submitted')]}
        if state['status'] == 'complete':
            final_hash = state['final_sha256']
            if verified.get(image_id, {}).get('sha256') != final_hash:
                try:
                    result = pipeline.verify(folder)
                    verified[image_id] = {'sha256': final_hash, 'result': result}
                except Exception as error:
                    verified[image_id] = {'sha256': final_hash, 'error': str(error)}
            row['verification'] = verified[image_id]
            row['individual_seconds'] = (datetime.fromisoformat(state['finished']) - datetime.fromisoformat(state['created'])).total_seconds()
        rows.append(row)
    counts = Counter(x['state'] for x in rows)
    counts['not_started'] = len(pending) - len(rows)
    times = [x['individual_seconds'] for x in rows if 'individual_seconds' in x]
    scene_times = [seconds for row in rows for seconds in row['scene_seconds']]
    production_path = report_dir / 'producao_flow.json'
    production = json.loads(production_path.read_text()) if production_path.exists() else {}
    summary = {'updated_at': datetime.now(timezone.utc).isoformat(), 'total': len(pending), 'counts': dict(counts),
               'production': {'started': sum(x['state']=='running' and x['generation_started'] for x in rows),
                              'preparing': sum(x['state']=='running' and not x['generation_started'] for x in rows),
                              'queued': counts.get('queued',0)},
               'mean_individual_seconds': round(sum(times) / len(times), 2) if times else None,
               'mean_scene_seconds': round(sum(scene_times) / len(scene_times), 2) if scene_times else None,
               'elapsed_total_seconds': round(time.time() - production['started_epoch'], 2) if production.get('started_epoch') else None,
               'timing_basis': 'Criacao local ate final, incluindo preparo, espera e recuperacoes; nao somar como wall time.',
               'active': [{k: x[k] for k in ('id', 'state', 'phase', 'completed_scenes')} for x in rows if x['state'] in ('queued', 'running')],
               'paused': [{k: x[k] for k in ('id', 'error', 'completed_scenes')} for x in rows if x['state'] == 'paused'],
               'complete_ids': [x['id'] for x in rows if x['state'] == 'complete']}
    output = {'manifest': str(manifest_path), 'summary': summary, 'jobs': rows, 'verified': verified}
    bridge.atomic(index_path,output)
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest')
    parser.add_argument('--timeout', type=int, default=0)
    args = parser.parse_args()
    if not 0 <= args.timeout <= 55:
        parser.error('Timeout entre 0 e 55 segundos.')
    first = collect(args.manifest)
    signature = lambda s: (s['counts'], s['active'], s['paused'])
    until = time.monotonic() + args.timeout
    result = first
    while time.monotonic() < until:
        time.sleep(1)
        result = collect(args.manifest)
        if signature(result) != signature(first):
            break
    print(json.dumps(result, ensure_ascii=False, indent=2))
