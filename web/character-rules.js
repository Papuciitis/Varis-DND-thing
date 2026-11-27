"use strict";

(() => {
  const State = globalThis.CharacterState;
  const codes = ["str", "dex", "con", "int", "wis", "cha"];
  const skillAbilities = {Athletics:"str",Stamina:"str",Acrobatics:"dex","Sleight of Hand":"dex",Stealth:"dex",Instinct:"con",Arcana:"int",History:"int",Investigation:"int",Nature:"int",Religion:"int",Mechanism:"int","Animal Handling":"wis",Insight:"wis",Medicine:"wis",Perception:"wis",Survival:"wis",Deception:"cha",Intimidation:"cha",Performance:"cha",Persuasion:"cha"};
  const unique = values => [...new Set(values)];
  const mod = value => State.abilityModifier(value);
  const numeric = value => typeof value === "number" && Number.isFinite(value) ? value : 0;

  function create(metadata = {}, catalog = []) {
    const races = metadata.races || [], classes = metadata.classes || [], archetypes = metadata.archetypes || [];
    const catalogOptions = key => catalog.filter(section=>section.key===key).flatMap(section=>(section.entries || []).map(entry=>({id:JSON.stringify([section.key,entry.group,entry.name]),name:entry.name,details:entry.details})));
    function enable(input) {
      const c = State.normalizeCharacter(input);
      c.build = {...c.build,enabled:true,raceId:c.build?.raceId || "",classId:c.build?.classId || "",
        backgroundId:c.build?.backgroundId || catalogOptions('backgrounds').find(item=>item.name===c.background)?.id || '',
        archetypes:c.build?.archetypes || [],abilityChoices:c.build?.abilityChoices || {},choices:c.build?.choices || {},
        skills:c.build?.skills || [],raceSkills:c.build?.raceSkills || [],weaponGroups:c.build?.weaponGroups || [],
        adjustments:c.build?.adjustments || {},health:{baseHP:c.resources.hp.max,baseRestDice:c.restDice.max,hpMode:"average",poolOrder:["arcaneHealth","tempHP","hp"],...c.build?.health}};
      return State.normalizeCharacter(c);
    }

    function deriveBase(input) {
      const c = State.normalizeCharacter(input), build = c.build || {}, enabled = !!build.enabled;
      const race = enabled ? races.find(r=>r.id===build.raceId) : null;
      const cls = enabled ? classes.find(r=>r.id===build.classId) : null;
      const background = enabled ? catalogOptions('backgrounds').find(item=>item.id===build.backgroundId) : null;
      const abilities = {...c.abilities}, abilityBonuses = Object.fromEntries(codes.map(k=>[k,0]));
      const saves = {...c.training.saves}, skillRanks = {...c.training.skills};
      const warnings = [], features = [], choices = [], effects = [];
      const adjustments = build.adjustments || {};
      const proficiency = c.combat.proficiencyOverride ?? State.proficiencyBonus(c.level);
      const addFeature = (feature,parent,archetypeMinLevel = null) => {
        if ((feature.level || 1)>c.level) return;
        const derivedFeature = {...feature,parent};
        if (archetypeMinLevel !== null) derivedFeature.requiredLevel = Math.max(feature.level || 1,archetypeMinLevel);
        features.push(derivedFeature);
        effects.push(globalThis.CharacterEffects.lookup(parent,feature.name));
      };
      if (race) {
        for (const key of codes) abilityBonuses[key] += numeric(race.abilityBonuses?.[key]);
        for (const choice of race.abilityChoices || []) {
          const selected = build.abilityChoices?.[choice.id] || {};
          const mode = [choice,...choice.alternatives || []][selected.mode || 0] || choice;
          let values = (selected.values || []).filter(v=>mode.options.includes(v));
          if (!mode.repeat) values = unique(values);
          values = values.slice(0,mode.count);
          for (const key of values) abilityBonuses[key] += mode.amount;
          if (values.length<mode.count) warnings.push(`${race.name}: finish ${choice.label}.`);
        }
        for (const f of race.traits || []) addFeature(f,race.name);
      }
      const eligibleArchetypes = [];
      if(background) addFeature({...background,entryId:background.id,level:1,choices:[]},'Background');
      else if(build.backgroundId) warnings.push('The selected background is missing from this rules snapshot.');
      if (cls) {
        for (const key of cls.saves || []) saves[key]=true;
        const validSkills = unique(build.skills || []).filter(k=>cls.skillChoice?.options.includes(k)).slice(0,cls.skillChoice?.count || 0);
        for (const key of validSkills) skillRanks[key] = Math.max(1,skillRanks[key] || 0);
        if (cls.skillChoice && validSkills.length<cls.skillChoice.count) warnings.push(`${cls.name}: choose ${cls.skillChoice.count} class skills.`);
        for (const f of cls.features || []) addFeature(f,cls.name);
        const slots = (cls.archetypeLevels || []).filter(level=>level<=c.level);
        const seen = new Set();
        for (let i=0;i<slots.length;i++) {
          const selected = archetypes.find(a=>a.id===build.archetypes?.[i]);
          if (!selected) { warnings.push(`Choose an archetype for level ${slots[i]}.`); continue; }
          if (selected.className.toLowerCase()!==cls.name.toLowerCase() || selected.minLevel>slots[i] || seen.has(selected.id)) {
            warnings.push(`${selected.name} is not eligible for the level ${slots[i]} archetype slot.`); continue;
          }
          seen.add(selected.id); eligibleArchetypes.push(selected);
          for (const f of selected.features || []) addFeature(f,selected.name,selected.minLevel);
          if (selected.status) warnings.push(`${selected.name}: ${selected.status}`);
        }
      }
      const activeFeatures = new Set(features.map(feature=>feature.id));
      const featOptions = catalogOptions('feats');
      const definitions = [];
      const asiAlternatives = features.flatMap(feature=>(feature.choices || []).filter(group=>group.asiAlternative).map(group=>({feature,group})));
      const bonusAlternatives = features.flatMap(feature=>(feature.choices || []).filter(group=>group.bonusAlternative===cls?.name).map(group=>({feature,group})));
      for (const feature of [...features]) {
        const parent = feature.parent;
        let groups=[...(feature.choices || [])];
        if(/ability.score.improvement/i.test(feature.name) && !groups.some(group=>group.label==='Ability score improvement')) {
          const names={str:'Strength',dex:'Dexterity',con:'Constitution',int:'Intelligence',wis:'Wisdom',cha:'Charisma'};
          const options=codes.map(key=>({id:feature.id+':'+key,name:'+2 '+names[key],details:'Increase the base score through this feature.',effects:{abilities:{[key]:2}}}));
          for(let i=0;i<codes.length;i++)for(let j=i+1;j<codes.length;j++)options.push({id:feature.id+':'+codes[i]+':'+codes[j],name:'+1 '+names[codes[i]]+' / +1 '+names[codes[j]],details:'Increase two different scores.',effects:{abilities:{[codes[i]]:1,[codes[j]]:1}}});
          options.push({id:feature.id+':feat',name:'Take a feat',details:'Choose a feat from the list below. Read its requirements and rules before saving.'});
          for(const alternative of asiAlternatives) if(alternative.feature.level<=feature.level) {
            options.push({id:feature.id+':instead:'+alternative.group.id,name:`Take ${alternative.group.asiAlternative} ${alternative.feature.name} upgrades`,details:alternative.feature.details,
              choiceGrants:[{groupId:alternative.group.id,count:alternative.group.asiAlternative}]});
          }
          groups=[{id:feature.id+':asi',label:'Ability score improvement',count:1,options},...groups];
        }
        const optionalSets = unique(groups.map(group=>group.optionalSet).filter(Boolean));
        if(/ability.score.improvement/i.test(feature.name)) groups=groups.map(group=>{
          if(group.id===feature.id+':asi' || group.optionalSet) return group;
          const alternatives=bonusAlternatives.filter(item=>item.feature.level<=feature.level);
          return {...group,options:[...group.options,...alternatives.map(item=>({id:group.id+':instead:'+item.group.id,name:'Take an extra '+item.feature.name+' upgrade',details:item.feature.details,choiceGrants:[{groupId:item.group.id,count:1}]}))]};
        });
        for(const set of optionalSets) {
          const gate={groupId:set+':optional',optionId:set+':accept'};
          groups=groups.map(group=>group.optionalSet===set ? {...group,requiresChoice:gate} : group);
          groups.unshift({id:gate.groupId,label:'Extra mark and reward (optional)',count:1,optional:true,
            options:[{id:gate.optionId,name:'Take an extra mark and reward',details:'Choose both a mark and a reward. The mark applies along with its reward.'}]});
        }
        if(groups.some(group=>group.id===feature.id+':asi')) groups.push({id:feature.id+':feat-choice',label:'Feat',kind:'feat',count:1,options:featOptions,
          requiresChoice:{groupId:feature.id+':asi',optionId:feature.id+':feat'}});
        for (const sourceGroup of groups) {
          definitions.push({...sourceGroup,parent,featureId:feature.id,featureName:feature.name,level:feature.level});
        }
      }
      let resolved = new Map(), grants = new Map(), signature = '';
      // Choices may grant slots in an earlier feature. Resolve the dependencies
      // before applying effects, so an inactive branch never grants extra slots.
      for(let pass=0;pass<=definitions.length;pass++) {
        const next=new Map();
        for(const sourceGroup of definitions) {
          const requirement=sourceGroup.requiresChoice;
          if(requirement && !resolved.get(requirement.groupId)?.selected.includes(requirement.optionId)) continue;
          const count = (sourceGroup.countByLevel?.filter(row=>row.level<=c.level).at(-1)?.count ?? sourceGroup.count)
            + (sourceGroup.additionalGrants || []).filter(grant=>activeFeatures.has(grant.featureId)).reduce((total,grant)=>total+(grant.countByLevel?.filter(row=>row.level<=c.level).at(-1)?.count ?? grant.count),0)
            + (grants.get(sourceGroup.id) || 0);
          const group = {...sourceGroup,count};
          const stored = (build.choices?.[group.id] || []).slice(0,count), counts = new Map();
          let selectedSlots = stored.map(id=>{
            const option=group.options.find(item=>item.id===id), used=counts.get(id) || 0;
            if(!option || used>=(option.repeatLimit || 1)) return '';
            counts.set(id,used+1);return id;
          });
          // A tree can be chosen in either slot order, but every selected node
          // must retain its entire prerequisite chain. Imported saves use this
          // same validation, without deleting choices which are now inactive.
          let previous;
          do {
            previous=selectedSlots.join('\n');
            selectedSlots=selectedSlots.map(id=>id && (group.options.find(option=>option.id===id).requires || []).every(required=>selectedSlots.includes(required)) ? id : '');
          } while(previous!==selectedSlots.join('\n'));
          const selected = selectedSlots.filter(Boolean);
          const options=group.options.map(option=>({...option,unavailableReason:(option.requires || []).filter(id=>!selected.includes(id)).map(id=>'Requires '+(group.options.find(item=>item.id===id)?.name || 'an earlier choice')).join('; ')}));
          next.set(group.id,{...group,options,selected,selectedSlots,invalid:stored.some((id,index)=>id && !selectedSlots[index])});
        }
        const nextSignature=JSON.stringify([...next].map(([id,group])=>[id,group.count,group.selectedSlots]));
        resolved=next;
        if(nextSignature===signature) break;
        signature=nextSignature;
        grants=new Map();
        for(const group of resolved.values()) for(const id of group.selected) {
          for(const grant of group.options.find(option=>option.id===id).choiceGrants || []) grants.set(grant.groupId,(grants.get(grant.groupId) || 0)+grant.count);
        }
      }
      for(const group of resolved.values()) {
          choices.push(group);
          if (!group.optional && group.selected.length<group.count) warnings.push(`${group.parent}: choose ${group.count} for ${group.label}.`);
          if(group.invalid) warnings.push(`${group.parent}: review unavailable or repeated selections for ${group.label}.`);
          const siblings=group.optionalSet ? [...resolved.values()].filter(item=>item.optionalSet===group.optionalSet) : [];
          if(siblings.some(item=>item.selected.length<item.count)) continue;
          for (const id of group.selected) {
            const option = group.options.find(o=>o.id===id);
            effects.push(globalThis.CharacterEffects.lookup(group.parent,group.effectFeature || group.featureName,option.name));
            if(option.effects)effects.push(option.effects);
            if(group.kind==='feat') features.push({id:group.id+':'+id,entryId:id,name:option.name,level:group.level,parent:'Feat',details:option.details,choices:[]});
          }
      }
      const combined = {abilities:{},skillBonuses:{},saveBonuses:{},skills:{},saves:{},reductions:{},abilitySkillBonuses:{},resistances:[],immunities:[],languages:[]};
      for (const effect of effects) {
        for (const [key,value] of Object.entries(effect || {})) {
          if (key==='notes') continue;
          if (['removeResistances','removeImmunities'].includes(key)) continue;
          if (Array.isArray(value)) combined[key]=unique([...(combined[key] || []),...value]);
          else if (value && typeof value==='object') {
            combined[key] ||= {};
            for (const [stat,amount] of Object.entries(value)) {
              if (key==='skills') combined[key][stat]=Math.max(combined[key][stat] || 0,amount);
              else if (key==='saves') combined[key][stat]=combined[key][stat] || amount;
              else combined[key][stat]=numeric(combined[key][stat])+numeric(amount);
            }
          } else if (typeof value==='number') combined[key]=numeric(combined[key])+value;
        }
      }
      for (const effect of effects) {
        for (const type of effect.removeResistances || []) combined.resistances=combined.resistances.filter(x=>x!==type);
        for (const type of effect.removeImmunities || []) combined.immunities=combined.immunities.filter(x=>x!==type);
      }
      for (const key of codes) { abilityBonuses[key]+=numeric(combined.abilities[key]);abilities[key]+=abilityBonuses[key];saves[key] ||= !!combined.saves[key]; }
      for(const grant of combined.cappedAbilities || []) {
        const amount=Math.max(0,Math.min(grant.amount,grant.maximum-abilities[grant.ability]));
        abilities[grant.ability]+=amount;abilityBonuses[grant.ability]+=amount;
      }
      for (const [key,rank] of Object.entries(combined.skills)) skillRanks[key]=Math.max(rank,skillRanks[key] || 0);
      // Ancestry skill choices are independent of class skills and manual training.
      const raceSkillText=(race?.proficiencies || []).join(' ');
      const countMatch=raceSkillText.match(/(\d+|one|two|three)\s+skills?\b/i) || raceSkillText.match(/\b(\d+)\s+of\s+(?:athletics|survival|intimidation|religion|deception)/i);
      const raceSkillCount=countMatch ? ({one:1,two:2,three:3}[countMatch[1].toLowerCase()] || Number(countMatch[1])) : 0;
      const skillText=(race?.proficiencies || []).find(t=>/\bskills?\b/i.test(t) || /\b\d+\s+of\s+(?:athletics|survival)/i.test(t)) || '';
      const raceSkillOptions=/\bfrom\b|^\d+\s+of\b/i.test(skillText)?Object.keys(skillAbilities).filter(k=>skillText.toLowerCase().replace('handle-animal','animal handling').includes(k.toLowerCase())):Object.keys(skillAbilities);
      const raceSkillRank=/\bexpertise\b/i.test(skillText)?2:1;
      for (const skill of unique(build.raceSkills || []).filter(k=>raceSkillOptions.includes(k)).slice(0,raceSkillCount)) skillRanks[skill]=Math.max(raceSkillRank,skillRanks[skill] || 0);
      const proficiencies = {...c.proficiencies};
      for (const key of ['weapons','armor','tools']) {
        const racial=(race?.proficiencies || []).filter(text=>key==='armor'?/\barmor|\barmour|\bshield/i.test(text):key==='weapons'?/\bweapons?\b/i.test(text):/\btools?\b|\binstrument/i.test(text));
        proficiencies[key]=[cls?.proficiencies?.[key],...racial,c.proficiencies[key]].filter(Boolean).join('; ');
      }
      proficiencies.languages=[c.proficiencies.languages,...combined.languages].filter(Boolean).join('; ');
      let gear = {armorClass:c.combat.armorClass,speedPenalty:0,armorBlock:0,shieldBlock:0,protection:0,blockCheckAbility:'dex',blockProficient:false,attacks:[],reductions:{},resistances:[],warnings:[]};
      if (enabled) gear=globalThis.CharacterEquipment.derive(c,catalog,{abilities,proficiency,proficiencies,weaponGroups:build.weaponGroups || [],raceSize:race?.size || 'medium',speed:race?.speed ?? c.combat.speed,offHandAbilityDamage:!!combined.offHandAbilityDamage});
      const armorClass=enabled ? gear.armorClass+numeric(combined.ac)+numeric(adjustments.ac) : c.combat.armorClass;
      const speed=enabled ? Math.max(0,(race?.speed ?? c.combat.speed)+numeric(combined.speed)+numeric(adjustments.speed)-gear.speedPenalty) : c.combat.speed;
      const blockMaximum=enabled ? Math.max(0,mod(abilities.dex)+numeric(combined.dexBlock))+numeric(combined.block)+numeric(combined.combatBlock)+gear.armorBlock+gear.shieldBlock+numeric(adjustments.block) : c.resources.block.max;
      const blockCheck=mod(abilities[gear.blockCheckAbility])+(gear.blockProficient?proficiency:0)+gear.protection+numeric(combined.blockCheck)+numeric(adjustments.blockCheck);
      const health = build.health || {};
      let hpBase=health.baseHP ?? c.resources.hp.max, hpExplanation='Manual base HP';
      if (enabled && cls && health.hpMode!=='manual') {
        const sides=Number(cls.hitDie?.match(/d(\d+)/i)?.[1]);
        if (sides) {
          for (let level=2;level<=c.level;level++) {
            const roll=health.rolls?.[level-2];
            if (health.hpMode==='rolled' && !(roll>=1 && roll<=sides)) warnings.push(`Record the level ${level} HP roll; its fixed average is shown until then.`);
          }
          hpBase=Math.max(1,sides+mod(abilities.con)+numeric(combined.hpPerLevel));
          for(let level=2;level<=c.level;level++) {
            const roll=health.hpMode==='rolled' && health.rolls?.[level-2]>=1 && health.rolls[level-2]<=sides ? health.rolls[level-2] : sides/2+1;
            hpBase+=Math.max(1,roll+mod(abilities.con)+numeric(combined.hpPerLevel));
          }
          hpExplanation=`${cls.hitDie} maximum at level 1; ${health.hpMode==='rolled'?'recorded rolls':'fixed average'} + CON at later levels`;
        }
      } else if (enabled && health.progression) {
        hpBase=health.firstLevelHP+health.perLevelHP*(c.level-1)+(health.conPerLevel?mod(abilities.con)*c.level:0);
        hpExplanation='Configured HP progression';
      }
      const hpMaximum=enabled ? Math.max(1,hpBase+numeric(combined.hpFlat)+(cls && health.hpMode!=='manual'?0:numeric(combined.hpPerLevel)*c.level)) : c.resources.hp.max;
      const restMaximum=enabled ? Math.max(0,(health.baseRestDice ?? c.restDice.max)+numeric(combined.restDice)) : c.restDice.max;
      const attacks=gear.attacks.map(a=>({...a,bonus:a.bonus+numeric(combined.weaponAttack),damage:a.damage+(numeric(combined.damage)+numeric(combined.weaponDamage)?` ${numeric(combined.damage)+numeric(combined.weaponDamage)>=0?'+':'−'} ${Math.abs(numeric(combined.damage)+numeric(combined.weaponDamage))}`:'')}));
      const skillBonuses={...c.training.skillBonuses},saveBonuses={...c.training.saveBonuses};
      for(const skill of Object.keys(skillAbilities)) skillBonuses[skill]=numeric(skillBonuses[skill])+numeric(combined.skillBonuses[skill])+numeric(combined.abilitySkillBonuses[skillAbilities[skill]]);
      for(const key of codes) saveBonuses[key]=numeric(saveBonuses[key])+numeric(combined.saveBonuses[key]);
      const castingAbility=c.combat.spellAbility || cls?.castingAbilities?.[0] || '';
      const reductions={...gear.reductions};for(const [key,value] of Object.entries(combined.reductions)) reductions[key]=Math.max(reductions[key] || 0,value);
      warnings.push(...gear.warnings,...race?.warnings || [],...cls?.warnings || []);
      const casting = globalThis.CharacterCasting?.derive(c,enabled ? cls : null,{abilities,effects:combined,choices,features,proficiency,restMaximum}) || null;
      if (casting) warnings.push(...casting.warnings);
      if(c.level>12 && enabled) warnings.push('The current Varis progression ends at level 12.');
      return {enabled,race,cls,background,eligibleArchetypes,abilities,abilityBonuses,saves,skillRanks,skillBonuses,saveBonuses,proficiencies,proficiency,armorClass,speed,blockMaximum,blockCheck,combatFloor:gear.armorBlock+gear.shieldBlock+numeric(combined.combatBlock),hpMaximum,hpExplanation,restMaximum,deathSaveSlots:Math.max(1,3+numeric(combined.deathSaveSlots)),castingAbility,casting,initiative:mod(abilities.dex)+c.combat.initiativeBonus+numeric(combined.initiative),features,choices,attacks,raceSkillCount,raceSkillOptions,reductions,resistances:unique([...gear.resistances,...combined.resistances]),immunities:combined.immunities,warnings:unique(warnings),gear,effects:combined};
    }

    function derive(input) {
      const c=State.normalizeCharacter(input),base=deriveBase(c),conditions=globalThis.CharacterConditions;
      if(!conditions)return base;
      const rows=conditions.forCharacter(c),state=conditions.status(rows,{speed:base.speed,abilities:base.abilities,size:c.size || base.race?.size});
      const result={...base,conditionBase:base,conditionState:state,conditions:rows,speed:state.speed};
      if(state.flags.noProficiency){
        const without=deriveBase({...c,combat:{...c.combat,proficiencyOverride:0}});
        for(const field of ['proficiency','skillBonuses','saveBonuses','attacks','blockCheck'])result[field]=without[field];
      }
      if(state.ids.includes('ethereal'))result.immunities=[...base.immunities,'physical'];
      return result;
    }
    function reconcile(input) {
      const c=State.normalizeCharacter(input);if(!c.build?.enabled)return c;
      const d=deriveBase(c),missingHP=c.resources.hp.max-c.resources.hp.current;
      c.resources.hp.max=d.hpMaximum;c.resources.hp.current=Math.max(0,d.hpMaximum-missingHP);
      c.resources.block.max=Math.max(0,d.blockMaximum);c.resources.block.current=Math.min(c.resources.block.current,c.resources.block.max);
      c.restDice.max=d.restMaximum;c.restDice.current=Math.min(c.restDice.current,c.restDice.max);
      c.deathSaves.successes=Math.min(c.deathSaves.successes,d.deathSaveSlots);c.deathSaves.failures=Math.min(c.deathSaves.failures,d.deathSaveSlots);
      c.ancestry=d.race?.name || c.ancestry;c.className=d.cls?.name || c.className;
      if(d.background)c.background=d.background.name;
      c.subclass=d.eligibleArchetypes.map(a=>a.name).join(', ');
      if(d.cls?.hitDie)c.restDice.die=d.cls.hitDie;
      return d.casting ? globalThis.CharacterCasting.reconcile(c,d.casting) : c;
    }

    function damage(input,amount,options={}) {
      if(!Number.isSafeInteger(amount)||amount<0)throw new Error('Enter a nonnegative whole damage amount.');
      const c=reconcile(input),d=derive(c),type=(options.type || '').toLowerCase(),physical=['piercing','slashing','bludgeoning'].includes(type);
      let remaining=amount;
      if(type && options.reduce!==false) {
        remaining=Math.max(0,remaining-Math.max(d.reductions.all || 0,d.reductions[type] || 0,physical?d.reductions.physical || 0:0));
        if(d.immunities.includes(type)||d.immunities.includes('all') || physical && d.immunities.includes('physical'))remaining=0;
      }
      const soakedResistance=type==='fire' && options.reduce!==false && remaining<=10 && d.conditionState?.ids.includes('soaked');
      if(options.half || soakedResistance)remaining=Math.floor(remaining/2);
      const afterDefence=remaining,changes=[];
      const order=options.pool==='auto' ? c.build?.health.poolOrder || [] : [options.pool || 'hp'];
      if(!order.length)throw new Error('Choose the damage pool order first.');
      for(const key of order) {
        if(!['hp','tempHP','arcaneHealth'].includes(key))throw new Error('Unknown health pool.');
        const used=Math.min(c.resources[key].current,remaining);c.resources[key].current-=used;remaining-=used;
        if(used)changes.push({pool:key,amount:used});
      }
      return {character:c,changes,afterDefence,unabsorbed:remaining};
    }

    function heal(input,amount,pool='hp') {
      if(!Number.isSafeInteger(amount)||amount<0)throw new Error('Enter a nonnegative whole healing amount.');
      const c=reconcile(input);if(!['hp','tempHP','arcaneHealth'].includes(pool))throw new Error('Choose a health pool.');
      const diseased=globalThis.CharacterConditions?globalThis.CharacterConditions.has(globalThis.CharacterConditions.forCharacter(c),'diseased'):c.conditions.some(s=>/^diseased\b/i.test(s));
      return State.resourceDelta(c,pool,diseased?Math.floor(amount/2):amount);
    }

    function rest(input,kind) {
      const c=reconcile(input),d=derive(c);c.resources.block.current=c.resources.block.max;
      if(globalThis.CharacterConditions){
        const conditions=globalThis.CharacterConditions,active=conditions.forCharacter(c);
        const fatigue=active.find(row=>row.id==='fatigue')?.stacks || 0;
        const remaining=kind==='long'?0:Math.max(0,fatigue-Math.max(1,mod(d.abilities.con)));
        const rows=active.filter(row=>row.id!=='fatigue');
        if(remaining)rows.push({id:'fatigue',stacks:remaining});
        c.conditions=globalThis.CharacterConditions.serialise(rows);
        if(c.build?.health)c.build.health.fatigue=remaining;
      }else if(c.build?.enabled)c.build.health.fatigue=kind==='long'?0:Math.max(0,c.build.health.fatigue-Math.max(1,mod(d.abilities.con)));
      return d.casting ? globalThis.CharacterCasting.rest(c,d.casting,kind) : c;
    }

    function startCombat(input) {
      const c=reconcile(input),d=derive(c);if(c.build?.combatActive)return c;
      if(c.build){c.build.combatActive=true;c.build.combatFloor=d.combatFloor;}
      c.resources.block.current=Math.max(c.resources.block.current,d.combatFloor);
      if(d.effects.combatTempBlock) {c.resources.tempBlock.current=Math.max(c.resources.tempBlock.current,d.effects.combatTempBlock);c.resources.tempBlock.max=Math.max(c.resources.tempBlock.max,c.resources.tempBlock.current);}
      return c;
    }
    function endCombat(input) {
      const c=reconcile(input);if(!c.build?.combatActive)return c;
      c.resources.block.current=Math.max(0,c.resources.block.current-c.build.combatFloor);
      c.build.combatActive=false;c.build.combatFloor=0;return c;
    }
    function fatiguePenalty(input,rollDie=sides=>Math.floor(Math.random()*sides)+1) {
      const level=globalThis.CharacterConditions?globalThis.CharacterConditions.forCharacter(input).find(row=>row.id==='fatigue')?.stacks || 0:input.build?.health?.fatigue || 0,sides={2:2,3:3,4:4,5:6,8:8,9:10,10:12}[level];
      return {amount:level===1?1:sides?rollDie(sides):0,notation:level===1?'1':sides?'1d'+sides:'',unresolved:level===6||level===7};
    }
    return Object.freeze({metadata,catalog,derive,enable,reconcile,damage,heal,rest,startCombat,endCombat,fatiguePenalty});
  }
  globalThis.CharacterRules=Object.freeze({create,skillAbilities});
})();
