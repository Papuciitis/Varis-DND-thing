"""Encounter organization stays independent of source identities and combat rules."""
from copy import deepcopy
from pathlib import Path
import tempfile
import unittest

from compiler import compile_data
from monster_themes import apply_monster_themes

ROOT = Path(__file__).resolve().parents[1]


def fixture():
    return {'monsters': {'entries': [
        {'name': 'Skeleton', 'group': 'Imported creatures', 'source': 'monsters/source.yaml',
         'details': {'id': 'skeleton', 'hp': '13 (2d8 + 4)', 'original_5e': {'hp': 13}}},
        {'name': 'Mud Servant', 'group': 'Recovered creatures', 'source': 'monsters/recovered.yaml',
         'details': {'hp': '10', 'actions': [{'name': 'Slam', 'description': 'Attack.'}]}}
    ]}}


class MonsterThemeTests(unittest.TestCase):
    def test_all_current_profiles_have_editorial_themes_across_their_source_collections(self):
        monsters = next(s for s in compile_data(ROOT / 'data') if s['key'] == 'monsters')['entries']
        self.assertEqual(len(monsters), 302)
        self.assertEqual(len({e['details']['encounter_theme'] for e in monsters}), 15)
        by_name = {e['name']: e for e in monsters}
        for name in ('Skeleton', 'animated skeleton', 'Death Titan'):
            self.assertEqual(by_name[name]['details']['encounter_theme'], 'Tombs & restless dead')
        for name in ('Adult Red Dragon', 'Adult Steel Dragon', 'Adult Thulmara Dust dragon'):
            self.assertEqual(by_name[name]['details']['encounter_theme'], 'Dragons & their lairs')
        self.assertNotEqual(by_name['Skeleton']['group'], by_name['animated skeleton']['group'])
        self.assertEqual(by_name['Sea Guardian']['details']['encounter_theme'], 'Seas & coasts')
        self.assertEqual(by_name['Frostblade Sovereign']['details']['encounter_theme'], 'Frozen wastes')

    def test_metadata_does_not_change_statblocks_ids_groups_or_sources(self):
        sections = fixture()
        before = deepcopy(sections)
        apply_monster_themes({'monster_themes': [{'name': 'Ruins', 'monsters': ['Skeleton', 'Mud Servant']}]}, sections)
        for entry in sections['monsters']['entries']:
            self.assertEqual(entry['details'].pop('encounter_theme'), 'Ruins')
        self.assertEqual(sections, before)

    def test_renamed_monsters_keep_classification_and_explicit_editor_overrides_win(self):
        sections = fixture()
        skeleton = sections['monsters']['entries'][0]
        skeleton['monster_target'] = {'name': 'Skeleton', 'group': skeleton['group'], 'source': skeleton['source']}
        skeleton['name'] = 'Frozen Skeleton'
        skeleton['details']['encounter_theme'] = 'Frozen wastes'
        apply_monster_themes({'monster_themes': [{'name': 'Tombs', 'monsters': ['Skeleton']}]}, sections)
        self.assertEqual(skeleton['details']['encounter_theme'], 'Frozen wastes')
        self.assertEqual(skeleton['monster_target']['name'], 'Skeleton')

    def test_unknown_duplicate_empty_and_malformed_assignments_fail(self):
        cases = [None, {}, {'monster_themes': []},
                 {'monster_themes': [{'name': 'Ruins', 'monsters': ['Missing']}]},
                 {'monster_themes': [{'name': 'Ruins', 'monsters': ['Skeleton', 'Skeleton']}]},
                 {'monster_themes': [{'name': 'Ruins', 'monsters': ['Skeleton']}, {'name': 'Tombs', 'monsters': ['Skeleton']}]},
                 {'monster_themes': [{'name': 'Ruins', 'monsters': ['Skeleton']}, {'name': 'ruins', 'monsters': ['Mud Servant']}]},
                 {'monster_themes': [{'name': '', 'monsters': ['Skeleton']}]},
                 {'monster_themes': [{'name': 'Ruins', 'monsters': 'Skeleton'}]}]
        for document in cases:
            with self.subTest(document=document), self.assertRaises(ValueError):
                apply_monster_themes(document, fixture())

    def test_present_but_empty_sidecar_reports_its_filename(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'monsters.yaml').write_text('section: monsters\nentries:\n- name: Skeleton\n  hp: 13\n', encoding='utf-8')
            (root / 'monster-themes.yaml').write_text('', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'monster-themes.yaml:'):
                compile_data(root)


if __name__ == '__main__':
    unittest.main()
