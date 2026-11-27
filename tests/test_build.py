"""Build contracts needed by both file URLs and GitHub Pages."""

from html.parser import HTMLParser
from pathlib import Path
import json
import re
import tempfile
import unittest

from build import build


class Assets(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.external = []
        self.links = []
        self.feed(html)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "script" and attrs.get("src"):
            self.external.append(attrs["src"])
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.external.append(attrs.get("href"))
        if tag == "a":
            self.links.append(attrs.get("href", ""))


class BuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.output = Path(cls.temp.name) / "repository-prefix"
        build(cls.output)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_character_sheet_is_in_the_deployable_build(self):
        self.assertTrue((self.output / "character.html").is_file(),
                        "The build must include the character sheet, not just the compendium")

    def test_patch_notes_are_generated_from_the_shared_history_and_linked_on_both_pages(self):
        notes = (self.output / "patch-notes.html").read_text(encoding="utf-8")
        self.assertIn("Character creation and spellcasting", notes)
        self.assertIn("Cast spell", notes)
        self.assertNotIn("PATCH_NOTES_CONTENT", notes)
        for page in ("index.html", "character.html"):
            self.assertIn("patch-notes.html", Assets((self.output / page).read_text(encoding="utf-8")).links)
        portable = (self.output / "offline/patch-notes.html").read_text(encoding="utf-8")
        self.assertEqual(Assets(portable).external, [])
        self.assertIn("Character creation and spellcasting", portable)

    def test_normal_pages_use_small_relative_assets_and_no_embedded_rules(self):
        for page in ("index.html", "character.html"):
            html = (self.output / page).read_text(encoding="utf-8")
            self.assertLess(len(html.encode("utf-8")), 18000)
            self.assertNotIn("globalThis.DND_CATALOG=", html)
            self.assertNotIn("globalThis.DND_CHARACTER_RULES=", html)
            assets = Assets(html).external
            self.assertGreater(len(assets), 2)
            for asset in assets:
                self.assertFalse(asset.startswith(("/", "http")))
                self.assertTrue((self.output / asset).is_file(), asset)

    def test_manifest_sections_are_separate_and_builder_metadata_is_not_a_section(self):
        manifest = json.loads((self.output / "data/catalog-manifest.json").read_text(encoding="utf-8"))
        self.assertRegex(manifest["version"], r"^catalog-[a-f0-9]{12}$")
        self.assertLess((self.output / "data/catalog-manifest.json").stat().st_size, 5000)
        self.assertIn("monsters", [s["key"] for s in manifest["sections"]])
        for summary in manifest["sections"]:
            section = json.loads((self.output / summary["url"]).read_text(encoding="utf-8"))
            self.assertEqual(section["key"], summary["key"])
            self.assertEqual(len(section["entries"]), summary["count"])
        builder = json.loads((self.output / manifest["builder"]).read_text(encoding="utf-8"))
        self.assertTrue(builder["classes"])
        portable = (self.output / "data/portable-catalog.js").read_text(encoding="utf-8")
        self.assertIn("globalThis.DND_CATALOG=", portable)
        self.assertNotIn("<script>", portable)

    def test_portable_pages_are_self_contained_and_share_the_rules_fingerprint(self):
        versions = []
        for page in ("index.html", "character.html"):
            with self.subTest(page=page):
                path = self.output / "offline" / page
                self.assertTrue(path.is_file(), f"Missing {page}")
                html = path.read_text(encoding="utf-8")
                self.assertEqual(Assets(html).external, [], "Opening from disk must not require external scripts or CSS")
                self.assertIn("globalThis.DND_CATALOG=", html)
                version = re.search(r"globalThis\.DND_RULES_VERSION='(catalog-[a-f0-9]{12})'", html)
                self.assertIsNotNone(version, "Backups need the compiled rules fingerprint")
                versions.append(version.group(1))
        self.assertEqual(len(set(versions)), 1)
        manifest = json.loads((self.output / "data/catalog-manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(versions[0], manifest["version"])

    def test_page_navigation_works_under_a_repository_prefix(self):
        index = Assets((self.output / "index.html").read_text(encoding="utf-8"))
        self.assertIn("character.html", index.links)
        sheet = self.output / "character.html"
        self.assertTrue(sheet.is_file(), "Missing sheet navigation target")
        self.assertIn("index.html", Assets(sheet.read_text(encoding="utf-8")).links)
        self.assertTrue((self.output / ".nojekyll").exists())


if __name__ == "__main__":
    unittest.main()
