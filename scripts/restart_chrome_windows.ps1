param([Parameter(Mandatory=$true)][string]$Manifest)
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'Este helper e somente Windows' }
$batchRoot = Split-Path -Parent (Resolve-Path -LiteralPath $Manifest).Path
$batchManifest = Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
$retryPath = Join-Path $batchRoot 'production_retry_state.json'
if (Test-Path -LiteralPath $retryPath) {
    $retryState = Get-Content -LiteralPath $retryPath -Raw | ConvertFrom-Json
    if ($retryState.phase -eq 'waiting_google_verification_after_restart') {
        throw 'Google aguarda verificacao humana. Nao reiniciar repetidamente durante desafio ativo.'
    }
}
$progress = Get-Content -LiteralPath (Join-Path $batchRoot 'progress.json') -Raw | ConvertFrom-Json
if (-not $batchManifest.operator_pause -or -not $progress.admission_paused -or $progress.active -ne 0) {
    throw 'Proteja admissões e espere ACK com zero jobs antes de reiniciar'
}
$queuePath = Join-Path $HOME '.local/share/flow_scene_builder/queue.json'
$queue = Get-Content -LiteralPath $queuePath -Raw | ConvertFrom-Json
if (@($queue | Where-Object { $_.state -in @('queued','running') }).Count) { throw 'Fila nativa ainda ativa' }
if (@(Get-ChildItem -LiteralPath (Join-Path $HOME 'Downloads') -Filter '*.crdownload' -File).Count) {
    throw 'Existe download incompleto; reconciliar antes de fechar'
}
$homeUrl = $batchManifest.flow_home
if ($homeUrl -notmatch '^https://flow\.google\.com/(u/\d+/)?$') { throw 'Home Flow invalida' }
$inventory = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'")
$chromeIds = @($inventory.ProcessId)
$roots = @($inventory | Where-Object { $_.ParentProcessId -notin $chromeIds })
if ($roots.Count -ne 1) { throw 'Chrome ausente ou multiplas instancias: reconciliar sem presumir perfil' }
$root = $roots[0]
if ($root.CommandLine -match '--user-data-dir') { throw 'Perfil customizado: preservar sem inventar parametros' }
$chromeExe = $root.ExecutablePath
if (-not (Test-Path -LiteralPath $chromeExe)) { throw 'Executavel original ausente' }
$profile = [regex]::Match($root.CommandLine,'--profile-directory=(?:"([^"]+)"|([^ ]+))')
$arguments = @('--restore-last-session')
$settingsPath = Join-Path $HOME '.local/share/flow_scene_builder/settings.json'
$profileName = $null
if (Test-Path -LiteralPath $settingsPath) {
    $localSettings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    $profileName = $localSettings.chrome_profile_directory
}
if (-not $profileName -and $profile.Success) { $profileName = $profile.Groups[1].Value + $profile.Groups[2].Value }
if ($profileName) {
    if ($profileName -notmatch '^[A-Za-z0-9 _-]+$') { throw 'Perfil nao reconhecido' }
    $arguments += ('--profile-directory="' + $profileName + '"')
}
$arguments += $homeUrl
$record = [ordered]@{at=[DateTimeOffset]::UtcNow.ToString('o');status='closing';method='authorized_windows_process';original_pid=$root.ProcessId;home=$homeUrl;same_profile=$true}
$recordPath = Join-Path $batchRoot 'chrome_restart_last.json'
$record | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding utf8
$process = Get-Process -Id $root.ProcessId
if (-not $process.CloseMainWindow()) { throw 'Nao foi possivel solicitar fechamento normal do Chrome' }
$deadline = (Get-Date).AddSeconds(20)
do {
    Start-Sleep -Milliseconds 500
    $remaining = @(Get-Process -Name chrome -ErrorAction SilentlyContinue)
    if (-not $remaining.Count) { break }
    # Chrome can own several windows in one process. CloseMainWindow handles
    # one window; refresh before requesting the next, never force an open one.
    foreach ($windowProcess in $remaining | Where-Object { $_.Id -in $chromeIds -and $_.MainWindowHandle -ne 0 }) {
        $null = $windowProcess.CloseMainWindow()
    }
} while ((Get-Date) -lt $deadline)
if ($remaining.Count) {
    # Never discard an open window or before-unload dialog. Background-only
    # Chrome may remain after all windows closed; terminate only original PIDs.
    if (@($remaining | Where-Object { $_.MainWindowHandle -ne 0 }).Count) {
        throw 'Chrome manteve janela aberta; possivel aviso ou dados nao salvos. Nao forcado.'
    }
    foreach ($old in $remaining) {
        if ($old.Id -notin $chromeIds) { throw 'Outro Chrome apareceu durante o fechamento; nao encerrar' }
        Stop-Process -Id $old.Id -ErrorAction SilentlyContinue
    }
}
if (@(Get-Process -Name chrome -ErrorAction SilentlyContinue).Count) { throw 'Chrome nao terminou; nao abrir outra instancia' }
# Pedro pediu manter o Flow visivel; this is the interactive browser, not a service.
$opened = Start-Process -FilePath $chromeExe -ArgumentList $arguments -WindowStyle Normal -PassThru
$record.status='reopened';$record.reopened_at=[DateTimeOffset]::UtcNow.ToString('o');$record.new_pid=$opened.Id
$record | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding utf8
Write-Output ($record | ConvertTo-Json -Compress)
