"""Build contracts needed by both file URLs and GitHub Pages."""

from html.parser import HTMLParser
from pathlib import Path
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

    def test_pages_are_self_contained_and_share_the_rules_fingerprint(self):
        versions = []
        for page in ("index.html", "character.html"):
            with self.subTest(page=page):
                path = self.output / page
                self.assertTrue(path.is_file(), f"Missing {page}")
                html = path.read_text(encoding="utf-8")
                self.assertEqual(Assets(html).external, [], "Opening from disk must not require external scripts or CSS")
                self.assertIn("globalThis.DND_CATALOG=", html)
                version = re.search(r"globalThis\.DND_RULES_VERSION='(catalog-[a-f0-9]{12})'", html)
                self.assertIsNotNone(version, "Backups need the compiled rules fingerprint")
                versions.append(version.group(1))
        self.assertEqual(len(set(versions)), 1)

    def test_page_navigation_works_under_a_repository_prefix(self):
        index = Assets((self.output / "index.html").read_text(encoding="utf-8"))
        self.assertIn("character.html", index.links)
        sheet = self.output / "character.html"
        self.assertTrue(sheet.is_file(), "Missing sheet navigation target")
        self.assertIn("index.html", Assets(sheet.read_text(encoding="utf-8")).links)
        self.assertTrue((self.output / ".nojekyll").exists())


if __name__ == "__main__":
    unittest.main()
