#!/usr/bin/env python3
"""Build deterministic review sheets outside the repository; no generation or selection."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import flow_scene_builder as pipeline
from PIL import Image, ImageDraw


def audit(folder):
    folder, state = pipeline.read_state(folder)
    dest = pipeline.work_dir(folder) / 'audit'
    dest.mkdir(exist_ok=True)
    sheets = []
    for scene in state['scenes']:
        if scene['status'] != 'complete':
            continue
        target = dest / f"cena_{scene['number']:02d}_review.jpg"
        if not target.exists():
            canvas = Image.new('RGB', (1080, 1000), 'white')
            draw = ImageDraw.Draw(canvas)
            for index, seconds in enumerate([0, 1, 2, 3, 4, 5, 6, 7.8]):
                frame = dest / f"sample_{scene['number']}_{index}.png"
                pipeline.run_ff(['-ss', str(seconds), '-i', folder / scene['video'],
                                 '-frames:v', '1', '-update', '1', frame])
                with Image.open(frame) as im:
                    im.thumbnail((270, 480))
                    x, y = (index % 4) * 270, (index // 4) * 500
                    canvas.paste(im, (x, y))
                    draw.text((x + 5, y + 480), f"Cena {scene['number']} / {seconds}s", fill='black')
            canvas.save(target, quality=92)
        sheets.append(str(target))
    joins = []
    for previous, scene in zip(state['scenes'], state['scenes'][1:]):
        if previous['status'] != 'complete' or scene['status'] != 'complete':
            continue
        target = dest / f"emenda_{previous['number']}_{scene['number']}.jpg"
        first = dest / f"sample_{scene['number']}_0.png"
        paths = [previous['last_frame'], scene['start_image'], first]
        canvas = Image.new('RGB', (1080, 670), 'white')
        draw = ImageDraw.Draw(canvas)
        for index, path in enumerate(paths):
            with Image.open(path) as im:
                im.thumbnail((360, 640))
                canvas.paste(im, (index * 360, 0))
                draw.text((index * 360 + 4, 645), ['Ultimo frame exato', 'Frame enviado', 'Primeiro frame gerado'][index], fill='black')
        canvas.save(target, quality=92)
        joins.append(str(target))
    scenes = [{k: scene.get(k) for k in ('number', 'status', 'source', 'metadata',
              'media_id', 'sha256', 'predecessor', 'submission_receipt', 'submitted', 'completed')}
              for scene in state['scenes']]
    report = {'folder': str(folder), 'original': str(folder / state['original']),
              'original_sha256': state['original_sha256'], 'project': state['project'],
              'created': state['created'], 'sheets': sheets, 'joins': joins, 'scenes': scenes,
              'visual_review_required': True, 'sampling_note': '8 frames/cena e extremos das emendas; nao certifica cada instante.'}
    path = dest / 'audit.json'
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    return {'folder': str(folder), 'report': str(path), 'sheets': sheets, 'joins': joins}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folders', nargs='+')
    args = parser.parse_args()
    print(json.dumps([audit(folder) for folder in args.folders], ensure_ascii=False, indent=2))
