# Vara DnD compendium and character sheet

An offline rules reference and editable character sheet for the Vara DnD table. The Python build compiles the YAML rules and the web sources into `site/index.html` (compendium) and `site/character.html` (character sheet). Each page includes its rules, styles and scripts, so it can run directly from disk without a server.

## Open locally on Windows

Double-click **Open-Vara-DnD.cmd** in the repository folder. It builds both pages and opens the character sheet in your default browser. Use **Rules compendium** in the sheet to read the rules, or open `site/index.html` directly. Run the launcher again after editing source files, then refresh any other open tabs.

The launcher reuses the repository's `.venv` when available. On the first run it creates that environment with Python 3.12 or newer and installs the pinned dependencies in `requirements.txt`; dependency installation needs internet access. It tries the Python launcher (`py -3.12`, then `py -3` for a newer version), then Python on PATH, then the Codex bundled Python runtime under your user profile. Microsoft Store `WindowsApps` aliases are skipped. If Python is missing, install it from [python.org](https://www.python.org/downloads/windows/) with the Python launcher or PATH option enabled, then retry. An error leaves the launcher window open with the reason.

To validate a build without opening a browser, run from PowerShell:

```powershell
.\scripts\open-local.ps1 -NoBrowser
```

## One working copy

On this machine, **Documents\Vara-DnD** is the canonical Git repository. The Codex app folder **Documents\ChatGPT\Vara DnD** is a Windows directory junction pointing to that same repository. Editing either path edits the same files. The junction is a machine-local arrangement; Git does not store it, and another computer only needs an ordinary clone.

The tracked sources are `data/` for the rules, `web/` for the interface, and `build.py` / `compiler.py` / `character_rules.py` for the build and character metadata. Generated `site/`, local `.venv/`, and Python caches are ignored by Git. Edit the sources rather than `site/`, because rebuilding replaces the generated pages. Character saves live in the browser, outside this repository.

## Use and back up characters

Use **New character** to open the six-step builder:

1. **Ancestry:** enter the character's details and level, then choose a race.
2. **Class:** choose a class and the archetypes available at that level.
3. **Abilities:** enter base ability scores and allocate the race's ability bonuses.
4. **Features:** read trait and feature rules, choose available options, and select skills.
5. **Equipment:** add items and equip armor, a shield and weapons for the preview.
6. **Review:** check the resulting sheet, choose an HP method, review incomplete selections, and use **Save character**.

The builder works on a separate draft. **Cancel** discards its changes; nothing is applied to the saved character before **Save character**. Reopen **Build character** to change choices or raise the level and select newly available features. Existing manual characters remain manual until you open the builder and save its changes.

Use the character picker to keep multiple characters. Saved-sheet edits autosave in the current browser on the current device. Local files, the published website, different browser profiles and other devices can have separate save storage; there is no account or automatic cross-device sync. Clearing browser data can remove saves.

Use **Save backup** to download the selected character as JSON, and keep backups outside the repository. Use **Load backup** to bring a character into another browser or device. Backups include a format version and rules fingerprint. Invalid or unsupported backups leave the current character intact; a different rules fingerprint prompts a rules review. If the browser cannot save, keep the page open and use **Save backup** to preserve your work.

Builder-enabled characters automatically apply supported fixed passive modifiers from their race, class and selected features. Equipped armor and shields calculate AC, movement and Block values; equipped weapons supply attacks from the character's abilities, training and Vara weapon properties. Base scores and manual extra bonuses remain editable, and manual attacks can accompany generated attacks. Conditional abilities, active powers, spell costs, unresolved rules and nested upgrades with unimplemented prerequisites remain readable rules to apply manually.

Automatic HP starts with the maximum class hit die plus the Constitution modifier and other applicable modifiers at level 1. Later levels add a recorded hit-die roll or the fixed average, plus the Constitution modifier and applicable modifiers. Missing recorded rolls use the average with a warning. **Manual HP** remains available. Changes to maximum health preserve existing wounds rather than healing the character.

Automatic damage passes through **Arcane Health → Temp HP → HP**; manual pool targeting is also available. Healing uses the selected pool and applies the Diseased healing reduction. Spending Block uses Temp Block first. Combat start raises remaining Block to the armor, shield and supported feature floor; rest restores Block and applies the established Fatigue recovery. Unspecified HP recovery during rest, generic rest-dice recovery, ability costs and expiring effects still need the player to apply the relevant rule.

## Use the compendium

The compendium index groups sections by use. Choose a section to browse its entries or use **Search all rules** to find a name or phrase across the book. Spell filters include tradition/group and level. Open a result to read its stats and expand the features you need. The address of an entry can be bookmarked.

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

The Windows launcher handles rebuilding. For a manual build with Python 3.12 or newer, run from the repository root:

```sh
python -m pip install -r requirements.txt
python build.py
```

Refresh the open pages after rebuilding. To add an entry collection, put a `.yaml` or `.yml` file anywhere under `data/`. Give it a `section` key and an `entries` list. Each entry needs a `name` and can have a `group`, stats, and rule text. Use `sections` with `heading` and `body` for long entries. A table uses `columns` and `rows`. The valid section keys are listed in `compiler.py`. Duplicate YAML keys or duplicate entries within the same section and group fail the build.

## Update and contribute with Git

Open PowerShell in the canonical folder:

```powershell
Set-Location "$env:USERPROFILE\Documents\Vara-DnD"
git status
git branch --show-current
git pull --ff-only
```

Commit or stash unfinished work before pulling or changing branches. `git pull --ff-only` updates the current branch; it does not switch branches. The original character sheet integration was merged in PR #2 at `d7090bc`. Character automation work is on `codex/character-automation` and has not yet been opened as a pull request.

For a new source change, create a branch from the version you want to change, edit the relevant `data/` or `web/` files, run the launcher and inspect the result:

```powershell
git switch -c my-rule-change
.\scripts\open-local.ps1 -NoBrowser
.\.venv\Scripts\python.exe -m unittest discover -s tests
node --test tests/*.test.cjs
git diff --check
git diff
```

The JavaScript checks use Node 24 and read the built catalog, so build before running them. Add the specific source files you changed with `git add`, commit them with `git commit -m "Describe the change"`, and publish your branch with `git push -u origin HEAD`. Open a pull request for review. Generated `site/` and character backups do not belong in commits.

## GitHub Pages

The phone addresses are [the character sheet on GitHub Pages](https://papuciitis.github.io/Varis-DND-thing/character.html) and the [compendium alongside it](https://papuciitis.github.io/Varis-DND-thing/). Pages updates after changes reach `main` and its deployment succeeds. The new builder described above is feature-branch work; creating or updating that branch does not publish it to those addresses.

Select **GitHub Actions** under the repository's Pages settings. The workflow installs Python 3.12 and Node 24, runs the Python checks, builds the site, and runs the JavaScript character checks against that build. Every successful run includes a downloadable **vara-dnd-site** artifact: unzip it and open `character.html` or `index.html`. Pages deployment is limited to `main`; pull requests are validated without deployment. The same pages work from disk and from a repository-scoped Pages address.
