# Protótipo Playwright sem extensão

## Estado

Primeira etapa implementada em 12/10/2026: transporte de navegador independente, prova local de quatro cenas e comando de sessão somente leitura. Não é ainda um executor produtivo de jobs do Flow.

O protótipo importa componentes existentes como código normal: `FlowClient`, `flowDom`, `submitScene`, fila de UI, conferência de controles e pipeline Python/FFmpeg. Não precisa da extensão instalada, Native Messaging, build do pacote ou da fila de produção.

## Requisitos

- Node.js 22+, Chrome instalado e Playwright. Versão validada: 1.64.0.
- Python do runtime existente do Flow, com Pillow e FFmpeg funcionais, para a prova de mídia.
- Runtime próprio fora do repositório e do Brain: `~/.local/share/flow_scene_builder/playwright_prototype`.

O carregador procura Playwright no runtime próprio, no `test_deps` local já existente e nas dependências do projeto. Ele apenas usa o módulo encontrado; não instala nem atualiza automaticamente.

Se necessário, instalar a dependência em pasta externa.

Windows PowerShell:

```powershell
$flowPrototypeRoot = Join-Path $HOME '.local/share/flow_scene_builder/playwright_prototype'
npm --prefix "$flowPrototypeRoot/deps" install --no-audit --no-fund playwright@1.64.0
```

macOS:

```sh
npm --prefix "$HOME/.local/share/flow_scene_builder/playwright_prototype/deps" install --no-audit --no-fund playwright@1.64.0
```

Nenhum download de Chromium é necessário: o protótipo usa o Chrome instalado. Caminhos especiais podem ser definidos com `FLOW_PLAYWRIGHT_CHROME`, `FLOW_PLAYWRIGHT_PYTHON`, `FLOW_PLAYWRIGHT_DEPS` e `FLOW_PLAYWRIGHT_ROOT`. O guia descreve os nomes, não valores de credenciais.

## Diagnóstico e teste local

Da raiz do repositório:

```sh
node scripts/flow_playwright.mjs doctor
node scripts/flow_playwright.mjs smoke
```

Para visualizar o Chrome dedicado durante o teste:

```sh
node scripts/flow_playwright.mjs smoke --headed
```

O smoke cria um servidor HTTP apenas em loopback, uma página simuladora e quatro MP4s sintéticos de oito segundos. Requisições das páginas para qualquer outro origin são bloqueadas. O Chrome usa perfil novo com extensões desabilitadas. O teste confere ausência de targets de extensão e de `connectNative` na página.

Percorre o mesmo preparo de cena da versão atual: inventário, configuração, upload por CDP, conferência do frame, prompt, registro de intenção e clique único. Depois recupera os UUIDs, baixa os arquivos e ingere cada cena no pipeline existente.

As cenas 1/3 usam o evento download do Playwright. As cenas 2/4 usam o transporte de bytes do arquivo original preparado pela UI, já existente no FlowClient. Os quatro arquivos são comparados por SHA-256 contra as fontes sintéticas.

Após o primeiro envio, fecha e reabre o Chrome com o mesmo perfil. Confere o título persistido e a cena `submitted`, recupera o resultado e exige exatamente quatro cliques para quatro cenas. A montagem confere 32s, 720x1280, áudio e lineage dos três frames seguintes.

O recibo compacto fica em `last_smoke.json` no runtime próprio. Por padrão, arquivos de trabalho criados pelo teste são retirados após encerramento, inclusive em falha. `--keep` preserva os arquivos e retorna pasta/final para diagnóstico. O teste não lê ou altera filas, manifestos, holds ou contas produtivas.

## Sessão Google somente leitura

Para deixar a janela disponível para login manual, sem encerramento por tempo:

```sh
node scripts/flow_playwright.mjs open
node scripts/flow_playwright.mjs open-status
```

`open` inicia diretamente o Chrome instalado, com o perfil dedicado já existente e a home do Flow. Durante o login manual não há conexão Playwright/CDP, modo headless ou configuração de identidade simulada. O launcher termina e o Chrome permanece aberto por conta própria. Repetir o comando reutiliza a instância do mesmo perfil, podendo acrescentar uma aba. Não criar uma janela por job. O índice da conta será conferido depois do login; não presumir que coincide com o Chrome pessoal. Nenhum teste ou geração começa automaticamente. Aguardar o OK explícito solicitado por Pedro.

