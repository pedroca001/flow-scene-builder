param([string]$FlowHome, [string]$CodexPath)
$ErrorActionPreference = 'Stop'
$flowRoot = Split-Path -Parent $PSScriptRoot
$flowApp = if ($env:FLOW_APP_ROOT) { $env:FLOW_APP_ROOT } else { Join-Path $HOME '.local/share/flow_scene_builder' }
$flowPython = Join-Path $flowApp 'venv/Scripts/python.exe'
& python -c 'import sys; assert sys.version_info >= (3,10)'
if ($LASTEXITCODE) { throw 'Python 3.10+ necessario' }
if (Test-Path -LiteralPath (Join-Path $flowApp 'queue.json')) {
    $flowJobs = Get-Content -LiteralPath (Join-Path $flowApp 'queue.json') -Raw | ConvertFrom-Json
    if ($flowJobs | Where-Object { $_.state -in 'queued','running' }) { throw 'Ha jobs ativos; aguarde concluir' }
}
if (-not (Test-Path -LiteralPath $flowPython)) { & python -m venv (Join-Path $flowApp 'venv') }
if ($LASTEXITCODE) { throw 'Falha ao criar runtime' }
& $flowPython -m pip install --disable-pip-version-check -r (Join-Path $flowRoot 'requirements.txt')
if ($LASTEXITCODE) { throw 'Falha nas dependencias Python' }
Push-Location $flowRoot
try {
    & npm.cmd ci
    if ($LASTEXITCODE) { throw 'Falha nas dependencias JS' }
    & node scripts/build.mjs
    if ($LASTEXITCODE) { throw 'Falha no build' }
    & node scripts/verify.mjs
    if ($LASTEXITCODE) { throw 'Falha na verificacao' }
    $configureArgs = @()
    if ($FlowHome) { $configureArgs += @('--flow-home', $FlowHome) }
    if ($CodexPath) { $configureArgs += @('--codex-path', $CodexPath) }
    & $flowPython scripts/configure_windows.py @configureArgs
    if ($LASTEXITCODE) { throw 'Falha no registro nativo' }
} finally { Pop-Location }
