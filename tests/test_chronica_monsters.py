"""Regression coverage for the campaign import, including source omissions."""
import importlib.util
import json
from pathlib import Path
import re
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("chronica_import", ROOT / "scripts/import_chronica_monsters.py")
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


class ChronicaMonstersTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = IMPORTER.build()
        cls.entries = cls.document["entries"]
        cls.by_name = {entry["name"]: entry for entry in cls.entries}
        cls.source = json.loads(IMPORTER.SOURCE.read_text(encoding="utf-8"))
        cls.fills = json.loads(IMPORTER.FILLS.read_text(encoding="utf-8"))

    def test_every_entity_in_every_campaign_creature_folder_is_retained(self):
        self.assertEqual(len(self.entries), 66)
        self.assertEqual({entry["id"] for entry in self.entries},
                         {f"chronica-{row['id']}" for row in self.source["monsters"]})
        self.assertEqual(len({row["folder"] for row in self.source["monsters"]}), 14)
        self.assertEqual(len(self.by_name), len(self.entries))

    def test_numeric_scores_preserve_every_recorded_modifier(self):
        for entity in self.source["monsters"]:
            actual = self.by_name[entity["name"]]
            stats = IMPORTER.fields(entity)
            for ability, sid in IMPORTER.ABILITY_IDS.items():
                raw = IMPORTER.first(stats, sid)
                if raw:
                    self.assertEqual((int(actual["abilities"][ability]) - 10) // 2, int(raw))
                    self.assertEqual(actual["source_ability_scores"]["original_modifiers"][ability], raw)
        self.assertEqual(self.by_name["Boar"]["abilities"]["str"], "13")
        self.assertIn("0 pool / +0 check", self.by_name["Boar"]["block"])

    def test_all_profiles_have_usable_scores_and_honest_provenance(self):
        statuses = set()
        for entry in self.entries:
            self.assertEqual(set(entry["abilities"]), set(IMPORTER.ABILITY_IDS))
            self.assertTrue(all(str(value).isdigit() and int(value) >= 1 for value in entry["abilities"].values()))
            provenance = entry["source_ability_scores"]
            self.assertTrue(provenance["source"])
            self.assertTrue(provenance["profile"])
            statuses.add(entry["ability_score_status"])
            self.assertEqual(entry["ability_score_status"] == "reconstructed", provenance["method"] == "reconstructed")
        self.assertEqual(statuses, {"sourced", "reconstructed"})

    def test_source_headers_and_known_identity_fields_are_promoted_without_guessed_challenge(self):
        target = {}
        IMPORTER.promote_headers(target, "", "Senses darkvision 60 ft.\nLanguages Common\nChallenge 3")
        self.assertEqual(target, {"senses": "darkvision 60 ft.", "languages": "Common"})
        boar = self.by_name["Boar"]
        self.assertEqual(boar["type"], "beast")
        self.assertEqual(boar["size"], "Medium")
        self.assertTrue(any(entry["cr"] == "Unrated" for entry in self.entries))
        self.assertTrue(all(entry.get("senses") and entry.get("languages") for entry in self.entries))

    def test_missing_blocks_are_existing_identified_alternatives(self):
        self.assertEqual(len(self.fills), 11)
        for name, fill in self.fills.items():
            entry = self.by_name[name]
            self.assertEqual(entry["fallback_reference"]["baseline"], fill["baseline"])
            self.assertTrue(entry["fallback_reference"]["source"].startswith("https://"))
            for key in ("ac", "hp", "speed", "abilities", "actions"):
                self.assertTrue(entry.get(key), (name, key))
            self.assertEqual(set(entry["abilities"]), set(IMPORTER.ABILITY_IDS))
        self.assertEqual(self.by_name["Imp"]["hp"], "10 (3d4 + 3)")

    def test_spell_use_counts_are_not_multiattack(self):
        papaya = self.by_name["Camelfolk female sorcerer - Papaya"]
        cleric = self.by_name["Loxodon male cleric - Chandruuv"]
        self.assertNotIn("multiattack", papaya)
        self.assertNotIn("multiattack", cleric)
        self.assertIn("Burning Hands (4x)", papaya["limited_spell_uses"])
        self.assertIn("Inflict wounds (4x)", cleric["limited_spell_uses"])
        self.assertIn("Claws (2x)", self.by_name["Imp"]["multiattack"])

    def test_anatomy_and_ordinary_darkness_do_not_create_spell_lists(self):
        for name in ("Shadow", "Kongamato", "Giant Scorpion", "The Gray Orc male"):
            self.assertNotIn("spell_references", self.by_name[name])

    def test_breath_uses_its_save_and_cannot_be_blocked(self):
        action = next(row for row in self.by_name["Balckspawn Stalker"]["actions"] if "Breath" in row["name"])
        self.assertIn("DC 11 Dexterity", action["description"])
        self.assertIn("cannot be Blocked", action["description"])
        self.assertNotIn("Block DC", action["description"])

    def test_spell_replacements_are_playable_current_entries(self):
        catalog = IMPORTER.spell_catalog(ROOT / "data")
        for entry in self.entries:
            for reference in entry.get("spell_references", []):
                self.assertIn(reference["name"].casefold(), catalog)
                self.assertTrue(reference["current_rule"])
        papaya = self.by_name["Camelfolk female sorcerer - Papaya"]
        flame = next(row for row in papaya["actions"] if row["name"].startswith("Burning Hands"))
        self.assertIn("Cone of fire", flame["description"])
        self.assertIn("Creatures that fail this save are set on fire", flame["description"])
        self.assertIn("3d6", papaya["original_5e"]["stats"]["98588"])

    def test_replacement_magic_keeps_specific_block_exceptions_and_numeric_context(self):
        sorcerer = self.by_name["The Half-Orc Female sorcerer leader"]
        swarm = next(row for row in sorcerer["actions"] if row["name"] == "Cloud of Daggers")
        self.assertIn("1d4+3 piercing", swarm["description"])
        self.assertIn("Block DC 13", swarm["description"])
        self.assertIn("surround save is DC 14", swarm["description"])
        flames = next(row for row in sorcerer["traits"] if row["name"].casefold() == "control flames")
        self.assertIn("spell attack +4", flames["description"])
        self.assertIn("spell save DC 14", flames["description"])
        cleric = self.by_name["Loxodon male cleric - Chandruuv"]
        harm = next(row for row in cleric["actions"] if row["name"].startswith("Inflict wounds"))
        self.assertIn("This damage cannot be blocked", harm["description"])
        self.assertIn("explicit exceptions take priority", harm["description"])

    def test_named_armor_fallback_uses_existing_block_properties(self):
        knight = self.by_name["Ishilb male paladin"]
        self.assertEqual(knight["block"], "2 pool / +8 check; armor floor 2")
        self.assertIn("Plated armor suit", knight["armor_reference"])
        self.assertEqual(self.by_name["Imp"]["block"], "3 pool / +3 check")

    def test_no_statless_or_empty_named_traits_ship(self):
        for entry in self.entries:
            for key in ("ac", "hp", "speed", "abilities", "actions", "block"):
                self.assertTrue(entry.get(key), (entry["name"], key))
            for trait in entry.get("traits", []):
                self.assertTrue(trait.get("description"), (entry["name"], trait["name"]))

    def test_source_snapshot_contains_creatures_without_campaign_secrets(self):
        self.assertEqual(set(self.source), {"source", "export_created_at", "monsters"})
        for entity in self.source["monsters"]:
            self.assertNotIn("gm_secrets", entity)
            self.assertNotIn("players", entity)
            self.assertNotIn("campaign_id", entity)

    def test_generated_yaml_matches_repeatable_import(self):
        generated = yaml.safe_load((ROOT / "data/monsters/chronica.yaml").read_text(encoding="utf-8"))
        self.assertEqual(generated, self.document)


if __name__ == "__main__":
    unittest.main()
