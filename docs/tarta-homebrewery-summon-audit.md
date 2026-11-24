# Tarta Homebrewery: elemental and summon inventory

Source: `draft2.pdf`, metadata title **The Tarta Guide - The Homebrewery**, author `nerak`, 79 PDF pages. Page references below are physical PDF pages, not the Fandom wiki. Inspected 24 November 2026.

This records the original source inventory and gaps. All 32 printed blocks and three partial summon templates are converted in the add-on, with explicit repairs documented in `docs/tarta-conversion-decisions.md`. The Tarta wiki dragons remain a separate 13-profile collection with completed combat rules. Statements below about missing source rules describe the original PDF, not unresolved playable fields. Browse converted creatures through **Tarta creature options** in `data/draft-reference/tarta-creature-options.yaml` or the Monster manual. The complete original Geomorphy spell list is available separately in **Geomancy spell review** (`geomancy-review`) for V.'s rework: 154 full bodies and two marked index-only titles, preserving source levels 0-11. These 156 review entries do not join the 439 current spells or grant player class features. See [the spell-review inventory](geomancy-spell-review.md).

## Additional Earth Elementals (26 full statblocks)

The druid's **Circle of the Geomorpher** introduces **Geomorphic Form** on page 13. From druid level 6, Wild Shape can select an earth elemental with CR no greater than the druid level divided by three, rounded down. This is transformation into an existing creature, not an additional summoned statblock.

| PDF page | Creature | Printed CR | Distinctive rules already present |
| ---: | --- | ---: | --- |
| 14 | Dirt Mite | 0 | Bite; Earth Glide |
| 14 | Stone Sprite | 1/8 | Pebble; Stone Camouflage |
| 14 | Clay Imp | 1/4 | Slam; Earth Glide |
| 15 | Pebble Gnome | 1/2 | Slam; Earth Glide; Stone Camouflage |
| 15 | Moonflyer | 3 | Moonlight (Recharge 5–6); Moonlit; Gleam |
| 16 | Boulder Guardian | 1 | Multiattack: Slam and Swipe |
| 16 | Crystal Sprite | 1 | Crystal Shard; Crystal Camouflage |
| 17 | Granite Striker | 1/4 | Granite Peck; Pack Tactics |
| 17 | Magnetite Guardian | 1 | Magnetic Defense reaction; deliberately cannot attack |
| 18 | Gravel Giggler | 1/8 | Pebble Toss; False Appearance |
| 18 | Obsidian Shard | 1/4 | Shard with Constitution-save damage rider |
| 19 | Stone Strider | 1 | Slam; Pack Tactics |
| 19 | Quartz Quasher | 2 | Crystal Slam; Constrict; Quartz Armor retaliation |
| 20 | Obsidian Obliterator | 3 | Spike Launch; Obsidian Spikes retaliation |
| 20 | Granite Goliath | 4 | Ground Pound; Granite Guard reaction |
| 21 | Diamond Devastator | 5 | Refractive Ray; Diamond Defense reflection |
| 21 | Obsidian Monolith | 6 | Lava Burst; Obsidian Aura; Siege Monster |
| 22 | Sand Shambler | 3 | Slam; Sandstorm (Recharge 5–6); Sand Form |
| 22 | Gemstone Goliath | 4 | Slam; Prismatic Burst (Recharge 5–6); Prismatic Defense reaction |
| 23 | Obsidian Oaf | 3 | Slam; Shard Spray (Recharge 5–6) |
| 23 | Voidstone Wanderer | 4 | Slam; Void Pull (Recharge 5–6); Aura of Emptiness |
| 24 | Runic Sentinel | 5 | Multiattack; Slam; Hurl Rock (Recharge 5–6); Seismic Stomp (Recharge 6); Cold Iron vulnerability |
| 24 | Earthen Guardian | 4 | Multiattack; Slam; Uproot (Recharge 5–6); Protective Presence; Iron Resilience |
| 25 | Great Iron | 5 | Multiattack; mutable Slam; Hematoferrakinesis (Recharge 6); Emmission; Metallokinetic; Metal Detection |
| 25 | Whirlwind Sand Elemental | 4 | Multiattack; Slam; Whirlwind (Recharge 5–6); Berserk; Clumsy; Elastic Form; Odsand; Sandstorm Aura |
| 26 | Primordial Terra Titan | 7 | Multiattack; Slam; Seismic Shift (every 2 rounds); Primordial Roar bonus action; Earth’s Call healing |

