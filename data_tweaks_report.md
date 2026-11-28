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


28:11:2026 Mixed-system monster conversion batch

- Added 86 editable profiles: 51 Eight-attribute conversions (50 creature pages with two separate Mycolid variants), 16 other screenshot creatures, 12 monstrous-spider ages and 7 goblin profiles. The manual now contains 301 monsters; the existing 215 and all 439 current player spells are retained.
- Added legacy-creatures.yaml, legacy-spiders.yaml, goblin-variants.yaml, setting-creatures.yaml and the source/cross-system-index.json inventory. Added all profiles to the existing 15 encounter themes. Source-system names, numerical statistics, score reconstruction, provisional CRs and gap completions are retained in source panels.
- Reconstructed eight-attribute scores from its eight ratings and level-based d20 scores from modifiers; replaced old BAB, size accuracy, level-based d20 level scaling and stunt/Mana economies with explicit current actions, proficiency and bounded resources. Kept natural protection separate from equipped armor/shield Block; converted equipment to current weapon dice, Bulk, Protection, Reload and Block DC properties.
- Long legacy paralysis uses current Stunned so recovery CON saves remain legal; fixed one-turn Paralyzed effects expire automatically. Ability drain, save-or-die and unbounded possession/spawning have bounded damage, current conditions and explicit escape/recovery. Personal/geographic role titles become reusable species/equipment titles; original aliases remain in notes.
- Natural Goblin Shark, Shark-Shifting Goblin and Sharkskin Goblin are distinct. The Dogmole Juggernaut sidebar has no full source block and stays an acknowledged variant hook, not a fabricated source statblock. No player spells, class features, review spells or magic-item grants are added.
- Changes are limited to monster data/themes, monster documentation/tests and this append-only report. Character progression, sheet code and other active work remain untouched.

- Validation: isolated site build produces 301 monsters and 439 spells; the 73-test monster Python suite passed, then all 7 final conversion checks passed. All 86 additions validate and round-trip through the monster editor; the 37 JavaScript monster checks pass. Final compiled-data comparison preserves every existing monster and player spell exactly.


28:11:2026 Creature completeness and naming pass

- Added Burrow Hound Juggernaut as a separate CR 6 beast with current barding, Block, burrowing, powerful build, natural attacks, ferocity and finite frenzy. The manual now contains 302 creatures; the player spell list remains 439.
- Assigned the portal CR 12 and completed the duplicate templates with usable default bodies and CR 1/0, retaining optional model configuration and all shared-resource/control limits.
- Standardized 57 additional public titles; the 69 reviewed title overrides retain stable IDs, equipment and combat profiles. Creature references follow current titles, and old browser edits migrate default names and collection targets while preserving edited values.
- Neutralized reference labels in monster data and documentation. Renamed the setting-creature collection and updated its references.
- Fixed three historical collection checks to select the original nine source files explicitly, preserving their 160-creature assertion as later collections are added. Full portable-build and browser checks are being run for this pass.

- Final validation: all 164 Python tests pass, the complete JavaScript/browser test suite passes, and the standard site build produces 302 creatures and 439 player spells. Numerical comparison retains the previous 301 creature profiles except the three documented challenge/default completions; the player spell records are identical. All current creatures have numeric CRs, and compiled creature records use neutral reference labels. Character progression and class files are unchanged.


28:11:2026 confirmed Druid learning basis

data/draft-classes/druid.yaml - Druid / Spellcasting and cantrips - At the user's explicit direction, changed the maximum learned spell's level from half total character level to half Druid class level, rounded up. The character metadata and multiclass spell picker use the same corrected rule.


28:11:2026 declarative character automation migration

- Added data/character-automation.yaml with 38 declarations: eight explicit feat upgrade lists, More upgrades, Deep past, New tricks and 27 later-feature links to earlier choice lists. Moved the existing definitions and supported effects without rewriting their player-facing rule prose.
- Retained the existing upgrade option IDs, choice keys, source ownership compatibility mode and granted-spell IDs. Class list extensions resolve to their original compiled groups and feature-level gates.
- The compiler accepts inline automation on new feat/background/class/archetype/ancestry entries and sidecar attachments to existing features/options. Unsupported declared operations and broken references fail validation. No new feats, backgrounds, spells or archetypes were added to the player catalog.

