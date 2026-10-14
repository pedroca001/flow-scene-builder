# Instalacao no Windows

Guia para configuracao do Flow Scene Builder nativamente no Windows (PowerShell, sem WSL).

## Requisitos
- Windows 10/11 64-bit
- Google Chrome instalado
- Python 3.10+ (instalado e adicionado ao PATH)
- FFmpeg (disponivel no PATH ou instalado pelo helper)
- Node.js 22+

## Passo a Passo

### 1. Executar o script de instalacao
No PowerShell aberto na pasta do repositorio:
```powershell
& .\scripts\install_windows.ps1 -FlowHome https://flow.google.com/u/1/
```
O script prepara o ambiente virtual Python, instala dependencias e registra o host de Native Messaging no registro do Windows (`HKCU\Software\Google\Chrome\NativeMessagingHosts`).

### 2. Carregar a extensao no Chrome
1. Abra o Google Chrome.
2. Acesse `chrome://extensions`.
3. Ative a opcao **Modo do desenvolvedor** no canto superior direito.
4. Clique em **Carregar sem compactacao** e selecione a pasta `package\` deste repositorio.

### 3. Validar a conexao
No PowerShell:
```powershell
.\scripts\flow.ps1 doctor
```
Confirme que retorna `"current": true` e `"package_exists": true`.

## Operacao no Windows

Os comandos operam de forma equivalente ao Mac:
```powershell
# Iniciar video
.\scripts\flow.ps1 start --image "C:\caminho\imagem.png" --outputs 1 --model lower --output-root "C:\caminho\entregas"

# Iniciar lote
.\scripts\flow.ps1 start-batch --images "C:\img1.png" "C:\img2.png" --outputs 1 --model lower --output-root "C:\caminho\entregas"

# Acompanhar
.\scripts\flow.ps1 watch-batch "C:\entregas\job1" "C:\entregas\job2" --timeout 55

# Validar
.\scripts\flow.ps1 verify "C:\entregas\job1"
```
