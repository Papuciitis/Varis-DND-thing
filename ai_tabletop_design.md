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

Map overlays appear on token selection or hover; they do not remain over every
token continuously. Hover/selection never bypasses the viewer's access permissions.
Player sharing remains explicit and revocable.

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

Conditions belong to the bottom utility tray and the token context menu. Use a
single colored, wrapping badge per effect with a visible stack count. The standard
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
are automated. Timed damage, contextual targeting, duration, saves and ending
triggers remain manual with visible source text and reminders until their timing
and targets can be represented explicitly. Do not fill missing Fatigue 6/7 rules.

Reuse the project's character calculations and YAML-built compendium. Keep
authoritative permissions and state in the shared server model, including for
drag-and-drop, notes and messages. Use plain text for user content.
Keep prototype commits on codex/tabletop-prototype until a merge is explicitly requested.
Player accounts and paid services are not prerequisites.
