"""Read native hybrid checkpoints without operating the browser or sending jobs."""
import argparse
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import flow_scene_builder as pipeline

def checkpoints(root):
    result=[]
    root=Path(root)
    receipts={}
    ledger=root/'flow_pairs.json'
    if ledger.exists():
        for key,item in json.loads(ledger.read_text(encoding='utf-8-sig')).get('jobs',{}).items():
            if item.get('manual_send'):receipts[key]=dict(id=key,pipeline_folder=item['folder'])
    for receipt_path in root.glob('manual_ui_*.json'):
        receipt=json.loads(receipt_path.read_text(encoding='utf-8-sig'));receipts[receipt['id']]=receipt
    for receipt in receipts.values():
        if not receipt.get('pipeline_folder'):continue
        folder,state=pipeline.read_state(receipt['pipeline_folder'])
        if not state.get('manual_send') or state.get('status')=='complete':continue
        for scene in state['scenes']:
            ready=scene.get('manual_send_ready')
            if scene['status']=='submitted' and ready and not scene.get('manual_send_observed_at'):
                result.append(dict(id=receipt['id'],folder=str(folder),project=state['project'],scene=scene['number'],
                                   tab_id=ready['tab_id'],prompt=scene['prompt'],ready_at=ready['at']))
                break
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('manifest');args=parser.parse_args()
    print(json.dumps(checkpoints(Path(args.manifest).resolve().parent),ensure_ascii=True))
