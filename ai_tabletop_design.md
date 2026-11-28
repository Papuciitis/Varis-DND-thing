# Tabletop design principles

Author guidance: V and Nauris, 27 November 2026. Read this before changing the tabletop UI.
Scope: the isolated tabletop prototype; do not move these changes into the main compendium implicitly.

## Desktop layout

PC browsers are the primary target. Keep the map central and give each surrounding
slate a consistent job. Mobile drawers provide the same functions without replacing
the desktop layout with a phone-first interface.

| Region | Responsibility | Examples |
| --- | --- | --- |
| Right: data slate | Reference, inspection and options | Compendium, selected character/creature, attacks, traits, scene settings |
| Left: lobby slate | Data belonging to this campaign | Player/GM list, scene participants, dice/message log, GM-distributed notes, initiative |
| Bottom: utility | Frequently used values and controls | HP, temporary/arcane health, AC, Block, ability scores, resource edits |

Use tabs in both sidebars so unrelated tasks do not form one long column. Keep
attacks visible as cards in the selected-token view, even if the abilities list
is collapsed. Dice and messages belong together on the left and need readable text.

Each slate can collapse independently. Desktop sidebars retain a narrow labelled
rail for reopening; utilities retain the selected token's heading. Dragging the
reference panel's left border changes its width, with arrow-key support and a
double-click reset. Preserve room for the map and remember layout choices in this
browser. Mobile keeps its campaign/reference drawers and a collapsible utility.

## Compendium and placement

The GM can browse monster templates and locally saved characters on the right.
Drag-and-drop from that list onto the map is a primary placement path. Keep a
click/touch alternative. Each placed monster has independent encounter resources.
Keep GM token removal visible without expanding settings, with a matching
right-click action. Removing an encounter token must preserve its source sheet.
Player compendium views list their controllable campaign characters and summons;
they must not expose another player's private sheet or hidden GM creatures.

Tiny tokens occupy half a cell per axis and snap to quarter-cell centres, with
half-square arrow-key movement. Share snapping between placement and the server;
keep fog on the normal grid. Token bodies take click priority over nearby bars.

## Health and map overlays

Resource bars appear on token selection or hover. Public conditions remain visible
on the token itself: a segmented colored ring and compact markers immediately
underneath it, with stack counts. These markers do not depend on private HP access.
Hover reveals full names; clicking a marker selects the token and expands its
condition information. Wrap markers without overlap and use a bounded overflow
marker for crowded lists at small scales. Place health bars below those markers.
Hover/selection never bypasses the viewer's access permissions. Player sharing
remains explicit and revocable.

The fixed-width main health track uses red for HP, white for temporary HP, and
light blue for arcane health. Capacity is max HP plus current temporary HP plus
current arcane health. Filled health is current HP plus those two current pools.
Unused HP capacity stays empty; added health changes proportions, not track width.
Show AC in a shield badge on the left, never as a progress bar. Block can remain
a separate bar. Preserve configurable resources and character/statblock syncing.
This changes presentation, not damage absorption rules or automatic combat resolution.

## Monster encounter editing and damage

Monster templates seed independent encounter instances. Prefer an explicit printed
HP total in either notation (`13 (2d8+4)` or `2d8+4(13)`); otherwise calculate the
dice average and round down. Never read the number of dice as HP. Ask for encounter
HP when a formula needs a controller value; do not invent that value or change YAML.
Persist per-field monster overrides with the token so maximum HP, scores and other
GM edits survive source refresh, reconnects and backups without editing the template.
Player-character sheet ownership and read-only sharing remain separate.

Extra-health pools starting at zero must accept added health and establish capacity.
The GM's Apply damage action targets GM-controlled tokens and uses the confirmed
Arcane Health -> Temp HP -> HP order. Enter damage after mitigation. Show a preview,
keep Block/AC separate, and keep detailed pool expenditure private to the GM.
Players retain manual editing of their own characters and summons.

## Implementation boundaries

Detailed conditions remain in a collapsible bottom utility section and the token
context menu. Its closed state is a compact count/status summary. Expanded details
include named badges, reminders and the full source rules. Use one wrapping badge
per effect with a visible stack count. The standard
picker uses the built 47-condition catalog and its original text. Custom effects
remain separate: name, count, notes and an explicit movement-zero flag. A name such
as Frozen never introduces a new standard rule.

The GM may apply public conditions to any token without seeing private character
attributes. Owners may edit their own sheet conditions. Synchronize these with an
expected revision so an older sheet refresh cannot erase a newer GM effect. Store
base speed separately from effective speed; never compound reductions on refresh.
Enforce zero-speed player movement on the server and all client movement paths;
retain GM repositioning for forced movement and exceptions.

Stack counts are visible for all effects, but multiply mechanics only where the
source explicitly permits it. Source-based roll restrictions and derived speed
are automated. The event engine now represents explicit turn/round timing,
condition durations, saves and simple ending triggers. Keep contextual targeting
and unrepresented timing manual, with visible source text and reminders. Do not
fill missing Fatigue 6/7 rules.

Reuse the project's character calculations and YAML-built compendium. Keep
authoritative permissions and state in the shared server model, including for
drag-and-drop, notes and messages. Use plain text for user content.
Keep prototype commits on codex/tabletop-prototype until a merge is explicitly requested.
Player accounts and paid services are not prerequisites.

## Encounter events and movement, 28 November 2026

Keep campaign event resolution in the left Events tab and notifications in Log.
Keep reference configuration and placed-trigger lists in the right Scene view.
Travel controls belong in a compact bottom utility disclosure, alongside resources
and conditions. Mode/height/depth and paused status stay visible above each token
independently of its private HP. These are travel states, not additional canonical
conditions. Avoid making the map's default state taller with expanded controls.

Authoritative moves check the complete direct route, intervening fog cells,
continuous shape intersections and altitude. A drag previews a destination and
route; clients animate actual tokens only to server-approved stopping points.
Stop at the earliest trigger, keep the remaining destination and recheck it after
resolution. Do not silently teleport through later traps, changed fog or a
condition that now prevents movement. Preserve Tiny-token exact interruption
coordinates without snapping an altitude-only move sideways.

Turn advancement is a two-phase operation. Apply end-turn rules once, retain
pending saves, and enter the next turn only after blockers resolve. Preserve the
turn phase, finite applications and interrupted routes in storage/backups.
Condition timers apply to the whole current condition, including its stacks;
timers created during a phase do not tick retroactively in that same phase.

Use explicit source speeds or controller-entered grants. Player traps require a
declared item/spell/feature or table source and GM approval. Do not infer item or
slot spending from a name. Do not infer walls, terrain, water or climbable surfaces
from map artwork. An expired airborne grant creates a visible review event; a
source-dependent fall is not invented. See docs/tabletop-events.md for timing and
permission details. Shared pings are transient and never reveal concealed map points.
