#!/bin/sh
# Portable entry point: no Brain dependency and no media inside this repository.
set -eu
flow_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
flow_app=${FLOW_APP_ROOT:-"$HOME/.local/share/flow_scene_builder"}
flow_python=${FLOW_PYTHON:-"$flow_app/venv/bin/python"}
if [ ! -x "$flow_python" ]; then
  echo 'Runtime ausente. Execute: sh scripts/install_macos.sh' >&2
  exit 1
fi
cd "$flow_root"
case "${1:-}" in
  verify) shift; exec "$flow_python" flow_scene_builder.py verify "$@" ;;
  *) exec "$flow_python" bridge.py "$@" ;;
esac
