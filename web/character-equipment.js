"use strict";

(() => {
  const abilities = ["str", "dex", "con", "int", "wis", "cha"];
  const clone = value => JSON.parse(JSON.stringify(value));
  const lower = value => String(value ?? "").toLowerCase().trim();
  const singular = value => lower(value).replace(/s$/, "");
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const modifier = score => Math.floor((number(score, 10) - 10) / 2);
  const properties = entry => Array.isArray(entry.details?.properties)
    ? entry.details.properties.join(", ") : String(entry.details?.properties || "");
  const has = (text, word) => new RegExp("\\b" + word + "\\b", "i").test(text);
  const rating = (text, word) => number(text.match(new RegExp("\\b" + word + "\\s+(\\d+)\\b", "i"))?.[1]);

  function entriesFrom(catalog) {
    return (catalog || []).flatMap(section => (section.entries || []).map(entry => ({
      ...entry, section: section.key,
      entryId: globalThis.MagicItems?.entryId(section.key,entry) || JSON.stringify([section.key, entry.group || "", entry.name])
    })));
  }

  function category(entry) {
    if (!entry) return "";
    if (entry.details?.["Base AC"] !== undefined || /^(light|medium|heavy) armor$/i.test(entry.group || "")) return "armor";
    if (entry.details?.["AC bonus"] !== undefined || /^(light|heavy) shields?$/i.test(entry.group || "")) return "shield";
    if (entry.details?.damage !== undefined && entry.details?.type) return "weapon";
    return "";
  }

  function savedCategory(row) {
    try {
      const id = JSON.parse(row.entryId || "null");
      if (Array.isArray(id) && id[0] === "items") return category({group: id[1]});
    } catch (_) { /* A custom reference can still have explicit equipment metadata. */ }
    return category(row);
  }

  function equip(character, index, on, catalog = []) {
    const result = globalThis.CharacterState?.normalizeCharacter
      ? globalThis.CharacterState.normalizeCharacter(character) : clone(character);
    const inventory = result.inventory || [];
    if (!Number.isInteger(index) || !inventory[index]) return result;
    const selected = inventory[index];
    selected.equipped = Boolean(on) && number(selected.quantity, 1) > 0;
    const available=entriesFrom(catalog);
    const kindOf=row=>{
      const entry=available.find(entry=>entry.entryId===row.entryId);
      return entry ? category(globalThis.MagicItems?.equipment(entry,catalog) || entry) : savedCategory(row);
    };
    const kind = kindOf(selected);
    if (selected.equipped && (kind === "armor" || kind === "shield")) {
      inventory.forEach((row, other) => {
        if (other !== index && kindOf(row) === kind) row.equipped = false;
      });
    }
    return result;
  }

  // Choice clauses describe proficiency options, not all the proficiencies they name.
  function trainingClauses(text) {
    return lower(text).split(/[,;\n]+|\s+and\s+/).map(clause => clause.replace(/[.!]+$/, "").trim())
      .filter(clause => clause && !/\d|\b(?:choose|choice|either|or)\b/.test(clause));
  }

  function weaponTrained(entry, row, context) {
    if (row.weaponTraining === "proficient") return true;
    if (row.weaponTraining === "untrained") return false;
    const groups = [lower(entry.group), lower(entry.details?.group)];
    const names = [entry.name];
    if (entry.section === "magic-items" && entry.details?.base_item) {
      const active = !globalThis.MagicItems?.requiresAttunement(entry) || row.attuned === true;
      const customTraining = active && (["simple", "martial"].includes(lower(entry.details.weapon_type))
        || lower(entry.details.weapon_group));
      if (!customTraining) names.push(entry.details.base_item);
    }
    if ((context.weaponGroups || []).some(group => groups.includes(lower(group)))) return true;
    const light = has(properties(entry), "light");
    return trainingClauses(context.proficiencies?.weapons).some(declaration => {
      const clause = declaration.replace(/^all\s+/, "");
      if (names.some(name => singular(name) === singular(clause)) || groups.includes(clause)) return true;
      if (/^thrown weapons?$/.test(clause)) {
        return has(properties(entry), "throw") || groups.some(group => /^thrown\b/.test(group));
      }
      if (/^(?:all )?weapons$/.test(clause)) return true;
      if (/^(?:all )?simple(?: light)? weapons$/.test(clause)) {
        return lower(entry.details?.type) === "simple" && (!/\blight\b/.test(clause) || light);
      }
      return /^(?:all )?martial(?: light)? weapons$/.test(clause)
        && lower(entry.details?.type) === "martial" && (!/\blight\b/.test(clause) || light);
    });
  }

  function defenseTrained(entry, context) {
    if (!entry) return false;
    const group = lower(entry.group).replace(/shields$/, "shield");
    const kind = category(entry);
    const declarations = lower(context.proficiencies?.armor).replace(/\barmour\b/g, "armor")
      .replace(/\b(light|medium|heavy)\s+and\s+(light|medium|heavy)\s+(armor|shields?)\b/g, "$1 $3, $2 $3");
    return trainingClauses(declarations).some(clause => {
      const value = clause.replace(/shields$/, "shield");
      return value === lower(entry.name) || value === group
        || value === "all armor and shields" || value === "all armor and shield"
        || (kind === "armor" && /^(?:all )?armou?r$/.test(value))
        || (kind === "shield" && /^(?:all )?shield$/.test(value));
    });
  }

  function armorCalculation(gear, mods, effects = {}) {
    const props = properties(gear.entry);
    const bulk = Math.max(0, rating(props, "bulk") - number(effects.armorBulkReduction));
    const base = number(gear.entry.details["Base AC"], 10);
    const dexterity = Math.max(0, mods.dex - bulk);
    const strengthPenalty = bulk > 0 ? Math.max(0, bulk - mods.str) : 0;
    const floor = Math.max(0, 8 - (base + dexterity - strengthPenalty));
    const magic = number(gear.row.magicBonus);
    return {base, bulk, dexterity, strengthModifier: mods.str, dexterityModifier: mods.dex,
      strengthPenalty, floor, magic, total: base + dexterity - strengthPenalty + floor + magic};
  }

  const armorAC = (gear, mods, effects) => armorCalculation(gear, mods, effects).total;

  function equipmentBonuses(rules, armor, shield, armed, character) {
    const group = lower(armor?.entry.group);
    const applies = {
      armor: !!armor, "no-armor": !armor,
      "light-or-no-armor": !armor || group === "light armor",
      "medium-or-heavy-armor": /^(medium|heavy) armor$/.test(group),
      "heavy-armor": group === "heavy armor", shield: !!shield,
      "no-weapons-or-shield": !armed && !shield, "weapons-or-shield": armed || !!shield,
      "armor-and-rest-dice": !!armor && number(character.restDice?.current) > 0
    };
    return (rules || []).filter(rule => applies[rule.when]).map(rule => {
      const effects = {...rule.effects};
      for (const upgrade of rule.upgrades || []) if (number(character.level, 1) >= upgrade.level) {
        for (const [key, value] of Object.entries(upgrade.effects)) effects[key] = number(effects[key]) + value;
      }
      return {source: rule.source, effects};
    });
  }

  function best(items, score) {
    return items.reduce((selected, gear) => !selected || score(gear) > score(selected) ? gear : selected, null);
  }

  function selectedAbility(row, entry, mods) {
    if (abilities.includes(row.attackAbility)) return row.attackAbility;
    const props = properties(entry);
    if (has(props, "agile")) return "dex";
    if (has(props, "balanced")) return mods.dex > mods.str ? "dex" : "str";
    return /\brange\s+\d/i.test(props) ? "dex" : "str";
  }

  function damageText(base, flat) {
    if (!base || base === "-") return base || "-";
    if (!flat) return base;
    return base + (flat < 0 ? " - " : " + ") + Math.abs(flat);
  }

  function weaponAttacks(gear, context, mods, warn) {
    const {entry, row} = gear;
    const props = properties(entry);
    const ability = selectedAbility(row, entry, mods);
    const trained = weaponTrained(entry, row, context);
    const magic = number(row.magicBonus);
    const proficiency = trained ? number(context.proficiency) : 0;
    const attackMod = trained ? mods[ability] : 0;
    const effort = trained && has(props, "effort") ? mods.con : 0;
    const overdraw = has(props, "overdraw");
    const damageAbility = abilities.includes(row.damageAbility) ? row.damageAbility : overdraw ? "str" : ability;
    const baseDamageMod = trained && (!row.offHand || context.offHandAbilityDamage) ? mods[damageAbility] : 0;
    if (overdraw) warn(entry.name + ": Overdraw uses Strength for damage here; its interaction with normal ability damage is unresolved. Choose a damage ability to override it.");
    let damage = String(entry.details.damage || "-");
    const versatile = props.match(/\bversatile\s+(\d+d\d+)(\s+(?:bludgeoning|piercing|slashing|acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder)\b|[bps]\b)?/i);
    if (row.twoHanded && versatile) {
      const suffix = damage.match(/^\s*\d+d\d+(.*)$/i)?.[1] || "";
      damage = versatile[1] + (versatile[2] || suffix);
    }
    const dc = props.match(/(?:^|[,;])\s*dc\s*([+-]+)/i)?.[1] || "";
    const dcBonus = [...dc].reduce((sum, sign) => sum + (sign === "+" ? 1 : -1), 0);
    const notes = [];
    const range = props.match(/\brange\s+(\d+(?:\s*\/\s*\d+)?)/i)?.[1];
    if (range) notes.push("Range " + range + " ft.");
    else {
      const reach = props.match(/\breach\s+(III|II|I)\b/i)?.[1]?.toUpperCase();
      notes.push("Melee reach " + (5 + ({I: 5, II: 10, III: 15}[reach] || 0)) + " ft.");
    }
    if (row.offHand) {
      notes.push("Off-hand bonus-action attack against the same target.");
      if (!has(props, "light")) notes.push("Off-hand attack has disadvantage because the weapon is not Light.");
    }
    if (!trained) notes.push("Untrained: no proficiency or ability bonus; cannot use weapon maneuvers.");
    if (row.twoHanded && versatile) notes.push("Two-handed Versatile damage.");
    if (has(props, "inaccurate")) notes.push(has(props, "very[ -]inaccurate")
      ? "Disadvantage if you moved since the start of your previous turn."
      : "Disadvantage if you moved since the start of your turn.");
    if (row.notes) notes.push(row.notes);
    const attack = {
      name: row.name || entry.name,
      bonus: proficiency + attackMod + magic,
      damage: damageText(damage, baseDamageMod + effort + magic),
      blockDC: 8 + proficiency + attackMod + effort + magic + dcBonus,
      properties: props,
      notes: notes.join(" "),
      maneuvers: clone(entry.details.maneuvers || []),
      inventoryId: row.id,
      entryId: entry.entryId,
      ability, trained
    };
    const result = [attack];
    const thrownRange = props.match(/\bthrow\s+(\d+(?:\s*\/\s*\d+)?)/i)?.[1];
    if (thrownRange) result.push({...attack, name: attack.name + " (thrown)",
      notes: "Thrown range " + thrownRange + " ft. No ranged-attack disadvantage in melee range. "
        + notes.filter(note => !/^Melee reach/.test(note)).join(" ")});
    return result;
  }

  function shieldAttack(gear, context, mods) {
    const {entry, row} = gear;
    const props = properties(entry);
    const bash = props.match(/\bbash\s+(\d+d\d+[bps]?)/i)?.[1];
    if (!bash) return null;
    const trained = row.weaponTraining === "proficient" || (row.weaponTraining !== "untrained" && defenseTrained(entry, context));
    const ability = abilities.includes(row.attackAbility) ? row.attackAbility : "str";
    const damageAbility = abilities.includes(row.damageAbility) ? row.damageAbility : ability;
    // Converted shield enchantments improve AC; printed special Bash boosts remain manual.
    const magic = entry.section === "magic-items" ? 0 : number(row.magicBonus);
    const bonus = (trained ? number(context.proficiency) + mods[ability] : 0) + magic;
    return {
      name: (row.name || entry.name) + " bash", bonus,
      damage: damageText(bash, (trained ? mods[damageAbility] : 0) + magic),
      blockDC: 8 + bonus, properties: props,
      notes: "Reaction after a melee attack misses you or is blocked. " + (row.notes || ""),
      maneuvers: [], inventoryId: row.id, entryId: entry.entryId, ability, trained
    };
  }

  function derive(character, catalog, context = {}) {
    const scores = context.abilities || character.abilities || {};
    const mods = Object.fromEntries(abilities.map(ability => [ability, modifier(scores[ability])]));
    const warnings = [];
    const warn = note => { if (!warnings.includes(note)) warnings.push(note); };
    const entries = new Map(entriesFrom(catalog).filter(entry => ["items","magic-items"].includes(entry.section))
      .map(entry => [entry.entryId,entry]));
    if((character.inventory || []).filter(row=>row.attuned && number(row.quantity,1)>0 && globalThis.MagicItems?.requiresAttunement(entries.get(row.entryId))).length>3)warn("More than three magic items are marked attuned. Check your limit: the default is three, and a specific item can increase it.");
    const active = [];
    for (const row of character.inventory || []) {
      if (!row.equipped || number(row.quantity, 1) <= 0) continue;
      const source = entries.get(row.entryId);
      if (!source) {
        warn((row.name || "Custom item") + ": no matching equipment rule; keep custom effects and attacks in their manual fields.");
        continue;
      }
      const entry = globalThis.MagicItems?.equipment(source,catalog,row) || source;
      const unattuned=entry.section === "magic-items" && globalThis.MagicItems?.requiresAttunement(entry) && !row.attuned;
      const manualAttack = entry.section === "magic-items" && !unattuned
        && /^(?:yes|true)$/i.test(String(entry.details?.manual_attack || "").trim());
      active.push({entry, row:unattuned?{...row,magicBonus:0}:row, manualAttack});
      if(unattuned)warn((row.name || entry.name)+": not attuned; use only the mundane base item's statistics.");
      if(manualAttack)warn((row.name || entry.name) + ": calculate its attack manually from the item rules; no automatic weapon attack is added. Apply its special magic effects manually.");
      else if(entry.section === "magic-items")warn((row.name || entry.name) + ": apply its special magic effects and attunement requirements from the item rules manually. Supported base equipment and the entered magic bonus are automatic.");
    }
    const armors = active.filter(gear => category(gear.entry) === "armor");
    const shields = active.filter(gear => category(gear.entry) === "shield");
    const effects = context.effects || {};
    const armor = best(armors, gear => armorAC(gear, mods, effects));
    const shield = best(shields, gear => number(gear.entry.details["AC bonus"]) + number(gear.row.magicBonus));
    if (armors.length > 1) warn("Multiple armor items are equipped. Only the armor giving the highest AC applies; equip one armor to resolve the conflict.");
    if (shields.length > 1) warn("Multiple shields are equipped. Shield stacking is unresolved; only the highest shield AC bonus and that shield's properties apply.");
    const armorProps = armor ? properties(armor.entry) : "";
    const shieldProps = shield ? properties(shield.entry) : "";
    const armed = active.some(gear => category(gear.entry) === "weapon");
    const conditionalBonuses = equipmentBonuses(effects.equipmentRules, armor, shield, armed, character);
    const bonus = key => conditionalBonuses.reduce((sum, rule) => sum + number(rule.effects[key]), 0);
    const calculation = armor ? armorCalculation(armor, mods, effects) : null;
    const slow = Math.max(0, rating(armorProps, "slow") - number(effects.armorSlowReduction));
    const speedPenalty = !effects.ignoreArmorSlow && slow > 0 ? 5 * Math.max(0, slow - mods.str) : 0;
    const shieldAC = shield ? number(shield.entry.details["AC bonus"]) + number(shield.row.magicBonus) : 0;
    const acBreakdown = [{label: armor?.entry.name || "Unarmored base", amount: calculation?.base ?? 10},
      {label: calculation?.bulk ? "Dexterity after Bulk " + calculation.bulk : "Dexterity", amount: calculation?.dexterity ?? Math.max(0, mods.dex)}];
    if (calculation?.strengthPenalty) acBreakdown.push({label: "Bulk exceeds Strength modifier", amount: -calculation.strengthPenalty});
    if (calculation?.floor) acBreakdown.push({label: "Minimum armor AC 8", amount: calculation.floor});
    if (calculation?.magic) acBreakdown.push({label: "Armor magic bonus", amount: calculation.magic});
    if (shield) acBreakdown.push({label: shield.entry.name, amount: shieldAC});
    for (const rule of conditionalBonuses) if (rule.effects.ac) acBreakdown.push({label: rule.source, amount: rule.effects.ac});
    const reductions = {};
    const resistances = [];
    for (const props of [armorProps, shieldProps]) {
      for (const match of props.matchAll(/\b([a-z]+)\s+reduction\s+(\d+)\b/gi)) {
        const type = lower(match[1]);
        reductions[type] = (reductions[type] || 0) + number(match[2]);
      }
      for (const match of props.matchAll(/\b([a-z]+)\s+resistance\b/gi)) {
        const type = lower(match[1]);
        if (!resistances.includes(type)) resistances.push(type);
      }
    }
    const strengthPermitted = (armor && /^(medium|heavy) armor$/i.test(armor.entry.group))
      || (shield && /^heavy shields?$/i.test(shield.entry.group));
    const attacks = active.filter(gear => category(gear.entry) === "weapon" && !gear.manualAttack)
      .flatMap(gear => weaponAttacks(gear, context, mods, warn));
    const shieldBashUnavailable = has(shieldProps, "versatile") && active.some(gear => category(gear.entry) === "weapon"
      && gear.row.twoHanded && /\b(?:versatile|light)\b/i.test(properties(gear.entry)));
    if (shield) {
      const bash = shieldAttack(shield, context, mods);
      if (bash && !shieldBashUnavailable) attacks.push(bash);
      if (shieldBashUnavailable) warn(shield.entry.name + ": cannot Bash while sharing a two-handed grip with a Light or Versatile weapon.");
      if (/\b(?:brace|repel)\b/i.test(shieldProps)) warn(shield.entry.name + ": Brace or Repel has no defined rule in this compendium.");
    }
    return {
      armorClass: (calculation?.total ?? 10 + Math.max(0, mods.dex)) + shieldAC + bonus("ac"),
      speedPenalty, speedBonus: bonus("speed"), blockCheckBonus: bonus("blockCheck"),
      saveBonuses: {str: bonus("strSave"), dex: bonus("dexSave")},
      combatBlockBonus: bonus("combatBlock"), conditionalBonuses, acBreakdown, armorCalculation: calculation, armed,
      bulk: calculation?.bulk || 0, slow, bolster: rating(shieldProps, "bolster"),
      armorProperties: armorProps, shieldProperties: shieldProps,
      armorBlock: rating(armorProps, "block") + bonus("armorBlock"), shieldBlock: rating(shieldProps, "block"),
      protection: rating(armorProps, "protection") + rating(shieldProps, "protection"),
      blockCheckAbility: strengthPermitted && mods.str > mods.dex ? "str" : "dex",
      blockProficient: Boolean(defenseTrained(armor?.entry, context) || defenseTrained(shield?.entry, context)),
      attacks, reductions, resistances, warnings,
      armor: armor ? clone(armor.entry) : null, shield: shield ? clone(shield.entry) : null
    };
  }

  function defenseSummary(derived) {
    const gear = derived.gear;
    if (!derived.enabled) return {equipment: "Manual defence values", calculation: "", penalty: "", ac: [], notes: ["Use Build character to calculate armor and shield effects automatically."], warnings: []};
    const ac = (gear.acBreakdown || []).map(part => ({...part}));
    const other = derived.armorClass - ac.reduce((sum, part) => sum + part.amount, 0);
    if (other) ac.push({label: "Other character and table bonuses", amount: other});
    const notes = [], calculation = gear.armorCalculation;
    const equation = calculation ? "Armor AC: " + calculation.base + " base + " + calculation.dexterity + " Dexterity"
      + (calculation.strengthPenalty ? " - " + calculation.strengthPenalty + " Bulk" : "")
      + (calculation.floor ? " + " + calculation.floor + " (minimum AC 8)" : "")
      + (calculation.magic ? (calculation.magic > 0 ? " + " : " - ") + Math.abs(calculation.magic) + " magic" : "")
      + " = " + calculation.total + " before shields and character bonuses." : "Unarmored AC: 10 + Dexterity (minimum 0), before shields and character bonuses.";
    let penalty = "";
    if (calculation?.bulk) {
      const lostDexterity = Math.max(0, calculation.dexterityModifier) - calculation.dexterity;
      const sign = value => value >= 0 ? "+" + value : String(value);
      if (lostDexterity || calculation.strengthPenalty) penalty = "Bulk " + calculation.bulk + ": "
        + (lostDexterity ? "removes " + lostDexterity + " Dexterity AC" : "Dexterity adds " + sign(calculation.dexterity) + " AC")
        + (calculation.strengthPenalty ? "; Strength modifier " + sign(calculation.strengthModifier) + " leaves a further -" + calculation.strengthPenalty + " AC penalty" : "; Strength covers the Bulk penalty")
        + (calculation.floor ? ". The minimum armor AC of 8 applies" : "") + ".";
    }
    if (gear.armor) {
      notes.push("Armor properties: " + (gear.armorProperties || "No special properties."));
      if (has(gear.armorProperties, "bulk")) notes.push("Effective Bulk " + gear.bulk + ". Bulk reduces the Dexterity contribution and also penalizes AC when it exceeds your Strength modifier.");
      if (has(gear.armorProperties, "slow")) notes.push("Armor movement penalty: " + gear.speedPenalty + " ft after Strength and active features.");
    }
    if (gear.shield) {
      notes.push("Shield properties: " + (gear.shieldProperties || "No special properties."));
      if (gear.bolster) notes.push("Bolster: spend an action to gain " + gear.bolster + " Temp Block until the start of your next turn. Use Grant Temp Block and track that expiry.");
      if (has(gear.shieldProperties, "spar")) notes.push("Spar: spend a bonus action to use your Athletics or Acrobatics bonus for Block checks until the start of your next turn.");
      if (has(gear.shieldProperties, "versatile")) notes.push("Versatile shield: permits the listed two-handed weapon grips, but you cannot Bash while using that grip.");
    }
    notes.push("Armor Block " + gear.armorBlock + "; shield Block " + gear.shieldBlock + ". Start combat raises remaining Block to " + derived.combatFloor + " if lower. Equipping gear does not refill spent Block.");
    notes.push("Block checks use " + gear.blockCheckAbility.toUpperCase() + (gear.blockProficient ? " + proficiency" : " (untrained)") + "; Protection adds " + gear.protection + ".");
    const reductions = Object.entries(derived.reductions).filter(([, value]) => value > 0);
    if (reductions.length) notes.push("Damage reduction: " + reductions.map(([type, amount]) => type + " " + amount).join(", ") + ". Select the damage type when applying damage.");
    if (derived.resistances.length) notes.push("Resistance: " + derived.resistances.join(", ") + ". Use Apply half damage when it applies.");
    for (const rule of gear.conditionalBonuses || []) notes.push(rule.source + ": " + Object.entries(rule.effects).map(([key, amount]) => ({ac:"AC",blockCheck:"Block check",speed:"speed (ft)",combatBlock:"combat Block",armorBlock:"armor Block",strSave:"Strength saves",dexSave:"Dexterity saves"}[key] || key) + " +" + amount).join(", ") + ".");
    return {equipment: [gear.armor?.name || "No armor", gear.shield?.name || "No shield"].join(" / "), calculation: equation, penalty, ac, notes, warnings: gear.warnings};
  }

  globalThis.CharacterEquipment = {derive, equip, defenseSummary};
})();
