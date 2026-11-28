"use strict";

(() => {
  const version = 1;
  const format = "vara-character-sheet";
  const defaultRules = "6a4053a + D&D 5e+ draft (2026-11-19)";
  const abilities = ["str", "dex", "con", "int", "wis", "cha"];
  const pools = ["hp", "arcaneHealth", "block", "tempBlock", "tempHP"];
  const limit = 1000000;

  function record(value, label) {
    if (value === undefined) return {};
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(label + " must be an object.");
    }
    return value;
  }

  function copyData(value, depth = 0) {
    if (depth > 80) throw new Error("The character data is nested too deeply.");
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(item => copyData(item, depth + 1));
    if (value && typeof value === "object") {
      const result = {};
      for (const [key, child] of Object.entries(value)) {
        if (["__proto__", "constructor", "prototype"].includes(key)) {
          throw new Error("The file contains an unsupported field name.");
        }
        if (child !== undefined) result[key] = copyData(child, depth + 1);
      }
      return result;
    }
    throw new Error("Character fields must contain valid JSON values.");
  }

  function text(value, label, fallback = "") {
    if (value === undefined) return fallback;
    if (typeof value !== "string") throw new Error(label + " must be text.");
    return value;
  }

  function integer(value, label, fallback = 0, min = 0, max = limit) {
    if (value === undefined) return fallback;
    const numeric = typeof value === "string" && /^[+-]?\d+$/.test(value.trim()) ? Number(value) : value;
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) throw new Error(label + " must be a whole number.");
    return Math.max(min, Math.min(max, numeric));
  }

  function boolean(value, label) {
    if (value === undefined) return false;
    if (typeof value !== "boolean") throw new Error(label + " must be true or false.");
    return value;
  }

  function newId() {
    return globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function id(value, label) {
    return text(value, label).trim() || newId();
  }

  function array(value, label) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(label + " must be a list.");
    return value;
  }

  function pool(value, label, fallback = 0) {
    const item = record(value, label);
    const max = integer(item.max, label + " maximum", fallback);
    const current = integer(item.current, label + " current", Math.min(fallback, max), 0, max);
    return {...item, current, max};
  }

  function unique(items, key, label) {
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item[key])) throw new Error(label + " contains a duplicate " + key + " (" + item[key] + ").");
      seen.add(item[key]);
    }
    return items;
  }

  function entries(value, kind) {
    const list = array(value, kind).map((raw, index) => {
      const label = kind + " entry " + (index + 1);
      const row = record(raw, label);
      row.id = id(row.id, label + " ID");
      row.name = text(row.name, label + " name");
      if (kind === "customResources") return pool(row, label);
      row.notes = text(row.notes, label + " notes");
      if (kind === "attacks") {
        row.bonus = integer(row.bonus, label + " bonus", 0, -limit);
        row.damage = text(row.damage, label + " damage");
        return row;
      }
      row.entryId = text(row.entryId ?? undefined, label + " rule reference");
      if (kind === "inventory") {
        row.quantity = integer(row.quantity, label + " quantity", 1);
        row.equipped = boolean(row.equipped, label + " equipped");
        if(row.attuned !== undefined)row.attuned=boolean(row.attuned,label+" attuned");
      } else if (kind === "spells") {
        row.prepared = boolean(row.prepared, label + " prepared");
        if(row.classId!==undefined) row.classId=text(row.classId,label+" casting class");
        if(row.onBar!==undefined) row.onBar=boolean(row.onBar,label+" quick action");
      }
      return row;
    });
    return unique(list, "id", kind);
  }

  function normalizeCharacter(input) {
    const source = copyData(record(input, "Character"));
    source.id = id(source.id, "Character ID");
    for (const key of ["name", "player", "ancestry", "background", "className", "subclass", "portrait", "notes", "maneuvers"]) {
      source[key] = text(source[key], "Character " + key);
    }
    source.level = integer(source.level, "Character level", 1, 1, 100);
    source.experience = integer(source.experience, "Experience points");
    source.inspiration = boolean(source.inspiration, "Inspiration");
    source.restDice = pool(source.restDice, "Rest dice");
    source.restDice.die = text(source.restDice.die, "Rest die size", "d6");
    source.restDice.pools=unique(array(source.restDice.pools,'Rest dice pools').map((raw,index)=>{const row=pool(raw,'Rest dice pool '+index);row.id=text(row.id,'Rest dice pool ID');if(!row.id)throw new Error('Rest dice pools need an ID.');row.label=text(row.label,'Rest dice pool label');row.die=text(row.die,'Rest dice pool die','d6');return row;}),'id','Rest dice pools');
    source.restDice.spent=record(source.restDice.spent,'Spent rest dice');for(const id of Object.keys(source.restDice.spent))source.restDice.spent[id]=integer(source.restDice.spent[id],'Spent rest dice');
    source.restDice.unfilled=record(source.restDice.unfilled,'Unrecovered rest dice capacity');for(const id of Object.keys(source.restDice.unfilled))source.restDice.unfilled[id]=integer(source.restDice.unfilled[id],'Unrecovered rest dice capacity');
    source.restDice.selectedPool=text(source.restDice.selectedPool,'Selected rest dice pool');
    source.deathSaves = record(source.deathSaves, "Death saves");
    source.deathSaves.successes = integer(source.deathSaves.successes, "Successful death saves", 0, 0, source.build?.enabled ? 100 : 3);
    source.deathSaves.failures = integer(source.deathSaves.failures, "Failed death saves", 0, 0, source.build?.enabled ? 100 : 3);
    source.proficiencies = record(source.proficiencies, "Other proficiencies and languages");
    for (const key of ["weapons", "armor", "tools", "languages"]) {
      source.proficiencies[key] = text(source.proficiencies[key], key + " proficiencies");
    }
    source.rulesVersion = text(source.rulesVersion, "Rules version", globalThis.DND_RULES_VERSION || defaultRules);
    source.updatedAt = text(source.updatedAt, "Last updated", new Date().toISOString());
    source.abilities = record(source.abilities, "Abilities");
    source.training = record(source.training, "Training");
    for (const key of ["skills", "saves", "skillBonuses", "saveBonuses"]) {
      source.training[key] = record(source.training[key], "Training " + key);
    }
    for (const key of Object.keys(source.training.skills)) {
      source.training.skills[key] = integer(source.training.skills[key], key + " training rank", 0, 0, 2);
    }
    for (const key of Object.keys(source.training.skillBonuses)) {
      source.training.skillBonuses[key] = integer(source.training.skillBonuses[key], key + " skill bonus", 0, -limit);
    }
    for (const key of abilities) {
      source.abilities[key] = integer(source.abilities[key], key + " score", 10);
      source.training.saves[key] = boolean(source.training.saves[key], key + " save training");
      source.training.saveBonuses[key] = integer(source.training.saveBonuses[key], key + " save bonus", 0, -limit);
    }
    source.combat = record(source.combat, "Combat");
    const combat = source.combat;
    combat.armorClass = integer(combat.armorClass, "Armor class", 10);
    combat.speed = integer(combat.speed, "Speed", 30);
    for (const key of ["initiativeBonus", "spellAttackBonus", "spellSaveBonus"]) {
      combat[key] = integer(combat[key], key, 0, -limit);
    }
    for (const key of ["proficiencyOverride", "spellSaveOverride", "spellAttackOverride", "passivePerceptionOverride"]) {
      combat[key] = combat[key] == null || combat[key] === "" ? null : integer(combat[key], key, 0, -limit);
    }
    combat.spellAbility = text(combat.spellAbility, "Spellcasting ability").toLowerCase();
    if (combat.spellAbility && !abilities.includes(combat.spellAbility)) {
      throw new Error("Spellcasting ability must be blank or one of STR, DEX, CON, INT, WIS, CHA.");
    }
    source.resources = record(source.resources, "Resources");
    for (const key of pools) {
      source.resources[key] = pool(source.resources[key], key, key === "hp" ? 10 : 0);
    }
    source.spellSlots = unique(array(source.spellSlots, "Spell slots").map((raw, i) => {
      const slot = pool(raw, "Spell slot " + (i + 1));
      slot.level = integer(slot.level, "Spell slot level", i + 1, 0, 100);
      return slot;
    }), "level", "Spell slots");
    for (const key of ["customResources", "inventory", "spells", "features", "attacks"]) {
      source[key] = entries(source[key], key);
    }
    source.conditions = array(source.conditions, "Conditions").map((item, i) => text(item, "Condition " + (i + 1)));
    source.coins = record(source.coins, "Coins");
    for (const key of ["gold", "silver", "copper"]) source.coins[key] = integer(source.coins[key], key + " coins");
    if (source.build !== undefined) {
      const build = source.build = record(source.build, "Character builder");
      build.enabled = boolean(build.enabled, "Builder enabled");
      build.combatActive = boolean(build.combatActive, "Combat active");
      build.combatFloor = integer(build.combatFloor, "Combat Block grant");
      for (const key of ["raceId", "classId", "backgroundId"]) build[key] = text(build[key], key);
      for (const key of ["archetypes", "skills", "raceSkills", "weaponGroups"]) {
        build[key] = array(build[key], key).map(value => text(value, key));
      }
      build.classTools=record(build.classTools,'Class instrument choices');for(const id of Object.keys(build.classTools))build.classTools[id]=text(build.classTools[id],'Class musical instrument');
      build.classOrder=array(build.classOrder,'Class level history').map(value=>text(value,'Class at this level'));
      if(build.classOrder.length>100 || build.classOrder.some(value=>!value) || build.classOrder.length && build.classOrder[0]!==build.classId)throw new Error('Class level history must start with the starting class and contain at most 100 named levels.');
      for(const key of ['classArchetypes','classSkills']){build[key]=record(build[key],key);for(const id of Object.keys(build[key]))build[key][id]=array(build[key][id],key).map(value=>text(value,key));}
      build.choices = record(build.choices, "Feature choices");
      build.qualifications = array(build.qualifications, "Story qualifications").map(value=>{
        if(!['has-died','righteous-slaying','rest-crafting'].includes(value)) throw new Error('Unknown story qualification.');
        return value;
      });
      build.choiceLocks=record(build.choiceLocks,'Permanent rule choices');for(const id of Object.keys(build.choiceLocks)){build.choiceLocks[id]=record(build.choiceLocks[id],'Permanent choice');for(const key of Object.keys(build.choiceLocks[id]))build.choiceLocks[id][key]=text(build.choiceLocks[id][key],'Permanent choice value');}
      build.featChoices=record(build.featChoices,'Feat choices');
      for(const id of Object.keys(build.featChoices)){build.featChoices[id]=record(build.featChoices[id],'Feat decisions');for(const key of Object.keys(build.featChoices[id]))build.featChoices[id][key]=array(build.featChoices[id][key],'Feat decision values').map(value=>text(value,'Feat decision'));}
      build.featBenefits=record(build.featBenefits,'Feat benefits');
      const benefitKeys=['spell','occult-slot','death-bonus','rest-die','learning-sacrifice','cantrip-sacrifice','defensive-rest','spell-sacrifice'];
      for(const id of Object.keys(build.featBenefits))build.featBenefits[id]=array(build.featBenefits[id],'Feat benefit choices').map(value=>{if(!benefitKeys.includes(value))throw new Error('Unknown feat benefit.');return value;});
      for (const key of Object.keys(build.choices)) build.choices[key] = array(build.choices[key], key).map(value => text(value, key));
      build.abilityChoices = record(build.abilityChoices, "Ability choices");
      for (const key of Object.keys(build.abilityChoices)) {
        const choice = build.abilityChoices[key] = record(build.abilityChoices[key], key);
        choice.mode = integer(choice.mode, "Ability allocation mode", 0, 0, 20);
        choice.values = array(choice.values, "Ability allocation").map(value => {
          if (!abilities.includes(value) && value !== "") throw new Error("Invalid ability allocation.");
          return value;
        });
      }
      build.adjustments = record(build.adjustments, "Builder adjustments");
      for (const key of ["ac", "speed", "block", "blockCheck"]) build.adjustments[key] = integer(build.adjustments[key], key + " adjustment", 0, -limit);
      if (build.casting !== undefined) {
        const casting = build.casting = record(build.casting, "Casting settings");
        if (casting.enabled !== undefined) casting.enabled = boolean(casting.enabled, "Automatic casting resources");
        if (casting.maxSlotLevel != null) casting.maxSlotLevel = integer(casting.maxSlotLevel, "Maximum full-slot level", 1, 1, 20);
        if(casting.classId!==undefined)casting.classId=text(casting.classId,'Selected spellcasting class');
        if (casting.maxLearnLevel != null) casting.maxLearnLevel = integer(casting.maxLearnLevel, "Maximum learned spell level", 1, 0, 20);
        casting.spent = record(casting.spent, "Spent casting resources");
        for (const key of Object.keys(casting.spent)) casting.spent[key] = integer(casting.spent[key], "Spent casting resource");
        casting.exhausted = record(casting.exhausted, "Spent full slots");
        for (const key of Object.keys(casting.exhausted)) casting.exhausted[key] = boolean(casting.exhausted[key], "Full slot exhaustion");
        if (casting.migrationWarnings !== undefined) casting.migrationWarnings = array(casting.migrationWarnings, "Casting migration notes").map(value=>text(value,"Casting migration note"));
      }
      build.health = record(build.health, "Health settings");
      const health = build.health;
      health.baseHP = integer(health.baseHP, "Base maximum HP", source.resources.hp.max);
      health.baseRestDice = integer(health.baseRestDice, "Base rest dice maximum", source.restDice.max);
      health.restMode=text(health.restMode,'Rest dice mode','level');
      if(!['level','manual'].includes(health.restMode))throw new Error('Unknown rest dice mode.');
      health.restAdjustment=integer(health.restAdjustment,'Rest dice adjustment',0,-limit);
      health.progression = boolean(health.progression, "Configured HP progression");
      health.hpMode = text(health.hpMode, "HP mode", "average");
      if (!["average", "rolled", "manual"].includes(health.hpMode)) throw new Error("Invalid HP mode.");
      health.rolls = array(health.rolls, "Level HP rolls").map(value => value === null || value === "" ? null : integer(value, "Level HP roll", 1, 1, 1000));
      health.firstLevelHP = integer(health.firstLevelHP, "First-level HP", health.baseHP);
      health.perLevelHP = integer(health.perLevelHP, "HP per added level");
      health.conPerLevel = boolean(health.conPerLevel, "CON per level");
      health.fatigue = integer(health.fatigue, "Fatigue", 0, 0, 10);
      health.poolOrder = array(health.poolOrder, "Damage pool order").map(value => {
        if (!["tempHP", "arcaneHealth", "hp"].includes(value)) throw new Error("Invalid damage pool order.");
        return value;
      });
      if (new Set(health.poolOrder).size !== health.poolOrder.length) throw new Error("Duplicate damage pools.");
      for (const key of ["weaponTraining", "attackAbility", "damageAbility"]) {
        for (const item of source.inventory) if (item[key] !== undefined) item[key] = text(item[key], key);
      }
      for (const item of source.inventory) {
        if (item.magicBonus !== undefined) item.magicBonus = integer(item.magicBonus, "Item magic bonus", 0, -100, 100);
        for (const key of ["twoHanded", "offHand"]) if (item[key] !== undefined) item[key] = boolean(item[key], key);
      }
    }
    return source;
  }

  function createCharacter() {
    return normalizeCharacter({});
  }

  function importCharacter(input) {
    if (typeof input !== "string") throw new Error("Choose a JSON character file.");
    let envelope;
    try {
      envelope = JSON.parse(input.replace(/^\uFEFF/, ""));
    } catch {
      throw new Error("This file is not valid JSON. Choose a character sheet exported as JSON.");
    }
    if (!envelope || envelope.format !== format) throw new Error("This file is not a Varis character sheet.");
    if (!Number.isInteger(envelope.version) || envelope.version < 1) throw new Error("The file has an invalid character sheet version.");
    if (envelope.version > version) throw new Error("This file uses a newer character sheet version (" + envelope.version + ").");
    const value = record(envelope.character, "Saved character");
    if (!Object.keys(value).length) throw new Error("The file contains no character details.");
    if (envelope.rulesVersion !== undefined) text(envelope.rulesVersion, "Rules version");
    return normalizeCharacter({...value, rulesVersion: value.rulesVersion ?? envelope.rulesVersion});
  }

  function exportCharacter(input) {
    const character = normalizeCharacter(input);
    return JSON.stringify({format, version, rulesVersion: character.rulesVersion, character}, null, 2);
  }

  function abilityModifier(score) {
    return Math.floor((integer(score, "Ability score", 10) - 10) / 2);
  }

  function proficiencyBonus(level) {
    return 2 + Math.floor((integer(level, "Character level", 1, 1, 100) - 1) / 3);
  }

  function classHistory(character) {
    const first=character.build?.classId || '',history=(character.build?.classOrder || []).slice(0,character.level);
    while(history.length<character.level)history.push(first);
    return history;
  }
  function classLevels(character,atLevel=character.level) {
    const rows=new Map();
    for(const [index,id] of classHistory(character).slice(0,atLevel).entries())if(id){const row=rows.get(id) || {id,level:0,levels:[]};row.level++;row.levels.push(index+1);rows.set(id,row);}
    return [...rows.values()];
  }

  function syncRestDice(character,definitions) {
    const rest=character.restDice,old=rest.pools || [],spent=rest.spent ||= {},unfilled=rest.unfilled ||= {},priority=rows=>[...rows].sort((a,b)=>(b.id===rest.selectedPool)-(a.id===rest.selectedPool));
    if(old.length){
      for(const row of old){spent[row.id] ??= row.max-row.current;unfilled[row.id] ??= 0;}
      let delta=rest.current-old.reduce((total,row)=>total+row.current,0);
      for(const row of priority(old)){
        if(delta<0){const amount=Math.min(-delta,Math.max(0,row.max-spent[row.id]-(unfilled[row.id] || 0)));spent[row.id]+=amount;delta+=amount;}
        else if(delta>0){const capacity=Math.min(delta,unfilled[row.id] || 0);unfilled[row.id]-=capacity;delta-=capacity;const amount=Math.min(delta,spent[row.id]);spent[row.id]-=amount;delta-=amount;}
      }
      for(const row of definitions){const previous=old.find(item=>item.id===row.id);if(spent[row.id]===undefined){spent[row.id]=0;unfilled[row.id]=row.max;}else if(previous){unfilled[row.id]=Math.max(0,(unfilled[row.id] || 0)+row.max-previous.max);}}
    }else{
      for(const row of definitions){spent[row.id] ??= 0;unfilled[row.id] ??= 0;}
      let missing=Math.max(0,definitions.reduce((total,row)=>total+row.max,0)-rest.current);
      for(const row of priority(definitions)){const amount=Math.min(missing,row.max);spent[row.id]=amount;missing-=amount;}
    }
    rest.pools=definitions.map(row=>({...row,current:Math.max(0,row.max-(spent[row.id] || 0)-(unfilled[row.id] || 0))}));
    rest.max=rest.pools.reduce((total,row)=>total+row.max,0);rest.current=rest.pools.reduce((total,row)=>total+row.current,0);
    if(!rest.pools.some(row=>row.id===rest.selectedPool))rest.selectedPool=rest.pools[0]?.id || '';
    rest.die=rest.pools.find(row=>row.id===rest.selectedPool)?.die || rest.die;
    return character;
  }

  function resourceDelta(input, key, delta) {
    const character = normalizeCharacter(input);
    let amount = integer(delta, "Resource change", 0, -limit);
    let target;
    if (pools.includes(key)) {
      target = character.resources[key];
      if (key === "block" && amount < 0) {
        const temporary = character.resources.tempBlock;
        const used = Math.min(temporary.current, -amount);
        temporary.current -= used;
        amount += used;
      }
    } else if (typeof key==='string' && key.startsWith('rest-pool:')) {
      const row=character.restDice.pools.find(row=>row.id===key.slice('rest-pool:'.length));if(!row)throw new Error('That rest dice pool is unavailable.');
      const next=Math.max(0,Math.min(row.max,row.current+amount)),change=next-row.current;if(change<0)character.restDice.spent[row.id]=(character.restDice.spent[row.id] || 0)-change;else{const capacity=Math.min(change,character.restDice.unfilled[row.id] || 0);character.restDice.unfilled[row.id]=(character.restDice.unfilled[row.id] || 0)-capacity;character.restDice.spent[row.id]=Math.max(0,(character.restDice.spent[row.id] || 0)-(change-capacity));}row.current=next;character.restDice.current=character.restDice.pools.reduce((total,item)=>total+item.current,0);character.updatedAt=new Date().toISOString();return character;
    } else if (key === "restDice") {
      target = character.restDice;
    } else if (typeof key === "string" && key.startsWith("custom:")) {
      target = character.customResources.find(row => row.id === key.slice(7));
    } else if (typeof key === "string" && /^slot:\d+$/.test(key)) {
      target = character.spellSlots.find(slot => slot.level === Number(key.slice(5)));
    }
    if (!target) throw new Error("That resource is no longer on this character.");
    target.current = Math.max(0, Math.min(target.max, target.current + amount));
    if(key==='restDice' && character.restDice.pools.length)syncRestDice(character,character.restDice.pools);
    character.updatedAt = new Date().toISOString();
    return character;
  }

  globalThis.CharacterState = Object.freeze({
    version, createCharacter, normalizeCharacter, importCharacter, exportCharacter,
    abilityModifier, proficiencyBonus, resourceDelta, classHistory, classLevels, syncRestDice
  });
})();
