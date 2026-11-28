"use strict";

(() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const finite = value => typeof value === "number" && Number.isFinite(value) ? value : 0;
  const abilityModifier = value => Math.floor(((Number.isFinite(value) ? value : 10) - 10) / 2);
  const whole = (value, label, minimum = 0) => {
    if (!Number.isSafeInteger(value) || value < minimum) throw new Error(label + " must be a whole number of at least " + minimum + ".");
    return value;
  };
  const spentAt = (character, id) => whole(character.build?.casting?.spent?.[id] ?? 0, "Spent casting capacity");
  function sourceSignature(character) {
    const build = character.build || {}, ledger = build.casting || {};
    return JSON.stringify({level: character.level, abilities: character.abilities,
      enabled: build.enabled, classId: build.classId, raceId: build.raceId,
      archetypes: build.archetypes, choices: build.choices, abilityChoices: build.abilityChoices,
      adjustments: build.adjustments, baseRestDice: build.health?.baseRestDice,
      backgroundId:build.backgroundId,featBenefits:build.featBenefits,featChoices:build.featChoices,qualifications:build.qualifications,restMode:build.health?.restMode,restAdjustment:build.health?.restAdjustment,
      spells: character.spells,
      casting: {enabled: ledger.enabled ?? !(character.spellSlots?.length || character.customResources?.length), maxSlotLevel: ledger.maxSlotLevel, maxLearnLevel:ledger.maxLearnLevel},
      proficiency: character.combat?.proficiencyOverride, restMaximum: character.restDice?.max});
  }
  function requireFresh(character, derived) {
    if (derived.sourceSignature !== sourceSignature(character)) throw new Error("Character casting choices changed. Recalculate casting resources before adjusting this snapshot.");
  }

  function livePool(character, pool) {
    if (pool.kind === "rest-dice") return {...pool, current: Math.min(pool.max, character.restDice?.current || 0)};
    const spent = spentAt(character, pool.id);
    const exhausted = pool.kind === "full" && !!character.build?.casting?.exhausted?.[pool.id];
    return {...pool, spent, current: pool.max === null ? null : exhausted ? 0 : Math.max(0, pool.max - spent)};
  }

  function levelBy(rule, character, classLevel) {
    if (!rule) return null;
    const level = Math.min(12, rule.basis === "classLevel" ? classLevel : character.level);
    const quotient = level / (rule.divisor || 1);
    return rule.rounding === "down" ? Math.floor(quotient) : Math.ceil(quotient);
  }

  function derive(character, cls, context = {}) {
    const profile = cls?.casting || null;
    const stored = character.build?.casting || {};
    const supported = !!profile && ["leveled", "occult", "full", "rest-dice"].includes(profile.mode);
    const legacyPools = !!(character.spellSlots?.length || character.customResources?.length);
    const enabled = !!character.build?.enabled && supported && (stored.enabled ?? !legacyPools);
    const needsMigration = !!character.build?.enabled && supported && stored.enabled === undefined && legacyPools;
    const result = {
      profile: profile ? clone(profile) : null, classId: cls?.id || "", className: cls?.name || "",
      enabled, needsMigration, mode: supported ? profile.mode : null, tradition: profile?.tradition || "",
      pools: [], maxCastLevel: null, knownSpells: null, cantrips: null, spellbookCount: null,
      costs: [], recovery: clone(profile?.recovery || []), warnings: [...(profile?.warnings || []), ...(stored.migrationWarnings || [])],
      sourceSignature: sourceSignature(character)
    };
    if (!supported) return result;
    if (needsMigration) result.warnings.push("Manual spell slots or class resources already exist. Choose Use class slots to enable automatic capacity; manual pools are retained separately.");
    const classLevel = context.classLevel ?? character.level;
    const progression = [...(profile.progression || [])].sort((a, b) => a.level - b.level);
    const row = progression.filter(item => item.level <= classLevel).at(-1);
    result.classLevel = classLevel;
    if (!row) {
      result.warnings.push("No casting progression is supplied for this class level.");
      return result;
    }
    if (classLevel > progression.at(-1).level) result.warnings.push("Casting progression is supplied only through level " + progression.at(-1).level + "; the last supported capacity is shown.");
    if (character.level > 12 && (profile.slotLevelRule || profile.maxCastLevelRule)) result.warnings.push("Varis casting-level rules are supported only through character level 12.");
    result.knownSpells = row.knownSpells==null?null:row.knownSpells+finite(context.effects?.knownSpells);
    result.cantrips = row.cantrips ?? null;
    const scores = context.abilities || character.abilities || {};
    const effects = context.effects || {};
    const additions = {occultSlots: finite(effects.occultSlots), fullSlots: finite(effects.fullSlots), eachSlotLevel: finite(effects.eachSlotLevel), slots: {...effects.slots}};
    const selected = new Set([...(context.selectedOptionIds || []), ...(context.choices || []).filter(choice=>choice.pairComplete!==false).flatMap(choice => choice.selected || [])]);
    const features = new Set((context.features || []).map(feature => typeof feature === "string" ? feature : feature.id));
    for (const modifier of profile.modifiers || []) {
      if (modifier.optionId && !selected.has(modifier.optionId)) continue;
      if (modifier.featureId && !features.has(modifier.featureId)) continue;
      if (!modifier.optionId && !modifier.featureId) continue;
      if (modifier.resource === "slot") additions.slots[modifier.level] = finite(additions.slots[modifier.level]) + finite(modifier.amount);
      else if (["occultSlots", "fullSlots", "eachSlotLevel"].includes(modifier.resource)) additions[modifier.resource] += finite(modifier.amount);
    }
    const prefix = "class:" + cls.id;
    const addPool = pool => result.pools.push(livePool(character, pool));
    if (profile.mode === "leveled") {
      const counts = new Map((row.slots || []).map(slot => [slot.level, slot.max]));
      for (const level of Object.keys(additions.slots)) if (!counts.has(Number(level))) counts.set(Number(level), 0);
      for (const [level, base] of [...counts].sort((a, b) => a[0] - b[0])) {
        const max = Math.max(0, base + (base > 0 ? additions.eachSlotLevel : 0) + finite(additions.slots[level]));
        if (!max) continue;
        addPool({id: prefix + ":slot:" + level, label: "Level " + level + " slots", kind: "slot", level, max, recoverOn: null});
      }
      result.maxCastLevel = Math.max(0, ...result.pools.map(pool => pool.level));
    } else if (profile.mode === "occult") {
      const level = levelBy(profile.slotLevelRule, character, classLevel);
      result.maxCastLevel = level;
      addPool({id: prefix + ":occult", label: "Occult slots", kind: "occult", level,
        max: Math.max(0, finite(row.slotCount) + additions.occultSlots), recoverOn: "long"});
    } else if (profile.mode === "full") {
      const level = stored.maxSlotLevel ?? levelBy(profile.maxCastLevelRule, character, classLevel);
      if (level !== null) { whole(level, "Maximum slot level", 1); if (level > 20) throw new Error("Maximum slot level cannot exceed 20."); }
      result.maxCastLevel = level;
      if (level === null) result.warnings.push("Set the maximum Cleric slot level from your table before spending its individual slots; this progression does not specify that level.");
      const count = Math.max(0, finite(row.slotCount) + additions.fullSlots);
      for (let index = 1; index <= count; index++) addPool({id: prefix + ":full:" + index,
        label: "Full slot " + index, kind: "full", level, max: level, recoverOn: "long"});
    } else {
      result.maxCastLevel = levelBy(profile.maxCastLevelRule, character, classLevel);
      result.costs = Array.from({length: result.maxCastLevel || 0}, (_, index) => ({level: index + 1, resource: "restDice", amount: index + 1}));
      addPool({id: prefix + ":rest-dice", label: "Talent casting · rest dice", kind: "rest-dice", level: result.maxCastLevel,
        max: context.restMaximum ?? character.restDice?.max ?? 0, current: character.restDice?.current || 0, recoverOn: null});
    }
    const book = profile.startingSpellbook;
    if (book) result.spellbookCount = Math.max(0, book.base + abilityModifier(scores[book.ability]) + finite(book.perAdditionalClassLevel) * Math.max(0, Math.min(classLevel, progression.at(-1).level) - 1));
    for (const resource of profile.pointResources || []) {
      if (classLevel < (resource.minLevel || 1)) continue;
      const capacity = resource.capacity || {};
      const max = Math.max(0, finite(capacity.base) + (capacity.ability ? abilityModifier(scores[capacity.ability]) : 0)
        + (resource.id==='metamagic'?finite(effects.metamagicMaximum):0) + (capacity.proficiency ? context.proficiency ?? 2 + Math.floor((character.level - 1) / 3) : 0));
      addPool({id: prefix + ":points:" + resource.id, label: resource.name, kind: "points", level: null, max,
        recoverOn: resource.restoreOn || (cls.name === "Sorcerer" && resource.id === "metamagic" ? "long" : null)});
      result.recovery.push(...clone(resource.recovery || []));
    }
    result.warnings = [...new Set(result.warnings)];
    return result;
  }

  function reconcile(character, derived) {
    const result = clone(character);
    if (!result.build || (!derived.profile && !result.build.casting)) return result;
    const ledger = result.build.casting ||= {};
    ledger.spent ||= {};
    ledger.exhausted ||= {};
    if (derived.profile && derived.enabled && !derived.needsMigration && ledger.enabled === undefined) ledger.enabled = true;
    // Keep inactive pool IDs and spending above a reduced capacity for later restoration.
    for (const [id, amount] of Object.entries(ledger.spent)) whole(amount, "Spent casting capacity for " + id);
    if (derived.enabled) for (const pool of derived.pools) {
      if (pool.kind !== "rest-dice" && ledger.spent[pool.id] === undefined) ledger.spent[pool.id] = 0;
    }
    return result;
  }

  function activate(character, derived) {
    requireFresh(character, derived);
    if (!character.build?.enabled || !derived.mode) throw new Error("Choose a supported casting class before enabling class resources.");
    const result = reconcile(character, derived);
    const ledger = result.build.casting;
    ledger.enabled = true;
    ledger.migrationWarnings ||= [];
    const warn = note => { if (!ledger.migrationWarnings.includes(note)) ledger.migrationWarnings.push(note); };
    const manual = character.spellSlots || [];
    const previous = character.build?.casting || {};
    const seen = id => Object.prototype.hasOwnProperty.call(previous.spent || {}, id) || !!previous.exhausted?.[id];
    const importSpent = (pool, slot) => {
      whole(slot.max, "Manual slot maximum"); whole(slot.current, "Manual slots available");
      ledger.spent[pool.id] = Math.max(0, slot.max - slot.current);
    };
    if (derived.mode === "leveled") {
      for (const pool of derived.pools.filter(pool => pool.kind === "slot" && !seen(pool.id))) {
        const matches = manual.filter(slot => slot.level === pool.level);
        if (matches.length === 1) importSpent(pool, matches[0]);
        else if (matches.length > 1) warn("Review duplicate manual level " + pool.level + " slot rows before allocating class slot spending.");
      }
    } else if (derived.mode === "occult") {
      const pool = derived.pools.find(item => item.kind === "occult");
      if (pool && !seen(pool.id) && manual.length) {
        if (manual.length === 1 && manual[0].level === pool.level) importSpent(pool, manual[0]);
        else warn("Review Occult slot spending manually: the existing slot rows do not unambiguously identify its single shared pool.");
      }
    } else if (derived.mode === "full" && manual.length) {
      warn("Review Cleric slot allocation manually: aggregate manual rows do not identify each individual slot's remaining levels.");
    }
    if (character.customResources?.length) warn("Existing custom resources remain manual; review any overlap with automatic class casting resources.");
    return result;
  }

  function activePool(character, derived, id) {
    requireFresh(character, derived);
    if (!derived.enabled) throw new Error("Enable class casting resources before spending them.");
    const pool = derived.pools.find(item => item.id === id);
    if (!pool) throw new Error("That casting resource pool is no longer active.");
    return livePool(character, pool);
  }

  function change(character, derived, poolId, delta) {
    if (!Number.isSafeInteger(delta)) throw new Error("Casting resource changes must be whole integers.");
    const pool = activePool(character, derived, poolId);
    if (pool.max === null) throw new Error("Configure the maximum slot level before adjusting this pool.");
    if (delta < 0 && -delta > pool.current) throw new Error("Not enough available casting capacity.");
    const result = reconcile(character, derived);
    if (!delta) return result;
    const current = Math.max(0, Math.min(pool.max, pool.current + delta));
    if (pool.kind === "rest-dice") result.restDice.current = current;
    else {
      const ledger = result.build.casting;
      ledger.spent[poolId] = delta < 0 ? spentAt(character, poolId) - delta
        : Math.max(0, spentAt(character, poolId) - Math.min(delta, pool.max - pool.current));
      if (pool.kind === "full" && result.build.casting.exhausted[poolId] && delta > 0) ledger.spent[poolId] = pool.max - current;
      if (pool.kind === "full" && delta > 0) ledger.exhausted[poolId] = false;
    }
    return result;
  }

  function spend(character, derived, poolId, options = {}) {
    const pool = activePool(character, derived, poolId);
    if (pool.max === null || ((pool.kind === "full" || pool.kind === "occult") && pool.level === null)) throw new Error("Configure the maximum slot level before casting.");
    const level = options.level ?? (pool.kind === "rest-dice" ? 1 : pool.kind === "full" ? pool.current : pool.level || 1);
    whole(level, "Spell level", 1);
    if (["slot", "occult", "rest-dice"].includes(pool.kind) && level > pool.level) throw new Error("The spell level exceeds this pool's maximum casting level.");
    if (pool.kind === "full") {
      if (level > pool.current) throw new Error("Not enough available levels remain in this slot.");
      if (options.whole) {
        const result = reconcile(character, derived);
        result.build.casting.exhausted[poolId] = true;
        return result;
      }
      return change(character, derived, poolId, -level);
    }
    return change(character, derived, poolId, pool.kind === "rest-dice" ? -level : -1);
  }

  function rest(character, derived, kind) {
    if (!["short", "long"].includes(kind)) throw new Error("Choose a short or long rest.");
    requireFresh(character, derived);
    const result = reconcile(character, derived);
    if (!derived.enabled) return result;
    for (const pool of derived.pools) {
      if (pool.recoverOn !== kind) continue;
      result.build.casting.spent[pool.id] = 0;
      if (pool.kind === "full") result.build.casting.exhausted[pool.id] = false;
    }
    return result;
  }

  const spellId = entry => entry.entryId || JSON.stringify(['spells',entry.group,entry.name]);
  function spellInfo(entry, tradition = '') {
    const details=entry?.details || {}, group=String(entry?.group || ''), types=String(details.types || '');
    const hex=/hex(?:es)?\b/i.test(group+' '+types), cantrip=!hex && /cantrips?\b/i.test(group+' '+types);
    const raw=globalThis.EntryOrder?.level(entry) ?? Number.parseInt(details.lvl,10);
    const hexLevel=/greater/i.test(group)?3:/major/i.test(group)?2:1;
    const level=hex ? tradition==='any'?hexLevel:null : cantrip?0:Number.isInteger(raw)&&raw>0?raw:null;
    const school=['arcane','occult','mystic','oath'].find(name=>new RegExp('\\b'+name+'\\b','i').test(group)) || '';
    const effect=typeof details.effect==='string'?details.effect:'';
    const area=/\b(?:radius|sphere|cone|cylinder|wall|all creatures|each creature|multiple targets)\b/i.test([details.range,details.target,effect].join(' '));
    const simple=!area && !/\n\s*\*/.test(effect) && (/\bspell attack\b/i.test(effect) || /\b(?:a|one|the) (?:target|creature)\b.*\b(?:damage|takes?)\b/i.test(effect));
    return {level,hex,cantrip,tradition:school,simpleAttack:simple,details};
  }

  function spellAccess(character, derived, entry) {
    const casting=derived?.casting, profile=casting?.profile;
    const info=spellInfo(entry,profile?.tradition);
    if(!profile) return {allowed:false,reason:'Choose a spellcasting class to select class spells.',info};
    if(info.level===null) return {allowed:false,reason:info.hex?'Hexes need a feature that grants them.':'This entry has no spell level.',info};
    if(profile.tradition!=='any' && info.tradition!==profile.tradition) return {allowed:false,reason:`Your class uses the ${profile.tradition} spell list.`,info};
    if(info.cantrip) return {allowed:!!casting.cantrips,reason:casting.cantrips?'':'This class grants no cantrips in its base progression.',info};
    const maximum=profile.tradition==='any' ? character.build?.casting?.maxLearnLevel ?? null : casting.maxCastLevel;
    if(maximum===null) return {allowed:false,reason:profile.mode==='full'?'Set the full-slot level from your table.':'Set the Bard spell-learning level from your table.',info};
    return {allowed:info.level<=maximum,reason:info.level>maximum?`The maximum spell level you can learn is ${maximum}.`:'',info};
  }

  function spellSelection(character, derived, catalog) {
    const casting=derived?.casting, profile=casting?.profile;
    const entries=catalog.filter(section=>section.key==='spells').flatMap(section=>section.entries || []).filter(entry=>entry.group!=='Magic rules');
    const eligible=entries.filter(entry=>spellAccess(character,derived,entry).allowed);
    const chosen=character.spells.filter(row=>!row.featSource && (!row.classId || row.classId===derived.cls?.id) && eligible.some(entry=>spellId(entry)===row.entryId));
    const cantrips=chosen.filter(row=>spellInfo(eligible.find(entry=>spellId(entry)===row.entryId),profile?.tradition).cantrip);
    const spells=chosen.filter(row=>!cantrips.includes(row));
    const limit=casting?.spellbookCount ?? casting?.knownSpells ?? 0;
    const warnings=[];
    if(profile) {
      if(spells.length<limit) warnings.push(`Choose ${limit-spells.length} more ${casting.spellbookCount!==null?'spellbook spells':'spells'}.`);
      if(cantrips.length<(casting.cantrips || 0)) warnings.push(`Choose ${casting.cantrips-cantrips.length} more cantrips.`);
      if(spells.length>limit && !casting.spellbookCount) warnings.push('More spells are recorded than the base class grants. Check feature-granted spells.');
      if(profile.tradition==='any' && character.build?.casting?.maxLearnLevel==null) warnings.push('Set the Bard spell-learning level; the source does not say how to round half Bard level.');
      if(profile.mode==='full' && casting.maxCastLevel===null) warnings.push('Set the full-slot level from your table before choosing levelled spells.');
    }
    return {eligible,chosen,spells,cantrips,spellLimit:limit,cantripLimit:casting?.cantrips || 0,warnings};
  }

  function spellLearningError(character, derived, catalog, entry) {
    if(!entry)return 'Choose a spell.';
    const access=spellAccess(character,derived,entry);
    if(!access.allowed)return access.reason;
    const selection=spellSelection(character,derived,catalog);
    if(access.info.cantrip?selection.cantrips.length>=selection.cantripLimit:selection.spells.length>=selection.spellLimit)return 'The base class selection allowance is full.';
    if(derived.casting.spellbookCount!==null && access.info.level>1) {
      const laterSpells=selection.spells.filter(row=>spellInfo(selection.eligible.find(entry=>spellId(entry)===row.entryId)).level>1).length;
      if(laterSpells>=Math.min(12,character.level)-1)return 'The starting Wizard spellbook choices must be level 1; later class levels grant one additional spell each.';
    }
    return '';
  }

  function castOptions(character, derived, entry, row) {
    if(!entry || derived.featPlan?.sacrificedSpells?.includes(spellId(entry))) return [];
    const casting=derived?.casting, info=spellInfo(entry,casting?.profile?.tradition);
    if(row?.featSource){
      const granted=derived.featPlan?.spells?.find(item=>item.id===row.id);if(!granted)return [];
      const feat=derived.featPlan.sources.find(item=>item.id===row.featSource),manual={id:'feat:manual',poolId:'feat:manual',level:info.level || 0,available:true,label:feat.name+' — resolve its listed cost'};
      if(info.cantrip)return feat.name==='Invoke dark powers'?[manual]:[{id:'free',poolId:'free',level:0,available:true,label:'Granted cantrip — no slot'}];
      if(!['Occult gnosis'].includes(feat.name)){const options=[manual];if(['Forbidden magic','Infernal magic','Waeld-soul','Arcane insight'].includes(feat.name))options.unshift({id:'feat:rest',poolId:'feat:rest',level:info.level,available:character.restDice.current>=info.level,label:info.level+' rest dice — '+feat.name});return options;}
    }
    if(row?.classId && (row.classId!==derived.cls?.id || !spellAccess(character,derived,entry).allowed)) return [];
    if(derived.cls?.name==='Wizard' && !info.cantrip && !row?.prepared) return [];
    if(info.cantrip && !entry.details?.cost) return [{id:'free',poolId:'free',level:0,available:true,label:'Cantrip — no slot'}];
    if(info.level===null || info.level===0) return [];
    const options=[];
    if(casting?.enabled) for(const pool of casting.pools) {
      if(pool.kind==='slot' || pool.kind==='occult') {
        if(pool.level>=info.level) options.push({id:pool.id,poolId:pool.id,level:pool.level,available:pool.current>0,label:`Level ${pool.level} — ${pool.current} ${pool.kind==='occult'?'occult ':''}slots left`});
      } else if(['full','rest-dice'].includes(pool.kind) && pool.level!==null) {
        for(let level=info.level;level<=Math.min(20,pool.level);level++) options.push({id:pool.id+':at:'+level,poolId:pool.id,level,available:pool.current>=level,
          label:`Level ${level} — ${pool.kind==='full'?pool.label+' ('+pool.current+' levels left)':level+' rest '+(level===1?'die':'dice')+' ('+pool.current+' left)'}`});
      }
    }
    else for(const slot of character.spellSlots) if(slot.level>=info.level) options.push({id:'manual:'+slot.level,poolId:'manual:'+slot.level,level:slot.level,available:slot.current>0,label:`Level ${slot.level} — ${slot.current} manual slots left`});
    return options.sort((a,b)=>a.level-b.level || a.label.localeCompare(b.label));
  }

  function castSpell(character, derived, catalog, rowId, optionId) {
    if(derived?.casting) requireFresh(character,derived.casting);
    const row=character.spells.find(item=>item.id===rowId);
    if(!row) throw new Error('This spell is no longer on the character sheet.');
    const entry=catalog.filter(section=>section.key==='spells').flatMap(section=>section.entries || []).find(item=>spellId(item)===row.entryId);
    const conditions=globalThis.CharacterConditions;
    const restriction=conditions?.spellRestriction(conditions.forCharacter(character),entry?.details,derived?.abilities || character.abilities);
    if(restriction) throw new Error(restriction);
    const option=castOptions(character,derived,entry,row).find(item=>item.id===optionId);
    if(!option || !option.available) throw new Error('This spell or casting level is unavailable. Check preparation and remaining slots.');
    let result=clone(character);
    if(option.poolId.startsWith('manual:')) {
      const slot=result.spellSlots.find(slot=>slot.level===option.level);
      slot.current--;
    } else if(option.poolId==='feat:rest')result.restDice.current-=option.level;
    else if(option.poolId!=='free' && option.poolId!=='feat:manual') result=spend(character,derived.casting,option.poolId,{level:option.level});
    const pool=derived?.casting?.pools.find(pool=>pool.id===option.poolId);
    const cost=option.poolId==='feat:manual'?'Resolve the granting rule’s costs and limits':option.poolId==='feat:rest'?'Spent '+option.level+' rest dice; apply any additional feat costs':option.poolId==='free'?'No spell slot spent':pool?.kind==='rest-dice'?`Spent ${option.level} rest ${option.level===1?'die':'dice'}`:pool?.kind==='full'?`Spent ${option.level} levels from ${pool.label}`:`Spent one level ${option.level} ${option.poolId.startsWith('manual:')?'manual ':pool?.kind==='occult'?'occult ':''}slot`;
    return {character:result,name:entry.name,level:option.level,cost,entry};
  }

  globalThis.CharacterCasting = Object.freeze({derive, reconcile, activate, change, spend, rest, spellId, spellInfo, spellAccess, spellSelection, spellLearningError, castOptions, castSpell});
})();
