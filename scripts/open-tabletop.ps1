param([switch]$NoBrowser, [int]$Port = 8787)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (!(Test-Path -LiteralPath $nodePath)) { throw 'Install Node.js 22 or newer, then reopen this launcher.' }
$pythonCandidates = @(
  (Join-Path $projectRoot '.venv\Scripts\python.exe'),
  (Join-Path $projectRoot '..\..\.venv\Scripts\python.exe'),
  (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe')
)
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCommand -and $pythonCommand.Source -notmatch 'WindowsApps') { $pythonCandidates += $pythonCommand.Source }
$pythonPath = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (!$pythonPath) { throw 'Python 3.12 or newer and the project requirements are needed to build the preview.' }
& $pythonPath build.py
if ($LASTEXITCODE -ne 0) { throw 'The site build failed. The tabletop server was not started.' }
$bundledWs = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright-core\lib\utilsBundle.js'
if (Test-Path -LiteralPath $bundledWs) { $env:VARA_TABLETOP_WS_MODULE = $bundledWs }
$env:PORT = [string]$Port
$dataFolder = Join-Path $projectRoot '.tabletop-data'
New-Item -ItemType Directory -Path $dataFolder -Force | Out-Null
$serverFile = Join-Path $projectRoot 'tabletop\server\local.mjs'
$serverSources = @('tabletop\server\local.mjs', 'tabletop\server\room-service.mjs', 'tabletop\server\protocol.mjs', 'tabletop\shared\state.mjs')
$sourceFingerprint = (($serverSources | ForEach-Object { (Get-FileHash -LiteralPath (Join-Path $projectRoot $_)).Hash }) -join ':')
$env:VARA_TABLETOP_SERVER_VERSION = $sourceFingerprint
$previewPidFile = Join-Path $dataFolder 'preview.pid'
$url = "http://127.0.0.1:$Port/tabletop/"
$existing = $false
try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2; $existing = $health.service -eq 'vara-tabletop' -and $health.mode -eq 'local' } catch {}
if ($existing -and $health.build -ne $sourceFingerprint) {
  $trackedServer = $null
  # The saved PID may be stale. Resolve the live listener and verify its exact
  # entry script before stopping it; a Node process from another checkout stays.
  try {
    $listenerIds = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Where-Object { $_.LocalAddress -in @('127.0.0.1', '0.0.0.0', '::') } |
      Select-Object -ExpandProperty OwningProcess -Unique)
  } catch {
    $listenerPattern = '^\s*TCP\s+127\.0\.0\.1:' + $Port + '\s+\S+\s+LISTENING\s+(\d+)\s*$'
    $listenerIds = @(& netstat.exe -ano -p TCP | ForEach-Object {
      if ($_ -match $listenerPattern) { [int]$Matches[1] }
    } | Select-Object -Unique)
  }
  $entryPath = [IO.Path]::GetFullPath($serverFile).Replace('/', '\')
  $entryPattern = '(?:^|[\s"])' + [regex]::Escape($entryPath) + '(?=$|[\s"])'
  foreach ($listenerId in $listenerIds) {
    try {
      $processInfo = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $listenerId" -ErrorAction Stop
      if (!$processInfo -or $processInfo.Name -ine 'node.exe') { continue }
      $commandLine = ([string]$processInfo.CommandLine).Replace('/', '\')
      if ($commandLine -notmatch $entryPattern) { continue }
      $trackedServer = Get-Process -Id $listenerId -ErrorAction SilentlyContinue
      if ($trackedServer) { break }
    } catch {
      # Missing process information is not authorization to stop another app.
    }
  }
  if (!$trackedServer) { throw "Port $Port has a preview from another checkout, or its process could not be verified. No process was stopped. Run this script with -Port 8788 if that preview should remain open." }
  Write-Output 'Restarting the preview to load updated game tools. Saved games are retained.'
  Stop-Process -Id $trackedServer.Id
  $trackedServer.WaitForExit(5000) | Out-Null
  $existing = $false
}
if (!$existing) {
  $process = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $serverFile + '"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataFolder 'preview.log') -RedirectStandardError (Join-Path $dataFolder 'preview-error.log')
  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if ($process.HasExited) { throw (Get-Content -LiteralPath (Join-Path $dataFolder 'preview-error.log') -Raw) }
    try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 1; if ($health.service -eq 'vara-tabletop' -and $health.build -eq $sourceFingerprint) { $ready = $true; break } } catch {}
    Start-Sleep -Milliseconds 250
  }
  if (!$ready) { throw "The preview could not be reached. Check $dataFolder\preview-error.log" }
  Set-Content -LiteralPath $previewPidFile -Value $process.Id
}
Write-Output "Tabletop preview: $url"
Write-Output 'Only this isolated prototype is running; the main website is unchanged.'
if (!$NoBrowser) { Start-Process -FilePath $url }
