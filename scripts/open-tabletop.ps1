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
$url = "http://127.0.0.1:$Port/tabletop/"
$existing = $false
try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2; $existing = $health.service -eq 'vara-tabletop' -and $health.mode -eq 'local' } catch {}
if (!$existing) {
  $serverFile = Join-Path $projectRoot 'tabletop\server\local.mjs'
  $process = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $serverFile + '"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataFolder 'preview.log') -RedirectStandardError (Join-Path $dataFolder 'preview-error.log')
  Set-Content -LiteralPath (Join-Path $dataFolder 'preview.pid') -Value $process.Id
  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if ($process.HasExited) { throw (Get-Content -LiteralPath (Join-Path $dataFolder 'preview-error.log') -Raw) }
    try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 1; if ($health.service -eq 'vara-tabletop') { $ready = $true; break } } catch {}
    Start-Sleep -Milliseconds 250
  }
  if (!$ready) { throw "The preview could not be reached. Check $dataFolder\preview-error.log" }
}
Write-Output "Tabletop preview: $url"
Write-Output 'Only this isolated prototype is running; the main website is unchanged.'
if (!$NoBrowser) { Start-Process -FilePath $url }
