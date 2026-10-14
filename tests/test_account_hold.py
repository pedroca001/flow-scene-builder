import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import bridge


class AccountHoldTests(unittest.TestCase):
    def test_confirmed_hold_only_pauses_queued_work_of_that_account(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            rows=[dict(folder='same_queued',state='queued'),dict(folder='same_running',state='running'),
                  dict(folder='other',state='queued')]
            with patch.object(bridge,'APP',root),patch.object(bridge,'QUEUE',root/'queue.json'):
                bridge.atomic(bridge.QUEUE,rows)
                def state(folder):
                    return Path(folder),dict(account_email='other@example.com' if folder=='other' else 'same@example.com')
                with patch.object(bridge.pipeline,'read_state',side_effect=state),patch.object(bridge.pipeline,'write_state') as write:
                    self.assertTrue(bridge.hold_account('SAME@example.com','Unusual activity')['held'])
                    self.assertEqual([r['state'] for r in bridge.queue()],['paused','running','queued'])
                    write.assert_not_called()
                holds=json.loads((root/'account_holds.json').read_text())
                self.assertEqual(list(holds),['same@example.com'])
                self.assertEqual(holds['same@example.com']['error'],'Unusual activity')

    def test_hold_requires_an_account_and_evidence(self):
        for email,reason in [('', 'restriction'),('same@example.com', '')]:
            with self.assertRaises(ValueError):bridge.hold_account(email,reason)

    def test_legacy_home_account_keys_still_accept_the_provider_hold(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            with patch.object(bridge,'APP',root),patch.object(bridge,'QUEUE',root/'queue.json'):
                result=bridge.hold_account('https://flow.google.com/u/1/','Provider restriction')
                self.assertTrue(result['held'])
                self.assertIn(result['account'],json.loads((root/'account_holds.json').read_text()))
