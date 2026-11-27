"""The experiment must not publish backend files or alter main navigation."""
from pathlib import Path
import tempfile
import unittest
from build import build


class TabletopBuildTests(unittest.TestCase):
    def test_prototype_is_a_separate_deployable_page_with_only_browser_sources(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            build(output)
            self.assertTrue((output / "tabletop/index.html").is_file())
            self.assertTrue((output / "tabletop/app.mjs").is_file())
            self.assertTrue((output / "tabletop/watchtower.svg").is_file())
            for name in ("magic-items.js", "character-state.js", "character-rules.js"):
                self.assertTrue((output / "tabletop/sheet" / name).is_file())
            self.assertFalse((output / "tabletop/server").exists())
            self.assertFalse((output / "tabletop/wrangler.jsonc").exists())
            for name in ("index.html", "character.html"):
                self.assertNotIn('href="tabletop', (output / name).read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
