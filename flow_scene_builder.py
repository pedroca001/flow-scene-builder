#!/usr/bin/env python3
"""Entrada canonica de compatibilidade para a implementacao local preservada."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

_IMPL_PATH = Path(__file__).with_name("flow_scene_builder (1).py")
_SPEC = spec_from_file_location("_flow_scene_builder_impl", _IMPL_PATH)
if _SPEC is None or _SPEC.loader is None:
    raise ImportError(f"Nao foi possivel carregar {_IMPL_PATH}")
_IMPL = module_from_spec(_SPEC)
_SPEC.loader.exec_module(_IMPL)

globals().update(
    {name: value for name, value in vars(_IMPL).items() if not name.startswith("__")}
)

if __name__ == "__main__":
    _IMPL.main()
