"""Register a fresh Mac after dependency installation; no credentials are copied."""
import argparse
import json
import os
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import bridge
from candidate_selection import codex_path
from settings import read_settings, validate_home


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--flow-home', help='Home da conta neste Chrome, por exemplo https://flow.google.com/u/0/')
    parser.add_argument('--codex-path', help='Executavel Codex CLI, caso nao esteja no PATH')
    parser.add_argument('--skip-skill', action='store_true', help='Nao criar link da skill no usuario')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        parser.error('O registro nativo deste instalador requer macOS.')
    active = [j for j in bridge.queue() if j['state'] in ('queued', 'running')]
    if active:
        parser.error('Ha jobs ativos. Aguarde concluir antes de trocar a instalacao.')
    config = read_settings()
    config['flow_home'] = validate_home(args.flow_home or config.get('flow_home', 'https://flow.google.com/u/1/'))
    node = shutil.which('node')
    if node:
        config['node_path'] = str(Path(node).resolve())
    if args.codex_path:
        exe = Path(args.codex_path).expanduser().resolve()
        if not exe.is_file() or not os.access(exe, os.X_OK):
            parser.error('--codex-path deve apontar para um executavel.')
        config['codex_path'] = str(exe)
    else:
        try:
            config['codex_path'] = codex_path()
        except RuntimeError:
            print('Codex CLI ainda ausente. Instale/autentique e execute este instalador novamente.', file=sys.stderr)
    bridge.atomic(bridge.APP/'settings.json', config)
    extension_id = (ROOT/'extension_id.txt').read_text().strip()
    result = bridge.install(extension_id)
    source = ROOT/'.agents/skills/gerar_video_flow'
    target = Path.home()/'.agents/skills/gerar_video_flow'
    if not args.skip_skill:
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.is_symlink() and target.resolve() == source.resolve():
            pass
        elif target.exists() or target.is_symlink():
            print(f'Skill existente preservada: {target}. A skill deste repositorio continua disponivel no projeto.', file=sys.stderr)
        else:
            target.symlink_to(source, target_is_directory=True)
    print(json.dumps({**result, 'flow_home': config['flow_home'], 'extension_folder': str(ROOT/'package'),
                      'next': 'Carregar package em chrome://extensions, autenticar Codex com ChatGPT e executar scripts/flow.sh doctor.'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
