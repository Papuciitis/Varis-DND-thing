"""Recovered profiles remain complete, traceable and usable under current combat rules."""
import json
from pathlib import Path
import re
import unittest

from compiler import compile_data

ROOT = Path(__file__).resolve().parents[1]
ABILITIES = ('str', 'dex', 'con', 'int', 'wis', 'cha')


class RecoveredMonsterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = {section['key']: section for section in compile_data(ROOT / 'data')}
        cls.monsters = {e['name']: e for e in cls.catalog['monsters']['entries']}
        cls.recovered = {name: e['details'] for name, e in cls.monsters.items()
                         if e['source'].startswith('monsters/recovered-')}
        cls.index = json.loads((ROOT / 'data/monsters/source/recovered-index.json').read_text(encoding='utf-8'))

    def row(self, monster, field, name):
        return next(row['description'] for row in self.recovered[monster][field] if row['name'] == name)

    def test_inventory_has_no_missing_duplicate_or_rejected_profiles(self):
        self.assertEqual(len(self.monsters), 301)
        self.assertEqual(len(self.recovered), 55)
        self.assertEqual({e['name'] for e in self.index['entries']}, set(self.recovered))
        self.assertEqual(len({e['id'] for e in self.index['entries']}), 55)
        for collection in self.index['collections']:
            self.assertEqual(sum(e['source'] == collection['file'] for e in self.monsters.values()), collection['count'])
        for name in ('Sprig Nip', 'Base Orc', 'Hecat', 'Omari', 'Loki', 'Willow', 'Hands'):
            self.assertNotIn(name, self.recovered)
        self.assertEqual(len(self.catalog['spells']['entries']), 439)

    def test_completed_values_and_source_status_are_present_and_separate(self):
        for name, details in self.recovered.items():
            with self.subTest(monster=name):
                for field in ('ac', 'hp', 'speed', 'block', 'cr', 'type', 'size', 'proficiency_bonus', 'senses', 'languages'):
                    self.assertTrue(details[field], field)
                self.assertEqual(set(details['abilities']), set(ABILITIES))
                self.assertTrue(all(1 <= int(details['abilities'][key]) <= 30 for key in ABILITIES))
                self.assertTrue(details['actions'])
                self.assertIn(details['ability_score_status'], ('sourced', 'reconstructed'))
                self.assertTrue(details['source_recovery']['original_name'])
                self.assertTrue(details['source_completion']['fields'])
                self.assertTrue(details['source_completion']['cr_status'])
                self.assertIn('not a verbatim transcript', details['original_5e']['format'])
                self.assertTrue(details['replacement_sources'])
                self.assertTrue(details['conversion_notes'])
                self.assertNotIn('\ufffd', json.dumps(details, ensure_ascii=False))
                scores = details['original_5e']['recorded_statistics'].get('scores')
                if isinstance(scores, list):
                    self.assertEqual([int(details['abilities'][key]) for key in ABILITIES], [int(s) for s in scores])

    def test_natural_armor_cannot_create_equipment_block(self):
        equipment = {'Orog': 2, 'Orc War Chief': 2, 'Ogre War Hulk': 1}
        for name, details in self.recovered.items():
            if name == 'Mud Servant':  # the creating spell explicitly overrides the ordinary pool
                continue
            dex = (int(details['abilities']['dex']) - 10) // 2
            self.assertEqual(int(details['block'].split(' / ')[0]), max(0, dex) + equipment.get(name, 0), name)
        self.assertEqual(self.recovered['Elven Hexblade Initiate']['block'], '2 / +2 check')
        self.assertEqual(self.recovered['Battlefist Rifle Engineer']['block'], '3 / +3 check')
        for name, expected in [('Orog', '+7'), ('Orc War Chief', '+9'), ('Ogre War Hulk', '+9')]:
            self.assertIn(expected + ' check', self.recovered[name]['block'])
            self.assertRegex(self.row(name, 'traits', 'Two-handed Loadout'), r'sling|slung|lower AC by 3')

    def test_strikes_use_current_block_dcs_and_explicit_weapon_modifiers(self):
        attacks = 0
        for name, details in self.recovered.items():
            for action in details['actions']:
                match = re.search(r'^(?:Melee|Ranged) attack: \+(\d+) to hit, .*?Block DC (\d+)\.', action['description'])
                if not match:
                    continue
                attacks += 1
                modifier = 3 if 'Greatsword' in action['name'] else 1 if action['name'] == 'Greataxe' else 0
                self.assertEqual(int(match[2]), int(match[1]) + 8 + modifier, (name, action['name']))
                self.assertIn('Unblocked strike:', action['description'])
        self.assertGreater(attacks, 60)
        for name in ('High Forest Orc', 'Gray Orc'):
            bow = self.row(name, 'actions', 'Longbow')
            self.assertIn('180/340 ft.', bow)
            self.assertIn('1d10 + 4', bow)  # Overdraw uses Strength for damage
            self.assertIn('Reload I', bow)

    def test_current_class_derived_features_keep_their_costs(self):
        rage = self.row('Scorpionfolk Glaive Tyrant', 'traits', 'Rage (once per combat)')
        self.assertIn('1 rest die as a free action', rage)
        self.assertIn('+8 damage', rage)
        self.assertIn('disadvantage on Block checks', rage)
        flurry = self.row('Elven Hexblade Initiate', 'traits', 'Flurry')
        self.assertIn('Once per turn', flurry)
        self.assertIn('free action', flurry)
        self.assertIn('refund', flurry)
        for name, feature in [('Elven Hexblade Initiate', 'Nullify'), ('Illusion-Boot Arcanist', 'Minor Counterspell')]:
            text = self.row(name, 'reactions', feature)
            self.assertIn('2 rest dice', text)
            self.assertIn("effect's spell save DC", text)

    def test_mud_servant_links_current_spell_without_erasing_workbook_variant(self):
        spell = next(e for e in self.catalog['spells']['entries'] if e['name'] == 'Mud servant')['details']
        self.assertEqual({ref['monster'] for ref in spell['summons']}, {'Mud Servant', 'mud golem'})
        details = self.recovered['Mud Servant']
        self.assertTrue(details['ac'].startswith('12 '))
        self.assertTrue(details['hp'].startswith('10 '))
        scaling = self.row('Mud Servant', 'traits', 'Caster Scaling')
        for rule in ('3d4 + casting bonus', 'max(1, casting modifier', 'Block DC 10 + casting bonus'):
            self.assertIn(rule, scaling)
        self.assertTrue(any(ref['name'] == 'Mud servant' for ref in details['summoned_by']))
        self.assertNotIn('spell_references', details)  # being created by a spell does not grant spellcasting

    def test_spawns_resolve_to_independent_profiles_and_have_finite_creation_rules(self):
        for name, details in self.recovered.items():
            for ref in details.get('summons', []):
                self.assertIn(ref['monster'], self.monsters, name)
                self.assertTrue(self.monsters[ref['monster']]['details']['actions'])
        birth = self.row('Birther of the Void', 'actions', 'Birth of Horror (recharge 5-6)')
        for rule in ('maximum 2', '1 minute', 'reaction', "birther's next turn"):
            self.assertIn(rule, birth)
        build = self.row('Fleshweaver Surgeon', 'actions', 'Build Stitchwork (1/day)')
        self.assertIn('full-round action', build)
        self.assertIn('maximum one', build)
        self.assertIn('1 hour', build)

    def test_companion_body_forms_and_recovered_modifier_arrays_are_preserved(self):
        expected = {
            'Tentacle Clockwork Panther': (16, 130, [4, 2, 3, -2, 1, -1]),
            'Spellguard Clockwork Panther': (16, 130, [3, 4, 3, -3, 2, -1]),
            'Six-Handed Surgical Automaton': (17, 180, [-2, 5, 0, 5, 2, -2]),
        }
        for name, (ac, hp, modifiers) in expected.items():
            details = self.recovered[name]
            self.assertEqual(int(details['ac']), ac)
            self.assertEqual(int(details['hp']), hp)
            self.assertEqual([(int(details['abilities'][key]) - 10) // 2 for key in ABILITIES], modifiers)
            self.assertEqual(details['type'], 'construct')
        automaton = self.recovered['Six-Handed Surgical Automaton']
        self.assertEqual(automaton['speed'], '0 ft.')
        self.assertIn('six', self.row('Six-Handed Surgical Automaton', 'actions', 'Multiattack'))


if __name__ == '__main__':
    unittest.main()
