# Geomancy spell review

The site's **Geomancy spell review** section (`geomancy-review`) gives V. the complete original Geomorphy spell inventory to evaluate for his rework. It preserves source levels 0-11, spell slots, components, durations, class lists and mechanics without automatically converting them. These references are separate from the 439 current spells and character-builder choices; the Monster manual still contains 160 entries. No review entry grants a spell, summoning power or class feature.

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