Page 26 also supplies the level-14 **Primordial Geomancy** feature: an action raises a circle of standing stones in a 60-foot radius; up to four Primordial Terra Titans emerge, obey commands, act on the caster's initiative and last one hour or until reduced to 0 HP. The feature recharges after a long rest. The accompanying Gargantuan, Strength-30 stone transformation is a separate caster mode, not a fifth Titan or a new monster entry.

## Important conversion and source-quality points

- **Magnetite Guardian intentionally has no attacks.** Its empty offensive kit is an explicit defensive design, not missing data.
- Reactions written under source traits (Magnetic Defense, Granite Guard and Prismatic Defense) belong in Reactions. Uproot, Hurl Rock and other recharge attacks belong in Actions. Multiattack belongs in Actions once.
- Spell-like attacks printed inside these creature blocks are creature powers; naming them as spell attacks does not establish a standalone spell page or a spell slot cost.
- The existing ruleset's Block and conditions must be applied in a reviewed conversion. Do not discard source-specific escape checks, distances, repeat saves, timings or summon-controller restrictions.
- Several printed HP averages, dice bonuses and ability modifiers disagree. Examples include Moonflyer's HP/dice/Constitution and Crystal Sprite's HP bonus despite Constitution 10. Preserve the source values separately; choose and document any playable correction.
- Great Iron prints CR 5 but 2,300 XP. Its Emmission boosts an attribute by one third; rounding, stacking and changes to current versus maximum HP require explicit decisions. Hematoferrakinesis has permanent HP-loss/healing restrictions and must not be flattened into ordinary damage.
- Whirlwind Sand Elemental's Multiattack refers to the Earthen Guardian by mistake, its Berserk text calls it Whirlwind Shift, and Odsand uses the bottom/top 10% of an attack-damage range without a precise rounding rule. Preserve these source problems for review.
- Runic Sentinel's Seismic Stomp creates a blocking rock ring for 15 seconds, an awkward duration in rounds that requires an explicit conversion.
- Primordial Terra Titan has initiative and reroll bonuses, healing on earth/stone, a grapple-damage trait and repeated-use terrain control. Importing only its Slam would omit most of its kit.

## Summons and material infusions outside the druid list

Six further full statblocks occur outside the additional-elemental list. Total: **32 unique printed full statblocks** in this PDF.

| PDF page | Creature | Printed CR | Archived creation/control source | Original source rules or gaps |
| ---: | --- | ---: | --- | --- |
| 8 | Earth Elemental Servant | 10 | Artificer level 15, Master of the Land | Action plus 3rd-level-or-higher slot; visible unoccupied space within 60 feet; friendly and obeys; 1 hour, 0 HP, or action dismissal; once per long rest. Initiative and command cost unspecified. |
| 59 | Resilient Plant | 0 | Bloomguard, 5th-level spell | Touch a plant, seed worth 100 gp (consumption is not stated). Regeneration 10/turn. Explicitly stationary, no actions, intended as cover/barrier. Instantaneous base duration conflicts with finite higher-slot durations. |
| 60 | Awakened Earth | 5 | Earth's Awakening, 5th-level spell | Range 150 feet; animated ground in 50-foot radius; concentration 1 minute; escape-control Strength check against caster spell DC. Multi-Assault and Slam supplied. Stationary-source note conflicts with burrow speed. |
| 61 | Geochemical Golem | 5 | Geochemical Golem, 5th-level ritual | 10-minute casting, range 30 feet, consumed material mixture worth at least 1,000 gp, concentration 1 hour. Obeys commands; beyond 100 feet follows last command. Higher slots extend duration and remove concentration after the first hour. Page 62 supplies material configurations. |
| 63 | Stone Servant | 4 | Geomorpher's Stone Servant, 5th-level spell | 1-hour casting; touch stone(s) within a 5-foot cube; consumed 500 gp gemstone; until dispelled/0 HP/action dismissal. Beyond 60 feet stops obeying and does nothing. Spell forbids attacks, but creature block includes Slam. |
| 78 | Colossal Sand Golem | 16 | Sandsoverign, 9th-level spell | Spell grants control of sand within 1 mile and an action to form the golem. Spell says instantaneous and permanent inanimate creations; golem duration, limit, command timing, dismissal and concentration are not specified. Creature is explicitly **Huge**, despite its name. |

The source spell title is printed **Sandsoverign**. Its original spell text appears under that title in the separate review section, not as an active current-system spell. Do not silently treat the word Colossal in the creature's name as its mechanical size.

## Material profiles and their contexts

