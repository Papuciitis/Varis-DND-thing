# Patch notes

## 2026-11-28 - Tabletop events, movement and automatic effects

- Added an automatic-effect builder: start/end turn, start round, movement, damage, healing, reaching zero HP and condition changes can apply damage, healing, resource changes, conditions or messages. Effects can expire after a set number of applications; bounded chains prevent recursive loops.
- Condition timers can use the start or end of a chosen token's turn. Timed conditions expire on tokens and linked character sheets together. Regeneration and supported printed turn-based condition rules now run through initiative; browser or physical saving throws resolve through Events.
- Draw a circle, line, square or cone spell area and choose Make trigger to create a trap or persistent zone. Set entry/turn timing, affected travel modes, height range, visibility, a source rule and one-use/reusable behavior. Player placements become proposals for GM approval.
- Movement follows the direct route and checks hazards along its whole length. Tokens stop at the first trigger; resolving its event can continue the remaining route, checking later hazards and remaining movement again. Overlapping traps, secondary saves and interrupted routes are saved with the campaign.
- Added walking, flying, hovering, swimming, climbing and burrowing controls with public height/depth badges. Vertical motion and changes of mode share the movement allowance. Known creature speeds populate the controls; temporary granted speeds can have turn durations. Dash, exploration reset and GM reposition controls are explicit.
- Added a campaign Events tab and event links in the chat log. Automatic health/resource changes synchronize back to linked local sheets, with revision protection against restoring stale HP. Player attributes retain their existing sharing settings.
- Added shared map pings through Shift-click or the map context menu. Pings disappear after a few seconds and respect concealed map areas.
- Updated the prototype with main's latest character progression, feat and spell-choice work and the 302-monster compendium. Updated launcher restart detection for the new server modules.
- Source-dependent saves, unusual creature-size damage, falling, terrain, item/spell costs and minute/hour effects still require their actual rules or a GM decision. Review details and remaining source questions are recorded in the prototype documentation and points of interest.

## 2026-11-27 - Token condition markers and adjustable panels

- Conditions now appear directly on affected tokens as a segmented colored ring and compact markers underneath. Stack counts update live; hover for names, or click to expand the selected token's condition details. Crowded lists use a more-effects marker, and HP bars stay beneath the condition markers.
- The bottom Conditions block starts collapsed into a compact summary. Expand it for named effects, reminders and individual full-rule descriptions.
- Campaign, reference and utility panels can collapse independently. Side panels retain labelled reopening rails, and the utility header remains accessible.
- Drag the reference panel's left border to resize it. Keyboard arrows also resize, and double-click resets its width. Layout preferences survive reopening this browser; the map retains usable space and mobile drawers continue to work.

## 2026-11-27 - Tabletop conditions and custom effects

- The GM can open Conditions from a token's right-click menu or its bottom utility tray, including for private player characters. The picker contains all 47 published conditions with their full rules.
- Conditions appear as wrapping, colored badges with one badge per condition and a visible stack count. Add, subtract, set or remove stacks, or clear all effects.
- Custom effects have a separate name, notes, stack count and explicit movement-zero option. Names alone do not invent rule effects.
- Linked player sheets synchronize conditions in both directions. Version checks protect newer GM changes from stale sheet updates; private attributes remain private.
- Effective speed updates immediately. Players cannot drag, place or use arrow keys to move tokens whose speed is zero; the GM can still reposition them. Hobbled permits reduced movement and Frostbite does not independently stop movement.
- Character-sheet rolls apply supported advantage, disadvantage, save failures and printed penalty dice. Madness removes proficiency, Diseased reduces healing, Soaked affects applicable fire damage, and Ethereal grants physical immunity. Casting restrictions are checked before spending a slot.
- Only explicitly stackable mechanics scale with their count. Timed damage, saves, condition-ending triggers and contextual targeting remain manual, with rules and reminders visible beside the conditions. Missing Fatigue penalties at levels 6 and 7 still require a table ruling.

## 2026-11-28 - Upgrade lists and repeated picks

