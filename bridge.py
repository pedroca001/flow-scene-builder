#!/usr/bin/env python3
"""Entrada canonica para a implementacao preservada pelo Drive.

Executar no proprio namespace e deliberado: testes e operacao alteram APP,
QUEUE e outros limites do modulo. Copiar funcoes de um modulo auxiliar deixa
os seus ``__globals__`` apontando para outro namespace e faz essas alteracoes
atingirem a fila real em vez do runtime isolado do teste.
"""

from pathlib import Path

_IMPL_PATH = Path(__file__).with_name("bridge (1).py")
exec(compile(_IMPL_PATH.read_bytes(), str(_IMPL_PATH), "exec"), globals(), globals())
