23:11:2026 edits made

data/draft-classes/alchemist.yaml - Alchemist / Sublimate - Corrected "non-sacrifices essences" to "non-sacrificed essences".
data/draft-classes/alchemist.yaml - Alchemist / Protective face-mask - Removed a duplicated "rounds" after the duration parenthesis.
data/draft-classes/alchemist.yaml - Smuggler / Warding dust - Corrected "spell of magical effect" to "spell or magical effect".
data/draft-classes/alchemist.yaml - Soulstone alchemist / Black soulgem creation - Removed the duplicated "learn" from "learn you learn".
data/draft-classes/alchemist.yaml - Soulstone alchemist / Soul dust - Added the missing "and" between the no-attacks statement and the checks statement.
data/draft-classes/alchemist.yaml - Soulstone alchemist / Profane bomb - Corrected "in cast of no AOE" to "in case of no AOE".
data/draft-reference/items.yaml - Spring box - Corrected the stray article and hyphenated "pressure-sensitive traps".
data/draft-reference/items.yaml - Wispcap - Corrected noun agreement in "mushrooms that ... glow".
data/draft-spells/lvl-2-occult-spells.yaml - Draconic sacrifice ritual - Removed a duplicated full stop after the Dragonborn effect's one-hour duration.


26:11:2026 Geomancy author review and conversion drafts

- Added data/geomancy-review/decisions.yaml with one disposition for each of V.'s 140 comments: 30 rewritten drafts, 39 merge ideas, 47 rejections and 24 needs-design records.
- Drafts use Arcane/Oath/Occult/Mystic categories and levels 0-6. Proposed mechanics, new numbers, component costs, ritual expenditure, information limits and stacking choices are explicitly marked for author approval.
- Preserved both original source collections and all 140 author comments, including the historical revidew key. The compiler now treats the annotated copies as reviews of the original 156 entries instead of duplicate spell grants. The original source bytes, 439 current spells, 160 monsters and character-builder grants are unchanged.
- Reused Varis Snared/Hobbled terminology in proposed conversions and the existing Ethereal ejection convention for Earthwalk/Geomantic Ascendancy. Source descriptions retain their original mechanics and terminology.
- Retained 14 complete entries without author comments as unreviewed and the two missing source descriptions as source-missing. No descriptions were invented for those gaps.


27:11:2026 Recovered monster compendium import

- Added 55 editable creature profiles in `data/monsters/recovered-fauna.yaml` (12), `recovered-warriors.yaml` (15), `recovered-horrors.yaml` (15) and `recovered-lore.yaml` (13). The catalogue now has 215 monsters; all 160 previously compiled monster records are preserved. The current player spell catalogue remains 439 entries.
- Converted personal NPCs into reusable enemy archetypes, retaining distinctive weapons and anatomy. Examples include Omari → Scorpionfolk Glaive Tyrant, Yudith → Battlefist Rifle Engineer, Zephyr → Boarding Rapier Skirmisher and Hecat → Elven Hexblade Initiate. Loki and Willow become two distinct clockwork panther profiles; Hands remains a stationary six-handed surgical automaton. Other mappings and all 55 source dates appear in `docs/recovered-monsters.md` and `data/monsters/source/recovered-index.json`.
- Used the user's explicit authorization to complete partial concepts and missing mechanics. Each block identifies recovered statistics, source aliases, reconstructed scores, newly supplied rules and provisional CRs. The underlying recovery is a historical chat-search extract/summary, not a verbatim transcript export. Fully completed creature concepts are marked accordingly.
- Applied current Block pools, armor/shield training and Protection. Natural armor adds no equipment Block. Corrected legacy Hecat Block to its current DEX-derived pool. Orog, Orc War Chief and Ogre War Hulk have explicit legal shield/two-handed loadouts and alternate attacks.
- Used current weapon dice, range, Reload, Longbow Overdraw, Greataxe DC+ and Greatsword DC+++. Explicit oversized source weapon dice remain documented creature exceptions. Attack riders require an unblocked strike; save-only and automatic damage cannot be Blocked. Converted incompatible condition names and thunder damage to current equivalents.
- Added explicit rest/recharge resources, current Rage/Flurry and counterspelling costs, finite spawn limits, durations and turn timing. Summons have their own independent monster profiles; no new player spell, class feature or item grant is introduced. Added the current scaling Mud Servant to its existing spell's summon links alongside the preserved fixed mud golem reference, without replacing the spell's rules.
- Retained the rejected Sprig Nip exclusion and avoided duplicating Base Orc or importing personal character-build sketches. Added catalogue/editor/rendering and conversion-integrity checks, and updated the monster guide and inventory references.


