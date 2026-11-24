"""Cross-collection integrity for the Tarta Homebrewery add-on."""
from pathlib import Path
import unittest

from compiler import compile_data

ROOT = Path(__file__).resolve().parents[1]


class HomebreweryAddonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = {section['key']: section for section in compile_data(ROOT / 'data')}
        cls.monsters = {e['name']: e for e in cls.catalog['monsters']['entries']}

    def test_all_printed_creatures_and_completed_templates_are_in_the_compiled_catalog(self):
        self.assertEqual(len(self.monsters), 160)
        self.assertEqual(sum(e['source'].startswith('monsters/tarta-elementals-') for e in self.monsters.values()), 26)
        summons = [e for e in self.monsters.values() if e['source'] == 'monsters/tarta-summons.yaml']
        self.assertEqual(len(summons), 9)
        self.assertEqual({e['name'] for e in summons if e['details']['cr'] == 'Varies'}, {'Rockplica duplicate', 'Stone illusion duplicate'})
        for e in self.monsters.values():
            if e['source'].startswith('monsters/tarta-'):
                self.assertTrue(e['details']['original_5e'], e['name'])
                self.assertTrue(e['details']['source_ref'], e['name'])
                self.assertEqual(set(e['details']['abilities']), {'str', 'dex', 'con', 'int', 'wis', 'cha'})

    def test_every_forward_and_reverse_creation_link_resolves(self):
        forward = 0
        for section in self.catalog.values():
            for e in section['entries']:
                for reference in (e['details'].get('summons', []) if isinstance(e['details'], dict) else []):
                    self.assertIn(reference['monster'], self.monsters, e['name'])
                    if 'tarta-' in e['source']:
                        forward += 1
        self.assertEqual(forward, 36)
        for e in self.monsters.values():
            for reference in e['details'].get('summoned_by', []):
                targets = self.catalog[reference['section']]['entries']
                self.assertTrue(any(t['name'] == reference['name'] and t['group'] == reference['group'] for t in targets), (e['name'], reference))

    def test_golem_has_exactly_twelve_optional_materials_with_canonical_rules(self):
        golem = self.monsters['Geochemical Golem']['details']
        options = golem['material_options']
        self.assertEqual(len(options), 12)
        self.assertEqual(len({o['name'] for o in options}), 12)
        for option in options:
            target = next(e for e in self.catalog['rules']['entries'] if e['name'] == option['name'] and e['group'] == option['group'])
            self.assertEqual(option['cost_gp'], target['details']['source_golem_option']['cost_gp'])
            self.assertEqual(option['effect'], target['details']['source_golem_option']['effect'])
        self.assertNotIn('Moissanite', [o['name'] for o in options])
        self.assertEqual(golem['ac'], '16 (natural armor)')

    def test_completed_spells_use_supported_tiers_and_explicit_limits(self):
        spells = [e for e in self.catalog['spells']['entries'] if e['source'] == 'draft-spells/tarta-homebrewery-summons.yaml']
        self.assertEqual(len(spells), 10)
        for e in spells:
            self.assertLessEqual(int(e['details']['lvl']), 6)
            self.assertGreaterEqual(int(e['details']['lvl']), 1)
            self.assertTrue(e['details']['conversion_notes'])
        by_name = {e['name']: e['details'] for e in spells}
        self.assertIn('one', by_name['Sandsoverign']['effect'].lower())
        self.assertIn('cannot attack', by_name["Geomorpher's Stone Servant"]['effect'])
        self.assertIn('shared', by_name['Rockplica']['effect'])
        self.assertIn('not duplicated', by_name['Rockplica']['effect'])
        self.assertNotIn('summons', by_name["Nature's Grasp"])
        self.assertNotIn('summons', by_name['Stone Sentinel'])
        self.assertNotIn('summons', by_name['Treetimber'])

    def test_duplicate_resources_and_independent_concentration_are_bounded(self):
        duplicate = self.monsters['Rockplica duplicate']['details']
        text = ' '.join(row['description'] for row in duplicate['traits'])
        self.assertIn('cannot cast a spell that requires concentration', text)
        self.assertIn('Block points are shared', text)
        self.assertIn('verbal components', duplicate['languages'])
        self.assertIn('movement speeds', duplicate['speed'])
        self.assertNotIn('free command', text)

    def test_animated_earth_can_attempt_to_break_control_without_a_command(self):
        earth = self.monsters['Awakened Earth']['details']
        action = next(row for row in earth['actions'] if row['name'] == 'Break control')
        self.assertIn('independently', action['description'])
        self.assertIn('cannot prevent', action['description'])


if __name__ == '__main__':
    unittest.main()
