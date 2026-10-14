---
name: gerar_video_flow
description: Gera videos no Google Flow pela extensao local a partir de uma imagem ou pasta, com projeto novo por imagem, ate dez trabalhos simultaneos em Veo 3.1 Lite Lower Priority. Use para iniciar, acompanhar e entregar videos deste pipeline.
---

# Gerar videos no Flow

Esta skill opera o Flow Scene Builder para gerar videos de 4 cenas (ou com hook) no Google Flow usando o modelo Veo 3.1 Lite Lower Priority (custo zero).

Resolva a raiz do repositorio pelo caminho desta skill (`<REPO>/scripts/flow.sh`).

## Como Usar

### 1. Iniciar geracao

Para uma imagem individual:
```sh
sh <REPO>/scripts/flow.sh start \
  --image "/caminho/imagem.png" \
  --outputs 1 \
  --model lower \
  --mode frames_continuous \
  --output-root "/caminho/entregas"
```

Para um lote de imagens:
```sh
sh <REPO>/scripts/flow.sh start-batch \
  --images "/caminho/1.png" "/caminho/2.png" "/caminho/3.png" \
  --outputs 1 \
  --model lower \
  --mode frames_continuous \
  --output-root "/caminho/entregas"
```

### 2. Acompanhar

```sh
sh <REPO>/scripts/flow.sh watch-batch "/pasta/job_1" "/pasta/job_2" --timeout 55
```
Acompanhe ate todos os jobs ficarem `complete` ou `paused`.

### 3. Verificar e Entregar

```sh
sh <REPO>/scripts/flow.sh verify "/pasta/job_1"
```
Confirme que `ok: true` e que o arquivo MP4 final de ~32s foi gerado e validado.

### 4. Retomar em caso de pausa

Se algum job pausar por instabilidade de rede ou fechamento de aba:
```sh
sh <REPO>/scripts/flow.sh enqueue "/pasta/job_1"
```
Nunca inicie um novo `start` para a mesma pasta.
