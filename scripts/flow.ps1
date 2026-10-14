$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$flowRoot = Split-Path -Parent $PSScriptRoot
$flowApp = if ($env:FLOW_APP_ROOT) { $env:FLOW_APP_ROOT } else { Join-Path $HOME '.local/share/flow_scene_builder' }
$flowPython = Join-Path $flowApp 'venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $flowPython)) { throw 'Instale primeiro com scripts/install_windows.ps1' }
if ($args.Count -gt 0 -and $args[0] -eq 'finish-hook-batch') {
    $finishArgs = @($args | Select-Object -Skip 1)
    & $flowPython (Join-Path $flowRoot 'scripts/finish_hook_batch.py') @finishArgs
} elseif ($args.Count -gt 0 -and $args[0] -eq 'verify') {
    & $flowPython (Join-Path $flowRoot 'flow_scene_builder.py') @args
} else {
    & $flowPython (Join-Path $flowRoot 'bridge.py') @args
}
exit $LASTEXITCODE
