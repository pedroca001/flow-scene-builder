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


def compose(hook_folder, recipe_folder, output_root):
    hook = pipeline.verify(hook_folder)
    recipe = pipeline.verify(recipe_folder)
    if hook['scenes'] != 1 or recipe['scenes'] != 4:
        raise ValueError('Expected one hook scene and four recipe scenes.')
    metadata = [hook['metadata'], recipe['metadata']]
    if any((m['width'], m['height'], m['fps'], m['audio']) != (720, 1280, 24, True) for m in metadata):
        raise ValueError('Sources must be verified 720x1280, 24fps with audio.')
    destination = Path(output_root).expanduser().resolve()
    destination.mkdir(parents=True, exist_ok=True)
    output = destination / Path(hook['final']).name
    if output.exists():
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
        partial = destination / (output.name + '.part')
        if partial.exists():
            raise ValueError('Existing partial output needs reconciliation.')
        shutil.copy2(joined, partial)
        if pipeline.digest(partial) != checksum:
            raise ValueError('Copy failed integrity verification.')
        partial.replace(output)
    return {'ok': True, 'final': str(output), 'sha256': checksum, 'metadata': result,
            'scenes': 5, 'hook_seconds': metadata[0]['duration'], 'recipe_seconds': metadata[1]['duration'],
            'hook_sha256': pipeline.digest(hook['final']), 'recipe_sha256': pipeline.digest(recipe['final'])}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--hook', required=True)
    parser.add_argument('--recipe', required=True)
    parser.add_argument('--output-root', required=True)
    args = parser.parse_args()
    print(json.dumps(compose(args.hook, args.recipe, args.output_root), indent=2))