Page 28 is the fighter **Earthwarden**, level-18 **Geomorphic Infusion** and **Geomorphic Bastion**. Page 62 is the **Geochemical Golem's Elemental Infusion** configuration. These are three different numerical applications of twelve named materials, not one interchangeable universal trait list.

The page-28 Bastion is an inanimate stone structure, 10-foot diameter and up to 30 feet tall, lasting 10 minutes or bonus-action dismissal, once per long rest. Its listed radii are aura effects around that class feature, not dragon breath sizes.

| Material | Weapon infusion (p28) | Bastion (p28) | Golem configuration and listed cost (p62) |
| --- | --- | --- | --- |
| Neodrakite | Pull/push metal within 10 feet; holder DC 16 Strength or disarmed | Same, within 20 feet | Pull/push metal within 10 feet; 300 gp. No save, action or movement distance supplied. |
| Cerithal Stone | Strikes create 5-foot-radius difficult terrain | 20-foot-radius difficult terrain | Leaves difficult-terrain trail; 200 gp. Trail width and persistence unspecified. |
| Lanthara Crystal | Bright light 20 feet, dim for 20 more | Illuminates 40-foot radius | +2 AC; 400 gp. |
| Samarkium Ore | Struck target DC 16 Constitution or +1d6 poison and Poisoned until end of its next turn | Within 20 feet, start-of-turn DC 16 Constitution or 1d6 poison and Poisoned for turn | Noxious cloud deals 1d6 poison in 5-foot radius; 250 gp. Trigger and save unspecified. |
| Euralite Gem | Illuminates surroundings, radius unspecified | Illuminates surroundings, radius unspecified | Bright light 20 feet, dim for 20 more; 150 gp. |
| Gadolix Shard | +1d8 fire damage | Within 20 feet, start-of-turn 1d8 fire | Slam gains +1d8 fire; 350 gp. |
| Ytriun Metal | Within 5 feet at start of wielder's turn, 1d6 fire | Within 20 feet, start-of-turn 1d6 fire | Within 5 feet at start of golem's turn, 1d6 fire; 300 gp. |
| Erbion Essence | Once/turn, bonus-action touch heals 1d8 | Allies within 20 feet heal 1d8 at start of turn | Heal self or touched ally 1d8 once per turn; 450 gp. Action cost unspecified. |
| Thulmara Dust | Struck target DC 16 Constitution or speed -10 feet until end of its next turn | Within 20 feet, start-of-turn DC 16 Constitution or speed -10 feet for turn | Enemies within 10 feet slowed by 10 feet until start of golem's next turn; 200 gp. Trigger unspecified. |
| Holmara Rock | +1d6 bludgeoning damage | Allies within 20 feet gain +1 attack and damage | +2 melee attack and damage; 400 gp. |
| Dyspraxium Salt | Once/turn, move incorporeally through objects/creatures as difficult terrain for 10 feet | Allies within 20 feet may do so up to 10 feet once per turn | Temporary incorporeal movement through creatures/objects as difficult terrain; 350 gp. Duration and activation unspecified. |
| Terbithal Resin | Struck target DC 16 Constitution or Blinded until end of its next turn | Enemies within 20 feet, start-of-turn DC 16 Constitution or Blinded for turn | Geochemical Blast blinds on failed Constitution save; 300 gp. DC and duration unspecified. |

Golem mixing on page 62 permits up to two materials with the base casting; total cost is described as the sum of chosen materials. A third material adds 400 gp, and a fourth adds 2,000 gp. The relationship to the spell's minimum consumed 1,000 gp mixture needs clarification. The source does not state whether repeated materials stack.

Page 32 also references **moissanite** in the paladin's **Earth's Embrace**: reaction when the paladin or a creature within 30 feet takes damage, resistance to all damage until the start of the paladin's next turn, attacker suffers half the damage dealt to the protected creature, three uses per short or long rest. This is another material-associated class feature, not a summoned creature or one of the twelve golem configurations.

**Dragon-completion implication:** these source profiles can support material-themed designs, but copying weapon, Bastion or CR-5 golem numbers onto a high-CR dragon is a new adaptation, not recovery of its missing original rules. In particular, Gadolix appears in these tables without a corresponding imported wiki-dragon block; Aetherium Alloy's wiki block is not a thirteenth entry in this twelve-material table.

## Partial creature-like creations

