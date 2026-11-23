# Monsters and the statblock editor

The monster manual includes all 92 creatures, NPCs and encounter objects from the four campaign sources, alongside the 20 existing workbook references. Template examples are included: Adult Red Dragon is a playable entry, and the two differently described Ravager blocks remain separate creatures.

| Campaign source | Entries | Editable collection |
| --- | ---: | --- |
| Creature style template | 12 | `data/monsters/template.yaml` |
| Steel Dragons | 4 age variants | `data/monsters/steel-dragons.yaml` |
| Chronica campaign export | 66 | `data/monsters/chronica.yaml` |
| Smash and grab | 10, including Infernal Portal | `data/monsters/smash-and-grab.yaml` |

## Conversion conventions

Printed creature AC, HP, speed, attacks and six abilities remain fixed monster statistics. Block follows the current combat rules; natural armor alone does not grant armor training or additional Block. Ordinary proficient attacks show Block DC equal to their attack bonus plus 8, subject to explicit weapon or feature exceptions. Damage and attached on-strike effects require an unblocked strike; effects resolved solely by saving throws cannot be Blocked.

The current compendium's conditions, class features and spells take priority over incompatible 5e wording. Existing fitting abilities and statblocks supply missing mechanics. Each substituted rule is identified in the entry's conversion notes and replacement sources. Daily uses stay daily; short and long rests follow the current one-day and one-week defaults. Printed recharge dice retain their own timing.

Chronica records ability modifiers rather than exact scores. These entries display, for example, `+2 modifier (score not recorded)` instead of claiming a score the source never supplied. Nine otherwise blank NPC records use documented existing NPC baselines. Source challenge values are encounter estimates rather than a balance certification; Jobafo is unrated because its source challenge value is a joke and the completed mixed profile has no published rating.

Original text, source locations, repairs and donor references remain available in collapsed source panels. The extracted documents and sanitized monster-only Chronica export are tracked under `data/monsters/source/`. Original unrelated campaign secrets are excluded.

## Add and edit on the webpage

Open **Monster manual**, then **Add your monster statblock**. Enter identity, defenses and abilities, and add named traits, actions, reactions or legendary/lair effects. The adjacent preview updates while you type. **Save monster** adds it to browsing and search. Open any existing creature and choose **Edit statblock** or **Duplicate monster**. Cancel closes the draft without changing the saved creature.

Edits save in the current browser and at the current page location. They do not automatically sync to another browser, device or hosted page. Export a backup before clearing browser data. If browser storage fails, the current in-memory edits remain exportable and the page reports the problem.

For changes that should become part of the repository:

1. Use **Save YAML file** and select `data/monsters/custom.yaml`. Supported browsers write the selected file directly; other browsers download it instead. The first save opens a file picker. A later save in the same page session writes that selected file again.
2. Alternatively, **Export custom.yaml** downloads the same document. Place it at `data/monsters/custom.yaml`.
3. Run `Open-Vara-DnD.cmd` or `python build.py`, then refresh the page.
4. Commit the edited YAML and any intended source changes to share them through Git.

`custom.yaml` contains new entries and targeted overrides for edited imported creatures. It does not require replacing the original collections. Overrides identify the original source, collection and name; renames preserve summon references. Previously compiled custom entries remain included when exporting from a fresh browser, so resaving the file does not erase them.

**Import monster YAML** merges an editor-exported custom file into browser edits after validation. Invalid imports leave the existing edits intact. The parser accepts the editor's safe YAML format and JSON, plus supported ordinary mappings and block strings; YAML tags, anchors and unsupported syntax are rejected explicitly. This is not an arbitrary YAML document editor.

`scripts/import_chronica_monsters.py` rebuilds the Chronica collection from its sanitized export and reviewed replacement manifests. Put later hand edits in `custom.yaml` so rerunning the import preserves them.

## Attribution

Existing alternatives identify their official rule or current repository source in the relevant entry. SRD 5.1 material is used under the Creative Commons Attribution 4.0 International license: this work includes material taken from the System Reference Document 5.1 (SRD 5.1) by Wizards of the Coast LLC and available at <https://dnd.wizards.com/resources/systems-reference-document>. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at <https://creativecommons.org/licenses/by/4.0/legalcode>.

For the Chronica source inventory and replacement details, see `docs/chronica-monsters.md` and the per-entry source panels. Public references do not imply that the campaign's original creatures are official D&D content.
