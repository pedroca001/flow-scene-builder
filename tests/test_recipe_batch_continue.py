import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import recipe_batch_continue as runner


class RecipeWavesTests(unittest.TestCase):
    def test_rolling_refill_admits_twenty_when_ten_of_thirty_slots_are_active(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);manifest=root/'manifest.json'
            manifest.write_text(json.dumps({'flow_output_root':str(root/'jobs'),'pending':[{'id':str(i),'path':str(root/f'{i}.png'),'sha256':'hash'} for i in range(40)]}))
            (root/'indice_producao.json').write_text(json.dumps({'jobs':[]}))
            (root/'producao_flow.json').write_text(json.dumps({'rolling_refill':True}))
            with patch.object(runner,'collect',return_value={'active':[{}]*10}),patch.object(runner.bridge,'APP',root),patch.object(runner.bridge,'parallel_limit',return_value=30),patch.object(runner.pipeline,'digest',return_value='hash'),patch.object(runner.bridge,'start_batch',return_value={'jobs':[]}) as start:
                result=runner.step(manifest,root/'delivery')
                self.assertEqual(len(result['admitted']),20)
                self.assertEqual(len(start.call_args.args[0]),20)
    def test_admission_skips_known_images_and_respects_ten_limit(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            manifest = root / 'manifest.json'
            manifest.write_text(json.dumps({'flow_output_root': str(root / 'jobs'),
                'pending': [{'id': f'{i:03}', 'path': str(root / f'{i}.png'), 'sha256': 'hash'} for i in range(1, 15)]}))
            (root / 'indice_producao.json').write_text(json.dumps({'jobs': [{'id': '001', 'state': 'paused'}]}))
            with patch.object(runner, 'collect', return_value={'active': []}), patch.object(runner.bridge, 'APP', root), patch.object(runner.bridge, 'parallel_limit', return_value=10), patch.object(runner.pipeline, 'digest', return_value='hash'), patch.object(runner.bridge, 'start_batch', return_value={'jobs': []}) as start:
                result = runner.step(manifest, root / 'delivery')
                self.assertEqual(result['admitted'], [f'{i:03}' for i in range(2, 12)])
                self.assertEqual(start.call_args.kwargs['audio_retry_limit'], 0)
                self.assertEqual(start.call_args.kwargs['max_total_credits'], 0)
                self.assertEqual(start.call_args.kwargs['outputs'], 1)
                with patch.object(runner, 'collect', return_value={'active': [{'id': '002'}]}):
                    runner.step(manifest, root / 'delivery')
                self.assertEqual(start.call_count, 1)
                (root / 'account_holds.json').write_text(json.dumps({'bassi.volkov@gmail.com': {'reason': 'quota'}}))
                self.assertEqual(runner.step(manifest, root / 'delivery')['blocked'], 'account_hold')
                self.assertEqual(start.call_count, 1)
