$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Este preparo deve rodar no Windows.' }
$env:PYTHONUTF8 = '1'
$flowRoot = Split-Path -Parent $PSScriptRoot
$flowApp = if ($env:FLOW_APP_ROOT) { $env:FLOW_APP_ROOT } else { Join-Path $HOME '.local/share/flow_scene_builder' }
$flowPython = Join-Path $flowApp 'venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $flowPython)) { throw 'Runtime ausente. Use scripts/install_windows.ps1 na primeira instalacao.' }
Push-Location $flowRoot
try {
    $flowStatusText = & $flowPython scripts/prepare_recaptcha_windows.py
    if ($LASTEXITCODE) { throw 'Falha ao conferir a instalacao atual.' }
    $flowStatus = ($flowStatusText -join "`n") | ConvertFrom-Json
    if ($flowStatus.active_jobs -gt 0) { throw 'Aguarde executor ocioso; nenhum job foi modificado.' }
    if (-not $flowStatus.package_matches_source) { throw 'Pacote e fonte diferem. Aguarde o Drive terminar a sincronizacao; nao carregar pacote incompleto.' }
    $flowSettingsPath = Join-Path $flowApp 'settings.json'
    $flowNode = $null
    if (Test-Path -LiteralPath $flowSettingsPath) {
        $flowLocalSettings = Get-Content -LiteralPath $flowSettingsPath -Raw | ConvertFrom-Json
        $flowNode = $flowLocalSettings.node_path
    }
    if (-not $flowNode) { $flowNode = (Get-Command node -ErrorAction Stop).Source }
    & $flowNode scripts/verify.mjs
    if ($LASTEXITCODE) { throw 'Pacote invalido; perfil nao foi instalado.' }
    & $flowPython scripts/prepare_recaptcha_windows.py --prepare
    if ($LASTEXITCODE) { throw 'Falha no preparo local; preserve holds e recibos.' }
    Write-Host 'Perfil Windows instalado. Recarregue somente Flow Scene Builder em chrome://extensions e rode scripts/flow.ps1 doctor.'
} finally { Pop-Location }
