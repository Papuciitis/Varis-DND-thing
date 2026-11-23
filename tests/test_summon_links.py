from pathlib import Path
import tempfile
import unittest

from compiler import compile_data


class SummonLinkTests(unittest.TestCase):
    def compile(self, link):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'spells.yaml').write_text('section: spells\nentries:\n- name: Summon imp\n  group: Occult\n  effect: Base Git effect\n', encoding='utf-8')
            (root / 'monsters.yaml').write_text('section: monsters\nentries:\n- name: Imp\n  ac: 12\n', encoding='utf-8')
            (root / 'summon-links.yaml').write_text(link, encoding='utf-8')
            return compile_data(root)

    def test_reference_adds_summons_without_replacing_spell_mechanics(self):
        sections = self.compile('summon_links:\n- spell: Summon imp\n  group: Occult\n  source_ref: workbook / spells!M2\n  summons:\n  - monster: Imp\n    notes: Reference variant\n')
        spell = next(s for s in sections if s['key'] == 'spells')['entries'][0]
        self.assertEqual(spell['details']['effect'], 'Base Git effect')
        self.assertEqual(spell['details']['summons'][0]['monster'], 'Imp')
        self.assertEqual(spell['details']['summon_source'], 'workbook / spells!M2')

    def test_dangling_spell_and_monster_refs_fail_with_source_filename(self):
        for spell, monster in [('Missing', 'Imp'), ('Summon imp', 'Missing')]:
            with self.subTest(spell=spell, monster=monster):
                with self.assertRaisesRegex(ValueError, r'summon-links.yaml:.*[Uu]nknown'):
                    self.compile(f'summon_links:\n- spell: {spell}\n  group: Occult\n  summons:\n  - monster: {monster}\n')

    def test_duplicate_links_fail(self):
        row = '- spell: Summon imp\n  group: Occult\n  summons:\n  - monster: Imp\n'
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            self.compile('summon_links:\n' + row + row)

    def test_empty_or_null_sidecar_is_an_error_instead_of_silently_dropping_links(self):
        for document in ('', '# accidentally truncated\n', 'null\n'):
            with self.subTest(document=document):
                with self.assertRaisesRegex(ValueError, 'summon-links.yaml:'):
                    self.compile(document)


if __name__ == '__main__':
    unittest.main()
