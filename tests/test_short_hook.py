import json
import os
import tempfile
import unittest
from pathlib import Path
from PIL import Image
import flow_scene_builder as f


class ShortHookTests(unittest.TestCase):
    def test_single_six_second_clip_complete_and_duration_guard(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = os.environ.get('FLOW_WORK_ROOT')
            os.environ['FLOW_WORK_ROOT'] = str(root / 'technical')
            try:
                image = root / 'source.png'
                Image.new('RGB', (720, 1280), 'white').save(image)
                preset = root / 'hook.json'
                preset.write_text(json.dumps({'model': 'lower', 'seconds': 6, 'prompts': ['A separate visual hook.']}))
                folder = f.prepare(image, 'hook', preset_file=preset, downloads=root / 'jobs', mode='frames_continuous')
                self.assertEqual(f.next_scene(folder)['scene_count'], 1)
                self.assertEqual(f.next_scene(folder)['duration_seconds'], 6)
                self.assertEqual(f.read_state(folder)[1]['duration_seconds'], 6)
                clip = root / 'clip.mp4'
                f.run_ff(['-f', 'lavfi', '-i', 'color=c=blue:s=720x1280:r=24:d=6', '-f', 'lavfi', '-i', 'sine=duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', clip])
                f.mark_submitted(folder, 1)
                f.ingest(folder, 1, clip, media_id='hook_clip')
                final = f.render(folder)
                self.assertAlmostEqual(final['metadata']['duration'], 6, delta=.6)
                self.assertTrue(f.verify(folder)['ok'])
                wrong_folder = f.prepare(image, 'wrong', downloads=root / 'jobs')
                with self.assertRaisesRegex(ValueError, '8s'):
                    f.ingest(wrong_folder, 1, clip)
                # A shared recipe preserves all four scenes; assembly adds the
                # independent hook without speeding either input or overwriting.
                for number, color in enumerate(['red', 'green', 'yellow', 'black'], 1):
                    part = root / f'recipe_{number}.mp4'
                    f.run_ff(['-f', 'lavfi', '-i', f'color=c={color}:s=720x1280:r=24:d=8', '-c:v', 'libx264', '-preset', 'ultrafast', part])
                    f.mark_submitted(wrong_folder, number)
                    f.ingest(wrong_folder, number, part, media_id=f'recipe_{number}')
                f.render(wrong_folder)
                from scripts.compose_hook_recipe import compose
                joined = compose(folder, wrong_folder, root / 'joined')
                self.assertEqual(joined['scenes'], 5)
                self.assertAlmostEqual(joined['metadata']['duration'], 38, delta=.6)
                self.assertEqual(joined['recipe_sha256'], f.digest(f.verify(wrong_folder)['final']))
                with self.assertRaisesRegex(ValueError, 'already exists'):
                    compose(folder, wrong_folder, root / 'joined')
                # Two profile lanes publish distinct names in one Downloads folder.
                named=compose(folder,wrong_folder,root/'joined',output_name='037.mp4',receipt_path=root/'receipts/037.json')
                resumed=compose(folder,wrong_folder,root/'joined',output_name='037.mp4',receipt_path=root/'receipts/037.json')
                self.assertEqual(named,resumed)
                second=compose(folder,wrong_folder,root/'joined',output_name='169.mp4',receipt_path=root/'receipts/169.json')
                self.assertNotEqual(named['final'],second['final'])
            finally:
                if old is None:
                    os.environ.pop('FLOW_WORK_ROOT', None)
                else:
                    os.environ['FLOW_WORK_ROOT'] = old

    def test_duration_requires_supported_explicit_value(self):
        for seconds in [4, 6, 8]:
            f.validate_preset({'model': 'lower', 'seconds': seconds, 'prompts': ['Hook']})
        for seconds in [5, 0, True, '6']:
            with self.assertRaises(ValueError):
                f.validate_preset({'model': 'lower', 'seconds': seconds, 'prompts': ['Hook']})

