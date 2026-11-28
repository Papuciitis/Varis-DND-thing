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

    def test_cantrip_progressions_separate_automatic_rules_and_upgrade_choices(self):
        profiles = {profile["name"]: profile for profile in self.catalog()["spellProgressions"]}
        self.assertEqual(profiles["Soulfire"]["levels"], [4, 7, 10])
        self.assertEqual(len(profiles["Soulfire"]["options"]), 4)
        self.assertEqual(profiles["Condemn"]["levels"], [5, 9])
        self.assertEqual(profiles["Condemn"]["automatic"][0]["levels"], [4, 7, 10])
        self.assertEqual(profiles["Bolster"]["options"], [])
        self.assertEqual([rule["levels"] for rule in profiles["Bolster"]["automatic"]], [[5], [9]])
        self.assertFalse(any(option["name"].startswith("At ") for profile in profiles.values() for option in profile["options"]))

    def test_repeatable_upgrade_permissions_include_finite_caps_and_whole_lists(self):
        catalog = self.catalog()
        profiles = {profile["name"]: profile for profile in catalog["spellProgressions"]}
        self.assertEqual(next(option for option in profiles["lesser ethurgy"]["options"]
                              if "up to 3 times" in option["details"])["repeatLimit"], 3)
        self.assertEqual(profiles["Shielding rune"]["options"][0]["repeatLimit"], 2)
        self.assertEqual(profiles["Hex of Wotan"]["options"][0]["repeatLimit"], 5)
        scribe = next(owner for owner in catalog["archetypes"] if owner["name"] == "Scribe")
        improved = next(option for feature in scribe["features"] for group in feature["choices"]
                        for option in group["options"] if option["name"] == "Improved arcana")
        self.assertEqual(improved["repeatLimit"], 3)
        hunter = next(owner for owner in catalog["archetypes"] if owner["name"] == "Bounty hunter")
        experience = next(feature for feature in hunter["features"] if feature["name"] == "Experience")
        self.assertEqual(experience["choices"][0]["count"], 3)
        self.assertEqual([option["repeatLimit"] for option in experience["choices"][0]["options"]], [100] * 5)

    def test_permanent_trait_grants_link_to_real_lists(self):
        catalog = self.catalog()
        owners = {owner["name"]: owner for owner in catalog["classes"] + catalog["archetypes"]}
        def feature(owner, name):
            return next(feature for feature in owners[owner]["features"] if feature["name"] == name)
        for owner, name, option_name, target_owner, target_name, count in (
            ("Bard", "Bardic traits", "Truly Inspiring", "Bard", "Inspiration dice upgrade", 1),
            ("Poet", "Forms of poetry", "Arcane display", "Bard", "Inspiration dice upgrade", 1),
            ("Assassin", "Assassin skills", "Versatility", "Rogue", "Cunning", 2),
        ):
            option = next(option for group in feature(owner, name)["choices"] for option in group["options"] if option["name"] == option_name)
            self.assertEqual(option["choiceGrants"], [{"groupId": feature(target_owner, target_name)["choices"][0]["id"], "count": count}])

    def test_owned_ability_upgrades_are_gated_instead_of_unlocking_every_branch(self):
        catalog = self.catalog()
        owners = {owner["name"]: owner for owner in catalog["archetypes"]}
        for owner, name, count in (("Stormblade", "Greater invocations", 18),
                                   ("Warmage", "Improved warmage method", 15),
                                   ("Ascendant", "Finished path", 6),
                                   ("Ascended sorcerer", "Maturated sorcerer traits", 10)):
            feature = next(feature for feature in owners[owner]["features"] if feature["name"] == name)
            options = feature["choices"][0]["options"]
            self.assertEqual(len(options), count, (owner, name))
            self.assertTrue(all(option.get("requiresChoice") for option in options))
            self.assertEqual(bool(feature["choices"][0].get("automatic")), owner != "Stormblade")
        fool = next(feature for feature in owners["Fool"]["features"] if feature["name"] == "Attributes of the fool")
        self.assertEqual([len(group["options"]) for group in fool["choices"]], [3, 3, 3, 3])
        self.assertTrue(all(group["requiresChoice"]["onlyChoice"] for group in fool["choices"][1:]))
        elite = next(feature for feature in owners["Ascended sorcerer"]["features"] if feature["name"] == "Elite sorcerer traits")
        self.assertEqual(elite["choices"][1]["count"], 2)
        self.assertEqual(elite["choices"][1]["options"][-1]["repeatLimit"], 100)

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

    def test_fighter_tree_exposes_upgrades_with_prerequisites_and_stable_root_ids(self):
        fighting = next(item for item in self.entry("classes", "Fighter")["features"]
                        if item["name"] == "Fighting skills")
        choice = fighting["choices"][0]
        self.assertEqual(choice["count"], 2)
        self.assertIn("Armor training", [item["name"] for item in choice["options"]])
        armor = next(item for item in choice["options"] if item["name"] == "Armor training")
        heavy = next(item for item in choice["options"] if item["name"] == "Heavy armor training")
        weight = next(item for item in choice["options"] if item["name"] == "Weight shifting")
        self.assertEqual(heavy["requires"], [armor["id"]])
        self.assertEqual(weight["requires"], [heavy["id"]])
        self.assertEqual(json.loads(armor["id"]), [choice["id"], "Armor training", 0])
        self.assertEqual([item["name"] for item in choice["options"] if not item["requires"]],
                         ["Armor training", "Weapon expertise", "Battle engineering", "Survival training", "Tactical training"])
        self.assertNotIn("Alchemists kit", [item["name"] for item in choice["options"]])
        self.assertIn("Armor heft", [item["name"] for item in choice["options"]])
        self.assertIn("Brutal tactics", [item["name"] for item in choice["options"]])
        self.assertIn("Heavy armor training", armor["details"])

    def test_cumulative_choice_counts_include_every_level_and_class_improvement(self):
        for owner, name, counts in (
            ("Fighter", "Fighting skills", [2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17]),
            ("Alchemist", "Alchemy methods", [2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6]),
            ("Bard", "Inspiration dice upgrade", [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4]),
        ):
            with self.subTest(owner=owner):
                feature = next(item for item in self.entry("classes", owner)["features"] if item["name"] == name)
                self.assertEqual([row["count"] for row in feature["choices"][0]["countByLevel"]], counts)

    def test_plain_bonus_lists_and_referenced_later_grants_remain_selectable(self):
        for owner, count in (("Druid", 8), ("Ranger", 6)):
            feature = next(item for item in self.entry("classes", owner)["features"]
                           if item["name"].lower() == "ability score improvement")
            self.assertEqual(len(feature["choices"][0]["options"]), count)
        for kind, owner, source_name, grant_names in (
            ("classes", "Bard", "Bardic traits", ["Extra bardic trait"]),
            ("archetypes", "Ki channeler", "KI powers", ["Ki powers II", "Ki powers III"]),
            ("archetypes", "Graymage", "Graymage trait", ["Extra graymage trait"]),
        ):
            with self.subTest(owner=owner):
                features = {item["name"]: item for item in self.entry(kind, owner)["features"]}
                self.assertEqual(features[source_name]["choices"][0]["additionalGrants"],
                                 [{"featureId": features[grant_name]["id"], "count": 1} for grant_name in grant_names])

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

    def test_casting_profiles_exist_for_only_the_six_source_spellcasting_classes(self):
        classes = self.catalog()["classes"]
        self.assertEqual({item["name"] for item in classes if item.get("casting")},
                         {"Bard", "Cleric", "Druid", "Occultist", "Sorcerer", "Wizard"})
        self.assertTrue(all(item.get("casting") is None for item in classes
                            if item["name"] in {"Alchemist", "Barbarian", "Fighter", "Monk", "Ranger", "Rogue"}))

    def test_wizard_casting_exports_its_actual_slots_and_spellbook_rule(self):
        casting = self.entry("classes", "Wizard").get("casting")
        self.assertIsNotNone(casting, "Wizard slot tables must reach the character metadata")
        self.assertEqual((casting["tradition"], casting["mode"]), ("arcane", "leveled"))
        first = casting["progression"][0]
        self.assertEqual(first["slots"], [{"level": 1, "max": 1}])
        self.assertEqual(first["cantrips"], 1)
        self.assertIsNone(first["knownSpells"])
        self.assertEqual(casting["progression"][4]["slots"],
                         [{"level": 1, "max": 3}, {"level": 2, "max": 2}, {"level": 3, "max": 1}])
        self.assertEqual(casting["startingSpellbook"],
                         {"base": 2, "ability": "int", "spellLevel": 1, "perAdditionalClassLevel": 1})
        self.assertTrue(any("prepared" in warning.lower() for warning in casting["warnings"]))
        self.assertIn("Spell slots by level", casting["sourceHeadings"])
        self.assertTrue(any(item["name"] == "Arcane recovery" for item in casting["recovery"]))

    def test_sorcerer_slots_and_metamagic_points_follow_separate_source_rules(self):
        casting = self.entry("classes", "Sorcerer").get("casting")
        self.assertIsNotNone(casting, "Sorcerer slot tables must reach the character metadata")
        self.assertEqual(casting["progression"][0]["slots"], [{"level": 1, "max": 2}])
        self.assertEqual(casting["progression"][1]["slots"], [{"level": 1, "max": 3}, {"level": 2, "max": 1}])
        self.assertEqual(casting["progression"][1]["knownSpells"], 4)
        self.assertEqual([row["cantrips"] for row in casting["progression"]], [2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5])
        points = casting["pointResources"]
        self.assertEqual(len(points), 1)
        self.assertEqual((points[0]["id"], points[0]["minLevel"], points[0]["capacity"]),
                         ("metamagic", 4, {"ability": "cha", "proficiency": True}))
        self.assertIn("1d4+1", points[0]["recovery"][0]["details"])

    def test_druid_casting_exports_slots_known_counts_and_original_recovery(self):
        casting = self.entry("classes", "Druid").get("casting")
        self.assertIsNotNone(casting, "Druid slot tables must reach the character metadata")
        self.assertEqual((casting["tradition"], casting["mode"]), ("mystic", "leveled"))
        third = casting["progression"][2]
        self.assertEqual((third["slots"], third["knownSpells"], third["cantrips"]),
                         ([{"level": 1, "max": 2}, {"level": 2, "max": 1}], 7, 2))
        self.assertEqual(len(casting["progression"]), 12)
        self.assertEqual(casting["maxLearnLevelRule"], {"basis": "classLevel", "divisor": 2, "rounding": "up"})
        self.assertIn("combined spell level equal to 1/2 your druid level", casting["recovery"][0]["details"])

    def test_occultist_separates_class_slot_count_from_character_slot_level(self):
        occultist = self.entry("classes", "Occultist")
        casting = occultist.get("casting")
        self.assertIsNotNone(casting, "Occultist uses its own shared-level pool, not generic slots")
        self.assertEqual((casting["tradition"], casting["mode"]), ("occult", "occult"))
        self.assertEqual([row["slotCount"] for row in casting["progression"]], [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7])
        self.assertEqual(casting["slotLevelRule"], {"basis": "characterLevel", "divisor": 2, "rounding": "up"})
        self.assertEqual((casting["progression"][4]["knownSpells"], casting["progression"][4]["cantrips"]), (6, 2))
        reward = next(option for feature in occultist["features"] if feature["name"] == "Mark & reward"
                      for group in feature["choices"] if group["label"] == "Reward"
                      for option in group["options"] if option["name"] == "+2 max occult slots.")
        self.assertEqual(casting["modifiers"], [{"optionId": reward["id"], "resource": "occultSlots", "amount": 2}])

    def test_cleric_full_slot_counts_do_not_invent_a_maximum_slot_level(self):
        casting = self.entry("classes", "Cleric").get("casting")
        self.assertIsNotNone(casting, "Cleric full slots require distinct metadata")
        self.assertEqual((casting["tradition"], casting["mode"]), ("oath", "full"))
        self.assertEqual([row["slotCount"] for row in casting["progression"]], [2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5])
        self.assertIsNone(casting["slotLevelRule"])
        self.assertTrue(all(row["slots"] == [] for row in casting["progression"]))
        self.assertTrue(any("maximum" in warning.lower() and "level" in warning.lower() for warning in casting["warnings"]))
        self.assertIn("reducing the slots overall level", casting["recovery"][0]["details"])

    def test_bard_uses_rest_dice_and_does_not_receive_an_invented_slot_pool(self):
        casting = self.entry("classes", "Bard").get("casting")
        self.assertIsNotNone(casting, "Bard casting consumes existing rest dice")
        self.assertEqual((casting["tradition"], casting["mode"]), ("any", "rest-dice"))
        self.assertTrue(all(row["slots"] == [] and row["slotCount"] is None for row in casting["progression"]))
        self.assertEqual((casting["progression"][0]["knownSpells"], casting["progression"][-1]["knownSpells"]), (2, 8))
        self.assertEqual(casting["maxCastLevelRule"], {"basis": "characterLevel", "divisor": 2, "rounding": "up"})
        self.assertEqual(casting["maxLearnLevelRule"], {"basis": "classLevel", "divisor": 2, "rounding": "up"})

    def test_unconditional_archetype_slot_modifiers_reference_real_feature_ids(self):
        catalog = self.catalog()
        def feature_id(archetype_name, feature_name):
            archetype = next(item for item in catalog["archetypes"] if item["name"] == archetype_name)
            return next(item["id"] for item in archetype["features"] if item["name"] == feature_name)
        for class_name, expected in (
            ("Wizard", [{"featureId": feature_id("Court mage", "Extra spell slots"), "resource": "eachSlotLevel", "amount": 1}]),
            ("Cleric", [{"featureId": feature_id("Oathspeaker", "Extra spell slot"), "resource": "fullSlots", "amount": 1}]),
            ("Sorcerer", [{"featureId": feature_id("Wildmage", f"Raw power {roman}"), "resource": "slot", "level": level, "amount": 1}
                          for level, roman in enumerate(("I", "II", "III", "IV"), 1)]),
        ):
            casting = next(item for item in catalog["classes"] if item["name"] == class_name).get("casting")
            self.assertIsNotNone(casting)
            self.assertEqual(casting["modifiers"], expected)
            self.assertTrue(any("archetype" in warning.lower() for warning in casting["warnings"]))


if __name__ == "__main__":
    unittest.main()
