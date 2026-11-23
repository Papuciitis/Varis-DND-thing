"""Protect the four imported age categories and their Varis combat boundaries."""

from pathlib import Path
import re
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]


class SteelDragonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.collection = yaml.safe_load((ROOT / 'data/monsters/steel-dragons.yaml').read_text(encoding='utf-8'))
        cls.entries = cls.collection['entries']
        cls.by_name = {entry['name']: entry for entry in cls.entries}

    def test_every_source_age_category_is_playable(self):
        source = (ROOT / 'data/monsters/source/steel-dragons.txt').read_text(encoding='utf-8')
        source_names = set(re.findall(r'^(?:Ancient Steel Dragon|Adult Steel Dragon|Young Steel Dragon|Steel Dragon Wyrmling)$', source, re.MULTILINE))
        self.assertEqual(self.collection['section'], 'monsters')
        self.assertEqual(len(source_names), 4)
        self.assertEqual(set(self.by_name), source_names)
        for entry in self.entries:
            self.assertEqual(set(entry['abilities']), {'str','dex','con','int','wis','cha'})
            self.assertTrue(entry['ac'] and entry['hp'] and entry['speed'] and entry['actions'])
            self.assertIn(entry['name'], entry['original_5e'])
            self.assertTrue(entry['source_ref'] and entry['conversion_notes'])

    def test_natural_armor_grants_no_unprinted_block_proficiency(self):
        for entry in self.entries:
            self.assertEqual(entry['abilities']['dex'], '10')
            self.assertEqual(entry['block'], '0 / +0')
            for action in entry['actions']:
                if action['name'] in ('Bite', 'Claw', 'Tail'):
                    attack = int(re.search(r'\+(\d+) to hit', action['description'])[1])
                    self.assertIn(f'Block DC {attack + 8}', action['description'])
                    self.assertIn('unblocked strike', action['description'])
                if action['name'].startswith('Breath Attack'):
                    self.assertIn('Neither breath area can be Blocked', action['description'])

    def test_legendary_age_categories_include_the_complete_lair(self):
        for name, entry in self.by_name.items():
            if name.startswith(('Ancient', 'Adult')):
                self.assertEqual(len(entry['legendary_actions']), 4)
                self.assertEqual(len(entry['lair_actions']), 4)
                self.assertEqual(len(entry['regional_effects']), 4)
                self.assertIn('Pinned', entry['lair_actions'][2]['description'])
            else:
                self.assertNotIn('legendary_actions', entry)
                self.assertNotIn('lair_actions', entry)
                self.assertNotIn('regional_effects', entry)

    def test_source_corrections_have_existing_alternative_provenance(self):
        adult = self.by_name['Adult Steel Dragon']
        self.assertEqual((adult['cr'], adult['xp']), ('17', 18000))
        self.assertTrue(any(item['field'] == 'XP' and 'dndbeyond.com' in item['source'] for item in adult['replacement_sources']))
        young = self.by_name['Young Steel Dragon']
        self.assertIn('passive Perception 18', young['senses'])
        self.assertTrue(any(item['field'] == 'passive Perception' for item in young['replacement_sources']))


if __name__ == '__main__':
    unittest.main()
