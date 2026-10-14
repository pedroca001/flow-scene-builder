"""Drain a paired Windows batch, build only while idle, confirm reload, resume."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

SOURCE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SOURCE))
import bridge
import flow_scene_builder as pipeline
import platform_lock


def read(path, default=None):
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else default


def source_hash():
    result = hashlib.sha256()
    for path in sorted((SOURCE/'extension').iterdir()):
        result.update(path.read_bytes())
    return result.hexdigest()[:16]


def active_jobs():
    return [r for r in bridge.status() if r['state'] in ('queued', 'running')]


def resume_manifest(manifest_path, expected):
    manifest = read(manifest_path)
    maintenance = manifest.get('maintenance', {})
    if maintenance.get('expected_build') != expected:
        raise ValueError('Maintenance ownership changed; preserve admission hold.')
    if read(bridge.APP/'account_holds.json', {}).get(manifest['account_email']):
        raise ValueError('Account hold exists; preserve admission hold.')
    settings = read(bridge.APP/'settings.json')
    if settings.get('account_email') != manifest['account_email'] or settings.get('flow_home') != manifest['flow_home']:
        raise ValueError('Account configuration changed; preserve admission hold.')
    manifest['maintenance'].update(status='complete', confirmed_at=pipeline.now())
    manifest['admission_paused'] = False
    bridge.atomic(manifest_path, manifest)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest')
    parser.add_argument('--timeout', type=int, default=7200)
    args = parser.parse_args()
    if os.name != 'nt':
        raise ValueError('This maintenance worker is Windows-only.')
    path = Path(args.manifest).resolve()
    root = path.parent
    with (root/'pair_maintenance.lock').open('a') as lock:
        platform_lock.flock(lock, platform_lock.LOCK_EX | platform_lock.LOCK_NB)
        manifest = read(path)
        if manifest.get('admission_paused'):
            raise ValueError('Admission already paused; do not take over another hold.')
        expected = source_hash()
        baseline = {'at':pipeline.now(), 'progress':read(root/'progress.json'),
                    'active_phases':[{'state':r['state'],'phase':r.get('phase')} for r in active_jobs()]}
        bridge.atomic(root/'performance_before_update.json', baseline)
        maintenance = dict(status='draining',expected_build=expected,pid=os.getpid(),started_at=pipeline.now())
        manifest.update(admission_paused=True,maintenance=maintenance)
        bridge.atomic(path, manifest)
        bridge.atomic(root/'maintenance_status.json', maintenance)
        print(json.dumps(maintenance), flush=True)
        try:
            deadline = time.monotonic()+args.timeout
            while active_jobs():
                if time.monotonic() >= deadline:
                    raise TimeoutError('Jobs did not drain; no build or reload performed.')
                time.sleep(2)
            if source_hash() != expected:
                raise ValueError('Source changed during drain; no build performed.')
            maintenance.update(status='building',idle_at=pipeline.now())
            bridge.atomic(root/'maintenance_status.json', maintenance)
            settings = read(bridge.APP/'settings.json')
            node = settings['node_path']
            for script in ('build.mjs','verify.mjs'):
                subprocess.run([node,str(SOURCE/'scripts'/script)],cwd=SOURCE,check=True)
            built = read(SOURCE/'package'/'build_id.json')['build']
            if built != expected:
                raise ValueError('Build differs from validated source.')
            maintenance.update(status='waiting_reload',built_at=pipeline.now())
            bridge.atomic(root/'maintenance_status.json', maintenance)
            # Existing idle Chrome alarm detects the changed build and reloads.
            # No active worker is forcibly terminated, no uncertain submit reset.
            reload_deadline = time.monotonic()+180
            while True:
                connection = read(bridge.APP/'connection.json', {})
                if connection.get('build') == expected and connection.get('current'):
                    break
                if time.monotonic() >= reload_deadline:
                    raise TimeoutError('Chrome did not confirm the new build; preserve hold.')
                time.sleep(2)
            resume_manifest(path,expected)
            maintenance.update(status='complete',confirmed_at=pipeline.now())
            bridge.atomic(root/'maintenance_status.json', maintenance)
            print(json.dumps(maintenance),flush=True)
        except Exception as exc:
            maintenance.update(status='failed',error=str(exc),failed_at=pipeline.now())
            bridge.atomic(root/'maintenance_status.json', maintenance)
            print(json.dumps(maintenance),flush=True)
            raise


if __name__ == '__main__':
    main()
