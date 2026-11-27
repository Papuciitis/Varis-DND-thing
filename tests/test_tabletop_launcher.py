"""A launcher downloaded from chat must find the installed project."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(os.name == "nt", "Windows launcher test")
class TabletopLauncherTests(unittest.TestCase):
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
