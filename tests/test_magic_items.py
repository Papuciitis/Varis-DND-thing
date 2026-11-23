"""Guard the full workbook conversion against dropped rows and broken gear links."""

from pathlib import Path
import importlib.util
import json
import re
import unittest

from compiler import compile_data


ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {"Common": 43, "Uncommon": 67, "Rare": 75, "Very Rare": 63, "Legendary": 48, "Artifact": 4}


class MagicItemTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sections = {section["key"]: section for section in compile_data(ROOT / "data")}
        cls.items = cls.sections["magic-items"]["entries"]
        cls.source = json.loads((ROOT / "data/magic-items/source/workbook.json").read_text(encoding="utf-8"))

    def test_every_workbook_item_has_one_conversion_and_verbatim_provenance(self):
        by_id = {entry["details"].get("id"): entry for entry in self.items}
        self.assertEqual(len(by_id), len(self.items), "Every item needs a unique stable ID")
        self.assertNotIn(None, by_id)
        self.assertNotIn("", by_id)
        self.assertGreaterEqual(len(self.items), 300)
        for sheet in self.source:
            rarity = sheet["name"]
            self.assertIn(rarity, EXPECTED)
            rows = sheet["rows"][1:]
            self.assertEqual(len(rows), EXPECTED[rarity])
            for row in rows:
                name_cell = next(key for key in row if re.fullmatch(r"A\d+", key))
                number = name_cell[1:]
                identity = f"mi-{rarity.lower().replace(' ', '-')}-{int(number):03}"
                with self.subTest(item=identity):
                    entry = by_id[identity]
                    details = entry["details"]
                    # Current names, prices and rarity remain editable; provenance does not.
                    self.assertEqual(details["source_name"], row[name_cell])
                    self.assertEqual(details["source_rarity"], rarity)
                    self.assertEqual(details["source_price"], row.get("B" + number, ""))
                    self.assertEqual(details["source_attunement"], row.get("C" + number, ""))
                    self.assertEqual(details["original_5e"], row.get("D" + number, "No description supplied in workbook."))
                    self.assertEqual(details["source_ref"], f"Magic item generator.xlsx — {rarity}!A{number}:D{number}")
                    for field in ("desc", "conversion_notes", "type", "attunement", "rarity", "price"):
                        self.assertTrue(str(details.get(field, "")).strip(), f"Missing {field}")
                    self.assertNotRegex(details["desc"], r"\\u[0-9a-fA-F]{4}")
                    self.assertNotRegex(details["desc"].lower(), r"\b(?:refer to|use|see) (?:the )?5e\b")
                    self.assertTrue(entry["source"].startswith("magic-items/"))

    def test_base_equipment_references_exist_and_are_unambiguous(self):
        mundane = self.sections["items"]["entries"]
        for entry in self.items:
            details = entry["details"]
            if details.get("base_item"):
                with self.subTest(item=entry["name"]):
                    matches = [item for item in mundane if item["name"].casefold() == details["base_item"].casefold()]
                    self.assertEqual(len(matches), 1, details["base_item"])
            if details.get("magic_bonus") is not None:
                with self.subTest(item=entry["name"]):
                    self.assertRegex(str(details["magic_bonus"]), r"^-?\d+$")

    def test_every_converted_item_has_a_reviewed_category(self):
        categories = {"weapons", "armor-shields", "wearables", "spellcasting", "scrolls", "consumables", "misc"}
        for entry in self.items:
            with self.subTest(item=entry["name"]):
                self.assertIn(entry["details"].get("category"), categories)
        self.assertEqual({entry["details"]["category"] for entry in self.items}, categories)

    def test_snapshot_can_be_reproduced_from_preserved_workbook(self):
        spec = importlib.util.spec_from_file_location("extract_magic", ROOT / "scripts/extract-magic-workbook.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.extract(ROOT / "data/magic-items/source/Magic-item-generator.xlsx"), self.source)

    def test_conversion_conventions_are_in_the_rules_compendium(self):
        names = {entry["name"] for entry in self.sections["rules"]["entries"]}
        self.assertTrue({"Using converted magic items", "Magic item attunement", "Magic items and Block", "Casting and tracking item powers"} <= names)


if __name__ == "__main__":
    unittest.main()
