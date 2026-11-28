"""Review annotations stay traceable and can never become character spell grants."""

from copy import deepcopy
from pathlib import Path
from catalog_expectations import ORIGINAL_MONSTER_SOURCES
import tempfile
import unittest

import yaml

from compiler import RulesLoader, compile_data
from character_rules import compile_character_rules
from geomancy_review import apply_geomancy_review


ROOT = Path(__file__).resolve().parents[1]


def fixture():
    return {
        "geomancy-review": {"entries": [{"name": "Source spell", "group": "Cantrips",
            "source": "geomancy-review/source.yaml", "details": {"level": "0", "description": "Original rules."}}]},
        "spells": {"entries": [{"name": "Current spell", "group": "Mystic spells", "details": {"lvl": "1"}}]},
    }


def snapshot():
    return [("reviewed.yaml", {"section": "geomancy-review", "entries": [{"name": "Source spell",
        "group": "Cantrips", "level": "0", "description": "Original rules.", "review": "Keep as a Mystic cantrip."}]})]


def decision(**changes):
    record = {"name": "Source spell", "status": "needs-design", "decision": "An author decision remains."}
    record.update(changes)
    return {"geomancy_decisions": [record]}


class ReviewOverlayTests(unittest.TestCase):
    def test_review_is_attached_once_without_replacing_source_rules_or_spells(self):
        sections = fixture()
        original_spells = deepcopy(sections["spells"])
        apply_geomancy_review(snapshot(), decision(), sections)
        self.assertEqual(len(sections["geomancy-review"]["entries"]), 1)
        details = sections["geomancy-review"]["entries"][0]["details"]
        self.assertEqual(details["description"], "Original rules.")
        self.assertEqual(details["review"], "Keep as a Mystic cantrip.")
        self.assertEqual(sections["spells"], original_spells)

    def test_conflicting_source_text_and_repeated_snapshots_are_rejected(self):
        copies = snapshot()
        copies[0][1]["entries"][0]["description"] = "Silently changed rules."
        with self.assertRaisesRegex(ValueError, "changes original rules"):
            apply_geomancy_review(copies, None, fixture())
        with self.assertRaisesRegex(ValueError, "duplicate review snapshot"):
            apply_geomancy_review(snapshot() + snapshot(), None, fixture())

    def test_unknown_targets_and_unsupported_current_spell_links_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "unknown decision target"):
            apply_geomancy_review(snapshot(), decision(name="Invented target"), fixture())
        with self.assertRaisesRegex(ValueError, "unknown related current spell"):
            apply_geomancy_review(snapshot(), decision(related_spells=[{"group": "Mystic spells", "name": "Invented spell"}]), fixture())
        with self.assertRaisesRegex(ValueError, "notes must be nonempty text"):
            apply_geomancy_review(snapshot(), decision(related_spells=[{"group": "Mystic spells", "name": "Current spell", "notes": []}]), fixture())

    def test_present_but_empty_decisions_file_is_an_error(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "geomancy-review" / "decisions.yaml"
            target.parent.mkdir()
            target.write_text("", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "review decisions document must not be empty"):
                compile_data(root)

    def test_drafts_require_complete_rules_with_a_supported_magic_class_and_level(self):
        conversion = {"name": "New draft", "magic_class": "Mystic", "level": "0", "casting": "1 action",
                      "components": "Verbal", "range": "30 feet", "duration": "Instantaneous", "effect": "Proposed rules."}
        sections = fixture()
        apply_geomancy_review(snapshot(), decision(status="draft", conversion=conversion), sections)
        self.assertEqual(sections["geomancy-review"]["entries"][0]["details"]["review_conversion"], conversion)
        self.assertEqual(len(sections["spells"]["entries"]), 1)
        for invalid in ({**conversion, "level": "9"}, {**conversion, "magic_class": "Druid"},
                        {key: value for key, value in conversion.items() if key != "effect"}):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                apply_geomancy_review(snapshot(), decision(status="draft", conversion=invalid), fixture())
        with self.assertRaisesRegex(ValueError, "require a conversion"):
            apply_geomancy_review(snapshot(), decision(status="draft"), fixture())

    def test_legacy_misspelling_retains_its_comment_and_never_swallows_another_review(self):
        copies = snapshot()
        record = copies[0][1]["entries"][0]
        record["revidew"] = record.pop("review")
        sections = fixture()
        apply_geomancy_review(copies, None, sections)
        self.assertIn("Keep as a Mystic", sections["geomancy-review"]["entries"][0]["details"]["review"])
        record["review"] = "A conflicting second comment."
        with self.assertRaisesRegex(ValueError, "multiple review fields"):
            apply_geomancy_review(copies, None, fixture())


class GeomancyDecisionCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sections = compile_data(ROOT / "data")
        cls.catalog = {section["key"]: section for section in cls.sections}
        cls.entries = cls.catalog["geomancy-review"]["entries"]

    def test_all_author_comments_survive_and_original_fields_are_preserved(self):
        entries = {entry["name"]: entry for entry in self.entries}
        comments = {}
        for file in (ROOT / "data/geomancy-review-but-like-reviewed-this-time").glob("*.yaml"):
            source = yaml.load(file.read_text(encoding="utf-8-sig"), Loader=RulesLoader)
            for record in source["entries"]:
                text = record.get("review", record.get("revidew"))
                if text:
                    comments[record["name"]] = text
        self.assertEqual(len(comments), 140)
        for name, text in comments.items():
            self.assertEqual(entries[name]["details"]["review"], text, name)
        for file in (ROOT / "data/geomancy-review").glob("source-*.yaml"):
            source = yaml.load(file.read_text(encoding="utf-8-sig"), Loader=RulesLoader)
            for record in source["entries"]:
                details = entries[record["name"]]["details"]
                for key, value in record.items():
                    if key not in {"name", "group"}:
                        actual = details.get('source_summons', details[key]) if key == 'summons' else details[key]
                        self.assertEqual(actual, value, (record["name"], key))

    def test_reviewed_entries_have_dispositions_and_gaps_remain_explicit(self):
        self.assertEqual(len(self.entries), 156)
        reviewed = [entry for entry in self.entries if "review" in entry["details"]]
        self.assertTrue(all(entry["details"].get("review_decision") for entry in reviewed))
        for name in ("Earth's Guidance", "Stone's Embrace"):
            self.assertEqual(next(entry for entry in self.entries if entry["name"] == name)["details"]["review_status"], "source-missing")
        self.assertTrue(any(entry["details"]["review_status"] == "unreviewed" for entry in self.entries))

    def test_conversions_are_review_only_and_do_not_change_character_metadata(self):
        self.assertEqual(len(self.catalog["spells"]["entries"]), 439)
        original = [e for e in self.catalog["monsters"]["entries"] if e["source"] in ORIGINAL_MONSTER_SOURCES]
        self.assertEqual(len(original), 160)
        drafts = [entry for entry in self.entries if entry["details"]["review_status"] == "draft"]
        self.assertGreaterEqual(len(drafts), 20)
        self.assertTrue(all(entry["details"]["review_conversion"] for entry in drafts))
        without_review = [section for section in self.sections if section["key"] != "geomancy-review"]
        self.assertEqual(compile_character_rules(self.sections), compile_character_rules(without_review))


if __name__ == "__main__":
    unittest.main()
