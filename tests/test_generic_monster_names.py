"""Generic encounter names retain all creatures, source identities and mechanics."""
import json
from pathlib import Path
import re
import unittest

import yaml

from compiler import compile_data, RulesLoader

ROOT = Path(__file__).resolve().parents[1]
PROVENANCE = re.compile(r'^(?:original_|source_|conversion_|replacement_sources$|fallback_reference$|ability_score_sources$)')
ACTION_FIELDS = ('traits', 'actions', 'bonus_actions', 'reactions', 'legendary_actions', 'mythic_actions', 'lair_actions', 'regional_effects')


def numbers(value):
    if isinstance(value, dict):
        return {key: numbers(item) for key, item in value.items()}
    if isinstance(value, list):
        return [numbers(item) for item in value]
    return re.findall(r'[+-]?\d+(?:\.\d+)?', str(value))


class GenericMonsterNameTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = {section['key']: section for section in compile_data(ROOT / 'data')}
        cls.monsters = {entry['name']: entry for entry in cls.catalog['monsters']['entries']}
        cls.records = json.loads((ROOT / 'data/monsters/source/generic-name-index.json').read_text(encoding='utf-8'))['records']

    def original(self, record):
        document = yaml.load((ROOT / 'data' / record['source']).read_text(encoding='utf-8'), Loader=RulesLoader)
        return next(entry for entry in document['entries'] if entry['name'] == record['from'])

    def test_twenty_generic_titles_replace_records_without_removing_any_monster(self):
        self.assertEqual(len(self.records), 20)
        self.assertEqual(len(self.monsters), 301)
        self.assertEqual(len(self.catalog['monsters']['entries']), 301)
        self.assertEqual(len(self.catalog['spells']['entries']), 439)
        self.assertEqual(len({entry['details']['encounter_theme'] for entry in self.monsters.values()}), 15)
        self.assertFalse(any(re.search(r'\b(?:male|female)\b', name, re.I) for name in self.monsters))
        for record in self.records:
            self.assertIn(record['to'], self.monsters)
            self.assertNotIn(record['from'], self.monsters)
        self.assertIn('Gray Orc', self.monsters)
        self.assertIn('Gray Orc Raider', self.monsters)
        self.assertIn('Ogrillion', self.monsters)
        self.assertIn('Ogrillion Club Brute', self.monsters)

    def test_stable_ids_original_targets_and_theme_placements_survive_renaming(self):
        for record in self.records:
            entry = self.monsters[record['to']]
            self.assertEqual(entry['source'], record['source'])
            self.assertEqual(entry['group'], record['group'])
            self.assertEqual(entry['details']['id'], record['id'])
            self.assertEqual(entry['monster_target'], {key: record['from'] if key == 'name' else record[key] for key in ('source', 'group', 'name')})
            self.assertEqual(entry['details']['source_naming']['original_name'], record['from'])
            self.assertTrue(entry['details']['encounter_theme'])

    def test_combat_values_equipment_and_current_spell_links_are_exactly_preserved(self):
        for record in self.records:
            source = self.original(record)
            details = self.monsters[record['to']]['details']
            with self.subTest(monster=record['to']):
                for key in ('ac', 'hp', 'speed', 'block', 'abilities', 'size', 'type', 'alignment', 'cr', 'xp',
                            'saving_throws', 'skills', 'senses', 'languages', 'proficiency_bonus', 'equipment',
                            'damage_resistances', 'damage_immunities', 'damage_vulnerabilities', 'condition_immunities',
                            'spell_references', 'spell_slots', 'spell_attack', 'spell_save_dc', 'casting_ability'):
                    self.assertEqual(details.get(key), source.get(key), key)
                for key in ACTION_FIELDS:
                    self.assertEqual(numbers(details.get(key, [])), numbers(source.get(key, [])), key)
                for key in source:
                    if PROVENANCE.match(key):
                        if key == 'conversion_notes':
                            self.assertEqual(details[key][:-1], source[key])
                        else:
                            self.assertEqual(details[key], source[key], key)

    def test_personal_names_and_gendered_pronouns_are_absent_from_playable_rules(self):
        banned = re.compile(r'\b(?:Dragazhar|Miratrin|Strongwalker|Papaya|Drion|Goldenseeker|Chandruuv|Raguch|Aurumathar|male|female|she|he|her|hers|him|his|herself|himself)\b', re.I)
        for record in self.records:
            details = self.monsters[record['to']]['details']
            active = {key: value for key, value in details.items() if key != 'id' and not PROVENANCE.match(key)}
            self.assertIsNone(banned.search(json.dumps(active)), record['to'])
        priest = self.monsters['Loxodon Warhammer Priest']['details']
        self.assertTrue(any(trait['name'] == 'Channel Divinity: Battle Blessing (1x)' for trait in priest['traits']))
        dragon = self.monsters['Aetherium Alloy Dragon Sovereign']['details']
        self.assertEqual(dragon['size'], 'Colossal')
        self.assertEqual(dragon['cr'], '33')


if __name__ == '__main__':
    unittest.main()