- Fixed More upgrades invalidating its own selection after an upgrade was chosen. Bonus picks remain usable between normal level milestones and share the original list's prerequisites and repeat limits.
- Constrained bonus picks can be filled in either order. Leveling reallocates existing eligible picks between ordinary and bonus slots, preserving the new ordinary choice instead of incorrectly restricting it to an older bonus list.
- Connected additional permanent class and archetype grants to their actual lists, including Bard's Truly Inspiring, Poet's Arcane Display, and reviewed alchemist, martial, ranger and rogue traits. Level-specific conditional grants activate at their printed milestones.
- Added Bard trait follow-ups for owned list choices, expertise, proficiencies, ability bonuses and cantrips. Sorcerer's Arcane intuition now uses its class spell grants rather than the similarly named elf trait's upgrade schedule.
- Added missing permanent pickers for Bounty hunter Experience, Fool Parody and minor traits, Stormblade choices, Scholar's school secrets, Scribe's spell-book project and other explicit upgrade lists. Invocation and school upgrades require their corresponding original choices.
- Warmage, Ascendant and Ascended sorcerer improvements now follow the abilities already owned. Their automatic upgrades do not create unrelated ability choices.
- Added the two special Cantrip mastery picks and its actual cantrip-upgrade grants. Parody's extra cantrip upgrade also returns to the spell's existing pool.
- Repeatable class picks keep separate follow-up answers, including after removing an earlier copy. Finite wording such as "up to three times" is honored; Bard inspiration and explicit hex die ceilings are checked. Explicit permission to apply both hex upgrades to the same hex works; separate level grants can target that hex again.
- Character feature cards show current selections with their own rules and repeat counts; full source rules remain expandable. Spell cards count outstanding bonus upgrades as well as level grants, and retain repeated selections in their summaries.
- Existing saved choice identities remain intact. Inactive picks and follow-up answers stay stored for restoration. Source interpretation questions are appended to points of interest; source game data is unchanged.

## 2026-11-27 — Cantrips, feat follow-ups and level progression

- Cantrips can be selected from both their tab and the spell-level selector. The preview follows the active filter and starts with an unchosen spell; reopening a draft resets old filters.
- Equipment uses a searchable, bounded card list with one rules preview. Your equipment has a separate compact list and one item editor, preserving independent copies and saved edit targets.
- Reviewed all 156 feats. Added follow-up controls for target abilities/spells, ability bonuses, upgrade lists, skill and tool training, spell grants, maneuvers, weapon groups and other permanent decisions. Supported numerical effects update the sheet; the complete audit is in docs/character-feat-support.md.
- Occultist Mark & Reward now requires a complete pair before applying benefits. Resistance, damage-type and expertise rewards have actual target choices; the feat reward opens an eligible picker excluding ability-score increases. GM-dependent skill marks record their classification, spell-attack marks affect casting, and the reward's damage type is fixed after saving.
- Extra fighting skills, Ranger training and supported additional feature choices create real slots. More upgrades can expand only the chosen upgrade lists and cannot buy a new base ability or another feat. Repeatable feats retain independent decisions and later-tier prerequisites.
- Extra cantrip upgrades from feats and features share the spell's upgrade pool and obey its repeat limits. Explicit permanent class grants can upgrade selected or all eligible cantrips/hexes; temporary and focus-bound bonuses remain conditional.
- Cantrip upgrades use each source's printed level schedule. Automatic improvements are separate from choices. Later picks deactivate on level-down and return when the level is restored. Active choices and automatic rules are available from the spell's controls.
- Added actual ancestry spell choices and level-dependent grants, including Arcane intuition's 1/5/9 upgrades, the Outcast house hex upgrade at level 2 and Enchanted birth's spell milestones. These grants retain their casting ability and are separate from the base class allowance.
- Cryptic cyphers follows recorded insights instead of character levels, with its printed five-upgrade cap.
- Mana-refusal records sacrificed spells and the historical upgrade count. Its allowance stays fixed after sacrifice; the sacrificed spells remain recorded and cannot be cast. Old checkbox-only confirmations require the new follow-up choices.
- Supported Metamagic maximum changes follow their printed levels, including Arcane ascension. Explicit class/ancestry level clauses are also available on Review. Call order's spell-level improvements follow the selected casting level.
- Unresolved rounding, legacy prerequisite references, conditional costs and source interpretation questions remain documented in points of interest. Source game rules are unchanged.

## 2026-11-27 — Focused builder, feat prerequisites and resource tracking

### Easier character creation

- Features now use a compact list of choices and one active choice panel. Completed selections stay as small chips; passive features are folded into a separate reference section.
- Skill and upgrade previews show only the selected node's own rules. Parent skills no longer include the entire subtree; genuine internal lists, such as Make do's crafted items, remain readable.
- Spells and Feats have dedicated stages, shown when the character has those choices. The flow keeps the selected stage stable when options change.
- Spell selection uses separate cantrip/spell tabs, searchable cards, level filters, one rules preview, chosen-spell chips and a compact preparation section.
- Human's level-one Extra Feat opens a real feat picker. Explicit Ginasi and Shadowling lineage feat grants also open a picker while their granting trait is selected.

