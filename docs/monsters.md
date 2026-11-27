# Monsters and the statblock editor

The monster manual includes all 92 creatures, NPCs and encounter objects from the four campaign sources, alongside the 20 existing workbook references, 13 completed Tarta wiki dragon statblocks, 35 Homebrewery additions and 55 recovered chat profiles (215 entries total). Template examples are included: Adult Red Dragon is a playable entry, and the two differently described Ravager blocks remain separate creatures.

| Campaign source | Entries | Editable collection |
| --- | ---: | --- |
| Creature style template | 12 | `data/monsters/template.yaml` |
| Steel Dragons | 4 age variants | `data/monsters/steel-dragons.yaml` |
| Chronica campaign export | 66 | `data/monsters/chronica.yaml` |
| Smash and grab | 10, including Infernal Portal | `data/monsters/smash-and-grab.yaml` |
| Tarta wiki dragons | 13 completed homebrew profiles | `data/monsters/tarta-wiki.yaml` |
| Tarta Homebrewery elementals | 26 creatures | `data/monsters/tarta-elementals-low.yaml`, `data/monsters/tarta-elementals-high.yaml` |
| Tarta Homebrewery summons | 6 full source blocks plus 3 completed templates | `data/monsters/tarta-summons.yaml` |
| Recovered guardians and fauna | 12 | `data/monsters/recovered-fauna.yaml` |
| Recovered warbands and armed enemies | 15 | `data/monsters/recovered-warriors.yaml` |
| Recovered horrors and summons | 15 | `data/monsters/recovered-horrors.yaml` |
| Completed creature concepts and companions | 13 | `data/monsters/recovered-lore.yaml` |

## Conversion conventions

Printed creature AC, HP, speed, attacks and six abilities remain fixed monster statistics. Block follows the current combat rules; natural armor alone does not grant armor training or additional Block. Ordinary proficient attacks show Block DC equal to their attack bonus plus 8, subject to explicit weapon or feature exceptions. Damage and attached on-strike effects require an unblocked strike; effects resolved solely by saving throws cannot be Blocked.

The current compendium's conditions, class features and spells take priority over incompatible 5e wording. Existing fitting abilities and statblocks supply missing mechanics. Each substituted rule is identified in the entry's conversion notes and replacement sources. Daily uses stay daily; short and long rests follow the current one-day and one-week defaults. Printed recharge dice retain their own timing.

Chronica records ability modifiers rather than exact scores. The playable blocks use published scores where a matching profile is available, compatible existing donor scores where identified, and reconstructed scores for the remaining campaign profiles. Reconstruction chooses a score that preserves the recorded modifier and is marked **Reconstructed scores**. Source panels retain the original modifiers and explain the method; a reconstructed score is not claimed as an original source value. Nine otherwise blank NPC records use documented existing NPC baselines. Source challenge values are encounter estimates rather than a balance certification; missing campaign CRs, including Jobafo, have explicit provisional Vara estimates documented in conversion notes.

Original text, source locations, repairs and donor references remain available in collapsed source panels. The extracted documents and sanitized monster-only Chronica export are tracked under `data/monsters/source/`. Original unrelated campaign secrets are excluded.

The 55 recovered profiles use historical chat-search extracts rather than complete transcripts. With the user's explicit authorization, missing scores and mechanics are completed from current rules and compatible monster templates. Personal names become reusable enemy archetypes; the original aliases, recovered numbers, reconstructed values and provisional CRs remain in source notes. The [recovered inventory](recovered-monsters.md) maps every new profile to its source. No new player spells or class grants accompany these entries.

## Add and edit on the webpage

The manual opens with 15 **Theme / setting** cards covering all 215 monsters, such as Seas & coasts, Frozen wastes, Orc & gnoll warbands and Eldritch nightmares. Choose a theme to open its expandable monster list, or use **Browse all** for the complete manual. Themes mix source collections by encounter use; source details remain in notes. The [theme inventory](monster-organization.md) lists the categories and explains editing their assignments.

Each creature row shows its name, challenge and creature type; open several rows to compare their compact parchment statblocks. Bodies load when first expanded. Search, **Theme / setting** and **Challenge rating** lead the filters; open **Creature type** for type chips and **More filters** for display and sort. Applied filters can be removed individually. Challenge choices include fractions, exact ratings, ranges and **Unrated / unknown**. Unknown challenge is separate from CR 0. **Display** offers Theme overview, Expandable list and linked Pages. Monster-page breadcrumbs and previous/next navigation follow encounter themes. Monster pages, expanded rows and the live editor preview share the same statblock presentation.

Open **Monster manual**, then **Create monster**. Enter identity, defenses and abilities, and add named traits, actions, reactions or legendary/lair effects. The adjacent preview updates while you type; phones offer **Edit** and **Preview** views. **Save monster** adds it to browsing and search. Open an existing creature and expand **Monster tools** to edit or duplicate it. Cancel closes the draft without changing the saved creature.

**Theme / setting** chooses the creature's browsing shelf and suggests existing theme names. A custom campaign theme is allowed; an unassigned new custom creature appears under Other encounters. This field does not change the original source collection, import identity, statistics or summon links. Older browser edits inherit their compiled creature's theme unless they explicitly choose a different one.

Edits save in the current browser and at the current page location. They do not automatically sync to another browser, device or hosted page. Export a backup before clearing browser data. If browser storage fails, the current in-memory edits remain exportable and the page reports the problem.

For changes that should become part of the repository:

