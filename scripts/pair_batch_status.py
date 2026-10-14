"""Read-only compact status/watcher for a paired batch, no visual analysis."""
import argparse
from collections import Counter
import json
from pathlib import Path
import sys
import time

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import bridge


def collect(root):
    progress=json.loads((root/'progress.json').read_text(encoding='utf-8-sig'))
    ledger=json.loads((root/'flow_pairs.json').read_text(encoding='utf-8-sig'))
    folders={item['folder'] for item in ledger['jobs'].values()}
    rows=[r for r in bridge.status() if r['folder'] in folders]
    report={k:progress.get(k) for k in ('images','flow_started','flow_complete','active','pairs_ready','edited','account_hold','account_mismatch','admission_paused','updated_at')}
    report['scenes_complete']=sum(s['status']=='complete' for r in rows for s in r['scenes'])
    # A persisted submit intent precedes the click and does not prove acceptance.
    report['waiting_scene_result']=sum(r['state']=='running' and 'aguardando resultado' in (r.get('phase') or '').lower() for r in rows)
    report['submission_intents']=sum(r['state']=='running' and any(s['status']=='submitted' for s in r['scenes']) for r in rows)
    report['active_phases']=dict(Counter(r.get('phase') or r['state'] for r in rows if r['state'] in ('running','queued')))
    maintenance=root/'maintenance_status.json'
    report['maintenance']=json.loads(maintenance.read_text(encoding='utf-8-sig')).get('status') if maintenance.exists() else None
    report['errors']=[dict(folder=r['folder'],error=r.get('error')) for r in rows if r['state']=='paused' and r.get('error')]
    editor=root/'editor_progress.json'
    report['editor_errors']=json.loads(editor.read_text(encoding='utf-8-sig')).get('errors',0) if editor.exists() else 0
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('manifest');p.add_argument('--timeout',type=int,default=0,choices=range(56))
    a=p.parse_args();root=Path(a.manifest).resolve().parent
    target=json.loads(Path(a.manifest).read_text(encoding='utf-8-sig'))['quantity']
    first=collect(root);end=time.monotonic()+a.timeout;current=first
    while time.monotonic()<end and current['edited']!=target and not current['errors'] and not current['account_hold'] and not current['editor_errors']:
        time.sleep(min(2,max(0,end-time.monotonic())))
        current=collect(root)
        if current['edited']!=first['edited']:
            break
    print(json.dumps(current,ensure_ascii=False))


if __name__=='__main__':
    main()
