"use strict";

// Evaluate the literal feat requirements against the character. Unknown or
// story-dependent requirements remain unavailable until their facts are known.
(() => {
  const names={strength:'str',dexterity:'dex',constitution:'con',intelligence:'int',wisdom:'wis',charisma:'cha'};
  const normalize=value=>String(value ?? '').toLowerCase().replace(/[’']/g,'').replace(/[-_]/g,' ').replace(/\s+/g,' ').trim().replace(/[.,;:]$/,'');
  const words=value=>normalize(value).replace(/s$/,'');
  const contains=(text,name)=>(' '+normalize(text)+' ').includes(' '+normalize(name)+' ');
  function requirements(entry) {
    const raw=entry.details?.requirements ?? entry.details?.requires ?? [];
    if(Array.isArray(raw))return raw.map(String);
    const quoted=[...String(raw).matchAll(/-\s*"([^"]+)"/g)].map(match=>match[1]);
    return quoted.length?quoted:[String(raw)];
  }
  function context(character,derived,catalog,level=character.level,abilities=derived.abilities) {
    const features=derived.features.filter(feature=>(feature.requiredLevel ?? feature.level ?? 1)<=level);
    const options=derived.choices.filter(group=>group.kind!=='feat' && group.level<=level).flatMap(group=>group.options.filter(option=>group.selected.includes(option.id)));
    const all=catalog.flatMap(section=>(section.entries || []).map(entry=>({...entry,section:section.key})));
    const casting=derived.casting?.profile;
    const row=casting?.progression.filter(row=>row.level<=level).at(-1);
    const maxSpell=casting?.mode==='leveled'?Math.max(0,...(row?.slots || []).map(slot=>slot.level)):casting?.mode==='full'?character.build?.casting?.maxSlotLevel ?? 0:Math.ceil(level/2);
    const spells=character.spells.filter(saved=>!saved.featSource || features.some(feature=>feature.id===saved.featSource) || derived.choices.some(group=>group.level<=level && group.kind!=='feat' && group.selected.some(id=>group.id+':'+id===saved.featSource))).map(saved=>all.find(entry=>entry.section==='spells' && JSON.stringify(['spells',entry.group,entry.name])===saved.entryId)).filter(entry=>entry && (!entry.details?.lvl || Number(entry.details.lvl)<=maxSpell));
    return {character,derived,catalog,level,abilities,features,options,spells,casting,row,
      race:normalize(derived.race?.name || character.ancestry),className:normalize(derived.cls?.name || character.className),
      background:normalize(derived.background?.name || character.background),
      facts:new Set(character.build?.qualifications || []),
      featureNames:new Set([...features,...options].map(feature=>words(feature.name))),
      weaponResults:new Map(),
      ruleText:[...features.map(feature=>typeof feature.details==='string'?feature.details.split(/\n\s*\*/)[0]:feature.parent==='Background'?Object.entries(feature.details || {}).filter(([key])=>key!=='proficiencies').map(([,value])=>typeof value==='string'?value:'').join('\n'):feature.details?.description || ''),...options.map(option=>String(option.ownDetails || option.details || ''))].join('\n')};
  }
  const known=(met)=>({met:!!met,known:true});
  const unknown=()=>({met:false,known:false});
  const combine=(values,any=false)=>({met:any?values.some(result=>result.met):values.every(result=>result.met),known:any?values.some(result=>result.met)||values.every(result=>result.known):values.every(result=>result.known)});
  function hasSpell(facts,{traditions=[],cantrips=false,spells=false,pattern=null}={}) {
    if(!pattern && facts.casting && (!traditions.length || facts.casting.tradition==='any' || traditions.includes(facts.casting.tradition))) {
      if(cantrips && facts.row?.cantrips>0 || spells && (facts.row?.knownSpells>0 || facts.casting.startingSpellbook))return true;
    }
    if(!pattern && (!traditions.length || traditions.some(name=>new RegExp('(?:learn|know|gain)[^.]*\\b'+name+'\\b[^.]*\\b'+(cantrips?'cantrip':'spell'),'i').test(facts.ruleText))) && new RegExp('(?:learn|know|gain)[^.]*\\b'+(cantrips?'cantrip':'spell'),'i').test(facts.ruleText))return true;
    return facts.spells.some(entry=>{
      const info=globalThis.CharacterCasting.spellInfo(entry,facts.casting?.tradition);
      return (!traditions.length || traditions.includes(info.tradition)) && (info.cantrip?cantrips:spells) && (!pattern || pattern.test(JSON.stringify(entry.details)));
    });
  }
  function proficient(facts,raw) {
    const value=normalize(raw).replace(/^(?:a|an|any|either) /,'').replace(/[.]/g,'');
    const skill=Object.keys(globalThis.CharacterRules?.skillAbilities || facts.derived.skillRanks).find(skill=>normalize(skill)===value);
    if(skill)return (facts.derived.skillRanks[skill] || 0)>0;
    const armor=normalize(facts.derived.proficiencies.armor);
    if(/armor|armour/.test(value))return /all armou?r/.test(armor) || contains(armor,value.replace('armour','armor'));
    if(/shield|martial weapon|crossbow|\bbows?\b|throwing|thrown/.test(value)) {
      if(facts.weaponResults.has(value))return facts.weaponResults.get(value);
      const candidates=facts.catalog.filter(section=>section.key==='items').flatMap(section=>section.entries || []).filter(entry=>{
        const description=normalize(entry.name+' '+entry.group+' '+String(entry.details?.type || ''));
        if(/shield/.test(value))return /shield/.test(description) && (!/light|heavy/.test(value) || contains(description,value.includes('heavy')?'heavy':'light'));
        if(!entry.details?.damage)return false;
        if(/martial/.test(value))return /martial/.test(String(entry.details.type));
        if(/crossbow/.test(value))return /crossbow/.test(description) || /similar/.test(value) && /firearm|pistol|rifle|gun/.test(description);
        if(/\bbows?\b/.test(value))return /\bbows?\b/.test(description);
        return /throwing|thrown/.test(description+' '+String(entry.details.properties));
      });
      const result=candidates.some(entry=>{
        const probe={...facts.character,inventory:[{id:'prerequisite-probe',entryId:JSON.stringify(['items',entry.group,entry.name]),name:entry.name,quantity:1,equipped:true}]};
        const gear=globalThis.CharacterEquipment.derive(probe,facts.catalog,{abilities:facts.abilities,proficiencies:facts.derived.proficiencies,weaponGroups:facts.derived.weaponGroups || facts.character.build?.weaponGroups || [],proficiency:facts.derived.proficiency,raceSize:facts.derived.race?.size || 'medium'});
        return /shield/.test(value)?gear.blockProficient:gear.attacks.some(attack=>attack.trained);
      });
      facts.weaponResults.set(value,result);return result;
    }
    return null;
  }
  function evaluateClause(raw,facts) {
    let text=normalize(raw).replace(/^either /,'').replace(/^at least /,'').replace(/^has (?:either )?/,'');
    if(!text || /^(?:none|no requirements)$/.test(text))return known(true);
    // Source lists use commas for both conjunctions and enumerations.
    const conjunction=text.replace(/,\s*and\s+/g,' and ').replace(/,\s*(?=(?:\d+\s|ability to|proficiency with|at least |with tiefling))/g,' and ');
    if(/\s+and\s+/.test(conjunction))return combine(conjunction.split(/\s+and\s+/).map(part=>evaluateClause(part,facts)));
    const trailing=text.match(/^(.+\))\s+(\d+ .+)$/);
    if(trailing)return combine([evaluateClause(trailing[1],facts),evaluateClause(trailing[2],facts)]);
    let match=text.match(/^(\d+) in all ability scores$/);
    if(match)return known(Object.values(facts.abilities).every(score=>score>=Number(match[1])));
    match=text.match(/^(\d+) (?:in a )?mental (?:ability score|stat)$/);
    if(match)return known(['int','wis','cha'].some(code=>facts.abilities[code]>=Number(match[1])));
    match=text.match(/^(\d+)(?:\/\d+)* (strength|dexterity|constitution|intelligence|wisdom|charisma)(?: or (strength|dexterity|constitution|intelligence|wisdom|charisma))?$/);
    if(match)return known([match[2],match[3]].filter(Boolean).some(name=>facts.abilities[names[name]]>=Number(match[1])));
    match=text.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma) (\d+)(?:\/\d+)*$/);
    if(match)return known(facts.abilities[names[match[1]]]>=Number(match[2]));
    match=text.match(/^(?:lvl|level) (\d+)$/);
    if(match)return known(facts.level>=Number(match[1]));
    match=text.match(/^(?:at least )?(\d+) levels? in (.+)$/);
    if(match)return known(facts.className===normalize(match[2]) && facts.level>=Number(match[1]));
    match=text.match(/^(.+?)\s*\((\w+)\s*(?:level )?(\d+)(?: feature)?\)$/);
    if(match)return known(facts.className===match[2] && facts.level>=Number(match[3]) && facts.featureNames.has(words(match[1])));
    match=text.match(/^(.+?) (\d+)$/);
    if(match && /^(?:alchemist|barbarian|bard|cleric|druid|fighter|monk|occultist|ranger|rogue|sorcerer|wizard)$/.test(match[1]))return known(facts.className===match[1] && facts.level>=Number(match[2]));
    if(/^proficiency with | proficiency$/.test(text)) {
      const value=text.replace(/^proficiency with /,'').replace(/ proficiency$/,'');
      const shields=value.match(/^(light|heavy) or (light|heavy) shields?$/);
      if(shields)return known(proficient(facts,shields[1]+' shield') || proficient(facts,shields[2]+' shield'));
      const results=value.split(/,\s*|\s+or\s+/).filter(Boolean).map(value=>proficient(facts,value));
      return results.some(value=>value===true)?known(true):results.every(value=>value!==null)?known(false):unknown();
    }
    if(/^ability to cast /.test(text)) {
      const value=text.slice(16),traditions=['arcane','mystic','oath','occult'].filter(name=>contains(value,name));
      const cantrips=/cantrip/.test(value),spells=/\bspell/.test(value)||!cantrips;
      let pattern=null;
      if(/cold damage/.test(value))pattern=/cold.*damage|damage.*cold/i;
      else if(/poison damage/.test(value))pattern=/poison.*damage|damage.*poison/i;
      else if(/necromancy/.test(value))pattern=/necromancy/i;
      else if(/hp cost/.test(value))pattern=/(?:hp|health|hit points).*(?:cost|spend|sacrifice)|(?:cost|spend|sacrifice).*(?:hp|health|hit points)/i;
      else if(/attack or save/.test(value))pattern=/spell attack|sav(?:e|ing throw)/i;
      else if(/deals damage/.test(value))pattern=/\bdamage\b/i;
      else if(/duration|concentration/.test(value))pattern=/duration|concentration/i;
      const allowedTraditions=/non occult/.test(value)?['arcane','oath','mystic']:traditions;
      return known(hasSpell(facts,{traditions:allowedTraditions,cantrips,spells,pattern}));
    }
    if(/^ability to summon|^ability to summon or conjure|^ability to summon or bind/.test(text))return known(facts.spells.some(spell=>/summon|conjure|bind/i.test(spell.name+' '+String(spell.details.effect))) || /summon|conjure|bind/i.test(facts.ruleText));
    if(text==='upgradeable cantrip')return known(facts.spells.some(spell=>globalThis.CharacterCasting.spellInfo(spell).cantrip && /\*/.test(String(spell.details.upgrades || ''))));
    if(text==='a damage dealing ability with a rest die cost or a per rest or long rest use count')return known(/damage/i.test(facts.ruleText) && /rest die|rest dice|per rest|per long rest/i.test(facts.ruleText));
    if(text==='ability to create or procure items during rest')return known(facts.facts.has('rest-crafting') || /during a? ?rest/i.test(facts.ruleText) && /create|craft|procure/i.test(facts.ruleText));
    if(text==='died' || text==='has died')return known(facts.facts.has('has-died'));
    if(/slain a murderous vampire/.test(text))return known(facts.facts.has('righteous-slaying'));
    if(/any .?apprentice.? background/.test(text))return known(/apprentice/.test(facts.background));
    if(text==='with tiefling elven trait')return known(facts.options.some(option=>normalize(option.name)==='tiefling'));
    if(text==='cleric class')return known(facts.className==='cleric');
    const archetype=text.match(/^(.+?) archetype(?: \((.+)\))?$/);
    if(archetype)return known(facts.derived.eligibleArchetypes.some(item=>normalize(item.name)===archetype[1] && item.minLevel<=facts.level));
    if(/ranger focus ability/.test(text))return known(facts.className==='ranger' && facts.featureNames.has('focus'));
    if(text==='alchemy points (alchemist)')return known(facts.className==='alchemist');
    if(/templar \(cleric\) might ability/.test(text))return known(facts.featureNames.has('templars might')||facts.featureNames.has('might'));
    // A list of race/class/background identities is an OR clause. Match only
    // catalog identities, so misspelled or obsolete names cannot silently pass.
    const identity=text.replace(/\b(?:or has the|has the|has|the|background|class)\b/g,' ').replace(/\s+/g,' ').trim();
    const items=identity.split(/,\s*|\s+or\s+/).map(value=>normalize(value)).filter(Boolean);
    const identities=new Set(facts.catalog.filter(section=>['classes','races','backgrounds'].includes(section.key)).flatMap(section=>(section.entries || []).map(entry=>normalize(entry.name))));
    ['alchemist','barbarian','bard','cleric','druid','fighter','monk','occultist','ranger','rogue','sorcerer','wizard'].forEach(name=>identities.add(name));
    if(items.length && items.some(item=>[facts.race,facts.className,facts.background].includes(item)))return known(true);
    if(items.length && items.every(item=>identities.has(item)))return known(false);
    if(/\s+or\s+/.test(text))return combine(text.split(/\s+or\s+/).map(part=>evaluateClause(part,facts)),true);
    if(/,/.test(text))return combine(text.split(/,\s*/).map(part=>evaluateClause(part,facts)));
    return unknown();
  }
  function evaluate(entry,facts) {
    const clauses=requirements(entry),results=clauses.map(clause=>({clause,...evaluateClause(clause,facts)}));
    return {eligible:results.every(result=>result.met),requirements:clauses,unmet:results.filter(result=>!result.met).map(result=>result.clause),unresolved:results.filter(result=>!result.known).map(result=>result.clause)};
  }
  globalThis.CharacterPrerequisites=Object.freeze({requirements,context,evaluate});
})();
