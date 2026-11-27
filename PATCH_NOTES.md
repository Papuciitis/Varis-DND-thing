# Patch notes

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
