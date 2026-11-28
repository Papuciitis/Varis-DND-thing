"""Author approvals become normal spells while unresolved work stays review-only."""

from collections import Counter
import hashlib
import json
from pathlib import Path
import unittest

import yaml

from compiler import RulesLoader, compile_data


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / 'docs/archives/geomancy-review-2026-11-28.json'
APPROVED_SOURCE = 'spells/geomancy-approved.yaml'

# Source identity -> approved name, tradition and spell level. These are author
# decisions, including rethemes and level changes, rather than source PDF levels.
APPROVALS = {
    "Gemstone's Glee": ('Votive Gem', 'Oath', 0),
    "Geomorpher's Compass": ('Compass', 'Mystic', 1),
    'Lithoresonance': ('Lithoresonance', 'Mystic', 1),
    'Wind Slash': ('Wind Slash', 'Mystic', 0),
    'Drumbeat of the Ancients': ('Rebuke thy Name', 'Oath', 1),
    'Gemstone Keenness': ('Gemstone Keenness', 'Oath', 1),
    'Geomantic Pulse': ('Geomantic Awareness', 'Mystic', 1),
    'Granite Gaze': ('Granite Gaze', 'Mystic', 1),
    'Leaf Armor': ('Barkskin', 'Mystic', 1),
    "Monolith's Mercy": ('Bestow Comfort', 'Oath', 1),
    'Blossom Shield': ('Thornmantle', 'Occult', 1),
    'Crystalize': ('Crystal Blight', 'Occult', 2),
    "Earth's Grasp": ('Earthen Bonds', 'Oath', 1),
    "Geomorph's Vision": ('Landmemory', 'Mystic', 2),
    'Petrified Smite': ('Binding Smite', 'Oath', 2),
    'Rampart of Rubble': ('Stoneshell', 'Oath', 2),
    'Terran Traverse': ('Earthwalk', 'Mystic', 3),
    'Boulder Blast': ('Siege Stone', 'Oath', 3),
    "Earth's Echo": ('One with the land', 'Mystic', 3),
    "Greenery's Grasp": ('Grasping Green', 'Mystic', 2),
    'Crystal Shard': ('Crystal Shard', 'Mystic', 3),
    'Quake Hammer': ('Quake Hammer', 'Oath', 2),
    'Rocky Resilience': ('Seal of protection', 'Oath', 5),
    "Stone's Immunity": ('Stoneskin', 'Mystic', 3),
}


def spell_group(tradition, level):
    return f'{tradition} {"cantrips" if level == 0 else "spells"}'


def historical_digest(value):
    if isinstance(value, list):
        value = sorted(value, key=lambda record: record['name'])
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()


class GeomancyPromotionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.archive = json.loads(ARCHIVE.read_text(encoding='utf-8'))
        cls.sections = {section['key']: section for section in compile_data(ROOT / 'data')}
        cls.spells = cls.sections['spells']['entries']
        cls.promoted = {entry['name']: entry for entry in cls.spells if entry['source'] == APPROVED_SOURCE}
        cls.pending = {entry['name']: entry for entry in cls.sections['geomancy-review']['entries']}
        cls.decisions = yaml.load((ROOT / 'data/geomancy-review/decisions.yaml').read_text(encoding='utf-8'),
                                  Loader=RulesLoader)['geomancy_decisions']

    def details(self, name):
        return self.promoted[name]['details']

    def assert_text(self, name, field, *fragments):
        text = ' '.join(self.details(name)[field].split())
        for fragment in fragments:
            self.assertIn(fragment, text, (name, field, fragment))

    def test_history_preserves_originals_annotations_and_complete_author_decisions(self):
        self.assertEqual(self.archive['date'], '2026-11-28')
        self.assertEqual(self.archive['author_commit'], '2e3e332b6c7ec3a6e4cf0be6069f0923bc794377')
        self.assertEqual(self.archive['review_commit'], '8cf9b663a888afd39df71b48f78326b8f0b3567e')
        self.assertEqual(len(self.archive['original_entries']), 156)
        self.assertEqual(len(self.archive['annotated_entries']), 156)
        self.assertEqual(len(self.archive['decisions']), 140)
        # Immutable historical records were independently checked against those
        # commits. Hash field values, not JSON formatting or record ordering.
        expected = {
            'original_index': 'b7dfacdb1d61fb0e661c5fd5590f1847bf869c1abf7ecc62433b1bd5f10d77f6',
            'original_entries': '42dc0079f27d8c6c9f717b5402aa497ac8b4b31866fbb80f4840b0c7feed51ca',
            'annotated_entries': 'fdb185c49287d0deaab9e97c4c6f3e72b6a306faf15aadbe01ee8f0a60937bd2',
            'decisions': 'a59a7957dcac4ada9a0d3bbe84ed340368f1620adafb909c3856dedc8ee26c3b',
        }
        for key, digest in expected.items():
            with self.subTest(history=key):
                self.assertEqual(historical_digest(self.archive[key]), digest)
        originals = {record['name']: record for record in self.archive['original_entries']}
        self.assertEqual(len(originals), len(self.archive['original_entries']))
        self.assertEqual(set(originals), set(self.archive['outcomes']))
        annotations = self.archive['annotated_entries']
        self.assertEqual({record['name'] for record in annotations}, set(originals))
        self.assertEqual(sum(bool({'review', 'revidew'} & record.keys()) for record in annotations), 140)
        for record in self.archive['original_entries'] + annotations:
            self.assertTrue(record['_source_file'].endswith('.yaml'))

    def test_every_source_has_one_outcome_and_only_pending_sources_remain_in_review(self):
        outcomes = self.archive['outcomes']
        self.assertEqual(Counter(record['status'] for record in outcomes.values()),
                         {'approved': 24, 'rejected': 81, 'merged': 2, 'pending': 49})
        self.assertEqual({name for name, record in outcomes.items() if record['status'] == 'approved'}, set(APPROVALS))
        pending = {name for name, record in outcomes.items() if record['status'] == 'pending'}
        self.assertEqual(set(self.pending), pending)
        self.assertTrue(all(record['reason'].strip() for record in outcomes.values()))
        for directory in ('geomancy-review', 'geomancy-review-but-like-reviewed-this-time'):
            source_names = set()
            for path in (ROOT / 'data' / directory).glob('source-*.yaml'):
                records = yaml.load(path.read_text(encoding='utf-8-sig'), Loader=RulesLoader)['entries']
                source_names.update(record['name'] for record in records)
            self.assertEqual(source_names, pending, directory)
        self.assertEqual({record['name'] for record in self.decisions},
                         pending & {record['name'] for record in self.archive['decisions']})
        self.assertFalse(any(entry['details']['review_status'] in {'approved', 'rejected'}
                             for entry in self.pending.values()))

    def test_all_approved_spells_have_exact_normal_names_classes_and_levels(self):
        self.assertEqual(set(self.promoted), {name for name, _, _ in APPROVALS.values()})
        required = {'lvl', 'types', 'casting', 'components', 'range', 'duration', 'effect'}
        for source, (name, tradition, level) in APPROVALS.items():
            with self.subTest(source=source):
                group = spell_group(tradition, level)
                entry = self.promoted[name]
                self.assertEqual(entry['group'], group)
                self.assertEqual(entry['details']['lvl'], str(level))
                self.assertIn(tradition.lower(), entry['details']['types'].split(', '))
                self.assertTrue(required <= entry['details'].keys())
                self.assertTrue(all(entry['details'][key].strip() for key in required))
                self.assertFalse(set(entry['details']) - required - {'higher_levels', 'upgrades', 'AC_bonus_stacking'})
                self.assertEqual(self.archive['outcomes'][source]['spell'], {'name': name, 'group': group})
                self.assertEqual(sum(other['name'] == name and other['group'] == group for other in self.spells), 1)

    def test_duplicate_sources_resolve_to_approved_spells_without_extra_variants(self):
        for source, name in (("Earth's Eyes", 'One with the land'), ("Nature's Grasp", 'Grasping Green')):
            outcome = self.archive['outcomes'][source]
            self.assertEqual(outcome['status'], 'merged')
            self.assertEqual(outcome['spell'], {'name': name, 'group': 'Mystic spells'})
            self.assertNotIn(source, self.pending)
            self.assertFalse(any(entry['name'] == source for entry in self.spells))

    def test_unapproved_drafts_and_incomplete_responses_stay_pending_without_spell_grants(self):
        expected = {
            'Breeze Whisper': 'Breeze Whisper', 'Rockplica': 'Clay Simulacra', 'Rockrise': 'Rockrise',
            'Bloomheal': 'Bloomheal', 'Crystal Prison': 'Crystal Prison', "Highland's Rise": 'Raise Highland',
            "Stone's Simphony": 'Invocation of Concord', 'Crystal Mirror': 'Malefic Mirror',
            'Geomantic Ascendancy': 'Geomantic Ascendancy',
        }
        drafts = {record['name']: record['conversion']['name'] for record in self.decisions if record['status'] == 'draft'}
        self.assertEqual(drafts, expected)
        identities = {(entry['group'], entry['name']) for entry in self.spells}
        for source, name in expected.items():
            details = self.pending[source]['details']
            conversion = details['review_conversion']
            self.assertEqual(details['review_status'], 'draft')
            self.assertNotIn((spell_group(conversion['magic_class'], int(conversion['level'])), name), identities)
        self.assertEqual(self.pending['Bloomguard']['details']['review_status'], 'needs-design')
        archived = {record['name']: record for record in self.archive['decisions']}
        current = {record['name']: record for record in self.decisions}
        for name in ('Bloomguard', 'Rockplica'):
            record = current[name]
            expected_response = record.get('final-answer', record.get('author_response'))
            if expected_response is None:
                expected_response = record.get('conversion', {}).get('final-answer')
            response = self.pending[name]['details']['review_author_response']
            self.assertEqual(response, expected_response)
        self.assertTrue(archived['Bloomguard']['final-answer'].endswith('using a staff, po'))
        self.assertIn('actually would like an iteration for', archived['Rockplica']['final-answer'])
        self.assertEqual(self.pending['Temblor']['details']['review_status'], 'needs-design')
        for name in ("Earth's Guidance", "Stone's Embrace"):
            self.assertEqual(self.pending[name]['details']['review_status'], 'source-missing')
        originally_unreviewed = {record['name'] for record in self.archive['original_entries']} - set(archived)
        self.assertTrue(originally_unreviewed <= self.pending.keys())
        self.assertEqual(len(originally_unreviewed), 16)
        self.assertFalse(any(entry['source'].startswith('geomancy-review') for entry in self.spells))

    def test_wind_slash_uses_author_upgrade_levels_and_focus_and_push_options(self):
        details = self.details('Wind Slash')
        self.assertEqual(details['upgrades'], 'At 2nd, 6th and 10th character level, choose one upgrade:\n\n'
                         '* Increase the damage by 1d8. This upgrade can be chosen twice.\n'
                         '* Increase the range by 30 feet. This upgrade can be chosen twice.\n'
                         '* The target is pushed back 5 feet if the attack hits and is not blocked.')
        self.assertEqual(details['components'], 'Verbal, somatic, material (a slashing weapon, staff or wand held in one hand)')
        self.assert_text('Wind Slash', 'effect', '1d8 + your casting bonus slashing damage', 'This is a spell attack, not a weapon attack.')

    def test_barkskin_seal_and_quake_use_final_author_traditions_levels_and_mechanics(self):
        self.assertEqual(self.details('Barkskin')['duration'], '1 hour')
        self.assertNotIn('concentration', self.details('Barkskin')['types'])
        self.assert_text('Barkskin', 'effect', '+1 bonus to AC', 'no benefit while the creature wears heavy armor',
                         'no additional Block or temporary health')
        self.assert_text('Seal of protection', 'effect', '3 temporary block', 'fixed +3 bonus to AC',
                         'uses the largest of those spell bonuses rather than adding them together')
        self.assert_text('Quake Hammer', 'effect', '3d6 + casting bonus bludgeoning damage', 'knocked prone',
                         'dust for 1 round', 'obscures vision past 5ft', 'double damage to the structure underneath the caster')
        self.assert_text('Quake Hammer', 'higher_levels', 'above 2nd adds 1d6 damage', '3rd level or higher',
                         '15 feet', '5th level or higher', '20 feet')

    def test_one_with_the_land_preserves_the_author_mapping_benefit_and_sensory_cost(self):
        self.assertEqual(self.details('One with the land')['range'], 'Self; sensing radius 500 feet')
        self.assert_text('One with the land', 'effect', 'spend a spell slot of 3rd level or higher',
                         'willingly become blinded and close your other senses off',
                         'an accurate idea of maps and caverns within it', 'solid blobs and pockets of other material')
        self.assertEqual(self.details('One with the land')['higher_levels'],
                         'The sensing radius is 750 feet with a 4th-level slot, 1000 feet with a 5th-level slot, '
                         'and 5000 feet with a 6th-level slot. The maximum duration remains 1 hour.')

    def test_upcasting_changes_concentration_at_the_author_specified_slots(self):
        for name in ('Gemstone Keenness', 'Earthen Bonds'):
            self.assertIn('concentration', self.details(name)['types'])
            self.assertTrue(self.details(name)['duration'].startswith('Concentration'))
        self.assert_text('Gemstone Keenness', 'higher_levels', '3rd level or higher', '1 hour and removes the concentration requirement')
        self.assert_text('Gemstone Keenness', 'effect', 'cease wielding the weapon or cast Gemstone Keenness again')
        self.assert_text('Earthen Bonds', 'higher_levels', 'At 3rd slot level or higher, this spell no longer requires concentration.')
        self.assert_text('Thornmantle', 'higher_levels', 'At 2nd spell level, duration becomes 10 minutes.',
                         'At 4th spell level, the spell no longer requires concentration.')

    def test_other_approved_amendments_survive_normal_spell_publication(self):
        self.assert_text('Votive Gem', 'effect', 'function as an spellcasting focus akin to a crystal ball', 'does not require attunement')
        self.assert_text('Compass', 'effect', 'Spend a spell slot', 'within 100 miles')
        self.assert_text('Compass', 'higher_levels', '3rd level or higher', '1,000 miles', '5th level or higher', '5,000 miles')
        self.assert_text('Lithoresonance', 'effect', 'tap it thrice', 'crackling, deep, and with an earthy tembre')
        self.assert_text('Lithoresonance', 'higher_levels', '+1 bonus to saves and resistance to damage')
        self.assert_text('Rebuke thy Name', 'effect', 'actual name', 'increase the DC by 2', '5 or lower', 'add 1d3 rounds')
        self.assert_text('Rebuke thy Name', 'higher_levels', 'above 1st increases the range by 5 feet',
                         'above 2nd allows you to target one additional creature', 'by the name of their kind')
        self.assert_text('Geomantic Awareness', 'effect', 'Spend a spell slot')
        self.assert_text('Granite Gaze', 'effect', 'maintain contact with that surface and concentration')
        self.assertEqual(self.details('Bestow Comfort')['duration'], '10 minutes')
        self.assert_text('Bestow Comfort', 'effect', '1d3 + casting bonus temporary health', 'within 20 feet',
                         'casting bonus + 1 (minimum 2)')
        self.assert_text('Landmemory', 'higher_levels', '300 years', '500 years', '1000 years', '10000 years')
        self.assert_text('Binding Smite', 'higher_levels', 'adds 1d8 extra damage', 'duration increases by 1 minute')
        self.assert_text('Stoneshell', 'effect', '3d6 + casting bonus temporary health (min 3d8 + 1.)',
                         'treated as healing and restoring the stoneshell')
        self.assert_text('Stoneskin', 'effect', 'immune to bludgeoning, piercing and slashing damage from nonmagical attacks',
                         '+3 bonus to block checks')
        self.assert_text('Stoneskin', 'higher_levels', '6th-level spell slot', 'two willing creatures')


if __name__ == '__main__':
    unittest.main()
