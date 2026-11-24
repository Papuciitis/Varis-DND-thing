# Monsters and the statblock editor

The monster manual includes all 92 creatures, NPCs and encounter objects from the four campaign sources, alongside the 20 existing workbook references 13 completed Tarta wiki dragon statblocks, and 35 Homebrewery additions (160 entries total). Template examples are included: Adult Red Dragon is a playable entry, and the two differently described Ravager blocks remain separate creatures.

| Campaign source | Entries | Editable collection |
| --- | ---: | --- |
| Creature style template | 12 | `data/monsters/template.yaml` |
| Steel Dragons | 4 age variants | `data/monsters/steel-dragons.yaml` |
| Chronica campaign export | 66 | `data/monsters/chronica.yaml` |
| Smash and grab | 10, including Infernal Portal | `data/monsters/smash-and-grab.yaml` |
| Tarta wiki dragons | 13 completed homebrew profiles | `data/monsters/tarta-wiki.yaml` |
| Tarta Homebrewery elementals | 26 creatures | `data/monsters/tarta-elementals-low.yaml`, `data/monsters/tarta-elementals-high.yaml` |
| Tarta Homebrewery summons | 6 full source blocks plus 3 completed templates | `data/monsters/tarta-summons.yaml` |

## Conversion conventions

Printed creature AC, HP, speed, attacks and six abilities remain fixed monster statistics. Block follows the current combat rules; natural armor alone does not grant armor training or additional Block. Ordinary proficient attacks show Block DC equal to their attack bonus plus 8, subject to explicit weapon or feature exceptions. Damage and attached on-strike effects require an unblocked strike; effects resolved solely by saving throws cannot be Blocked.

The current compendium's conditions, class features and spells take priority over incompatible 5e wording. Existing fitting abilities and statblocks supply missing mechanics. Each substituted rule is identified in the entry's conversion notes and replacement sources. Daily uses stay daily; short and long rests follow the current one-day and one-week defaults. Printed recharge dice retain their own timing.

Chronica records ability modifiers rather than exact scores. The playable blocks use published scores where a matching profile is available, compatible existing donor scores where identified, and reconstructed scores for the remaining campaign profiles. Reconstruction chooses a score that preserves the recorded modifier and is marked **Reconstructed scores**. Source panels retain the original modifiers and explain the method; a reconstructed score is not claimed as an original source value. Nine otherwise blank NPC records use documented existing NPC baselines. Source challenge values are encounter estimates rather than a balance certification; missing campaign CRs, including Jobafo, have explicit provisional Vara estimates documented in conversion notes.

Original text, source locations, repairs and donor references remain available in collapsed source panels. The extracted documents and sanitized monster-only Chronica export are tracked under `data/monsters/source/`. Original unrelated campaign secrets are excluded.

## Add and edit on the webpage

The manual starts as an expandable list. Each creature row shows its name, challenge and creature type; open several rows to compare their compact parchment statblocks. Bodies load when first expanded. Search and **Challenge rating** lead the filters; open **Creature type** for type chips and **More filters** for source group, display and sort. Applied filters can be removed individually. Challenge choices include fractions, exact ratings, ranges and **Unrated / unknown**. Unknown challenge is separate from CR 0. **Display** offers a linked Pages view. Monster pages, expanded rows and the live editor preview share the same statblock presentation.

Open **Monster manual**, then **Create monster**. Enter identity, defenses and abilities, and add named traits, actions, reactions or legendary/lair effects. The adjacent preview updates while you type; phones offer **Edit** and **Preview** views. **Save monster** adds it to browsing and search. Open an existing creature and expand **Monster tools** to edit or duplicate it. Cancel closes the draft without changing the saved creature.

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

Yudith Zephia's uncategorized article contains only partial NPC statistics and prose about Loki, Willow and Hands; it does not provide complete companion statblocks. These are recorded as a coverage gap, not fabricated creatures. Aramil, the other deity/avatar pages, places and lore-only pages likewise do not create combat entries.

Tarta wiki material is attributed to its contributors and its source URLs. The source pages state CC-BY-SA unless otherwise noted; adaptations retain that attribution and license notice in their conversion notes. Images were not copied.

## Tarta Homebrewery conversion add-on

All 32 printed source statblocks are converted, along with three completed partial summon templates: **Thorn Spitter**, **Rockplica duplicate**, and **Stone illusion duplicate**. The two duplicates have caster-dependent profiles and CR **Varies**, not invented fixed ability scores or XP. The detailed source inventory is in `docs/tarta-homebrewery-summon-audit.md`; reviewed conversion choices are in `docs/tarta-conversion-decisions.md`.

Ten optional spells in `data/draft-spells/tarta-homebrewery-summons.yaml` link to their creatures. Five rule modules in `data/draft-reference/tarta-summoning-features.yaml` document control, Master of the Land, Primordial Geomancy, Stone's Illusion and Geomorphic Form. These modules are not silently granted to existing character classes. Current spells remain authoritative and are not overwritten. Source spells above sixth level are explicitly adapted to current tier 6.

The Geochemical Golem has twelve optional material configurations, with accessible checkboxes, a four-material limit, component-cost preview and active-effect summary. The base profile remains visible; only selected materials contribute to the preview. Material names link to full rules. Per-material golem, weapon and Bastion effects remain separate contexts in `data/draft-reference/tarta-materials.yaml`, alongside the configuration rule and Moissanite. Configuring a preview does not rewrite the source creature or silently alter a saved character. Normal monster editing and YAML export remain available for permanent variants.

All source and completion notes are collapsed outside the combat text. Creation/control links run both ways. Defensive-only Magnetite Guardian, Resilient Plant and the summoned Stone Servant retain their noncombat roles. Saving-throw-only effects and automatic damage cannot be Blocked; attacks use the printed attack bonus and ordinary Block DC of bonus plus 8 unless a specific rule says otherwise.
