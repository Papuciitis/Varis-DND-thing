# Guided character builder verification

Base: `d7090bc` (`main`, previous character-sheet integration merged). Work: `codex/character-automation`.

## Delivered behavior

New character opens six steps: ancestry, class/archetypes, base abilities and ancestry bonuses, features/skills, equipment, and review. Drafts are isolated until Save; Cancel preserves the saved character. Reopen Build character for changes and level progression. Existing manual sheets retain their behavior until explicitly converted.

The catalog supplies 14 races, 12 classes and 77 archetypes. Source text accompanies choices. A separate passive-effects registry and pure calculation layer derive scores, training, fixed bonuses, feature lists, equipped attacks, armor/shield AC, speed, Block and HP. Changing selections does not permanently stack their bonuses or duplicate generated attacks. Conditional effects, active powers, prerequisites and unresolved source rules remain visible/manual.

The user supplied the health baseline: maximum class die plus CON and modifiers at level 1; later die rolls or fixed average plus CON and modifiers; damage flows through Arcane Health, then Temp HP, then HP. The builder supports recorded rolls, average and manual HP, preserves existing wounds when maxima change, and warns about missing rolls. Generic rest-dice and HP rest recovery remain manual because those rules were not supplied.

## Evidence

- Python: 20/20 tests passed, including metadata from the real sources and standalone build checks.
- Node: 100/100 tests passed, including builder draft/cancel/navigation, choices, backup validation, source effects, equipment, health, save conflicts and existing interactions.
- Windows launcher rebuilt both portable pages successfully.
- Actual Chrome: created a Dwarf Fighter through all six steps, allocated the +2 Strength bonus, selected Dwarven Fortitude, added/equipped a Dagger, reviewed 12 maximum HP and melee/thrown attacks, saved, and reloaded successfully. The saved sheet retained Fighter/Dwarf identity, 12 HP and generated attacks.
- Chrome responsive mode at 390 pixels: checked sheet layout, reopened builder, verified readable controls and reachable sticky navigation, cancelled, and confirmed the saved character remained intact. No physical-phone test was performed.
- Independent review identified omitted racial equipment training, ancestry expertise/named skill lists, and Occultist's missing level-1 Cantrips grant. Each was reproduced and corrected with regressions. Additional checks fixed repeated combat-end Block removal and explicit class weapon-family training.
- `git diff --check` passed. Rule source files under `data/` were preserved.

The GitHub pull request provides the fresh checkout build and CI result. Publishing the branch does not update Pages until it is merged into main.