### Feat eligibility

- Character creation offers feats that meet their literal prerequisites. Checks cover ability thresholds, grant level, ancestry, class, background, selected features, proficiencies, spell access and supported spell properties.
- A later ability improvement cannot qualify an earlier feat grant. Duplicate and ineligible imported feat choices remain stored but do not activate the feat.
- The compendium retains the complete feat catalog. Story qualifications have explicit character facts; unsupported or inconsistent source requirements stay unavailable in the builder and are recorded for review.
- Source-defined resource choices for Occult gnosis, Madness magick and Mana-refusal can be recorded from the selected feat's details, including their sacrifices and conditions.

### Rest dice and death saves

- The base rest-dice maximum is one die per character level, as confirmed by the author. Active ancestry, background, class, feature and feat bonuses or penalties are added once, with a visible source breakdown.
- Rest-dice bonuses include itemized benefits, permanent penalties, expertise-dependent grants, Elder blood at its printed levels and Paladin Divine power scaling. Unresolved rounding or routine-dependent adjustments are shown for table review.
- Changing the calculated maximum preserves remaining dice. New characters start with their calculated pool. Explicit table adjustments and a manual base override remain under Table adjustments.
- Conditional sacrifices and oath-dependent bonuses require their relevant selected benefit or condition. Temporary and night-only rest dice do not inflate the permanent maximum.
- Death-save dropdowns are replaced by clickable success and failure dots. The number of dots follows the character's active save-slot modifiers and persists in saves and backups.

### Reference review

- Verified the supplied Cleric, Wizard, Sorcerer and Bard numeric spell progressions against Git. The previously supplied Druid progression also matches.
- Git remains authoritative for Occultist. The screenshot's 3–8 spell points differ from the current 2–7 shared-level slots; the conflict is recorded for an author decision.

## 2026-11-27 — Character creation and spellcasting

### Character creation

- Fighter fighting skills now include two starting selections, every subsequent level, and each class ability-improvement bonus. The skill tree exposes prerequisite upgrades.
- Recurring class and archetype grants expand their earlier selection lists. This includes Alchemist methods, Bard upgrades, Weapon master and Champion training, Ki channeler powers, and later trait grants for the supported archetypes.
- Additional ability-improvement choices are available for Druid, Ranger and Barbarian. Occultist's optional extra mark and reward must be selected together. Ki channeler and Wildshaper can select their printed alternative upgrades.
- Take a feat opens the actual feat catalog with requirements and full rules. Selected feats appear on the saved character.
- Backgrounds can be selected and read in the builder. Existing catalog background names migrate to saved references.
- Editing uses a separate draft. Cancel preserves the saved character; inactive later-level feature choices remain stored for restoration.

### Spells

- The Features step includes class spell selection, searchable rules previews, spell-level filters, and counters for spells known, spellbook spells and cantrips.
- Base class selections follow the appropriate Arcane, Mystic, Oath or Occult list, current level and class allowance. Bard talent spells use any tradition and treat the three hex tiers as level 1, 2 and 3 spells.
- The spell-page picker defaults to the class's eligible list. Explicit extra selections support feature-granted spells, copied spellbook spells and table rulings. Custom spells and manual trackers remain available.
- Straightforward readied attack spells appear among the main sheet's actions. Any known spell can be pinned to, or hidden from, that area.
- Cast spell spends the selected casting resource immediately. A casting-level selector supports upcasting. Standard spell slots, Occultist shared slots, Cleric reducible full slots, Bard rest dice and manual slot rows use their respective costs.
- Cantrips spend no spell slot. Hexes are not treated as free cantrips. Unprepared Wizard spells and unavailable or exhausted casting choices cannot be used.
- Simple spell attacks roll their attack check when cast. Full effects, saves, damage, components, cooldowns, extra costs and higher-level effects remain attached to the spell rules for resolution at the table.
- Slot spending and spell selections survive saving, backups and reopening. Changing classes deactivates that class's previous spell selections without deleting them.

### Rules and project records

- Cleric full-slot level and Bard spell-learning level have explicit table settings where the source omits a numeric limit or rounding rule. Wizard's missing preparation count is documented for author review.
- Added this ongoing patch-notes file and a readable Patch notes page linked from the compendium and character sheet.
- Appended source ambiguities and remaining manual-rule areas to the existing points-of-interest file. Source game rules were preserved.
