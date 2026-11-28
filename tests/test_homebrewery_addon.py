"""Cross-collection integrity for the Tarta Homebrewery add-on."""
from pathlib import Path
from catalog_expectations import ORIGINAL_MONSTER_SOURCES
import unittest

from catalog_expectations import original_spell_entries

from compiler import compile_data

ROOT = Path(__file__).resolve().parents[1]


class HomebreweryAddonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = {section['key']: section for section in compile_data(ROOT / 'data')}
        cls.monsters = {e['name']: e for e in cls.catalog['monsters']['entries']}

    def test_all_printed_creatures_and_completed_templates_are_in_the_compiled_catalog(self):
        original = [e for e in self.monsters.values() if e['source'] in ORIGINAL_MONSTER_SOURCES]
        self.assertEqual(len(original), 160)
        self.assertEqual(sum(e['source'].startswith('monsters/tarta-elementals-') for e in self.monsters.values()), 26)
        summons = [e for e in self.monsters.values() if e['source'] == 'monsters/tarta-summons.yaml']
        self.assertEqual(len(summons), 9)
        self.assertEqual({e['name']: e['details']['cr'] for e in summons if e['name'] in {'Stoneform Duplicate', 'Stone illusion duplicate'}}, {'Stoneform Duplicate': '1', 'Stone illusion duplicate': '0'})
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
        self.assertEqual(forward, 35)
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
        configuration = next(e for e in self.catalog['rules']['entries'] if e['name'] == 'Geochemical Golem infusion options')['details']
        live_rules = ' '.join(section['body'] for section in configuration['sections'])
        self.assertNotIn('creating spell', live_rules)
        self.assertNotIn("spell's material cost", live_rules)
        self.assertIn('optional construction budget', live_rules)

    def test_no_new_geomorphy_spells_or_player_feature_modules_are_published(self):
        spells = self.catalog['spells']['entries']
        self.assertEqual(len(original_spell_entries(spells)), 439)
        self.assertFalse(any(e['group'] in ['Geomorphy spells', 'Geomancy spells'] for e in spells))
        self.assertFalse(any(e['source'] == 'draft-spells/tarta-homebrewery-summons.yaml' for e in spells))
        self.assertFalse(any(e['source'] == 'draft-reference/tarta-summoning-features.yaml' for e in self.catalog['rules']['entries']))

    def test_creature_option_menu_references_all_thirty_five_standalone_profiles(self):
        options = next(e for e in self.catalog['rules']['entries'] if e['name'] == 'Tarta creature options')
        names = {reference['monster'] for reference in options['details']['summons']}
        expected = {e['name'] for e in self.monsters.values() if e['source'] in [
            'monsters/tarta-elementals-low.yaml', 'monsters/tarta-elementals-high.yaml', 'monsters/tarta-summons.yaml']}
        self.assertEqual(names, expected)
        self.assertEqual(len(names), 35)
        self.assertEqual(options['details']['summon_label'], 'Creature options')
        for name in expected:
            self.assertNotIn('summoned_by', self.monsters[name]['details'])

    def test_duplicate_resources_and_independent_concentration_are_bounded(self):
        duplicate = self.monsters['Stoneform Duplicate']['details']
        text = ' '.join(row['description'] for row in duplicate['traits'])
        self.assertIn('concentration', text)
        self.assertIn('Block points are shared', text)
        self.assertIn('verbal components', duplicate['languages'])
        self.assertIn('movement speeds', duplicate['source_template']['speed'])
        self.assertNotIn('free command', text)

    def test_animated_earth_can_attempt_to_break_control_without_a_command(self):
        earth = self.monsters['Awakened Earth']['details']
        action = next(row for row in earth['actions'] if row['name'] == 'Break control')
        self.assertIn('independently', action['description'])
        self.assertIn('cannot prevent', action['description'])


if __name__ == '__main__':
    unittest.main()
