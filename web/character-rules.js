"use strict";

(() => {
  const State = globalThis.CharacterState;
  const codes = ["str", "dex", "con", "int", "wis", "cha"];
  const skillAbilities = {Athletics:"str",Stamina:"str",Acrobatics:"dex","Sleight of Hand":"dex",Stealth:"dex",Instinct:"con",Arcana:"int",History:"int",Investigation:"int",Nature:"int",Religion:"int",Mechanism:"int","Animal Handling":"wis",Insight:"wis",Medicine:"wis",Perception:"wis",Survival:"wis",Deception:"cha",Intimidation:"cha",Performance:"cha",Persuasion:"cha"};
  const unique = values => [...new Set(values)];
  const mod = value => State.abilityModifier(value);
  const numeric = value => typeof value === "number" && Number.isFinite(value) ? value : 0;

  // Allocate constrained bonus picks independently of click order. When a level
  // adds an ordinary slot, an existing eligible pick can move into its bonus slot.
  function placeChoice(group,optionId) {
    if(!optionId || !group.options.some(option=>option.id===optionId))return null;
    const slots=Array.from({length:group.count},(_,index)=>group.selectedSlots[index] || '');
    if(slots.every(Boolean))return null;
    const permits=(id,index)=>index<group.baseCount || !group.bonusSlots[index-group.baseCount]?.allowed || group.bonusSlots[index-group.baseCount].allowed.includes(id);
    function place(id,visited) {
      const available=slots.map((_,index)=>index).filter(index=>!visited.has(index) && permits(id,index));
      for(const index of available)if(!slots[index]){slots[index]=id;return true;}
      for(const index of available){visited.add(index);if(place(slots[index],visited)){slots[index]=id;return true;}}
      return false;
    }
    return place(optionId,new Set())?slots:null;
  }

  function permanentSpellUpgrades(raw) {
    if(typeof raw!=='string')return [];
    const grants=[];
    for(const text of raw.split(/(?<=[.!?])\s+|\n\n/)) {
      if(/temporar|as (?:an?|a bonus|a full.round) action|while wearing|until|one of the following|following benefits|causing|for \d+d?\d* (?:round|minute|hour)/i.test(text))continue;
      let match=text.match(/upgrade (?:every|all) (hex(?:es)?(?: (?:and|or) cantrips?)?|cantrips?(?: (?:and|or) hex(?:es)?)?)(?: (?:that )?you know)?(?: (once|twice|three times))?/i);
      if(match){grants.push({kind:/hex/i.test(match[1])?/cantrip/i.test(match[1])?'both':'hex':'cantrip',all:true,amount:match[2]==='twice'?2:match[2]==='three times'?3:1});continue;}
      match=text.match(/upgrade (up to two|two|one|1|2|a|an) (cantrips?|hex(?:es)?)(?: or (?:a )?(cantrip|hex))?(?: (?:that )?you know| of choice)?(?: (?:by )?(one|two|three|1|2|3|once|twice)(?: times| steps)?)?/i);
      if(match){grants.push({kind:match[3]?'both':/hex/i.test(match[2])?'hex':'cantrip',count:/two|2/.test(match[1])?2:1,amount:/two|twice|2/.test(match[4] || '')?2:/three|3/.test(match[4] || '')?3:1,optional:/up to/.test(match[1])});continue;}
      match=text.match(/(?:grant a cantrip you know one extra permanent upgrade|upgrade a hex again|gain (?:an? |one |two |2 )?(?:extra )?(?:hex|cantrip) upgrades?)/i);
      if(match){const levels=[...text.matchAll(/\b(\d+)(?:st|nd|rd|th)\b/g)].map(match=>Number(match[1]));grants.push({kind:/cantrip/i.test(match[0])?'cantrip':'hex',count:/two|2/.test(match[0])?2:1,amount:1,levels,repeat:levels.length>1});}
    }
    return grants.map(grant=>({...grant,repeat:grant.repeat || (grant.kind==='hex'?/same hex/i.test(raw):grant.kind==='cantrip'?/same cantrip/i.test(raw):/same (?:hex|cantrip)/i.test(raw))}));
  }

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

    function deriveCore(input,featPlan={}) {
      const c = State.normalizeCharacter(input), build = c.build || {}, enabled = !!build.enabled;
      const race = enabled ? races.find(r=>r.id===build.raceId) : null;
      const cls = enabled ? classes.find(r=>r.id===build.classId) : null;
      const background = enabled ? catalogOptions('backgrounds').find(item=>item.id===build.backgroundId) : null;
      const abilities = {...c.abilities}, abilityBonuses = Object.fromEntries(codes.map(k=>[k,0]));
      const saves = {...c.training.saves}, skillRanks = {...c.training.skills};
      const warnings = [], features = [], choices = [], effects = [], timedEffects = [];
      const recordEffect=(effect,level=1,sourceFeat='')=>{effects.push(effect);timedEffects.push({effect,level,sourceFeat});};
      const adjustments = build.adjustments || {};
      const proficiency = c.combat.proficiencyOverride ?? State.proficiencyBonus(c.level);
      const addFeature = (feature,parent,archetypeMinLevel = null) => {
        if ((feature.level || 1)>c.level) return;
        const derivedFeature = {...feature,parent};
        if (archetypeMinLevel !== null) derivedFeature.requiredLevel = Math.max(feature.level || 1,archetypeMinLevel);
        features.push(derivedFeature);
        recordEffect(globalThis.CharacterEffects.lookup(parent,feature.name),derivedFeature.requiredLevel ?? feature.level ?? 1);
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
      const known=[...new Map([...c.spells.filter(row=>!row.featSource || (featPlan.spells || []).some(item=>item.id===row.id)),...(featPlan.spells || [])].map(row=>[row.id,row])).values()];
      const profiles=(metadata.spellProgressions || []).filter(profile=>!featPlan.sacrificedSpells?.includes(profile.entryId) && known.some(row=>row.entryId===profile.entryId && (!row.classId || row.classId===cls?.id)));
      const upgradeSources=[];
      for(const feature of [...features]) {
        upgradeSources.push({id:feature.id,name:feature.name,parent:feature.parent,level:feature.requiredLevel ?? feature.level ?? 1,text:feature.spellUpgradeText ?? (typeof feature.details==='string'?feature.details.split(/\n\s*\*/)[0]:'')});
        for(const group of feature.choices || []) {const occurrences=new Map();for(const [index,id] of (group.automatic?group.options.map(option=>option.id):build.choices[group.id] || []).entries()) {
          const occurrence=occurrences.get(id) || 0;occurrences.set(id,occurrence+1);const item=group.options.find(option=>option.id===id);if(item)upgradeSources.push({id:group.id+':'+index+':'+id,groupId:group.id,optionId:id,repeatable:(item.repeatLimit || 1)>1,name:item.name,parent:feature.parent,level:feature.requiredLevel ?? feature.level ?? 1,text:item.ownDetails ?? item.details,gate:{groupId:group.id,optionId:id,occurrence}});
        }}
      }
      const universal=[];
      for(const source of upgradeSources)for(const [index,grant] of permanentSpellUpgrades(source.text).entries()) {
        const eligible=profiles.filter(profile=>profile.options.length && (grant.kind==='both' || grant.kind===profile.kind));
        const amount=grant.levels?.length?grant.levels.filter(level=>level<=c.level).length:grant.count || 1;if(!amount || !eligible.length)continue;
        const previous=!source.repeatable && source.groupId && Object.keys(build.choices).find(key=>key.startsWith(source.groupId+':') && key.endsWith(':'+source.optionId+':spell-upgrade:'+index+':target'));
        const id=previous?previous.slice(0,-':target'.length):source.id+':spell-upgrade:'+index;
        if(grant.all){for(const profile of eligible)universal.push({entryId:profile.entryId,featureId:source.id,requiresChoice:source.gate,count:grant.amount});continue;}
        const groups=grant.all?[]:[{id:id+':target',label:'Choose '+grant.kind+' to upgrade',count:amount,optional:!!grant.optional,requiresChoice:source.gate,options:eligible.map(profile=>({id:profile.entryId,name:profile.name,repeatLimit:grant.repeat?amount:1,details:'Grants '+grant.amount+' upgrade choice'+(grant.amount===1?'':'s')+' from this spell’s list. Choose the upgrades on the Spells step.',choiceGrants:[{groupId:profile.id,count:grant.amount}]}))}];
        addFeature({id,name:source.name+' — spell upgrades',level:source.level,details:source.text,choices:groups,requiresSource:source.gate},source.parent);
      }
      for(const profile of profiles) {
        const rows=known.filter(row=>row.entryId===profile.entryId),normal=rows.some(row=>row.progressionMode!=='cypher'),levels=normal?profile.levels.filter(level=>level<=c.level):[],manual=normal?0:Math.max(0,...rows.map(row=>row.manualUpgrades || 0)),group={id:profile.id,label:profile.kind==='hex'?'Hex upgrades':'Cantrip upgrades',spellEntryId:profile.entryId,count:levels.length+manual,maxCount:normal?undefined:5,additionalGrants:universal.filter(grant=>grant.entryId===profile.entryId),options:profile.options.map(option=>({...option,effects:profile.name.toLowerCase()==='ward' && /bonus to death saves/i.test(option.details)?{deathSaveBonus:c.level>=9?2:1}:undefined}))};
        addFeature({id:profile.id+':feature',name:profile.name+' upgrades',level:1,spellEntryId:profile.entryId,details:profile.source,choices:profile.options.length?[group]:[]},'Cantrip');
      }
      const activeFeatures = new Set(features.map(feature=>feature.id));
      const featOptions = catalogOptions('feats').map(option=>({...option,repeatLimit:globalThis.CharacterFeats?.repeatLimit(option) || 1}));
      const ancestryBonuses = {...abilityBonuses};
      const definitions = [];
      const asiAlternatives = features.flatMap(feature=>(feature.choices || []).filter(group=>group.asiAlternative).map(group=>({feature,group})));
      const bonusAlternatives = features.flatMap(feature=>(feature.choices || []).filter(group=>group.bonusAlternative===cls?.name).map(group=>({feature,group})));
      for (const feature of [...features]) {
        const parent = feature.parent;
        let groups=[...(feature.choices || [])];
        if(feature.grantsFeat) groups.push({id:feature.id+':granted-feat',label:'Bonus feat',kind:'feat',count:feature.grantsFeat,options:featOptions});
        for(const group of [...groups]) for(const option of group.options) if(option.grantsFeat)groups.push({id:group.id+':feat:'+option.id,label:'Bonus feat',kind:'feat',count:option.grantsFeat,options:option.featRestriction==='no-ability-increase'?featOptions.filter(entry=>!globalThis.CharacterFeats?.grantsAbility(entry)):featOptions,requiresChoice:{groupId:group.id,optionId:option.id}});
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
        if(parent==='Occultist'){for(const group of groups)if(/^(?:Extra )?(?:Mark|Reward)$/.test(group.label))group.pairedSet=group.optionalSet || feature.id+':mark-reward-pair';for(const group of groups)if(group.kind==='feat'){const source=groups.find(item=>item.id===group.requiresChoice?.groupId);if(source?.pairedSet)group.requiresPairedSet=source.pairedSet;}}
        for (const sourceGroup of groups) {
          definitions.push({...sourceGroup,parent,featureId:feature.id,featureName:feature.name,level:feature.requiredLevel ?? feature.level});
        }
      }
      let resolved = new Map(), grants = new Map(), signature = '';
      // Choices may grant slots in an earlier feature. Resolve the dependencies
      // before applying effects, so an inactive branch never grants extra slots.
      for(let pass=0;pass<=definitions.length;pass++) {
        const next=new Map();
        for(const sourceGroup of definitions) {
          const requirement=sourceGroup.requiresChoice;
          if(requirement && (resolved.get(requirement.groupId)?.selected.filter(id=>id===requirement.optionId).length || 0)<=(requirement.occurrence || 0)) continue;
          if(requirement?.onlyChoice && resolved.get(requirement.groupId)?.selected.some(id=>id!==requirement.optionId))continue;
          if(sourceGroup.requiresPairedSet){const pair=[...resolved.values()].filter(group=>group.pairedSet===sourceGroup.requiresPairedSet);if(pair.length<2 || pair.some(group=>group.selected.length<group.count))continue;}
          const baseCount = (sourceGroup.countByLevel?.filter(row=>row.level<=c.level).at(-1)?.count ?? sourceGroup.count)
            + (sourceGroup.additionalGrants || []).filter(grant=>grant.requiresChoice?(resolved.get(grant.requiresChoice.groupId)?.selected.filter(id=>id===grant.requiresChoice.optionId).length || 0)>(grant.requiresChoice.occurrence || 0):activeFeatures.has(grant.featureId)).reduce((total,grant)=>total+(grant.countByLevel?.filter(row=>row.level<=c.level).at(-1)?.count ?? grant.count),0)
            + (grants.get(sourceGroup.id) || 0);
          const extra=(featPlan.grants || []).filter(grant=>grant.groupId===sourceGroup.id),limits=extra.flatMap(grant=>Array.from({length:grant.count},()=>grant));
          const gated=sourceGroup.requiresChoice && resolved.get(sourceGroup.requiresChoice.groupId),gateIndex=gated?.selectedSlots.indexOf(sourceGroup.requiresChoice.optionId),gateSource=gateIndex>=gated?.baseCount?gated.bonusSlots[gateIndex-gated.baseCount]?.source:'',gateLevel=(featPlan.effects || []).find(item=>item.sourceFeat===gateSource)?.level || 1;
          const automatic=sourceGroup.automatic?sourceGroup.options.filter(option=>!option.requiresChoice || resolved.get(option.requiresChoice.groupId)?.selected.includes(option.requiresChoice.optionId)).map(option=>option.id):null;
          const count=automatic?.length ?? Math.min(sourceGroup.maxCount ?? Infinity,baseCount+limits.length),group={...sourceGroup,level:Math.max(sourceGroup.level || 1,gateLevel),count,bonusSlots:limits,baseCount,options:sourceGroup.options.map(option=>({...option,repeatLimit:option.repeatLimitByLevel?.filter(row=>row.level<=c.level).at(-1)?.count ?? option.repeatLimit}))};
          const stored = automatic || (build.choices?.[group.id] || []).slice(0,count), counts = new Map();
          for(const [index,limit] of limits.entries())if(limit.autoSelect && baseCount+index<count && !stored[baseCount+index]){while(stored.length<=baseCount+index)stored.push('');stored[baseCount+index]=limit.autoSelect;}
          let selectedSlots = stored.map((id,index)=>{
            const option=group.options.find(item=>item.id===id), used=counts.get(id) || 0;
            if(!option || used>=(option.repeatLimit || 1)) return '';
            if(option.requiresChoice && !resolved.get(option.requiresChoice.groupId)?.selected.includes(option.requiresChoice.optionId))return '';
            counts.set(id,used+1);return id;
          });
          const misplaced=[];
          selectedSlots=selectedSlots.map((id,index)=>{if(id && index>=baseCount && limits[index-baseCount]?.allowed && !limits[index-baseCount].allowed.includes(id)){misplaced.push(id);return '';}return id;});
          for(const id of misplaced){const placed=placeChoice({...group,selectedSlots},id);if(placed)selectedSlots=placed;}
          // A tree can be chosen in either slot order, but every selected node
          // must retain its entire prerequisite chain. Imported saves use this
          // same validation, without deleting choices which are now inactive.
          let previous;
          do {
            previous=selectedSlots.join('\n');
            selectedSlots=selectedSlots.map(id=>id && (group.options.find(option=>option.id===id).requires || []).every(required=>selectedSlots.includes(required)) ? id : '');
          } while(previous!==selectedSlots.join('\n'));
          const selected = selectedSlots.filter(Boolean);
          const origins=new Map();for(const [index,id] of stored.entries()){const indices=origins.get(id) || [];indices.push(index);origins.set(id,indices);}
          const sourceSlots=selectedSlots.map(id=>id?origins.get(id)?.shift() ?? -1:-1);
          const options=group.options.map(option=>({...option,unavailableReason:[...(option.requires || []).filter(id=>!selected.includes(id)).map(id=>'Requires '+(group.options.find(item=>item.id===id)?.name || 'an earlier choice')),...(option.requiresChoice && !resolved.get(option.requiresChoice.groupId)?.selected.includes(option.requiresChoice.optionId)?['Requires '+(definitions.find(group=>group.id===option.requiresChoice.groupId)?.options.find(item=>item.id===option.requiresChoice.optionId)?.name || 'an earlier choice')]:[]),...(!group.automatic && limits.some(limit=>limit.allowed) && selected.length<count && !placeChoice({...group,selectedSlots},option.id)?['This extra selection must be an upgrade from its chosen list.']:[])].join('; ')}));
          next.set(group.id,{...group,options,selected,selectedSlots,sourceSlots,invalid:stored.some((id,index)=>id && !sourceSlots.includes(index))});
        }
        const nextSignature=JSON.stringify([...next].map(([id,group])=>[id,group.count,group.selectedSlots]));
        resolved=next;
        if(nextSignature===signature) break;
        signature=nextSignature;
        grants=new Map();
        for(const group of resolved.values()) for(const id of group.selected) {
          for(const grant of group.options.find(option=>option.id===id).choiceGrants || []) grants.set(grant.groupId,(grants.get(grant.groupId) || 0)+(grant.countByLevel?.filter(row=>row.level<=c.level).at(-1)?.count ?? grant.count));
        }
      }
      for(const group of resolved.values())if(group.pairedSet)group.pairComplete=[...resolved.values()].filter(other=>other.pairedSet===group.pairedSet).every(other=>other.selected.length>=other.count);
      for(const group of resolved.values()) {
          choices.push(group);
          if (!group.optional && group.selected.length<group.count) warnings.push(`${group.parent}: choose ${group.count} for ${group.label}.`);
          if(group.invalid) warnings.push(`${group.parent}: review unavailable or repeated selections for ${group.label}.`);
          const siblings=group.optionalSet ? [...resolved.values()].filter(item=>item.optionalSet===group.optionalSet) : [];
          if(group.pairComplete===false || siblings.some(item=>item.selected.length<item.count)) continue;
          for (const [slot,id] of group.selectedSlots.entries()) {
            if(!id)continue;const source=slot>=group.baseCount?group.bonusSlots[slot-group.baseCount]?.source:'',level=Math.max(group.level || 1,(featPlan.effects || []).find(item=>item.sourceFeat===source)?.level || 1);
            const option = group.options.find(o=>o.id===id);
            if(group.kind!=='feat') {
              recordEffect(globalThis.CharacterEffects.lookup(group.parent,group.effectFeature || group.featureName,option.name),level,source);
              if(option.effects)recordEffect(option.effects,level,source);
            }
          }
      }
      for(let index=features.length-1;index>=0;index--){const gate=features[index].requiresSource;if(gate && (resolved.get(gate.groupId)?.selected.filter(id=>id===gate.optionId).length || 0)<=(gate.occurrence || 0))features.splice(index,1);}
      const mpBonus=raw=>{if(typeof raw!=='string')return 0;let amount=0;for(const match of raw.matchAll(/\b(?:your )?(?:MP maximum|maximum MP)(?: and maximum rest dice)?(?: is| are)?(?: further)? increased by (\d+)/gi)){const prefix=raw.slice(0,match.index).split(/[.!?]\s+|\n/).at(-1),level=prefix.match(/at (\d+)(?:st|nd|rd|th)? level/i);if(/\b(?:if|while|unless|may)\b/i.test(prefix) || level && c.level<Number(level[1]))continue;amount+=Number(match[1]);}return amount;};
      for(const feature of features){const amount=mpBonus(typeof feature.details==='string'?feature.details.split(/\n\s*\*/)[0]:'');if(amount)recordEffect({metamagicMaximum:amount},feature.level || 1);}
      for(const group of choices.filter(group=>group.kind!=='feat'))for(const option of group.options.filter(option=>group.selected.includes(option.id))){const amount=mpBonus(option.ownDetails ?? option.details);if(amount)recordEffect({metamagicMaximum:amount},group.level);}
      for(const item of featPlan.effects || [])recordEffect(item.effect,item.level,item.sourceFeat);
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
      for(const skill of featPlan.removedSkills || [])skillRanks[skill]=0;
      const proficiencies = {...c.proficiencies};
      for (const key of ['weapons','armor','tools']) {
        const racial=(race?.proficiencies || []).filter(text=>key==='armor'?/\barmor|\barmour|\bshield/i.test(text):key==='weapons'?/\bweapons?\b/i.test(text):/\btools?\b|\binstrument/i.test(text));
        proficiencies[key]=[cls?.proficiencies?.[key],...racial,c.proficiencies[key]].filter(Boolean).join('; ');
      }
      proficiencies.languages=[c.proficiencies.languages,...combined.languages].filter(Boolean).join('; ');
      const baseProficiencies={...proficiencies};
      for(const [key,values] of Object.entries(featPlan.proficiencies || {}))if(values.length)proficiencies[key]=[proficiencies[key],...values].filter(Boolean).join('; ');
      const weaponGroups=unique([...(build.weaponGroups || []),...(featPlan.weaponGroups || [])]);
      let gear = {armorClass:c.combat.armorClass,speedPenalty:0,armorBlock:0,shieldBlock:0,protection:0,blockCheckAbility:'dex',blockProficient:false,attacks:[],reductions:{},resistances:[],warnings:[]};
      if (enabled) gear=globalThis.CharacterEquipment.derive(c,catalog,{abilities,proficiency,proficiencies,weaponGroups,raceSize:race?.size || 'medium',speed:race?.speed ?? c.combat.speed,offHandAbilityDamage:!!combined.offHandAbilityDamage});
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
      for(const attack of attacks)for(const extra of combined.extraDamage || [])attack.damage+=' + '+extra.dice+' '+extra.type;
      for(const attack of attacks){
        const row=c.inventory.find(row=>row.id===attack.inventoryId);if(!row?.entryId)continue;
        let ref;try{ref=JSON.parse(row.entryId);}catch{continue;}
        const section=catalog.find(section=>section.key===ref[0]),entry=section?.entries?.find(entry=>ref[0]==='magic-items' && entry.details?.id===ref[2] || entry.name===ref[2] && entry.group===ref[1]);if(!entry)continue;
        const profile=globalThis.MagicItems?.equipment(entry,catalog) || entry,group=String(profile.details?.group || profile.group || '').toLowerCase();
        for(const source of featPlan.sources || [])if(source.name==='Weapon prowess' && (featPlan.specs[source.id]?.values['weapon-groups'] || []).some(selected=>selected.toLowerCase()===group)){attack.bonus++;attack.damage+=' + 1';attack.notes=[attack.notes,'Weapon prowess: +1 attack and damage.'].filter(Boolean).join(' ');}
      }

      const skillBonuses={...c.training.skillBonuses},saveBonuses={...c.training.saveBonuses};
      for(const skill of Object.keys(skillAbilities)) skillBonuses[skill]=numeric(skillBonuses[skill])+numeric(combined.skillBonuses[skill])+numeric(combined.abilitySkillBonuses[skillAbilities[skill]]);
      for(const key of codes) saveBonuses[key]=numeric(saveBonuses[key])+numeric(combined.saveBonuses[key]);
      const castingAbility=c.combat.spellAbility || cls?.castingAbilities?.[0] || '';
      const reductions={...gear.reductions};for(const [key,value] of Object.entries(combined.reductions)) reductions[key]=Math.max(reductions[key] || 0,value);
      warnings.push(...gear.warnings,...race?.warnings || [],...cls?.warnings || []);
      const casting = globalThis.CharacterCasting?.derive(c,enabled ? cls : null,{abilities,effects:combined,choices,features,proficiency,restMaximum}) || null;
      if (casting) warnings.push(...casting.warnings);
      if(c.level>12 && enabled) warnings.push('The current Varis progression ends at level 12.');
      const result={enabled,race,cls,background,eligibleArchetypes,abilities,abilityBonuses,saves,skillRanks,skillBonuses,saveBonuses,proficiencies,proficiency,armorClass,speed,blockMaximum,blockCheck,combatFloor:gear.armorBlock+gear.shieldBlock+numeric(combined.combatBlock),hpMaximum,hpExplanation,restMaximum,deathSaveSlots:Math.max(1,3+numeric(combined.deathSaveSlots)),castingAbility,casting,initiative:mod(abilities.dex)+c.combat.initiativeBonus+numeric(combined.initiative),features,choices,attacks,raceSkillCount,raceSkillOptions,reductions,resistances:unique([...gear.resistances,...combined.resistances]),immunities:combined.immunities,warnings:unique(warnings),gear,effects:combined};
      result.baseProficiencies=baseProficiencies;result.weaponGroups=weaponGroups;result.featPlan=featPlan;
      const trainingSkills={...c.training.skills};for(const skill of (build.skills || []).filter(skill=>cls?.skillChoice?.options.includes(skill)).slice(0,cls?.skillChoice?.count || 0))trainingSkills[skill]=Math.max(trainingSkills[skill] || 0,1);for(const skill of (build.raceSkills || []).filter(skill=>raceSkillOptions.includes(skill)).slice(0,raceSkillCount))trainingSkills[skill]=Math.max(trainingSkills[skill] || 0,raceSkillRank);result.trainingBase={skills:trainingSkills,effects:timedEffects};
      const taken=new Map();
      for(const group of choices.filter(group=>group.kind==='feat').sort((a,b)=>a.level-b.level)) {
        const scores=Object.fromEntries(codes.map(code=>[code,c.abilities[code]+ancestryBonuses[code]]));
        for(const {effect,level,sourceFeat} of timedEffects) if(level<=group.level && !sourceFeat?.startsWith(group.id+':')) {
          for(const code of codes)scores[code]+=numeric(effect?.abilities?.[code]);
          for(const grant of effect?.cappedAbilities || [])scores[grant.ability]+=Math.max(0,Math.min(grant.amount,grant.maximum-scores[grant.ability]));
        }
        const scopedSkills={...trainingSkills},scopedProficiencies={...baseProficiencies},scopedGroups=[...(build.weaponGroups || [])];
        for(const item of timedEffects)if(item.level<=group.level && !item.sourceFeat?.startsWith(group.id+':'))for(const [skill,rank] of Object.entries(item.effect.skills || {}))scopedSkills[skill]=Math.max(scopedSkills[skill] || 0,rank);
        for(const item of (featPlan.training || []).filter(item=>item.level<=group.level && !item.source.startsWith(group.id+':'))){for(const [key,values] of Object.entries(item.proficiencies))if(values.length)scopedProficiencies[key]=[scopedProficiencies[key],...values].filter(Boolean).join('; ');scopedGroups.push(...item.weaponGroups);for(const skill of item.removedSkills)scopedSkills[skill]=0;}
        const facts=globalThis.CharacterPrerequisites?.context(c,{...result,skillRanks:scopedSkills,proficiencies:scopedProficiencies,weaponGroups:scopedGroups},catalog,Math.min(c.level,group.level),scores);
        const evaluated=group.options.map(option=>{const tier=globalThis.CharacterFeats?.tierRequirements(option,taken.get(option.id) || 0,result),entry=tier?{...option,details:{...option.details,requirements:[...globalThis.CharacterPrerequisites.requirements(option),tier]}}:option;return {...option,eligibility:facts?globalThis.CharacterPrerequisites.evaluate(entry,facts):{eligible:false,unmet:['Prerequisite rules are unavailable.']}};});
        group.options=evaluated.filter(option=>option.eligibility.eligible && (taken.get(option.id) || 0)<(option.repeatLimit || 1)).sort((a,b)=>a.name.localeCompare(b.name));
        group.unavailableSelected=(build.choices[group.id] || []).filter(id=>id && !group.options.some(option=>option.id===id)).map(id=>evaluated.find(option=>option.id===id)).filter(Boolean);
        group.selectedSlots=group.selectedSlots.map(id=>group.options.some(option=>option.id===id)?id:'');group.selected=group.selectedSlots.filter(Boolean);
        if(group.selected.length<group.count && !result.warnings.includes(`${group.parent}: choose ${group.count} for ${group.label}.`))result.warnings.push(`${group.parent}: choose ${group.count} for ${group.label}.`);
        for(const option of group.unavailableSelected)result.warnings.push(`${option.name}: prerequisites are not met; choose another feat.`);
        for(const id of group.selected) {
          const option=group.options.find(option=>option.id===id);taken.set(id,(taken.get(id) || 0)+1);
          features.push({id:group.id+':'+id,entryId:id,name:option.name,level:group.level,parent:'Feat',details:option.details,choices:[]});
        }
      }
      const rest=globalThis.CharacterEffects.restDice(c,result);
      result.restMaximum=rest.maximum;result.restBreakdown=rest.breakdown;
      result.restWarnings=rest.warnings || [];result.warnings.push(...result.restWarnings);
      result.deathSaveSlots=Math.max(1,result.deathSaveSlots+rest.deathSaveDelta);result.deathSaveBonus=numeric(combined.deathSaveBonus)+rest.deathSaveBonus;
      result.hpMaximum=Math.max(1,result.hpMaximum+rest.hpDelta);
      result.effects.occultSlots=numeric(result.effects.occultSlots)+rest.occultExtra;
      result.casting=globalThis.CharacterCasting?.derive(c,enabled?cls:null,{abilities,effects:result.effects,choices,features,proficiency,restMaximum:result.restMaximum}) || null;
      result.spellProgressions=(metadata.spellProgressions || []).filter(profile=>features.some(feature=>feature.spellEntryId===profile.entryId)).map(profile=>({...profile,automatic:known.some(row=>row.entryId===profile.entryId && row.progressionMode!=='cypher')?profile.automatic:[],count:choices.find(group=>group.spellEntryId===profile.entryId)?.count || 0,selected:choices.find(group=>group.spellEntryId===profile.entryId)?.selected || [],active:(known.some(row=>row.entryId===profile.entryId && row.progressionMode!=='cypher')?profile.automatic:[]).map(rule=>({...rule,activeLevels:rule.levels.filter(level=>level<=c.level)})).filter(rule=>rule.activeLevels.length)}));
      result.progressionNotes=[];
      for(const feature of features)for(const note of feature.levelNotes || [])if(note.levels.some(level=>level<=c.level))result.progressionNotes.push({name:feature.parent+': '+feature.name,...note});
      for(const group of choices.filter(group=>group.kind!=='feat'))for(const option of group.options.filter(option=>group.selected.includes(option.id)))for(const note of option.levelNotes || [])if(note.levels.some(level=>level<=c.level))result.progressionNotes.push({name:group.parent+': '+option.name,...note});
      return result;
    }

    function derive(input) {
      input=State.normalizeCharacter(input);let result=deriveCore(input),signature='';
      if(!result.enabled || !globalThis.CharacterFeats)return result;
      for(let pass=0;pass<8;pass++){const plan=globalThis.CharacterFeats.plan(input,result,catalog,metadata);if(plan.signature===signature || !plan.sources.length){result.featPlan=plan;for(const feat of plan.sources){const spec=plan.specs[feat.id];if(spec?.missing.length)result.warnings.push(feat.name+': finish '+spec.missing.join(', ')+'.');}return result;}signature=plan.signature;result=deriveCore(input,plan);}
      result.warnings.push('Review feat dependencies: the selected effects did not reach a stable result.');return result;
    }

    function reconcile(input) {
      const c=State.normalizeCharacter(input);if(!c.build?.enabled)return c;
      const d=derive(c),missingHP=c.resources.hp.max-c.resources.hp.current;
      c.resources.hp.max=d.hpMaximum;c.resources.hp.current=Math.max(0,d.hpMaximum-missingHP);
      c.resources.block.max=Math.max(0,d.blockMaximum);c.resources.block.current=Math.min(c.resources.block.current,c.resources.block.max);
      c.restDice.max=d.restMaximum;c.restDice.current=Math.min(c.restDice.current,c.restDice.max);
      c.deathSaves.successes=Math.min(c.deathSaves.successes,d.deathSaveSlots);c.deathSaves.failures=Math.min(c.deathSaves.failures,d.deathSaveSlots);
      c.ancestry=d.race?.name || c.ancestry;c.className=d.cls?.name || c.className;
      if(d.background)c.background=d.background.name;
      c.subclass=d.eligibleArchetypes.map(a=>a.name).join(', ');
      const granted=d.featPlan?.spells || [];c.spells=c.spells.filter(row=>!row.featSource || granted.some(item=>item.id===row.id));
      for(const row of granted){const existing=c.spells.find(item=>item.id===row.id);if(existing)Object.assign(existing,{entryId:row.entryId,featSource:row.featSource,castingAbility:row.castingAbility,progressionMode:row.progressionMode,manualUpgrades:row.manualUpgrades});else if(!c.spells.some(item=>item.entryId===row.entryId))c.spells.push({...row});}
      if(d.cls?.hitDie)c.restDice.die=d.cls.hitDie;
      return d.casting ? globalThis.CharacterCasting.reconcile(c,d.casting) : c;
    }

    function damage(input,amount,options={}) {
      if(!Number.isSafeInteger(amount)||amount<0)throw new Error('Enter a nonnegative whole damage amount.');
      const c=reconcile(input),d=derive(c),type=(options.type || '').toLowerCase(),physical=['piercing','slashing','bludgeoning'].includes(type);
      let remaining=amount;
      if(type && options.reduce!==false) {
        remaining=Math.max(0,remaining-Math.max(d.reductions.all || 0,d.reductions[type] || 0,physical?d.reductions.physical || 0:0));
        if(d.immunities.includes(type)||d.immunities.includes('all'))remaining=0;
      }
      if(options.half)remaining=Math.floor(remaining/2);
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
      const diseased=c.conditions.some(s=>/^diseased\b/i.test(s));
      return State.resourceDelta(c,pool,diseased?Math.floor(amount/2):amount);
    }

    function rest(input,kind) {
      const c=reconcile(input),d=derive(c);c.resources.block.current=c.resources.block.max;
      if(c.build?.enabled)c.build.health.fatigue=kind==='long'?0:Math.max(0,c.build.health.fatigue-Math.max(1,mod(d.abilities.con)));
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
      const level=input.build?.health?.fatigue || 0,sides={2:2,3:3,4:4,5:6,8:8,9:10,10:12}[level];
      return {amount:level===1?1:sides?rollDie(sides):0,notation:level===1?'1':sides?'1d'+sides:'',unresolved:level===6||level===7};
    }
    return Object.freeze({metadata,catalog,derive,enable,reconcile,damage,heal,rest,startCombat,endCombat,fatiguePenalty,placeChoice});
  }
  globalThis.CharacterRules=Object.freeze({create,skillAbilities,placeChoice});
})();