1. Open the collection **Tools**, then use **Save YAML file** and select `data/monsters/custom.yaml`. Supported browsers write the selected file directly; other browsers download it instead. The first save opens a file picker. A later save in the same page session writes that selected file again.
2. Alternatively, **Export custom.yaml** downloads the same document. Place it at `data/monsters/custom.yaml`.
3. Run `Open-Vara-DnD.cmd` or `python build.py`, then refresh the page.
4. Commit the edited YAML and any intended source changes to share them through Git.

`custom.yaml` contains new entries and targeted overrides for edited imported creatures. It does not require replacing the original collections. Overrides identify the original source, collection and name; renames preserve summon references. Previously compiled custom entries remain included when exporting from a fresh browser, so resaving the file does not erase them.

**Import monster YAML** merges an editor-exported custom file into browser edits after validation. Invalid imports leave the existing edits intact. The parser accepts the editor's safe YAML format and JSON, plus supported ordinary mappings and block strings; YAML tags, anchors and unsupported syntax are rejected explicitly. This is not an arbitrary YAML document editor.

`scripts/import_chronica_monsters.py` rebuilds the Chronica collection from its sanitized export and reviewed replacement manifests. Put later hand edits in `custom.yaml` so rerunning the import preserves them.

## Attribution

Existing alternatives identify their official rule or current repository source in the relevant entry. SRD 5.1 material is used under the Creative Commons Attribution 4.0 International license: this work includes material taken from the System Reference Document 5.1 (SRD 5.1) by Wizards of the Coast LLC and available at <https://dnd.wizards.com/resources/systems-reference-document>. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at <https://creativecommons.org/licenses/by/4.0/legalcode>.

For the Chronica source inventory and replacement details, see `docs/chronica-monsters.md` and the per-entry source panels. Public references do not imply that the campaign's original creatures are official D&D content.

## Tarta wiki scrape (24 November 2026)

Source: <https://tarta.fandom.com/wiki/Tarta_Wiki> and its [Stats category](https://tarta.fandom.com/wiki/Category:Stats).
The rendered AllPages index contained 69 links (the wiki header reports 68 pages); every linked article was checked for numerical statblocks. Thirteen pages contain numerical dragon blocks: twelve adult Mythos dragon species plus Aurumathar. The size/CR tables for other ages are summaries, not complete monsters, and do not create invented age variants.

The original numerical fields, combat abilities and source URLs are preserved in `data/monsters/source/tarta-wiki.json`. Rebuild with `python scripts/import_tarta_monsters.py`; use `--check` to detect drift. This importer uses the checked-in snapshot and does not depend on Fandom access during CI.

The 13 dragon profiles now include complete documented homebrew attack routines, breath recharge, legendary-action budgets and material-themed special abilities. Printed core stats remain fixed; original dice and omitted rules stay traceable in the source snapshot. Added rules are explicitly conversions, not claims about unrecorded source text. Aurumathar's teleport has an action cost and range; Neodrakite's breath has distance and successful-save outcomes; Ytriun's molten area has a duration. Rebuild the collection with `python scripts/import_tarta_monsters.py`; `--check` detects drift.

Yudith Zephia's uncategorized wiki article contains only partial NPC statistics and prose about Loki, Willow and Hands; it does not provide complete companion statblocks. The later chat recovery supplies additional companion statistics, completed in the separate recovered collections as Tentacle Clockwork Panther, Spellguard Clockwork Panther and Six-Handed Surgical Automaton. These completions do not claim that the wiki had full blocks. Aramil, the other deity/avatar wiki pages, places and lore-only wiki pages do not create entries in the wiki import.

Tarta wiki material is attributed to its contributors and its source URLs. The source pages state CC-BY-SA unless otherwise noted; adaptations retain that attribution and license notice in their conversion notes. Images were not copied.

## Tarta Homebrewery conversion add-on

All 32 printed source statblocks are converted, along with three completed partial summon templates: **Thorn Spitter**, **Rockplica duplicate**, and **Stone illusion duplicate**. The two duplicates take their profiles from a selected model creature, including an NPC, and have CR **Varies**, not invented fixed ability scores or XP. Using a model's statistics does not itself grant control. The detailed source inventory is in `docs/tarta-homebrewery-summon-audit.md`; reviewed conversion choices are in `docs/tarta-conversion-decisions.md`.

These additions are standalone monster options. **Tarta creature options**, in `data/draft-reference/tarta-creature-options.yaml`, groups the 35 Homebrewery creatures and templates for browsing and comparison. They also remain searchable and editable in the Monster manual. The separate **Geomancy spell review** section contains the PDF's complete original Geomorphy spell inventory for V. to evaluate, with source levels 0-11 preserved and no automatic conversion. Its 156 review entries are separate from the 439 current spells and character-builder choices. See [Geomancy spell review](geomancy-spell-review.md) for source coverage and gaps. Source class features remain provenance rather than new character grants.

The Geochemical Golem has twelve optional material configurations, with accessible checkboxes, a four-material limit, material-cost preview and active-effect summary. The base profile remains visible; only selected materials contribute to the preview. Material names link to full rules. Per-material golem, weapon and Bastion effects remain separate contexts in `data/draft-reference/tarta-materials.yaml`, alongside the configuration rule and Moissanite. Configuring a preview does not rewrite the source creature or silently alter a saved character. Normal monster editing and YAML export remain available for permanent variants.

All source and completion notes are collapsed outside the combat text. Choosing a creature option does not create or summon it automatically. Standalone NPCs use normal turns; companion control applies only when the GM or an existing effect makes the creature a controlled companion. Magnetite Guardian, Resilient Plant and the utility Stone Servant retain their noncombat roles. Saving-throw-only effects and automatic damage cannot be Blocked; attacks use the printed attack bonus and ordinary Block DC of bonus plus 8 unless a specific rule says otherwise.
