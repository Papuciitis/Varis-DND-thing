# Varis design refresh

The 24 November 2026 visual audit was approved for implementation. The design direction is a polished fantasy reference book: warm paper, forest-green navigation, burgundy actions, subtle gold details and a consistent Varis identity.

## Implementation

- Compendium: bring collections above authoring utilities; simplify filters and creature types; strengthen typography; distinguish rarity; improve class expansions and category identity.
- Character sheet: emphasize play values, reduce editing clutter, move attacks near health on phones, keep bottom navigation, and group inventory into compact expandable rows.
- Reading: format dense magic item descriptions into smaller sections while retaining their original text, numerical values and order. Retain wide layouts for tables and creature statblocks.
- Integration: keep the existing vanilla JavaScript/Python static build, YAML rules and browser storage compatible. Bundle presentation helpers into hosted and standalone compendium copies.

## Validation

Run the Python and JavaScript suites, build both hosted and standalone pages, and inspect the rendered compendium and character sheet at desktop and phone widths. Check filter navigation, existing character data, inventory controls, expandable classes, long item text and the monster editor.

Completed: 86 Python tests and 273 JavaScript tests pass; hosted and standalone builds succeed. Portable-build checks were repeated after adding the shared equipment categorizer. Independent source review approved coverage and code quality after corrections to printing, filter reset, equipment categories and responsive layout.

Rendered visual verification remains pending: the browser could not access the sandbox's local HTTP preview, and its security policy blocked local-file previews. These changes have not been published.

## Boundaries

This refresh changes presentation and interaction layout. It does not rebalance rules, rewrite imported source mechanics, migrate saves or change the publishing workflow.
