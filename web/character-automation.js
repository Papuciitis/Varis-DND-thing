"use strict";

// Mechanics are validated at build time. This interpreter never evaluates code
// or guesses mechanical effects from an entry's description.
(() => {
  const clone=value=>JSON.parse(JSON.stringify(value));
  const names={str:'Strength',dex:'Dexterity',con:'Constitution',int:'Intelligence',wis:'Wisdom',cha:'Charisma'};
  const indexes=new WeakMap();
  const entryId=(section,entry)=>entry.entryId || JSON.stringify([section.key,entry.group,entry.name]);
  function ruleFor(source,ctx) {
    const ids=[source.automationId,source.optionId,source.entryId,source.id].filter(Boolean),declared=ctx.metadata.automation?.sources || {};
    for(const id of ids)if(declared[id])return declared[id];
    if(source.automation)return source.automation;
    if(ctx.catalog){
      if(!indexes.has(ctx.catalog))indexes.set(ctx.catalog,new Map(ctx.catalog.flatMap(section=>(section.entries || []).filter(entry=>entry.automation).map(entry=>[entryId(section,entry),entry.automation]))));
      const index=indexes.get(ctx.catalog);for(const id of ids)if(index.has(id))return index.get(id);
    }
    return null;
  }
  function condition(test,source,ctx,values={}) {
    if(!test)return true;
    if(test.all)return test.all.every(item=>condition(item,source,ctx,values));
    if(test.any)return test.any.some(item=>condition(item,source,ctx,values));
    if(test.not)return !condition(test.not,source,ctx,values);
    if(test.choice)return (values[test.choice] || []).includes(test.includes);
    if(test.class)return (ctx.d.classProgressions || []).some(owner=>owner.cls.name.toLowerCase()===test.class.toLowerCase() && owner.level>=test.level);
    if(test.level)return (test.basis==='character'?ctx.c.level:source.classLevel ?? ctx.c.level)>=test.level;
    if(test.ability)return (ctx.d.abilities[test.ability] || 0)>=test.minimum;
    if(test.skill)return (ctx.d.skillRanks[test.skill] || 0)>=test.rank;
    return false;
  }
  function prerequisites(entry,facts) {
    const test=entry.automation?.prerequisites;if(!test)return null;
    const ctx={c:{level:facts.level},d:{abilities:facts.abilities,skillRanks:facts.derived.skillRanks,classProgressions:[...facts.classLevels].map(([name,level])=>({cls:{name},level}))}};
    const describe=value=>value.all?value.all.map(describe).join(' and '):value.any?'('+value.any.map(describe).join(' or ')+')':value.not?'Not '+describe(value.not):value.class?value.class+' level '+value.level:value.level?'Level '+value.level:value.ability?names[value.ability]+' '+value.minimum:value.skill?value.skill+' rank '+value.rank:'Declared prerequisite';
    const label=describe(test),eligible=condition(test,{},ctx);
    return {eligible,requirements:[label],unmet:eligible?[]:[label],unresolved:[]};
  }
  function specification(source,ctx,helpers) {
    const definition=ruleFor(source,ctx),saved=ctx.c.build.featChoices[source.id] || {},fields=[],values={},slots={},inactive={},missing=[];
    if(!definition)return null;
    if(!condition(definition.prerequisites,source,ctx))return {fields,values,slots,inactive,missing,notes:['This feature’s declared prerequisites are not met.'],automation:true,blocked:true};
    for(const choice of definition.choices || []){
      if(!condition(choice.when,source,ctx,values))continue;
      const level=choice.levelBasis==='character'?ctx.c.level:source.classLevel ?? ctx.c.level;
      const unit=choice.countByLevel?.filter(row=>row.level<=level).at(-1)?.count ?? choice.count ?? 1;
      const parent=choice.perChoice && fields.find(field=>field.key===choice.perChoice.choice),parentSlots=parent?(slots[parent.key] || []).flatMap((id,index)=>id===choice.perChoice.includes?Array(unit).fill(index):[]):null;
      const base=parentSlots?parentSlots.length:unit;
      const extra=(ctx.extraLists || []).filter(grant=>grant.targetSource===source.id && grant.targetChoice===choice.key || grant.target==='feat:'+source.id && choice.key==='upgrade');
      const field={...choice,baseCount:base,count:base+extra.length,options:clone(choice.options || [])};
      if(choice.type==='ability')field.options=(choice.abilities || Object.keys(names)).map(id=>({id,name:names[id]}));
      if(choice.type==='skill')field.options=Object.keys(globalThis.CharacterRules.skillAbilities).filter(name=>choice.rankBelow===undefined || (ctx.d.skillRanks[name] || 0)<choice.rankBelow || (saved[choice.key] || []).includes(name)).map(name=>({id:name,name}));
      if(choice.type==='spell'){
        field.type='select';field.options=ctx.spells.filter(entry=>{const info=globalThis.CharacterCasting.spellInfo(entry);return info.level===choice.level && choice.traditions.includes(info.tradition);}).map(entry=>({id:globalThis.CharacterCasting.spellId(entry),name:entry.name})).sort((a,b)=>a.name.localeCompare(b.name));
      }
      if(choice.type==='upgrade-target'){field.type='select';field.options=helpers.targets(ctx,source,choice.targetMode || 'upgrades',choice);}
      if(choice.type==='ability' || choice.type==='skill')field.type='select';
      if(parentSlots){
        field.parentKey=parent.key;field.parentSlots=parentSlots;
        field.slotSources=parentSlots.map((slot,index)=>'parent:'+parent.key+':'+(parent.slotSources?.[slot] || slot)+':'+index%unit);
        field.slotLabels=parentSlots.map(slot=>'From '+parent.label+' '+(slot+1));
        field.storageSlots=helpers.storage(saved,field.slotSources,choice.key);
      }
      if(choice.upgradeable){
        field.slotLabels=[...Array.from({length:base},(_,index)=>base>1?'Base upgrade '+(index+1):'Base upgrade'),...extra.map(grant=>'Extra from '+grant.sourceName)];
        field.slotSources=[...(field.slotSources || Array.from({length:base},(_,index)=>index?'base:'+index:'base')),...extra.map(grant=>grant.ownerKey || grant.source)];
        field.storageSlots=helpers.storage(saved,field.slotSources,choice.key);
      }
      field.conditionChoices=[];
      const collect=test=>{if(!test)return;if(test.choice)field.conditionChoices.push(test);for(const key of ['all','any'])for(const child of test[key] || [])collect(child);};collect(choice.when);
      if(choice.perChoice)field.conditionChoices.push(choice.perChoice);
      const upgradeParent=field.conditionChoices.find(item=>item.choice==='upgrade');if(upgradeParent)field.requiresUpgrade=upgradeParent.includes;
      const selected=helpers.selection(field,saved);
      field.options=field.options.map(item=>({...item,unavailableReason:(item.requires || []).filter(id=>!selected.values.includes(id)).map(id=>'Requires '+(field.options.find(option=>option.id===id)?.name || id)).join('; ')}));
      fields.push(field);values[field.key]=selected.values;slots[field.key]=selected.slots;inactive[field.key]=selected.inactive;
      if(!field.optional && selected.values.length<field.count)missing.push(field.label);
    }
    return {fields,values,slots,inactive,missing,notes:[...(definition.notes || []),...(definition.manual?[definition.manual]:[])],automation:true};
  }
  function add(target,addition) {
    for(const [key,value] of Object.entries(addition || {})){
      if(Array.isArray(value))target[key]=[...new Set([...(target[key] || []),...value])];
      else if(value && typeof value==='object'){target[key] ||= {};for(const [name,amount] of Object.entries(value))target[key][name]=key==='skills'?Math.max(target[key][name] || 0,amount):(target[key][name] || 0)+amount;}
      else if(typeof value==='number')target[key]=(target[key] || 0)+value;
      else target[key]=value;
    }
  }
  function project(source,spec,ctx,helpers) {
    const definition=ruleFor(source,ctx),effect={},proficiencies={armor:[],weapons:[],tools:[],languages:[]},grants=[],extraLists=[],spells=[],features=[];
    if(spec.blocked)return {effect,proficiencies,grants,extraLists,spells,features};
    for(const [key,values] of Object.entries(definition.proficiencies || {}))proficiencies[key].push(...values);
    for(const item of definition.effects || [])if(condition(item.when,source,ctx,spec.values)){
      if(item.add)add(effect,item.add);
      else for(const value of spec.values[item.choice] || []){
        if(item.target.startsWith('proficiencies.'))proficiencies[item.target.slice('proficiencies.'.length)].push(value);
        else add(effect,{[item.target]:{[value]:item.amount}});
      }
    }
    for(const field of spec.fields)for(const id of spec.values[field.key] || [])add(effect,field.options.find(item=>item.id===id)?.effects);
    for(const [grantIndex,item] of (definition.grants || []).entries())if(condition(item.when,source,ctx,spec.values)){
      const unit=item.countByLevel?.filter(row=>row.level<=(source.classLevel ?? ctx.c.level)).at(-1)?.count ?? item.count;
      const count=unit*(item.perChoice?(spec.values[item.perChoice.choice] || []).filter(id=>id===item.perChoice.includes).length:1);
      const field=spec.fields.find(field=>field.key===item.from);
      const targets=item.groupId?[{groupId:item.groupId,id:'group:'+item.groupId,allowed:item.allowed}]:item.targetSource?[...helpers.sources(ctx)].filter(target=>target.automationId===item.targetSource || target.entryId===item.targetSource || target.id===item.targetSource).map(target=>({id:target.parent==='Feat' && item.targetChoice==='upgrade'?'feat:'+target.id:'source:'+target.id+':'+item.targetChoice,targetSource:target.id,targetChoice:item.targetChoice})):field?(spec.slots[item.from] || []).map((id,index)=>({option:field.options.find(option=>option.id===id),index})).filter(row=>row.option).map(row=>({...row.option,selectionSlot:row.index})):[];
      for(const target of targets){
        if(target.groupId)grants.push({groupId:target.groupId,count,allowed:target.allowed,source:source.id});
        else if(target.spell){const profile=ctx.metadata.spellProgressions.find(profile=>profile.entryId===globalThis.CharacterCasting.spellId(target.spell));if(profile)grants.push({groupId:profile.id,count,source:source.id});}
        if(target.targetSource || target.id?.startsWith('feat:'))for(let index=0;index<count;index++)extraLists.push({target:target.id,targetSource:target.targetSource || target.id.slice(5),targetChoice:target.targetChoice || 'upgrade',source:source.id,sourceName:source.name,ownerKey:item.ownerKey==='source'?(index?source.id+':extra:'+index:source.id):source.id+':grant:'+grantIndex+':'+(target.selectionSlot || 0)+':'+index});
      }
    }
    for(const field of spec.fields.filter(field=>field.grantSpell))for(const id of spec.values[field.key] || []){
      const entry=ctx.spells.find(entry=>globalThis.CharacterCasting.spellId(entry)===id),casting=field.grantSpell;if(!entry)continue;
      spells.push({id:'feat-spell:'+source.id+':'+field.key+':'+id,entryId:id,name:entry.name,prepared:true,classId:'',featSource:source.id,progressionMode:'level',castingAbility:casting.ability || 'wis',ruleCasting:{resource:casting.resource || 'manual'},notes:casting.notes || 'Granted by '+source.name+'. Use the granting rule’s costs and limits.'});
    }
    for(const item of definition.featGrants || [])if(condition(item.when,source,ctx,spec.values)){
      const count=item.count*(item.perChoice?(spec.values[item.perChoice.choice] || []).filter(id=>id===item.perChoice.includes).length:1);if(!count)continue;
      const id=source.id+':feat-grant:'+item.key,groupId=id+':choices';
      const options=ctx.catalog.filter(section=>section.key==='feats').flatMap(section=>(section.entries || []).map(entry=>({id:entryId(section,entry),name:entry.name,details:entry.details,automation:entry.automation}))).filter(entry=>!item.noAbilityIncrease || !globalThis.CharacterFeats.grantsAbility(entry)).map(entry=>({...entry,repeatLimit:globalThis.CharacterFeats.repeatLimit(entry)}));
      features.push({id,name:item.label || 'Bonus feat from '+source.name,parent:source.name,classId:source.classId,classLevel:source.classLevel,level:source.level || 1,requiredLevel:source.level || 1,details:'',grantedBy:source.id,choices:[{id:groupId,label:item.label || 'Bonus feat',kind:'feat',count,options}]});
    }
    return {effect,proficiencies,grants,extraLists,spells,features};
  }
  function safeGrants(extraLists,grants,sources) {
    const graph=new Map(),edges=[...extraLists.map(item=>({item,target:item.targetSource || item.target?.slice(5)})),...grants.map(item=>({item,target:item.groupId}))];
    const link=(from,to)=>{if(!graph.has(from))graph.set(from,new Set());graph.get(from).add(to);};
    for(const source of sources)if(source.groupId)link(source.groupId,source.id);
    for(const edge of edges)if(edge.target)link(edge.item.source,edge.target);
    const reaches=(from,to,seen=new Set())=>{if(from===to)return true;if(seen.has(from))return false;seen.add(from);return [...(graph.get(from) || [])].some(next=>reaches(next,to,seen));};
    const blocked=new Set(edges.filter(edge=>edge.target && reaches(edge.target,edge.item.source)).map(edge=>edge.item));
    return {extraLists:extraLists.filter(item=>!blocked.has(item)),grants:grants.filter(item=>!blocked.has(item)),blocked:[...blocked],warnings:blocked.size?['Circular upgrade grants were ignored. Review the granting rules and selected targets.']:[]};
  }
  globalThis.CharacterAutomation=Object.freeze({ruleFor,condition,specification,project,safeGrants,prerequisites});
})();
