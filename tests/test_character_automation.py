"""Declarations fail at build time rather than silently guessing new rules."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from character_automation import apply, attach, mechanics
from character_rules import compile_character_rules
from compiler import compile_data

ROOT = Path(__file__).resolve().parents[1]


def choice(**changes):
    return {"key": "upgrade", "label": "Upgrades", "type": "select", "upgradeable": True,
            "options": [{"id": "first", "name": "First"}, {"id": "second", "name": "Second", "requires": ["first"]}], **changes}


class AutomationSchemaTests(unittest.TestCase):
    def validate(self, data):
        return mechanics(data, "test rule")

    def test_base_loader_numbers_and_flags_are_normalized(self):
        rule = self.validate({"choices": [choice(count="2", repeat="false")], "effects": [{"add": {"restDice": "1", "offHandAbilityDamage": "true"}}]})
        self.assertEqual(rule["choices"][0]["count"], 2)
        self.assertIs(rule["choices"][0]["repeat"], False)
        self.assertIs(rule["effects"][0]["add"]["offHandAbilityDamage"], True)

    def test_unknown_operations_fail_with_the_source_label(self):
        for data in ({"execute": "code"}, {"effects": [{"add": {"unsupported": 1}}]}, {"choices": [choice(type="javascript")]}, {"grants": [{"from": "missing"}]}):
            with self.subTest(data=data), self.assertRaisesRegex(ValueError, "test rule"):
                self.validate(data)

    def test_invalid_scalars_cannot_be_treated_as_flags_or_counts(self):
        for bad in (1, 0, "yes"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.validate({"choices": [choice(upgradeable=bad)]})
        for bad in (True, "1.5", -1, 101):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.validate({"choices": [choice(count=bad)]})

    def test_duplicate_and_reserved_choice_ids_fail(self):
        for fields in ([choice(), choice()], [choice(key="upgrade-sources")], [choice(key="__proto__")], [choice(options=[{"id": "a", "name": "A"}, {"id": "a", "name": "Again"}])]):
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                self.validate({"choices": fields})

    def test_misplaced_choice_operations_fail_instead_of_being_ignored(self):
        with self.assertRaisesRegex(ValueError, "unsupported fields for select"):
            self.validate({"choices": [choice(level=3)]})

    def test_unknown_and_circular_upgrade_prerequisites_fail(self):
        for options in ([{"id": "a", "name": "A", "requires": ["absent"]}], [{"id": "a", "name": "A", "requires": ["b"]}, {"id": "b", "name": "B", "requires": ["a"]}]):
            with self.subTest(options=options), self.assertRaises(ValueError):
                self.validate({"choices": [choice(options=options)]})

    def test_followups_are_sorted_and_missing_dependencies_fail(self):
        spell = {"key": "spell", "label": "Spell", "type": "spell", "level": 1, "when": {"choice": "upgrade", "includes": "second"}}
        rule = self.validate({"choices": [spell, choice()]})
        self.assertEqual([field["key"] for field in rule["choices"]], ["upgrade", "spell"])
        with self.assertRaisesRegex(ValueError, "missing choice"):
            self.validate({"choices": [spell]})
        with self.assertRaisesRegex(ValueError, "circular choice"):
            self.validate({"choices": [choice(when={"choice": "spell", "includes": "a"}), spell]})

    def test_repeated_option_effects_and_level_counts_are_explicit(self):
        rule = self.validate({"choices": [choice(options=[{"id": "a", "name": "A", "repeatLimit": "3", "effects": {"restDice": "1"}}], countByLevel=[{"level": "3", "count": "2"}])]})
        self.assertEqual(rule["choices"][0]["options"][0]["effects"], {"restDice": 1})
        with self.assertRaisesRegex(ValueError, "ascending"):
            self.validate({"choices": [choice(countByLevel=[{"level": 5, "count": 2}, {"level": 3, "count": 1}])]})

    def test_manual_rules_cannot_silently_mix_with_automatic_effects(self):
        self.assertEqual(self.validate({"manual": "Resolve with the GM"})["manual"], "Resolve with the GM")
        with self.assertRaisesRegex(ValueError, "manual rule"):
            self.validate({"manual": "Resolve with the GM", "effects": []})

    def test_inline_mechanics_are_kept_out_of_reader_details(self):
        sections = {"backgrounds": {"key": "backgrounds", "entries": [{"name": "New background", "group": "", "source": "test.yaml", "details": {"description": "Rules", "automation": {"effects": [{"add": {"restDice": 1}}]}}}]}}
        attach(sections)
        entry = sections["backgrounds"]["entries"][0]
        self.assertEqual(entry["details"], {"description": "Rules"})
        self.assertEqual(entry["automation"]["effects"][0]["add"], {"restDice": 1})

    def test_sidecar_missing_entries_and_duplicate_sources_fail(self):
        sections = {"feats": {"key": "feats", "entries": [{"name": "New feat", "group": "", "source": "test.yaml", "details": {}}]}}
        rule = {"entry": ["feats", "", "New feat"], "mechanics": {"choices": [choice()]}}
        for rules in ([{**rule, "entry": ["feats", "", "Missing"]}], [rule, rule]):
            with self.subTest(rules=rules), self.assertRaises(ValueError):
                attach(deepcopy(sections), {"version": 1, "rules": rules})

    def test_static_field_grants_reject_missing_targets_and_cycles(self):
        def fixture(target):
            return [{"key": "feats", "entries": [{"name": name, "group": "", "details": {}, "automation": self.validate({"choices": [choice()], "grants": [{"target": {"entry": ["feats", "", target[name]], "choice": "upgrade"}}]})} for name in target]}]
        for target in ({"A": "Missing"}, {"A": "B", "B": "A"}):
            with self.subTest(target=target), self.assertRaises(ValueError):
                apply({"classes": [], "archetypes": [], "races": []}, fixture(target))

    def test_per_occurrence_followups_are_ordered_and_validated(self):
        child = {"key": "spells", "label": "Followups", "type": "text", "perChoice": {"choice": "upgrade", "includes": "second"}}
        rule = self.validate({"choices": [child, choice()]})
        self.assertEqual([field["key"] for field in rule["choices"]], ["upgrade", "spells"])
        with self.assertRaisesRegex(ValueError, "unknown condition option"):
            self.validate({"choices": [choice(), {**child, "perChoice": {"choice": "upgrade", "includes": "typo"}}]})

    def test_structured_prerequisites_and_constant_proficiencies(self):
        rule = self.validate({"prerequisites": {"all": [{"class": "A new class", "level": "2"}, {"ability": "wis", "minimum": "13"}]}, "proficiencies": {"tools": ["New tool"]}})
        self.assertEqual(rule["prerequisites"]["all"][0]["level"], 2)
        with self.assertRaises(ValueError):
            self.validate({"prerequisites": {"choice": "upgrade", "includes": "first"}, "choices": [choice()]})
        with self.assertRaises(ValueError):
            self.validate({"proficiencies": {"typo": ["New tool"]}})


class MigratedAutomationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sections = compile_data(ROOT / "data")
        cls.metadata = compile_character_rules(cls.sections)

    def test_migrated_feat_keys_stay_compatible_with_saved_characters(self):
        sources = self.metadata["automation"]["sources"]
        for name, expected in {"Arcane insight": ["cost", "spell", "int", "arcana"], "Dual wielding": ["trained", "quick", "defense", "reaction", "swift"], "Rite magic": ["spell", "slot", "cantrips", "die"]}.items():
            rule = next(sources[row["source"]] for row in self.metadata["automation"]["coverage"] if row["name"] == name)
            self.assertEqual([item["id"] for item in rule["choices"][0]["options"]], expected)

    def test_later_class_features_extend_original_groups_once(self):
        for owner_name, feature_name, expected in [("Bard", "Bardic traits", 1), ("Evoker", "Evoker traits", 3), ("Soulstone alchemist", "Soulgem use", 2)]:
            owner = next(owner for owner in self.metadata["classes"] + self.metadata["archetypes"] if owner["name"] == owner_name)
            feature = next(feature for feature in owner["features"] if feature["name"] == feature_name)
            self.assertEqual(len(feature["choices"][0]["additionalGrants"]), expected)

    def test_data_file_is_not_a_visible_compendium_section(self):
        self.assertFalse(any(section["key"] == "character-automation" for section in self.sections))
        self.assertGreaterEqual(len(self.metadata["automation"]["coverage"]), 38)

    def test_new_inline_content_compiles_without_name_registration(self):
        sections = deepcopy(self.sections)
        definitions = {section["key"]: section for section in sections}
        for section_key, template_name, new_name in [("feats", "Grimness", "Unregistered test feat"), ("backgrounds", None, "Unregistered test background"), ("classes", "Champion", "Unregistered test archetype")]:
            template = next(entry for entry in definitions[section_key]["entries"] if template_name is None or entry["name"] == template_name)
            entry = deepcopy(template)
            entry.pop("automation", None)
            entry.pop("automationRules", None)
            entry["name"] = new_name
            entry["details"]["automation"] = {"choices": [choice()], "effects": [{"add": {"hpFlat": 1}}]}
            definitions[section_key]["entries"].append(entry)
        attach(definitions)
        metadata = compile_character_rules(sections)
        records = {record["name"]: record for record in metadata["automation"]["coverage"]}
        for name in ["Unregistered test feat", "Unregistered test background", "Unregistered test archetype"]:
            self.assertEqual(records[name]["status"], "declared")
            self.assertEqual(metadata["automation"]["sources"][records[name]["source"]]["effects"][0]["add"], {"hpFlat": 1})


if __name__ == "__main__":
    unittest.main()
