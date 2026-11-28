"""Different source systems must not silently share a conversion formula."""
import json
from pathlib import Path
import unittest

from compiler import compile_data

ROOT = Path(__file__).resolve().parents[1]


class CrossSystemMonsterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = {s['key']: s for s in compile_data(ROOT / 'data')}
        cls.all = {e['name']: e for e in cls.catalog['monsters']['entries']}
        cls.records = json.loads((ROOT / 'data/monsters/source/cross-system-index.json').read_text(encoding='utf-8'))['records']
        cls.new = {r['name']: cls.all[r['name']]['details'] for r in cls.records}

    def text(self, name, field='actions'):
        return '\n'.join(r['description'] for r in self.new[name].get(field, []))

    def test_complete_inventory_preserves_old_collections_and_all_current_spells(self):
        self.assertEqual(len(self.records), 87)
        self.assertEqual(len(self.all), 302)
        self.assertEqual(len(self.catalog['spells']['entries']), 439)
        self.assertEqual(sum(e['source'] not in {r['file'] for r in self.records} for e in self.all.values()), 215)
        self.assertEqual(len({e['details']['encounter_theme'] for e in self.all.values()}), 15)
        for record in self.records:
            entry = self.all[record['name']]
            self.assertEqual(entry['source'], record['file'])
            self.assertEqual(entry['details']['encounter_theme'], record['theme'])
            self.assertTrue(entry['details']['source_completion'])
            self.assertEqual(entry['details']['original_5e']['source_system'], record['source_system'])
            for key in ('str', 'dex', 'con', 'int', 'wis', 'cha'):
                self.assertGreaterEqual(int(entry['details']['abilities'][key]), 1)

    def test_all_fifty_setting_pages_are_covered_and_two_mycolids_are_independent(self):
        age = [d for d in self.new.values() if d['source_system'].lower().startswith('eight-attribute')]
        self.assertEqual(len(age), 51)
        self.assertEqual({int(d['original_5e']['page']) for d in age}, set(range(2, 52)))
        self.assertEqual(sum(int(d['original_5e']['page']) == 38 for d in age), 2)
        self.assertIn('Paralytic Spores', str(self.new['Deathcap Fungal Guardian']['actions']))
        self.assertNotIn('Hallucinogenic Spores', str(self.new['Deathcap Fungal Guardian']['actions']))
        self.assertIn('Hallucinogenic Spores', str(self.new['Hallucinogenic Fungal Guardian']['actions']))
        self.assertNotIn('Paralytic Spores', str(self.new['Hallucinogenic Fungal Guardian']['actions']))
        self.assertEqual(self.new['Wasteland Magister']['abilities']['int'], '26')
        self.assertEqual(int(self.new['Wasteland Magister']['original_5e']['abilities']['Magic']), 8)
        self.assertEqual(self.new['Antlered Forest Hunter']['hp'], '21')
        self.assertEqual(self.new['Feyblade Exile']['speed'], '35 ft.')

    def test_modifier_scores_reconstruct_modifiers_but_level_accuracy_is_removed(self):
        shark = self.new['Goblin Shark']
        self.assertEqual(shark['abilities'], dict(zip(('str','dex','con','int','wis','cha'), map(str, (22,18,20,2,16,4)))))
        self.assertEqual((shark['ac'], shark['hp']), ('16', '85'))
        self.assertIn('+9 to hit', self.text('Goblin Shark'))
        self.assertNotIn('+13 to hit', self.text('Goblin Shark'))
        white = self.new['Great White Shark']
        self.assertEqual((white['ac'], white['hp']), ('17', '60'))
        self.assertIn('+8 to hit', self.text('Great White Shark'))
        self.assertIn('Costs its action', self.text('Great White Shark'))
        self.assertEqual(len({self.new[n]['id'] for n in ('Goblin Shark','Sharkskin Goblin','Shark-Shifting Goblin')}), 3)

    def test_old_bab_saves_and_weapon_properties_do_not_carry_over_as_one_system(self):
        self.assertIn('+21 to hit', self.text('Slag Worm'))
        self.assertIn('Block DC 29', self.text('Slag Worm'))
        self.assertIn('DC 22 CON', self.text('Slag Worm', 'traits'))
        self.assertIn('+36 bite', self.new['Slag Worm']['original_5e']['printed_attack'])
        self.assertEqual(self.new['Gray Ooze']['block'], '0 / -5 check')
        self.assertIn('Block DC 13', self.text('Small Greataxe Goblin Brute'))
        self.assertIn('Very Inaccurate', self.text('Small Greataxe Goblin Brute'))
        self.assertIn('Block DC 17', self.text('Greatsword Goblin Brute'))
        self.assertIn('DC+++', self.text('Greatsword Goblin Brute'))
        self.assertIn('4d3 + 8', self.text('Greatclub Goblin Brute'))
        self.assertIn('Reload I', self.text('Goblin'))
        self.assertIn('1d4 + 6 slashing', self.text('Minotaur Deckbreaker'))
        self.assertIn('range 15/30 ft.', self.text('Minotaur Deckbreaker'))
        self.assertIn('Reload IV', self.text('Dwarf Axe Siegebreaker'))

    def test_all_twelve_spider_ages_preserve_hp_but_replace_ability_drain(self):
        spiders = [d for name, d in self.new.items() if self.all[name]['group'] == 'Monstrous spider age variants']
        self.assertEqual(len(spiders), 12)
        self.assertEqual(sorted(int(d['hp']) for d in spiders), [2,4,10,20,48,96,140,216,280,352,432,520])
        for d in spiders:
            self.assertEqual(d['abilities']['int'], '1')
            self.assertEqual(d['original_5e']['printed_scores'][3], '—')
            text = str(d['actions'])
            self.assertIn('Weakened for 1 minute', text)
            self.assertIn('cannot reduce ability scores', text)
            self.assertIn('STR damage', d['original_5e']['printed_poison'])

    def test_recovery_respects_current_paralysis_and_control_has_a_budget(self):
        for name, d in self.new.items():
            for field in ('traits', 'actions', 'bonus_actions', 'reactions'):
                for row in d.get(field, []):
                    self.assertNotIn('Paralyzed for 1 minute', row['description'], name)
        self.assertIn('Stunned for 1 minute', self.text('Crystal Ooze'))
        self.assertIn('Stunned by its Grave Bite', self.text('Ghoul Necromancer'))
        self.assertIn('CON save', self.text('Ghoul Necromancer'))
        self.assertIn('share one turn', self.text('Crystal Abomination'))
        self.assertIn('Only the host acts', self.text('Lightning Mote'))
        self.assertIn('There is no automatic death timer', self.text('Adhesive Bog Colossus'))
        self.assertIn('8d8 necrotic', self.text('Catoblepas'))

    def test_created_creatures_reference_independent_profiles_and_finite_control(self):
        expected = {'Boulder Hermit': 'Boulder Guardian', 'Ghoul Necromancer': 'Zombie',
                    'Infernal Gnome Enchanter': 'Ember Wisp'}
        for name, summoned in expected.items():
            self.assertIn(summoned, self.all)
            self.assertIn(summoned, [r['monster'] for r in self.new[name]['summons']])
            self.assertIn('1 minute', self.text(name))
            self.assertIn('concentration', self.text(name))
            self.assertIn('bonus action', self.text(name).replace('-', ' '))


if __name__ == '__main__':
    unittest.main()
