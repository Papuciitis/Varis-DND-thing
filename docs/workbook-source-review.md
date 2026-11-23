# Workbook source review

The original Git rules remain the baseline. This import adds a creature reference
collection and links existing spells to related workbook creatures. It does not
replace background or spell mechanics, change cantrips, or make workbook variants
override creature statistics already printed in an existing spell.

The reviewed source is `dnd spreadsheet.xlsx`, SHA-256
`5f713b3ee425f374d3cc9e5288fe80ad6d111f3cc0a05e42052ce1897680b571`.
The importer reads the workbook without modifying or exporting it. No copy of the
personal source workbook is required by the site or its tests.

## Source inventory

| Worksheet | Inspected range | Contents |
| --- | --- | --- |
| playable_races | A1:H16 | 15 race rows |
| backgrounds | A1:C113 | 112 backgrounds |
| weapons | A1:J136 | Header at row 2; 134 populated following rows |
| armor | A1:I23 | 22 armor rows |
| shields | A1:G11 | 10 shield rows |
| spells | A1:M366 | 364 named spell rows and one unnamed draft row |
| creatures | A1:P21 | 20 creature blocks |
| class_data | A1:E130 | 129 class-data rows |
| feats | A1:C13 | 12 feat rows |

No formulas were found in this source. Workbook cells are source material, not
instructions to the importer or reader.

## Background reconciliation

All 112 workbook backgrounds are represented by the existing 116 YAML backgrounds
after these reviewed name matches:

| Workbook name | Existing YAML name |
| --- | --- |
| Necromancers apprentice | Necromancer's apprentice |
| Sorcerers child | Sorcerer's child |
| Outlander | Outlander sage |
| Lurker | Stalker |
| Thorn lander | Thornlander |
| Tortured prodigee | Tortured prodigy |

The YAML also contains Fortune teller, Host, Mana-burn survivor, and Marsh dweller.
The workbook is not imported over these definitions. Material source differences
remain review evidence:

- **Agent, backgrounds!B3:C3:** the workbook gives one language and one choice of
  stealth, deception, or disguise. Its Plan B feature rerolls your d20 or a d20
  directly affecting you. Existing YAML grants a language, deception and stealth,
  with the different Trump card feature. Existing YAML remains in use.
- **Coven outcast, backgrounds!B24:C24:** the workbook removes the repeated
  deception option and explicitly charges one rest die or **1d3 HP per spell
  level**. Existing YAML says 1d4 HP and has less explicit scaling wording. This
  import makes no balance decision between them.
- Apprentice artificer's skill options differ at B5. Cult initiate's proficiency
  options differ at B26. Tortured prodigy's workbook feature at C103 explicitly
  adds one rest die per higher spell level.

## Spell reconciliation

The workbook has 364 named spells. At review time, 202 names matched current spell
YAML exactly after case and surrounding-space normalization. The remaining 162
include renames, older variants, and distinct drafts; they are not 162 established
missing rules and are not imported in bulk.

Arcane cantrips occupy spells!A2:L14. Fire, ice, and earth utility appear as Minor
pyromancy (row 10), Lesser cryomancy (row 5), and Minor geomancy (row 7). Lesser wind
binding (row 6) contains wind effects without lightning. It is the workbook
counterpart of the existing Git Lesser ethurgy, whose mechanics differ. Cantrips
remain unchanged as requested.

Source defects include `acane` at A29, trailing spaces, missing durations on 218
named spells, and missing ranges on 20. Arcane eye's casting field E2 contradicts
its effect I2. Minor geomancy's E7/I7 mixes action and bonus-action wording. Row 346
contains a TODO name, row 362 has no name, and rows 364 and 366 have no effect text.
These gaps are not filled by inference.

## Creature collection and summon links

`data/monsters.yaml` preserves all 20 source blocks as **Workbook reference
creatures**. The importer preserves nonempty fields as text, retains ability
expressions such as `12 + 1d6` and `14(+4)`, and separates actions only at explicit
source delimiters. It does not calculate derived statistics, expand immunity
shorthand, or invent absent fields. Each entry has its exact source range and a
note that existing spell rules and embedded statistics take priority.

The workbook's spells!M column contains 15 spell references with 19 edges to 17
distinct creatures. All source creature names resolve. The sidecar
`data/summon-links.yaml` adds **11 verified existing-spell links with 15 edges**:

| Existing spell | Workbook spell reference | Creature rows |
| --- | --- | --- |
| Animate skull | M24 | 2 |
| Create skeleton | M29 | 3 |
| Create undead | M40 | 4 |
| Animate arcane golem | M57 | 5 |
| Create undead warrior | M63 | 6 |
| Summon elemental | M73 | 7 |
| Raise zombies | M98 | 8 |
| Skeletal servant | M117 | 9 |
| Summon greater elemental | M126 | 13–17 |
| Summon cosmic trigon | M139 | 18 |
| Mud servant | M327 | 20 |

Animate skeleton → Create skeleton is the sole non-exact spell rename used by the
importer. Both describe the level 1 subservient medium skeleton with the matching
base ability scores. Their differing armor and other rules are retained in their
respective sources. Every link is explicitly marked as a workbook reference
variant, including those whose names match exactly.

Four referenced source spells have no verified canonical counterpart and remain
unmapped: Animate zombie (M58), Behold, the eidolon (M225), Raise occult skeleton
(M353), and Bound imp (M357). No substitute spell names or new spell definitions
are invented. Their related creatures remain available in the monster collection.
Manaworm, corridor crawler, and False wisp have no spells!M references in the source.

Known creature issues are preserved and identified:

- creatures!C2, C3, and C20 store date serials 46113, 46054, and 46054 with `d/m`
  formatting. Their displayed CR values are retained as text **1/4, 1/2, 1/2**, with
  a conversion note. They are not imported as enormous numeric CR values.
- Raised undead (row 4) lacks speed; undead warrior (row 6) lacks AC. Both are
  labeled **Incomplete draft**.
- False wisp (row 12) has only name, meta, CR, and AC and is labeled **Incomplete
  draft**. Missing HP, abilities, speed, and actions stay absent.
- Greater crystal elemental's O17 refers to a lightning elemental. Cosmic trigon's
  P18 contains malformed `8dforce sonic` damage and unclear save handling. Notes
  flag these unresolved source problems without replacing the source text.

## Reproducing the import

Run from the repository with its Python environment and PyYAML installed:

```powershell
python scripts/import_monsters.py 'path/to/dnd spreadsheet.xlsx'
python scripts/import_monsters.py 'path/to/dnd spreadsheet.xlsx' --check
```

The default outputs are only `data/monsters.yaml` and `data/summon-links.yaml`.
`--output-dir PATH` selects another output directory. `--catalog-dir PATH` selects
the existing YAML catalog used to resolve spell names; it defaults to this
repository's `data` directory independently of the output directory. `--check`
compares both generated files and exits with status 1 on drift without writing.
Unmapped source spells are reported. Unit tests use small temporary XLSX fixtures,
not a private workbook path.
