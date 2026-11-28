"""Regression coverage for independent creature options and archived summon sources."""
from pathlib import Path
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]


class HomebrewerySummonsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document = yaml.safe_load((ROOT / 'data/monsters/tarta-summons.yaml').read_text(encoding='utf-8'))
        cls.entries = cls.document['entries']
        cls.by_name = {entry['name']: entry for entry in cls.entries}

    def test_six_source_blocks_and_three_completed_templates_have_stable_identities(self):
        expected = {'Earth Elemental Servant', 'Resilient Plant', 'Awakened Earth', 'Geochemical Golem', 'Stone Servant', 'Colossal Sand Golem', 'Thorn Spitter', 'Rockplica duplicate', 'Stone illusion duplicate'}
        self.assertEqual(set(self.by_name), expected)
        self.assertEqual(len({entry['id'] for entry in self.entries}), 9)
        self.assertTrue(all(entry['group'] == 'Tarta Homebrewery - Summons' for entry in self.entries))
        for entry in self.entries:
            self.assertTrue(entry['source_ref'].startswith('draft2.pdf / PDF page '))
            self.assertTrue(entry['original_5e'])
            self.assertTrue(entry['conversion_notes'])
            self.assertEqual(set(entry['abilities']), {'str', 'dex', 'con', 'int', 'wis', 'cha'})
            self.assertNotIn('status', entry)

    def test_printed_full_block_scores_and_source_numbers_survive(self):
        for name, hp, cr in [('Earth Elemental Servant', '126 (12d10 + 60)', '10'), ('Geochemical Golem', '80 (10d10 + 30)', '5'), ('Stone Servant', '86 (8d10 + 42)', '4'), ('Colossal Sand Golem', '200', '16')]:
            entry = self.by_name[name]
            self.assertEqual(str(entry['hp']).split()[0], hp.split()[0])
            self.assertEqual(entry['original_5e']['hp'], hp)
            self.assertEqual(entry['cr'], cr)
            self.assertEqual(entry['abilities'], entry['original_5e']['abilities'])
        self.assertEqual(self.by_name['Colossal Sand Golem']['size'], 'Huge')
        self.assertIn('24d12 + 48 + spellcasting modifier', self.by_name['Resilient Plant']['original_5e']['hp'])
        for name, hp in [('Resilient Plant', '200'), ('Awakened Earth', '75')]:
            entry = self.by_name[name]
            self.assertEqual(entry['hp'], hp)
            vitality = next(row['description'] for row in entry['traits'] if row['name'] == 'Controller-linked vitality (optional)')
            self.assertIn('existing effect or the GM', vitality)
            self.assertIn("controller's spellcasting ability modifier", vitality)
            self.assertIn('minimum total 1', vitality)

    def test_defensive_servant_does_not_expose_archived_offensive_slam(self):
        entry = self.by_name['Stone Servant']
        self.assertNotIn('Slam', [row['name'] for row in entry['actions']])
        self.assertIn('Slam', [row['name'] for row in entry['original_5e']['actions']])
        self.assertIn('cannot attack', entry['original_5e']['parent_spell_restriction'])
        self.assertTrue({'Work or Help', 'Guard'} <= {row['name'] for row in entry['actions']})
        self.assertIn('1 pool / +1 check', entry['block'])

    def test_save_only_charge_and_sandstorm_cannot_be_blocked_but_attacks_can(self):
        servant = self.by_name['Earth Elemental Servant']
        slam = next(row['description'] for row in servant['actions'] if row['name'] == 'Slam')
        self.assertIn('Block DC 16', slam)
        self.assertIn('Unblocked strike: 14 (2d8 + 5)', slam)
        charge = next(row['description'] for row in servant['actions'] if row['name'].startswith('Unstoppable Force'))
        self.assertIn('area save cannot be Blocked', charge)
        self.assertIn('follow-up Slam can be Blocked', charge)
        golem = self.by_name['Colossal Sand Golem']
        engulf = next(row['description'] for row in golem['traits'] if row['name'] == 'Engulf')
        for expected in ['DC 18 Dexterity', 'Large or smaller', 'DC 18 Strength', 'An adjacent ally', '0 HP', 'Pinned', 'cannot be Blocked']:
            self.assertIn(expected, engulf)
        self.assertIn('3d8 + 7', next(row['description'] for row in golem['actions'] if row['name'] == 'Slam'))

    def test_anchored_and_rooted_entities_do_not_gain_generic_movement(self):
        earth = self.by_name['Awakened Earth']
        self.assertIn('within its anchored area only', earth['speed'])
        self.assertIn('cannot leave', ' '.join(row['description'] for row in earth['traits']))
        self.assertEqual(self.by_name['Resilient Plant']['speed'], '0 ft.')
        self.assertEqual(self.by_name['Thorn Spitter']['speed'], '0 ft.')
        self.assertIn('Rootbound Stalker', self.by_name['Thorn Spitter']['source_completion']['baseline'])
        thorn_attack = self.by_name['Thorn Spitter']['actions'][0]['description']
        self.assertIn('Ranged spell attack +4', thorn_attack)
        self.assertIn('Block DC 12', thorn_attack)
        self.assertIn('existing effect or the GM', thorn_attack)
        self.assertIn("controller's spell attack bonus instead of +4", thorn_attack)
        self.assertIn('Block DC 8 + that spell attack bonus', thorn_attack)

    def test_duplicate_defaults_are_complete_and_keep_optional_templates_and_shared_resources(self):
        for name in ['Rockplica duplicate', 'Stone illusion duplicate']:
            entry = self.by_name[name]
            self.assertEqual(entry['type'], 'construct')
            self.assertEqual(entry['cr'], '1' if name == 'Rockplica duplicate' else '0')
            self.assertTrue(all(str(score).isdigit() for score in entry['abilities'].values()))
            self.assertTrue(all(str(score).startswith('Controller ') for score in entry['source_template']['abilities'].values()))
            self.assertNotIn('xp', entry)
            setup = next(row['description'] for row in entry['traits'] if row['name'] == 'Template setup')
            self.assertIn('model creature', setup)
            self.assertIn('including an NPC', setup)
            self.assertIn('neither creates a creature nor grants control', setup)
        rock = ' '.join(row['description'] for row in self.by_name['Rockplica duplicate']['traits'])
        self.assertIn("model creature's existing supply", rock)
        self.assertIn('cannot create another duplicate or summon', rock)
        self.assertIn('no independent concentration capacity', rock)
        self.assertIn('already maintaining concentration', rock)
        self.assertIn('without ending it normally', rock)
        self.assertNotIn('Because Rockplica already', rock)
        self.assertNotIn('parent Rockplica spell', rock)
        illusion = ' '.join(row['description'] for row in self.by_name['Stone illusion duplicate']['traits'])
        self.assertIn('Cannot attack', illusion)
        self.assertIn('cast spells', illusion)
        self.assertIn('60 feet', illusion)
        self.assertIn('if none are specified, use 1 minute', illusion)
        self.assertEqual(self.by_name['Stone illusion duplicate']['hp'], '1')

    def test_monsters_do_not_require_removed_creation_spells_or_features(self):
        for entry in self.entries:
            with self.subTest(monster=entry['name']):
                self.assertNotIn('summoned_by', entry)
                control = next(row['description'] for row in entry['traits'] if row['name'] == 'Optional controlled companion')
                self.assertIn('existing effect or the GM', control)
                self.assertIn('Without an assigned controller, it acts independently', control)
                self.assertIn('grants no ability to create or summon it', control)
                live = yaml.safe_dump({key: value for key, value in entry.items() if key not in {'original_5e', 'conversion_notes', 'source_ref', 'source_completion'}})
                self.assertNotIn('Geomorphy spells', live)
                self.assertNotIn('linked current', live)
                self.assertNotRegex(live, r'parent.{0,35}spell')
        earth = self.by_name['Awakened Earth']
        control_break = next(row['description'] for row in earth['actions'] if row['name'] == 'Break control')
        self.assertIn('While controlled', control_break)
        self.assertIn('control DC assigned by the GM', control_break)
        self.assertIn('unavailable when it is already independent', control_break)
        servant = next(row['description'] for row in self.by_name['Stone Servant']['traits'] if row['name'] == 'Noncombat servant')
        self.assertIn('An independent servant has no controller-distance restriction', servant)

    def test_material_variants_configure_a_monster_without_granting_a_spell(self):
        golem = self.by_name['Geochemical Golem']
        self.assertEqual(len(golem['material_options']), 12)
        self.assertTrue(all(option['name'] and option['effect'] for option in golem['material_options']))
        rules = golem['material_rules']
        self.assertIn('When configuring or creating a golem', rules)
        self.assertIn('one to four distinct materials', rules)
        self.assertIn('grants no crafting or spellcasting ability', rules)
        self.assertNotIn('when casting', rules)
        infusion = next(row['description'] for row in golem['traits'] if row['name'] == 'Elemental Infusion')
        self.assertIn('unconfigured golem has none', infusion)
        self.assertNotIn('used in the casting', infusion)


if __name__ == '__main__':
    unittest.main()
