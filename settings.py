"""Non-secret, machine-local settings shared by the CLI and Chrome native host."""
import json
import os
import re
from pathlib import Path


def app_root():
    return Path(os.environ.get('FLOW_APP_ROOT', str(Path.home()/'.local/share/flow_scene_builder')))


def read_settings():
    path = app_root()/'settings.json'
    if not path.exists():
        return {}
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError('settings.json deve conter um objeto JSON.')
    return value


def validate_home(value):
    if not isinstance(value, str) or not re.fullmatch(r'https://flow\.google\.com/u/\d+/', value):
        raise ValueError('flow_home deve ser a home https://flow.google.com/u/NUMERO/.')
    return value


def flow_home():
    return validate_home(os.environ.get('FLOW_HOME') or read_settings().get('flow_home', 'https://flow.google.com/u/1/'))
