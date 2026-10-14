import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('idle_update', SOURCE/'scripts'/'apply_pair_idle_update.py')
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)


class IdleUpdateTest(unittest.TestCase):
    def fixture(self, root):
        app = root/'app';app.mkdir()
        manifest = root/'manifest.json'
        manifest.write_text(json.dumps({'account_email':'owner@example.com', 'flow_home':'https://flow.google.com/u/1/',
                                       'admission_paused':True,'maintenance':{'expected_build':'tested'}}))
        (app/'settings.json').write_text(json.dumps({'account_email':'owner@example.com','flow_home':'https://flow.google.com/u/1/'}))
        return app,manifest

    def test_reload_resume_preserves_newer_account_hold(self):
        with tempfile.TemporaryDirectory() as tmp:
            app,manifest = self.fixture(Path(tmp))
            (app/'account_holds.json').write_text(json.dumps({'owner@example.com':{'error':'quota'}}))
            with patch.object(update.bridge,'APP',app):
                with self.assertRaisesRegex(ValueError,'Account hold'):
                    update.resume_manifest(manifest,'tested')
            self.assertTrue(json.loads(manifest.read_text())['admission_paused'])

    def test_another_maintenance_owner_cannot_be_unpaused(self):
        with tempfile.TemporaryDirectory() as tmp:
            app,manifest = self.fixture(Path(tmp))
            with patch.object(update.bridge,'APP',app):
                with self.assertRaisesRegex(ValueError,'ownership'):
                    update.resume_manifest(manifest,'other')
            self.assertTrue(json.loads(manifest.read_text())['admission_paused'])

    def test_confirmed_build_resumes_same_account_and_marks_complete(self):
        with tempfile.TemporaryDirectory() as tmp:
            app,manifest = self.fixture(Path(tmp))
            with patch.object(update.bridge,'APP',app):
                update.resume_manifest(manifest,'tested')
            state = json.loads(manifest.read_text())
            self.assertFalse(state['admission_paused'])
            self.assertEqual(state['maintenance']['status'],'complete')
            self.assertEqual(state['account_email'],'owner@example.com')


if __name__ == '__main__':
    unittest.main()