27:11:2026 Monster encounter themes and campaign-style browsing

- Added `data/monster-themes.yaml` with one reviewed primary encounter theme for each of the 215 monsters, across 15 shelves: caverns/ruins, cities/guards/outlaws, constructs/workshops, cults/mages, deserts/canyons, dragons, earth/crystal realms, eldritch nightmares, fire/storms/sky, forests/wilds, frozen wastes, infernal invasions, orc/gnoll warbands, seas/coasts and tombs/restless dead.
- The compiler attaches only editorial `encounter_theme` metadata. Monster statistics, source collections, stable IDs, original notes, targeted-edit identities and summon/spell references are preserved. Source importers and their checked-in snapshots remain unchanged. Explicit saved theme overrides take priority, including after a targeted rename.
- Replaced the source-group browsing control with a primary Theme / setting filter and a default theme-card overview. Counts and examples mix creatures across imports. Creature type, CR, search, expandable statblocks and Pages still combine with the selected theme; monster breadcrumbs, previous/next navigation and search-result labels now follow it.
- Added an editable Theme / setting field with existing-name suggestions. Older browser overrides inherit their compiled theme; unassigned custom monsters use Other encounters. Theme placements are encounter suggestions, not new habitat rules or campaign canon.
- Updated the in-compendium conversion guide's browsing instructions, the monster documentation, and assignment/filter/editor regression coverage.

27:11:2026 author-confirmed rest-dice base

- data/draft-reference/progression.yaml, Rest, long rest, and rest dice: added the author's explicit rule that the base maximum is one rest die per character level, plus ancestry/background/feat/feature modifiers. Preserved the existing rest durations and recovery reference. No class slot progressions were changed.


27:11:2026 Generic, gender-neutral monster identities

- Replaced 20 remaining named, gender-labelled or faction-specific encounter titles through targeted overrides in data/monsters/custom.yaml. All 215 creatures remain distinct, including Gray Orc Raider alongside Gray Orc and Ogrillion Club Brute alongside Ogrillion.
- Examples: Miratrin becomes Minotaur Halberd Berserker; Papaya becomes Camelfolk Pyromancer; Drion becomes Leonin Greataxe Captain; Chandruuv becomes Loxodon Warhammer Priest; Aurumathar becomes Aetherium Alloy Dragon Sovereign. Male/female labels are removed from public encounter titles. The full correspondence is in data/monsters/source/generic-name-index.json and docs/generic-monster-names.md.
- Neutralized creature-specific personal references and pronouns in playable text, including the priest's Battle Blessing label. Kept ability scores, defenses, weapons, action mechanics, spell references, CRs and all 15 encounter themes. Stable IDs, original source targets, importer output and source provenance are retained.
- Changes are isolated to monster overrides, naming documentation/index and a dedicated monster regression test. Character-sheet source, its tests, progression rules and build.py are left to the ongoing Fighter-leveling work. The shared report is append-only.

- Monster editor naming migration also updates exact legacy NPC titles in saved browser overrides and YAML exports, preserving edited statistics and deliberately chosen custom names. Added dedicated compiled-catalog/editor regression tests. No character-sheet files are modified by this pass.
