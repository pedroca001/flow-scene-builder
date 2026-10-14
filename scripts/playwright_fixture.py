"""Offline media helper. No bridge import, browser API or production queue access."""
import argparse
import json
import os
from pathlib import Path
import shutil
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'next', 'submitted', 'ingest', 'render'])
    parser.add_argument('--root', required=True)
    parser.add_argument('--scene', type=int)
    parser.add_argument('--video')
    parser.add_argument('--asset-id')
    parser.add_argument('--baseline', default='[]')
    args = parser.parse_args()
    root = Path(args.root).resolve()
    repo = Path(__file__).resolve().parents[1]
    for forbidden in [repo.parent, repo.parent.parent/'brain']:
        if root == forbidden or forbidden in root.parents:
            raise ValueError('Offline fixture must remain outside code/Brain.')
    # Overrides must happen before importing pipeline/settings. Never inherit production paths.
    os.environ['FLOW_APP_ROOT'] = str(root/'pipeline_runtime')
    os.environ['FLOW_WORK_ROOT'] = str(root/'pipeline_runtime/jobs')
    os.environ['FLOW_HOME'] = 'https://flow.google.com/u/0/'
    sys.path.insert(0, str(repo))
    import flow_scene_builder as pipeline
    from PIL import Image

    manifest_path = root/'fixture_manifest.json'
    if args.action == 'prepare':
        root.mkdir(parents=True, exist_ok=True)
        if manifest_path.exists():
            raise ValueError('Fixture already exists; do not overwrite it.')
        image = root/'fixture_original.png'
        Image.new('RGB', (720, 1280), 'white').save(image)
        clips = []
        for number, color in enumerate(['red', 'blue', 'green', 'yellow'], 1):
            path = root/f'provider_scene_{number}.mp4'
            pipeline.run_ff(['-f', 'lavfi', '-i', f'color=c={color}:s=720x1280:r=24:d=8',
                             '-f', 'lavfi', '-i', f'sine=frequency={400+number*100}:duration=8',
                             '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
                             '-threads', '2', '-c:a', 'aac', '-shortest', path])
            clips.append(str(path))
        folder = pipeline.prepare(image, 'playwright_offline', downloads=root/'deliveries',
                                  outputs=1, mode='frames_continuous')
        _, state = pipeline.read_state(folder)
        state['project_creation'] = {'status': 'ready', 'title': '2000-01-01 00:00:00.000'}
        pipeline.write_state(folder, state)
        manifest = {'folder': str(folder), 'clips': clips, 'offline': True}
        manifest_path.write_text(json.dumps(manifest)+'\n', encoding='utf-8')
        result = manifest
    else:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        folder = Path(manifest['folder']).resolve()
        if root not in folder.parents:
            raise ValueError('Fixture folder escaped its runtime.')
        if args.action == 'next':
            result = pipeline.next_scene(folder)
            if result.get('ready_to_submit'):
                path = root/f'frame_{result["number"]}.png'
                shutil.copyfile(result['start_image_path'], path)
                result['browser_frame_path'] = str(path)
        elif args.action == 'submitted':
            pipeline.mark_submitted(folder, args.scene, json.loads(args.baseline))
            result = {'recorded': True}
        elif args.action == 'ingest':
            video = Path(args.video).resolve()
            if root not in video.parents:
                raise ValueError('Download escaped fixture runtime.')
            pipeline.ingest(folder, args.scene, video, media_id=args.asset_id)
            result = {'ingested': True}
        else:
            result = pipeline.render(folder)
            verified = pipeline.verify(folder)
            if not result['ok'] or not verified['ok']:
                raise ValueError('Offline pipeline verification failed.')
            _, state = pipeline.read_state(folder)
            result['lineage_verified'] = all(
                state['scenes'][index]['predecessor']['sha256'] == state['scenes'][index-1]['sha256']
                and pipeline.digest(state['scenes'][index]['start_image']) == pipeline.digest(state['scenes'][index-1]['last_frame'])
                for index in range(1, 4))
            if not result['lineage_verified']:
                raise ValueError('Offline lineage mismatch.')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
