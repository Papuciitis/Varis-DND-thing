# Character Sheet Implementation Plan

> **For agentic workers:** Use the executing-plans workflow for the integration and independent agents for bounded tests and review. Track steps below.

**Goal:** Restore one usable Git working copy and ship the existing phone-first sheet through the repository build.

**Architecture:** Python compiles the tracked rules and embeds them in two standalone HTML pages. Vanilla JavaScript owns browser-local character data and portable JSON backups.

**Tech Stack:** Python 3.12, PyYAML 6.0.3, vanilla browser JS/CSS, Node built-in tests, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-20-character-sheet-design.md`

## Global constraints

- Preserve current rules and compendium behavior; no data-tree copy.
- Keep source in Git and generated `site/` ignored.
- Preserve the existing backup format and storage key.
- Keep all page navigation relative and make each built page self-contained.
- Work on `codex/character-sheet` in the canonical Documents repository.

## Review focus

- Malformed or future-format imports preserve the existing character.
- Browser storage failures keep backup export usable.
- Two tabs editing the same character preserve both edits.
- A repository URL prefix does not break navigation or catalog references.
- Phone-width controls remain readable and do not overflow.

## Task 1: Integrate the portable build

Files: `build.py`, `web/character*.{html,css,js}`, `web/index.html`, `tests/test_build.py`.

- [ ] Add a build regression checking both pages, self-contained assets, shared rules version and relative navigation.
- [ ] Run `python -m unittest discover -s tests` and observe the missing character-page failure.
- [ ] Port the four audited character assets and the two-page build; add the compendium navigation link.
- [ ] Run the build regression and build the local `site/`.

## Task 2: Check character data and UI behavior

Files: `tests/character-state.test.cjs`, `tests/character-events.test.cjs`.
Interface: `globalThis.CharacterState` exposes create/normalize/import/export, ability/proficiency calculation and resourceDelta; `character.js` reads `DND_CATALOG` and `DND_RULES_VERSION`.

- [ ] Add portable tests for JSON round trips, malformed versions, resource bounds, temporary Block precedence and extension preservation.
- [ ] Adapt the existing event harness to repository-relative paths; run every optional regression unconditionally.
- [ ] Run `node --test tests/*.test.cjs`.
- [ ] Exercise the built page in a real browser, including phone-width layout, save/reload, catalogs and backup controls.

## Task 3: Make local and GitHub use repeatable

Files: `Open-Vara-DnD.cmd`, `scripts/open-local.ps1`, `.github/workflows/pages.yml`, `README.md`.

- [ ] Add a launcher that resolves the repository from its own path, builds using a local virtual environment, and opens the sheet. Include `-NoBrowser` for validation.
- [ ] Run both test suites before the Pages build; upload the built site for download.
- [ ] Document the canonical folder, source/output distinction, local launch, phone URL, backups and manual rules.
- [ ] Verify launcher, fresh-checkout build, Git whitespace checks and independent code review.
- [ ] Commit changes, push the feature branch and create a reviewable PR if the connected account permits it.
