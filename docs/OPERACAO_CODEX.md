# Operacao para o Codex

## Entrada e inicio

Leia `AGENTS.md`. Confirme quais arquivos sao imagens iniciais, ignorando resultados antigos. Uma imagem corresponde a um trabalho de quatro cenas. Para pasta de imagens sem destino separado, use `videos_flow` dentro dela. Anexos sem destino podem usar Downloads. Midia nunca deve ir para este repositorio ou para um vault textual.

```sh
sh scripts/flow.sh start --image "/entrada/1.png" --output-root "/entregas"
sh scripts/flow.sh start-batch --images "/entrada/1.png" "/entrada/2.png" --output-root "/entregas"
```

Inicie todas as entradas antes de esperar a anterior. O limite local e dez; excedentes aguardam. Cada job devolve sua pasta unica. Guarde esses paths e nunca use um projeto antigo por conveniencia. `--project URL` so atende pedido explicito de projeto existente. Nao adicione geracoes manuais ao mesmo projeto ativo.

## Acompanhamento

```sh
sh scripts/flow.sh watch-batch "/entregas/job_1" "/entregas/job_2" --timeout 55
sh scripts/flow.sh status --folder "/entregas/job_1"
```

Continue ate todos terminarem ou ate uma acao externa ser indispensavel. O watcher faz polling local sem chamadas de modelo. Se retornar session_id, aguarde a mesma sessao; nao crie watchers duplicados. Progresso pode ocorrer entre projetos: uma pausa nao exige interromper o lote.

- `queued/running`: acompanhar; fila aguardando vaga e normal.
- `complete`: executar `verify` uma vez, exigir `ok: true` e guardar o final retornado no status.
- `paused`: diagnosticar a causa, preservar projetos, arquivos e resultados; retomar somente depois de resolver.

```sh
sh scripts/flow.sh verify "/entregas/job_1"
sh scripts/flow.sh selection-report "/entregas/job_1"
```

Nao tratar escolha automatica como auditoria visual independente. O relatorio de selecao le resultados/tokens salvos sem nova chamada. Os nomes finais vem do titulo persistido do Flow, nao do horario de conclusao.

## Recuperacao

| Sinal | Acao |
| --- | --- |
| Sem conexao do executor | Executar doctor; conferir Chrome aberto, perfil correto e extensao carregada. Instalar/recarregar apenas se necessario. |
| Projeto criado, titulo pendente | Retomar a mesma URL/aba. Nunca criar outro projeto. O editor precisa de selecao completa confiavel, insercao CDP e confirmacao apos reload. |
| Login, desafio humano, termos ou limite ativo | Pedir a acao especifica ao usuario; nao contornar nem trocar para modelo pago. |
| submitted sem resposta | Buscar assets existentes. Nao reenviar prompt nem mudar o manifesto para ready por suposicao. |
| Todos os slots falhos | Preservar falhas e informar. Sem loop automatico. Recuperacao tecnica explicitamente autorizada deve ser limitada e registrar cards/IDs, motivo e ausencia de cobranca quando aplicavel. |
| Erro para abrir/baixar asset | Recuperar o carregamento do mesmo UUID pela UI. Nao gerar outro video. |
| Mais resultados que slots | Conferir grupos, prompt/frame de origem e UUIDs na UI. Nao escolher os primeiros do grid. Vinculo manual e manutencao com evidencia preservada. |
| Avaliacao iniciada sem resposta | Preservar attempt/answer/selection/usage. Verificar processo em andamento e resposta salva antes de chamar qualquer modelo novamente. |
| JSON de avaliacao inconsistente | Preservar resposta original e registrar qualquer reparo. Nao inventar evidencias nem trocar o vencedor para satisfazer schema. |
| Selecao salva, copia ao SSD parada | Inspecionar processo e acesso ao volume. Se Mac bloqueado impedir isso, solicitar desbloqueio. Nao repetir avaliacao. Reconciliar workers antigos antes de avancar. |
| Avisos de geracoes antigas no grid | Sao historico, nao bloqueio de conta. Diferenciar de alertas e dialogs atuais. Nao apagar cards para ocultar erro. |
| Falha de extracao de 20 frames | Diagnosticar o MP4 e indices decodificaveis; conservar o candidato, sem nova geracao. |

Apos resolver:

```sh
sh scripts/flow.sh enqueue "/entregas/job_1"
sh scripts/flow.sh watch "/entregas/job_1" --timeout 55
```

`enqueue` nao resolve uma causa sozinho e e idempotente enquanto queued/running. Nao forcar estado por JSON para vencer um guard. Jobs completos nao sao reenfileirados. O modo legado x1 tem recuperacao limitada de audio; essa regra nao cria retries automaticos para x3.

## Entrega

Fornecer link local absoluto do final e da pasta. Para lotes, um indice imagem -> pasta -> titulo -> URL do projeto facilita conferencia. Conservar originais e resultados anteriores. A saida contem imagem, quatro cenas e final; os candidatos e pranchas ficam no cache tecnico. Exportar candidatos apenas se solicitado.
