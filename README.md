# Flow Scene Builder

Automacao local para macOS e Windows que gera videos de quatro cenas continuas (ou mais cenas/hooks) no Google Flow. Uma extensao Chrome opera a interface de forma controlada enquanto o bridge Python e o FFmpeg gerenciam a fila, baixam os candidatos, extraem os frames de emenda e montam o MP4 final de 32 segundos.

O sistema opera preferencialmente com o modelo **Veo 3.1 Lite Lower Priority** (custo zero no plano Ultra).

---

## 1. Instalacao e Requisitos

### Requisitos
- Google Chrome aberto com a conta Google logada no Flow (`https://flow.google.com/`).
- Python 3.10+ (recomendado 3.12).
- FFmpeg (instalado no sistema ou via `imageio_ffmpeg`).
- Node.js 22+.

### No macOS
```sh
# 1. Instalar runtime e registrar host nativo
sh scripts/install_macos.sh --flow-home https://flow.google.com/u/1/

# 2. Carregar extensao no Chrome
# Abra chrome://extensions, ative "Modo do desenvolvedor" e clique em "Carregar sem compactacao",
# selecionando a pasta package/ deste repositorio.

# 3. Validar conexao
sh scripts/flow.sh doctor
```

### No Windows (PowerShell)
```powershell
# 1. Instalar runtime e registrar host nativo
& .\scripts\install_windows.ps1 -FlowHome https://flow.google.com/u/1/

# 2. Carregar extensao no Chrome
# Em chrome://extensions, carregar a pasta package/ descompactada.

# 3. Validar conexao
.\scripts\flow.ps1 doctor
```

---

## 2. Configuracao (`settings.json`)

As configuracoes ficam salvas no runtime local em `~/.local/share/flow_scene_builder/settings.json` (ou `%LOCALAPPDATA%\flow_scene_builder\settings.json` no Windows):

```json
{
  "max_parallel": 5,
  "flow_home": "https://flow.google.com/u/1/",
  "account_email": "seu_email@gmail.com"
}
```

- `max_parallel`: numero de geracoes concorrentes simultaneas (recomendado entre 1 e 10).
- `flow_home`: URL base da conta no Flow (ex.: `https://flow.google.com/u/0/`, `/u/1/` ou `/u/2/`).
- `account_email`: email da conta Google logada no Flow para validacao de seguranca.

---

## 3. Instrucoes de Operacao para o GPT / Agente

### Iniciar um video individual
```sh
sh scripts/flow.sh start \
  --image "/caminho/imagem_original.png" \
  --outputs 1 \
  --model lower \
  --mode frames_continuous \
  --output-root "/caminho/pasta_destino"
```

### Iniciar um lote de videos em paralelo
```sh
sh scripts/flow.sh start-batch \
  --images "/caminho/img1.png" "/caminho/img2.png" "/caminho/img3.png" \
  --outputs 1 \
  --model lower \
  --mode frames_continuous \
  --output-root "/caminho/pasta_destino"
```

### Acompanhar o progresso
```sh
# Monitorar um lote de jobs ate conclusao
sh scripts/flow.sh watch-batch "/pasta/job_1" "/pasta/job_2" --timeout 55

# Ou consultar status rapido
sh scripts/flow.sh status --folder "/pasta/job_1"
```

### Validar o video final
```sh
sh scripts/flow.sh verify "/pasta/job_1"
```
Retorna `{"ok": true, "metadata": {"duration": 32.02, "width": 720, "height": 1280, "fps": 24.0, "audio": true}}`.

### Retomar um job pausado
Se um trabalho pausar por oscilacao de rede ou fechamento acidental de aba:
```sh
sh scripts/flow.sh enqueue "/pasta/job_1"
```

---

## 4. Regras e Contrato de Execucao

1. **Janela Dedicada:** A extensao opera em uma janela propria do Chrome em segundo plano. Nao feche a janela da automacao enquanto houver jobs rodando.
2. **Cenas Sequenciais:** Cada video tem 4 cenas de 8 segundos (ou 5 cenas no modo hook). A cena 1 usa a imagem inicial; as cenas 2, 3 e 4 usam o ultimo frame exato da cena anterior.
3. **Custo Zero:** No modo `--model lower`, a automacao exige custo zero (0 creditos) na interface do Flow antes de autorizar o envio.
4. **Idempotencia:** Nunca execute `start` novamente para uma pasta ja existente em andamento. Use `enqueue` para retomar trabalhos pausados.
