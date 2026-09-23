import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import settings


class SettingsTests(unittest.TestCase):
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
