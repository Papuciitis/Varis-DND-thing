# Geomancy spell review

The site's **Geomancy spell review** section (`geomancy-review`) gives V. the complete original Geomorphy spell inventory, his written reviews, and proposed Varis conversions. The source levels 0-11, spell slots, components, durations, class lists and mechanics remain intact. Rewritten drafts use the four Varis magic categories and spell levels 0-6, awaiting V.'s approval. These references are separate from the 439 current spells and character-builder choices; the Monster manual still contains 160 entries. No review entry grants a spell, summoning power or class feature.

Source: the user-provided `draft2.pdf`, metadata title **The Tarta Guide - The Homebrewery**, author `nerak`, 79 physical PDF pages. The spell index is on page 40 and the bodies occupy pages 41-79. Page 39 introduces **Unique Geomorphy Spells**. Page references in each entry use physical PDF pages.

## Inventory

The review contains **156 entries**: **154 full spell bodies** and **two index-only titles** whose descriptions are missing from the supplied PDF. The page-40 index lists 155 names; **Geomorpher's Compass** has a body on page 41 but is absent from that index, so it is retained as an additional review entry.

| Source level | Review entries | Full bodies | Index-only titles |
| --- | ---: | ---: | ---: |
| Cantrips (0) | 12 | 11 | 1 |
| 1 | 22 | 21 | 1 |
| 2 | 23 | 23 | 0 |
| 3 | 22 | 22 | 0 |
| 4 | 19 | 19 | 0 |
| 5 | 16 | 16 | 0 |
| 6 | 12 | 12 | 0 |
| 7 | 9 | 9 | 0 |
| 8 | 12 | 12 | 0 |
| 9 | 7 | 7 | 0 |
| 10 | 1 | 1 | 0 |
| 11 | 1 | 1 | 0 |
| Total | 156 | 154 | 2 |

**Earth's Guidance** (cantrip) and **Stone's Embrace** (1st level) are marked as missing source descriptions. Casting time, range, components, duration and effects are not invented for them. Geomorpher's Compass, Earth's Embrace and Stone's Resilience retain their own identities rather than being substituted for these gaps.

Five index titles differ from the printed body headings. The review retains the body titles and records the correspondence in `data/geomancy-review/source-index.json`:

| Page-40 index title | Spell-body title |
| --- | --- |
| Petrified Pirouette | Petrified Pirrouette |
| Geomorph's Transcendance | Geomorph's Transendance |
| Stone's Symphony | Stone's Simphony |
| Neodymium Net | Neodrakite Net |
| Geomorpher's Stone Sentence | Geomorph's Stone Sentence |

Source discrepancies such as conflicting base/upcast durations and omitted fields remain visible in source notes. Original creature-creating text is a review reference; the converted standalone monsters and their documented completions remain separate. Seven review spells link to their related converted monster options for comparison; those links do not convert the original spell rules.

## Browsing and data

Choose **Magic & equipment then Geomancy spell review** in the site section picker, or follow **Geomancy spell review** from the current Spells page. Search by name or rules text, filter by **Source level**, and expand entries to compare their original descriptions. Individual entries also have linked pages. The source-draft notice identifies the collection as awaiting adaptation.

`data/geomancy-review/source-41-47.yaml` through `source-74-79.yaml` hold the full bodies in six files grouped by source page range. `source-index-only.yaml` holds the two missing-description records. `source-index.json` preserves all 155 index names by level, the five body-title aliases, the two missing bodies and the body-only Compass title. The compiler publishes the YAML records only in `geomancy-review`; they are not added to `spells` or automatically offered by the character builder.


## Author reviews and rewritten drafts

The `review rock spells` commit (`ca35872`) added an annotated copy of all 156 entries under `data/geomancy-review-but-like-reviewed-this-time/`. It contains 140 author comments: 139 `review` fields and one historical `revidew` field on Zephyr's Shield. The compiler reads these files as annotations, rather than compiling a second set of spells. It preserves every comment and rejects conflicting source mechanics or repeated identities. Both source snapshots remain tracked; source mechanics must agree in the two copies.

`data/geomancy-review/decisions.yaml` records the disposition of each commented entry and holds proposed conversions. Every record names its original source entry, so renaming a draft preserves bookmarks and original identities. Statuses distinguish rewritten drafts, ideas to merge, rejected spells, and ideas that still need design. Entries without author comments stay unreviewed; the two missing descriptions remain explicit source gaps.

Each rewritten draft supplies a proposed name, magic category, level, casting time, components, range, duration and full effect. Upcasting or cantrip upgrades follow separately. Design notes identify new interpretations and balance choices; Questions for V. retain unsettled decisions. Related current spells link to existing rules for comparison and never replace them.

The page filters by disposition and proposed magic category, combining these with search, source level and display controls. Search finds proposed names and rewritten rules. Source level always means the original spell's level; the draft displays its separate proposed level. Original spell text and author comments remain available with each proposal.

To revise a draft, edit its record in decisions.yaml, append the change to data_tweaks_report.md, and rebuild. Mechanical questions that cannot be settled from the review belong in ai_data_design_points_of_interest.md. Approval and promotion into the current spell catalog remain a separate author decision; no approval toggle or automatic promotion is implemented.

## Rewritten draft inventory

These 30 complete proposals await V.; the other dispositions remain available in the same review section.

| Original spell | Proposed draft | Magic | Proposed level |
| --- | --- | --- | --- |
| Breeze Whisper | Breeze Whisper | Mystic | Cantrip |
| Gemstone's Glee | Votive Gem | Oath | Cantrip |
| Geomorpher's Compass | Compass | Mystic | 1 |
| Lithoresonance | Lithoresonance | Mystic | 1 |
| Wind Slash | Wind Slash | Mystic | Cantrip |
| Drumbeat of the Ancients | Resounding Rebuke | Oath | 1 |
| Gemstone Keenness | Gemstone Keenness | Oath | 1 |
| Geomantic Pulse | Geomantic Pulse | Mystic | 1 |
| Granite Gaze | Granite Gaze | Mystic | 1 |
| Leaf Armor | Barkskin | Oath | 1 |
| Blossom Shield | Thornmantle | Occult | 1 |
| Crystalize | Crystal Blight | Occult | 2 |
| Earth's Grasp | Earthen Bonds | Oath | 1 |
| Geomorph's Vision | Landmemory | Mystic | 1 |
| Petrified Smite | Binding Smite | Oath | 2 |
| Rampart of Rubble | Stoneshell | Oath | 2 |
| Terran Traverse | Earthwalk | Mystic | 3 |
| Boulder Blast | Siege Stone | Oath | 3 |
| Earth's Echo | Stoneecho | Mystic | 3 |
| Greenery's Grasp | Grasping Green | Mystic | 2 |
| Quake Hammer | Quake Hammer | Oath | 1 |
| Rocky Resilience | Bedrock Resilience | Mystic | 6 |
| Stone's Immunity | Stoneskin | Mystic | 5 |
| Rockrise | Rockrise | Mystic | 3 |
| Bloomheal | Bloomheal | Mystic | 4 |
| Crystal Prison | Crystal Prison | Arcane | 5 |
| Highland's Rise | Raise Highland | Mystic | 5 |
| Stone's Simphony | Invocation of Concord | Oath | 4 |
| Crystal Mirror | Malefic Mirror | Occult | 5 |
| Geomantic Ascendancy | Geomantic Ascendancy | Mystic | 6 |
