# Pending spell reviews

The review section contains only spells that still need V.'s attention. Approved spells are ordinary spell data, and rejected or resolved source entries no longer appear in the review queue.

The completed promotion batch below applies author commit `2e3e332`, merged as `8cf9b66`. A newer follow-up batch was discovered while preparing the push; see **Newer author follow-ups** below before applying further decisions.

## Current state

| Outcome | Entries |
| --- | ---: |
| Approved and incorporated into normal spells | 24 |
| Rejected and removed from review | 81 |
| Resolved by an approved spell | 2 |
| Still pending | 49 |

The 49 pending entries comprise nine drafts, thirteen merge ideas, eleven design decisions, fourteen entries without an author comment, and two missing source descriptions. Breeze Whisper and the seven higher-level drafts without a new author decision remain pending. The original criticism of Temblor did not give an explicit rejection, so its earlier AI rejection label was not treated as author approval to remove it.

## Approved spells

The current spell catalog contains 463 entries: the previous 439 plus these 24 author approvals. They use the normal Arcane, Oath, Occult and Mystic grouping and appear in normal spell browsing and the character spell picker. Learning or preparing a spell still follows the existing class rules.

| Original source name | Current spell | Class of magic | Level  Applied author changes |
| --- | --- | --- | --- | --- |
| Blossom Shield | Thornmantle | Occult | 1  Kept the edited Thornmantle; slot 2 lasts 10 minutes and slot 4 removes concentration. Added the shared spell-AC stacking reminder. |
| Boulder Blast | Siege Stone | Oath | 3  Kept the approved Siege Stone conversion; a successful block halves damage rather than reducing it to zero. |
| Crystal Shard | Crystal Shard | Mystic | 3  Added the original shard body as Mystic 3: AC 15, 10 HP, single-target spell redirection into a 15-foot half-effect cone. Retained the source upcasting. |
| Crystalize | Crystal Blight | Occult | 2  Promoted the approved Crystal Blight conversion. |
| Drumbeat of the Ancients | Rebuke thy Name | Oath | 1  Renamed to Rebuke thy Name: one hearing target within 30 feet addressed by kind/name, +2 DC for its actual name, extra stun on a roll of 5 or less, and the requested range/target scaling. |
| Earth's Echo | One with the land | Mystic | 3  Promoted the edited One with the land, including restricted ordinary senses, terrain/cavern sensing and the specified 500/750/1000/5000-foot ranges. |
| Earth's Grasp | Earthen Bonds | Oath | 1  Promoted Earthen Bonds; slot 3 removes concentration. Release now refers to the spell ending so that upcast use still works. |
| Gemstone Keenness | Gemstone Keenness | Oath | 1  Retained the consumed 5 gp gem; slot 3 removes concentration, while recasting ends the earlier effect. |
| Gemstone's Glee | Votive Gem | Oath | Cantrip  Promoted Votive Gem with the added spellcasting-focus use and approved upgrades. Did not add attunement. |
| Geomantic Pulse | Geomantic Awareness | Mystic | 1  Renamed to Geomantic Awareness; the ritual explicitly consumes its spell slot. |
| Geomorph's Vision | Landmemory | Mystic | 2  Promoted Landmemory at level 2 with the edited history limits and sixth-slot wording. |
| Geomorpher's Compass | Compass | Mystic | 1  Renamed to Compass; ranges jump at slots 1, 3 and 5 to 100, 1000 and 5000 miles. No extra intermediate tier was invented. |
| Granite Gaze | Granite Gaze | Mystic | 1  Promoted the approved conversion with continuous touch required to see through the material. |
| Greenery's Grasp | Grasping Green | Mystic | 2  Promoted the approved Grasping Green conversion. |
| Leaf Armor | Barkskin | Mystic | 1  Promoted Barkskin as Mystic rather than Oath; added the shared spell-AC stacking reminder. |
| Lithoresonance | Lithoresonance | Mystic | 1  Kept the edited Noise stone playback. Crystal resonance now gives its containing/attached structure +1 saves and resistance to damage. |
| Monolith's Mercy | Bestow Comfort | Oath | 1  Rebuilt as Bestow Comfort: 1d3 + casting bonus temporary HP, allies within 20 feet, at most casting bonus + 1 allies (minimum 2), lasting 10 minutes. Retained unamended source upcasting. |
| Petrified Smite | Binding Smite | Oath | 2  Promoted Binding Smite with the edited +1d8 damage and +1 minute per higher slot. |
| Quake Hammer | Quake Hammer | Oath | 2  Moved to Oath 2, with 3d6 + casting bonus damage, one-round loose-ground dust and double structural damage. Higher-slot wording now starts above its new base level. |
| Rampart of Rubble | Stoneshell | Oath | 2  Promoted Stoneshell with the edited shell-replenishment interaction for larger temporary-health grants. Preserved the authored minimum-dice discrepancy and added the AC stacking reminder. |
| Rocky Resilience | Seal of protection | Oath | 5  Promoted Seal of protection as Oath 5, retaining +3 AC, +3 temporary Block and the approved highest-spell-AC wording. |
| Stone's Immunity | Stoneskin | Mystic | 3  Promoted Stoneskin as Mystic 3 with +3 block checks, the edited physical nonmagical attack immunity, movement penalties and authored material component. |
| Terran Traverse | Earthwalk | Mystic | 3  Promoted Earthwalk, retaining concentration as V. requested. |
| Wind Slash | Wind Slash | Mystic | Cantrip  Upgrades now occur at character levels 2, 6 and 10. Focus wording specifies staff/wand; the added upgrade pushes an unblocked hit 5 feet. |

