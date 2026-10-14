"""Prepare a real-image pilot through the existing pipeline, without any queue mutation."""
import argparse
import json
import os
from pathlib import Path
import sys
from datetime import datetime
from zoneinfo import ZoneInfo


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--image', required=True)
    parser.add_argument('--email', required=True)
    parser.add_argument('--home', required=True)
    parser.add_argument('--preset', required=True)
    args = parser.parse_args()
    root = Path(args.root).resolve()
    repo = Path(__file__).resolve().parents[1]
    for forbidden in [repo.parent, repo.parent.parent/'brain']:
        if root == forbidden or forbidden in root.parents:
            raise ValueError('Pilot runtime must remain outside code/Brain.')
    os.environ['FLOW_APP_ROOT'] = str(root/'runtime')
    os.environ['FLOW_WORK_ROOT'] = str(root/'runtime/jobs')
    os.environ['FLOW_HOME'] = args.home
    sys.path.insert(0, str(repo))
    import flow_scene_builder as pipeline
    folder = pipeline.prepare(args.image, 'playwright_piloto', preset_file=args.preset,
                              downloads=root/'media', project=None, outputs=1,
                              mode='frames_continuous', account_email=args.email, home=args.home)
    _, state = pipeline.read_state(folder)
    state['executor'] = 'playwright_preflight'
    state['audio_retry_limit'] = 0
    state['project_creation']['title'] = datetime.now(ZoneInfo('America/Sao_Paulo')).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
    state['authorization'] = {'at': pipeline.now(), 'reason': 'Pedro confirmou login e autorizou testar a automacao neste chat.', 'stage': 'preflight_only'}
    pipeline.write_state(folder, state)
    scene = pipeline.next_scene(folder)
    print(json.dumps({'folder': str(folder), 'frame_path': scene['start_image_path'], 'prompt': scene['prompt'],
                      'title': state['project_creation']['title'], 'seconds': scene['duration_seconds'],
                      'image_sha256': pipeline.digest(scene['start_image_path']),
                      'preset_sha256': state['preset_sha256']}))


if __name__ == '__main__':
    main()
