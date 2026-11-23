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
    if ((context.weaponGroups || []).some(group => groups.includes(lower(group)))) return true;
    const light = has(properties(entry), "light");
    return trainingClauses(context.proficiencies?.weapons).some(declaration => {
      const clause = declaration.replace(/^all\s+/, "");
      if (singular(entry.name) === singular(clause) || groups.includes(clause)) return true;
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

  function armorAC(gear, mods) {
    const props = properties(gear.entry);
    const bulk = rating(props, "bulk");
    return Math.max(8, number(gear.entry.details["Base AC"], 10)
      + Math.max(0, mods.dex - bulk) - (has(props, "bulk") ? Math.max(0, bulk - mods.str) : 0)) + number(gear.row.magicBonus);
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
    const armor = best(armors, gear => armorAC(gear, mods));
    const shield = best(shields, gear => number(gear.entry.details["AC bonus"]) + number(gear.row.magicBonus));
    if (armors.length > 1) warn("Multiple armor items are equipped. Only the armor giving the highest AC applies; equip one armor to resolve the conflict.");
    if (shields.length > 1) warn("Multiple shields are equipped. Shield stacking is unresolved; only the highest shield AC bonus and that shield's properties apply.");
    const armorProps = armor ? properties(armor.entry) : "";
    const shieldProps = shield ? properties(shield.entry) : "";
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
    if (shield) {
      const bash = shieldAttack(shield, context, mods);
      if (bash) attacks.push(bash);
      if (/\b(?:brace|repel)\b/i.test(shieldProps)) warn(shield.entry.name + ": Brace or Repel has no defined rule in this compendium.");
    }
    return {
      armorClass: (armor ? armorAC(armor, mods) : 10 + Math.max(0, mods.dex))
        + (shield ? number(shield.entry.details["AC bonus"]) + number(shield.row.magicBonus) : 0),
      speedPenalty: has(armorProps, "slow") ? 5 * Math.max(0, rating(armorProps, "slow") - mods.str) : 0,
      armorBlock: rating(armorProps, "block"), shieldBlock: rating(shieldProps, "block"),
      protection: rating(armorProps, "protection") + rating(shieldProps, "protection"),
      blockCheckAbility: strengthPermitted && mods.str > mods.dex ? "str" : "dex",
      blockProficient: Boolean(defenseTrained(armor?.entry, context) || defenseTrained(shield?.entry, context)),
      attacks, reductions, resistances, warnings,
      armor: armor ? clone(armor.entry) : null, shield: shield ? clone(shield.entry) : null
    };
  }

  globalThis.CharacterEquipment = {derive, equip};
})();
