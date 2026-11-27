# Varis DnD compendium and character sheet

A rules reference and editable character sheet for the Varis DnD table. One YAML catalog builds both a hosted website that loads rules by section and portable pages that work directly from disk.

## Open locally on Windows

Double-click **Open-Vara-DnD.cmd** in the repository folder. It builds the site and opens `site/character.html` in your default browser, preserving the existing local page location and its saves. Use **Rules compendium** in the sheet to read the rules, or open `site/index.html` directly. Keep the generated folders together. Run the launcher again after editing source files, then refresh any other open tabs.

The root pages work both on a website and directly from disk. Over HTTP they request external assets and JSON data by section. On a local file URL, the loader includes `site/data/portable-catalog.js` instead, without fetching JSON or moving the page. Optional standalone copies at `site/offline/index.html` and `site/offline/character.html` embed their rules and assets; keep those two pages together when sharing them separately.

The launcher reuses the repository's `.venv` when available. On the first run it creates that environment with Python 3.12 or newer and installs the pinned dependencies in `requirements.txt`; dependency installation needs internet access. It tries the Python launcher (`py -3.12`, then `py -3` for a newer version), then Python on PATH, then the Codex bundled Python runtime under your user profile. Microsoft Store `WindowsApps` aliases are skipped. If Python is missing, install it from [python.org](https://www.python.org/downloads/windows/) with the Python launcher or PATH option enabled, then retry. An error leaves the launcher window open with the reason.

To validate a build without opening a browser, run from PowerShell:

```powershell
.\scripts\open-local.ps1 -NoBrowser
```

## One working copy

On this machine, **Documents\Vara-DnD** is the canonical Git repository. The Codex app folder **Documents\ChatGPT\Vara DnD** is a Windows directory junction pointing to that same repository. Editing either path edits the same files. The junction is a machine-local arrangement; Git does not store it, and another computer only needs an ordinary clone.

The tracked sources are `data/` for the rules, `web/` for the interface, and `build.py` / `compiler.py` / `character_rules.py` for the build and character metadata. Generated `site/`, local `.venv/`, and Python caches are ignored by Git. Edit the sources rather than `site/`, because rebuilding replaces the generated pages and data. Character saves live in the browser, outside this repository.

## How rules reach the pages

1. **YAML:** `data/` holds the authoritative rule text, tables, creature references, and summon links.
2. **Compiler:** `compiler.py` validates and combines the collections. `character_rules.py` derives builder metadata from that same catalog; supported passive effects are maintained in `web/character-effects.js`.
3. **Build:** `build.py` writes `site/data/catalog-manifest.json`, a versioned JSON file for each section, and a separate builder metadata JSON file. Styles, scripts, and JSON payloads have content hashes in their filenames.
4. **Reader and builder:** the hosted reader requests a section when it is needed; **Search all rules** loads the full catalog. The character sheet loads its builder metadata separately. Direct disk use of the root pages loads the generated portable catalog script, which supplies the same catalog and metadata. The optional standalone pages embed the catalog, metadata, styles, and scripts.

Both outputs use the same rule definitions. The JSON and HTML are generated views of YAML.

## Use and back up characters

The main sheet groups health and Block separately, with prominent current/max HP and compact secondary pools. Desktop puts ability scores in a side column; phones place attacks after health and defence and keep bottom tabs in reach. Base scores, training, pool maximums and recovery controls expand when needed. Gear is grouped into compact equipment rows; search your pack and expand an item to adjust quantity, equipment or attunement.

Open **More**, then **New character**, to create a separate draft. The flow shows the stages relevant to that character:

1. **Ancestry:** identity, level, ancestry and background.
2. **Class:** class and available archetypes.
3. **Abilities:** base scores and ancestry allocations.
4. **Features:** a compact list of required choices, one selection panel and one rule preview. Passive rules are in a folded reference section.
5. **Spells:** eligible class spells and cantrips, searchable cards, level filters, a rules preview, selected-spell chips and preparation controls.
6. **Feats:** eligible feat and ability-improvement choices, including Human's level-one bonus feat. Full feat browsing remains in the compendium.
7. **Equipment:** find, preview and equip gear.
8. **Review:** check the resulting character and save. Spell and feat stages are omitted when there are no relevant grants.

Feats and some ancestry traits open **Finish this feat** / **Feature choices** after selection. Choose their actual targets, ability bonuses, training and spell grants. Unfinished follow-ups appear on Review. Extra feature picks return to the relevant feature list; extra spell-list upgrades appear under **Spells → Cantrip & hex upgrades**. Level grants and extra grants share the same upgrade pool and repeat limits. The sheet shows selected and automatic improvements beside the spell, and keeps named spell grants separate from the class learning allowance. See [the complete feat and progression audit](docs/character-feat-support.md) for supported effects and manual rule handling.

