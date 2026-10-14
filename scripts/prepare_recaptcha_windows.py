"""Check a synced package and configure an existing idle Windows installation."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import bridge
import flow_scene_builder as pipeline
from settings import read_settings


def package_status(root=ROOT):
    digest=hashlib.sha256()
    for path in sorted((root/'extension').iterdir()):
        digest.update(path.read_bytes())
    source=digest.hexdigest()[:16]
    file=root/'package/build_id.json'
    package=json.loads(file.read_text(encoding='utf-8-sig')).get('build') if file.exists() else None
    rows=bridge.queue()
    return {'source_build':source,'package_build':package,'package_matches_source':source==package,
            'active_jobs':sum(row.get('state') in ('queued','running') for row in rows),
            'recaptcha_harvest':read_settings().get('recaptcha_harvest') is True}


def prepare():
    if sys.platform!='win32':raise ValueError('Execute a instalacao local no Windows.')
    status=package_status()
    if status['active_jobs']:raise ValueError('Ha jobs queued/running. Reconciliar e aguardar executor ocioso.')
    if not status['package_matches_source']:raise ValueError('Pacote difere da fonte sincronizada. Aguarde o Drive ou reconstrua o pacote.')
    bridge.configure_recaptcha_harvest(True)
    host=bridge.install((ROOT/'extension_id.txt').read_text().strip())
    bridge.atomic(bridge.APP/'installation.json',{'root':str(ROOT),'python':sys.executable,'extension':str(ROOT/'package')})
    receipt={'at':pipeline.now(),'build':status['package_build'],'recaptcha_harvest':True,
             'generation_performed':False,'account_holds_changed':False,'next_action':'reload_extension_then_doctor'}
    bridge.atomic(bridge.APP/'recaptcha_installation.json',receipt)
    return {**receipt,'native_host':host['native_host'],'package':str(ROOT/'package')}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare',action='store_true')
    args=parser.parse_args()
    print(json.dumps(prepare() if args.prepare else package_status(),ensure_ascii=False,indent=2))
