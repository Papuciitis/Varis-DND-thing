# Open D&D Compendium

An offline reference for the Vara DnD table. The character, magic, equipment, and combat rules are editable YAML. The build compiles them into a single HTML file with the reader and its stylesheet included.

## Use the reader

Open `site/index.html` in a browser. The compendium index groups the sections by use. Choose a section to browse its entries or use **Search all rules** to find a name or phrase across the book. Spell filters include tradition/group and level. Open a result to read its stats and expand the features you need. The address of an entry can be bookmarked.

## Rules sources

The original Git rules take precedence wherever they define the same item, spell, class feature, or condition as the Google Sites draft. A distinct feature can modify a general rule when its text specifies how. Imported references use the current names and mechanics. Entries identify unresolved source gaps where a cost, effect, or other ruling still needs an author decision.

See [the coverage comparison](COVERAGE.md) for the section counts, examples of reconciled rules, and remaining gaps. The original sources are [varisvconsulting/open-dnd at 6a4053a](https://github.com/varisvconsulting/open-dnd/tree/6a4053a7c6bbff82cce60334cab715f8b092682f/data) and the [D&D 5e+ draft](https://sites.google.com/view/dnd5plus/home).

## Edit and rebuild

| Content | Files under `data/` |
| --- | --- |
| Occultist and Spellblade | `class_occultist.yaml`, `arch_spellblade.yaml` |
| Other classes, archetypes, and additional class features | `draft-classes/` |
| Spells and hexes | `spells/arcane_cantrips.yaml`, `draft-spells/` |
| Weapons, properties, and maneuver notation | `weapons.yaml` |
| Races, feats, and conditions | `races.yml`, `feats.yaml`, `conditions.yaml` |
| Backgrounds, equipment, additional feats and conditions, core rules | `draft-reference/` |
| Prototype maneuver design | `maneuver-notes.yaml` |

The `draft-` directory names identify where material came from. Use the compiled entry to look up the current wording.

From the repository root, use Python 3.12 and run

```sh
python -m pip install -r requirements.txt
python build.py
```

Refresh `site/index.html` after rebuilding. To add an entry collection, put a `.yaml` or `.yml` file anywhere under `data/`. Give it a `section` key and an `entries` list. Each entry needs a `name` and can have a `group`, stats, and rule text. Use `sections` with `heading` and `body` for long entries. A table uses `columns` and `rows`. The valid section keys are listed in `compiler.py`. Duplicate YAML keys or duplicate entries within the same section and group fail the build.

## GitHub Pages

Select **GitHub Actions** under the repository's Pages settings. The existing workflow builds pull requests for review and publishes builds from `main`. The same HTML runs from the published URL or directly from disk.
