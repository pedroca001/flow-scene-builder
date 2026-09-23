# Flow Scene Builder: contrato para agentes

## Purpose

Operar e manter o pipeline local de quatro cenas no Google Flow, com Codex como interface. Este repositorio e a fonte executavel; nao depende do Brain original.

## Ownership

- Codigo em `codigo/flow_scene_builder` ou na raiz de codigo definida pelo usuario.
- Instalacao: `docs/INSTALACAO_MACOS.md`. Operacao: `docs/OPERACAO_CODEX.md`.
- Skill do projeto: `.agents/skills/gerar_video_flow/SKILL.md`.
- Preset: `presets/ugc_ingredientes.json`. Rubrica: `presets/avaliador_realismo.md`.
- Runtime e jobs: `~/.local/share/flow_scene_builder`, fora do repositorio.

## Local Contracts

1. Cada imagem cria projeto novo pela home configurada e botao Novo projeto. Persistir intencao, aba, URL e titulo. Retomar nunca cria outro projeto para o mesmo job.
2. Novos jobs usam x3, GPT-5.6 Terra medium e 20 frames por candidato. Preservar perfis de jobs antigos. Sem trocar modelo, prompt ou numero de cenas por conveniencia.
3. Cenas 1/2 usam a imagem original; 3/4 usam o ultimo frame exato da vencedora anterior. O preset tem quatro cenas.
4. Geracao somente pela UI do Chrome conectado. Validar Lower Priority, zero creditos, 720p, 9:16 e oito segundos. Nao extrair cookies nem chamar endpoints privados do Flow.
5. Dez jobs no maximo, com abas/pastas/projetos separados. Cenas de um job sao sequenciais. Transacoes de UI permanecem serializadas por `ui_queue.js`; isso impede disputa de foco.
6. Um lote por cena e selecao obrigatoria entre videos validos. Sem loop por qualidade. Todos falhos, identidade ambigua ou avaliador interrompido pausam e exigem diagnostico, sem criar nova geracao automaticamente.
7. IDs permanentes vem da UI `/edit/UUID`. Nao escolher resultado por ordem do grid. Baixar a opcao original 720p do menu Flow; nao usar URL de previa.
8. Entrega final tem nome igual ao titulo salvo do projeto, acrescido de `.mp4`. Preservar originais e arquivos de jobs antigos. Estado e frames ficam no cache tecnico, nao em Git.
9. Nao publicar segredos, perfis, filas, projetos privados, candidatos, respostas de testes ou caminhos pessoais. `manifest.key` e chave publica para estabilizar o ID, nao segredo.
10. Mesmo login Flow em dois Macs nao compartilha fila nem runtime. Cada maquina deve operar somente seus projetos e respeitar limites da conta.

## Work Guidance

- Primeiro uso: ler instalacao, executar `sh scripts/install_macos.sh`, orientar carga de `package/` no Chrome e validar `doctor`. Nao gerar video apenas para testar instalador sem pedido.
- Pedido de imagem/pasta: usar skill e launcher `sh scripts/flow.sh`; iniciar todo o lote, guardar paths, acompanhar `watch-batch --timeout 55`, tratar pausas individualmente e executar `verify` uma vez por final.
- Nao carregar manifestos enormes para status. `status --folder` e `selection-report` retornam resumos. Avaliador recebe somente pranchas e rubrica, sem historico do orquestrador.
- Reusar decisoes salvas. Se a chamada de avaliacao foi interrompida, preservar attempt/answer/selection/usage antes de qualquer manutencao; nao repetir automaticamente.
- Quando houver auditoria solicitada, revisar videos e registrar divergencias, preservando a escolha original. Nao afirmar auditoria visual quando so acompanhou status/testes tecnicos.
- `settings.json` local configura a home da conta e caminho do CLI. O indice `/u/N` pode diferir entre Macs. Bridge valida projeto contra a home salva no job.
- Instalar/atualizar somente sem jobs ativos. Reload do build espera executor ocioso. Python vivo mantem modulos carregados; nao presumir que editar um arquivo atualizou esse processo.
- Contrato de recuperacao esta em `docs/OPERACAO_CODEX.md`. Nunca mudar submitted para ready sem evidencia de que nao houve envio.
- Atualizar este AGENTS, README e docs quando mudar comportamento duravel.

## Verification

```sh
python -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/*.test.mjs
node scripts/build.mjs
node scripts/verify.mjs
node scripts/dom_smoke.mjs
```

Usar Python do venv instalado. Smokes precisam de Playwright e Chromium, conforme `docs/ARQUITETURA.md`. Testes locais nao provam integracao ao site: no outro Mac, validar uma imagem real antes de aumentar volume. O piloto de dez projetos concluiu, com recuperacoes supervisionadas; nao prometer operacao sem falhas.

## Child DOX Index

- `extension/`: MV3, fila, adaptador DOM, downloads e painel de status.
- `presets/`: prompts de geracao e rubrica visual.
- `scripts/`: instalacao, launcher, build, pacote e smokes.
- `tests/`: integridade de midia, selecao, concorrencia e protocolo nativo.
- `docs/`: instalacao, operacao e arquitetura.
- `.agents/skills/gerar_video_flow/`: skill portatil para o Codex.
