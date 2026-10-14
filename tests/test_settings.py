import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import settings


class SettingsTests(unittest.TestCase):
    def test_windows_profile_enables_harvest_without_copying_accounts_or_runtime(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'FLOW_APP_ROOT': temp}), patch.object(settings.sys, 'platform', 'win32'):
            self.assertEqual(settings.read_settings(), {'recaptcha_harvest': True})
            self.assertFalse(Path(temp, 'settings.json').exists())
            Path(temp, 'settings.json').write_text(json.dumps({'flow_home':'https://flow.google.com/','max_parallel':5}))
            result=settings.read_settings()
            self.assertEqual(result['recaptcha_harvest'],True)
            self.assertEqual(result['max_parallel'],5)
            self.assertEqual(result['flow_home'],'https://flow.google.com/')
            Path(temp, 'settings.json').write_text(json.dumps({'recaptcha_harvest':False}))
            self.assertEqual(settings.read_settings(),{'recaptcha_harvest':False})

    def test_windows_defaults_do_not_enable_an_unconfigured_mac(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'FLOW_APP_ROOT': temp}), patch.object(settings.sys, 'platform', 'darwin'):
            self.assertEqual(settings.read_settings(),{})

    def test_home_is_local_and_environment_can_override(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {'FLOW_APP_ROOT': temp}, clear=True):
            self.assertEqual(settings.flow_home(), 'https://flow.google.com/u/1/')
            Path(temp, 'settings.json').write_text(json.dumps({'flow_home': 'https://flow.google.com/u/0/'}))
            self.assertEqual(settings.flow_home(), 'https://flow.google.com/u/0/')
            with patch.dict(os.environ, {'FLOW_HOME': 'https://flow.google.com/u/2/'}):
                self.assertEqual(settings.flow_home(), 'https://flow.google.com/u/2/')

    def test_home_rejects_other_origins_and_project_urls(self):
        for value in ['https://example.com/u/0/', 'https://flow.google.com/u/0/project/test', 'http://flow.google.com/u/1/', 'https://flow.google.com/u/1/?token=x']:
            with self.assertRaises(ValueError):
                settings.validate_home(value)
