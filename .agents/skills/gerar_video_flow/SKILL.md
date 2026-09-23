---
name: gerar_video_flow
description: Gera videos no Google Flow pela extensao local a partir de uma imagem ou pasta, com projeto novo por imagem, ate dez trabalhos e selecao Terra x3/20. Use para iniciar, acompanhar e entregar videos deste pipeline.
---

# Gerar videos no Flow

Esta skill acompanha o repositorio Flow Scene Builder e nao precisa do Brain do criador. Resolva a raiz do repositorio pelo caminho real desta skill (suba tres niveis de diretorio a partir da pasta gerar_video_flow). Use `<REPO>/scripts/flow.sh`.

## Primeiro uso

Leia `<REPO>/AGENTS.md` e `<REPO>/docs/INSTALACAO_MACOS.md`. Instale companion, carregue package no perfil Chrome correto e confirme doctor/Codex autenticado. Nao inicie geracao apenas para testar instalacao sem pedido. Se a skill ja esta instalada, nao reinstale por rotina.

## Pedido de imagem ou lote

1. Identifique imagens iniciais e destino. Pasta de entrada sem destino diferente: use videos_flow dentro dela. Anexos sem destino: Downloads. Nao use screenshots explicativos como imagem inicial.
2. Inicie start ou start-batch com caminhos absolutos, x3 default. Guarde pastas retornadas. A extensao cria projeto novo pela home, nomeia com data/hora e opera ate dez trabalhos separados.
3. Acompanhe watch-batch --timeout 55 ate todos concluirem ou uma acao externa ser necessaria. Cenas sao sequenciais dentro do job; filas/geracoes se sobrepoem entre projetos. Nao fazer computer use a cada clique.
4. Em pausa, leia docs/OPERACAO_CODEX.md. Preservar estado/projeto e recuperar a causa antes de enqueue. Nao repetir geracao ambigua nem criar novo job para retomar.
5. Execute verify uma vez por final e entregue links absolutos. MP4 deve ter nome exatamente igual ao titulo do projeto. Use status/selection-report para caminhos, escolhas e uso, sem nova avaliacao.

## Contrato

- Quatro cenas do preset de ingredientes. Original nas cenas 1/2; ultimo frame da vencedora nas 3/4.
- Veo 3.1 Lite Lower Priority, zero creditos confirmados, 720p/9:16/8s/x3.
- GPT-5.6 Terra medium, 20 frames por video (60 por cena completa), duas pranchas por candidato; uma selecao por cena. Audio nao e analisado.
- Escolher obrigatoriamente o melhor disponivel. Sem loop por qualidade; todos falhos pausam. Nao alterar prompts/modelo silenciosamente.
- Nao operar projeto de outro job ou outra maquina. Mesmo login compartilha quota, nao fila.
- Nao afirmar auditoria visual independente sem realiza-la. Vinte frames nao certificam ausencia de defeitos.

## Comandos

```sh
sh scripts/flow.sh start --image "/entrada/foto.png" --output-root "/entregas"
sh scripts/flow.sh start-batch --images "/entrada/a.png" "/entrada/b.png" --output-root "/entregas"
sh scripts/flow.sh watch-batch "/entregas/job_a" "/entregas/job_b" --timeout 55
sh scripts/flow.sh verify "/entregas/job_a"
```

Para diagnostico e recuperacao, leia somente quando necessario `<REPO>/docs/OPERACAO_CODEX.md`. Para editar codigo, leia tambem `<REPO>/docs/ARQUITETURA.md` e atualize AGENTS no mesmo trabalho.
