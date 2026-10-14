# Operacao do Flow Scene Builder para o Agente / GPT

Guia de operacao rapida para iniciar, acompanhar, diagnosticar e validar geracoes no Google Flow.

---

## 1. Comandos Principais

### Iniciar geracao individual
```sh
sh scripts/flow.sh start \
  --image "/caminho/imagem_original.png" \
  --outputs 1 \
  --model lower \
  --mode frames_continuous \
  --output-root "/caminho/pasta_destino"
```

### Iniciar lote concorrente
```sh
sh scripts/flow.sh start-batch \
  --images "/caminho/img1.png" "/caminho/img2.png" "/caminho/img3.png" \
  --outputs 1 \
  --model lower \
  --mode frames_continuous \
  --output-root "/caminho/pasta_destino"
```

### Acompanhar lote ate conclusao
```sh
sh scripts/flow.sh watch-batch "/pasta/job_1" "/pasta/job_2" --timeout 55
```
- `queued/running`: trabalho em andamento normal, aguarde.
- `complete`: trabalho finalizado com sucesso.
- `paused`: trabalho pausado aguardando intervencao ou reenfileiramento.

### Consultar status detalhado
```sh
sh scripts/flow.sh status --folder "/pasta/job_1"
```

### Verificar o MP4 final gerado
```sh
sh scripts/flow.sh verify "/pasta/job_1"
```
Valida a existencia do video, duracao (~32s), resolucao 720x1280, 24fps e presenca de audio.

### Retomar job pausado
```sh
sh scripts/flow.sh enqueue "/pasta/job_1"
```

---

## 2. Diagnostico e Recuperacao

| Sintoma | Causa Provavel | Acao |
| --- | --- | --- |
| Sem conexao do executor (`doctor` com erro) | Chrome fechado ou extensao nao conectada | Abra o Chrome com a conta logada, confirme a extensao carregada em `chrome://extensions` e execute `sh scripts/flow.sh doctor`. |
| Job em `paused` com erro de conexao ou aba | Aba foi fechada ou Chrome reiniciado | Execute `sh scripts/flow.sh enqueue <pasta>` para a extensao reabrir o projeto e continuar da mesma cena. |
| Job em `paused` com aviso de limite ou quota | Limite temporario de geracoes atingido | Aguarde alguns minutos e re-enfileire com `sh scripts/flow.sh enqueue <pasta>`. |
| "Falha Não foi possível gerar o vídeo" | Erro interno do Flow na geracao daquele seed | O Flow recusou a cena; use `sh scripts/flow.sh authorize-retries --reason "Reteste cena" <pasta>` e depois `sh scripts/flow.sh enqueue <pasta>`. |

---

## 3. Boas Praticas

1. **Nao duplique jobs:** Nunca rode `start` novamente para uma imagem que ja tem pasta de job criada. Use `enqueue` para retomar.
2. **Janela do Chrome:** A automacao cria e gerencia abas em uma janela dedicada em segundo plano. Nao feche essa janela enquanto houver jobs ativos.
3. **Validacao de Entrega:** Cada subpasta concluida contem `imagem_original.png`, `cena_01.mp4` a `cena_04.mp4` e o arquivo MP4 final concatenado com o nome do projeto (ex.: `2026-10-14 13:45:42.825.mp4`).