Occultist **Mark & Reward** is a paired choice. Select both, then complete the reward's resistance, damage-type, expertise or restricted-feat choices. A saved damage type is permanent. GM-dependent skill marks have explicit classification controls; the unresolved healing-mark wording remains a table rule.

The Equipment stage has **Catalog** and **Your equipment** views, each with a compact list and one detail pane. Search and category filters keep the catalog manageable. Select an owned row to change equipment, attunement, quantity, grip or training without expanding every item.

The builder works on a separate draft. **Cancel** discards its changes; nothing is applied to the saved character before **Save character**. Reopen **Edit build** to change choices or raise the level and select newly available features. Existing manual characters remain manual until you open **Build character** and save its changes. Fighter's fighting skills include two starting picks, one per later level and the class improvement bonuses. Tree upgrades unlock after their prerequisite is selected. Other recurring class choices and supported extra archetype grants expand the earlier picker. Existing choices retain their saved identities; lowering a level temporarily deactivates later selections, and restoring it makes them available again.

Use the character picker to keep multiple characters. Saved-sheet edits autosave in the current browser on the current device. Storage depends on the page location and browser profile: a hosted page, a local file, a moved file, or another device may have separate saves. There is no account or automatic cross-device sync. Clearing browser data can remove saves.

Open **More** for **Save backup** and **Load backup**. Save backup downloads the selected character as JSON; keep backups outside the repository. Load backup moves a character between page locations, browsers, or devices, including an optional move to a standalone copy. The launcher keeps the existing `site/character.html` location, so this update does not require moving local saves. Backups include a format version and rules fingerprint. Invalid or unsupported backups leave the current character intact; a different rules fingerprint prompts a rules review. If the browser cannot save, keep the page open and use Save backup to preserve your work.

Builder-enabled characters automatically apply supported fixed passive modifiers from their race, class and selected features. Equipped armor and shields calculate AC, movement and Block values; equipped weapons supply attacks from the character's abilities, training and Varis weapon properties. Base scores and manual extra bonuses remain editable, and manual attacks can accompany generated attacks. Conditional abilities, active powers, additional spell costs and effects, unresolved rules and nested upgrades with unimplemented prerequisites remain readable rules to apply manually.

The **Spells** tab initializes class casting resources from the Varis rules. Wizard, Sorcerer and Druid use their distinct printed slot tables; Occultist uses a shared pool whose slots have one casting level. Cleric tracks each full slot's remaining spell levels separately. Set **Maximum full-slot level** from your table's ruling before using Cleric slots: the imported source supplies slot counts but does not specify that maximum. Bard casting spends existing rest dice, and Sorcerer gains Metamagic points from level 4.

Class capacities update with level and supported feature choices while preserving spent uses. Reviewed fixed bonuses, including the Occultist slot reward, Court mage, Oathspeaker and Wildmage slot increases, apply automatically. Separate archetype casting systems, such as Graymage, Evoker and arcane focus pools, still need manual trackers. The builder limits base class spell selections to its list, learning level and allowance. Set Bard's learning-level limit from your table because its source omits rounding. Wizard's class-granted spellbook count is not a maximum on copied spells; use extra selections on the Spells page for copied or feature-granted spells. Wizard preparation is selectable, with its missing numeric preparation count left for an author ruling.

On the main sheet, **Spell actions** shows simple readied attack spells. **Quick action on main sheet** pins or hides other known spells. Choose **Casting level / resource**, then **Cast spell** to spend that resource. Standard slots spend one slot of the selected level; Occultist casts at its shared pool level; Cleric reduces the selected full slot by the chosen level; Bard spends that many rest dice. Cantrips use no slot. Simple spell attacks roll an attack check; resolve damage, saves, components, extra costs, cooldowns and scaling using the full spell rules. The Spells page provides the same casting controls for utility and complex spells. Manual slots and custom spells remain available.

See [Patch notes](PATCH_NOTES.md) for the change history. The build publishes the same notes at `patch-notes.html`, linked from both pages. Add new dated entries to the top of that file as changes are made, and append unresolved source-rule questions to `ai_data_design_points_of_interest.md`.

Existing characters with manual spell slots or custom resources keep those trackers until you choose **Use class slots**. Activation carries over spending from unambiguous matching slot rows and retains the manual trackers separately. Cleric's aggregate rows and unmatched custom resources require a manual review of spent uses. **Use manual trackers** switches automatic class tracking off without deleting its spending history.

Recovery follows each source. A long rest restores Occultist slots, Cleric full slots and Sorcerer Metamagic points. The imported Wizard, Sorcerer and Druid rules do not state a general long-rest slot reset, so their slot recovery remains manual. Use **Restore 1** only when the relevant recovery rule allows it; distributed Druid recovery, Wizard Arcane recovery and rolled Metamagic recovery still need the player to resolve the rule shown under **Spell recovery rules**.

