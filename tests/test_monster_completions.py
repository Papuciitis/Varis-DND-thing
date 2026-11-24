"""Source-backed completion preserves every recorded workbook rule and identity."""
from pathlib import Path
import hashlib
import json
import unittest
import yaml

ROOT=Path(__file__).resolve().parents[1]
ORIGINAL_HASHES={'raised undead': '87fb05023c26b54c0110254f75b2e347ad4d6a8457101d475af27de8c1863f80', 'undead warrior': '4e5a5d6bd3ac968c7d1a8ac6ba961f917f75cc881118f2e88ba5fa054b157d23', 'False wisp': '9779627e082032dcf3c53c46d3016ed28d50034487b53b10c3431f1451abb413', 'greater wind elemental': 'c46cdf91a99b849aef78d7926e511d212b59b106b17174877a43afe4be22f255'}

class MonsterCompletionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.document=yaml.safe_load((ROOT/'data/monsters.yaml').read_text(encoding='utf-8'))
        cls.by_name={entry['name']:entry for entry in cls.document['entries']}

    def test_filled_fields_preserve_all_preexisting_values_and_source_identities(self):
        self.assertEqual(len(self.document['entries']),20)
        for name,expected in ORIGINAL_HASHES.items():
            entry=dict(self.by_name[name])
            completion=entry.pop('source_completion')
            self.assertTrue(completion['note'])
            self.assertTrue(completion['donors'])
            for key in completion['original_missing_fields']:
                self.assertTrue(entry.pop(key), (name,key))
                self.assertTrue(any(key in donor['fields'] and donor['source'] and donor['link'] for donor in completion['donors']))
            actual=hashlib.sha256(json.dumps(entry,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
            self.assertEqual(actual,expected,name)

    def test_missing_undead_and_elemental_fields_use_current_existing_rules(self):
        self.assertEqual(self.by_name['raised undead']['speed'],'30 ft.')
        self.assertEqual(self.by_name['undead warrior']['ac'],'13 (unarmored; 10 + DEX modifier)')
        self.assertEqual(self.by_name['greater wind elemental']['block'],'6 / +6 check')
        self.assertEqual(self.by_name['greater wind elemental']['abilities']['dex'],'22(+4)')
        self.assertIn('Summon greater elemental',str(self.by_name['greater wind elemental']['source_completion']))

    def test_false_wisp_uses_current_spell_behavior_and_only_published_attribute_donor(self):
        wisp=self.by_name['False wisp']
        self.assertEqual(wisp['ac'],'14')
        self.assertEqual(wisp['cr'],'2')
        self.assertEqual(wisp['hp'],'4')
        self.assertEqual(list(wisp['abilities'].values()),['1','28','10','13','14','11'])
        self.assertEqual(wisp['block'],'9 / +9 check')
        self.assertEqual([row['name'] for row in wisp['actions']],['Follow a creature','Bother a creature','Protect a creature'])
        self.assertNotIn('Shock',str(wisp['actions']))
        self.assertNotIn('Consume Life',str(wisp['actions']))
        spell=yaml.safe_load((ROOT/'data/draft-spells/lvl-1-arcane-spells.yaml').read_text(encoding='utf-8'))
        donor=next(entry for entry in spell['entries'] if entry['name']=='Conjure minor wisp')
        for fragment in ['25 feet','60 feet','1d12 minutes','1d6 rounds','HP of 4','automatically fails all saves']:
            self.assertIn(fragment,donor['effect'])
        self.assertIn('Conjure minor wisp',str(wisp['source_completion']))
        self.assertIn('17060-will-o-wisp',str(wisp['source_completion']))

if __name__=='__main__':
    unittest.main()
