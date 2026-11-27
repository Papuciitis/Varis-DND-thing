# Generic monster names

The remaining named NPCs and gender-labelled encounter records now use reusable creature titles. All 215 monsters are retained, with the same stable IDs, ability scores, defenses, attacks, equipment, spell references and encounter themes. Personal aliases and original gendered source headers remain in collapsed provenance.

The changes use the existing targeted-override format in `data/monsters/custom.yaml`. Original campaign imports and wiki snapshots remain intact. The source index is `data/monsters/source/generic-name-index.json`. Monster editor exports preserve these compiled overrides along with later edits.

Older browser edits that still use an exact original NPC title adopt the new generic title while retaining their edited statistics. Deliberately chosen custom campaign names remain as entered. Both kinds of edits remain exportable through the usual monster tools.

| Original source title | Generic encounter title |
| --- | --- |
| Dragazhar | Blade-Tailed Drake |
| Minotaur female barbarian - Miratrin 'Strongwalker' | Minotaur Halberd Berserker |
| Camelfolk female sorcerer - Papaya | Camelfolk Pyromancer |
| Leonin male fighter leader - Drion Goldenseeker | Leonin Greataxe Captain |
| Loxodon male cleric - Chandruuv | Loxodon Warhammer Priest |
| Raguch the Ogrillion | Ogrillion Club Brute |
| The Ondonti male druid/cleric | Ondonti Scythe Shaman |
| The Half-Orc Female sorcerer leader | Half-Orc Spellbinder |
| The Gray Orc male | Gray Orc Raider |
| Wild Man barbarian | Wilderness Berserker |
| Elftaur female druid | Elftaur Grove Druid |
| Tiefling female sorcerer leader | Tiefling Battle Mage |
| Leonin male (rogue/assasin) | Leonin Shortsword Assassin |
| Custead Armored Forces | Armored Lancer |
| Gnoll Spearmen | Gnoll Spear Raider |
| Sand shifter female | Sand Shifter Scout |
| Forest child female leader | Forest Child Shaman |
| Formicid male | Formicid Spear Guard |
| Ishilb male paladin | Ishilb Greatsword Knight |
| Aurumathar | Aetherium Alloy Dragon Sovereign |

Creature-specific rule text uses neutral creature references. For example, Miratrin's healing Bite still restores the same HP, Drion's Leadership keeps its same die/range/duration, and the dragon sovereign retains Aurumathar's Colossal profile and CR. Titles such as Golden Sow, Emerald Twilight-Hen and ordinary creature species names remain creature descriptions; male/female NPC labels are removed.

When adding future profiles, prefer species plus role, signature anatomy or equipment. Keep unique character names in source notes; avoid sex labels in generic encounter titles. Preserve distinctions between mechanically different profiles, such as Ogrillion Club Brute and the existing Ogrillion, or Gray Orc Raider and the existing Gray Orc.

