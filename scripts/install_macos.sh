#!/bin/sh
# Installs dependencies and the local native host. Never starts a generation.
set -eu
if [ "$(uname -s)" != Darwin ]; then echo 'Este instalador requer macOS.' >&2; exit 1; fi
flow_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
flow_app=${FLOW_APP_ROOT:-"$HOME/.local/share/flow_scene_builder"}
flow_bootstrap_python=${FLOW_BOOTSTRAP_PYTHON:-python3}
"$flow_bootstrap_python" -c 'import sys; assert sys.version_info >= (3,10), "Python 3.10+ necessario (recomendado 3.12)."'
"$flow_bootstrap_python" - "$flow_app" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1])/'queue.json'
rows=json.loads(p.read_text()) if p.exists() else []
if any(r['state'] in ('queued','running') for r in rows):
    sys.exit('Ha jobs ativos. Aguarde concluir antes de instalar ou atualizar.')
PY
command -v node >/dev/null || { echo 'Instale Node.js 22+ com npm.' >&2; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<22)throw Error("Node.js 22+ necessario")'
if ! command -v npm >/dev/null && ! command -v pnpm >/dev/null; then echo 'npm ou pnpm necessario para instalar dependencias JS.' >&2; exit 1; fi
mkdir -p "$flow_app"
if [ ! -x "$flow_app/venv/bin/python" ]; then "$flow_bootstrap_python" -m venv "$flow_app/venv"; fi
"$flow_app/venv/bin/python" -m pip install -r "$flow_root/requirements.txt"
cd "$flow_root"
if command -v pnpm >/dev/null; then pnpm install --frozen-lockfile; else npm ci; fi
node scripts/build.mjs
node scripts/verify.mjs
exec "$flow_app/venv/bin/python" scripts/configure_macos.py "$@"
