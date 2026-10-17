#!/usr/bin/env python3
"""Entrada canonica para a selecao local preservada.

Executar no proprio namespace mantem patches de teste e configuracoes locais
aplicados ao modulo que realmente executa a selecao.
"""

from pathlib import Path

_IMPL_PATH = Path(__file__).with_name("candidate_selection (1).py")
exec(compile(_IMPL_PATH.read_bytes(), str(_IMPL_PATH), "exec"), globals(), globals())
