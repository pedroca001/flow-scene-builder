param([switch]$Launch)
$ErrorActionPreference = 'Stop'
$flowCodeRoot = Split-Path -Parent $PSScriptRoot
$flowNode = (Get-Command node.exe -ErrorAction Stop).Source
$flowWscript = Join-Path $env:WINDIR 'System32/wscript.exe'
$flowRuntime = if ($env:FLOW_PLAYWRIGHT_ROOT) { [IO.Path]::GetFullPath($env:FLOW_PLAYWRIGHT_ROOT) } else { Join-Path $env:USERPROFILE '.local/share/flow_scene_builder/playwright_prototype' }
$flowCli = Join-Path $PSScriptRoot 'flow_playwright.mjs'
$flowLauncher = Join-Path $flowRuntime 'open_flow.vbs'
$flowShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Flow Playwright.lnk'
New-Item -ItemType Directory -Path $flowRuntime -Force | Out-Null
$flowCommand = '"' + $flowNode + '" "' + $flowCli + '" open'
$flowVbs = 'CreateObject("WScript.Shell").Run "' + $flowCommand.Replace('"', '""') + '", 0, False'
Set-Content -LiteralPath $flowLauncher -Value $flowVbs -Encoding Unicode
$flowShell = New-Object -ComObject WScript.Shell
$flowLink = $flowShell.CreateShortcut($flowShortcut)
if ((Test-Path -LiteralPath $flowShortcut) -and ($flowLink.TargetPath -ne $flowWscript -or $flowLink.Arguments -ne ('"' + $flowLauncher + '"'))) {
    throw 'Atalho existente pertence a outro aplicativo; preservado.'
}
$flowLink.TargetPath = $flowWscript
$flowLink.Arguments = '"' + $flowLauncher + '"'
$flowLink.WorkingDirectory = $flowCodeRoot
$flowLink.Description = 'Flow sem extensao: Chrome dedicado para login manual. Aguarda autorizacao antes dos testes.'
$flowChrome = Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'
if (Test-Path -LiteralPath $flowChrome) { $flowLink.IconLocation = $flowChrome + ',0' }
$flowLink.WindowStyle = 7
$flowLink.Save()
$flowCheck = $flowShell.CreateShortcut($flowShortcut)
if ($flowCheck.TargetPath -ne $flowWscript -or $flowCheck.Arguments -ne ('"' + $flowLauncher + '"')) { throw 'Atalho nao confirmou destino.' }
if ($Launch) { Start-Process -FilePath $flowWscript -ArgumentList ('"' + $flowLauncher + '"') -WindowStyle Hidden }
[pscustomobject]@{ shortcut = $flowShortcut; launched = [bool]$Launch; generation_enabled = $false } | ConvertTo-Json
