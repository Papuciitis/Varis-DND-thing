"""Keep the complete source spell review separate from current character rules."""
import json
from pathlib import Path
import unittest

from compiler import compile_data
from character_rules import compile_character_rules

ROOT = Path(__file__).resolve().parents[1]


class GeomancyReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sections = compile_data(ROOT / 'data')
        cls.catalog = {section['key']: section for section in cls.sections}
        cls.entries = cls.catalog['geomancy-review']['entries']
        cls.index = json.loads((ROOT / 'data/geomancy-review/source-index.json').read_text(encoding='utf-8'))

    def test_every_index_title_and_extra_printed_body_is_accounted_for(self):
        aliases = self.index['body_title_aliases']
        names = {entry['name']: entry for entry in self.entries}
        self.assertEqual(len(names), 156)
        self.assertEqual(len(names), len(self.entries))
        listed = []
        for level, titles in self.index['levels'].items():
            for title in titles:
                name = aliases.get(title, title)
                listed.append(name)
                self.assertIn(name, names, title)
                self.assertEqual(names[name]['details']['level'], level, title)
                if title in aliases:
                    self.assertEqual(names[name]['details']['listed_as'], title)
        self.assertEqual(len(listed), 155)
        self.assertEqual(set(names) - set(listed), set(self.index['body_only_titles']))

    def test_original_bodies_are_readable_and_missing_source_text_is_explicit(self):
        missing = set(self.index['index_only_titles'])
        self.assertEqual(missing, {"Earth's Guidance", "Stone's Embrace"})
        full = [entry for entry in self.entries if entry['name'] not in missing]
        self.assertEqual(len(full), 154)
        for entry in self.entries:
            with self.subTest(spell=entry['name']):
                details = entry['details']
                self.assertRegex(details['source_ref'], r'^draft2\.pdf / PDF pages? \d+')
                self.assertNotIn('\ufffd', json.dumps(details, ensure_ascii=False))
                if entry['name'] in missing:
                    self.assertIn('description missing', details['draft_note'])
                    self.assertNotIn('casting', details)
                else:
                    for field in ['school', 'casting', 'range', 'duration', 'components', 'description']:
                        self.assertTrue(details[field].strip(), (entry['name'], field))

    def test_source_high_levels_are_preserved_without_current_spell_grants(self):
        self.assertEqual(len(self.catalog['spells']['entries']), 439)
        original = [e for e in self.catalog['monsters']['entries'] if not e['source'].startswith('monsters/recovered-')]
        self.assertEqual(len(original), 160)
        self.assertFalse(any(entry['source'].startswith('geomancy-review/') for entry in self.catalog['spells']['entries']))
        names = {entry['name']: entry['details'] for entry in self.entries}
        self.assertEqual(names["Worldshaper's Command"]['level'], '10')
        self.assertEqual(names['Genesis']['level'], '11')
        self.assertEqual(names['Sandsoverign']['level'], '9')
        without_review = [section for section in self.sections if section['key'] != 'geomancy-review']
        self.assertEqual(compile_character_rules(self.sections), compile_character_rules(without_review))

    def test_related_creature_links_resolve_without_replacing_monster_identities(self):
        monsters = {entry['name'] for entry in self.catalog['monsters']['entries']}
        links = [entry for entry in self.entries if 'summons' in entry['details']]
        self.assertEqual(len(links), 7)
        for entry in links:
            self.assertEqual(entry['details']['summon_label'], 'Related monster option (converted)')
            for related in entry['details']['summons']:
                self.assertIn(related['monster'], monsters)


if __name__ == '__main__':
    unittest.main()
