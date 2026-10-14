"""Register the per-user Chrome native host on Windows; never generates media."""
import argparse
from pathlib import Path
import shutil
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import bridge
from candidate_selection import codex_path
from settings import read_settings, validate_home

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--flow-home')
    p.add_argument('--codex-path')
    a=p.parse_args()
    if sys.platform!='win32':p.error('Instalador Windows')
    if any(j['state'] in ('queued','running') for j in bridge.queue()):p.error('Ha jobs ativos')
    config=read_settings()
    config['flow_home']=validate_home(a.flow_home or config.get('flow_home','https://flow.google.com/u/1/'))
    config['node_path']=shutil.which('node')
    config['codex_path']=a.codex_path or codex_path()
    if not Path(config['codex_path']).is_file():p.error('Codex CLI ausente')
    bridge.atomic(bridge.APP/'settings.json',config)
    bridge.install((ROOT/'extension_id.txt').read_text().strip())
    bridge.atomic(bridge.APP/'installation.json',{'root':str(ROOT),'python':sys.executable,'extension':str(ROOT/'package')})
    print(bridge.doctor())

if __name__=='__main__':main()
