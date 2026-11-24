"""The Homebrewery material catalog keeps its three source applications distinct."""
from pathlib import Path
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]


class TartaMaterialsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = yaml.safe_load((ROOT / 'data/draft-reference/tarta-materials.yaml').read_text(encoding='utf-8'))
        cls.entries = cls.document['entries']
        cls.by_name = {entry['name']: entry for entry in cls.entries}

    def test_all_twelve_golem_options_keep_source_prices_and_separate_contexts(self):
        expected = {
            'Neodrakite': 300, 'Cerithal Stone': 200, 'Lanthara Crystal': 400,
            'Samarkium Ore': 250, 'Euralite Gem': 150, 'Gadolix Shard': 350,
            'Ytriun Metal': 300, 'Erbion Essence': 450, 'Thulmara Dust': 200,
            'Holmara Rock': 400, 'Dyspraxium Salt': 350, 'Terbithal Resin': 300,
        }
        options = {entry['name']: entry for entry in self.entries if entry.get('source_golem_option', {}).get('selectable')}
        self.assertEqual(set(options), set(expected))
        for name, price in expected.items():
            with self.subTest(material=name):
                entry = options[name]
                self.assertEqual(entry['source_golem_option']['cost_gp'], price)
                self.assertEqual(entry['source_original']['golem_infusion']['cost_gp'], price)
                self.assertEqual([section['heading'] for section in entry['sections']], ['Golem infusion', 'Weapon infusion', 'Bastion aura'])
                self.assertEqual(entry['source_golem_option']['effect'], entry['sections'][0]['body'])
                self.assertEqual(set(entry['source_original']), {'golem_infusion', 'weapon_infusion', 'bastion_aura'})
                self.assertTrue(entry['source_ref'] and entry['conversion_notes'])

    def test_reflection_and_infusion_instructions_do_not_add_hidden_golem_choices(self):
        self.assertEqual(self.document['section'], 'rules')
        self.assertEqual(len(self.by_name), 14)
        self.assertIn('Geochemical Golem infusion options', self.by_name)
        moissanite = self.by_name['Moissanite']
        self.assertNotIn('source_golem_option', moissanite)
        self.assertIn('not one of the twelve', moissanite['description'])
        text = ' '.join(section['body'] for section in moissanite['sections'])
        self.assertIn('actually dealt', text)
        self.assertIn('rounded down', text)
        self.assertIn('three uses', text)

    def test_playable_completions_define_costs_timing_and_condition_ends(self):
        configuration = ' '.join(section['body'] for section in self.by_name['Geochemical Golem infusion options']['sections'])
        self.assertIn('one to four different', configuration)
        self.assertIn('1,000 gp', configuration)
        self.assertIn('1,550 gp', configuration)
        self.assertIn('3,950 gp', configuration)
        self.assertIn('repeating a material does not stack', configuration)
        samarkium = self.by_name['Samarkium Ore']['sections'][0]['body']
        self.assertIn('start of the golem', samarkium)
        self.assertIn('cannot be Blocked', samarkium)
        terbithal = self.by_name['Terbithal Resin']['sections'][0]['body']
        self.assertIn('unblocked', terbithal)
        self.assertIn('DC 14 Constitution', terbithal)
        self.assertIn('end of its next turn', terbithal)
        phase = self.by_name['Dyspraxium Salt']['sections'][0]['body']
        self.assertIn('bonus action', phase)
        self.assertIn('nearest unoccupied space', phase)
        self.assertIn('5 force damage', phase)


if __name__ == '__main__':
    unittest.main()