Rest-dice maximum defaults to one die per character level plus active ancestry, background, class, feature and feat modifiers. The sheet shows each contribution. Changing a maximum keeps remaining dice; creating a new character fills its starting pool. Table adjustments and a manual base override are available under Rest dice. Source-defined sacrifice or benefit choices are recorded in the selected feat's details. Oaths of might checks the chosen oath and a Broken oath condition; temporary night-only dice remain separate from the permanent maximum.

Death saves use clickable success and failure dots. Clicking a dot sets that track to its count; clicking the highest filled dot again removes one mark. The number of dots follows active death-save-slot modifiers.

Automatic HP starts with the maximum class hit die plus the Constitution modifier and other applicable modifiers at level 1. Later levels add a recorded hit-die roll or the fixed average, plus the Constitution modifier and applicable modifiers. Missing recorded rolls use the average with a warning. **Manual HP** remains available. Changes to maximum health preserve existing wounds rather than healing the character.

Automatic damage passes through **Arcane Health → Temp HP → HP**; manual pool targeting is also available. Healing uses the selected pool and applies the Diseased healing reduction. Spending Block uses Temp Block first. Combat start raises remaining Block to the armor, shield and supported feature floor; rest restores Block and applies the established Fatigue recovery. Unspecified HP recovery during rest, generic rest-dice recovery, ability costs and expiring effects still need the player to apply the relevant rule.

## Use the compendium

The compendium index groups sections by use. Choose a section or use **Search all rules** to find a name or phrase. The class overview links each base class and expands its archetypes. Races start as an expandable list for comparison; races, feats and backgrounds can switch between **Pages** and **Expandable list**. Entry pages offer **Previous** and **Next** within their own group and item category.

Items are organized into Weapons, Armor & shields, Items, Consumables, Materials, and Special plants & fungi. The Weapons view can expand training type, melee/ranged use, and weapon family, or switch to ordinary pages. These are display categories; source groups and saved item references stay unchanged.

The reader's spell filter offers four classes of magic: Arcane, Oath, Occult and Mystic, each including spells and cantrips. Select level 0 for cantrips. Hexes and magic references remain accessible through separate links. Default reader order is class of magic, numeric level, then name; explicit level and alphabetical orders remain available. The sheet's spell picker and saved spell list retain numeric level order, and saved spells can be filtered by level. Archetypes and unlocked features use level order; monsters default to Challenge order. Search defaults to relevance. Display changes preserve preparations and rule links.

Open a result to read its stats and expand the features you need. The address of an entry can be bookmarked. The monster manual includes the converted campaign creatures and existing workbook references, with compact parchment statblocks and expandable creature rows. Combine creature type, exact or ranged CR, group and text filters; unknown CR stays separate from CR 0. Add, edit or duplicate statblocks directly in the reader, preview changes, and save a custom YAML collection for the shared catalog. Chronica uses numerical ability scores with sourced or clearly marked reconstructed provenance. Linked summons retain the current spell's rules and embedded statistics as the priority. See [monster conversion and editing](docs/monsters.md).

## Rules sources

The YAML is the sole rules source used by the site. The original Git rules take precedence wherever they define the same item, spell, class feature, or condition as the Google Sites draft. A distinct feature can modify a general rule when its text specifies how. Imported references use the current names and mechanics. Entries identify unresolved source gaps where a cost, effect, or other ruling still needs an author decision.

The workbook review adds 20 creature reference drafts and links 11 existing spells to them through 15 summon references. Workbook variants do not replace current spell mechanics or statistics. Existing backgrounds were reconciled without overwriting their YAML definitions. Cantrips remain unchanged.

