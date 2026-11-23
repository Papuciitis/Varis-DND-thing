# Compendium data and monster foundation

Work on `codex/compendium-layout-data`, based on main. YAML remains the editable rules source. Original Git rules take priority over conflicting workbook variants. Leave all cantrips unchanged.

## Design

- Hosted HTML references external scripts/styles and a small catalog manifest. Each section is a separate versioned JSON file, fetched on demand. Character metadata is a separate builder-only file.
- A shared loader caches and deduplicates requests, retains section identity, permits retry after errors, and uses relative URLs under GitHub Pages repository paths.
- Explicit portable copies in `site/offline/` retain fully embedded data and work from disk. Normal file URLs load a file-only catalog script, preserving the original launcher URL and its browser saves. Hosted pages never request that script.
- Class browsing opens a readable list of base classes, with archetypes linked from each parent. Existing entry URLs, filters and full-book search remain available.
- Monsters have canonical YAML records with optional statistics and named action/trait blocks. Workbook reference drafts retain source rows and uncertainty. Verified summon references link to these records without replacing spell mechanics.
- Correct prose only where meaning is unchanged. Document conflicting or incomplete mechanics for author review.

## Implementation and verification

1. Add build and loader regression tests, then implement modular and portable output.
2. Adapt reader and character startup to the loader; preserve saves and rule references.
3. Import 20 source creature blocks deterministically, validate summon links, and add focused importer/compiler tests.
4. Add class/monster/summon rendering and behavior tests.
5. Verify prose changes preserve identities, numbers, choices, and cantrip bytes.
6. Run all Python/Node checks, launcher, clean-clone build and browser checks at desktop/phone widths. Review the diff, commit and publish the branch for review; do not merge or deploy main.
