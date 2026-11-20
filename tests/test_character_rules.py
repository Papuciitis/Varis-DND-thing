"""Character metadata follows the house-rule catalog, including its draft limits."""

import importlib
import importlib.util
import json
from pathlib import Path
import unittest

from compiler import compile_data


ROOT = Path(__file__).resolve().parents[1]


class CharacterRulesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sections = compile_data(ROOT / "data")

    def catalog(self, sections=None):
        self.assertIsNotNone(importlib.util.find_spec("character_rules"),
                             "The build needs a source-derived character metadata compiler")
        return importlib.import_module("character_rules").compile_character_rules(sections or self.sections)

    def entry(self, kind, name):
        return next(item for item in self.catalog()[kind] if item["name"] == name)

    def test_catalog_keeps_all_source_identities_and_parent_associations(self):
        catalog = self.catalog()
        expected = {"races": [], "classes": [], "archetypes": []}
        for section in self.sections:
            for entry in section["entries"]:
                kind = "races" if section["key"] == "races" else None
                if section["key"] == "classes":
                    if entry["group"] == "Base class":
                        kind = "classes"
                    elif entry["group"].lower().endswith((" archetype", " archetypes")):
                        kind = "archetypes"
                if kind:
                    expected[kind].append(json.dumps([section["key"], entry["group"], entry["name"]],
                                                     ensure_ascii=False, separators=(",", ":")))
        for kind, ids in expected.items():
            self.assertEqual([item["entryId"] for item in catalog[kind]], ids)
            self.assertEqual([item["id"] for item in catalog[kind]], ids)
        self.assertEqual(len(catalog["races"]), 14)
        self.assertEqual(len(catalog["classes"]), 12)
        classes = {item["name"] for item in catalog["classes"]}
        self.assertTrue(all(item["className"] in classes for item in catalog["archetypes"]))

    def test_dwarf_uses_source_speed_bonuses_and_two_minitrait_choices(self):
        dwarf = self.entry("races", "Dwarf")
        self.assertEqual((dwarf["speed"], dwarf["size"]), (25, "medium"))
        self.assertEqual(dwarf["abilityBonuses"], {"con": 2})
        choice = dwarf["abilityChoices"][0]
        self.assertEqual((choice["amount"], choice["count"], choice["options"], choice["repeat"]),
                         (2, 1, ["str", "int", "wis"], False))
        trait = next(feature for feature in dwarf["traits"] if feature["name"] == "Dwarven traits")
        self.assertEqual(trait["choices"][0]["count"], 2)
        names = [option["name"] for option in trait["choices"][0]["options"]]
        self.assertIn("Dwarven fortitude", names)
        self.assertEqual(len(names), 9)

    def test_race_penalties_and_scalar_shadowling_bonuses_are_preserved(self):
        self.assertEqual(self.entry("races", "Dragonborn")["abilityBonuses"], {"con": 2, "cha": -2})
        shadowling = self.entry("races", "Shadowling")
        self.assertEqual(shadowling["abilityChoices"][0]["options"], ["dex", "con", "int", "wis"])
        origin = next(item for item in shadowling["traits"] if item["name"] == "Shadowling origin")
        self.assertEqual(origin["choices"][0]["count"], 1)
        self.assertEqual(len(origin["choices"][0]["options"]), 15)

    def test_alternative_ability_allocations_keep_literal_human_rule(self):
        human = self.entry("races", "Human")["abilityChoices"][0]
        self.assertEqual((human["amount"], human["count"]), (2, 1))
        self.assertEqual((human["alternatives"][0]["amount"], human["alternatives"][0]["count"]), (1, 1))
        elf = self.entry("races", "elf")["abilityChoices"][0]
        self.assertNotIn("dex", elf["options"])
        self.assertEqual((elf["alternatives"][0]["amount"], elf["alternatives"][0]["count"]), (1, 2))
        self.assertEqual(self.entry("races", "Ginasi")["abilityChoices"][0]["count"], 3)
        self.assertTrue(self.entry("races", "Ginasi")["abilityChoices"][0]["repeat"])

    def test_fighter_profile_and_progression_are_house_rules(self):
        fighter = self.entry("classes", "Fighter")
        self.assertEqual(fighter["hitDie"], "d10")
        self.assertEqual(fighter["saves"], ["str", "dex"])
        self.assertEqual(fighter["archetypeLevels"], [4, 7, 10])
        self.assertEqual(fighter["skillChoice"]["count"], 2)
        self.assertIn("Animal Handling", fighter["skillChoice"]["options"])
        self.assertEqual(fighter["proficiencies"]["armor"], "all armor, all shields")
        self.assertEqual(fighter["progression"][3],
                         {"level": 4, "values": {"Proficiency bonus": "+3", "Features": "1st archetype"}})
        self.assertNotIn("Health and proficiencies", [feature["name"] for feature in fighter["features"]])
        self.assertNotIn("Equipment", [feature["name"] for feature in fighter["features"]])

    def test_fighter_nested_prerequisites_are_not_independent_choices(self):
        fighting = next(item for item in self.entry("classes", "Fighter")["features"]
                        if item["name"] == "Fighting skills")
        choice = fighting["choices"][0]
        self.assertEqual(choice["count"], 2)
        self.assertIn("Armor training", [item["name"] for item in choice["options"]])
        self.assertNotIn("Heavy armor training", [item["name"] for item in choice["options"]])
        armor = next(item for item in choice["options"] if item["name"] == "Armor training")
        self.assertIn("Heavy armor training", armor["details"])

    def test_occultist_mark_reward_and_dark_arts_are_separate_choices(self):
        occultist = self.entry("classes", "Occultist")
        self.assertEqual((occultist["hitDie"], occultist["saves"], occultist["castingAbilities"]),
                         ("d4", ["cha", "int"], ["int", "cha"]))
        self.assertEqual(occultist["archetypeLevels"], [5, 9])
        mark_reward = next(item for item in occultist["features"] if item["name"] == "Mark & reward")
        self.assertEqual(mark_reward["level"], 1)
        self.assertEqual([(group["label"], group["count"], len(group["options"]))
                          for group in mark_reward["choices"]], [("Mark", 1, 10), ("Reward", 1, 6)])
        dark_art = next(item for item in occultist["features"] if item["name"] == "Dark art")
        self.assertEqual(dark_art["choices"][0]["options"][0]["name"], "Occult blade")
        ritual = next(item for item in occultist["features"] if item["name"] == "Improved Dark Ritual")
        self.assertEqual(ritual["choices"][0]["count"], 3)

    def test_spellblade_belongs_to_occultist_at_explicit_fifth_level(self):
        spellblade = self.entry("archetypes", "Spellblade")
        self.assertEqual((spellblade["className"], spellblade["minLevel"]), ("Occultist", 5))
        self.assertEqual(spellblade["minLevelSource"], "explicit")
        art = next(item for item in spellblade["features"] if item["name"] == "Spell-blade art")
        self.assertEqual(art["level"], 5)
        self.assertEqual(art["choices"][0]["count"], 1)
        self.assertIn("Runed blade", [item["name"] for item in art["choices"][0]["options"]])

    def test_repeated_ability_improvements_have_distinct_level_identities(self):
        features = [item for item in self.entry("classes", "Fighter")["features"]
                    if item["name"].lower() == "ability score improvement"]
        self.assertEqual([item["level"] for item in features], [2, 5, 8, 11])
        self.assertEqual(len({item["id"] for item in features}), 4)

    def test_occultist_and_ranger_keep_every_explicit_improvement_level(self):
        for class_name, expected in (("Occultist", [3, 7, 11]), ("Ranger", [2, 5, 8, 11])):
            features = [item for item in self.entry("classes", class_name)["features"]
                        if item["name"].lower() == "ability score improvement"]
            self.assertEqual([item["level"] for item in features], expected)

    def test_occultist_cantrips_keep_initial_container_level_and_later_grants(self):
        features = [item for item in self.entry("classes", "Occultist")["features"]
                    if item["name"] == "Cantrips"]
        self.assertEqual([item["level"] for item in features], [1, 5, 9])
        self.assertEqual(len({item["id"] for item in features}), 3)
        improvements = [item["level"] for item in self.entry("classes", "Occultist")["features"]
                        if item["name"] == "Ability Score Improvement"]
        self.assertEqual(improvements, [3, 7, 11])

    def test_choice_counts_come_from_grant_intro_before_nested_option_prose(self):
        monk = self.entry("classes", "Monk")
        pursuant = next(item for item in monk["features"] if item["name"] == "Pursuant of the ways")
        self.assertEqual(pursuant["choices"][0]["count"], 2)

    def test_cleric_oaths_are_a_single_choice_instead_of_automatic_features(self):
        features = self.entry("classes", "Cleric")["features"]
        self.assertFalse(any(item["name"].startswith("Oath of ") for item in features))
        oath = next(item for item in features if item["name"] == "Oath")
        self.assertEqual(oath["choices"][0]["count"], 1)
        self.assertEqual(len(oath["choices"][0]["options"]), 7)
        truth = next(item for item in oath["choices"][0]["options"] if item["name"] == "Oath of truth")
        self.assertIn("Sign - You gain proficiency with insight", truth["details"])

    def test_druid_circle_groups_its_benefits_under_each_named_circle(self):
        circle = next(item for item in self.entry("classes", "Druid")["features"] if item["name"] == "Druid circle")
        options = circle["choices"][0]["options"]
        self.assertEqual(len(options), 10)
        self.assertEqual(options[0]["name"], "The Fox")
        self.assertIn("Cunning - You gain a +2 bonus", options[0]["details"])
        self.assertNotIn("Spirit reach", options[0]["details"])

    def test_draft_notes_status_and_unknown_archetype_timing_stay_visible(self):
        alchemist = self.entry("classes", "Alchemist")
        self.assertIn("level 10", alchemist["notes"])
        self.assertTrue(alchemist["warnings"])
        ranger = self.entry("classes", "Ranger")
        self.assertEqual(ranger["progression"][8]["values"]["Proficiency bonus"], "8")
        self.assertIn("needs confirmation", ranger["notes"])
        self.assertTrue(self.entry("classes", "Monk")["warnings"])
        artificer = self.entry("archetypes", "Artificer")
        self.assertEqual(artificer["status"], "Unfinished draft")
        self.assertEqual(artificer["minLevel"], 1)
        self.assertEqual(artificer["minLevelSource"], "parent fallback")
        self.assertEqual(artificer["features"], [])

    def test_metadata_preserves_original_feature_details_and_stable_unique_ids(self):
        catalog = self.catalog()
        original = next(entry for section in self.sections if section["key"] == "classes"
                        for entry in section["entries"] if entry["name"] == "Occultist")
        occultist = next(item for item in catalog["classes"] if item["name"] == "Occultist")
        feature = next(item for item in occultist["features"] if item["name"] == "Mark & reward")
        self.assertEqual(feature["details"], original["details"]["lvl 1"]["Mark & reward"])
        ids = []
        for kind in ("races", "classes", "archetypes"):
            for item in catalog[kind]:
                for feature in item.get("traits", item.get("features", [])):
                    ids.append(feature["id"])
                    for group in feature["choices"]:
                        ids.append(group["id"])
                        ids.extend(option["id"] for option in group["options"])
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(catalog, self.catalog())
        json.dumps(catalog, ensure_ascii=False, allow_nan=False)

    def test_unrelated_reference_sections_do_not_change_saved_feature_choice_ids(self):
        before = self.entry("classes", "Fighter")
        sections = json.loads(json.dumps(self.sections))
        fighter = next(entry for section in sections if section["key"] == "classes"
                       for entry in section["entries"] if entry["name"] == "Fighter")
        fighter["details"]["sections"].insert(0, {"heading": "Extra reference", "body": "Read the combat rules."})
        after = next(item for item in self.catalog(sections)["classes"] if item["name"] == "Fighter")
        self.assertEqual(before["features"], after["features"])


if __name__ == "__main__":
    unittest.main()