- Final validation: the standard site build succeeds; all 182 Python checks and all 441 JavaScript checks pass. The new fixtures exercise content without registered names, repeated upgrade follow-ups, separate repeated-feat records, prerequisite tiers, nested feat grants beyond eight levels, source removal, spell casting and backup round-trips. Runtime/data source hashes remained unchanged throughout the final runs.


28:11:2026 author-approved spell promotion and pending review queue

- Applied V.'s review commit 2e3e332 (merged as 8cf9b66), including all 37 latest final-answer comments: 34 decision fields and three nested conversion fields. Latest author wording takes precedence over older AI statuses; a final-answer field does not itself mean approval.
- Added 24 approved entries to data/spells/geomancy-approved.yaml as normal Mystic, Oath or Occult spells. The complete spell catalog grows from 439 to 463 entries. These entries use existing class/level discovery and learning rules; no automatic learning or preparation is granted.
- Applied approved names, classes, levels and amendments: Votive Gem, Compass, Lithoresonance, Wind Slash, Rebuke thy Name, Gemstone Keenness, Geomantic Awareness, Granite Gaze, Barkskin, Bestow Comfort, Thornmantle, Crystal Blight, Earthen Bonds, Landmemory, Binding Smite, Stoneshell, Earthwalk, Siege Stone, One with the land, Grasping Green, Crystal Shard, Quake Hammer, Seal of protection and Stoneskin. Barkskin is Mystic; Landmemory and Quake Hammer are level 2; Seal of protection is Oath 5; Stoneskin is Mystic 3. Compass uses the specified slot 1/3/5 range jumps only. Source upcasting not replaced by an author amendment is retained.
- Removed 81 rejected entries and two resolved duplicates from both active review source collections, their indices and the decision overlay. Earth's Eyes resolves into One with the land; Nature's Grasp into Grasping Green. Only 49 pending entries remain: nine drafts, thirteen merge ideas, eleven design decisions, fourteen unreviewed descriptions and two missing descriptions. Unanswered higher drafts and Breeze Whisper remain pending; Temblor is not removed on the basis of an earlier AI rejection.
- Preserved all 156 original entries, all 156 annotated entries, all 140 pre-migration decisions including every final-answer, the full original index and all per-entry outcomes in docs/archives/geomancy-review-2026-11-28.json. This historical archive is outside the compiled data/search path. Pending original rules and source references are unchanged.
- Iterated Rockplica as a pending Occult 4 Clay Simulacra draft with the requested one-hour cast, one-day duration, unlimited range, one-third HP, restricted copied resources and spells, attribute bonuses, significant components/HP cost and multiple-copy GM clause. The exact costs, copy limits and higher-slot durations that V. did not specify are labeled provisional. Preserved Bloomguard's unfinished final-answer without inventing its ending or statistics. Both remain pending.
- Added the author's highest-numerical-spell-AC rule to Traditions of magic and reminders to 18 existing spells and three newly approved spells. Seal of protection retains its inline approved wording. Other spell effects and ordinary armor, shields, base-AC formulas and creature statistics keep their existing rules. This is a wording change, not a new temporary-spell combat engine.
- Renamed the reader section to Pending spell reviews and made all pending entries the default. Removed settled status options from the active queue, retained combined filters/search and displayed the latest author comment separately from original annotations. The compiler accepts literal root or conversion.final-answer comments as well as legacy author_response; conflicting duplicate comments fail validation. These comments remain outside active spell rules and grants.

- Final validation: the standard site build succeeds with 463 spells and 49 pending reviews; all 198 Python tests and all 447 JavaScript tests pass. Focused checks also cover both supported final-answer locations, contradictory comments, mutable pending follow-ups, archived provenance, all 24 class/level mappings and the absence of automatic spell grants. git diff --check passes.


28:11:2026 newer author reviews preserved during push preparation

- Found author commit 5aaa2bc (further review bits) after the completed promotion batch. Preserved its complete 140-record decisions.yaml, including the finished Bloomguard note, additional author responses and direct proposal edits, in docs/archives/geomancy-review-followup-5aaa2bc.yaml. This is a separate unprocessed follow-up snapshot; the active 24 promotions and 49-entry pending queue are unchanged. The next review pass must read this newer source before applying remaining decisions.
- Prepared a guarded Git Bash push helper that advances main only to that verified descendant review commit, preserves all working files, stages only this spell-review work and uses a normal push. Existing monster-test edits and local import material remain outside this commit.
