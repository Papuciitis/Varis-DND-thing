"""Check source coverage and the complete converted encounter's mechanical links."""
from pathlib import Path
import re
import unittest

import yaml

from compiler import compile_data

ROOT = Path(__file__).resolve().parents[1]


class SmashMonsterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.collection = yaml.safe_load((ROOT/'data/monsters/smash-and-grab.yaml').read_text(encoding='utf-8'))
        cls.entries = {entry['name']:entry for entry in cls.collection['entries']}

    def test_all_ten_source_blocks_are_present_including_object(self):
        source = (ROOT/'data/monsters/source/smash-and-grab.txt').read_text(encoding='utf-8')
        source_names = set(re.findall(r'^(?:Infernal (?:Commando|Reaver|Technomancer|Saboteur|Behemoth|Hound|Healer|Portal)|Magical Guard|Event Guard)$',source,re.MULTILINE))
        self.assertEqual(len(source_names),10)
        self.assertEqual(set(self.entries),source_names)
        for name,entry in self.entries.items():
            self.assertIn(name,entry['original_5e'])
            self.assertTrue(entry['source_ref'] and entry['conversion_notes'] and entry['actions'])
            if name == 'Infernal Portal':
                self.assertEqual(entry['type'],'object')
                self.assertNotIn('abilities',entry)
            else:
                self.assertEqual(set(entry['abilities']),{'str','dex','con','int','wis','cha'})

    def test_source_average_hp_and_printed_max_variant_are_separate(self):
        for name,entry in self.entries.items():
            if name == 'Infernal Portal': continue
            match = re.search(r'(\d+)d(\d+)\s*\+\s*(\d+)',entry['hp'])
            count,faces,bonus = map(int,match.groups())
            printed_variant = int(re.search(r'\((\d+) max HP\)',entry['original_5e'])[1])
            self.assertEqual(entry['hp_max_variant'],printed_variant)
            if name != 'Infernal Commando':
                self.assertEqual(entry['hp_max_variant'],count*faces+bonus)
            self.assertEqual(int(entry['hp'].split()[0]),int(count*(faces+1)/2+bonus))

    def test_portal_table_has_one_original_outcome_per_percentile(self):
        portal = self.entries['Infernal Portal']
        hits = {number:0 for number in range(1,101)}
        for interval,_ in portal['unstable_table']['rows']:
            limits = list(map(int,interval.split('-')))
            for value in range(limits[0],limits[-1]+1): hits[value]+=1
        self.assertEqual(set(hits.values()),{1})
        self.assertTrue(any('initiative count 20' in item['description'] for item in portal['traits']))
        self.assertTrue(any('Steel Dragon' in item['alternative'] for item in portal['replacement_sources']))

    def test_guard_only_references_real_current_spells_at_actual_levels(self):
        guard = self.entries['Magical Guard']
        spells = next(section for section in compile_data(ROOT/'data') if section['key']=='spells')['entries']
        by_identity={(entry['group'],entry['name']):entry for entry in spells}
        self.assertEqual(guard['spell_slots'],{'1':'3','2':'3','3':'2'})
        for reference in guard['spell_references']:
            spell=by_identity[(reference['group'],reference['name'])]
            self.assertEqual(int(spell['details'].get('lvl',0)),reference['level'])
            self.assertLessEqual(reference['level'],3)
        text=' '.join(item['description'] for item in self.entries['Infernal Technomancer']['reactions'])
        self.assertIn('temporary Block',text)
        self.assertIn('does not grant the old +5 AC',text)


if __name__=='__main__': unittest.main()
