23:11:2026 retained fixes from the preceding recovery task

- web/character-equipment.js - Renamed magic weapons retain proficiency in their mundane base weapon; active custom weapon training overrides remain explicit.
- web/character-builder.js - Weapon proficiency choices use actual weapon families rather than magic-item rarities, including when the catalog loads later.
- tests/character-builder.test.cjs and tests/magic-equipment-profiles.test.cjs - Regression coverage for those two fixes was already present when implementation of notes.txt began.

These fixes were retained from the earlier recovery task. No additional unrelated feature changes were introduced while implementing notes.txt.

27:11:2026 character creation and spell actions

- Completed the interrupted character choice work and added the requested class spell selection, quick spell actions, upcasting and casting-resource spending.
- Created PATCH_NOTES.md and a generated patch-notes.html page, linked from the compendium and sheet. Notes are generated from the Markdown file so the published page and source history stay in sync.
- Added regression checks for class eligibility, spell costs and upcasting, UI casting controls, recurring and alternative class grants, optional mark/reward pairs, backups and build outputs.
- Appended unresolved source rules to ai_data_design_points_of_interest.md. No source game rules in data/ were changed.

27:11:2026 focused character creator and resource controls

- Replaced the growing feature wall with focused choice navigation and one rules preview; separated spell and feat selection into relevant stages.
- Added literal feat-prerequisite checks, real racial bonus-feat pickers, own-node skill descriptions, rest-dice calculations and clickable death-save dots.
- Added the requested patch-notes entry and appended the source/reference conflicts to points of interest. The only data change is the author-confirmed base rest-dice formula.
