"""Coverage for high earth-elemental conversions and their source-specific powers."""
from pathlib import Path
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[1]


class HomebreweryHighTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries = yaml.safe_load((ROOT / 'data/monsters/tarta-elementals-high.yaml').read_text(encoding='utf-8'))['entries']
        cls.by_name = {entry['name']: entry for entry in cls.entries}

    def test_all_thirteen_keep_numeric_abilities_and_source(self):
        self.assertEqual(len(self.entries), 13)
        self.assertEqual(len({entry['id'] for entry in self.entries}), 13)
        for entry in self.entries:
            self.assertEqual(set(entry['abilities']), {'str', 'dex', 'con', 'int', 'wis', 'cha'})
            self.assertTrue(all(int(score) >= 1 for score in entry['abilities'].values()))
            self.assertTrue(entry['original_5e']['actions'])
            self.assertTrue(entry['source_ref'].startswith('draft2.pdf / PDF page '))
            self.assertTrue(entry['conversion_notes'])

    def test_sources_preserve_invalid_score_and_odd_experience_without_displaying_invalid_score(self):
        void = self.by_name['Voidstone Wanderer']
        self.assertEqual(void['abilities']['cha'], '1')
        self.assertEqual(void['original_5e']['abilities']['cha'], '-2')
        iron = self.by_name['Great Iron']
        self.assertEqual((iron['cr'], iron['xp']), ('5', '2300'))
        self.assertEqual(iron['hp'], '85')

    def test_reaction_defenses_do_not_remain_passive_traits(self):
        for name, power in [('Granite Goliath', 'Granite Guard'), ('Diamond Devastator', 'Diamond Defense'), ('Gemstone Goliath', 'Prismatic Defense'), ('Earthen Guardian', 'Protective Presence')]:
            entry = self.by_name[name]
            self.assertIn(power, [rule['name'] for rule in entry['reactions']])
            self.assertNotIn(power, [rule['name'] for rule in entry['traits']])

    def test_difficult_source_powers_have_playable_limits(self):
        iron = self.by_name['Great Iron']
        emission = next(rule['description'] for rule in iron['bonus_actions'] if rule['name'] == 'Emmission')
        self.assertIn('28 temporary HP', emission)
        self.assertIn('cannot stack', emission)
        sand = self.by_name['Whirlwind Sand Elemental']
        odsand = next(rule['description'] for rule in sand['traits'] if rule['name'] == 'Odsand')
        self.assertIn('(R-L)/(H-L)', odsand)
        self.assertIn('Fixed damage', odsand)
        self.assertNotIn('Earthen Guardian', str(sand['actions']))
        titan = self.by_name['Primordial Terra Titan']
        shift = next(rule['description'] for rule in titan['actions'] if rule['name'].startswith('Seismic Shift'))
        self.assertIn('unavailable', shift)
        self.assertIn('rather than stacks', shift)


if __name__ == '__main__':
    unittest.main()