| PDF page | Feature/spell | Existing rules | Missing or conflicting rules |
| ---: | --- | --- | --- |
| 34 | Stone's Illusion (rogue feature) | Action; duplicate in visible unoccupied space within 30 feet; directed movement/actions; cannot attack/cast; crumbles beyond 60 feet | AC, HP, duration, initiative and command cost |
| 57 | Rockplica | Stone duplicate of caster, half caster HP, can take caster's actions, cannot move more than 30 feet from caster | No fixed statblock; requires a caster-derived profile and limits for copied abilities |
| 71 | Thorn Spitter (7th-level spell) | Bonus action, range 20 feet, concentration 1 minute; plant attacks a creature within 60 feet for 4d10 piercing; +1d10 per higher slot | No AC/HP/abilities/attack bonus or save, attack cadence or complete control rules |

## Creature-sounding effects that do not supply a separate monster

- **Nature's Grasp (p56):** an earth spirit appears as part of a restraining spell effect; no independent creature statistics/actions.
- **Gemstone Guardian (p56):** a protective crystal shield, not a guardian creature.
- **Stone Sentinel (p67):** visible unoccupied space within 30 feet; provides half cover; bonus action commands movement up to 30 feet; lasts 8 hours, longer at higher slots. No independent creature statblock.
- **Geode's Gentle Grasp (p48):** barrier object with AC 12 and HP 15 (+5 HP per higher slot); not a creature.
- **Crystal Shard (p55):** crystal object with AC 15, HP 10 and spell reflection; not a creature.
- **Bastion of Bedrock (p55):** fortress object with caster-dependent HP; not a creature.
- **Treetimber (p75):** instantaneous summoned-tree attack for 5d10 bludgeoning; no persistent creature. Attack/save resolution is unspecified.
- **Terrain Shaper (p6)** and **Geomorphic Bastion (p28):** inanimate structures/objects. Sculpted statues and mechanisms do not become creatures merely because they are shaped like one.
- **The Living Mountain (p36):** patron described in lore, no summon procedure or statblock.
- Ordinary conjured pebbles, roots, wind, weapons, armor, terrain and projectiles are spell effects rather than additional summons.

## Transformations and existing-block references

- **Geomorphic Form (p13):** Wild Shape into an earth elemental, CR limited by druid level.
- **Primordial Geomancy (p26):** up to four actual Titan summons plus a separate caster transformation.
- **Elemental Embodiment (p35):** bonus action, standard earth-elemental statistics for 1 minute, retain Intelligence/Wisdom/Charisma/speech, equipment merges, once per long rest. This references an existing earth elemental rather than printing an additional unique block.
- **Colossal Form (p36):** caster's size increases one category, reach +5 feet, Strength +4 (maximum 24), Charisma-based melee attacks/damage, meld into stone, 1 minute, once per long rest. No separate creature.
- **Sand's Shift (p46):** brief defensive transformation into sand, not a creature summon.
- **Dunedash (p60):** caster becomes a whirlwind of sand, gains flight and damage against creatures sharing its space. No separate summoned creature.
- **Geomorph's Transcendance (p67), Stoneform Titan (p74), Nature's Avatar (p76):** caster transformations; audit their own changed statistics, not new monster entries.

**Geomantic Ascendancy (p76)** permits communication with earth elementals/Terran, not a new summon or control procedure. **Genesis (p79)** creates a demiplane, not creatures. **Promethium Portal (p77)** is travel, not a monster summon.

## Page coverage

All 79 physical pages were visually checked: pages 1–13 and 27–38 for class features; pages 14–26 for the additional-elemental blocks; pages 39–79 for spells, material infusions, created objects, copies and transformations. Spell lists were cross-checked against their body pages so a listed summon is not counted twice. This includes negative findings where the word summon only means inanimate rocks, wind or roots.

## Review priorities

1. Import the 32 unique printed blocks with source-page references, keeping intentionally nonattacking designs intact.
2. Offer all 35 converted Homebrewery creatures/templates as standalone monster choices. Keep the complete source spell inventory in its separate review section, preserving original levels and slot scaling for V. to evaluate. A GM or existing effect supplies companion duration and control; the review grants no new current-system spell or class feature.
3. Store the twelve material configurations once per rules context; avoid creating twelve duplicate base golems. Up to four material choices do not imply four simultaneous independent summons.
4. Resolve creature-level conflicts: Stone Servant's noncombat role, Awakened Earth's anchored movement/control, Sand Golem's escape/save/size limits and Geochemical Golem's missing burrow speed. Source-only creating-spell durations and player costs are not part of the standalone creature add-on.
5. Complete the three partial creature-like creations with explicitly documented custom rules or keep them clearly marked as partial. Do not invent offense for the defensive-only Magnetite Guardian or Resilient Plant.
6. Preserve existing current-system spell rules as authoritative during conversion rather than replacing them wholesale with the PDF's older spell-slot/level progression.

