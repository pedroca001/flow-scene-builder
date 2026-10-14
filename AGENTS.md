# Flow Scene Builder: contrato para agentes

## Purpose

Operar e manter o pipeline local de geracao de videos no Google Flow via extensao Chrome descompactada e bridge local Python/Native Messaging.

## Ownership

- Codigo em `<CODIGO_ROOT>/flow_scene_builder`.
- Runtime e filas em `~/.local/share/flow_scene_builder` (macOS) ou `%LOCALAPPDATA%\flow_scene_builder` (Windows).
- Extensao descompactada gerada em `package/`.
- Presets em `presets/`.

## Local Contracts

1. **Criacao de Projetos:** Cada imagem inicial cria um projeto exclusivo no Flow pela URL base configurada (`flow_home`) e pelo botao Novo projeto. O titulo gerado tem formato `AAAA-MM-DD HH:MM:SS.mmm`.
2. **Modelo e Custo:** Opera preferencialmente com Veo 3.1 Lite Lower Priority (`--model lower`), validando custo zero (0 creditos) na interface antes do envio.
3. **Continuadade das Cenas:** O fluxo gera 4 cenas de 8 segundos (modo continuo): a primeira a partir da imagem original e as seguintes a partir do ultimo frame exato extraido da cena anterior via FFmpeg.
4. **Serializacao de UI e Concorrencia:** Multiplos trabalhos (ate `max_parallel`, default 5 a 10) rodam em paralelo na mesma janela dedicada do Chrome. Transacoes de interface (cliques, selecao de asset, anexar frame) sao serializadas pelo `ui_queue.js` para evitar disputa de foco.
5. **Colheita Transparente de Token:** A extensao intercepta o token de validacao gerado pelo compositor no envio e despacha a geracao de forma limpa, sem exigir acao manual do operador.
6. **Entrega Final:** Apos a conclusao das 4 cenas, o bridge concatena os videos em um MP4 final de 32 segundos (720x1280, 24fps, audio), cujo nome e o titulo do projeto.
7. **Idempotencia e Retomada:** Nunca execute `start` novamente em uma pasta que ja tenha execucao criada. Em caso de pausa por rede ou reinicio do Chrome, use `enqueue <pasta>` para retomar do ponto onde parou.

## Work Guidance

### Operacao Basica

```sh
# 1. Iniciar trabalho individual
sh scripts/flow.sh start --image "/caminho/img.png" --outputs 1 --model lower --mode frames_continuous --output-root "/caminho/entregas"

# 2. Iniciar lote concorrente
sh scripts/flow.sh start-batch --images "/caminho/1.png" "/caminho/2.png" --outputs 1 --model lower --mode frames_continuous --output-root "/caminho/entregas"

# 3. Acompanhar execucao
sh scripts/flow.sh watch-batch "/pasta/job_1" "/pasta/job_2" --timeout 55

# 4. Checar status da fila
sh scripts/flow.sh status --folder "/pasta/job_1"

# 5. Validar integridade do MP4 final
sh scripts/flow.sh verify "/pasta/job_1"

# 6. Retomar job pausado
sh scripts/flow.sh enqueue "/pasta/job_1"
```

### Manutencao e Build da Extensao

Sempre que editar arquivos em `extension/`, compile o pacote com:
```sh
node scripts/build.mjs
```
A extensao verifica a mudanca de build via `hello` ao bridge e recarrega automaticamente em segundo plano.

## Verification

```sh
# Testes Python
~/.local/share/flow_scene_builder/venv/bin/python -m unittest discover tests

# Testes canonicos JavaScript
export PATH="$HOME/.local/bin:$PATH" && node --test tests/flow_client.test.mjs tests/ui_queue.test.mjs tests/recaptcha_submission.test.mjs

# Build da extensao e diagnostico de conexao
node scripts/build.mjs
sh scripts/flow.sh doctor
```

## Child DOX Index

- `extension/`: Codigo-fonte da extensao Chrome (MV3, DOM, transporte, native runner).
- `package/`: Extensao compilada pronta para carregar descompactada no Chrome.
- `presets/`: Prompts de cenas e configuracoes de estilo.
- `scripts/`: Scripts de instalacao, launcher (`flow.sh` / `flow.ps1`) e build.
- `tests/`: Testes automatizados Python e JavaScript.
- `docs/`: Documentacao operacional e de instalacao.
