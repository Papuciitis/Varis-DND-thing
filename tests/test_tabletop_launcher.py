"""A launcher downloaded from chat must find the installed project."""
from pathlib import Path
import os
import json
import shutil
import subprocess
import tempfile
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.name == "nt", "Windows launcher test")
class TabletopLauncherTests(unittest.TestCase):
    def run_restart_fixture(self, mode):
        """Run the real launcher; only OS process/network boundaries are simulated."""
        workspace = ROOT / ".test-temp"
        workspace.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=workspace) as folder:
            folder = Path(folder)
            checkout = folder / "Checkout with spaces"
            (checkout / "scripts").mkdir(parents=True)
            shutil.copyfile(ROOT / "scripts/open-tabletop.ps1", checkout / "scripts/open-tabletop.ps1")
            (checkout / "build.py").write_text("pass\n", encoding="ascii")
            for name in ("local", "room-service", "protocol"):
                target = checkout / f"tabletop/server/{name}.mjs"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("// startup fixture\n", encoding="ascii")
            state = checkout / "tabletop/shared/state.mjs"
            state.parent.mkdir(parents=True)
            state.write_text("// startup fixture\n", encoding="ascii")
            for name in ("tabletop/web/damage.mjs", "tabletop/web/grid.mjs", "web/character-conditions.js",
                         "tabletop/shared/adventure.mjs", "tabletop/shared/route-geometry.mjs", "tabletop/web/templates.mjs"):
                target = checkout / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("// startup fixture\n", encoding="ascii")
            data = checkout / ".tabletop-data"
            data.mkdir()
            (data / "preview.pid").write_text("9999\n", encoding="ascii")
            (data / "campaign.json").write_text('{"preserve":"the campaign"}', encoding="ascii")
            node = shutil.which("node") or str(
                Path(os.environ["USERPROFILE"]) / ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"
            )
            environment = {
                **os.environ, "VARA_TEST_CHECKOUT": str(checkout), "VARA_TEST_MODE": mode,
                "VARA_TEST_PYTHON": sys.executable, "VARA_TEST_NODE": node,
            }
            harness = folder / "restart-fixture.ps1"
            harness.write_text(r'''
$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Utility
$global:varaTestStarted = $false
$global:varaTestStopped = @()
function Get-Command {
  [CmdletBinding()]
  param($Name)
  if ($Name -eq 'python') { return [pscustomobject]@{Source=$env:VARA_TEST_PYTHON} }
  if ($Name -eq 'node') { return [pscustomobject]@{Source=$env:VARA_TEST_NODE} }
  return Microsoft.PowerShell.Core\Get-Command @PSBoundParameters
}
function Invoke-RestMethod {
  param($Uri,$TimeoutSec)
  $build = if ($global:varaTestStarted -or $env:VARA_TEST_MODE -eq 'current') { $env:VARA_TABLETOP_SERVER_VERSION } else { 'previous-build' }
  return [pscustomobject]@{service='vara-tabletop';mode='local';build=$build}
}
function Get-NetTCPConnection {
  param($LocalPort,$State,$ErrorAction)
  if ($LocalPort -ne 8787) { throw 'Wrong preview port.' }
  return [pscustomobject]@{LocalAddress='127.0.0.1';LocalPort=8787;State='Listen';OwningProcess=4321}
}
function Get-CimInstance {
  param($ClassName,$Filter,$ErrorAction)
  if ($Filter -ne 'ProcessId = 4321') { return $null }
  $entry = Join-Path $env:VARA_TEST_CHECKOUT 'tabletop\server\local.mjs'
  if ($env:VARA_TEST_MODE -eq 'foreign') { $entry = Join-Path $env:VARA_TEST_CHECKOUT 'another-checkout\tabletop\server\local.mjs' }
  return [pscustomobject]@{ProcessId=4321;Name='node.exe';ExecutablePath=$env:VARA_TEST_NODE;CommandLine=('"'+$env:VARA_TEST_NODE+'" "'+$entry+'"')}
}
function Get-Process {
  param($Id,$ErrorAction)
  if ($Id -ne 4321) { return $null }
  $process = [pscustomobject]@{Id=4321;Path=$env:VARA_TEST_NODE;ProcessName='node';StartTime=(Get-Date).AddHours(-2)}
  $process | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value { param($Timeout) return $true }
  return $process
}
function Stop-Process {
  param($Id,$ErrorAction)
  if ($Id -ne 4321) { throw 'The launcher attempted to stop an unrelated process.' }
  $global:varaTestStopped += $Id
}
function Start-Process {
  param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle,[switch]$PassThru,$RedirectStandardOutput,$RedirectStandardError)
  if ($WindowStyle -ne 'Hidden') { throw 'The preview must launch in the background.' }
  if ($WorkingDirectory -ne $env:VARA_TEST_CHECKOUT) { throw 'Wrong checkout used.' }
  $global:varaTestStarted=$true
  return [pscustomobject]@{Id=5432;HasExited=$false}
}
$startupError = $null
try { & (Join-Path $env:VARA_TEST_CHECKOUT 'scripts\open-tabletop.ps1') -NoBrowser }
catch { $startupError=$_.Exception.Message }
[pscustomobject]@{
  error=$startupError;started=$global:varaTestStarted;stopped=@($global:varaTestStopped);
  savedProcess=(Get-Content -LiteralPath (Join-Path $env:VARA_TEST_CHECKOUT '.tabletop-data\preview.pid') -Raw).Trim();
  campaign=(Get-Content -LiteralPath (Join-Path $env:VARA_TEST_CHECKOUT '.tabletop-data\campaign.json') -Raw)
} | ConvertTo-Json -Compress
''', encoding="utf-8-sig")
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(harness)],
                cwd=checkout, env=environment, capture_output=True, timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))
            observed = json.loads(result.stdout.decode(errors="replace").splitlines()[-1])
            observed["campaignPreserved"] = json.loads((data / "campaign.json").read_text(encoding="ascii"))
            return observed

    def test_stale_pid_file_recovers_the_verified_process_listening_on_the_port(self):
        result = self.run_restart_fixture("stale")
        self.assertIsNone(result["error"], result["error"])
        self.assertTrue(result["started"])
        self.assertEqual(result["stopped"], [4321])
        self.assertEqual(result["savedProcess"], "5432")
        self.assertEqual(result["campaignPreserved"], {"preserve": "the campaign"})

    def test_a_preview_from_another_checkout_is_not_stopped(self):
        result = self.run_restart_fixture("foreign")
        self.assertTrue(result["error"])
        self.assertFalse(result["started"])
        self.assertEqual(result["stopped"], [])
        self.assertEqual(result["campaignPreserved"], {"preserve": "the campaign"})

    def test_current_preview_is_reused_even_when_pid_file_is_stale(self):
        result = self.run_restart_fixture("current")
        self.assertIsNone(result["error"])
        self.assertFalse(result["started"])
        self.assertEqual(result["stopped"], [])

    def test_downloaded_launcher_finds_the_prototype_in_documents(self):
        workspace = ROOT / ".test-temp"
        workspace.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=workspace) as folder:
            folder = Path(folder)
            profile = folder / "Profile with spaces"
            installed = profile / "Documents/Vara-DnD/.task-tools/tabletop-prototype/scripts/open-tabletop.ps1"
            installed.parent.mkdir(parents=True)
            installed.write_text("# Diagnostic fixture; never executed.\n", encoding="utf-8")
            downloads = profile / "Downloads"
            downloads.mkdir()
            shutil.copyfile(ROOT / "Open-Vara-Tabletop.cmd", downloads / "Open-Vara-Tabletop.cmd")
            environment = os.environ.copy()
            environment["USERPROFILE"] = str(profile)
            environment.pop("VARA_TABLETOP_PROJECT", None)
            result = subprocess.run(
                [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/u", "/c", "Open-Vara-Tabletop.cmd --locate"],
                cwd=downloads, env=environment, input=b"\r\n", capture_output=True, timeout=20,
            )
            self.assertEqual(result.returncode, 0, "A downloaded launcher must resolve the actual project before starting PowerShell.")
            resolved = result.stdout.decode("utf-16-le", errors="replace").strip().strip('"')
            self.assertEqual(resolved.casefold(), str(installed.resolve()).casefold())

    def test_startup_error_code_is_preserved_after_the_pause(self):
        workspace = ROOT / ".test-temp"
        workspace.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=workspace) as folder:
            folder = Path(folder)
            (folder / "scripts").mkdir()
            (folder / "scripts/open-tabletop.ps1").write_text("exit 73\n", encoding="ascii")
            shutil.copyfile(ROOT / "Open-Vara-Tabletop.cmd", folder / "Open-Vara-Tabletop.cmd")
            result = subprocess.run(
                [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/c", "Open-Vara-Tabletop.cmd"],
                cwd=folder, input=b"\r\n", capture_output=True, timeout=20,
            )
            self.assertEqual(result.returncode, 73, "Pausing must not hide the startup failure.")


if __name__ == "__main__":
    unittest.main()
