# Flow Scene Builder

Automacao local para macOS que transforma imagens iniciais em videos de quatro cenas no Google Flow. O Codex recebe o pedido; a extensao Chrome opera a interface; Python/FFmpeg baixa, valida, extrai frames e monta o MP4. A selecao visual usa GPT-5.6 Terra pelo Codex CLI autenticado com ChatGPT.

## Comece aqui

Entregue ao Codex do outro Mac esta instrucao:

> Leia AGENTS.md e docs/INSTALACAO_MACOS.md deste repositorio. Instale o Flow Scene Builder neste Mac, mantendo o codigo na minha pasta codigo. Confirme a conta e a pagina inicial do Flow neste perfil do Chrome, configure o Codex CLI e rode o diagnostico. Depois aguarde minha imagem ou pasta de imagens para iniciar a geracao.

- [Instalacao completa no macOS](docs/INSTALACAO_MACOS.md)
- [Operacao e recuperacao para o Codex](docs/OPERACAO_CODEX.md)
- [Skill incluida](.agents/skills/gerar_video_flow/SKILL.md)
- [Arquitetura e testes](docs/ARQUITETURA.md)

## Comportamento

- Uma imagem cria um projeto novo pela home e pelo botao **Novo projeto**. Nome: `AAAA-MM-DD HH:MM:SS.mmm`, fuso America/Sao_Paulo.
- Ate **dez trabalhos simultaneos** por maquina, cada um com projeto, aba, estado e pasta exclusivos. Transacoes da interface sao serializadas para preservar foco; geracoes e avaliacoes podem se sobrepor.
- Quatro cenas de oito segundos. Cenas 1/2 usam a imagem original; 3/4 usam o ultimo frame exato da vencedora anterior.
- Tres alternativas por cena. O Terra analisa **20 frames por video**, em duas pranchas, e escolhe uma. Com tres candidatos validos, sao 60 frames por cena.
- Usa Veo 3.1 Lite Lower Priority, 720p, vertical 9:16, com custo zero confirmado na interface. Se essa opcao nao estiver disponivel, pausa; nao troca para geracao paga.
- Escolha obrigatoria entre os candidatos disponiveis, sem loop de regeneracao por qualidade. Falhas do Flow podem reduzir as alternativas.
- Final: aproximadamente 32 segundos, 720x1280, 24fps e audio. O nome do MP4 final e **exatamente o nome do projeto**, mais `.mp4`.

O preset incluido e especifico: bancada, tigela, bicarbonato, suco, mel, limao, agua e fouet. Ele conserva marcas e acoes do roteiro original. Nao e um gerador de roteiros arbitrarios a partir de qualquer imagem. Para outro tipo de video, adapte `presets/ugc_ingredientes.json` e as descricoes `INTENTS` do avaliador de forma coerente, antes de criar novos jobs.

## Instalacao rapida

Requisitos: macOS, Chrome, Python 3.10+ (recomendado 3.12), Node.js 22+ com npm e Codex CLI autenticado com ChatGPT e acesso ao modelo `gpt-5.6-terra`.

```sh
mkdir -p ~/codigo
cd ~/codigo
git clone https://github.com/pedroca001/flow-scene-builder.git flow_scene_builder
cd flow_scene_builder
sh scripts/install_macos.sh --flow-home https://flow.google.com/u/1/
```

Use a pasta `codigo` ja existente se o seu ambiente tiver outra raiz. O numero `/u/1` e a posicao da conta no Chrome, nao a identidade dela: confira a home correta nesse Mac e ajuste o argumento se necessario. O instalador prepara o runtime e registra o host nativo, mas **nao inicia geracoes**.

Depois, em `chrome://extensions`, ative o modo desenvolvedor e carregue a pasta `package/` deste clone como extensao sem compactacao. Execute:

```sh
sh scripts/flow.sh doctor
```

A instalacao completa, autenticacao e permissoes estao no [guia macOS](docs/INSTALACAO_MACOS.md). O instalador tambem disponibiliza a skill no usuario, sem sobrescrever skills existentes.

## Gerar e acompanhar

```sh
sh scripts/flow.sh start --image "/caminho/imagem.png" --output-root "/caminho/entregas"
sh scripts/flow.sh start-batch --images "/caminho/1.png" "/caminho/2.png" --output-root "/caminho/entregas"
sh scripts/flow.sh status
sh scripts/flow.sh watch-batch "/pasta/job_1" "/pasta/job_2" --timeout 55
sh scripts/flow.sh verify "/pasta/job_1"
```

Guarde as pastas retornadas pelo inicio. O Codex deve acompanhar ate concluir ou identificar um bloqueio concreto. Nao execute um segundo `start` para tentar recuperar uma pausa; consulte a [operacao](docs/OPERACAO_CODEX.md).

Cada subpasta de entrega contem a imagem original, `cena_01.mp4` a `cena_04.mp4` e o MP4 completo com data/hora. Candidatos, frames, rankings e estado ficam em `~/.local/share/flow_scene_builder/jobs/`, fora do repositorio. Nao mova uma entrega enquanto o job estiver ativo: o caminho faz parte da identidade do estado.

## Conta compartilhada e limites

Cada Mac precisa da propria instalacao, login no Chrome e login do Codex. O repositorio nao leva cookies, tokens, imagens ou videos de teste. Nao copie perfis do Chrome nem credenciais entre maquinas.

Duas maquinas podem criar projetos separados na mesma conta Flow, mas compartilham a capacidade e os limites dessa conta. O teto de dez e local, sem coordenacao entre computadores. Nao operem o mesmo projeto simultaneamente. Comece o outro Mac com uma imagem; aumente o lote depois de validar a instalacao.

A selecao consome a cota ChatGPT/Codex, mesmo quando o Flow exibe zero creditos. A disponibilidade do modelo depende da conta e da versao do CLI. Vinte frames sao uma amostragem; escolher o melhor candidato nao garante ausencia de defeitos.

## Estado da verificacao

O fluxo foi exercitado em um Mac com dez projetos, 40 cenas e dez finais verificados. Houve recuperacoes supervisionadas por alta demanda, carregamento de cards e acesso ao SSD. O pacote portatil tem testes locais e de instalacao isolada; a instalacao em outro Mac precisa do primeiro teste real. O adaptador depende da interface do Flow e pode precisar de ajuste quando ela mudar.
