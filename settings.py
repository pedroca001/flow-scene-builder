"""Non-secret, machine-local settings shared by the CLI and Chrome native host."""
import json
import os
import re
import sys
from pathlib import Path


def app_root():
    return Path(os.environ.get('FLOW_APP_ROOT') or str(Path.home()/'.local/share/flow_scene_builder'))


def read_settings():
    defaults = {}
    if sys.platform == 'win32':
        profile = Path(__file__).with_name('settings_windows_defaults.json')
        value = json.loads(profile.read_text(encoding='utf-8-sig'))
        if not isinstance(value, dict) or set(value) != {'recaptcha_harvest'} or type(value['recaptcha_harvest']) is not bool:
            raise ValueError('Perfil Windows deve conter somente recaptcha_harvest booleano.')
        defaults = value
    path = app_root()/'settings.json'
    if not path.exists():
        return defaults
    value = json.loads(path.read_text(encoding='utf-8-sig'))
    if not isinstance(value, dict):
        raise ValueError('settings.json deve conter um objeto JSON.')
    return {**defaults, **value}


def validate_home(value):
    if not isinstance(value, str) or not re.fullmatch(r'https://flow\.google\.com/(?:u/\d+/)?', value):
        raise ValueError('flow_home deve ser https://flow.google.com/ ou a home /u/NUMERO/.')
    return value


def flow_home():
    return validate_home(os.environ.get('FLOW_HOME') or read_settings().get('flow_home', 'https://flow.google.com/u/1/'))
