[CmdletBinding()]
param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'

function Test-Python {
    param([string]$Executable, [string[]]$Prefix = @())
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf) -or $Executable -match '[\\/]WindowsApps[\\/]') {
        return $false
    }
    try {
        & $Executable @Prefix -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)' 2>$null
        return $LASTEXITCODE -eq 0
    }
    catch {
        return $false
    }
}

function Find-Python {
    $commands = @(Get-Command -Name 'py.exe', 'python.exe', 'python3.exe' -CommandType Application -All -ErrorAction SilentlyContinue)
    foreach ($command in $commands) {
        if ($command.Name -eq 'py.exe') {
            foreach ($selector in @('-3.12', '-3')) {
                if (Test-Python -Executable $command.Source -Prefix @($selector)) {
                    return @{ Executable = $command.Source; Prefix = @($selector) }
                }
            }
        }
        elseif (Test-Python -Executable $command.Source) {
            return @{ Executable = $command.Source; Prefix = @() }
        }
    }
    if ($env:USERPROFILE) {
        $bundled = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
        if (Test-Python -Executable $bundled) {
            return @{ Executable = $bundled; Prefix = @() }
        }
    }
    throw 'Python 3.12 or newer was not found. Install Python from python.org (include the Python launcher or add Python to PATH), then run Open-Vara-DnD.cmd again. The Microsoft Store WindowsApps aliases cannot build this site.'
}

function Invoke-PythonStep {
    param([string]$Executable, [string[]]$Arguments, [string]$FailureMessage)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FailureMessage (exit code $LASTEXITCODE)."
    }
}

try {
    $repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
    $buildScript = Join-Path $repoRoot 'build.py'
    $requirements = Join-Path $repoRoot 'requirements.txt'
    if (-not (Test-Path -LiteralPath $buildScript -PathType Leaf) -or -not (Test-Path -LiteralPath $requirements -PathType Leaf)) {
        throw 'The launcher must stay inside the Varis DnD repository, with build.py and requirements.txt beside its scripts folder.'
    }

    $venvDirectory = Join-Path $repoRoot '.venv'
    $python = Join-Path $venvDirectory 'Scripts/python.exe'
    if (Test-Path -LiteralPath $python -PathType Leaf) {
        if (-not (Test-Python -Executable $python)) {
            throw 'The repository .venv needs Python 3.12 or newer and may belong to an old installation. Remove the .venv folder and run Open-Vara-DnD.cmd again to recreate it.'
        }
    }
    else {
        $runtime = Find-Python
        Write-Host 'Creating the local Python environment...'
        Invoke-PythonStep -Executable $runtime.Executable -Arguments ($runtime.Prefix + @('-m', 'venv', $venvDirectory)) -FailureMessage 'Could not create .venv; check that this folder is writable and the Python installation includes venv'
        if (-not (Test-Python -Executable $python)) {
            throw 'Python did not create a usable .venv. Remove the .venv folder and retry with a complete Python 3.12 or newer installation.'
        }
    }

    $dependencyCheck = @'
import importlib.metadata
from pathlib import Path
import re
import sys
for line in Path(sys.argv[1]).read_text(encoding='utf-8').splitlines():
    line = line.strip()
    if not line or line.startswith('#'):
        continue
    pinned = re.fullmatch(r'([A-Za-z0-9_.-]+)==([^\s;]+)', line)
    if not pinned:
        raise SystemExit(1)
    try:
        if importlib.metadata.version(pinned[1]) != pinned[2]:
            raise SystemExit(1)
    except importlib.metadata.PackageNotFoundError:
        raise SystemExit(1)
'@
    & $python -c $dependencyCheck $requirements
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Installing the pinned build dependencies (internet required on the first run)...'
        Invoke-PythonStep -Executable $python -Arguments @('-X', 'utf8', '-m', 'pip', 'install', '--disable-pip-version-check', '-r', $requirements) -FailureMessage 'Dependency installation failed; check the internet connection and run the launcher again'
    }

    Write-Host 'Building the rules compendium and character sheet...'
    Invoke-PythonStep -Executable $python -Arguments @($buildScript) -FailureMessage 'The site build failed; review the error above and fix the source before retrying'
    $sheet = Join-Path $repoRoot 'site/character.html'
    if (-not (Test-Path -LiteralPath $sheet -PathType Leaf)) {
        throw 'The build completed without site/character.html. Check that this checkout includes the character sheet sources.'
    }
    if ($NoBrowser) {
        Write-Host "Built successfully: $sheet"
    }
    else {
        Start-Process -FilePath $sheet
        Write-Host "Opened: $sheet"
    }
    exit 0
}
catch {
    Write-Host ''
    Write-Host 'Varis DnD could not open.' -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}
