# Open D&D Compendium

A browsable collection of Open D&D rules. Edit the YAML under `data/` and build the reference. The resulting `site/index.html` contains the entire catalog, stylesheet, and reader. It works directly from disk and under a GitHub Pages repository URL.

## Read it locally

The release ZIP includes a built copy. Extract the folder and open `site/index.html`. The standalone HTML download is the same page and opens on its own.

## Edit and rebuild

From the repository root, with Python 3.12 installed, run:

```sh
python -m pip install -r requirements.txt
python build.py
```

Open or refresh `site/index.html`. The section bar switches collections. Within a section, search by name or rules text, filter by group, or select an entry to copy its direct link. Class and archetype entries also have a level selector.

| Content to edit | YAML source |
| --- | --- |
| Occultist class | `data/class_occultist.yaml` |
| Spellblade archetype | `data/arch_spellblade.yaml` |
| Weapons, properties, and maneuver vocabulary | `data/weapons.yaml` |
| Feats and prerequisites | `data/feats.yaml` |
| Playable races and traits | `data/races.yml` |
| Arcane cantrips | `data/spells/arcane_cantrips.yaml` |
| Conditions | `data/conditions.yaml` |
| Prototype maneuver notes | `data/maneuver-notes.yaml` |

You can add a new `.yaml` or `.yml` anywhere under `data/`. Use `section` and an `entries` list. For example, the first background file could start as:

```yaml
section: backgrounds
entries:
  - name: "<Background name>"
    proficiencies:
      - "<Proficiency>"
    description: |-
      Replace this text with the background's rules.
```

Supported section keys are `classes`, `items`, `weapon-rules`, `feats`, `races`, `spells`, `conditions`, `backgrounds`, and `design-notes`. Each entry requires a name. An optional `group` supplies a filter, such as a weapon family. Other fields become readable sections, lists, or stats. Duplicate keys and duplicate entry names within the same section and group fail the build with the source filename.

## Deploy to GitHub Pages

1. Push this repository to a GitHub repository on branch `main`.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
3. Open **Actions → Build and deploy rules → Run workflow** and select `main`, or push a change to `main`.

The workflow installs the pinned YAML parser, builds the static page, and deploys the output to Pages. Pull requests run the build for review. The deploy job reports the published URL.

## Source and coverage

The initial rules come from [varisvconsulting/open-dnd at 6a4053a](https://github.com/varisvconsulting/open-dnd/tree/6a4053a7c6bbff82cce60334cab715f8b092682f/data). The seven upstream YAML files take precedence. In `arch_spellblade.yaml`, one closing quote was added to the Impact catalyst entry so the file parses. The rules wording is preserved.

The Git-tracked `data/verbs_concept` was converted into ten labeled sections in `maneuver-notes.yaml`. It is displayed as **Design notes**. Use the definitions in **Weapon rules** for current maneuvers. The original frontend points to external spreadsheet tables for several sections. Backgrounds, separate armor and shield records, and a creature catalog have no committed entries at this revision. Backgrounds is ready for its first YAML file.