The authoritative wording is in `data/spells/geomancy-approved.yaml`. It includes V.'s final renames, magic classes, levels, components, effects, targeting and upcasting amendments. Obsolete AI design notes and answered approval questions are not part of the normal spell text.

## What remains to review

Open **Magic & equipment > Pending spell reviews**, or follow **Pending spell reviews** from Spells. The page opens all pending entries. Status, proposed magic class, source level, search and display filters combine. Latest author follow-ups are separate from the earlier original review, and proposed drafts remain outside the active spell lists.

**Rockplica / Clay Simulacra** has a new Occult 4 iteration following V.'s requested direction. Its health/component costs, resource-copy rules and longer durations are explicitly provisional. It is not an approved spell.

**Bloomguard** retains the unfinished author note ending “As an action, using a staff, po”. No ending, level or plant statistics were invented. **Earth's Guidance** and **Stone's Embrace** remain marked as missing descriptions.

**Earth's Eyes** was resolved by **One with the land**, and **Nature's Grasp** by **Grasping Green**. These resolved duplicate source entries were removed from review. Other uncertain merge ideas remain for V.

## Source and history

The original inventory contained 156 entries: 154 bodies and two index-only titles. The source was the user-provided `draft2.pdf`; source page references remain attached to pending records.

All 156 originals, all 156 annotated snapshots, the 140 pre-migration decision records, all 37 latest author responses and the outcome of every entry are preserved in [the author-review archive](archives/geomancy-review-2026-11-28.json). The archive records author commit `2e3e332` and merge commit `8cf9b66`. It is outside `data/` and is not loaded into the compendium or search.

The YAML under `data/geomancy-review/` and `data/geomancy-review-but-like-reviewed-this-time/` now contains only pending entries. Their `source-index.json` files describe the pending queue; the original complete index is in the archive. The compiler still rejects mismatched original/annotated mechanics and duplicate identities.

## Editing

Update a pending proposal in `data/geomancy-review/decisions.yaml`. V.'s `final-answer` field preserves the latest follow-up for an unfinished entry; it can appear on the decision or inside `conversion`. The older `author_response` spelling is also accepted. A comment's presence never approves a spell automatically; contradictory duplicate comments fail validation. `review` remains the original source comment. Append data edits to `data_tweaks_report.md` and unresolved mechanical wording to `ai_data_design_points_of_interest.md`, then rebuild. Further promotions require an author decision.

V.'s numerical spell-AC stacking rule is recorded in **Traditions of magic** and directly relevant spells. Only the largest applicable numerical spell AC bonus applies, while the spells' other effects remain. Ordinary armor, shields, class rules, base-AC formulas and printed creature statblocks retain their existing calculations.

## Newer author follow-ups

Commit `5aaa2bc` (`further review bits`) arrived after the promotion batch was prepared. The complete author-edited file is preserved in [geomancy-review-followup-5aaa2bc.yaml](archives/geomancy-review-followup-5aaa2bc.yaml), including the finished Bloomguard description, new decisions and changed proposal text. Its author fields and mechanics have not been incorporated into the active catalog or review queue yet. The 24/81/2/49 totals above describe the completed earlier batch. Read this follow-up snapshot before processing the remaining reviews.
