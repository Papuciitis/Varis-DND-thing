"use strict";

// Audited passive effects only. Source prose remains authoritative for conditions,
// active abilities, dice rolls and choices which need another player decision.
(() => {
  const registry = new Map();
  const normalize = value => String(value ?? "").trim().replace(/\s+/g, " ").replace(/[.]$/, "").toLowerCase();
  const key = (parent, feature, option = "") => JSON.stringify([parent, feature, option].map(normalize));
  function add(parent, feature, option, effects) {
    const id = key(parent, feature, option);
    registry.set(id, {...registry.get(id), ...effects});
  }
  const always = (parent, feature, effects) => add(parent, feature, "", effects);
  const equipped = (parent, feature, option, when, effects, upgrades = []) => add(parent, feature, option, {
    equipmentRules: [{source: option || feature, when, effects, upgrades}]
  });
  const physical = amount => ({str: amount, dex: amount, con: amount});
  const mental = amount => ({int: amount, wis: amount, cha: amount});

  // Full racial descriptions seed notes for every option, including those with no
  // passive numeric representation. This literal is generated from repository YAML.
  const racialNotes = [
    ["Shadowling", "Shadowling mark", "", "Reduce your maximum HP by 2."],
    ["Shadowling", "Uncursed", "", "Gain +1 on saves against curses and against necromancy and transmutation spells."],
    ["Shadowling", "Shadowling origin", "Curse-born", "Lose one death save slot. Increase your maximum rest dice by 2 and gain +1 to Arcana checks."],
    ["Shadowling", "Shadowling origin", "Frozen heart", "Gain cold resistance and +1 AC. Take a −1 penalty to Persuasion and Insight checks."],
    ["Shadowling", "Shadowling origin", "Hex experiment survivor", "Increase maximum rest dice by 1. Learn one hex that costs one rest die to cast."],
    ["Shadowling", "Shadowling origin", "Lycanthropy rejection", "Gain advantage on saves against consumables and on scent-based checks. Add +3 to checks to track or pursue a target. Take −1 on mental checks during a full moon or an equivalent event agreed with the GM."],
    ["Shadowling", "Shadowling origin", "Mana contamination", "Increase maximum rest dice by 1. Gain +1 on saves against arcane spells and −1 on saves against disease."],
    ["Shadowling", "Shadowling origin", "Necrotic contamination", "Gain resistance to necrotic and poison damage. Reduce healing received by 1 and increase necrotic damage dealt by 1."],
    ["Shadowling", "Shadowling origin", "Occult birth", "Learn an occult or mystic cantrip, using Constitution to cast it. Learn one additional language."],
    ["Shadowling", "Shadowling origin", "Polymorphic shock", "Increase one physical ability score by 1 at level 1 and whenever you gain a feat or ability score increase. You must attempt saving throws against beneficial transmutation spells too."],
    ["Shadowling", "Shadowling origin", "Rescued by alchemy", "Gain poison and acid resistance and lose 1 maximum HP. Extend potion effects on yourself by 2 of the effect’s original time unit (turns, minutes, or hours)."],
    ["Shadowling", "Shadowling origin", "Saved by order", "Learn an oath cantrip. Cast it with Wisdom and upgrade its casting modifier by 1. The order’s amulet permanently occupies your amulet slot. Attempts to steal it have disadvantage."],
    ["Shadowling", "Shadowling origin", "Severed fate", "Double the Uncursed bonus and apply it to saves against divination and detection spells as well."],
    ["Shadowling", "Shadowling origin", "Shadowling descendant", "Gain one feat, one language proficiency, and one tool proficiency of your choice."],
    ["Shadowling", "Shadowling origin", "Soulblight survivor", "Increase the Uncursed bonus by 1. Gain psychic resistance and take 1 more radiant damage when damaged by it."],
    ["Shadowling", "Shadowling origin", "Vampirism rejection", "Gain darkvision to 60 feet, advantage on hearing-based checks, and +2 Dexterity. You have sunlight sensitivity."],
    ["Shadowling", "Shadowling origin", "Wraith-blooded", "Take −1 on d20 rolls during the day and gain +1 at night. Apply Uncursed to saves against enchantment and divination spells too."],
    ["Human", "Extra Feat", "", "you gain an extra feat at lvl 1."],
    ["Human", "Striving Nature", "", "Once per rest, gain advantage on a d20 roll as a free action."],
    ["Dwarf", "Dwarven traits", "Dwarven Drunkard", "Gain a +1 bonus to strength. Receive a -2 penalty to strength every rest so long as you do not have a drink. You gain a +1 bonus to checks made to start a riot or fight."],
    ["Dwarf", "Dwarven traits", "Dwarven craftsmanship", "Gain a +1d4 bonus to tool checks. Once per long rest, when creating an item, you can increase one of its properties by +1."],
    ["Dwarf", "Dwarven traits", "Dwarven fortitude", "Resistance to poison and advantage on all saves against being poisoned. You gain +1 health per level, including at lvl 1."],
    ["Dwarf", "Dwarven traits", "Dwarven sturdiness", "So long as you have at least 1 rest die, your armor provides you with an additional instance of block at the start of combat."],
    ["Dwarf", "Dwarven traits", "Dwarven table-manners", "Gain a +1 bonus to persuasion, intimidation, and insight checks."],
    ["Dwarf", "Dwarven traits", "Dwarven weapon training", "Gain proficiency with 2 weapon groups of choice. They must be either melee or crossbows."],
    ["Dwarf", "Dwarven traits", "Heavy hauling", "Reduce bulk by 1. Armor does not reduce your movement speed."],
    ["Dwarf", "Dwarven traits", "Ironbeard", "You gain a +1 bonus to AC and block checks while wearing any armor."],
    ["Dwarf", "Dwarven traits", "Tunnel-sighted", "Gain darkvision at a range of 30 feet. Gain a +1d4 bonus to checks made to find hidden passages and doors."],
    ["Dragonborn", "Fire breath", "", "You can spend 1 rest die to breathe fire in a (5 ft + 5 ft per con bonus) cone. Creatures struck must make a dexterity save, taking 1d6 fire damage per proficiency bonus, and 1d6 fire damage per 2 character levels on a failed save, and half damage on a successful one. The DC is equal to 8 + proficiency + CON bonus. After use, you must roll a 1d8 chance die at the start of each subsequent turn, regaining use of the ability on a 2 or lower"],
    ["Dragonborn", "Large lizard", "", "You gain a -1 penalty to AC and have your maximum block reduced by 1. You can wield large agile and light weapons as normal, and can wield large one-handed or versatile weapons that are neither light nor agile as normal two-handed weapons.|<i>(Large weapons have their damage dice size increased by 1 size category.)</i>"],
    ["Dragonborn", "Minor dragonborn traits", "Scaled beast", "You gain damage reduction 1."],
    ["Dragonborn", "Minor dragonborn traits", "Dragon heart", "Your rest dice maximum is increased by 1."],
    ["Dragonborn", "Minor dragonborn traits", "Drake claws", "Your unarmed strikes deal slashing damage. Your unarmed damage dice are increased by 1 size category."],
    ["Dragonborn", "Minor dragonborn traits", "Wyvern shriek", "You can use fire-breath to deal sonic damage to all creatures within a radius equal to fire breath's range + 10 ft. The save for it is changed to con instead."],
    ["Dragonborn", "Minor dragonborn traits", "Draconic aspect", "Choose a damage type: fire, cold, lightning, acid, or poison. Fire breath's damage is increased by 1d6, and half the damage dealt is changed to the chosen damage type. You gain resistance to the chosen damage type."],
    ["Dragonborn", "Minor dragonborn traits", "Serpent eyes", "Gain perfect darkvision, gain a +2 bonus to perception checks, and gain a +2 bonus on checks made to follow tracks and detect hidden creatures"],
    ["elf", "Tracing", "", "Your rest dice maximum is increased by 1."],
    ["elf", "Elven traits", "Arcane intuition", "You learn 1 arcane cantrip of your choice. You use your highest mental ability score as the casting attribute. Upgrade the cantrip in one of the following ways at 1st, 5th, and 9th level: increase any associated duration by 1 turn, increase any associated DC by 1, gain a +1 bonus to any associated attacks, or grant it a new upgrade from its own list."],
    ["elf", "Elven traits", "Attuned form", "You can wear an extra ring and an extra medallion. You gain a +1 bonus to interact with magical items."],
    ["elf", "Elven traits", "Eladrii descendant", "You gain a +1 bonus to strength. You possess horns and thus cannot wear helmets not made for you. You can spend 1 rest die to gain a 1d6 bonus to a strength or dexterity check as a free action."],
    ["elf", "Elven traits", "Fae luck", "You can reroll an ability check or chance dice twice per rest."],
    ["elf", "Elven traits", "Elven marksmanship", "Your ranged attacks add your intelligence modifier to the amount of damage dealt."],
    ["elf", "Elven traits", "Fae-blooded", "You gain a +2 bonus to charisma. You can use charisma for your nature checks."],
    ["elf", "Elven traits", "Heavy soul", "You gain a +1d6 bonus to saves made against necromancy, transmutation, enchantment, and illusion type magical spells and abilities."],
    ["elf", "Elven traits", "Moon-blooded", "You can see perfectly in the dark, and your rest dice maximum is increased by 1."],
    ["elf", "Elven traits", "Noble-line", "Gain proficiency with two weapon groups of choice. Learn an extra language. Gain proficiency with a tool, game set, and instrument of choice. Gain a +1 bonus to persuasion. Learn a divination, illusion, or enchantment cantrip and use charisma as the casting modifier."],
    ["elf", "Elven traits", "Outcast house descendant", "You gain proficiency with 2 skills of choice, 1 weapon group, and with 1 tool. Learn a minor hex and upgrade it once upon reaching 2nd character level."],
    ["elf", "Elven traits", "Shadow-lineage", "You gain proficiency with all agile weapons. You can use dexterity as the casting modifier in place of charisma or intelligence for cantrips, spells, scrolls, and wands. Gain 160 ft of darkvision."],
    ["elf", "Elven traits", "Sun-blooded", "You gain +4 max HP. The DC of your spells and the block dc of your attacks is increased by 1. Healing you give and receive is increased by 1."],
    ["elf", "Elven traits", "Tiefling", "You have small horns and cannot wear helmets not specifically made for you. Learn an occult cantrip of choice. Use your int or charisma as the casting modifier. Upgrade the cantrip in one of the following ways, twice: deal an extra 1d4 damage if it deals damage, reduce casting time from an action to a bonus action, reduce casting time from a bonus action to a move action, or double its range."],
    ["Firbolg", "Gentle giant", "", "You gain a -1 penalty to AC and 1 less base block from dex (min 0.) You can wield large one-handed weapons as though they were two-handed medium weapons. <i>(large weapons have their damage dice size increased by 1 size category.)</i>"],
    ["Firbolg", "Firbolg traits", "Very hearty", "You gain +2 health per level, including at lvl 1."],
    ["Firbolg", "Firbolg traits", "Know other", "You can spend 1 rest die to gain a +5 bonus to an insight check."],
    ["Firbolg", "Firbolg traits", "Homebuilder", "Your ability scores gain a +2 bonus only during rests. You gain 1 free rest die to use for rest activities every rest."],
    ["Firbolg", "Firbolg traits", "Lumbering giant", "Your rest dice maximum is increased by 1. You have 1 extra death save slot. You gain a +1 bonus to strength. Your movement speed is reduced by 5 feet."],
    ["Ginasi", "Elemental affinity", "", "Choose an energy type from the following: fire, cold, lightning, or sonic. You gain resistance to the damage type of choice. You can be healed by spells that heal elementals."],
    ["Ginasi", "Ginasi lineage", "Distant descendant", "Gain an extra feat at 1st level."],
    ["Ginasi", "Ginasi lineage", "Enchanted birth", "At lvl 1, you have 1 elemental magic point (EMP.) At 1/3/5/7 character lvl you gain a new upgrade: At lvl 1 - Learn a cantrip and lvl 1 spell of choice. At lvl 3/5/7 you learn an extra lvl 1/2/3 spell, accordingly. Casting these spells requires expending existing spell slots or spell points from classes, by spending 2 rest dice per level of the spell, or by spending 1 elemental magic point per level of the spell. You gain +1 max EMP at 2/4/6 lvl increase max EMP by 1. You regain up to 2 EMP per rest."],
    ["Ginasi", "Ginasi lineage", "Native elemental descendant", "Gain immunity to your elemental affinity type. Gain 120 ft of darkvision. Gain a +1 bonus to 3 saves of choice."],
    ["Ginasi", "Ginasi lineage", "Pactborn", "You gain +1 rest die."],
    ["Ginasi", "Ginasi lineage", "Stoneborn", "Your max HP is increased by 5. You gain +1 block at the start of combat."],
    ["Ginasi", "Ginasi lineage", "Temple guardian elemental", "your melee attacks deal an extra 1d4 damage of the type chosen in elemental affinity."],
    ["Ginasi", "Ginasi lineage", "Emberborn", "You gain a number of elemental magic (EMP) points equal to your CHA bonus +2 (min 1.) You regain all EMP during a long rest. You can spend 1 EMP in place of a bonus action or movement action. You cannot spend more than 1 per turn."],
    ["Ginasi", "Ginasi lineage", "Dual-elemental", "Choose a second elemental affinity."],
    ["Griphir", "Large talons", "", "you can wield large light or agile weapons as though they were medium. You can treat heavy shields as light shields. You cannot wear boots, but you have two extra ring slots (Large weapons have their damage dice size increased by 1 size category.)"],
    ["Griphir", "Griphir host", "The griphon lord", "Your appearance is more that of a brown, wide-beaked griphon. You gain +1 max HP per level, and your rest dice maximum is increased by 1."],
    ["Griphir", "Griphir host", "The crowfather", "Your appearance is more like that of a dark red-eyed crow. You gain a +1 bonus to arcana, investigation, and insight checks. You gain a +2 bonus on checks made to interact with magical items, runes, and arcane devices."],
    ["Griphir", "Griphir host", "The morning-caller", "Your appearance is more that of a rooster or cockatrice-headed being with white or gray feathers. You can heal an extra 1d10 health and restore 1 extra rest die every rest. Your unarmed attacks deal an extra 1d6 slashing damage."],
    ["Griphir", "Griphir host", "The serpent-slayer", "Your appearance is more that of a hawk-beaked being. You can wield non-light and non-agile large one-handed or versatile weapons as though they were light one-handed weapons or two-handed weapons respectively. You gain +1 block at the start of combat."],
    ["Griphir", "Griphir host", "The songbird", "Your appearance is softer and that of a songbird, and you are small enough to have your size changed to medium. You gain a +1 bonus to charisma and dexterity."],
    ["Griphir", "Griphir host", "The Stargazer", "Your appearance is more owl-like. Gain 120 ft of darkvision. You gain a +1 bonus to wisdom. You gain a +1 bonus to saves vs spells and magical effects."],
    ["Half-elf", "Talented", "", "You gain three talent dice: 1d3, 1d4, and 1d6. You can add one talent die to a roll you perform as a free action by expending it, adding its result to the roll. You regain all talent dice every rest."],
    ["Half-orc", "Minor Half-Orc traits", "Civilized clan", "Gain proficiency with a skill and language of choice."],
    ["Half-orc", "Minor Half-Orc traits", "Dark sight", "You gain 120 ft of darkvision."],
    ["Half-orc", "Minor Half-Orc traits", "Fearless", "You gain advantage on all saves made against fear and terror effects. If another effect would also grant you advantage against a fear effect, roll an extra d20."],
    ["Half-orc", "Minor Half-Orc traits", "Fighting spirit", "Once per long rest, you can spend a rest die when being reduced to 0 HP. If you choose to do so, you are instead reduced to 1 HP."],
    ["Half-orc", "Minor Half-Orc traits", "Half-orc fortitude", "Gain a +2 bonus to constitution saves and rolls."],
    ["Half-orc", "Minor Half-Orc traits", "Nocturnal", "Gain a +1 bonus to skill checks that you are proficient with at night or in darkness."],
    ["Half-orc", "Minor Half-Orc traits", "Snout", "Gain the strong scent ability. You gain advantage on all perception and investigation checks involving smell."],
    ["Half-orc", "Minor Half-Orc traits", "Stubborn", "Once per rest, you can spend a rest die when rolling any d20 check with disadvantage to reroll the lowest die."],
    ["Half-orc", "Minor Half-Orc traits", "Tough hide", "Reduce all incoming damage by 1."],
    ["Half-orc", "Minor Half-Orc traits", "Wandering clan", "You learn 2 languages and gain a +1d4 bonus to survival checks."],
    ["Half-orc", "Minor Half-Orc traits", "Ogblood descendant", "Gain sharp teeth and a bite attack, dealing 2d3 + CON damage. Gain a -1 penalty to mental saves vs spells, gain a +1 bonus to STR and CON."],
    ["Half-orc", "Minor Half-Orc traits", "Warrior clan", "Gain proficiency with a two-handed weapon, a light weapon, a reach weapon, a ranged weapon, a thrown weapon, and a shield of choice."],
    ["Half-orc", "Minor Half-Orc traits", "Runebreaker rage", "Once per rest, you may spend 1d3 rest dice to make an anger roll (<i>roll 1d20 + your CON bonus + your STR bonus + proficiency bonus</i>) in place of a STR/CON/WIS/CHA save vs a spell. If the rest dice roll exceeds available rest dice, lose all rest dice and take 2d4 damage to fatigue."],
    ["Kobold", "Kobold frailty", "", "Gain 1 less max HP per level. This cannot reduce health gain below 1."],
    ["Kobold", "Minor kobold traits", "Kobold skittering", "Your movement speed is increased by 15."],
    ["Kobold", "Minor kobold traits", "Prehensile tail", "You can always hold on to one object with your tail. You can slap a creature with your tail or attack with a light one-handed weapon it is carrying as a bonus action. A simple slap deals 1 + dexterity bonus damage."],
    ["Kobold", "Minor kobold traits", "Scaled", "You add your constitution bonus to death saving throws. If a critical hit would reduce you to 0 health, it instead reduces you to 1."],
    ["Kobold", "Minor kobold traits", "Scavenger belly", "You cannot be sickened or poisoned, and you take 1 less poison and acid damage"],
    ["Kobold", "Minor kobold traits", "Small and swift", "Gain a +1 bonus to AC, dexterity saves, and stealth checks."],
    ["Kobold", "Minor kobold traits", "Snake fangs", "You can spend a rest die to bite a creature as an action. Make a melee attack, dealing 1d4 + your con bonus piercing damage and 1d4 + your con bonus poison damage. The target must make a constitution save vs a DC of 8 + your proficiency + your constitution bonus. On a failure, they become poisoned for 1 minute."],
    ["Kobold", "Minor kobold traits", "Thieving kobold", "You gain a +1d4 bonus to sleight of hand checks made to steal. Nocturnal sight — You have 120 feet of darkvision."],
    ["Gnome", "Minor gnome traits", "Aura", "Gain a +1d3 bonus to saves vs spells and magic."],
    ["Gnome", "Minor gnome traits", "Bound wisp", "You gain a companion wisp that has a float speed of 40 ft, 1 HP, and can reach up to 40 ft from you. It can carry objects weighing up to 5 pounds, can illuminate up to a 30 ft sphere, and can grant you a +1 bonus to push, climb, and pull checks. It recorporates near you each morning when destroyed, dispelled, or somehow discorporated."],
    ["Gnome", "Minor gnome traits", "Changeling", "Appear slightly more as a dwarf, human, half-elf, or ginasi. You gain a +1d4 bonus to checks made to pass as a youth of that race. You gain an extra language and skill proficiency."],
    ["Gnome", "Minor gnome traits", "Discorporate", "While not damaged since your past turn and not shocked, sickened, or distracted, you can spend 2 rest dice as an action to discorporate, becoming ethereal and invisible for 1d4+1 rounds."],
    ["Gnome", "Minor gnome traits", "Dream tracing", "You may choose to meditate all rest, taking no rest dice action, regaining 2 rest dice at the end of the rest period."],
    ["Gnome", "Minor gnome traits", "Elder gnome descendant", "Every magical item that uses charges has an extra charge for use just by you that is restored every rest."],
    ["Gnome", "Minor gnome traits", "Jynx", "up to 5 times per long rest, you can reroll a d20 or a chance die roll. This is separate from odd luck."],
    ["Gnome", "Minor gnome traits", "Lifegiver", "You can spend a rest die to heal a creature for 1d4 + wisdom bonus health, or to cause a small plant or fruit to grow and mature."],
    ["Gnome", "Minor gnome traits", "Lucky", "You can use odd luck twice per rest."],
    ["Gnome", "Minor gnome traits", "Magical gift", "Learn a cantrip or lesser hex of choice. Use wisdom as the casting modifier."],
    ["Gnome", "Minor gnome traits", "Normalized", "You appear more humanlike. Gain resistance to psychic damage."],
    ["Gnome", "Minor gnome traits", "Partial nondetection", "Creatures have a -2 penalty to checks made to find or detect you, both magically and via mundane means."],
    ["Gnome", "Minor gnome traits", "Paternal gift-rune", "Choose a one-handed weapon, gain proficiency with it. It is bound to you and can be recalled as a bonus action. Your arm bears a mark of this. The bound weapon can be exchanged at a cost of 3 rest dice during a rest."],
    ["Gnome", "Minor gnome traits", "Small and swift", "Gain a +1 bonus to AC. Increase movement speed by 5 ft."],
    ["Gnome", "Minor gnome traits", "Strange attunement", "You gain an extra ring slot."],
    ["Gnome", "Minor gnome traits", "Strange senses", "You can spend a rest die as a full round action to feel the world around you, gaining knowledge of the following: How many creatures are within 500 ft, and how many of them are undead, aberrations, beasts, monstrosities, eldritch entities, or fiends. Gain a +1 bonus to perception checks."],
    ["Goblin", "Hopeless", "", "Goblins have a -1 penalty to intimidation, persuasion, and insight checks."],
    ["Goblin", "Minor goblin traits", "Beyond reason", "Once per long rest you can reroll any roll resulting in a natural 1."],
    ["Goblin", "Minor goblin traits", "Big eyes", "Gain 60 feet of darkvision, and a +1 bonus to one of perception, investigation, or insight."],
    ["Goblin", "Minor goblin traits", "Civilized", "Gain proficiency with a tool and skill of choice. Reduce your hopeless persuasion penalty to only -1."],
    ["Goblin", "Minor goblin traits", "Clawed", "Your unarmed attacks deal an extra 2 slashing damage."],
    ["Goblin", "Minor goblin traits", "Punching bag", "When receiving a critical hit, you can choose to reduce the damage by half and take 1d3 damage to fatigue."],
    ["Goblin", "Minor goblin traits", "Tag along", "You learn an extra 2 languages but speak them like a goblin would. Gain a +1 bonus to deception."],
    ["Goblin", "Minor goblin traits", "Tantrum", "You can spend 1 rest die to gain a +1 bonus to attacks and damage, and -1 to all other rolls for 1d6 hours, or until you fall unconscious."],
    ["Goblin", "Minor goblin traits", "Twitchy", "Gain an extra reaction."],
    ["Goblin", "Minor goblin traits", "Underling", "Your rest dice maximum is increased by 1. You can spend 2 rest dice once per rest to remove any penalties or disadvantages on a roll you are making."],
    ["Relic", "Relic traits", "", " You are immune to poison, bleed, sleep effects, paralysis, disease, and necromancy effects. You have resistance to cold, and psychic damage. You do not eat, sleep, or breathe. You cannot be raised or resurrected. +13 max HP, +1 max HP per level, including at lvl 1. Cannot be healed by magic, unless it specifically heals constructs or objects. Immune to potion effects, unless they specifically interact with constructs. "],
    ["Relic", "Relic downside", "fading spark", "You must now sleep and exhaust from sleeplessness as normal. You are not immune to sleep. -1 to mental saves."],
    ["Relic", "Relic downside", "extensive wear", "-1 to physical saves. -8 max HP."],
    ["Relic", "Relic downside", "air-dependence", "You must breathe like normal, can hold your breath like normal, and become paralyzed while without air. You lose resistance to cold damage."],
    ["Relic", "Relic downside", "cracked core", "You gain a -1 penalty to wisdom and charisma based skill checks. Your rest dice maximum is reduced by 1."],
    ["Relic", "Relic downside", "heavy frame", "You gain 3 bulk and your movement speed is reduced by 5 ft."],
    ["Relic", "Relic downside", "interference", "You lose resistance to psychic damage. You may spend a rest die to speak in a local language of choice for up to 1 minute."],
    ["Relic", "Relic aspect", "Armored core", "You gain a +2 bonus to AC and gain 1 temporary block at the start of combat, which lasts until the end of combat."],
    ["Relic", "Relic aspect", "Arcane augmentation", "Learn an arcane or occult cantrip. It uses your constitution as the casting modifier. Spells that heal elementals also heal you."],
    ["Relic", "Relic aspect", "Runic failsafes", "You may maintain up to 3 emergency runes every long rest. An emergency rune can be spent as a reaction to taking damage to heal 4d4+4 HP."],
    ["Relic", "Relic aspect", "Golemancy shell", "Your movement speed is reduced by 5 ft. You gain a +2 bonus to STR and CON."],
    ["Relic", "Relic aspect", "Alchemical engine", "You may consume alchemical beneficial potions that do not deal damage, healing 1d4 HP per potion and restoring 1 fatigue."],
    ["Relic", "Relic aspect", "Submariner", "Your movement speed is reduced by 5 ft. You gain a +2 bonus to INT and WIS, having had a long time to think."],
    ["Relic", "Relic aspect", "Entombed soul", "You gain a +2 bonus to CHA. Your rest dice maximum is increased by 1."]
  ];
  for (const [parent, feature, option, notes] of racialNotes) add(parent, feature, option, {notes});

  // data/races.yml. Ability increases in attribute_bonuses are handled by the
  // builder's separate ability choices and are deliberately absent here.
  add("Dwarf", "Dwarven traits", "Dwarven Drunkard", {abilities: {str: 1}});
  add("Dwarf", "Dwarven traits", "Dwarven fortitude", {hpPerLevel: 1, resistances: ["poison"]});
  add("Dwarf", "Dwarven traits", "Dwarven table-manners", {skillBonuses: {Persuasion: 1, Intimidation: 1, Insight: 1}});
  always("Dragonborn", "Large lizard", {ac: -1, block: -1});
  add("Dragonborn", "Minor dragonborn traits", "Scaled beast", {reductions: {all: 1}});
  add("Dragonborn", "Minor dragonborn traits", "Dragon heart", {restDice: 1});
  add("Dragonborn", "Minor dragonborn traits", "Serpent eyes", {skillBonuses: {Perception: 2}});
  always("elf", "Tracing", {restDice: 1});
  add("elf", "Elven traits", "Eladrii descendant", {abilities: {str: 1}});
  add("elf", "Elven traits", "Fae-blooded", {abilities: {cha: 2}});
  add("elf", "Elven traits", "Moon-blooded", {restDice: 1});
  add("elf", "Elven traits", "Noble-line", {skillBonuses: {Persuasion: 1}});
  add("elf", "Elven traits", "Sun-blooded", {hpFlat: 4});
  always("Firbolg", "Gentle giant", {ac: -1, dexBlock: -1});
  add("Firbolg", "Firbolg traits", "Very hearty", {hpPerLevel: 2});
  add("Firbolg", "Firbolg traits", "Lumbering giant", {restDice: 1, deathSaveSlots: 1, abilities: {str: 1}, speed: -5});
  add("Ginasi", "Ginasi lineage", "Pactborn", {restDice: 1});
  add("Ginasi", "Ginasi lineage", "Stoneborn", {hpFlat: 5, combatBlock: 1});
  add("Griphir", "Griphir host", "The griphon lord", {hpPerLevel: 1, restDice: 1});
  add("Griphir", "Griphir host", "The crowfather", {skillBonuses: {Arcana: 1, Investigation: 1, Insight: 1}});
  add("Griphir", "Griphir host", "The serpent-slayer", {combatBlock: 1});
  add("Griphir", "Griphir host", "The songbird", {abilities: {cha: 1, dex: 1}});
  add("Griphir", "Griphir host", "The Stargazer", {abilities: {wis: 1}});
  add("Half-orc", "Minor Half-Orc traits", "Half-orc fortitude", {saveBonuses: {con: 2}});
  add("Half-orc", "Minor Half-OrC traits", "Tough hide", {reductions: {all: 1}});
  add("Half-orc", "Minor Half-Orc traits", "Ogblood descendant", {abilities: {str: 1, con: 1}});
  always("Kobold", "Kobold frailty", {hpPerLevel: -1});
  add("Kobold", "Minor kobold traits", "Kobold skittering", {speed: 15});
  add("Kobold", "Minor kobold traits", "Scavenger belly", {immunities: ["sickened", "poisoned"], reductions: {poison: 1, acid: 1}});
  add("Kobold", "Minor kobold traits", "Small and swift", {ac: 1, saveBonuses: {dex: 1}, skillBonuses: {Stealth: 1}});
  add("Gnome", "Minor gnome traits", "Normalized", {resistances: ["psychic"]});
  add("Gnome", "Minor gnome traits", "Small and swift", {ac: 1, speed: 5});
  add("Gnome", "Minor gnome traits", "Strange senses", {skillBonuses: {Perception: 1}});
  always("Goblin", "Hopeless", {skillBonuses: {Intimidation: -1, Persuasion: -1, Insight: -1}});
  add("Goblin", "Minor goblin traits", "Tag along", {skillBonuses: {Deception: 1}});
  add("Goblin", "Minor goblin traits", "Underling", {restDice: 1});
  always("Relic", "Relic traits", {
    hpFlat: 13, hpPerLevel: 1, resistances: ["cold", "psychic"],
    immunities: ["poison", "bleed", "sleep", "paralysis", "disease", "necromancy"]
  });
  add("Relic", "Relic downside", "fading spark", {saveBonuses: mental(-1), removeImmunities: ["sleep"]});
  add("Relic", "Relic downside", "extensive wear", {saveBonuses: physical(-1), hpFlat: -8});
  add("Relic", "Relic downside", "air-dependence", {removeResistances: ["cold"]});
  add("Relic", "Relic downside", "cracked core", {
    restDice: -1,
    abilitySkillBonuses: {wis: -1, cha: -1}
  });
  add("Relic", "Relic downside", "heavy frame", {speed: -5});
  add("Relic", "Relic downside", "interference", {removeResistances: ["psychic"]});
  add("Relic", "Relic aspect", "Armored core", {ac: 2, combatTempBlock: 1});
  add("Relic", "Relic aspect", "Golemancy shell", {speed: -5, abilities: {str: 2, con: 2}});
  add("Relic", "Relic aspect", "Submariner", {speed: -5, abilities: {int: 2, wis: 2}});
  add("Relic", "Relic aspect", "Entombed soul", {abilities: {cha: 2}, restDice: 1});

  // data/draft-reference/shadowling.yaml.
  always("Shadowling", "Shadowling mark", {hpFlat: -2});
  add("Shadowling", "Shadowling origin", "Curse-born", {deathSaveSlots: -1, restDice: 2, skillBonuses: {Arcana: 1}});
  add("Shadowling", "Shadowling origin", "Frozen heart", {resistances: ["cold"], ac: 1, skillBonuses: {Persuasion: -1, Insight: -1}});
  add("Shadowling", "Shadowling origin", "Hex experiment survivor", {restDice: 1});
  add("Shadowling", "Shadowling origin", "Mana contamination", {restDice: 1});
  add("Shadowling", "Shadowling origin", "Necrotic contamination", {resistances: ["necrotic", "poison"]});
  add("Shadowling", "Shadowling origin", "Rescued by alchemy", {resistances: ["poison", "acid"], hpFlat: -1});
  add("Shadowling", "Shadowling origin", "Soulblight survivor", {resistances: ["psychic"]});
  add("Shadowling", "Shadowling origin", "Vampirism rejection", {abilities: {dex: 2}});

  // data/class_occultist.yaml. The literal option text also avoids confusing
  // physical/mental saves with the conditional spell-only save modifiers.
  const occultMarks = {
    "-5 ft movement speed": {speed: -5},
    "-1 to weapon attack rolls": {weaponAttack: -1},
    "-1 to spell attack rolls": {spellAttack: -1},
    "-1 to AC": {ac: -1},
    "-1 to physical saves": {saveBonuses: physical(-1)},
    "-1 to mental saves": {saveBonuses: mental(-1)},
    "Your rest dice maximum is increased by 2.": {restDice: 2},
    "+2 max occult slots.": {notes: "+2 maximum occult slots."}
  };
  for (const [name, effect] of Object.entries(occultMarks)) add("Occultist", "Mark & reward", name, effect);

  // data/draft-classes. Equipment conditions use explicit rules below; active
  // powers, rolled increases and unreviewed conditions remain in the source text.
  always("Alchemist", "Extra rest dice", {restDice: 2});
  always("Barbarian", "Endurance", {hpPerLevel: 1});
  add("Barbarian", "Barbarian traits", "Stamina", {restDice: 1});
  add("Barbarian", "Barbarian traits", "Tough hide", {hpFlat: 9});
  add("Bard", "Bardic traits", "Presence", {restDice: 1});
  add("Bard", "Bardic traits", "The unbearable weight of massive talent", {hpFlat: -1});
  add("Bard", "Bardic traits", "Will eat anything", {hpFlat: 2});
  add("Druid", "Druid circle", "The pursuit of wisdom", {abilities: {wis: 2}});
  add("Druid", "Druid circle", "Lore keeper", {abilitySkillBonuses: {int: 1}});
  add("Druid", "Druid circle", "Meditative", {restDice: 1});
  add("Fighter", "Fighting skills", "Survival training", {skillBonuses: {Nature: 1, Survival: 1, Stealth: 1, Perception: 1}});
  add("Fighter", "Fighting skills", "Conditioning", {saveBonuses: physical(1)});
  add("Fighter", "Fighting skills", "Fortified will", {saveBonuses: {wis: 2}});
  add("Fighter", "Fighting skills", "Pain tolerance", {reductions: {all: 1}});
  add("Fighter", "Fighting skills", "Charge tactics", {speed: 10});
  add("Fighter", "Fighting skills", "Sigil training", {skillBonuses: {Arcana: 1}});
  add("Fighter", "Fighting skills", "Tactical preparation", {restDice: 1});
  equipped("Fighter", "Fighting skills", "Armor training", "armor", {ac: 1});
  equipped("Fighter", "Fighting skills", "Heavy armor training", "medium-or-heavy-armor", {armorBlock: 1});
  add("Fighter", "Fighting skills", "Weight shifting", {armorBulkReduction: 1});
  add("Fighter", "Fighting skills", "Pack mule", {armorBulkReduction: 1});
  add("Fighter", "Fighting skills", "Armored sprint", {armorSlowReduction: 1});
  equipped("Fighter", "Fighting skills", "Defensive training", "shield", {blockCheck: 2});
  add("Fighter", "Fighting skills", "Self defense training", {equipmentRules: [
    {source: "Self defense training", when: "no-weapons-or-shield", effects: {ac: 1, blockCheck: 1}},
    {source: "Self defense training", when: "weapons-or-shield", effects: {combatBlock: 1}}
  ]});
  equipped("Dwarf", "Dwarven traits", "Ironbeard", "armor", {ac: 1, blockCheck: 1});
  equipped("Dwarf", "Dwarven traits", "Dwarven sturdiness", "armor-and-rest-dice", {armorBlock: 1});
  add("Dwarf", "Dwarven traits", "Heavy hauling", {armorBulkReduction: 1, ignoreArmorSlow: 1});
  equipped("Barbarian", "Barbarian traits", "Barbarian king", "light-or-no-armor", {ac: 1}, [
    {level: 5, effects: {ac: 1}}, {level: 9, effects: {ac: 1}}
  ]);
  equipped("Bard", "Bardic traits", "Martial skill", "light-or-no-armor", {combatBlock: 1});
  equipped("Monk", "Monk training", "Shifting step discipline", "no-armor", {ac: 1, speed: 10});
  always("Shield bearer", "Bulwark", {combatBlock: 1});
  equipped("Shield bearer", "Bulwark", "", "shield", {ac: 1, strSave: 1, dexSave: 1});
  add("Fighter", "Fighting skills", "Blood infusion", {notes: "Roll 1d10 once for the maximum HP increase; no fixed amount is specified."});
  always("Monk", "Extra rest dice", {restDice: 1});
  add("Monk", "Pursuant of the ways", "Dark teachings", {reductions: {psychic: 1, necrotic: 1}});
  add("Monk", "Pursuant of the ways", "Devotion", {abilities: {con: 2}});
  add("Monk", "Pursuant of the ways", "Tonal arts", {reductions: {sonic: 1}});
  add("Monk", "Pursuant of the ways", "Way of wind", {speed: 10});
  add("Monk", "Pursuant of the ways", "Way of the mountain", {restDice: 1});
  add("Monk", "Monk training", "Strength training", {abilities: {str: 2}, saves: {str: true}});
  add("Monk", "Monk training", "Tempered endurance", {restDice: 2, hpFlat: 4});
  add("Ranger", "Ranger training", "Keen will", {saveBonuses: {wis: 1}});
  add("Rogue", "Cunning", "Daring fool", {abilities: {wis: -1}});
  add("Rogue", "Cunning", "Play dumb", {abilities: {int: 1}});
  add("Rogue", "Cunning", "Swift on your feet", {speed: 5});
  add("Sorcerer", "Innate magic", "Arcane intuition", {abilities: {str: -1}, skillBonuses: {Arcana: 1}});
  add("Sorcerer", "Innate magic", "Blood-infused", {abilities: {con: 1}, skillBonuses: {Medicine: 1}, initiative: 1});
  add("Sorcerer", "Innate magic", "Determination", {hpFlat: -2});
  add("Sorcerer", "Innate magic", "Elder blood", {restDice: 1});
  add("Sorcerer", "Innate magic", "Elemental soul", {abilities: {wis: -1}, reductions: {fire: 1, cold: 1, lightning: 1, acid: 1, sonic: 1}});
  add("Sorcerer", "Innate magic", "Odd aura", {skillBonuses: {"Animal Handling": -3}});
  add("Sorcerer", "Innate magic", "Serpentine blood", {abilities: {dex: 1}, skillBonuses: {Persuasion: -1}});
  add("Sorcerer", "Innate magic", "Arcane ascension", {abilities: {con: -1}});

  // Archetype features with a fixed unconditional effect. Their unlock levels are
  // supplied by character metadata, rather than inferred again in this registry.
  always("Soulstone alchemist", "The cost of knowledge", {hpFlat: -1, deathSaveSlots: -1});
  always("Healer", "Hope", {restDice: 1});
  always("Pilgrim", "In search of", {skillBonuses: {History: 2, Religion: 2, Insight: 2}});
  always("Pilgrim", "Extra rest dice", {restDice: 1});
  always("Oathspeaker", "Read the lore", {skillBonuses: {History: 1, Religion: 1, Arcana: 1, Medicine: 1}});
  always("White priest", "Sacred power", {restDice: 3});
  always("Seer", "Seer mysticism", {restDice: 1});
  always("Guardian", "Enduring", {hpPerLevel: 3});
  always("Bannerlord", "Lead into battle", {initiative: 5, notes: "+1 to all d20 rolls applies only while first in initiative order."});
  always("Champion", "Inner strength", {restDice: 3, hpFlat: 12, notes: "Also grants +1 to all d20 rolls."});
  always("Martial artist", "Mastered form", {abilities: {str: 1, dex: 1, con: 1}});
  always("Brawler", "Brawlers strength", {restDice: 2});
  always("Ascendant", "Higher form", {restDice: 1});
  always("Ascendant", "Clear spirit", {restDice: 1});
  always("Sensei", "Heightened senses", {speed: 5, notes: "Also +1d3 to Perception and Insight checks; the bonus is rolled."});
  always("Sensei", "Extra rest dice", {restDice: 1});
  always("Wanderer", "Brisk", {speed: 10});
  always("Bounty hunter", "Loose ends, rumors, and connections", {skillBonuses: {Insight: 1, Perception: 1, Investigation: 1}});
  always("Shadow", "Shadow step", {speed: 5});
  always("Brigand", "Wild criminality", {skillBonuses: {Intimidation: 2, "Sleight of Hand": 2, Athletics: 2, Stealth: 2}});
  always("Brigand", "Looter", {skillBonuses: {Investigation: 1}});
  always("Brigand", "Notoriety", {skillBonuses: {Deception: -1, Intimidation: 1, "Sleight of Hand": 1, Athletics: 1, Stealth: 1}});
  always("Warmage", "Power training", {restDice: 1});

  function benefitOptions(entry) {
    if(entry.name==='Occult gnosis')return {count:2,options:[['spell','Learn a 1st-level oath or arcane spell'],['occult-slot','One extra maximum occult slot'],['death-bonus','+2 to death saving throws'],['rest-die','One extra maximum rest die']]};
    if(entry.name==='Madness magick')return {count:1,note:'Confirm this after the next new spell or cantrip has been lost as the feat requires.',options:[['learning-sacrifice','Next spell/cantrip learning sacrificed (+2 maximum rest dice)']]};
    if(entry.name==='Mana-refusal')return {count:3,note:'Record these after resolving the cantrip sacrifice and the feat’s upgrade allowance. The defensive option also costs 2 maximum HP.',options:[['cantrip-sacrifice','Required arcane/occult cantrip permanently sacrificed'],['defensive-rest','Defensive upgrade: −2 HP, extra death-save slot, +1 rest die'],['spell-sacrifice','Level-1 spell permanently sacrificed for +2 rest dice']]};
    return null;
  }

  function restDice(character,derived) {
    if(!derived.enabled)return {maximum:character.restDice.max,breakdown:[{label:'Manual maximum',amount:character.restDice.max}],deathSaveDelta:0,hpDelta:0,occultExtra:0,deathSaveBonus:0};
    const health=character.build.health,base=health.restMode==='manual'?health.baseRestDice:character.level;
    const breakdown=[{label:health.restMode==='manual'?'Manual base':'Character level',amount:base}];
    let minimum=0,deathSaveDelta=0,hpDelta=0,occultExtra=0,deathSaveBonus=0;
    const warnings=[];
    const text=value=>typeof value==='string'?value:Array.isArray(value)?value.map(text).join('\n'):value?.description || value?.desc || '';
    function addRule(label,raw,fallback=0,allowOath=false,includeLists=false,sourceLevel=character.level) {
      const own=includeLists?text(raw):text(raw).split(/\n\s*\*/)[0];
      const subject='(?:rest dice maximum|(?:maximum|max) (?:number of )?rest dice)(?: count)?';
      const patterns=[new RegExp('\\b(?:your )?'+subject+'(?: is| are)? (?:further )?(increased|increase|increases|reduced|decreased) by (\\d+)','gi'),new RegExp('\\b(increase|reduce|decrease) (?:your )?'+subject+' by (\\d+)','gi'),new RegExp('([+-]\\d+) (?:bonus to (?:your )?)?'+subject,'gi'),new RegExp('\\b(?:you )?(?:gain|have) (\\d+) (less|fewer|more) '+subject,'gi'),/\b(?:you )?gain an? extra rest die\b/gi];
      let amount=0,found=false;
      for(let index=0;index<patterns.length;index++)for(const match of own.matchAll(patterns[index])) {
        const sentence=own.slice(0,match.index).split(/[.!?]\s+|\n/).at(-1);
        if(/\b(?:if|unless|may|choose|instead|when|while|during|until)\b|on a success/i.test(sentence) || !allowOath && /so long as/i.test(sentence))continue;
        const level=sentence.match(/(?:at|reaching) (\d+)(?:st|nd|rd|th)? level/i);if(level && sourceLevel<Number(level[1]))continue;
        amount+=index<2?(/^reduc|^decreas/i.test(match[1])?-1:1)*Number(match[2]):index===2?Number(match[1]):index===3?(/less|fewer/i.test(match[2])?-1:1)*Number(match[1]):1;found=true;
      }
      if(!found)amount=fallback;
      if(amount)breakdown.push({label,amount});
      if(/cannot reduce.*below 1/i.test(own))minimum=1;
    }
    for(const feature of derived.features) {
      if(feature.automation || feature.automationId || derived.featPlan?.specs?.[feature.id]?.automation)continue;
      if(feature.parent==='Feat') {
        const specification=benefitOptions(feature),benefits=new Set((character.build.featBenefits?.[feature.entryId] || []).filter(key=>specification?.options.some(([value])=>value===key)).slice(0,specification?.count || 0));
        if(feature.name==='Occult gnosis') {deathSaveDelta--;if(benefits.has('rest-die'))breakdown.push({label:'Feat: Occult gnosis',amount:1});if(benefits.has('occult-slot'))occultExtra++;if(benefits.has('death-bonus'))deathSaveBonus+=2;continue;}
        if(feature.name==='Madness magick') {if(benefits.has('learning-sacrifice'))breakdown.push({label:'Feat: Madness magick sacrifice',amount:2});continue;}
        if(feature.name==='Mana-refusal') {const spec=derived.featPlan?.specs?.[feature.id],values=spec?.values,upgrades=values?.['mana-upgrades'] || [];if(values?.['sacrificed-cantrip']?.length && values?.['sacrificed-upgrades']?.length){if(upgrades.includes('defensive-rest')){breakdown.push({label:'Feat: Mana-refusal defensive upgrade',amount:1});deathSaveDelta++;hpDelta-=2;}if(upgrades.includes('spell-sacrifice') && values['sacrificed-spell']?.length)breakdown.push({label:'Feat: Mana-refusal spell sacrifice',amount:2});}continue;}
        if(feature.name==='Oaths of might') {
          const oath=derived.choices.find(group=>group.featureName==='Oath');
          if(oath?.selected.length && !character.conditions.some(condition=>/broken.*oath|oath.*broken/i.test(condition)))addRule('Feat: '+feature.name,feature.details,0,true);
          continue;
        }
        addRule('Feat: '+feature.name,feature.details);continue;
      }
      if(feature.parent==='Background') {
        for(const [name,value] of Object.entries(feature.details || {}))if(name!=='proficiencies')addRule(feature.name+': '+name,value);
      } else if(feature.parent==='Paladin' && feature.name==='Divine power') {
        breakdown.push({label:'Paladin: Divine power',amount:(feature.classLevel ?? character.level)>=11?3:(feature.classLevel ?? character.level)>=9?2:1});
      } else if(feature.parent==='Shaman' && feature.name==='Spirit journey') {
        if(derived.skillRanks.Religion>=2)breakdown.push({label:'Shaman: Spirit journey (already expert in Religion)',amount:1});
      } else if(feature.parent==='Ascended sorcerer' && feature.name==='Maturated sorcerer traits') {
        if(!derived.choices.some(group=>group.featureId===feature.id && group.automatic) && derived.choices.some(group=>group.parent==='Sorcerer' && group.featureName==='Innate magic' && group.options.some(option=>option.name==='Elder blood' && group.selected.includes(option.id))))breakdown.push({label:'Ascended sorcerer: Maturated Elder blood',amount:1});
      } else addRule(feature.parent+': '+feature.name,feature.details,registry.get(key(feature.parent,feature.name))?.restDice || 0,false,false,feature.classLevel ?? character.level);
    }
    for(const group of derived.choices.filter(group=>group.kind!=='feat')) {
      const siblings=group.optionalSet?derived.choices.filter(other=>other.optionalSet===group.optionalSet):[];
      if(group.pairComplete===false)continue;
      if(siblings.some(other=>other.selected.length<other.count))continue;
      for(const id of group.selected) {
        const option=group.options.find(option=>option.id===id);
        if(option.automationId)continue;
        const label=group.parent+': '+option.name;
        if(group.parent==='Cleric' && option.name==='Oath of vigilance') {
          const amount=Math.max(1,globalThis.CharacterState.abilityModifier(derived.abilities.wis)/2-1);
          if(Number.isInteger(amount))breakdown.push({label,amount});else warnings.push('Oath of vigilance gives a fractional rest-dice bonus without a rounding rule. Record the agreed whole-number bonus under Table adjustments.');
        } else if(group.parent==='Ranger' && option.name==='Keen will') {
          if(derived.skillRanks.Insight>=2)breakdown.push({label:label+' (already expert in Insight)',amount:1});
        } else if(group.parent==='Devotee' && option.name==='Enlightened one') {
          breakdown.push({label,amount:2});occultExtra+=2;
        } else if(group.parent==='Ascendant' && option.name==='Ascended form') {
          warnings.push('Ascended form changes maximum rest dice while its agreed routine is maintained. Record its -1 adjustment while applicable; Perfected form removes the penalty.');
        } else addRule(label,option.ownDetails ?? option.details,registry.get(key(group.parent,group.effectFeature || group.featureName,option.name))?.restDice || 0,false,true,group.classLevel ?? character.level);
      }
    }
    for(const item of derived.featPlan?.effects || [])if(item.automation && item.effect.restDice)breakdown.push({label:item.sourceName,amount:item.effect.restDice,classId:item.classId});
    if(health.restAdjustment)breakdown.push({label:'Table adjustment',amount:health.restAdjustment});
    for(const item of breakdown){const feature=derived.features.find(feature=>feature.classId && item.label.startsWith(feature.parent+':'));const group=derived.choices.find(group=>group.classId && item.label.startsWith(group.parent+':'));if(feature || group)item.classId=(feature || group).classId;}
    return {maximum:Math.max(minimum,0,breakdown.reduce((total,item)=>total+item.amount,0)),breakdown,deathSaveDelta,hpDelta,occultExtra,deathSaveBonus,warnings};
  }

  globalThis.CharacterEffects = Object.freeze({
    restDice,benefitOptions,
    lookup(parentName, featureName, optionName = "") {
      const result = registry.get(key(parentName, featureName, optionName));
      return result ? JSON.parse(JSON.stringify(result)) : {};
    },
    supported() {
      return [...registry.keys()].map(id => JSON.parse(id));
    }
  });
})();
