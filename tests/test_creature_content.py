"""Complete default creatures and safe cross-creature naming."""
from copy import deepcopy
from pathlib import Path
import re
import unittest

from compiler import compile_data
from monster_names import apply_monster_reference_names

ROOT = Path(__file__).resolve().parents[1]


class CreatureContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = {s['key']: s for s in compile_data(ROOT / 'data')}
        cls.monsters = {e['name']: e['details'] for e in cls.catalog['monsters']['entries']}

    def test_every_creature_has_a_numeric_challenge_and_templates_have_usable_defaults(self):
        self.assertEqual(len(self.monsters), 302)
        for name, details in self.monsters.items():
            self.assertRegex(details['cr'], r'^\d+(?:/\d+)?$', name)
        self.assertEqual(self.monsters['Infernal Portal']['cr'], '12')
        self.assertEqual(self.monsters['Stoneform Duplicate']['cr'], '1')
        self.assertEqual(self.monsters['Stone illusion duplicate']['cr'], '0')
        for name in ('Stoneform Duplicate', 'Stone illusion duplicate'):
            d = self.monsters[name]
            self.assertTrue(all(str(s).isdigit() for s in d['abilities'].values()))
            self.assertTrue(str(d['ac']).isdigit())
            self.assertTrue(str(d['hp']).isdigit())
            self.assertIn('source_template', d)
            self.assertTrue(any(r['name'] == 'Template setup' for r in d['traits']))

    def test_armored_burrowing_beast_retains_provided_statistics_and_current_block(self):
        d = self.monsters['Burrow Hound Juggernaut']
        self.assertEqual((d['cr'], d['hp'], d['ac'], d['block']), ('6', '85', '19', '3 / +11 check'))
        self.assertEqual([int(d['abilities'][k]) for k in ('str','dex','con','int','wis','cha')], [26,14,20,2,10,2])
        self.assertEqual(d['speed'], '30 ft., burrow 10 ft., swim 10 ft.')
        self.assertIn('solid rock', str(d['traits']))
        self.assertIn('10 ft. in diameter', str(d['traits']))
        self.assertIn('Block DC 19', str(d['actions']))
        self.assertIn('18 temporary HP', str(d['bonus_actions']))
        self.assertIn('6 rounds', str(d['bonus_actions']))
        self.assertEqual(d['original_5e']['ac'], '20; touch 11, flat-footed 18 (+4 armor, +2 DEX, +5 natural, -1 size)')

    def test_current_creature_links_resolve_to_independent_profiles(self):
        for section in self.catalog.values():
            for e in section['entries']:
                details = e['details']
                if not isinstance(details, dict):
                    continue
                for ref in details.get('summons', []):
                    self.assertIn(ref['monster'], self.monsters, e['name'])

    def test_reference_categories_use_neutral_profile_descriptions(self):
        allowed = ('legacy d20', 'level-based d20', 'six-score', 'eight-attribute')
        imported = [d for d in self.monsters.values() if 'source_system' in d]
        self.assertEqual(len(imported), 87)
        for details in imported:
            self.assertTrue(details['source_system'].lower().startswith(allowed), details['source_system'])


class CreatureReferenceNameTests(unittest.TestCase):
    def test_plain_rule_values_and_shared_spell_names_are_preserved(self):
        sections = {
            'monsters': {'entries': [
                {'name': 'Lightning Mote', 'details': {'source_naming': {'original_name': 'Spark'}, 'actions': []}},
                {'name': 'Caster', 'details': {'actions': [{'name': 'Spark', 'description': 'Casts Spark using its current spell rules.'}]}}
            ]},
            'spells': {'entries': [{'name': 'Spark', 'details': {'effect': 'Original player spell.'}}]},
            'rules': {'entries': [{'name': 'Plain rule', 'details': 'Unstructured rule text.'},
                                   {'name': 'Creature options', 'details': {'summons': [{'monster': 'Spark', 'label': 'Spark'}]}}]}
        }
        before = deepcopy(sections)
        apply_monster_reference_names(sections)
        self.assertEqual(sections['spells'], before['spells'])
        self.assertEqual(sections['monsters']['entries'][1], before['monsters']['entries'][1])
        self.assertEqual(sections['rules']['entries'][0], before['rules']['entries'][0])
        self.assertEqual(sections['rules']['entries'][1]['details']['summons'],
                         [{'monster': 'Lightning Mote', 'label': 'Lightning Mote'}])


if __name__ == '__main__':
    unittest.main()
