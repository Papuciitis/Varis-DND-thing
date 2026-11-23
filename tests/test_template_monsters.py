"""Every supplied creature-template example remains a converted, traceable monster."""

from pathlib import Path
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    'Adult Red Dragon', 'Rootbound Stalker', 'Sprig Buddy', 'Orc Psycho',
    'The False One', 'Horned Skirmisher', 'Antlered Witness',
    'Many-Limbed Ravager', 'Burdened Herald', 'Adjole', 'Dongajni', 'Jobafo',
}


class TemplateMonsterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        document = yaml.safe_load((ROOT / 'data/monsters/template.yaml').read_text(encoding='utf-8'))
        cls.entries = {entry['name']: entry for entry in document['entries']}

    def test_all_examples_and_two_distinct_ravager_profiles_are_kept(self):
        self.assertEqual(set(self.entries), EXPECTED)
        self.assertEqual(self.entries['Many-Limbed Ravager']['cr'], '4')
        self.assertEqual(self.entries['Burdened Herald']['cr'], '5')
        self.assertNotEqual(self.entries['Many-Limbed Ravager']['hp'], self.entries['Burdened Herald']['hp'])

    def test_every_creature_has_playable_core_and_original_source(self):
        for name, entry in self.entries.items():
            with self.subTest(name=name):
                for key in ('ac', 'hp', 'speed', 'block', 'actions', 'original_5e', 'source_ref', 'conversion_notes'):
                    self.assertTrue(entry[key], key)
                self.assertEqual(set(entry['abilities']), {'str', 'dex', 'con', 'int', 'wis', 'cha'})
                self.assertTrue(all(1 <= int(score) <= 30 for score in entry['abilities'].values()))
                self.assertTrue(all(action['name'] and action['description'] for action in entry['actions']))

    def test_missing_red_dragon_rule_uses_matching_existing_monster(self):
        dragon = self.entries['Adult Red Dragon']
        presence = next(action['description'] for action in dragon['actions'] if action['name'] == 'Frightful Presence')
        for expected in ('120 ft.', 'DC 19', 'Afraid', '1 minute', '24 hours'):
            self.assertIn(expected, presence)
        self.assertIn('16771-adult-red-dragon', str(dragon['replacement_sources']))
        self.assertEqual(dragon['block'], '0 / +0 check')

    def test_missing_jobafo_actions_have_named_donor_without_fake_cr(self):
        jobafo = self.entries['Jobafo']
        self.assertEqual(jobafo['cr'], 'Unrated')
        self.assertIn('5194867-aboleth', str(jobafo['replacement_sources']))
        self.assertIn('Dominate Mind', str(jobafo['actions']))
        self.assertIn('69', jobafo['original_5e'])

    def test_attack_damage_uses_block_dc_and_strike_semantics(self):
        for name, entry in self.entries.items():
            for action in entry['actions']:
                if action['description'].startswith('Melee attack:'):
                    with self.subTest(name=name, action=action['name']):
                        self.assertIn('Block DC', action['description'])
                        self.assertIn('Unblocked strike:', action['description'])


if __name__ == '__main__':
    unittest.main()
