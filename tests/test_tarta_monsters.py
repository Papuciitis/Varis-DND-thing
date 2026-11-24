"""Completed Tarta profiles preserve their immutable sources and bound action economy."""
import importlib.util
import json
from pathlib import Path
import re
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('tarta_import', ROOT / 'scripts/import_tarta_monsters.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class TartaMonstersTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot = json.loads(importer.SOURCE.read_text(encoding='utf-8'))
        cls.document = importer.build()
        cls.entries = cls.document['entries']
        cls.by_name = {entry['name']: entry for entry in cls.entries}

    def test_all_thirteen_numerical_blocks_are_imported_once(self):
        self.assertEqual(len(self.entries), 13)
        self.assertEqual(len({entry['id'] for entry in self.entries}), 13)
        self.assertEqual({entry['name'] for entry in self.entries}, {raw['title'] for raw in self.snapshot['entries']})
        self.assertEqual({entry['type'] for entry in self.entries}, {'dragon'})
        self.assertTrue(all(entry['source_ref'].startswith('https://tarta.fandom.com/wiki/') for entry in self.entries))

    def test_generated_yaml_matches_reviewed_conversion(self):
        actual = yaml.safe_load(importer.OUTPUT.read_text(encoding='utf-8'))
        self.assertEqual(actual, self.document)

    def test_fixed_source_numbers_and_full_original_remain_intact(self):
        for raw, entry in zip(self.snapshot['entries'], self.entries):
            self.assertEqual(entry['hp'], re.match(r'\d+', raw['fields']['hit_points'])[0])
            self.assertEqual(entry['ac'], raw['fields']['armor_class'])
            self.assertEqual(entry['abilities'], raw['abilities'])
            self.assertEqual(entry['cr'], raw['cr'])
            self.assertEqual(entry['original_5e'], raw)
        self.assertEqual(self.by_name['Adult Cerithal Stone dragon']['hp'], '310')
        self.assertEqual(self.by_name['Adult Cerithal Stone dragon']['original_5e']['fields']['hit_points'], '310 (23d12 + 147)')
        self.assertEqual(self.by_name['Aurumathar']['cr'], '33')
        self.assertEqual(self.by_name['Aurumathar']['size'], 'Colossal')

    def test_every_dragon_has_separate_three_attack_multiattack_and_blockable_hits(self):
        for entry in self.entries:
            actions = {row['name']: row['description'] for row in entry['actions']}
            self.assertEqual(actions['Multiattack'], 'Make one Bite attack and two Claw attacks. Each attack has its own attack roll and opportunity to Block.')
            for name in ['Bite', 'Claw', 'Tail']:
                self.assertIn('Unblocked strike:', actions[name])
                attack = int(re.search(r'([+]\d+) to hit', actions[name])[1])
                dc = int(re.search(r'Block DC (\d+)', actions[name])[1])
                self.assertEqual(dc, attack + 8)
            self.assertEqual(entry['status'], 'Converted homebrew')
            self.assertNotIn('source_import_gaps', entry)
            self.assertNotIn('multiattack', entry)
            self.assertIn('homebrew', str(entry['conversion_notes']).lower())

    def test_breaths_and_legendary_options_have_explicit_recovery_and_costs(self):
        for entry in self.entries:
            breaths = [row for row in entry['actions'] if 'Breath' in row['name']]
            self.assertEqual(len(breaths), 1, entry['name'])
            self.assertIn('Recharge 5-6', breaths[0]['name'])
            self.assertIn('start of', breaths[0]['description'])
            self.assertIn('cannot be Blocked', breaths[0]['description'])
            legend = entry['legendary_actions']
            self.assertEqual(legend[0]['name'], 'Legendary action pool')
            self.assertIn('3 legendary actions', legend[0]['description'])
            self.assertIn('start of its own turn', legend[0]['description'])
            self.assertIn('end of another creature', legend[0]['description'])
            for row in legend[1:]:
                self.assertRegex(row['name'], r'\([123] actions?\)$')
            self.assertEqual(sum(row['name'] == 'Legendary Resistance (3/day)' for row in entry['traits']), 1)

    def test_existing_special_rules_preserve_their_printed_damage_and_dc(self):
        stone = self.by_name['Adult Cerithal Stone dragon']
        self.assertEqual(stone['bonus_actions'][0]['name'], 'Difficult Terrain Creation')
        spike = next(row for row in stone['legendary_actions'] if row['name'].startswith('Stone Spike'))
        self.assertIn('Pinned', spike['description'])
        self.assertIn('DC 19 Strength', spike['description'])
        self.assertIn('4d10 piercing', spike['description'])
        alloy = self.by_name['Adult Aetherium Alloy dragon']
        pulse = next(row for row in alloy['legendary_actions'] if row['name'].startswith('Magical Pulse'))
        self.assertIn('Hobbled', pulse['description'])
        self.assertIn('3d10 radiant', pulse['description'])
        self.assertIn('DC 19 Constitution', pulse['description'])
        self.assertEqual(sum(row['name'] == 'Radiation Aura' for row in alloy['traits']), 1)
        neo = self.by_name['Adult Neodrakite dragon']
        attack = next(row for row in neo['actions'] if row['name'].startswith('Metal Attraction/Repulsion Breath'))
        self.assertIn('12d6 lightning', attack['description'])
        self.assertIn('DC 18 Dexterity', attack['description'])
        self.assertIn('10 feet', attack['description'])
        self.assertIn('half as much on a success', attack['description'])
        self.assertIn('On a success, no movement or Prone', attack['description'])
        self.assertEqual(self.by_name['Adult Dyspraxium Salt dragon']['block'], '2 pool / +2 check')

    def test_custom_material_completions_have_limits_and_no_invented_spell_links(self):
        names = ['Adult Dyspraxium Salt dragon', 'Adult Erbion Essence dragon', 'Adult Euralite Gem dragon', 'Adult Holmara Rock dragon', 'Adult Lanthara Crystal dragon', 'Adult Samarkium Ore dragon', 'Adult Terbithal Resin dragon', 'Adult Thulmara Dust dragon']
        for name in names:
            entry = self.by_name[name]
            self.assertIn('newly designed', str(entry['conversion_notes']))
            self.assertFalse(entry.get('spell_references'))
        healing = next(row for row in self.by_name['Adult Erbion Essence dragon']['actions'] if row['name'].startswith('Healing Breath'))
        self.assertIn('3/day', healing['name'])
        self.assertIn('three uses per 24 hours', healing['description'])
        aurumathar = self.by_name['Aurumathar']
        self.assertNotIn('teleport', aurumathar['speed'])
        self.assertIn('120 feet', aurumathar['bonus_actions'][0]['description'])
        molten = next(row for row in self.by_name['Adult Ytriun Metal dragon']['legendary_actions'] if row['name'].startswith('Molten Metal Surge'))
        self.assertIn('hazardous for 1 minute', molten['description'])
        self.assertIn('at most once per turn', molten['description'])


if __name__ == '__main__':
    unittest.main()
