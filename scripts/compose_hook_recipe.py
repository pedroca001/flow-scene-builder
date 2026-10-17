#!/usr/bin/env python3
"""Join a verified standalone hook and recipe without changing playback speed."""
import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import flow_scene_builder as pipeline


def compose(hook_folder, recipe_folder, output_root, output_name=None, receipt_path=None):
    hook = pipeline.verify(hook_folder)
    recipe = pipeline.verify(recipe_folder)
    if hook['scenes'] != 1 or recipe['scenes'] != 4:
        raise ValueError('Expected one hook scene and four recipe scenes.')
    metadata = [hook['metadata'], recipe['metadata']]
    if any((m['width'], m['height'], m['fps'], m['audio']) != (720, 1280, 24, True) for m in metadata):
        raise ValueError('Sources must be verified 720x1280, 24fps with audio.')
    destination = Path(output_root).expanduser().resolve()
    destination.mkdir(parents=True, exist_ok=True)
    if output_name is not None and (Path(output_name).name!=output_name or not output_name.endswith('.mp4')):
        raise ValueError('Nome final deve ser um MP4 simples, sem caminho.')
    output = destination / (output_name or Path(hook['final']).name)
    receipt_path = Path(receipt_path) if receipt_path else None
    hook_hash, recipe_hash = pipeline.digest(hook['final']), pipeline.digest(recipe['final'])
    if output.exists():
        if receipt_path and receipt_path.is_file():
            saved=json.loads(receipt_path.read_text())
            if saved.get('final')==str(output) and saved.get('sha256')==pipeline.digest(output) and saved.get('hook_sha256')==hook_hash and saved.get('recipe_sha256')==recipe_hash:
                return saved
        raise ValueError('Destination already exists; never overwrite a previous delivery.')
    expected = sum(m['duration'] for m in metadata)
    with tempfile.TemporaryDirectory(prefix='flow_hook_compose_') as scratch:
        scratch = Path(scratch)
        # ASCII local aliases avoid concat quoting/path differences across OSes.
        for name, source in [('hook.mp4', hook['final']), ('recipe.mp4', recipe['final'])]:
            shutil.copy2(source, scratch / name)
        listing = scratch / 'concat.txt'
        listing.write_text("file 'hook.mp4'\nfile 'recipe.mp4'\n", encoding='utf8')
        joined = scratch / 'final.mp4'
        pipeline.run_ff(['-f', 'concat', '-safe', '0', '-i', listing, '-c', 'copy', '-movflags', '+faststart', joined])
        result = pipeline.probe(joined)
        if abs(result['duration'] - expected) > .6:
            raise ValueError('Joined duration does not match the five original scenes.')
        pipeline.run_ff(['-v', 'error', '-i', joined, '-f', 'null', '-'])
        checksum = pipeline.digest(joined)
        receipt={'ok': True, 'final': str(output), 'sha256': checksum, 'metadata': result,
                 'scenes': 5, 'hook_seconds': metadata[0]['duration'], 'recipe_seconds': metadata[1]['duration'],
                 'hook_sha256': hook_hash, 'recipe_sha256': recipe_hash}
        if receipt_path:
            receipt_path.parent.mkdir(parents=True,exist_ok=True)
            with tempfile.NamedTemporaryFile(mode='w',dir=receipt_path.parent,delete=False,encoding='utf-8') as handle:
                json.dump(receipt,handle,ensure_ascii=False,indent=2);temporary=Path(handle.name)
            temporary.replace(receipt_path)
        partial = destination / (output.name + '.part')
        if partial.exists():
            raise ValueError('Existing partial output needs reconciliation.')
        shutil.copy2(joined, partial)
        if pipeline.digest(partial) != checksum:
            raise ValueError('Copy failed integrity verification.')
        partial.replace(output)
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--hook', required=True)
    parser.add_argument('--recipe', required=True)
    parser.add_argument('--output-root', required=True)
    args = parser.parse_args()
    print(json.dumps(compose(args.hook, args.recipe, args.output_root), indent=2))
