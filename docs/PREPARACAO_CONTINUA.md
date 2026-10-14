# Preparar Flow continuo, custo e exportacao

## Modos e prompts

O legado continua quatro cenas de 8s, usando original nas cenas 1/2 e ultimo frame nas 3/4. `--mode frames_continuous` usa original apenas na primeira e ultimo frame exato da cena anterior em 2/3/4. Persiste vinculo de ID/hash do antecessor. Isto preserva a cadeia de imagens e permite testar continuidade visual; nao garante movimentos continuos nem e extensao nativa do video.

`presets/receita_vids_v2_flow_frames_8s.json` e separado do legado, derivado do preset Vids receita_continuidade_v2. Preserva ambiente-fonte, camera e quatro acoes: misturar/repousar fouet; bicarbonato; mel + limao; misturar/erguer tigela. Somente duracao e referencia tecnica ao ultimo frame foram adaptadas. Nao introduz suco, agua, RV ou lago. Esse preset exige modo continuo e carrega suas proprias intenções para o avaliador. Nao usar o preset legado de RV/lake no lote de ambientes diversos por conveniencia.

Saida explicita ~32s, 720x1280, 24fps e audio. Vids continua ~40s pelo seu fluxo proprio. Nao substituir contrato de 40s silenciosamente.

## Receita v2 gratuita x1

O perfil autorizado em 2026-10-06 conserva os quatro prompts da adaptacao existente, com `--outputs 1 --mode frames_continuous --preset presets/receita_vids_v2_flow_frames_8s.json --model lower --max-total-credits 0`. Exige email e home confirmados na UI. Zero deve ser revalidado em cada envio; sem fallback pago. x1 nao chama avaliador. Revisar fonte, quatro cenas, tres emendas e integridade tecnica antes de ampliar lote. O preset base permanece historico; `receita_vids_v2_flow_frames_8s_fidelidade.json` acrescenta conservacao de duas maos/contagem de objetos e limites entre acoes apos defeitos reais no piloto. Revisoes novas so afetam jobs preparados com essa versao; snapshots de jobs existentes permanecem. O titulo do projeto e o nome do final; manifesto liga imagem/hash, job, projeto e final. O tempo de producao inclui espera Lower Priority e e separado do historico Vids. Preservar os perfis dos jobs antigos.

## Preparar sem envio

Confirme email/conta, home `/u/N/`, modelo e custo diretamente na UI. O indice nao identifica sozinho a conta. Troca de quota/login nao e fallback. O default Lower Priority exige zero visivel; se indisponivel, parar. Lite pago so pode ser preparado ate autorizacao especifica.

```sh
sh scripts/flow.sh start --image "/entrada/foto.png" --name "piloto_flow_continuo" --output-root "/destino/flow_piloto" --outputs 1 --mode frames_continuous --preset presets/receita_vids_v2_flow_frames_8s.json --account-email "owner@example.com" --home "https://flow.google.com/u/2/" --model lite --max-total-credits 20 --prepare-only
sh scripts/flow.sh status --folder "/pasta/retornada"
```

Estado `prepared`/`activate_after_approval` nao pode ser reclamado pelo executor e nao cria projeto/upload/envio. Repeticao identica reutiliza o preparado. Preset, imagem, conta, modo, outputs, teto e destino distinguem o pedido. Nenhuma chamada de avaliador durante prepare-only. Status compacto inclui email/home, modo/modelo, teto/reserva e hash do preset, sem carregar prompts/candidatos.

Depois da autorizacao humana concreta para imagem, conta, modelo e teto, registrar a razao real:

```sh
sh scripts/flow.sh activate "/pasta/retornada" --reason "Autorizacao humana confirmada para este piloto e teto total"
```

Nao executar o exemplo como autorizacao ficticia. Este comando libera a fila e pode gastar creditos. x1 usa um candidato por cena, sem avaliador e sem retry pago. Cada envio registra email/home/modelo/outputs/custo e reserva conservadoramente o teto antes do clique. Conta/modelo divergentes bloqueiam. Custo atual acumulado ou projetado para as cenas restantes acima do teto bloqueia antes de enviar, inclusive antes da primeira cena, para preservar o objetivo de video completo. Revalidar o preco em cada cena. Reserva nao e extrato da conta; envio ambíguo exige reconciliacao sem novo clique. x3/x4 preservam o comparador quando autorizados; o teste pago preparado e x1.

## Quota e recuperacao

Quota/limite explicito na UI ativa hold persistente da conta. Jobs aguardando dessa conta pausam; outras contas permanecem isoladas. Resultados ja enviados podem ser baixados antes de qualquer novo envio. Retry gratuito legado revalida email/home e respeita hold; nenhum retry pago. Nunca resetar submitted, usar outra conta nem reenviar por tempo excedido. Reaproveitar IDs permanentes e caminhos existentes, conforme OPERACAO_CODEX.md.

`release-account --account-email "owner@example.com" --reason "Nova liberacao humana apos confirmar renovacao de quota"` remove o hold somente com os jobs ativos dessa conta pausados. Nao enfileira automaticamente. Revalidar conta/cota e diagnosticar individualmente antes de `enqueue`. Manifests historicos sem email continuam preservados, mas o novo executor bloqueia novas geracoes ate preparacao/vinculo explicito e diagnostico; nao inferir email do indice.

## Entrega para editor

```sh
sh scripts/flow.sh verify "/pasta/job"
sh scripts/flow.sh export-editor "/pasta/job" --output-dir "/pasta/so_finais_flow" --audio "/narracao/audio.mp3"
```

`--audio` e opcional. Se fornecido, exige faixa de audio e duracao nao maior que o video. Exporta somente o MP4 final verificado, conserva a pasta/cenas tecnicas, e recusa arquivo conflitante. Usar destino exclusivo de finais, fora do Brain. Retorno indica `editor_profile: conservative` e `review_required: true`. Nao usar `vids_receita`, cujo contrato e 39-41s, para Flow 32s. O comando nao abre nem altera o editor, nao gera narracao/legendas, e nao certifica realismo.

## Evidencia e limites

31 testes Python, 22 JS e smoke DOM usam fixtures locais, incluindo video/audio sintéticos, exportacao final, cadeia completa, conta/custo/quota, prepare-only e recusa de retry pago. Build e verify validam o pacote. Esses checks nao provam geracao real no novo modo. A continuidade visual completa e qualidade devem ser vistas no piloto antes de aumentar volume. Nao afirmar extensao nativa do Flow sem encontra-la e testa-la na conta atual.
