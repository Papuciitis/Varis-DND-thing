"use strict";

// Audited feat choices. This module records source-defined decisions; it never
// rewrites catalog rules or assumes a situational trigger has happened.
(() => {
  const abilityNames={str:'Strength',dex:'Dexterity',con:'Constitution',int:'Intelligence',wis:'Wisdom',cha:'Charisma'};
  const codes=Object.keys(abilityNames),mental=['int','wis','cha'],physical=['str','dex','con'];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const prose=value=>typeof value==='string'?value:Array.isArray(value)?value.map(prose).join('\n'):value && typeof value==='object'?Object.values(value).map(prose).join('\n'):'';
  const option=(id,name,details='')=>({id,name,details});
  const idOf=entry=>entry.entryId || JSON.stringify(['spells',entry.group,entry.name]);
  const lists={
    'Dual wielding':[['trained','Trained hand'],['quick','Quick strikes'],['defense','Agile defense'],['reaction','Hasty reactions'],['swift','Swift combat']],
    'Mutant kobold':[['troglodyte','Troglodyte'],['drakeling','Drakeling'],['cavebold','Cavebold'],['rokold','Rokold'],['goldling','Goldling'],['kobolid','Kobolid'],['kobolisk','Kobolisk']],
    'Rite magic':[['spell','Rite spell'],['slot','Rite slot'],['cantrips','Minor rites'],['die','Rite dice']],
    'Herbology':[['healing','Herbal healing potion'],['endurance','Herbal endurance potion'],['antidote','Herbal antidote potion'],['vigor','Herbal vigor potion']],
    'Power source':[['engine','Arcane engine'],['give','Give power'],['polarity','Polarity']],
    'Sworn':[['third','Learn a level 3 oath spell'],['cantrip','Learn an oath cantrip'],['fourth','Forfeit the level 2 spell for a level 4 oath spell']],
    'Grimness':[['social','+1 Deception, Intimidation and Disguise'],['stealth','+2 Stealth'],['charisma','+1 Charisma saves']],
    'Arcane insight':[['cost','Reduce psychic damage to d6'],['spell','Learn a level 2 arcane spell'],['int','+1 Intelligence'],['arcana','+3 Arcana']]
  };
  const abilityChoices={
    'Extra combat art':codes,'Extra fighting skills':codes,'Extra insight':codes,'Extra occult casting':codes,'Extra Ranger training':codes,'Extra tricks of the trade':codes,
    'Extreme training':codes,'Hex casting':codes,'Lunge':physical,'Meta-break: Longer':codes,'Meta-break: More uses':codes,'Meta-break: Greater chance':codes,
    'Oathbound':codes,'Offensive magic':mental,'Second wind +':codes,'Seize the day':codes,'Wand training':['int','dex'],'Dual wielding':['dex','str'],
    'Elven power':mental,'Extra cantrip upgrade':codes,'Great determination':codes,'Hand to hand combat':physical,'Heavy wielding':['str','con'],
    'Innate magic':mental,'Mixed elemental descendant':codes,'High metabolism':['str','cha','con'],'Skilled':codes,'weapon proficiency':physical
  };
  const fixedAbilities={
    'Quick throw':{dex:1},'Trigger happy':{dex:1},'Scavenger':{int:1},'Improved cleave':{str:1},'Pilgrims cantrip':{wis:1},'Rapid reload':{dex:1},
    'Swift':{dex:1},'Twitch reflexes':{dex:1},'Rhetoric':{cha:1},'Battle scars':{con:1},'Odd bloodtype':{con:1},'Power attack':{str:1},'Brute force':{str:1},'Small infiltrator':{dex:1},'Farsight':{wis:1}
  };
  function grantsAbility(entry) {
    if(entry.name==='Bowmanship')return false;
    if(abilityChoices[entry.name] || fixedAbilities[entry.name] || ['Symbiosis','Retrain','Mutant kobold'].includes(entry.name))return true;
    const raw=entry.details?.description || '';
    return /(?:increase|gain)[^.\n]*(?:ability score|attribute)[^.\n]*(?:by 1|\+1)|\+\d+ (?:to |bonus to )?(?:strength|dexterity|constitution|intelligence|wisdom|charisma)(?! checks?| saves?| rolls?)\b/i.test(raw);
  }
  function repeatLimit(entry) {
    if(['Dual wielding','Bowmanship'].includes(entry.name))return 3;
    if(['Eviscerate','Improved sneak attack'].includes(entry.name))return 2;
    return /can be taken multiple times/i.test(prose(entry.details))?100:1;
  }
  function tierRequirements(entry,taken,derived) {
    if(entry.name==='Armor proficiency'){const raw=derived?.baseProficiencies?.armor || derived?.proficiencies?.armor || '',rank=/all armou?r|heavy armou?r/i.test(raw)?3:/medium armou?r/i.test(raw)?2:/light armou?r/i.test(raw)?1:0,target=Math.min(3,rank+taken);return 'Strength '+(target===3?12:12+target);}
    const thresholds={'Dual wielding':[13,15,17],'Bowmanship':[14,18,22],'Eviscerate':[16,18]};
    return thresholds[entry.name]?'Dexterity '+thresholds[entry.name][Math.min(taken,thresholds[entry.name].length-1)]:'';
  }
  function sources(ctx,exclude='') {
    const found=[];
    for(const feature of ctx.d.features || []) {
      if(feature.id===exclude)continue;
      if(feature.parent==='Feat' && /Meta-break:|More upgrades/.test(feature.name))continue;
      if(!(ctx.d.choices || []).some(group=>group.kind!=='feat' && group.featureId===feature.id))found.push(option(feature.id,feature.parent+': '+feature.name,prose(feature.details)));
    }
    for(const group of ctx.d.choices || [])if(group.kind!=='feat')for(const id of group.selected) {
      const item=group.options.find(item=>item.id===id);if(item)found.push(option(item.id,group.parent+': '+item.name,prose(item.ownDetails ?? item.details)));
    }
    for(const row of ctx.knownSpellRows || ctx.c.spells || []) {
      const entry=ctx.spells.find(entry=>idOf(entry)===row.entryId);if(entry)found.push(option(row.entryId,'Spell: '+entry.name,prose(entry.details)));
    }
    for(const item of ctx.c.features || [])found.push(option('custom:'+item.id,item.name,prose(item.notes || item.details)));
    return found;
  }
  function upgradeTargets(ctx,exclude='') {
    const targets=[];
    function grantsFeat(item,seen=new Set()) {
      if(item.grantsFeat || ['bard:Deep past','new-tricks'].includes(item.choiceModel))return true;
      return (item.choiceGrants || []).some(grant=>{if(seen.has(grant.groupId))return false;const next=new Set(seen).add(grant.groupId),group=ctx.d.choices.find(group=>group.id===grant.groupId);return !group || group.kind==='feat' || group.options.some(option=>grantsFeat(option,next));});
    }
    for(const group of ctx.d.choices || []) {
      if(group.kind==='feat' || group.automatic || group.spellEntryId || /ability.score.improvement|mark.*reward/i.test(group.featureName))continue;
      for(const root of group.options.filter(item=>group.selected.includes(item.id))) {
        const descendants=group.options.filter(item=>!grantsFeat(item) && item.id!==root.id && (item.requires || []).includes(root.id));
        if(descendants.length)targets.push({...option('tree:'+root.id,group.parent+': '+root.name,root.ownDetails ?? ''),groupId:group.id,allowed:descendants.map(item=>item.id)});
      }
      const feature=ctx.d.features.find(feature=>feature.id===group.featureId),prefix=prose(feature?.details).split(/\n\s*\*/)[0];
      if(/\b(?:choose|pick|gain|learn) (?:any )?(?:\d+|one|two|three|four|five|six|an?) (?:[\w-]+ ){0,3}upgrades?\b|upgrade from (?:the|this) list|\bchoose (?:one|1)\s*(?:[:.]|$|from (?:the|this) list)/i.test(prefix) && !/\b(?:choose|pick)[^.\n]*abilit(?:y|ies)\b/i.test(prefix)) {
        // The list defines eligibility, not its currently unused options. Removing
        // a chosen option here would revoke the very bonus slot that selected it.
        const allowed=group.options.filter(item=>!grantsFeat(item)).map(item=>item.id);
        if(allowed.length)targets.push({...option('group:'+group.id,group.parent+': '+group.featureName,prefix),groupId:group.id,allowed});
      }
    }
    for(const row of new Map((ctx.knownSpellRows || ctx.c.spells || []).map(row=>[row.entryId,row])).values()) {
      if(ctx.d.featPlan?.sacrificedSpells?.includes(row.entryId))continue;
      const entry=ctx.spells.find(entry=>idOf(entry)===row.entryId);
      if(globalThis.CharacterCasting.spellInfo(entry).cantrip && ctx.metadata.spellProgressions?.some(profile=>profile.entryId===row.entryId && profile.options.length))targets.push({...option('spell:'+row.entryId,'Cantrip: '+entry.name),spell:entry});
    }
    for(const feat of (ctx.d.features || []).filter(feat=>feat.parent==='Feat' && feat.id!==exclude && lists[feat.name]))targets.push({...option('feat:'+feat.id,'Feat: '+feat.name),featId:feat.id});
    return targets;
  }
  function choiceSources(d) {
    const found=[];
    for(const group of d.choices.filter(group=>group.kind!=='feat' && group.pairComplete!==false)) {
      const counts=new Map();
      for(const [selectedSlot,id] of (group.selectedSlots || group.selected).entries()) {
        if(!id)continue;const slot=group.sourceSlots?.[selectedSlot] ?? selectedSlot,item=group.options.find(item=>item.id===id),occurrence=counts.get(id) || 0;counts.set(id,occurrence+1);
        if(item)found.push({id:group.id+':'+id+((item.repeatLimit || 1)>1 && slot?':slot:'+slot:occurrence?':occurrence:'+occurrence:''),entryId:id,name:item.name,parent:'Feature',owner:group.parent,choiceModel:item.choiceModel,groupId:group.id,optionId:id,occurrence,slot,occultChoice:group.parent==='Occultist' && /^(?:Extra )?(?:Mark|Reward)$/.test(group.label),level:group.level,details:item.ownDetails ?? item.details});
      }
    }
    return found;
  }
  function abilityTargets(ctx,source) {
    const targets=[];
    for(const group of ctx.d.choices) {
      if(group.kind==='feat' || group.automatic || group.spellEntryId || group.id===source.groupId || /ability.score.improvement|mark.*reward/i.test(group.featureName))continue;
      if(source.choiceModel==='new-tricks' && !(group.parent==='Ranger' && group.featureName==='Ranger training' || ctx.d.eligibleArchetypes.some(owner=>owner.name===group.parent && owner.minLevel<(ctx.d.eligibleArchetypes.find(item=>item.name==='Seeker')?.minLevel || 8))))continue;
      if(source.choiceModel==='bard:Deep past' && group.parent===ctx.d.cls?.name)continue;
      const allowed=group.options.filter(item=>!item.choiceGrants?.some(grant=>grant.groupId===source.groupId) && !['bard:Deep past','new-tricks'].includes(item.choiceModel)).map(item=>item.id);
      if(allowed.length)targets.push({...option('group:'+group.id,group.parent+': '+group.featureName),groupId:group.id,allowed});
    }
    if(source.choiceModel==='bard:Deep past')for(const feat of ctx.d.features.filter(feat=>feat.parent==='Feat' && lists[feat.name]))targets.push({...option('feat:'+feat.id,'Feat: '+feat.name),featId:feat.id});
    return targets;
  }
  function context(c,d,catalog,metadata) {
    const spells=catalog.filter(section=>section.key==='spells').flatMap(section=>section.entries || []);
    const weapons=catalog.filter(section=>section.key==='items').flatMap(section=>section.entries || []).filter(entry=>entry.details?.damage);
    const weaponGroups=[...new Set(weapons.map(entry=>entry.group))].sort();
    const selectedSources=choiceSources(d),activeSource=id=>d.features.some(feature=>feature.id===id) || selectedSources.some(source=>source.id===id);const knownSpellRows=[...new Map([...c.spells,...(d.featPlan?.spells || [])].map(row=>[row.id,row])).values()].filter(row=>(!row.classId || row.classId===d.cls?.id) && (!row.featSource || activeSource(row.featSource)));
    return {c,d,catalog,metadata,spells,weaponGroups,knownSpellRows,selectedSources};
  }
  function trainedWeapons(ctx) {
    if(ctx.trainedWeapons)return ctx.trainedWeapons;
    ctx.trainedWeapons=ctx.catalog.filter(section=>section.key==='items').flatMap(section=>section.entries || []).filter(entry=>entry.details?.damage).filter(entry=>{
      const row={id:'feat-probe',entryId:JSON.stringify(['items',entry.group,entry.name]),name:entry.name,quantity:1,equipped:true};
      return globalThis.CharacterEquipment.derive({...ctx.c,inventory:[row]},ctx.catalog,{abilities:ctx.d.abilities,proficiency:ctx.d.proficiency,proficiencies:ctx.d.proficiencies,weaponGroups:ctx.d.weaponGroups || [],raceSize:ctx.d.race?.size || 'medium'}).attacks.some(attack=>attack.trained);
    });return ctx.trainedWeapons;
  }
  function specification(feat,ctx) {
    const saved=ctx.c.build.featChoices?.[feat.id] || {},fields=[],notes=[];
    const get=key=>saved[key]?.[0] || '';
    const add=(key,label,options,count=1,type='select')=>fields.push({key,label,options,count,type});
    const ability=(allowed=abilityChoices[feat.name])=>{if(allowed)add('ability','Ability score +1',allowed.map(code=>option(code,abilityNames[code])));};
    const pickSpell=(key,label,level,traditions=['arcane','mystic','oath','occult'],count=1,extra=()=>true)=>add(key,label,ctx.spells.filter(entry=>{const info=globalThis.CharacterCasting.spellInfo(entry);return info.level===level && traditions.includes(info.tradition) && extra(entry);}).map(entry=>option(idOf(entry),entry.name,prose(entry.details))).sort((a,b)=>a.name.localeCompare(b.name)),count);
    const knownSpells=ctx.spells.filter(entry=>ctx.knownSpellRows.some(row=>row.entryId===idOf(entry)));
    const ownSources=sources(ctx,feat.id);
    if(lists[feat.name])add('upgrade','Choose an upgrade',lists[feat.name].map(([key,name])=>option(key,name)),1+(ctx.moreTargets || []).filter(id=>id==='feat:'+feat.id).length);
    if(feat.name==='Hex casting') {
      const info=knownSpells.filter(entry=>!ctx.knownSpellRows.some(row=>row.entryId===idOf(entry) && row.featSource===feat.id)).map(entry=>entry.group),minor=info.filter(group=>group==='Minor hexes').length,major=info.filter(group=>group==='Major hexes').length,greater=info.filter(group=>group==='Greater hexes').length;
      const bundles=[['minor2','Two minor hexes'],['minor-ability','One minor hex and +1 ability']];
      if(minor-major>=2)bundles.push(['major-minor','One major and one minor hex'],['major-ability','One major hex and +1 ability']);
      if(major-greater>=2)bundles.push(['greater-minor2','One greater and two minor hexes'],['greater-major','One greater and one major hex'],['greater-ability','One greater hex and +1 ability']);
      add('bundle','Hex grant',bundles.map(([key,name])=>option(key,name)));
      for(const [tier,count] of [['Minor',get('bundle').includes('minor2')?2:get('bundle').includes('minor')?1:0],['Major',get('bundle').startsWith('major')||get('bundle')==='greater-major'?1:0],['Greater',get('bundle').startsWith('greater')?1:0]])if(count)add('hex-'+tier,'Learn '+tier.toLowerCase()+' hexes',ctx.spells.filter(entry=>entry.group===tier+' hexes').map(entry=>option(idOf(entry),entry.name)),count);
      if(get('bundle').includes('ability'))ability();
    } else if(feat.name==='Offensive magic'){const allowed=[...new Set([...(ctx.d.cls?.castingAbilities || []),ctx.c.combat.spellAbility,...ctx.knownSpellRows.map(row=>row.castingAbility)].filter(code=>codes.includes(code)))];ability(allowed.length?allowed:mental);}else ability();
    if(feat.name.startsWith('Meta-break:') || feat.name==='Great warrior') {
      const pattern=feat.name.endsWith('Longer')?/duration|\brounds?\b|\bturns?\b|minutes?|hours?|days?/i:feat.name.endsWith('Greater chance')?/chance (?:die|dice)|cooldown|recharge|1d\d+\s*[<>]/i:/per (?:long )?rest|once.*rest|twice.*rest|times.*rest|uses/i;
      const targets=ownSources.filter(item=>pattern.test(item.details) && (feat.name!=='Great warrior' || /damage/i.test(item.details)));
      add('target','Affected ability or spell',targets);
      if(feat.name.endsWith('Greater chance'))add('chance-mode','Chance improvement',[option('size','Change chance die by one size'),option('success','Improve success threshold by one')]);
      notes.push('The recorded modifier applies only to the chosen target. Resolve duration dice, chance thresholds and limited uses from its rules; failure chance must remain above zero.');
    }
    if(feat.name==='More upgrades') {
      const targets=upgradeTargets(ctx,feat.id);add('targets','Two different upgrade lists',targets,2);

      notes.push('Only upgrade lists qualify. Extra feature slots are restricted to the chosen list; this feat cannot grant another feat.');
    }
    if(['Extra cantrip upgrade','Infernal magic'].includes(feat.name)) {
      const options=knownSpells.filter(entry=>ctx.metadata.spellProgressions?.some(profile=>profile.entryId===idOf(entry) && profile.options.length) && globalThis.CharacterCasting.spellInfo(entry).cantrip).map(entry=>option(idOf(entry),entry.name));
      add('cantrip','Cantrip to upgrade',options);const entry=ctx.spells.find(entry=>idOf(entry)===get('cantrip'));
      notes.push('Choose the extra upgrade on Spells → Cantrip & hex upgrades after choosing its cantrip.');
    }
    if(['Offensive magic','Stable magic','Violent magic','Toxomancy'].includes(feat.name)) {
      const pattern=feat.name==='Offensive magic'?/spell attack|sav(?:e|ing throw)/i:feat.name==='Stable magic'?/duration|concentration/i:/damage/i;
      add('spell-target','Spell or cantrip',knownSpells.filter(entry=>pattern.test(prose(entry.details)) || feat.name==='Stable magic' && !!entry.details.duration || feat.name==='Offensive magic' && !!entry.details.save).map(entry=>option(idOf(entry),entry.name)));
      if(feat.name==='Offensive magic'){const target=knownSpells.find(entry=>idOf(entry)===get('spell-target')),raw=prose(target?.details),attack=/spell attack/i.test(raw),save=!!target?.details?.save || /sav(?:e|ing throw)/i.test(raw);add('spell-mode','Improve',[...(attack?[option('attack','Spell attack +1')]:[]),...(save?[option('save','Save DC +1')]:[]),...(attack&&save?[option('both','Spell attack and save DC +1')]:[])]);}
      if(feat.name==='Violent magic')add('component','Remove component',[option('verbal','Verbal'),option('somatic','Somatic')]);
    }
    if(feat.name==='Skilled')add('skills','Two skill proficiencies',Object.keys(globalThis.CharacterRules.skillAbilities).map(name=>option(name,name)),2);
    if(['Expertise','Extreme training'].includes(feat.name)) {
      const trained=Object.keys(ctx.d.skillRanks).filter(name=>ctx.d.skillRanks[name]>0);
      if(feat.name==='Extreme training')add('lose-skill','Lose a skill proficiency',trained.map(name=>option(name,name)));
      add('expertise','Skill to improve to expertise',trained.filter(name=>name!==get('lose-skill')).map(name=>option(name,name)));
      notes.push('For tool expertise, record the tool under Tool expertise instead of selecting a skill.');add('expert-tool','Tool expertise (optional)',[],1,'text');
    }
    if(['weapon proficiency','Dwarven veteran','Weapon prowess'].includes(feat.name)){let groups=ctx.weaponGroups;if(feat.name==='Weapon prowess')groups=[...new Set(trainedWeapons(ctx).filter(entry=>/martial/i.test(entry.details.type)).map(entry=>entry.details.group || entry.group))];if(feat.name==='Dwarven veteran')groups=groups.filter(group=>!/bow|firearm|launcher/i.test(group) || /crossbow/i.test(group));add('weapon-groups',feat.name==='weapon proficiency'?'Two weapon groups':'Weapon group',groups.map(name=>option(name,name)),feat.name==='weapon proficiency'?2:1);}
    if(['Mastered maneuver','Weapon technique'].includes(feat.name)){const names=new Map();for(const entry of trainedWeapons(ctx))for(const row of entry.details.maneuvers || [])for(const [name,description] of Object.entries(row))if(!names.has(name.toLowerCase()))names.set(name.toLowerCase(),option(name.toLowerCase(),name,description));add('maneuvers','Named maneuver'+(feat.name==='Weapon technique'?'s':''),[...names.values()],feat.name==='Weapon technique'?2:1);}
    if(feat.name==='Expanded metamagic')add('metamagic','Additional metamagic effects (use the base Sorcerer list)',[],2,'text');
    if(feat.name==='Expanded alchemy'){const groups=ctx.d.choices.filter(group=>group.parent==='Alchemist');for(const [key,label,name] of [['alchemy-tool','Additional alchemical tool','Tool of choice'],['alchemy-method','Additional alchemical method','Alchemy methods']]){const group=groups.find(group=>group.featureName===name);if(group)add(key,label,group.options.filter(item=>group.selectedSlots.filter((id,index)=>index<(group.baseCount ?? group.count) && id===item.id).length<(item.repeatLimit || 1)).map(item=>option(item.id,item.name,item.ownDetails ?? item.details)));}}
    if(feat.name==='Mixed elemental descendant') {
      const race=ctx.metadata.races.find(item=>item.name==='Ginasi'),group=race?.traits.flatMap(trait=>trait.choices || []).find(group=>group.options.some(item=>item.name==='Distant descendant'));
      if(group)add('lineage','Additional Ginasi lineage',group.options.filter(item=>!(ctx.d.choices.find(current=>current.id===group.id)?.selectedSlots || []).some((id,index)=>index<(ctx.d.choices.find(current=>current.id===group.id)?.baseCount ?? group.count) && id===item.id)).map(item=>option(item.id,item.name,item.details)));
      add('training-kind','Proficiency type',[option('skill','Skill'),option('tool','Tool')]);if(get('training-kind'))add('training','New proficiency',get('training-kind')==='skill'?Object.keys(globalThis.CharacterRules.skillAbilities).map(name=>option(name,name)):[],1,get('training-kind')==='skill'?'select':'text');
    }
    if(feat.name==='Oathbound') {
      const cls=ctx.metadata.classes.find(item=>item.name==='Cleric'),group=cls?.features.flatMap(feature=>feature.choices || []).find(group=>group.options.some(item=>item.name==='Oath of vigilance'));
      if(group)add('oath','Cleric oath (blessing only)',group.options.map(item=>option(item.id,item.name,item.details)));
    }
    if(feat.name==='Mana-refusal'){add('sacrificed-cantrip','Permanently sacrificed cantrip',knownSpells.filter(entry=>{const info=globalThis.CharacterCasting.spellInfo(entry);return info.cantrip && ['arcane','occult'].includes(info.tradition);}).map(entry=>option(idOf(entry),entry.name)));add('sacrificed-upgrades','Upgrades the cantrip had when sacrificed',Array.from({length:21},(_,n)=>option(String(n),String(n))));const allowance=Math.min(4,Number(get('sacrificed-upgrades') || 0)+1);add('mana-upgrades','Mana-refusal upgrades',[option('ally-save','Save in place of an ally (once per long rest)'),option('defensive-rest','-2 maximum HP, +1 death-save slot, +1 rest die'),option('saves','+1 to saves against spells'),option('spell-sacrifice','Sacrifice a level-1 spell for +2 rest dice')],allowance);if((saved['mana-upgrades'] || []).includes('spell-sacrifice'))add('sacrificed-spell','Permanently sacrificed level-1 spell',knownSpells.filter(entry=>globalThis.CharacterCasting.spellInfo(entry).level===1).map(entry=>option(idOf(entry),entry.name)));notes.push('Record the historical upgrade count at sacrifice; this allowance does not grow when you later level up. The sacrificed spells stay recorded but cannot be cast.');}
    if(feat.name==='Occultist knowledge')add('occult-benefit','Additional benefit',[option('slot','+1 maximum occult slot'),...['int','cha'].map(code=>option(code,'+1 '+abilityNames[code]))]);
    if(feat.name==='Occult gnosis' && (ctx.c.build.featBenefits?.[feat.entryId] || []).includes('spell'))pickSpell('learn-gnosis','Granted 1st-level spell',1,['oath','arcane']);
    const max=ctx.d.casting?.maxCastLevel || 1;
    if(['Innate magic','Invoke dark powers'].includes(feat.name))pickSpell('learn-cantrip','Granted cantrip',0);
    if(feat.name==='Innate magic')add('casting-ability','Cantrip casting ability',[...mental,'con'].map(code=>option(code,abilityNames[code])));
    if(feat.name==='Arcane insight') {pickSpell('learn-cantrip','Arcane cantrip',0,['arcane']);pickSpell('learn-first','1st-level arcane spell',1,['arcane']);if((saved.upgrade || []).includes('spell'))pickSpell('learn-second','2nd-level arcane spell',2,['arcane']);}
    if(feat.name==='Veil-magic') {pickSpell('learn-cantrip','Cantrip',0,['oath','mystic','arcane']);pickSpell('learn-first','1st-level spells',1,['oath','mystic','arcane'],2);pickSpell('learn-third','3rd-level spell',3,['oath','mystic','arcane']);}
    if(feat.name==='Infernal magic')for(const level of [1,2,3])pickSpell('learn-'+level,'Occult spell, level '+level,level,['occult']);
    if(feat.name==='Waeld-soul')pickSpell('learn-second','2nd-level mystic or oath spells',2,['mystic','oath'],2);
    if(feat.name==='Firbolg spiritsong') {add('song-mode','Spiritsong grant',[option('cantrip','Cantrip'),option('spell','1st-level spell')]);add('song-casting','Casting skill',[option('Performance','Performance'),option('Insight','Insight')]);if(get('song-mode'))pickSpell('learn-song','Spiritsong spell',get('song-mode')==='cantrip'?0:1,['oath','mystic','occult'],1,entry=>!/necromancy|damage/i.test(prose(entry.details)));}
    if(feat.name==='Forbidden magic')add('learn-forbidden','Occult spell',ctx.spells.filter(entry=>{const info=globalThis.CharacterCasting.spellInfo(entry);return info.tradition==='occult' && info.level>0 && info.level<=max;}).map(entry=>option(idOf(entry),entry.name)));
    if(feat.name==='Rite magic') {if((saved.upgrade || []).includes('spell'))pickSpell('learn-rite','2nd-level oath spell',2,['oath']);if((saved.upgrade || []).includes('cantrips'))pickSpell('learn-rites','Cantrips (cannot be upgraded)',0,['oath','mystic'],2);}
    if(feat.name==='Sworn') {pickSpell('learn-first','1st-level oath spell',1,['oath']);if(!(saved.upgrade || []).includes('fourth'))pickSpell('learn-second','2nd-level oath spell',2,['oath']);if((saved.upgrade || []).includes('third'))pickSpell('learn-third','3rd-level oath spell',3,['oath']);if((saved.upgrade || []).includes('cantrip'))pickSpell('learn-cantrip','Oath cantrip',0,['oath']);if((saved.upgrade || []).includes('fourth'))pickSpell('learn-fourth','4th-level oath spell',4,['oath']);}
    if(feat.name==='Latent power') {pickSpell('learn-cantrip','Mystic cantrip',0,['mystic']);add('learn-latent','Granted spell',ctx.spells.filter(entry=>{const info=globalThis.CharacterCasting.spellInfo(entry);return ['mystic','occult','arcane'].includes(info.tradition) && info.level>0 && info.level<=max;}).map(entry=>option(idOf(entry),entry.name)));add('casting-method','Casting method',[option('rest','One rest die per spell level'),option('fatigue','Fatigue per half spell level, rounded up'),option('psychic','d4 psychic damage per spell level (non-healing spell)')]);}
    if(/^More (?:oath|occult|mystic) spells known$/.test(feat.name)) {
      const tradition=feat.name.split(' ')[1],n=ctx.d.proficiency/2;
      if(!Number.isInteger(n))add('rounding','Table ruling: number of extra spells',[...new Set([Math.floor(n),Math.ceil(n)])].map(n=>option(String(n),String(n))));
      const count=Number.isInteger(n)?n:Number(get('rounding'));
      if(count)add('learn-more','Extra '+tradition+' spells',ctx.spells.filter(entry=>{const info=globalThis.CharacterCasting.spellInfo(entry);return info.tradition===tradition && info.level>0 && info.level<=max;}).map(entry=>option(idOf(entry),entry.name)),count);
      if(tradition==='occult')add('casting-ability','Casting ability',['int','cha'].map(code=>option(code,abilityNames[code])));
      if(tradition==='mystic')add('casting-ability','Casting ability',['wis','cha'].map(code=>option(code,abilityNames[code])));
    }
    if(feat.name==='Bolt-stacking') {add('crossbow','Maintained personal crossbow',ctx.c.inventory.filter(row=>/crossbow/i.test(row.name)).map(row=>option(row.id,row.name)));add('bolt-benefit','Crossbow benefit',[option('bolt','Load one extra bolt per reload'),option('capacity','Capacity +3')]);}
    if(feat.name==='Elemental sigils')add('element','Element',['lightning','fire','cold'].map(name=>option(name,name)));
    if(feat.name==='Symbiosis') {add('adaptations','Three ability scores',codes.map(code=>option(code,abilityNames[code])),3);add('active','Active adaptation',codes.filter(code=>(saved.adaptations || []).includes(code)).map(code=>option(code,abilityNames[code])));}
    if(feat.name==='Retrain') {add('from','Move +1 from',codes.map(code=>option(code,abilityNames[code])));add('to','Move +1 to',codes.filter(code=>code!==get('from')).map(code=>option(code,abilityNames[code])));add('bonus','Additional +1 to a different score',codes.filter(code=>code!==get('to')).map(code=>option(code,abilityNames[code])));add('training-kind','Proficiency type',['skill','tool','language','weapon','instrument'].map(name=>option(name,name)));if(get('training-kind'))add('training','New proficiency',get('training-kind')==='skill'?Object.keys(globalThis.CharacterRules.skillAbilities).map(name=>option(name,name)):get('training-kind')==='weapon'?ctx.weaponGroups.map(name=>option(name,name)):[],1,['skill','weapon'].includes(get('training-kind'))?'select':'text');}
    if(feat.name==='Warpath') {add('warpath-mode','Benefit',[option('strength','+1 Strength'),option('training','Weapon and shield proficiency')]);if(get('warpath-mode')==='training')add('training','Weapon and shield groups',[],2,'text');}
    if(feat.name==='Worldly') {add('languages','Three languages',[],3,'text');add('worldly-skills','Two skills for +1',['History','Insight','Religion','Arcana','Nature','Persuasion','Deception','Medicine'].map(name=>option(name,name)),2);}
    if(feat.name==='Battle scars')add('scars','Qualifying battles already recorded',Array.from({length:21},(_,n)=>option(String(n),String(n))));
    if(feat.name==='Grudgebearer')add('grudge','Current grudge (optional)',[],1,'text');
    for(const field of fields)if((field.key==='expert-tool' || feat.name==='Grudgebearer'))field.optional=true;
    const values={},missing=[];
    for(const field of fields) {
      let picked=(saved[field.key] || []).filter(value=>field.type==='text'?!!value.trim():field.options.some(item=>item.id===value));
      picked=[...new Set(picked)].slice(0,field.count);values[field.key]=picked;
      if(!field.optional && picked.length<field.count && !(field.key==='expertise' && saved['expert-tool']?.[0]?.trim()))missing.push(field.label);
    }
    return {fields,values,notes,missing};
  }
  function spellUpgrades(entry,ctx) {
    const profile=ctx.metadata.spellProgressions?.find(profile=>profile.entryId===idOf(entry));if(profile)return profile.options.map(item=>option(item.id,item.name,item.details));
    const raw=entry?.details?.upgrades;
    const values=Array.isArray(raw)?raw:typeof raw==='object'?Object.entries(raw).map(([key,value])=>key+': '+prose(value)):String(raw || '').split(/\n\s*\*\s*|\n/).filter(Boolean);
    return values.map((value,index)=>option(String(index),prose(value)));
  }
  const featureNames=new Set(['Arcane intuition','Tiefling','Outcast house descendant','Magical gift','Occult birth','Saved by order','Noble-line','Enchanted birth','cryptic cyphers','Resistance to two types of damage of choice.','All your damage-dealing effects and attacks deal an extra 1d4 of a damage type of your choice. The type chosen cannot be changed.','Expertise with a skill that you are proficient with.','-1 to social skill checks (Subject to GM.)','-1 to physical skill checks (Subject to GM.)','-1 to mental skill checks (Subject to GM.)']);
  function featureSpecification(source,ctx) {
    const saved=ctx.c.build.featChoices?.[source.id] || {},fields=[],values={},missing=[],get=key=>saved[key]?.[0] || '';
    const add=(key,label,options,count=1,repeat=false)=>fields.push({key,label,options,count,type:'select',repeat});
    const pick=(key,label,level,traditions=['arcane','mystic','oath','occult'],extra=()=>true)=>add(key,label,ctx.spells.filter(entry=>{const info=globalThis.CharacterCasting.spellInfo(entry);return info.level===level && traditions.includes(info.tradition) && extra(entry);}).map(entry=>option(idOf(entry),entry.name)));
    const name=source.name,model=source.choiceModel,allSkills=Object.keys(globalThis.CharacterRules.skillAbilities),damageTypes=['bludgeoning','piercing','slashing','fire','cold','acid','lightning','sonic','poison','necrotic','radiant','psychic','force'];
    const text=(key,label,count=1)=>fields.push({key,label,options:[],count,type:'text'});
    if(model==='bard:Deep past' || model==='new-tricks')add('targets','Owned list to extend',abilityTargets(ctx,source));
    if(model==='bard:Jack of all trades')add('ability','Ability score +1',codes.map(code=>option(code,abilityNames[code])));
    if(model==='bard:Expertise'){add('expertise','Skill already proficient at this grant',Object.keys(ctx.d.skillRanks).filter(name=>ctx.d.skillRanks[name]>=1).map(name=>option(name,name)));fields.at(-1).optional=true;text('expert-tool','Or a proficient instrument, game set or tool');fields.at(-1).optional=true;}
    if(model==='bard:Extra proficiencies')for(let n=0;n<2;n++){add('training-kind-'+n,'Proficiency type '+(n+1),['skill','language','instrument','tool'].map(name=>option(name,name)));if(get('training-kind-'+n)==='skill')add('training-'+n,'Skill '+(n+1),allSkills.filter(name=>!ctx.d.skillRanks[name]).map(name=>option(name,name)));else if(get('training-kind-'+n))text('training-'+n,'New proficiency '+(n+1));}
    if(model==='bard:Martial skill' || model==='experience:2'){const groups=model==='bard:Martial skill'?[...new Set(ctx.weapons.filter(entry=>/martial/i.test(entry.details.type)).map(entry=>entry.details.group || entry.group))]:ctx.weaponGroups;add('weapon-groups','Weapon group',groups.map(name=>option(name,name)));}
    if(model==='experience:0'){add('skills','Skill proficiency',allSkills.filter(name=>!ctx.d.skillRanks[name]).map(name=>option(name,name)));text('language','Language');}
    if(model==='experience:1'){const armor=ctx.d.proficiencies.armor || '',next=/heavy armor|all armor/i.test(armor)?'block':/medium armor/i.test(armor)?'heavy':'medium';add('armor','Next armor training benefit',[option(next,{medium:'Medium armor',heavy:'Heavy armor and heavy shields',block:'+1 temporary combat block'}[next])]);}
    if(model==='experience:3')text('tool','Tool proficiency and +1 to its checks');
    if(model==='experience:4'){const counts=['arcane','mystic','oath','occult'].map(kind=>[kind,ctx.knownSpellRows.filter(row=>{const grant=ctx.selectedSources.find(item=>item.id===row.featSource);if(row.featSource===source.id || grant?.groupId===source.groupId && grant.slot>=source.slot)return false;const entry=ctx.spells.find(entry=>idOf(entry)===row.entryId),info=globalThis.CharacterCasting.spellInfo(entry);return info.cantrip && info.tradition===kind;}).length]),minimum=Math.min(...counts.map(row=>row[1])),traditions=counts.filter(row=>row[1]===minimum).map(row=>row[0]);add('learning','Learn', [option('cantrip','Cantrip from a least-known tradition'),...(traditions.length===4?[option('hex','Major hex')]:[])]);if(get('learning')==='cantrip')pick('learn-cantrip','Cantrip',0,traditions);if(get('learning')==='hex')add('learn-hex','Major hex',ctx.spells.filter(entry=>entry.group==='Major hexes').map(entry=>option(idOf(entry),entry.name)));}
    if(model==='bard:Magical aptitude')pick('learn-cantrip','Granted cantrip',0);
    if(model==='sorcerer:Arcane intuition')add('learn-cantrip','Extra arcane cantrip',ctx.spells.filter(entry=>{const info=globalThis.CharacterCasting.spellInfo(entry);return info.cantrip && info.tradition==='arcane';}).map(entry=>option(idOf(entry),entry.name)),ctx.c.level>=6?2:1);
    if(model==='bard:Persona insight' && ctx.d.skillRanks.Insight>=2)pick('learn-cantrip','Mystic cantrip',0,['mystic']);
    if(model==='cantrip-mastery')add('cantrip','Owned arcane cantrip',ctx.spells.filter(entry=>ctx.knownSpellRows.some(row=>row.entryId===idOf(entry)) && globalThis.CharacterCasting.spellInfo(entry).cantrip && globalThis.CharacterCasting.spellInfo(entry).tradition==='arcane').map(entry=>option(idOf(entry),entry.name)));
    if(model==='parody'){
      pick('learn-cantrip','Parody cantrip',0);const entry=ctx.spells.find(entry=>idOf(entry)===get('learn-cantrip')),tradition=globalThis.CharacterCasting.spellInfo(entry).tradition;
      const selected=ctx.d.choices.filter(group=>group.featureId===source.id).flatMap(group=>group.selected.map(id=>group.options.find(item=>item.id===id)?.name || ''));
      const abilities=[...(tradition==='arcane'?['int']:tradition==='occult'?['int','cha']:['wis']),...(selected.some(name=>/use charisma as/.test(name))?['cha']:[]),...(selected.some(name=>/use constitution as/.test(name)) && /verbal/i.test(entry?.details?.components || '') && !/somatic|material/i.test(entry?.details?.components || '')?['con']:[]),...(selected.some(name=>/use dexterity as/.test(name)) && /somatic/i.test(entry?.details?.components || '') && !/verbal|material/i.test(entry?.details?.components || '')?['dex']:[])];
      if(entry)add('casting-ability','Parody casting ability',[...new Set(abilities)].map(code=>option(code,abilityNames[code])));
    }
    if(source.occultChoice){
      if(name.startsWith('Resistance to two'))add('resistances','Two damage resistances',damageTypes.map(name=>option(name,name)),2);
      if(name.startsWith('All your damage-dealing')){add('damage-type','Permanent extra-damage type',damageTypes.map(name=>option(name,name)));fields.at(-1).immutable=true;fields.at(-1).locked=!!ctx.c.build.choiceLocks?.[source.id]?.['damage-type'];}
      if(name.startsWith('Expertise with a skill'))add('expertise','Skill already proficient at this grant',Object.keys(ctx.d.skillRanks).filter(name=>ctx.d.skillRanks[name]>=1).map(name=>option(name,name)));
      if(/skill checks/.test(name)){add('skill-scope','Checks affected by the mark',[option('standard','Use the normal ability-based skill categories'),option('custom','Record the GM’s affected skills')]);if(get('skill-scope')==='custom')fields.push({key:'mark-skills',label:'GM’s affected sheet skills, separated by commas',options:[],count:1,type:'text'});}
    }
    if(!source.occultChoice && name==='cryptic cyphers')add('insights','Cypher insights obtained',Array.from({length:61},(_,n)=>option(String(n),String(n))));
    if(!source.occultChoice && name==='Magical gift')add('gift-kind','Magical gift',[option('cantrip','Cantrip'),option('hex','Minor hex')]);
    if(!source.occultChoice && (name==='Outcast house descendant' || name==='Magical gift' && get('gift-kind')==='hex'))add('learn-hex','Granted minor hex',ctx.spells.filter(entry=>entry.group==='Minor hexes').map(entry=>option(idOf(entry),entry.name)));
    else if(!model && !source.occultChoice && (name!=='Magical gift' || get('gift-kind')) && (name!=='cryptic cyphers' || Number(get('insights'))>=3))pick('learn-cantrip','Granted cantrip',0,name==='Arcane intuition'?['arcane']:['Tiefling','cryptic cyphers'].includes(name)?['occult']:name==='Occult birth'?['mystic','occult']:name==='Saved by order'?['oath']:['arcane','mystic','oath','occult'],entry=>name!=='Noble-line' || /divination|illusion|enchantment/i.test(prose(entry.details.types)));
    if(name==='Tiefling')add('casting-ability','Cantrip casting ability',['int','cha'].map(code=>option(code,abilityNames[code])));
    if(name==='Arcane intuition' && !model)add('racial-upgrades','Ancestry upgrade at levels 1 / 5 / 9',[option('duration','Associated duration +1 turn'),option('save','Associated save DC +1'),option('attack','Associated attacks +1'),option('own','Upgrade from the cantrip’s own list')],[1,5,9].filter(level=>level<=ctx.c.level).length,true);
    if(name==='Tiefling')add('racial-upgrades','Tiefling cantrip upgrade',[option('damage','Damage +1d4, if it deals damage'),option('action','Action becomes bonus action'),option('bonus','Bonus action becomes move action'),option('range','Double range')],2,true);
    if(name==='Enchanted birth'){pick('learn-first','First 1st-level spell',1);if(ctx.c.level>=3)pick('learn-third','Extra 1st-level spell at level 3',1);if(ctx.c.level>=5)pick('learn-fifth','2nd-level spell at level 5',2);if(ctx.c.level>=7)pick('learn-seventh','3rd-level spell at level 7',3);}
    for(const field of fields){let picked=(field.locked?[ctx.c.build.choiceLocks[source.id][field.key]]:saved[field.key] || []).filter(id=>field.type==='text'?!!id.trim():field.options.some(item=>item.id===id));if(!field.repeat)picked=[...new Set(picked)];values[field.key]=picked.slice(0,field.count);if(!field.optional && values[field.key].length<field.count)missing.push(field.label);}
    if(model==='bard:Expertise' && !values.expertise?.length && !values['expert-tool']?.length)missing.push('Expertise choice');
    if(model==='bard:Expertise' && values.expertise?.length)values['expert-tool']=[];
    if(model==='bard:Extra proficiencies' && values['training-kind-0']?.[0]===values['training-kind-1']?.[0] && values['training-0']?.[0]?.toLowerCase()===values['training-1']?.[0]?.toLowerCase() && values['training-1']?.length){values['training-1']=[];missing.push('A different second proficiency');}
    return {fields,values,missing,notes:['These choices belong to this feature. Its spell costs and conditions remain governed by the source text.']};
  }
  function plan(c,d,catalog,metadata) {
    const ctx=context(c,d,catalog,metadata),effects=[],grants=[],proficiencies={armor:[],weapons:[],tools:[],languages:[]},weaponGroups=[],removedSkills=[],notes={},spells=[],specs={},sacrificedSpells=[],training=[];
    const feats=(d.features || []).filter(feature=>feature.parent==='Feat'),sources=[...feats];
    sources.push(...d.features.filter(feature=>feature.choiceModel).map(feature=>({...feature,parent:'Feature'})));
    sources.push(...choiceSources(d).filter(source=>source.choiceModel || featureNames.has(source.name)));
    const moreTargets=[...feats.filter(feat=>feat.name==='More upgrades').flatMap(feat=>specification(feat,ctx).values.targets || []),...sources.filter(source=>['bard:Deep past','new-tricks'].includes(source.choiceModel)).flatMap(source=>featureSpecification(source,ctx).values.targets || [])];ctx.moreTargets=moreTargets;
    const armorText=d.baseProficiencies?.armor || d.proficiencies.armor || '';let armorRank=/all armou?r|heavy armou?r/i.test(armorText)?3:/medium armou?r/i.test(armorText)?2:/light armou?r/i.test(armorText)?1:0,shieldRank=/all.*shield|heavy shield/i.test(armorText)?2:/light shield|shield/i.test(armorText)?1:0;
    for(const feat of sources) {
      const scopedSkills={...(d.trainingBase?.skills || d.skillRanks)},scopedProficiencies={...(d.baseProficiencies || d.proficiencies)},scopedGroups=[...(c.build.weaponGroups || [])];
      for(const item of d.trainingBase?.effects || [])if(item.level<=feat.level && item.sourceFeat!==feat.id)for(const [skill,rank] of Object.entries(item.effect.skills || {}))scopedSkills[skill]=Math.max(scopedSkills[skill] || 0,rank);
      for(const item of training.filter(item=>item.level<=feat.level)){for(const [key,values] of Object.entries(item.proficiencies))if(values.length)scopedProficiencies[key]=[scopedProficiencies[key],...values].filter(Boolean).join('; ');scopedGroups.push(...item.weaponGroups);for(const skill of item.removedSkills)scopedSkills[skill]=0;}
      const specCtx={...ctx,d:{...d,skillRanks:scopedSkills,proficiencies:scopedProficiencies,weaponGroups:scopedGroups}},before={groups:weaponGroups.length,removed:removedSkills.length,profs:Object.fromEntries(Object.entries(proficiencies).map(([key,values])=>[key,values.length]))};
      const spec=feat.parent==='Feat'?specification(feat,specCtx):featureSpecification(feat,specCtx),value=key=>spec.values[key]?.[0] || '',effect=clone(fixedAbilities[feat.name]?{abilities:fixedAbilities[feat.name]}:{});
      specs[feat.id]=spec;notes[feat.id]=spec.fields.flatMap(field=>(spec.values[field.key] || []).map(id=>field.label+': '+(field.options.find(item=>item.id===id)?.name || id)));
      if(value('ability'))effect.abilities={...effect.abilities,[value('ability')]:(effect.abilities?.[value('ability')] || 0)+1};
      const addSkills=(names,n=1)=>{effect.skillBonuses ||= {};for(const name of names)effect.skillBonuses[name]=(effect.skillBonuses[name] || 0)+n;};
      const addAbility=(key,n)=>{effect.abilities ||= {};effect.abilities[key]=(effect.abilities[key] || 0)+n;};
      const hp={'Grit':4,'Guts of steel':6,'Lifeforce':7,'Tough':8,'Invoke dark powers':-3,'Rite magic':-1,'Moon-blood':-1};if(hp[feat.name])effect.hpFlat=hp[feat.name];
      if(feat.name==='Battle scars')effect.hpFlat=Number(value('scars')) || 0;
      if(feat.name==='Grit') {effect.deathSaveSlots=1;effect.deathSaveBonus=2;}
      if(feat.name==='Lifeforce')effect.deathSaveSlots=1;
      if(feat.name==='Righteousness')effect.deathSaveBonus=1;
      if(feat.name==='Swift') {effect.initiative=3;effect.speed=5;}
      if(feat.name==='Rhetoric')addSkills(['Deception','Persuasion','Intimidation'],2);
      if(feat.name==='Scavenger')addSkills(['Survival']);
      if(feat.name==='Hermeticism')addSkills(['Investigation']);
      if(feat.name==='Extra talent spell') {effect.knownSpells=1;addSkills(['Arcana']);}
      if(feat.name==='Occultist knowledge') {effect.knownSpells=1;if(value('occult-benefit')==='slot')effect.occultSlots=1;else if(value('occult-benefit'))addAbility(value('occult-benefit'),1);}
      if(feat.name==='Extra occult casting' && d.cls?.name==='Occultist')effect.occultSlots=1;
      if(feat.name==='Expanded metamagic')effect.metamagicMaximum=1;
      if(feat.name==='Combat experience')effect.damage=1+(d.cls?1:0)+(d.eligibleArchetypes?.length || 0);
      if(feat.name==='Ice magic')effect.reductions={fire:2,cold:2};
      if(feat.name==='Guts of steel')effect.resistances=['poison'];
      if(feat.name==='Shielded mind')effect.resistances=['psychic'];
      if(feat.name==='Hardened scales') {effect.ac=1;effect.combatBlock=1;}
      if(feat.name==='Armor proficiency'){if(armorRank<3 && d.abilities.str>=12+armorRank){armorRank++;proficiencies.armor.push(['','light armor','medium armor','heavy armor'][armorRank]);}else if(armorRank===3)effect.blockCheck=2;}
      if(feat.name==='Shield proficiency'){if(shieldRank<2){shieldRank++;proficiencies.armor.push(shieldRank===1?'light shields':'heavy shields');}else if(d.gear.shieldBlock)effect.blockCheck=2;}
      if(feat.name==='Hand to hand combat' && !d.gear.attacks.length && !d.gear.shieldBlock)effect.ac=1;
      if(feat.name==='Shield-brother' && d.gear.shieldBlock)effect.ac=1;
      if(feat.name==='Iron will')effect.saveBonuses={int:1,wis:1,cha:1};
      if(feat.name==='Farsight')effect.saveBonuses={dex:1,int:1};
      if(feat.name==='Skilled')effect.skills=Object.fromEntries((spec.values.skills || []).map(name=>[name,1]));
      if(feat.parent==='Feat' && ['Expertise','Extreme training'].includes(feat.name)) {if(value('expertise')){effect.skills={[value('expertise')]:2};if(feat.name==='Expertise')addSkills([value('expertise')]);}if(value('expert-tool'))proficiencies.tools.push(value('expert-tool')+' (expertise)');if(value('lose-skill'))removedSkills.push(value('lose-skill'));}
      if(feat.choiceModel==='bard:Expertise'){if(value('expertise'))effect.skills={[value('expertise')]:2};if(value('expert-tool'))proficiencies.tools.push(value('expert-tool')+' (expertise)');}
      if(feat.choiceModel==='bard:Jack of all trades')addSkills(Object.keys(globalThis.CharacterRules.skillAbilities).filter(name=>!scopedSkills[name]));
      if(feat.choiceModel==='bard:Magical aptitude')addSkills(['Arcana']);
      if(feat.choiceModel==='bard:Persona insight' && scopedSkills.Insight<2)effect.skills={Insight:(scopedSkills.Insight || 0)+1};
      if(['bard:Martial skill','experience:2'].includes(feat.choiceModel))weaponGroups.push(...spec.values['weapon-groups'] || []);
      if(feat.choiceModel==='bard:Extra proficiencies')for(let n=0;n<2;n++){const kind=value('training-kind-'+n),name=value('training-'+n);if(!name)continue;if(kind==='skill')effect.skills={...effect.skills,[name]:1};else proficiencies[kind==='language'?'languages':'tools'].push(name);}
      if(feat.choiceModel==='experience:0'){if(value('skills'))effect.skills={[value('skills')]:1};if(value('language'))proficiencies.languages.push(value('language'));}
      if(feat.choiceModel==='experience:1' && value('armor')){if(value('armor')==='block')effect.combatBlock=1;else proficiencies.armor.push(value('armor')==='medium'?'medium armor':'heavy armor and heavy shields');}
      if(feat.choiceModel==='experience:3' && value('tool'))proficiencies.tools.push(value('tool')+' (+1 to checks)');
      if(feat.name==='weapon proficiency')weaponGroups.push(...spec.values['weapon-groups'] || []);
      if(['Retrain','Mixed elemental descendant'].includes(feat.name) && value('training')){const kind=value('training-kind');if(kind==='skill')effect.skills={...effect.skills,[value('training')]:1};else if(kind==='weapon')weaponGroups.push(value('training'));else if(kind==='language')proficiencies.languages.push(value('training'));else proficiencies.tools.push(value('training'));}
      if(feat.name==='Worldly') {addSkills(spec.values['worldly-skills'] || []);proficiencies.languages.push(...spec.values.languages || []);}
      if(feat.name==='Retrain' && value('from') && value('to')) {addAbility(value('from'),-1);addAbility(value('to'),1);if(value('bonus'))addAbility(value('bonus'),1);}
      if(feat.name==='Warpath' && value('warpath-mode')==='strength')addAbility('str',1);
      if(feat.name==='Symbiosis' && (spec.values.adaptations || []).includes(value('active')))addAbility(value('active'),1);
      if(feat.name==='Arcane insight') {if((spec.values.upgrade || []).includes('int'))addAbility('int',1);if((spec.values.upgrade || []).includes('arcana'))addSkills(['Arcana'],3);}
      if(feat.name==='Grimness') {if((spec.values.upgrade || []).includes('social'))addSkills(['Deception','Intimidation','Disguise']);if((spec.values.upgrade || []).includes('stealth'))addSkills(['Stealth'],2);if((spec.values.upgrade || []).includes('charisma'))effect.saveBonuses={cha:1};}
      if(feat.name==='Dual wielding' && (spec.values.upgrade || []).includes('trained'))effect.offHandAbilityDamage=true;
      if(feat.occultChoice){if(spec.values.resistances?.length)effect.resistances=spec.values.resistances;if(value('expertise'))effect.skills={[value('expertise')]:2};if(value('damage-type'))effect.extraDamage=[{dice:'1d4',type:value('damage-type')}];if(value('skill-scope')){const category=/social/.test(feat.name)?['cha']:/physical/.test(feat.name)?physical:mental,affected=value('skill-scope')==='standard'?Object.keys(globalThis.CharacterRules.skillAbilities).filter(skill=>category.includes(globalThis.CharacterRules.skillAbilities[skill])):value('mark-skills').split(',').map(name=>Object.keys(globalThis.CharacterRules.skillAbilities).find(skill=>skill.toLowerCase()===name.trim().toLowerCase())).filter(Boolean);addSkills(affected,-1);}}
      if(feat.name==='Mana-refusal' && value('sacrificed-cantrip') && value('sacrificed-upgrades')!==''){sacrificedSpells.push(value('sacrificed-cantrip'));if((spec.values['mana-upgrades'] || []).includes('spell-sacrifice') && value('sacrificed-spell'))sacrificedSpells.push(value('sacrificed-spell'));}
      if(feat.name==='Mutant kobold') {
        const changes={troglodyte:{abilities:{int:-2}},drakeling:{abilities:{wis:-2}},cavebold:{abilities:{cha:-2},resistances:['cold','fire']},rokold:{abilities:{con:-2}},goldling:{abilities:{int:3},deathSaveBonus:-2,ac:-1},kobolisk:{speed:-5,resistances:['acid','slashing']}};
        for(const id of spec.values.upgrade || [])for(const [key,change] of Object.entries(changes[id] || {})){if(Array.isArray(change))effect[key]=[...new Set([...(effect[key] || []),...change])];else if(typeof change==='object'){effect[key] ||= {};for(const [stat,amount] of Object.entries(change))effect[key][stat]=(effect[key][stat] || 0)+amount;}else effect[key]=(effect[key] || 0)+change;}
      }
      const extra={'Extra fighting skills':['Fighter','Fighting skills',2],'Extra Ranger training':['Ranger','Ranger training',2]};
      if(extra[feat.name]) {const [parent,feature,count]=extra[feat.name],group=d.choices.find(group=>group.parent===parent && group.featureName===feature);if(group)grants.push({groupId:group.id,count,source:feat.id});}
      if(feat.name==='Expanded alchemy')for(const [key,name] of [['alchemy-tool','Tool of choice'],['alchemy-method','Alchemy methods']]){const group=d.choices.find(group=>group.parent==='Alchemist' && group.featureName===name),selected=value(key);if(group && selected)grants.push({groupId:group.id,count:1,allowed:[selected],autoSelect:selected,source:feat.id});}
      if(feat.name==='Mixed elemental descendant' && value('lineage')){const group=d.choices.find(group=>group.options.some(option=>option.id===value('lineage')));if(group)grants.push({groupId:group.id,count:1,allowed:[value('lineage')],autoSelect:value('lineage'),source:feat.id});}
      if(['Extra cantrip upgrade','Infernal magic'].includes(feat.name) && value('cantrip')){const profile=metadata.spellProgressions.find(profile=>profile.entryId===value('cantrip'));if(profile)grants.push({groupId:profile.id,count:1,source:feat.id});}
      if(['parody','cantrip-mastery'].includes(feat.choiceModel)){
        const profile=metadata.spellProgressions.find(profile=>profile.entryId===(value('cantrip') || value('learn-cantrip'))),featureId=feat.choiceModel==='parody'?feat.id:d.choices.find(group=>group.id===feat.groupId)?.featureId;
        const count=(feat.choiceModel==='cantrip-mastery'?2:0)+d.choices.filter(group=>group.featureId===featureId && (feat.choiceModel==='parody' || group.requiresChoice?.optionId===feat.optionId)).reduce((total,group)=>total+group.selected.filter(id=>/upgrade the cantrip an additional time/i.test(group.options.find(option=>option.id===id)?.name || '')).length,0);
        if(profile?.options.length && count)grants.push({groupId:profile.id,count,source:feat.id});
      }
      if(feat.parent==='Feature'){const entryId=value('learn-cantrip') || value('learn-hex'),profile=metadata.spellProgressions.find(profile=>profile.entryId===entryId),count=(spec.values['racial-upgrades'] || []).filter(key=>key==='own').length+(feat.name==='Outcast house descendant' && c.level>=2?1:0);if(profile && count)grants.push({groupId:profile.id,count,source:feat.id});}
      if(feat.name==='More upgrades' || ['bard:Deep past','new-tricks'].includes(feat.choiceModel))for(const target of (feat.parent==='Feat'?upgradeTargets(ctx,feat.id):abilityTargets(ctx,feat)).filter(target=>(spec.values.targets || []).includes(target.id))){if(target.groupId)grants.push({groupId:target.groupId,count:1,allowed:target.allowed,source:feat.id});if(target.spell){const profile=metadata.spellProgressions.find(profile=>profile.entryId===idOf(target.spell));if(profile)grants.push({groupId:profile.id,count:1,source:feat.id});}}
      for(const field of spec.fields.filter(field=>field.key.startsWith('learn-') || field.key.startsWith('hex-')))for(const entryId of spec.values[field.key] || []) {
        const entry=ctx.spells.find(entry=>idOf(entry)===entryId);if(entry)spells.push({id:(feat.name==='cryptic cyphers'?c.spells.find(row=>row.entryId===entryId && !row.classId && (!row.featSource || row.featSource===feat.id))?.id:'') || 'feat-spell:'+feat.id+':'+field.key+':'+entryId,entryId,name:entry.name,prepared:true,classId:'',featSource:feat.id,progressionMode:feat.name==='cryptic cyphers'?'cypher':'level',manualUpgrades:feat.name==='cryptic cyphers'?Math.min(5,Math.max(0,Math.floor((Number(value('insights'))-3)/3))):0,castingAbility:value('casting-ability') || (/^(?:bard|sorcerer):/.test(feat.choiceModel || '')?'cha':feat.name==='cryptic cyphers'?(ctx.d.castingAbility || 'int'):['Invoke dark powers','Occult birth'].includes(feat.name)?'con':feat.name==='Noble-line'?'cha':feat.name==='Arcane intuition'?mental.reduce((best,key)=>ctx.d.abilities[key]>ctx.d.abilities[best]?key:best,'int'):feat.name==='Arcane insight'?'int':feat.name==='Infernal magic'?Object.keys(ctx.d.abilities).reduce((best,key)=>ctx.d.abilities[key]>ctx.d.abilities[best]?key:best,'int'):'wis'),notes:'Granted by '+feat.name+'. Use the granting rule’s costs, casting ability and limits.'});
      }
      training.push({source:feat.id,level:feat.level || 1,proficiencies:Object.fromEntries(Object.entries(proficiencies).map(([key,values])=>[key,values.slice(before.profs[key])])),weaponGroups:weaponGroups.slice(before.groups),removedSkills:removedSkills.slice(before.removed)});
      effects.push({effect,level:feat.level || 1,sourceFeat:feat.id});
    }
    const result={effects,grants,proficiencies,weaponGroups,removedSkills,notes,spells,specs,moreTargets,sources,sacrificedSpells,training};result.signature=JSON.stringify({effects,grants,proficiencies,weaponGroups,removedSkills,notes,spells,sacrificedSpells});return result;
  }
  function spellModifiers(c,d,entry) {
    const entryId=idOf(entry),result={attack:0,save:0,notes:[]};
    for(const feat of d.featPlan?.sources || d.features.filter(item=>item.parent==='Feat')) {
      const spec=d.featPlan?.specs[feat.id];if(!spec)continue;const value=key=>spec.values[key]?.[0];
      if(value('learn-cantrip')===entryId && feat.parent==='Feature'){const upgrades=spec.values['racial-upgrades'] || [];result.attack+=upgrades.filter(key=>key==='attack').length;result.save+=upgrades.filter(key=>key==='save').length;if(feat.name==='Saved by order'){result.attack++;result.save++;}for(const key of upgrades)if(!['attack','save','own'].includes(key))result.notes.push(feat.name+': '+(spec.fields.find(field=>field.key==='racial-upgrades').options.find(item=>item.id===key)?.name || key));for(const field of spec.fields.filter(field=>field.key.startsWith('racial-own')))for(const id of spec.values[field.key] || [])result.notes.push(feat.name+': '+(field.options.find(item=>item.id===id)?.name || id));}
      if(value('spell-target')===entryId) {
        if(feat.name==='Offensive magic'){if(['attack','both'].includes(value('spell-mode')))result.attack++;if(['save','both'].includes(value('spell-mode')))result.save++;}
        if(feat.name==='Stable magic')result.notes.push('Stable magic: +2 turns; apply its concentration and distance rules.');
        if(feat.name==='Violent magic')result.notes.push('Violent magic: +1d4 damage; remove '+(value('component') || 'the chosen')+' component.');
        if(feat.name==='Toxomancy')result.notes.push('Toxomancy: +1d4 poison damage.');
      }
      if(value('target')===entryId)result.notes.push(feat.name+': '+(feat.name.endsWith('Longer')?'+1d3 duration units':feat.name.endsWith('More uses')?'+1 use per rest/long rest':'apply '+value('chance-mode')+' improvement'));
      for(const key of ['cantrip-upgrade','extra:spell:'+entryId])if((key==='cantrip-upgrade' && value('cantrip')===entryId) || key!=='cantrip-upgrade')for(const id of spec.values[key] || []) {const field=spec.fields.find(field=>field.key===key),item=field?.options.find(item=>item.id===id);if(item)result.notes.push(feat.name+': '+item.name);}
    }
    return result;
  }
  globalThis.CharacterFeats=Object.freeze({context,specification,plan,repeatLimit,tierRequirements,upgradeTargets,spellModifiers,grantsAbility});
})();
