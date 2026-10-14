# Arquitetura e manutencao

## Atualizacao 2026-10-01

[PREPARACAO_CONTINUA.md](PREPARACAO_CONTINUA.md) controla o modo explicito continuo, prepare-only/activate, conta vinculada por email, teto de creditos, pausa persistente por quota e exportacao ao editor. Contratos legados abaixo continuam para jobs existentes; não presumir Lower Priority disponivel na conta atual. Novos testes: 31 Python, 22 JS e smoke DOM. Piloto real novo ainda pendente.

```text
Pedido no Codex -> scripts/flow.sh -> bridge.py -> fila local
                           Chrome MV3 <-> Native Messaging
                                  |
                         UI do Google Flow
                                  |
                 candidatos locais -> 20 frames/video
                                  |
                   Codex CLI / GPT-5.6 Terra
                                  |
               vencedora -> ultimo frame -> proxima cena
                                  |
                   FFmpeg -> MP4 final verificado
```

## Fontes

- `bridge.py`: fila atomica/locks, comandos, protocolo nativo concorrente, lease de um host por perfil e registro macOS.
- `flow_scene_builder.py`: prepara jobs, conserva hashes e estado, importa vencedoras, extrai ultimo frame e monta H264/AAC.
- `candidate_selection.py`: downloads validados, duas pranchas de dez frames/candidato, prompt curto, JSON e cache de selecao/uso. Usa `codex exec` autenticado com ChatGPT.
- `settings.py`: home Flow e localizacao do CLI em configuracao local nao secreta.
- `extension/native_runner.js` e `job_pool.js`: ate dez jobs. `ui_queue.js` serializa transacoes completas da UI.
- `flow_client.js`, `flow_dom.js`, `transport.js`: controles PT/EN observados, IDs publicos dos assets, entrada CDP, upload e download.
- `presets/`: prompts de quatro cenas e rubrica. Sao copiados pelo build quando necessario; editar a fonte, nao package.
- Dashboard/runner/WASM: prototipo auxiliar mantido no codigo; o executor principal usa Python/FFmpeg. O icone abre o status.

O estado tecnico e identificado pelo caminho absoluto da entrega. A pasta do job guarda prompts, candidatos e resultados; nao publica URLs temporarias. Um mesmo projeto explicitamente reutilizado nao executa dois jobs locais juntos. Nao ha lock distribuido entre Macs.

## Testes

Apos instalar dependencias:

```sh
~/.local/share/flow_scene_builder/venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/*.test.mjs
node scripts/build.mjs
node scripts/verify.mjs
```

Smokes DOM e de browser usam Playwright em Chromium separado, sem a conta Flow. Dependencia opcional de desenvolvimento:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node scripts/dom_smoke.mjs
node scripts/upload_smoke.mjs
node scripts/frame_selection_smoke.mjs
```

`media_smoke.mjs` testa o renderizador WASM auxiliar. Os testes Python validam ordem, formato, hashes, fila, concorrencia e Native Messaging. Nenhum desses testes gera videos pagos ou acessa a conta Flow.

## Empacotar

```sh
python3 scripts/package_source.py
```

Gera `dist/flow_scene_builder_macos.zip` e seu SHA-256. Inclui somente fontes, documentos, skill e lockfiles revisados. Exclui runtime, node_modules, package gerado, credenciais e midia. O destinatario extrai o ZIP dentro de codigo e executa o mesmo instalador; as dependencias sao obtidas dos registries pelos lockfiles. No GitHub, Code -> Download ZIP tambem fornece o codigo.

## Mudancas e limites

Atualize os contratos e rode verificacoes pertinentes. Alteracao em Python exige novo processo nativo quando estiver ocioso; o build da extensao recarrega por handshake. Nunca reinicie durante uma geracao ambigua. Preserve respostas originais em manutencao de avaliacoes.

O adaptador e de UI, nao uma API garantida. Conta, idioma, layout, capacidade e modelo disponivel podem variar. A rodada real de dez projetos terminou com recuperacoes supervisionadas; validacao tecnica nao equivale a aprovacao estetica automatica.
