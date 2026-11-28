# Rules coverage and source reconciliation

The starting point was the 400-entry reader at commit `2dc5d2f`. The comparison covered all 137 pages in the D&D 5e+ capture. Five pages in that capture ended mid-entry. The original draft supplied the missing ends of the backgrounds, feats, playable races, level 6 Arcane spells, and hexes pages. Reviewed workbook creature references brought the catalog to 1,288 entries. The separate campaign magic-item conversion adds 300 items and four shared item rules, bringing the catalog to 1,592 entries.

## Coverage by section

| Section | Before | Now | What the comparison found |
| --- | ---: | ---: | --- |
| Classes | 2 | 92 | Twelve base classes, 77 named archetypes, a class overview and two sets of extra options. Two archetypes have no published features. |
| Spells | 13 | 463 | 459 spells and hexes, plus four magic reference entries. The additions comprise 415 spells and 31 hexes, including 24 author-approved review spells. |
| Backgrounds | 0 | 116 | Background proficiencies and features, through Zealot. |
| Monster manual | 0 | 20 | Workbook creature reference drafts with source ranges and status notes. Current spell rules and embedded creature statistics retain priority. |
| Items | 133 | 271 | The Git weapons plus equipment, materials, consumables, magic items, 22 armor entries and eight shields. |
| Magic items | 0 | 300 | All six rarity tabs of the campaign's Magic item generator workbook, converted for Varis with editable rules and preserved source text. |
| Weapon rules | 91 | 105 | Fourteen additional properties or maneuvers. A weapon or feature must grant an option for it to apply. |
| Feats | 103 | 156 | Draft-only feats and resource conversions. Matching and renamed feats use their Git definitions. |
| Races | 13 | 14 | Thirteen existing races gained descriptions. Shadowling has a complete entry and 15 origin choices. |
| Conditions | 44 | 47 | Psychosis, Acid Exposure and Chilled were added. Distracted and Burning gained missing text. |
| Rules of play | 0 | 27 | Combat, blocking, armor, character creation, recovery and weapon use, plus four common rules for converted magic items. |
| Design notes | 1 | 5 | The proposed skill list and design material sit alongside the existing maneuver prototype. |

Entries include rules overviews, supplements, and explicitly unfinished records. A section's entry count consequently differs from its number of playable options in some cases.

The YAML is the rules source. The compiler validates and combines it; the build writes a manifest, separate versioned section JSON files, builder metadata, and a portable catalog script. The hosted reader loads sections on demand. On local file URLs, the root pages load `data/portable-catalog.js` without JSON requests, preserving the existing launcher page and save location. Optional standalone pages in `site/offline/` embed the same catalog and metadata. Splitting delivery does not create another rules definition.

The campaign magic items live separately under `data/magic-items/`. Source IDs and original workbook fields remain traceable while converted names, prices, rarity and effects can be edited. See [magic item conversion and editing](docs/magic-items.md).

## Rules reconciled

| Where the sources disagreed | Rule in the reader |
| --- | --- |
| Occultist spell points and maximum-resource bonuses | The class casts with Git's occult slots. Resource increases with a direct Git counterpart raise the maximum slot count. The non-Occultist branch of Extra Occult Casting grants its single 1st-level cast per long rest. |
| Spellblade arts and catalysts | The Git archetype supplies the core progression. Compatible extra art and exploit options link back to it. Old costs with no established conversion are identified at the affected feature. |
| Automatic blocking in the draft overview | A hit lets the defender commit block and roll against the block DC. An unblocked strike and a hit can trigger different effects. An unsuccessful check spends the committed block. |
| Weapon maneuvers | Use the maneuver on the equipped weapon. Normally, spend a bonus action or move action during the Attack action to replace one attack. A specific maneuver can change the cost or timing. |
| Torch as equipment and as a weapon | One Torch entry includes the draft's 20 ft lighting radius and Git's one-handed Ignite duration of 10 minutes. Each attack consumes one additional minute. |
| Overlapping Arcane cantrips | Ten same-name matches use Git, as does Lesser Wind Binding under its Git name, Lesser Ethurgy. Arcane Dart and Counteract remain available. |
| Burning and fear effects | Generic condition applications use the Git definitions. Spell-specific dice and riders remain explicit, including Hellfire's single-target minimum. |
| Draft-only spells with conflicting introductory wording | For 34 spells, the specific casting-time field settles a generic opening phrase. Later actions required by the spell remain separate. |
| Workbook backgrounds and spells | Existing YAML definitions remain in use. Reviewed names and variant differences are recorded without importing the workbook over the current rules. |
| Workbook creature variants | Twenty source blocks form a reference collection. Eleven existing spells gain links with 15 spell-to-creature references. A link does not replace the spell's own creature statistics or casting rules. |

The latest text pass audited the 66 pre-existing YAML files and made 124 contextual grammar, apostrophe, repetition, and spacing corrections in 34 files. It preserved entry and feature identities, choices, numeric values, and stat fields. All cantrip files remain unchanged. See [the workbook source review](docs/workbook-source-review.md) for source ranges, incomplete creature fields, unmapped spell references, and import reproduction.

## Decisions still needed

| Entry | Missing or conflicting rule |
| --- | --- |
| Artificer and Soulsealer | The Wizard and Occultist archetype pages respectively provide names only. |
| Muse Caller | The True Expression feature is unfinished. |
| Alchemist | Its third archetype is granted at level 9 in the feature and at level 10 in the progression table. |
| Ranger | The level 9 row gives a proficiency bonus of +8. The reader flags the figure for review. |
| Fatigue | The Git scale runs to 10 but omits penalties for levels 6 and 7. The draft's eight-level scale cannot supply those values. |
| Arcane Hex and Minor Geomancy | Git gives both 30 ft and 60 ft for Arcane Hex. Minor Geomancy gives different initial action costs in its casting line and overview. |
| Draft spell costs | Favor the Gods, Outer Dark Invocation, Decoy Hex, Rune of Savat and Ward Hex need action-cost decisions. Seven other spells lack a reaction trigger. |
| Draft spell effects | Power Word: Messenger and Enchantment of the Moon have conflicting levels. Power Word: Fear lacks an ordinary failed-save result. Healing Wish has an incomplete duration. |
| More Mystic Spells Known | The printed prerequisite requires occult casting, while the spell level ceiling refers to mystic casting. |
| Shields with Brace or Repel | The equipment table supplies ratings, but neither source defines how to use those shield properties. |
| Animal Companion, Miasma Cloud and Override Undead | The companion's higher-level alternative ends in `<>`; the cloud omits its movement distance; Override Undead has an incomplete effect and unrelated higher-level text. |
| Workbook creature drafts | Raised undead lacks speed, undead warrior lacks AC, and False wisp lacks most statistics. Other malformed source expressions remain flagged rather than completed by inference. |

Other unresolved feature costs and unfinished options are marked at the relevant class feature or entry. [Rules review decisions](docs/rules-review.md) records the concrete decisions needed, including newly identified truncated effects and separate balance questions. Cantrip redesign is deferred. The draft includes external illustrations and embedded frames; the generated reader includes the rules text and tables. The new monster manual is a workbook reference collection alongside the statistics already printed in spells and features.