See [the coverage comparison](COVERAGE.md) for counts and source reconciliation, [rules review decisions](docs/rules-review.md) for unresolved mechanics and balance topics, and [the workbook source review](docs/workbook-source-review.md) for import provenance and variant differences. The original sources are [varisvconsulting/open-dnd at 6a4053a](https://github.com/varisvconsulting/open-dnd/tree/6a4053a7c6bbff82cce60334cab715f8b092682f/data) and the [D&D 5e+ draft](https://sites.google.com/view/dnd5plus/home).

The separate **Geomancy spell review** includes all 156 original source entries, V.'s 140 comments, and 30 proposed Varis rewrites. Browse rewritten drafts first, or filter all entries by review status, proposed class of magic, source level and text. Each draft keeps its original spell, reviewer comments, balance notes and author questions available for comparison. These proposals await V.'s approval and remain outside the current spell lists and character sheet. See [Geomancy review and editing](docs/geomancy-spell-review.md).

## Edit and rebuild

| Content | Files under `data/` |
| --- | --- |
| Occultist and Spellblade | `class_occultist.yaml`, `arch_spellblade.yaml` |
| Other classes, archetypes, and additional class features | `draft-classes/` |
| Spells and hexes | `spells/arcane_cantrips.yaml`, `draft-spells/` |
| Weapons, properties, and maneuver notation | `weapons.yaml` |
| Races, feats, and conditions | `races.yml`, `feats.yaml`, `conditions.yaml` |
| Backgrounds, equipment, additional feats and conditions, core rules | `draft-reference/` |
| Workbook creature reference drafts and spell-to-creature links | `monsters.yaml`, `summon-links.yaml` |
| Converted campaign monsters, original snapshots and custom statblocks | `monsters/` |
| Prototype maneuver design | `maneuver-notes.yaml` |

The `draft-` directory names identify where material came from. Use the compiled entry to look up the current wording.

## Campaign magic items

**Magic items** is a separate collection of all 300 items from the campaign workbook, rewritten for the Varis system. Browse seven reviewed categories: weapons/ammunition, armor/shields, wearables/jewelry, staves/wands/rods, scrolls, potions/consumables, and miscellaneous. Combine category, rarity, item type, and text filters, including category-word searches. The character sheet's equipment picker offers the same magic categories. The displayed description contains the converted rules; original 5e text, source cells and conversion notes remain separate comparisons. Open an item and expand **Edit this item** to adjust its category or rules.

The six editable rarity files, original workbook, source snapshot, and shared conversion conventions are tracked under `data/magic-items/`. Page edits save in the current browser. Open **Item tools** for backup import/export. Within an item's editor, **Source tools** contains **Export source file** for replacing that item's complete source collection and committing the edited rules. Rebuild after changing a source file. See [magic item conversion and editing](docs/magic-items.md) for the workflow and automation limits.

The Windows launcher handles rebuilding. For a manual build with Python 3.12 or newer, run from the repository root:

```sh
python -m pip install -r requirements.txt
python build.py
```

Refresh the open pages after rebuilding. To add an entry collection, put a `.yaml` or `.yml` file anywhere under `data/`. Give it a `section` key and an `entries` list. Each entry needs a `name` and can have a `group`, stats, and rule text. Use `sections` with `heading` and `body` for long entries. A table uses `columns` and `rows`. The valid section keys are listed in `compiler.py`. Duplicate YAML keys or duplicate entries within the same section and group fail the build. `summon-links.yaml` is a separate validated link collection; follow its existing schema when adding a relation. Feature and option names also identify saved builder choices and passive effects, so review compatibility before renaming them.

## Update and contribute with Git

Open PowerShell in the canonical folder:

```powershell
Set-Location "$env:USERPROFILE\Documents\Vara-DnD"
git status
git branch --show-current
git pull --ff-only
```

Commit or stash unfinished work before pulling or changing branches. `git pull --ff-only` updates the current branch; it does not switch branches. The character sheet was merged in PR #2 at `d7090bc`, character automation in PR #3 at `f7869b2`, the compendium data and monster foundation in PR #4 at `419fc5b`, the character presentation update in PR #5 at `57f4d99`, and casting resources and ordering in PR #6 at `5002bf2`.

For a new source change, create a branch from the version you want to change, edit the relevant `data/` or `web/` files, run the launcher and inspect the result:

```powershell
git switch -c codex/my-rule-change
.\scripts\open-local.ps1 -NoBrowser
.\.venv\Scripts\python.exe -m unittest discover -s tests
node --test tests/*.test.cjs
git diff --check
git diff
```

The JavaScript checks use Node 24 and read the built catalog, so build before running them. Add the specific source files you changed with `git add`, commit them with `git commit -m "Describe the change"`, and publish your branch with `git push -u origin HEAD`. Open a pull request for review. Generated `site/` and character backups do not belong in commits.

## GitHub Pages

The phone addresses are [the character sheet on GitHub Pages](https://papuciitis.github.io/Varis-DND-thing/character.html) and the [compendium alongside it](https://papuciitis.github.io/Varis-DND-thing/). Pages updates after changes reach `main` and its deployment succeeds. Publishing a feature branch alone does not update the hosted page.

Select **GitHub Actions** under the repository's Pages settings. The workflow installs Python 3.12 and Node 24, runs the Python checks, builds the site, and runs the JavaScript checks against that build. A successful run uploads a downloadable **vara-dnd-site** artifact containing the root pages, generated data and assets, and optional standalone copies. Extract the whole artifact and open `character.html` or `index.html` for direct disk use. Alternatively, the two pages in `offline/` can be used on their own. Keep the root pages, `assets/`, and `data/` together for either direct disk use or HTTP hosting. Pages deployment is limited to `main`; pull requests are validated without deployment.
