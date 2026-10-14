#!/usr/bin/env python3
"""Compose and deliver an already-generated hook batch, without browser calls."""
import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import flow_scene_builder as pipeline
from scripts.compose_hook_recipe import compose


def finish(manifest, destination):
    manifest=Path(manifest).expanduser().resolve()
    rows=json.loads(manifest.read_text(encoding='utf8'))
    recipes=[r for r in rows if r.get('kind')=='recipe']
    hooks=[r for r in rows if r.get('kind')=='hook']
    if len(recipes)!=1 or not hooks:raise ValueError('Manifest requires one recipe and at least one hook.')
    folders=[Path(r['folder']).expanduser().resolve() for r in rows]
    if len(folders)!=len(set(folders)):raise ValueError('Duplicate job in manifest.')
    destination=Path(destination).expanduser().resolve()
    if not destination.is_dir():raise ValueError('Final destination must already exist.')
    receipt_path=manifest.parent/'delivery.json'
    receipts=json.loads(receipt_path.read_text(encoding='utf8')) if receipt_path.exists() else []
    if all(any(r['name']==hook['name'] for r in receipts) for hook in hooks):
        for receipt in receipts:
            final=Path(receipt['final']).resolve()
            if final.parent!=destination or pipeline.digest(final)!=receipt['sha256']:
                raise ValueError('Previous delivery changed or belongs to another destination.')
        return receipts
    for folder in folders:pipeline.verify(folder)
    for hook in hooks:
        previous=next((r for r in receipts if r['name']==hook['name']),None)
        if previous:
            if pipeline.digest(previous['final'])!=previous['sha256']:raise ValueError('Previous delivery changed.')
            continue
        with tempfile.TemporaryDirectory(prefix='.flow_hook_delivery_',dir=destination.parent) as scratch:
            result=compose(hook['folder'],recipes[0]['folder'],scratch)
            output=destination/Path(result['final']).name
            staged=Path(result['final'])
            if output.exists():
                if pipeline.digest(output)!=result['sha256']:raise ValueError('Existing final preserved; reconcile before retrying.')
            else:
                os.rename(staged,output)
            if pipeline.digest(output)!=result['sha256']:raise ValueError('Delivered hash differs.')
            pipeline.run_ff(['-v','error','-i',output,'-f','null','-'])
            result.update(name=hook['name'],final=str(output))
            receipts.append(result)
            partial=receipt_path.with_suffix('.json.part')
            partial.write_text(json.dumps(receipts,indent=2),encoding='utf8')
            partial.replace(receipt_path)
            print(json.dumps(result),flush=True)
    return receipts


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--manifest',required=True)
    parser.add_argument('--destination',required=True)
    args=parser.parse_args()
    finish(args.manifest,args.destination)
