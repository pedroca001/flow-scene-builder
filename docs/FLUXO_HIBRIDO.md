# Flow hibrido: automacao e envio pelo Computer Use

Perfil opt-in por job: `manual_send: true`. Default antigo continua automatico,
inclusive no Mac. No Windows de Pedro, lote330 usa limite local5.

A extensao cria/recupera o projeto, configura conta/modelo/custo, envia e anexa
a imagem. Registra baseline e reserva o envio, depois grava
`scene.manual_send_ready` com aba/horario. Nao cola prompt nem clica Send.
O Codex le `scripts/manual_send_status.py <manifesto>`, confere a aba pela UI,
cola o prompt canonico e clica Send pelo Computer Use.

O executor observa o aceite sem tomar a fila de foco, identifica o UUID,
baixa720p automaticamente, importa/verifica o MP4, extrai o ultimo frame e
prepara a cena seguinte. Montagem e editor locais continuam programaticos.
Retries de geracao automaticos ficam desativados nesse perfil. Guardas de
conta, custo, quota, login, baseline e identidade permanecem.

No controlador de pares, `manifest.manual_send: true` configura somente novos
jobs. Recibos externos `manual_ui_<id>.json` reservam slots antes da admissao;
com `pipeline_folder`, sao incorporados apos conferir projeto e hash da imagem.
Nao converter jobs antigos/esgotados por suposicao. Uma cena reservada sem
aceite observado continua incerta; nunca reenviar automaticamente.

Na operacao CUA, guardar externamente `hybrid_send_<id>_s<n>.json` antes do
clique e registrar o retorno depois. Se esse recibo existe, reconciliar UI e
`manual_send_observed_at` antes de qualquer acao; a lista de checkpoints pode
demorar brevemente para refletir o aceite. Nunca repetir por esse atraso.

Teste13/10: cinco hooks143..147 enviados viaCUA em5,658s e processando juntos,
cincoMP4s6s/720x1280/IDs/SHA distintos e decode aprovado. Receita142 usa
preparo/download automaticos com prompt/Send exclusivamenteCUA; resultado
real atualizado na ficha Brain, sem prometer autonomia antes de concluir.

## Reinicio Windows autorizado

Pedro autorizou o helper `scripts/restart_chrome_windows.ps1 -Manifest <manifesto>`. Protege admissao/ACK/zero jobs/downloads, fecha normalmente todas as janelas do Chrome, reabre com executavel/perfil original e restaura a sessao. Nao altera seguranca e nao manipula credenciais. Reinicializar CUA, confirmar conta Ultra/home/Lower/custo 0 e reconciliar projetos antes de recuperar. Recibos no runtime externo.
