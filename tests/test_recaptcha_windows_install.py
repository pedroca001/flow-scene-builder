import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from scripts import prepare_recaptcha_windows as installer
import bridge


class WindowsInstallTests(unittest.TestCase):
    def test_package_source_must_match_and_does_not_reveal_job_details(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'extension').mkdir();(root/'package').mkdir()
            (root/'extension/one.js').write_bytes(b'first')
            expected=hashlib.sha256(b'first').hexdigest()[:16]
            (root/'package/build_id.json').write_text(json.dumps({'build':expected}))
            with patch.object(bridge,'queue',return_value=[{'state':'paused','folder':'private-job'},{'state':'running','folder':'other'}]),patch.object(installer,'read_settings',return_value={'recaptcha_harvest':True,'account_email':'private-account'}):
                status=installer.package_status(root)
            self.assertTrue(status['package_matches_source']);self.assertEqual(status['active_jobs'],1)
            self.assertNotIn('private',json.dumps(status))
            (root/'extension/one.js').write_bytes(b'changed')
            with patch.object(bridge,'queue',return_value=[]),patch.object(installer,'read_settings',return_value={}):
                self.assertFalse(installer.package_status(root)['package_matches_source'])

    def test_prepare_never_registers_a_host_for_active_jobs_or_incomplete_drive_sync(self):
        with patch.object(installer.sys,'platform','win32'),patch.object(bridge,'install') as register,patch.object(bridge,'configure_recaptcha_harvest') as configure:
            for status in [{'active_jobs':1,'package_matches_source':True},{'active_jobs':0,'package_matches_source':False}]:
                with patch.object(installer,'package_status',return_value=status):
                    with self.assertRaises(ValueError):installer.prepare()
            register.assert_not_called();configure.assert_not_called()

    def test_windows_prepare_preserves_holds_and_settings_and_performs_no_generation(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);app=root/'app';app.mkdir();source=root/'source';source.mkdir()
            (source/'extension_id.txt').write_text('a'*32)
            (app/'settings.json').write_text(json.dumps({'max_parallel':5,'account_email':'owner@example.com'}))
            hold=app/'account_holds.json';hold.write_text(json.dumps({'owner@example.com':{'reason':'unusual'}}));before=hold.read_bytes()
            patches=[patch.dict(os.environ,{'FLOW_APP_ROOT':str(app)}),patch.object(installer,'ROOT',source),patch.object(bridge,'APP',app),patch.object(bridge,'QUEUE',app/'queue.json'),patch.object(installer.sys,'platform','win32'),patch.object(installer,'package_status',return_value={'active_jobs':0,'package_matches_source':True,'package_build':'fixture'}),patch.object(bridge,'install',return_value={'native_host':'fixture-host'})]
            for item in patches:item.start()
            try:result=installer.prepare()
            finally:
                for item in reversed(patches):item.stop()
            self.assertEqual(hold.read_bytes(),before)
            config=json.loads((app/'settings.json').read_text())
            self.assertEqual(config['max_parallel'],5);self.assertEqual(config['account_email'],'owner@example.com');self.assertIs(config['recaptcha_harvest'],True)
            self.assertFalse(result['generation_performed']);self.assertFalse(result['account_holds_changed'])
            self.assertEqual(json.loads((app/'recaptcha_installation.json').read_text())['build'],'fixture')
