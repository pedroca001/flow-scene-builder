import copy
import unittest
from pathlib import Path
from unittest.mock import patch
import bridge as b
import flow_scene_builder as p


class UnsentSubmissionTests(unittest.TestCase):
    def fixture(self):
        folder = Path('/mock/flow-job')
        scene = {'number': 1, 'status': 'submitted', 'submitted': 'intent-time',
                 'submission_receipt': {'credits': 0}, 'baseline_ids': ['old'],
                 'technical_retry_intents': [{'previous': True}]}
        state = {'scenes': [scene]}
        return folder, state, scene

    def invoke(self, folder, state, request):
        with patch.object(b, 'queue', return_value=[{'folder': str(folder), 'state': 'running'}]), \
             patch.object(p, 'read_state', return_value=(folder, state)), \
             patch.object(p, 'write_state') as write:
            result = b.dispatch({'op': 'submission_not_sent', 'folder': str(folder), 'scene': 1, **request})
        return result, write

    def test_proven_unsent_reservation_is_archived_without_resetting_retry_budget(self):
        folder, state, scene = self.fixture()
        result, write = self.invoke(folder, state, {'before_input': True, 'error': 'Control missing before press'})
        self.assertEqual(result, {'status': 'ready', 'before_input': True})
        self.assertEqual(scene['status'], 'ready')
        self.assertNotIn('submitted', scene)
        self.assertEqual(len(scene['technical_retry_intents']), 1)
        self.assertEqual(scene['unsent_submission_intents'][0]['previous_submission']['baseline_ids'], ['old'])
        write.assert_called_once()

    def test_unknown_confirmed_and_bound_sends_cannot_be_cleared(self):
        for addition in [{}, {'ui_submission_observations': {'initial:0': {'at': 'confirmed'}}},
                         {'result_asset_id': 'bound'}, {'recaptcha_delivery': {'state': 'uncertain'}}]:
            folder, state, scene = self.fixture()
            scene.update(copy.deepcopy(addition))
            request = {'before_input': bool(addition), 'error': 'Not enough proof'}
            with self.assertRaises(ValueError):
                self.invoke(folder, state, request)
            self.assertEqual(scene['status'], 'submitted')

    def test_pause_keeps_local_diagnostic_after_queue_is_reenqueued(self):
        folder, state, scene = self.fixture()
        with patch.object(b, 'queue', return_value=[{'folder': str(folder), 'state': 'running'}]), \
             patch.object(p, 'read_state', return_value=(folder, state)), \
             patch.object(p, 'write_state') as write, patch.object(b, 'update'):
            b.dispatch({'op': 'pause', 'folder': str(folder), 'error': 'UI control missing'})
        self.assertEqual(state['executor_failures'][-1]['error'], 'UI control missing')
        write.assert_called_once()

    def test_technical_retry_archives_old_click_so_next_attempt_gets_a_fresh_cadence_receipt(self):
        folder, state, scene = self.fixture()
        state.update(model_key='lower', outputs_per_prompt=1, account_email='owner',
                     technical_retry_limit=2, retry_authorizations=[{'authorized': True}],
                     project_creation={'home': 'https://flow.google.com/u/2/'})
        scene['ui_submission_observations'] = {'initial:0': {'observed_at': 123}}
        with patch.object(b, 'queue', return_value=[{'folder': str(folder), 'state': 'running'}]), \
             patch.object(p, 'read_state', return_value=(folder, state)), \
             patch.object(p, 'write_state'), patch.object(b, 'account_held', return_value=False):
            b.dispatch({'op': 'retry_missing', 'folder': str(folder), 'scene': 1,
                        'evidence': {'asset_ids': ['old'], 'pending': 0, 'errors': 0},
                        'observation': {'email': 'owner', 'home': state['project_creation']['home'],
                                        'model_key': 'lower', 'outputs': 1, 'credits': 0}})
        self.assertNotIn('ui_submission_observations', scene)
        self.assertEqual(scene['technical_retry_intents'][-1]['previous_submission']['ui_submission_observations'],
                         {'initial:0': {'observed_at': 123}})


if __name__ == '__main__':
    unittest.main()