No Windows, criar o atalho **Flow Playwright** na Área de Trabalho:

```powershell
./scripts/create_playwright_shortcut.ps1
```

Com `-Launch`, também abre a janela. O atalho inicia apenas esse modo de login, sem terminal visível. Não executa smoke ou geração. Launcher e recibo ficam no runtime próprio; open-status confirma somente a abertura registrada, sem afirmar que o usuário entrou ou que a janela ainda está aberta.

O comando abaixo continua sendo a alternativa de inspeção curta, com encerramento automático. Usar quando a janela persistente não estiver aberta.

Essa alternativa é um navegador controlado e pode receber recusa de login do Google. Não a usar para a autenticação inicial. Depois de login manual e autorização, a transição ao executor exige reconciliação da sessão e de propriedade antes de novos testes.

Depois de definir a home e o email reais da sessão:

```sh
node scripts/flow_playwright.mjs session --home "https://flow.google.com/u/NUMERO/" --account-email "SEU_EMAIL" --seconds 55
```

Substituir os dois valores. O índice `/u/N/` do perfil dedicado pode diferir do Chrome pessoal.

Esse comando abre uma única janela Chrome dedicada, permite login manual e consulta a conta visível por até 55s. Ao terminar, fecha sua janela e conserva o perfil local. O usuário pode executar novamente para continuar um login que demande mais tempo. O programa não faz login, extrai cookies, altera modelo, cria projeto, faz upload, gera vídeo ou tenta liberar restrições.

Saída: confirmação de correspondência da conta/home, presença de bloqueio visível e `generation_enabled: false`. Não imprime cookies, tokens, URLs assinadas ou texto de prompts. Perfil de sessão e perfis dos testes são separados.

O backend tem somente os modos `fixture` e `inspect`. Não existe modo production nem comando start produtivo. Uma chamada de escrita contra Flow real é rejeitada antes de operar o navegador. Isso permanece até integrar propriedade dos jobs, limites globais e bloqueios de conta com o serviço de domínio existente.

## Verificação

```sh
node --test tests/playwright_transport.test.mjs tests/flow_client.test.mjs tests/parallel_io.test.mjs tests/trusted_control.test.mjs tests/visible_input.test.mjs
node scripts/flow_playwright.mjs doctor
node scripts/flow_playwright.mjs smoke
```

71 testes JavaScript canônicos aprovados, incluindo nove do transporte. Provas completas headless e Chrome visível passaram no Windows:32,02s,720x1280,24fps,áudio,quatro uploads/cliques isTrusted,hashes,lineage e reinício sem duplicação.

Os testes incluem rejeição de escrita no Flow real, sites/portas indevidos, paths fora do runtime, escape por symlink/junction, sobrescrita, arquivo vazio e UUID divergente.

Prova local não confirma integração real ao Google Flow, disponibilidade da conta, login ou ausência de necessidade de foco. O Chrome visível foi validado no Windows; o código tem caminhos Windows/macOS, mas o teste real em Mac ainda precisa ocorrer.

## Próxima etapa

Diagnóstico real de12/10: screenshot confirmou CAPTCHA de Google Search em /sorry, resolvido manualmente por Pedro, seguido de "This browser or app may not be secure" no Google Accounts. Sem proxy/PAC doWindows,VPNnativa conectada,envproxy ouflagproxy doChrome nas verificações. Isso não determina a causa exata do desafio da rede. O executável era o Chrome instalado, mas havia controle Playwright. O login foi separado da automação em manual_browser.mjs. Reabertura conferida:uma instância dedicada,sem flags de controle/headless/proxy; tela de login disponível. Não declarar login aceito ou bloqueio resolvido antes da confirmação humana. Dez testes do transporte passaram, incluindo contrato da abertura manual.

Validar sessão/login e leitura da UI real; depois implementar o serviço de domínio para claims por executor, guard comum de conta/limite e recebimento de arquivos locais. Só então habilitar um piloto real autorizado, sem migrar jobs existentes automaticamente. Presets, seleção Terra e composição de gancho/receita continuam em seus módulos atuais e não foram substituídos por cópias neste protótipo.
