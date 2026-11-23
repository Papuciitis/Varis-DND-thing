"""Editor exports replace monsters without erasing source collections or links."""

from pathlib import Path
import tempfile
import unittest

import yaml

from compiler import compile_data


class MonsterOverrideTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.write("z-source.yaml", {"section": "monsters", "entries": [
            {"name": "Imp", "group": "Fiends", "hp": "10", "obsolete": "old rule"},
            {"name": "Wolf", "group": "Beasts", "hp": "11"},
        ]})

    def write(self, path, document):
        file = self.root / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(yaml.safe_dump(document, sort_keys=False), encoding="utf-8")

    def override(self, name="Ash imp", **fields):
        return {"target": {"source": "z-source.yaml", "group": "Fiends", "name": "Imp"},
                "entry": {"name": name, "group": "Campaign fiends", "hp": "24", **fields}}

    def export(self, records, entries=None, path="a-custom.yaml"):
        self.write(path, {"section": "monsters", "entries": entries or [],
                          "monster_overrides": records})

    def sections(self):
        return {section["key"]: section for section in compile_data(self.root)}

    def monsters(self):
        return self.sections()["monsters"]["entries"]

    def summon(self, names):
        self.write("spells.yaml", {"section": "spells", "entries": [
            {"name": "Summon imp", "group": "Occult", "effect": "Keep this spell"},
        ]})
        self.write("summon-links.yaml", {"summon_links": [{
            "spell": "Summon imp", "group": "Occult",
            "summons": [{"monster": name, "notes": "Original note"} for name in names],
        }]})

    def test_export_adds_new_monsters_and_replaces_source_after_all_files_load(self):
        original = (self.root / "z-source.yaml").read_bytes()
        self.export([self.override()], [{"name": "Moth", "group": "Beasts", "hp": "1"}])
        monsters = {entry["name"]: entry for entry in self.monsters()}
        self.assertEqual(set(monsters), {"Moth", "Ash imp", "Wolf"})
        imp = monsters["Ash imp"]
        self.assertEqual(imp["details"], {"hp": "24"})
        self.assertEqual(imp["group"], "Campaign fiends")
        self.assertEqual(imp["source"], "z-source.yaml")
        self.assertEqual(imp["monster_target"], self.override()["target"])
        self.assertNotIn("monster_target", monsters["Moth"])
        self.assertEqual((self.root / "z-source.yaml").read_bytes(), original)

    def test_repeated_renames_keep_original_target_across_rebuilds(self):
        self.export([self.override()])
        first = next(entry for entry in self.monsters() if entry["name"] == "Ash imp")
        record = {"target": first["monster_target"],
                  "entry": {"name": "Ember imp", "group": "Changed again", "ac": "15"}}
        self.export([record])
        second = next(entry for entry in self.monsters() if entry["name"] == "Ember imp")
        self.assertEqual(second["monster_target"], first["monster_target"])
        self.assertEqual(second["source"], "z-source.yaml")
        self.assertEqual(second["details"], {"ac": "15"})
        self.assertEqual(self.monsters(), self.monsters())

    def test_original_and_current_names_resolve_summon_links_to_renamed_monster(self):
        self.export([self.override()])
        for name in ("Imp", "Ash imp"):
            with self.subTest(name=name):
                self.summon([name])
                spell = self.sections()["spells"]["entries"][0]
                self.assertEqual(spell["details"]["effect"], "Keep this spell")
                self.assertEqual(spell["details"]["summons"], [
                    {"monster": "Ash imp", "notes": "Original note"},
                ])

    def test_summon_link_cannot_reference_same_monster_through_both_aliases(self):
        self.export([self.override()])
        self.summon(["Imp", "Ash imp"])
        with self.assertRaisesRegex(ValueError, r"summon-links.yaml:.*duplicate"):
            self.sections()

    def test_target_requires_matching_original_source_group_and_name(self):
        for field, replacement in (("source", "missing.yaml"), ("group", "Other"), ("name", "Missing")):
            with self.subTest(field=field):
                record = self.override()
                record["target"][field] = replacement
                self.export([record])
                with self.assertRaisesRegex(ValueError, r"a-custom.yaml:.*unknown monster override target"):
                    self.monsters()

    def test_duplicate_targets_are_rejected_across_files(self):
        self.export([self.override()])
        self.export([self.override("Second name")], path="b-custom.yaml")
        with self.assertRaisesRegex(ValueError, r"b-custom.yaml:.*duplicate monster override target"):
            self.monsters()

    def test_renames_cannot_collide_with_current_or_original_monster_names(self):
        self.export([self.override("wolf")])
        with self.assertRaisesRegex(ValueError, r"a-custom.yaml:.*ambiguous monster name"):
            self.monsters()
        self.export([self.override()], [{"name": "imp", "group": "New group"}])
        with self.assertRaisesRegex(ValueError, r"a-custom.yaml:.*ambiguous monster name"):
            self.monsters()

    def test_other_sections_cannot_use_monster_overrides(self):
        self.write("a-custom.yaml", {"section": "spells", "entries": [], "monster_overrides": []})
        with self.assertRaisesRegex(ValueError, r"a-custom.yaml:.*collection documents"):
            self.sections()

    def test_structural_override_fields_are_rejected_with_filename(self):
        invalid = [None, {}, {"target": {}, "entry": {}},
                   {**self.override(), "section": "spells"}]
        for record in invalid:
            with self.subTest(record=record):
                self.export([record])
                with self.assertRaisesRegex(ValueError, "a-custom.yaml:"):
                    self.monsters()
        for field in ("section", "source", "monster_target", "monster_overrides"):
            with self.subTest(field=field):
                self.export([self.override(**{field: "unexpected"})])
                with self.assertRaisesRegex(ValueError, r"a-custom.yaml:.*cannot replace"):
                    self.monsters()

    def test_invalid_override_list_and_entry_names_are_errors(self):
        for records in (None, {}, "not a list"):
            with self.subTest(records=records):
                self.export(records)
                with self.assertRaisesRegex(ValueError, r"a-custom.yaml:.*must be a list"):
                    self.monsters()
        for name in ("", "  "):
            with self.subTest(name=name):
                self.export([self.override(name)])
                with self.assertRaisesRegex(ValueError, r"a-custom.yaml:.*entry name must be nonempty"):
                    self.monsters()


if __name__ == "__main__":
    unittest.main()
