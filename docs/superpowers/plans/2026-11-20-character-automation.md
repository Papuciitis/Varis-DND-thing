# Character Automation Implementation Plan

> Use the executing-plans workflow with bounded independent agents for metadata/effects and review.

**Goal:** Turn the manual sheet into a source-backed builder and equipment-aware character sheet.
**Architecture:** Python compiles builder metadata; pure JS derives values without stacking permanent edits; the current UI edits selections and manual adjustments.
**Tech stack:** Existing Python/PyYAML, vanilla JS, Node tests, GitHub Pages.
**Spec:** `docs/superpowers/specs/2026-11-20-character-automation-design.md`.

## Constraints and review focus

Preserve format-1 backups and existing manual characters. Never duplicate derived bonuses/features or heal on render. Ignore invalid/ineligible selections. Keep relative navigation and standalone builds. Missing health rules require user input or explicit manual settings. Review choice removal, multiple equipment, level reduction, malformed backups, source gaps and narrow-phone controls.

## Work

- [x] Compile ancestry/class/archetype/feature-choice metadata in `character_rules.py`, tested against real sources.
- [x] Add a source-grounded passive effects registry in `web/character-effects.js` with tests.
- [x] Implement `web/character-rules.js` pure derive/reconcile/equipment/damage/rest interfaces; test before implementation.
- [x] Validate build extensions in `web/character-state.js` and embed metadata/scripts through `build.py`.
- [x] Add a six-step draft wizard, automatic values and feature/gear/health controls with responsive styles.
- [x] Apply the user's confirmed HP calculation and Arcane Health → Temp HP → HP damage priority.
- [x] Run all tests, browser QA and independent review; document results and prepare the branch for a fresh Git build and PR checks.
