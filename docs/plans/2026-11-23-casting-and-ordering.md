# Casting resources and sensible ordering

The user wants class spell resources filled automatically, and level-based content ordered numerically rather than alphabetically. Work on `codex/spell-resources-ordering`, based on main after merged PR #5. Original Git rules remain authoritative; no D&D 5e progression is substituted.

## Ordering

Share one numeric comparator across the reader and character UI. Spells default to increasing level (cantrips first), with A–Z and decreasing-level alternatives. Keep name tie-breaks, unknown/custom levels last, search relevance as the default for queries, and bookmarks/filter choices intact. Saved spells and manual slot rows sort as views without changing the saved array indexes used by edit controls. Builder/sheet features and archetype choices use grant/unlock levels; monsters use fractional Challenge ratings. Classes, races, backgrounds and equipment remain alphabetical. Do not extract levels from arbitrary rule prose.

## Casting

Compile explicit source tables for Wizard, Sorcerer and Druid; Occultist slot count/level; Cleric full-slot count; Bard rest-die casting. Include source-backed Sorcerer metamagic capacity and fixed selected feature bonuses. Preserve prose recovery rules unless a recovery action is explicitly defined. Keep unsupported separate archetype casting pools readable/manual.

Use a separate validated builder ledger for managed casting pools; preserve spent capacity through render, leveling, class/choice changes and save/backup cycles. Keep existing manual trackers intact. If legacy manual slots/resources exist, require the explicit Use class slots action before activating automatic pools, preventing silent duplicates. Cleric full slots track remaining levels individually. Their unspecified maximum spell-level progression needs an author answer or a labelled manual setting.

## Verification

Test ordering and metadata extraction against real catalog cases, and casting capacity/spend preservation, migration, independent full slots, rests and class switching. Test delegated UI behavior with shuffled spells/slots so controls still edit the correct records. Build hosted and portable versions, inspect phone/desktop sort and casting controls, review and publish a focused PR without merging/deploying main.

Completed verification: 41 Python tests, 170 JavaScript tests, and hosted/portable builds pass. Browser checks cover a level-5 Wizard's 3/2/1 capacities, spending across reload and class changes, out-of-order spell additions, level filters and descending sort, plus independent Cleric full-slot reductions at phone and desktop widths. The source audit for Cleric still found no numeric maximum; details are recorded in `docs/rules-review.md`. Visible branding uses Varis; existing save identifiers and local paths are retained.
