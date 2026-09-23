# Instalacao em outro Mac

## Antes de instalar

Mantenha este repositorio dentro da sua pasta de codigo. Nao copie `package/` isoladamente: a extensao depende do companion Python, do preset e da configuracao Native Messaging.

Requisitos:

- macOS e Google Chrome. O pipeline foi exercitado em Apple Silicon; Intel depende das dependencias disponiveis e precisa de validacao local.
- Python 3.10+ com venv (3.12 recomendado), instalado pelo metodo habitual ou pelo [site do Python](https://www.python.org/downloads/macos/).
- Node.js 22+ com npm, pelo [site do Node.js](https://nodejs.org/en/download).
- Codex CLI com login ChatGPT e acesso a `gpt-5.6-terra`. Consulte a [documentacao oficial do CLI](https://developers.openai.com/codex/cli). Se nao estiver instalado: `npm install -g @openai/codex`; depois `codex login` e `codex login status`.
- Conta do Flow que apresente Veo 3.1 Lite Lower Priority com zero creditos. Ter a mesma conta de outra pessoa nao instala dependencias nem autentica o Codex desse computador.

## Instalar o companion

Na pasta do clone:

```sh
sh scripts/install_macos.sh --flow-home https://flow.google.com/u/1/
```

Abra antes a home do Flow no perfil correto do Chrome. Confira qual conta esta selecionada e use a URL real, por exemplo `/u/0/` ou `/u/1/`. O instalador salva somente configuracao nao secreta em `~/.local/share/flow_scene_builder/settings.json`.

Opcoes, quando necessarias:

```sh
FLOW_BOOTSTRAP_PYTHON=/caminho/python3.12 sh scripts/install_macos.sh --flow-home https://flow.google.com/u/0/
sh scripts/install_macos.sh --codex-path /caminho/absoluto/codex
sh scripts/install_macos.sh --skip-skill
```

O instalador cria/reutiliza `~/.local/share/flow_scene_builder/venv`, instala `requirements.txt`, instala dependencias JS bloqueadas, gera `package/` e registra o native host. Nao usa sudo, nao inicia geracoes e nao copia autenticacoes. Recusa atualizacao com jobs queued/running. Configuracoes existentes sao preservadas, salvo opcoes explicitamente fornecidas.

O registro fica em `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.pedro.flow_scene_builder.json`. O namespace e legado e estavel; nao contem a conta do criador. O launcher registrado aponta para o clone atual e seu Python. Se mover o clone, execute o instalador novamente sem jobs ativos.

## Carregar no Chrome

1. Abra `chrome://extensions` no perfil que usa o Flow.
2. Ative **Modo do desenvolvedor**.
3. Selecione **Carregar sem compactacao** e escolha `package/` dentro deste clone.
4. Confira **Flow Scene Builder**, ID `bfmafbgdjkmoamhaebgdedllgbdojmcl`.
5. Mantenha Chrome aberto. Nao instale outra copia da mesma extensao em um segundo perfil para disputar a mesma fila.

A extensao usa tabs/scripting/debugger para entradas confiaveis na UI, downloads para os videos, storage para estado de abas, alarms para consultar a fila e nativeMessaging para falar com Python. Hosts ficam restritos ao Flow. A chave do manifesto e publica e mantem o mesmo ID em outro Mac.

## Verificar

```sh
sh scripts/flow.sh doctor
codex login status
```

`package_exists` e `host_registered` devem ser true. Apos o Chrome carregar a extensao, `extension_connection` deve existir e indicar build atual. Autenticacao do Flow e validada na pagina; a do Codex e separada. O preflight x3 exige CLI autenticado com ChatGPT. Modelo indisponivel deve ser diagnosticado, nao substituido silenciosamente.

O instalador cria um symlink em `~/.agents/skills/gerar_video_flow` quando esse nome esta livre; nao sobrescreve outra skill. O projeto tambem inclui `.agents/skills/gerar_video_flow/SKILL.md`, utilizavel ao abrir a pasta no Codex. Se o agente ja estava aberto, abra uma nova tarefa no projeto para redescobrir a skill. Veja [skills do Codex](https://developers.openai.com/codex/skills).

## Primeiro teste e uso do SSD

Comece com uma imagem e entrega em Downloads. Espere o final, rode `verify`, entao aumente o lote. Use o comando em `README.md` ou simplesmente peca ao Codex para gerar o video com a imagem.

Se a entrega for em SSD externo, confirme que o volume esta montado e permita o acesso do Chrome quando o macOS solicitar. Mantenha o Mac desbloqueado na primeira execucao para ver esses pedidos. O processo nativo pode ficar aguardando acesso ao volume mesmo quando o terminal consegue gravar nele. Nao desconecte nem renomeie o volume enquanto houver jobs ativos.

## Atualizacoes

Sem jobs ativos: obtenha a nova versao e rode novamente `sh scripts/install_macos.sh`. O handshake detecta o novo build e recarrega a extensao quando o executor fica ocioso. Se nao conectar, recarregue somente a extensao em `chrome://extensions`. Nao reinicie durante um envio ambiguo ou processamento ativo.
