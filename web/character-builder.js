"use strict";

(() => {
  const names = {str:"Strength",dex:"Dexterity",con:"Constitution",int:"Intelligence",wis:"Wisdom",cha:"Charisma"};
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const copy = value => JSON.parse(JSON.stringify(value));
  const signed = value => Number(value) >= 0 ? "+" + value : String(value);
  const uid = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2);
  const option = (value, label, selected, disabled = false) => `<option value="${escape(value)}"${selected ? " selected" : ""}${disabled ? " disabled" : ""}>${escape(label)}</option>`;
  const field = (label, content, note = "") => `<label class="field"><span>${escape(label)}</span>${content}${note ? `<small class="muted">${escape(note)}</small>` : ""}</label>`;
  const grid = body => `<div class="form-grid builder-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));gap:1rem">${body}</div>`;
  const setSlot = (values, index, value, empty = "") => {
    while (values.length <= index) values.push(empty);
    values[index] = value;
  };

  function create({rules, show, onFinish, onCancel = () => {}, renderRule = value => `<p>${escape(typeof value === "string" ? value : JSON.stringify(value))}</p>`}) {
    let draft = null, stage = "Ancestry", open = false, isNew = false, itemToAdd = "", itemQuery = "", itemCategory = "";
    let spellToAdd = '', spellQuery = '', spellLevel = '', spellKind = 'spells', spellLimit = 48,spellWorkspace='library';
    let focusedTask = '', focusedOption = '', featureQuery = '', showLocked = false, optionLimit = 36;
    let equipmentView='catalog',itemLimit=48,focusedItem='',ownedQuery='',lastAdded='';
    const metadata = rules.metadata || {};
    const order = globalThis.EntryOrder;
    const races = metadata.races || [], classes = metadata.classes || [], archetypes = metadata.archetypes || [];
    const itemEntries = () => (rules.catalog || []).flatMap(section => ["items","magic-items"].includes(section.key) ? (section.entries || []).map(entry => ({...entry,section:section.key,entryId:globalThis.MagicItems?.entryId(section.key,entry) || JSON.stringify([section.key,entry.group || "",entry.name])})) : []);
    let items=itemEntries();
    let weaponGroups=[];
    const allSkills = Object.keys(globalThis.CharacterRules?.skillAbilities || {});
    const details = (title, value) => value ? `<details class="builder-rule"><summary>${escape(title)}</summary><div class="rule-body">${renderRule(value)}</div></details>` : "";
    const select = (path, values, current, placeholder = "Choose…") => `<select data-builder-path="${escape(path)}">${option("",placeholder,!current)}${values.map(item => option(item.id,item.name,item.id === current)).join("")}</select>`;
    const textInput = (path, value, type = "text", extra = "") => `<input type="${type}" data-builder-path="${escape(path)}" value="${escape(value)}" ${extra}>`;
    const selectedClass = () => classes.find(item => item.id === draft.build.classId);
    const selectedRace = () => races.find(item => item.id === draft.build.raceId);
    const backgroundEntries = () => (rules.catalog || []).filter(section=>section.key==='backgrounds').flatMap(section=>(section.entries || []).map(entry=>({...entry,id:JSON.stringify([section.key,entry.group,entry.name])}))).sort((a,b)=>a.name.localeCompare(b.name));

    function ancestry() {
      const race = selectedRace(), backgrounds = backgroundEntries(), background = backgrounds.find(item=>item.id===draft.build.backgroundId);
      return `<p>Start with your character's identity and ancestry. You can return to any step before saving.</p>${grid(
        field("Character name",textInput("name",draft.name,'text','autocomplete="off"'))+
        field("Player",textInput("player",draft.player,'text','autocomplete="off"'))+
        field("Character level",textInput("level",draft.level,"number",'min="1" max="100" inputmode="numeric"'))+
        field("Ancestry",select("build.raceId",races,draft.build.raceId,"Choose an ancestry"))+
        field("Background",select("build.backgroundId",backgrounds,draft.build.backgroundId,"Choose a background"))+
        (background ? details(`${background.name}: background rules`,background.details) : draft.background ? `<p class="muted">Current background: ${escape(draft.background)}</p>` : '')
      )}${race ? `<div class="list-card"><h3>${escape(race.name)}</h3><p>${escape(race.size)} · ${escape(race.speed ?? "Unspecified")} ft speed</p>${details("About this ancestry",race.description)}${details("Ancestry training",race.proficiencies)}${race.notes ? `<p class="muted">${escape(race.notes)}</p>` : ""}</div>` : ""}`;
    }

    function classStep(derived) {
      const cls=selectedClass();
      let html=`<p>Choose your starting class and how many levels you take in each class. Total character level updates with these choices.</p>${field('Starting class',select('build.classId',classes,draft.build.classId,'Choose a class'))}`;
      if(!cls)return html;
      for(const owner of derived.classProgressions){
        const current=owner.cls,saved=owner.id===cls.id?draft.build.archetypes:draft.build.classArchetypes[owner.id] || [],slots=(current.archetypeLevels || []).filter(level=>level<=owner.level).sort((a,b)=>a-b);
        html+=`<section class="list-card"><h3>${escape(current.name)} · Level ${owner.level}</h3>${field(current.name+' levels',`<input type="number" min="1" max="100" value="${owner.level}" data-builder-class-level="${escape(owner.id)}">`)}<p>Hit die ${escape(current.hitDie || 'unspecified')}${owner.id===cls.id?' · Starting class':''}</p>${details('Class description',current.description)}${owner.training?details(owner.id===cls.id?'Starting proficiencies':'Multiclass proficiencies',{...owner.training.proficiencies,'Skill choices':owner.training.skillChoice?.count || 0,'Saving throws':owner.id===cls.id?(current.saves || []).map(code=>names[code] || code):'Granted by the starting class'}):''}${owner.id!==cls.id?`<button type="button" data-action="builder-remove-class" data-class-id="${escape(owner.id)}">Remove ${escape(current.name)}</button>`:''}`;
        if(owner.id!==cls.id && !owner.training)html+='<p class="muted">This custom class has no specified multiclass starting-training package. Its class features apply; record any table-granted proficiencies on the sheet.</p>';
        if(owner.training?.instrument)html+=field('Musical instrument',`<input type="text" data-builder-class-tool="${escape(owner.id)}" value="${escape(draft.build.classTools[owner.id] || '')}">`);
        if(!slots.length)html+=`<p class="muted">${current.archetypeLevels?.length?'The first '+escape(current.name)+' archetype slot opens at class level '+current.archetypeLevels[0]+'.':'This source has no specified archetype slots.'}</p>`;
        html+=grid(slots.map((level,index)=>{
          const value=saved[index] || '',eligible=archetypes.filter(item=>item.className.toLowerCase()===current.name.toLowerCase() && item.minLevel<=level).sort((a,b)=>order.compare(a,b,'level-asc')),selected=archetypes.find(item=>item.id===value);
          const input=owner.id===cls.id?`data-builder-path="build.archetypes.${index}"`:`data-builder-class-archetype="${escape(owner.id)}" data-builder-choice-index="${index}"`;
          return `<div>${field(current.name+' level '+level+' archetype',`<select ${input}>${option('','Choose an archetype',!value)}${selected && !eligible.includes(selected)?option(value,selected.name+' — review eligibility',true,true):''}${eligible.map(item=>option(item.id,item.name+' · level '+item.minLevel+(item.status?' ('+item.status+')':''),item.id===value,saved.some((id,slot)=>slot!==index && id===item.id))).join('')}</select>`)}${selected?details(selected.name+': source details',selected.description || selected.status || selected.features?.map(feature=>({name:feature.name,details:feature.details}))):''}</div>`;
        }).join(''))+'</section>';
      }
      const available=classes.filter(item=>!derived.classProgressions.some(owner=>owner.id===item.id));
      if(available.length && draft.level<100)html+=field('Add another class',`<select data-builder-add-class>${option('','Choose a class to add',true)}${available.map(item=>option(item.id,item.name,false)).join('')}</select>`,'Adds one level. Adjust each class’s level count to build your intended total.');
      if(derived.classProgressions.length>1)html+=`<details class="builder-granted"><summary>Level order · Total level ${draft.level}</summary><p>The class at each level determines the hit die and when features and feat prerequisites become available.</p>${grid(globalThis.CharacterState.classHistory(draft).map((id,index)=>field('Character level '+(index+1),`<select data-builder-class-history="${index}" ${index===0?'disabled':''}>${derived.classProgressions.map(owner=>option(owner.id,owner.cls.name,id===owner.id)).join('')}</select>`)).join(''))}</details>`;
      return html+castingPreview(derived);
    }

    function abilitiesStep(derived) {
      const race = selectedRace();
      let html = `<p>Enter your base scores before ancestry and feature bonuses. The total preview includes the bonuses selected below.</p>${grid(Object.keys(names).map(code => field(names[code],textInput(`abilities.${code}`,draft.abilities[code],"number",'min="0" max="1000000" inputmode="numeric"'),`Total ${derived.abilities[code]} (${signed(derived.abilityBonuses[code] || 0)} from rules)`)).join(""))}`;
      if (race) {
        const fixed = Object.entries(race.abilityBonuses || {}).map(([code,value]) => `${names[code] || code} ${signed(value)}`);
        if (fixed.length) html += `<p><strong>Fixed ancestry bonuses:</strong> ${escape(fixed.join(", "))}</p>`;
        for (const choice of race.abilityChoices || []) {
          const saved = draft.build.abilityChoices[choice.id] || {mode:0,values:[]};
          const modes = [choice,...choice.alternatives || []], mode = modes[saved.mode] || choice;
          html += `<fieldset><legend>${escape(choice.label)}</legend>`;
          if (modes.length > 1) html += field("Bonus allocation",`<select data-builder-mode="${escape(choice.id)}">${modes.map((item,index) => option(index,item.label,index === saved.mode)).join("")}</select>`);
          html += grid(Array.from({length:mode.count},(_,index) => field(`Bonus ${index + 1} (${signed(mode.amount)})`,`<select data-builder-ability="${escape(choice.id)}" data-builder-choice-index="${index}">${option("","Choose an ability",!saved.values?.[index])}${mode.options.map(code => option(code,names[code] || code,saved.values?.[index] === code,!mode.repeat && saved.values?.some((value,other) => value === code && other !== index))).join("")}</select>`)).join(""))+`</fieldset>`;
        }
      }
      return html;
    }

    function skillChoices(key, count, options,classId='') {
      const values = classId?draft.build.classSkills[classId] || []:draft.build[key] || [];
      return grid(Array.from({length:count},(_,index) => field(`${key === "skills" ? "Class" : "Ancestry"} skill ${index+1}`,`<select data-builder-skills="${key}" data-builder-skill-class="${escape(classId)}" data-builder-choice-index="${index}">${option("","Choose a skill",!values[index])}${options.map(name => option(name,name,name === values[index],values.some((value,other) => name === value && other !== index))).join("")}</select>`)).join(""));
    }

    const optionTag=option;
    const optionRules = item => item.ownDetails ?? (item.eligibility?item.details?.description || item.details:item.details);
    const featGroup = group => group.kind==='feat' || /ability.score.improvement/i.test(group.featureName);
    function sourceControls(source,spec,legend,filter=()=>true,showStatus=true) {
      if(!spec?.fields.length)return '';
      const controls=spec.fields.map(choice=>{
        const slots=spec.slots?.[choice.key] || spec.values[choice.key] || [];
        return Array.from({length:choice.count},(_,index)=>{
          if(!filter(choice,index))return '';
          const label=choice.label+(choice.count>1?' '+(index+1)+' / '+choice.count:'')+(choice.slotLabels?.[index]?' · '+choice.slotLabels[index]:'');
          const input=choice.type==='text'?`<input type="text" data-builder-feat-choice data-feat-id="${escape(source.id)}" data-choice-key="${escape(choice.key)}" data-choice-slot="${index}" value="${escape(draft.build.featChoices[source.id]?.[choice.key]?.[index] || '')}">`:`<select data-builder-feat-choice data-feat-id="${escape(source.id)}" data-choice-key="${escape(choice.key)}" data-choice-slot="${index}" ${choice.locked?'disabled':''}>${optionTag('',choice.optional?'Optional':'Choose…',!slots[index])}${choice.options.map(item=>optionTag(item.id,item.name,slots[index]===item.id,!choice.repeat && slots.some((id,other)=>id===item.id && other!==index))).join('')}</select>`;
          return field(label,input);
        }).join('');
      }).join('');
      if(!controls)return '';
      return `<fieldset class="builder-feat-choices"><legend>${escape(legend)}</legend>${controls}${showStatus?spec.notes.map(note=>`<p class="muted">${escape(note)}</p>`).join(''):''}${showStatus && spec.inactive?.upgrade?.length?'<p class="builder-notice">Saved upgrade choices that are no longer granted stay inactive.</p>':''}${showStatus && spec.missing.length?`<p class="builder-notice">${spec.missing.length} follow-up choice${spec.missing.length===1?'':'s'} remaining.</p>`:''}</fieldset>`;
    }
    function featBenefits(option,task,derived) {
      if(!task.selected.includes(option.id) && !derived.featPlan?.sources.some(source=>source.id===task.featureId))return '';
      const specification=task.kind==='feat' && option.name!=='Mana-refusal'?globalThis.CharacterEffects.benefitOptions(option):null,selected=draft.build.featBenefits[option.id] || [];
      let html=specification?`<fieldset class="builder-feat-benefits"><legend>Feat benefits${specification.count===2?' · choose two':''}</legend>${specification.note?`<p class="muted">${escape(specification.note)}</p>`:''}${specification.options.map(([key,label])=>`<label class="check-label"><input type="checkbox" data-builder-feat-benefit="${key}" data-feat-id="${escape(option.id)}" ${selected.includes(key)?'checked':''} ${!selected.includes(key)&&selected.length>=specification.count?'disabled':''}>${escape(label)}</label>`).join('')}</fieldset>`:'';
      const sources=(derived.featPlan?.sources || []).filter(source=>task.kind==='feat'?source.parent==='Feat' && source.entryId===option.id && source.id.startsWith(task.id+':'):source.groupId===task.id && source.optionId===option.id || source.id===task.featureId);
      for(const feat of sources){const spec=derived.featPlan.specs[feat.id];
        html+=sourceControls(feat,spec,(task.kind==='feat'?'Finish this feat':'Feature choices')+(sources.length>1?' · Pick '+((feat.occurrence || 0)+1):''));
        for(const grant of derived.featPlan.extraLists || [])if(grant.source===feat.id && grant.target.startsWith('feat:')){
          const targetId=grant.target.slice('feat:'.length),target=derived.featPlan.sources.find(source=>source.id===targetId),targetSpec=derived.featPlan.specs[targetId];
          if(target && targetSpec){const upgrade=(targetSpec.slots?.upgrade || [])[grant.slot];html+=sourceControls(target,targetSpec,'Extra upgrade · '+target.name,(choice,index)=>choice.key==='upgrade'?index===grant.slot:!!choice.requiresUpgrade && choice.requiresUpgrade===upgrade,false);}
        }
      }
      return html;
    }
    function tasks(derived, feats=false,upgrades=false) {
      const result=[];
      if(!feats && !upgrades)for(const owner of derived.trainingClasses || [])if(owner.training.skillChoice){const values=owner.id===draft.build.classId?draft.build.skills:draft.build.classSkills[owner.id] || [];result.push({id:owner.id===draft.build.classId?'class-skills':'class-skills:'+owner.id,label:owner.cls.name+' skills',classId:owner.id===draft.build.classId?'':owner.id,count:owner.training.skillChoice.count,selected:[...new Set(values)].filter(skill=>owner.training.skillChoice.options.includes(skill)),skills:'skills',options:owner.training.skillChoice.options});}
      if(!feats && !upgrades && derived.raceSkillCount) result.push({id:'race-skills',label:'Ancestry skills',count:derived.raceSkillCount,selected:[...new Set(draft.build.raceSkills)].filter(skill=>(derived.raceSkillOptions || allSkills).includes(skill)),skills:'raceSkills',options:derived.raceSkillOptions || allSkills});
      for(const group of derived.choices.filter(group=>group.count>0 && !group.automatic && featGroup(group)===feats && !!group.spellEntryId===upgrades)) result.push({...group,label:group.kind==='feat'?`${group.parent}: ${group.label}`:group.featureName+(group.label==='Choose features'?'':` · ${group.label}`)});
      return result;
    }
    function stages(derived) {
      return ['Ancestry','Class','Abilities','Features',...(derived.casting?.profile || derived.featPlan?.spells?.length || derived.spellProgressions?.length?['Spells']:[]),...(derived.choices.some(featGroup)?['Feats']:[]),'Equipment','Review'];
    }
    const choiceLevel=(group,derived)=>group.classId && derived.classProgressions.length>1?`${classes.find(item=>item.id===group.classId)?.name || group.parent} level ${group.classRequiredLevel ?? group.level} · Character level ${group.level}`:`Level ${group.level}`;
    function taskPane(derived,feats=false,upgrades=false) {
      const groups=tasks(derived,feats,upgrades);
      let task=groups.find(group=>group.id===focusedTask) || groups.find(group=>!group.optional && group.selected.length<group.count) || groups[0];
      if(task) focusedTask=task.id;
      const followUps=!upgrades?(derived.featPlan?.sources || []).filter(source=>(source.parent==='Feat')===feats).reduce((sum,source)=>sum+(derived.featPlan.specs[source.id]?.missing.length || 0),0):0;
      const remaining=followUps+groups.reduce((total,group)=>total+(group.optional?0:Math.max(0,group.count-group.selected.length)),0);
      const nav=`<nav class="builder-task-nav" aria-label="${feats?'Feat and ability':'Feature'} choices">${groups.map(group=>`<button type="button" data-action="builder-task" data-task-id="${escape(group.id)}" ${group.id===task?.id?'aria-current="true"':''}><span>${escape(group.label)}</span><small>${group.optional?'Optional':`${group.selected.length} / ${group.count}`}${group.level?` · ${escape(choiceLevel(group,derived))}`:''}</small>${group.kind==='feat'&&group.selected.length?`<small>${group.options.filter(option=>group.selected.includes(option.id)).map(option=>escape(option.name)).join(', ')}</small>`:''}</button>`).join('')}</nav>`;
      let body='<p class="muted">No choices are required here at this level.</p>';
      if(task?.skills) body=`<section class="builder-task-content"><h2>${escape(task.label)}</h2><p>Choose ${task.count} proficiencies.</p>${skillChoices(task.skills,task.count,task.options,task.classId)}</section>`;
      else if(task) {
        const selected=task.selectedSlots || [],available=task.options.filter(item=>{
          const used=task.selected.filter(id=>id===item.id).length;
          return (showLocked || !item.unavailableReason) && used<(item.repeatLimit || 1) && (!featureQuery || (item.name+' '+JSON.stringify(optionRules(item))).toLowerCase().includes(featureQuery.toLowerCase()));
        });
        const preview=task.options.find(item=>item.id===focusedOption) || task.options.find(item=>task.selected.includes(item.id)) || available[0];
        const previewUsed=preview?task.selected.filter(id=>id===preview.id).length:0;
        const canAdd=preview && !preview.unavailableReason && previewUsed<(preview.repeatLimit || 1) && task.selected.length<task.count;
        const chosen=selected.map((id,index)=>({id,index,option:task.options.find(item=>item.id===id)})).filter(row=>row.option);
        const allowance=derived.classProgressions.some(owner=>owner.cls.name===task.parent) && !featGroup(task) && !task.spellEntryId?`<p class="muted">${escape(task.parent)} grants ${task.baseCount} choices for ${escape(task.featureName)} at this level.${task.count>task.baseCount?` You also have ${task.count-task.baseCount} extra choice${task.count-task.baseCount===1?'':'s'} from feats or features.`:''}</p>`:'';
        body=`<section class="builder-task-content"><div class="builder-task-heading"><div><h2>${escape(task.featureName || task.label)}</h2><p>${escape(task.parent)}${task.level?` · ${escape(choiceLevel(task,derived))}`:''} · ${task.selected.length} / ${task.count} chosen</p>${allowance}</div><button type="button" data-action="builder-next-choice">Next unfinished choice</button></div><div class="builder-chosen" aria-label="Selected options">${chosen.map(({option,index})=>`<span class="builder-chip"><button type="button" data-action="builder-preview-option" data-option-id="${escape(option.id)}">${escape(option.name)}</button><button type="button" data-action="builder-remove-choice" data-choice-id="${escape(task.id)}" data-choice-slot="${index}" aria-label="Remove ${escape(option.name)}">×</button></span>`).join('') || '<p class="muted">Choose an option below.</p>'}</div>${task.pairComplete===false?'<p class="builder-notice">Choose both a mark and a reward to activate this pair.</p>':''}${task.unavailableSelected?.length?`<p class="builder-notice">${task.unavailableSelected.map(item=>escape(item.name)).join(', ')} no longer meets its prerequisites. Choose a replacement.</p>`:''}${field(task.kind==='feat'?'Search eligible feats':'Search options',`<input type="search" data-builder-feature-query value="${escape(featureQuery)}" autocomplete="off">`)}${task.options.some(item=>item.requires?.length)?`<label class="check-label"><input type="checkbox" data-builder-locked ${showLocked?'checked':''}>Show locked upgrades</label>`:''}<div class="builder-library"><div class="builder-option-list" aria-label="Available options">${available.slice(0,optionLimit).map(item=>`<button type="button" class="builder-option-card" data-action="builder-preview-option" data-option-id="${escape(item.id)}" ${item.id===preview?.id?'aria-pressed="true"':''}><strong>${escape(item.name)}</strong>${item.unavailableReason?`<small>${escape(item.unavailableReason)}</small>`:''}</button>`).join('') || '<p class="muted">No eligible options match. Adjust your search or review earlier choices.</p>'}${available.length>optionLimit?'<button type="button" data-action="builder-more-options">Show more options</button>':''}</div><aside class="builder-option-preview" aria-label="Option details">${preview?`<h3>${escape(preview.name)}</h3>${preview.eligibility?.requirements?.length?`<p class="muted">Requires: ${escape(preview.eligibility.requirements.join('; '))}</p>`:''}<div class="rule-body">${renderRule(optionRules(preview))}</div>${featBenefits(preview,task,derived)}${preview.unavailableReason?`<p class="builder-notice">${escape(preview.unavailableReason)}</p>`:''}<button type="button" class="primary" data-action="builder-choose-option" data-choice-id="${escape(task.id)}" data-option-id="${escape(preview.id)}" ${canAdd?'':'disabled'}>${previewUsed>=(preview.repeatLimit || 1)?'Already selected':task.selected.length>=task.count?'Remove a selection to replace it':'Choose '+escape(preview.name)}</button>`:'<p>Select an option to read its rules.</p>'}</aside></div></section>`;
      }
      const intro=feats?'<p>Only feats whose prerequisites you meet are offered here. Each grant is checked at its own level. <a href="index.html#section=feats" target="_blank" rel="noopener">Browse every feat in the compendium</a>.</p>':'<p>Work through one choice at a time. Selected options stay in the summary above their list.</p>';
      const qualifications=feats?`<details class="builder-qualification"><summary>Story qualifications</summary><p class="muted">Record these only when they are true for your character.</p>${[['has-died','This character has died'],['righteous-slaying','Has slain a murderous vampire, fae, or sentient aberration or undead'],['rest-crafting','Can create or procure items during rest']].map(([key,label])=>`<label class="check-label"><input type="checkbox" data-builder-qualification="${key}" ${draft.build.qualifications.includes(key)?'checked':''}>${label}</label>`).join('')}</details>`:'';
      return `${intro}<p class="builder-progress-note">${remaining?`${remaining} selection${remaining===1?'':'s'} remaining`:'Required selections complete'}</p><div id="builder-choice-workspace" class="builder-choice-workspace">${nav}${body}</div>${qualifications}`;
    }
    function featuresStep(derived) {
      const given=derived.features.filter(feature=>!['Feat','Cantrip'].includes(feature.parent) && !derived.choices.some(group=>group.featureId===feature.id)).sort((a,b)=>order.compare(a,b,'level-asc'));
      return taskPane(derived)+`<details class="builder-granted"><summary>Automatically granted features (${given.length})</summary>${given.map(feature=>`<details class="builder-rule"><summary>${escape(feature.name)} <small>${escape(feature.parent)} · Level ${feature.requiredLevel ?? feature.level ?? 1}</small></summary>${renderRule(feature.details)}</details>`).join('')}</details>`;
    }
    const featsStep=derived=>taskPane(derived,true);

    function spellResults(derived) {
      const casting=globalThis.CharacterCasting,selection=casting.spellSelection(draft,derived,rules.catalog);
      const words=spellQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const matching=selection.eligible.filter(entry=>{
        const info=casting.spellInfo(entry,derived.casting.profile.tradition);
        return (spellKind==='cantrips'?info.cantrip:!info.cantrip) && (spellLevel==='' || String(info.level)===spellLevel) && words.every(word=>(entry.name+' '+JSON.stringify(entry.details)).toLowerCase().includes(word));
      }).sort((a,b)=>casting.spellInfo(a,derived.casting.profile.tradition).level-casting.spellInfo(b,derived.casting.profile.tradition).level || a.name.localeCompare(b.name));
      const picked=matching.find(entry=>casting.spellId(entry)===spellToAdd) || matching.find(entry=>!draft.spells.some(row=>row.entryId===casting.spellId(entry))) || matching[0];
      const pickedId=picked?casting.spellId(picked):'',already=draft.spells.some(row=>row.entryId===pickedId && row.classId===derived.casting.classId);
      const reason=picked&&!already?casting.spellLearningError(draft,derived,rules.catalog,picked):'';
      return `<p class="muted">${matching.length} eligible ${spellKind==='cantrips'?'cantrips':'spells'} match</p><div class="builder-library"><div class="builder-option-list" aria-label="Eligible spells">${matching.slice(0,spellLimit).map(entry=>{const id=casting.spellId(entry),info=casting.spellInfo(entry,derived.casting.profile.tradition);return `<button type="button" class="builder-option-card" data-action="builder-preview-spell" data-entry-id="${escape(id)}" ${id===pickedId?'aria-pressed="true"':''}><strong>${escape(entry.name)}</strong><small>${info.cantrip?'Cantrip':'Level '+info.level}${entry.details.casting?' · '+escape(entry.details.casting):''}${entry.details.range?' · '+escape(entry.details.range):''}</small>${draft.spells.some(row=>row.entryId===id && row.classId===derived.casting.classId)?'<span class="builder-picked-badge">Chosen</span>':''}</button>`;}).join('') || '<p class="muted">No spells match these filters. Review the level filter or your class settings.</p>'}${matching.length>spellLimit?'<button type="button" data-action="builder-more-spells">Show more spells</button>':''}</div><aside class="builder-option-preview" aria-label="Spell details">${picked?`<h3>${escape(picked.name)}</h3><div class="rule-body">${renderRule(picked.details)}</div><button type="button" class="primary" data-action="builder-learn-spell" data-entry-id="${escape(pickedId)}" ${already||reason?'disabled':''}>${already?'Already chosen':'Learn '+escape(picked.name)}</button>${reason?`<p class="builder-notice">${escape(reason)}</p>`:''}`:'<p>Choose a spell to read its rules before learning it.</p>'}</aside></div>`;
    }
    function spellsStep(derived) {
      const upgradeGroups=derived.choices.filter(group=>group.spellEntryId),remaining=upgradeGroups.reduce((sum,group)=>sum+Math.max(0,group.count-group.selected.length),0);
      const upgradeNav=`<div class="builder-spell-tabs" role="group" aria-label="Spell workspaces"><button type="button" data-action="builder-spell-workspace" data-spell-workspace="library" aria-pressed="${spellWorkspace==='library'}">Learn spells</button><button type="button" data-action="builder-spell-workspace" data-spell-workspace="upgrades" aria-pressed="${spellWorkspace==='upgrades'}">Cantrip &amp; hex upgrades${remaining?' · '+remaining+' remaining':''}</button></div>`;
      if(spellWorkspace==='upgrades')return `<section class="builder-spells"><h2>Cantrip &amp; hex upgrades</h2>${upgradeNav}<p>Upgrade choices unlock at the levels printed on each cantrip. Extra feat upgrades are chosen with that feat.</p>${taskPane(derived,false,true)}<details class="builder-granted"><summary>Automatic improvements at level ${draft.level}</summary>${(derived.spellProgressions || []).filter(profile=>profile.active.length).map(profile=>`<h3>${escape(profile.name)}</h3>${profile.active.map(rule=>`<p>${escape(rule.text)}${rule.activeLevels.length>1?' (applies at levels '+rule.activeLevels.join(', ')+')':''}</p>`).join('')}`).join('') || '<p>No automatic cantrip improvements apply yet.</p>'}</details></section>`;
      if(!derived.casting?.profile)return `<section class="builder-spells"><h2>Granted spells</h2>${upgradeNav}<p>Spell grants are chosen with their granting feat or feature.</p>${(derived.featPlan?.spells || []).map(row=>`<p>${escape(row.name)}</p>`).join('')}</section>`;

      const casting=globalThis.CharacterCasting,selection=casting.spellSelection(draft,derived,rules.catalog);
      let configuration='';
      if(derived.casting.mode==='full')configuration=field('Maximum full-slot level',textInput('build.casting.maxSlotLevel',draft.build.casting?.maxSlotLevel ?? '','number','min="1" max="20"'),'Use the maximum spell level agreed at your table.');
      if(derived.casting.profile.tradition==='any' && !derived.casting.profile.maxLearnLevelRule)configuration=field('Maximum spell level you can learn',textInput('build.casting.maxLearnLevel',draft.build.casting?.maxLearnLevel ?? '','number','min="0" max="20"'),'The source limits learning to half Bard level without specifying rounding.');
      const levels=[...new Set(selection.eligible.filter(entry=>!casting.spellInfo(entry,derived.casting.profile.tradition).cantrip).map(entry=>casting.spellInfo(entry,derived.casting.profile.tradition).level))].sort((a,b)=>a-b);
      return `<section class="builder-spells"><h2>Choose your spells</h2>${derived.castings.length>1?field('Spellcasting class',`<select data-builder-casting-class>${derived.castings.map(item=>option(item.classId,item.className+' '+item.classLevel,item.classId===derived.casting.classId)).join('')}</select>`):''}${upgradeNav}<p>${escape(derived.casting.className)} · ${escape(derived.casting.profile.tradition==='any'?'Any tradition, including hexes as level 1–3 spells':derived.casting.profile.tradition+' magic')}</p>${derived.casting.maxLearnLevel!==null?`<p class="muted">Learn spells up to level ${derived.casting.maxLearnLevel}. Cast or upcast known spells up to level ${derived.casting.maxCastLevel}.</p>`:''}<div class="builder-spell-tabs" role="group" aria-label="Spell selections">${selection.cantripLimit?`<button type="button" data-action="builder-spell-kind" data-spell-kind="cantrips" aria-pressed="${spellKind==='cantrips'}">Cantrips <strong>${selection.cantrips.length} / ${selection.cantripLimit}</strong></button>`:''}<button type="button" data-action="builder-spell-kind" data-spell-kind="spells" aria-pressed="${spellKind==='spells'}">${derived.casting.spellbookCount!==null?'Spellbook':'Spells'} <strong>${selection.spells.length} / ${selection.spellLimit}</strong></button></div>${configuration?`<details class="builder-table-settings" ${selection.eligible.filter(entry=>!casting.spellInfo(entry,derived.casting.profile.tradition).cantrip).length?'':'open'}><summary>Table casting settings</summary>${configuration}</details>`:''}<div class="builder-chosen" aria-label="Chosen spells">${selection.chosen.map(row=>`<span class="builder-chip"><button type="button" data-action="builder-preview-spell" data-entry-id="${escape(row.entryId)}">${escape(row.name)}</button><button type="button" data-action="builder-remove-spell" data-spell-id="${escape(row.id)}" aria-label="Remove ${escape(row.name)}">×</button></span>`).join('') || '<p class="muted">Your chosen spells will appear here.</p>'}</div><div class="builder-search-row">${field('Search spells',`<input type="search" data-builder-spell-query value="${escape(spellQuery)}" autocomplete="off">`)}${field('Spell level',`<select data-builder-spell-level>${selection.cantripLimit?option('0','Cantrips',spellKind==='cantrips'):''}${option('','All eligible spell levels',spellKind==='spells'&&spellLevel==='')}${levels.map(level=>option(level,'Level '+level,spellKind==='spells'&&String(level)===spellLevel)).join('')}</select>`)}</div><div id="builder-spell-results">${spellResults(derived)}</div>${selection.chosen.length?`<details class="builder-readied"><summary>${derived.casting.className==='Wizard'?'Preparation':'Ready spells'} (${selection.chosen.filter(row=>row.prepared).length})</summary>${selection.chosen.map(row=>`<label class="check-label"><input type="checkbox" data-builder-spell-ready="${escape(row.id)}" ${row.prepared?'checked':''}>${escape(row.name)}</label>`).join('')}</details>`:''}${selection.warnings.map(warning=>`<p class="muted">${escape(warning)}</p>`).join('')}</section>`;
    }
    function refreshSpellPicker() {
      const host=globalThis.document?.getElementById('builder-spell-results');
      if(host)host.innerHTML=spellResults(rules.derive(draft));else render();
    }

    function equipmentCategory(item) {
      const shelf = category => category === "weapons" ? "weapons" : category === "armor-shields" ? "armor" : ["consumables", "scrolls"].includes(category) ? "consumables" : "gear";
      if (item.section === "magic-items" && globalThis.MagicCategories) return shelf(globalThis.MagicCategories.category(item));
      if (item.section === "items" && globalThis.ItemViews) return shelf(globalThis.ItemViews.category(item));
      const category = globalThis.MagicCategories?.category(item);
      const type = String(item.details?.type || "").toLowerCase();
      const group = String(item.group || "").toLowerCase();
      if (category === "weapons" || item.details?.damage || /weapon|ammunition/.test(type)) return "weapons";
      if (category === "armor-shields" || item.details?.["AC bonus"] || /armor|armour|shield/.test(type + " " + group)) return "armor";
      if (["consumables","scrolls"].includes(category) || /potion|scroll|consumable|food|drink/.test(type + " " + group)) return "consumables";
      return "gear";
    }

    function matchingEquipment() {
      const words = itemQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
      return items.filter(item => (!itemCategory || equipmentCategory(item) === itemCategory) && words.every(word => `${item.name} ${item.group} ${item.details?.type || ""}`.toLowerCase().includes(word)));
    }

    function equipmentCount() {
      const count = matchingEquipment().length;
      return `${count} matching ${count === 1 ? "item" : "items"}`;
    }

    function equipmentComparison(entry) {
      const profile=globalThis.MagicItems?.equipment(entry,rules.catalog) || entry;
      if(profile.details?.["Base AC"]===undefined && profile.details?.["AC bonus"]===undefined)return '';
      let candidate=copy(draft);
      candidate.inventory.push({id:'equipment-preview',name:entry.name,entryId:entry.entryId,quantity:1,equipped:false,notes:'',...(globalThis.MagicItems?.inventoryFields(entry) || {})});
      candidate=globalThis.CharacterEquipment.equip(candidate,candidate.inventory.length-1,true,rules.catalog);
      const current=rules.derive(draft),proposed=rules.derive(candidate),summary=globalThis.CharacterEquipment.defenseSummary(proposed);
      return `<section class="equipment-comparison" aria-label="Defence if equipped"><p><strong>If equipped: AC ${proposed.armorClass}</strong> (current ${current.armorClass}) · Speed ${proposed.speed} ft · Maximum Block ${proposed.blockMaximum}</p><p>${escape(summary.calculation)}</p>${summary.penalty?`<p class="armor-penalty">${escape(summary.penalty)}</p>`:''}${globalThis.MagicItems?.requiresAttunement(entry)?'<p>Preview uses the mundane base until you attune this item in Your equipment.</p>':''}</section>`;
    }
    function equipmentPreview() {
      const selected=items.find(item=>item.entryId===itemToAdd);
      if(!selected)return '<p>Select equipment to read its rules.</p>';
      const profile=globalThis.MagicItems?.equipment(selected,rules.catalog) || selected;
      const summary=[selected.group,profile.details?.damage,profile.details?.["Base AC"]!==undefined?`Base AC ${profile.details["Base AC"]}`:'',profile.details?.["AC bonus"]?`AC ${profile.details["AC bonus"]}`:''].filter(Boolean);
      const wearable=profile.details?.["Base AC"]!==undefined || profile.details?.["AC bonus"]!==undefined || !!profile.details?.damage;
      return `<h3>${escape(selected.name)}</h3><p class="muted">${escape(summary.join(' · '))}</p>${equipmentComparison(selected)}<div class="rule-body">${renderRule(selected.details)}</div><div class="entry-actions"><button type="button" id="builder-add-equipment" data-action="builder-add-item">Add to pack</button>${wearable?'<button type="button" class="primary" data-action="builder-add-equip">Add and equip</button>':''}</div>${lastAdded?`<p class="builder-added" role="status">${escape(lastAdded)}</p>`:''}`;
    }
    function equipmentResults() {
      const matching=matchingEquipment();
      if(!matching.some(item=>item.entryId===itemToAdd))itemToAdd=matching[0]?.entryId || '';
      return `<p class="muted" id="builder-equipment-count">${equipmentCount()}</p><div class="builder-library"><div class="builder-option-list" id="builder-equipment-options" aria-label="Catalog equipment">${matching.slice(0,itemLimit).map(item=>`<button type="button" class="builder-option-card" data-action="builder-preview-item" data-entry-id="${escape(item.entryId)}" aria-pressed="${item.entryId===itemToAdd}"><strong>${escape(item.name)}</strong><small>${escape(item.group)}</small></button>`).join('') || '<p class="muted">No matching equipment. Try another search or category.</p>'}${matching.length>itemLimit?'<button type="button" data-action="builder-more-items">Show more equipment</button>':''}</div><aside class="builder-option-preview" id="builder-equipment-preview" aria-label="Equipment details">${equipmentPreview()}</aside></div>`;
    }
    function refreshEquipmentPicker() {
      const host=globalThis.document?.getElementById('builder-equipment-results');
      if(host)host.innerHTML=equipmentResults();else render();
    }
    function ownedEquipment() {
      const matching=draft.inventory.map((row,index)=>({row,index})).filter(({row})=>row.name.toLowerCase().includes(ownedQuery.toLowerCase()));
      const picked=matching.find(({row})=>row.id===focusedItem) || matching[0];
      if(picked)focusedItem=picked.row.id;
      let preview='<p>Choose equipment from the catalog to start your pack.</p>';
      if(picked) {
        const {row,index}=picked,entry=items.find(item=>item.entryId===row.entryId),profile=entry && (globalThis.MagicItems?.equipment(entry,rules.catalog) || entry),weapon=profile?.details?.damage || profile?.details?.["AC bonus"];
        preview=`<h3>${escape(row.name)}</h3>${grid(
          field('Equipped',`<input type="checkbox" data-builder-gear="equipped" data-builder-index="${index}"${row.equipped?' checked':''}>`)+
          (globalThis.MagicItems?.requiresAttunement(entry)?field('Attuned',`<input type="checkbox" data-builder-gear="attuned" data-builder-index="${index}"${row.attuned?' checked':''}>`):'')+
          field('Quantity',`<input type="number" min="0" value="${escape(row.quantity)}" data-builder-gear="quantity" data-builder-index="${index}">`)+
          field('Magic bonus',`<input type="number" min="-100" max="100" value="${escape(row.magicBonus || 0)}" data-builder-gear="magicBonus" data-builder-index="${index}">`)+
          (weapon?field('Weapon or shield training',`<select data-builder-gear="weaponTraining" data-builder-index="${index}">${option('','Use class and chosen groups',!row.weaponTraining)}${option('proficient','Proficient',row.weaponTraining==='proficient')}${option('untrained','Untrained',row.weaponTraining==='untrained')}</select>`)+field('Two-handed grip',`<input type="checkbox" data-builder-gear="twoHanded" data-builder-index="${index}"${row.twoHanded?' checked':''}>`)+field('Off-hand weapon',`<input type="checkbox" data-builder-gear="offHand" data-builder-index="${index}"${row.offHand?' checked':''}>`):'')
        )}<div class="rule-body">${entry?renderRule(entry.details):'<p class="muted">Custom equipment; review its effects on the sheet.</p>'}</div><button type="button" data-action="builder-remove-item" data-builder-index="${index}">Remove equipment</button>`;
      }
      return `<div class="builder-library"><div class="builder-option-list" aria-label="Your equipment">${matching.map(({row,index})=>`<button type="button" class="builder-option-card" data-action="builder-edit-item" data-item-id="${escape(row.id)}" aria-pressed="${row.id===focusedItem}"><strong>${escape(row.name)}${row.quantity!==1?' × '+row.quantity:''}</strong><small>${row.equipped?'Equipped':'In pack'}${row.attuned?' · Attuned':''}</small></button>`).join('') || '<p class="muted">No equipment matches.</p>'}</div><aside class="builder-option-preview" aria-label="Owned equipment settings">${preview}</aside></div>`;
    }
    function equipmentDefenses(derived) {
      const summary=globalThis.CharacterEquipment.defenseSummary(derived);
      return `<section class="equipment-defence" aria-label="Current equipped defence" aria-live="polite"><div class="equipment-defence-values">${[["Armor Class",derived.armorClass],["Speed",derived.speed+" ft"],["Maximum Block",derived.blockMaximum],["Block check",signed(derived.blockCheck)]].map(([label,value])=>`<div><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`).join('')}</div><p>${escape(summary.equipment)}</p>${summary.calculation?`<p class="armor-calculation">${escape(summary.calculation)}</p>`:''}${summary.penalty?`<p class="armor-penalty">${escape(summary.penalty)}</p>`:''}<details class="defence-breakdown"><summary>AC calculation & armor properties</summary><dl>${summary.ac.map(part=>`<div><dt>${escape(part.label)}</dt><dd>${signed(part.amount)}</dd></div>`).join('')}<div class="defence-total"><dt>Total AC</dt><dd>${derived.armorClass}</dd></div></dl>${summary.notes.map(note=>`<p>${escape(note)}</p>`).join('')}</details>${summary.warnings.map(note=>`<p class="source-warning">${escape(note)}</p>`).join('')}</section>`;
    }
    function equipmentStep(derived) {
      let html=`<section class="builder-equipment-picker"><h2>Equipment</h2>${equipmentDefenses(derived)}<div class="builder-spell-tabs" role="group" aria-label="Equipment views"><button type="button" data-action="builder-equipment-view" data-equipment-view="catalog" aria-pressed="${equipmentView==='catalog'}">Catalog</button><button type="button" data-action="builder-equipment-view" data-equipment-view="inventory" aria-pressed="${equipmentView==='inventory'}">Your equipment <strong>${draft.inventory.length}</strong></button></div>`;
      if(equipmentView==='catalog')html+=`${grid(field('Find equipment',`<input type="search" data-builder-item-query value="${escape(itemQuery)}" placeholder="Name or equipment type" autocomplete="off">`)+field('Category',`<select data-builder-item-category>${[['','All equipment'],['weapons','Weapons & ammunition'],['armor','Armor & shields'],['consumables','Consumables'],['gear','Other gear']].map(([value,label])=>option(value,label,itemCategory===value)).join('')}</select>`))}<div id="builder-equipment-results">${equipmentResults()}</div>`;
      else html+=`${field('Search your equipment',`<input type="search" data-builder-owned-query value="${escape(ownedQuery)}" autocomplete="off">`)}<div id="builder-owned-results">${ownedEquipment()}</div>`;
      html+='</section>';
      if (weaponGroups.length) html += `<details><summary>Chosen weapon group proficiencies</summary><p class="muted">Select only the groups your class, ancestry or features grant. Fixed proficiencies already apply.</p>${grid(weaponGroups.map(group => `<label class="row"><input type="checkbox" data-builder-group="${escape(group)}"${draft.build.weaponGroups.includes(group) ? " checked" : ""}>${escape(group)}</label>`).join(""))}</details>`;
      return html;
    }

    function castingPreview(derived) {
      const casting = derived.casting;
      if (!casting?.profile) return "";
      const rows=casting.pools.map(pool=>`<li>${escape(pool.label)}: ${pool.max??'set maximum level on the Spells tab'}${pool.kind==='occult'?' at spell level '+pool.level:pool.kind==='full'&&pool.max!==null?' spell levels':''}</li>`).join('');
      return `<section class="list-card class-casting-preview"><h3>Class casting capacity</h3>${casting.maxCastLevel!==null?`<p>Maximum spell level ${casting.maxCastLevel}</p>`:''}<ul>${rows}</ul>${casting.needsMigration?'<p class="muted">Your manual trackers are preserved. Activate class slots on the Spells tab to use automatic tracking.</p>':''}</section>`;
    }

    function review(derived) {
      const health = draft.build.health, sides = Number(derived.cls?.hitDie?.match(/d(\d+)/i)?.[1]) || 1000;
      let html = `<p>Review ${escape(draft.name || "your character")} before saving. Unfinished selections can be saved and completed later.</p><div class="builder-preview">${grid([
        ["Maximum HP",derived.hpMaximum],["Armor Class",derived.armorClass],["Speed",`${derived.speed} ft`],["Maximum Block",derived.blockMaximum],["Block check",signed(derived.blockCheck)],["Proficiency",signed(derived.proficiency)]
      ].map(([label,value]) => `<div class="list-card"><span class="muted">${escape(label)}</span><p><strong>${escape(value)}</strong></p></div>`).join(""))}</div><p>${escape(derived.hpExplanation)}</p>`;
      html += grid(field("HP after level 1",`<select data-builder-path="build.health.hpMode">${option("average","Fixed average",health.hpMode === "average")}${option("rolled","Recorded hit-die rolls",health.hpMode === "rolled")}${option("manual","Manual base HP",health.hpMode === "manual")}</select>`)+
        (health.hpMode === "manual" ? field("Base maximum HP",textInput("build.health.baseHP",health.baseHP,"number",'min="1"'),"Ancestry and feature HP bonuses are added to this base.") : "")+
        field("Rest dice maximum",`<output>${derived.restMaximum}</output>`,"Character level plus the selected bonuses.")+field("Rest dice table adjustment",textInput("build.health.restAdjustment",health.restAdjustment,"number",'min="-1000000" max="1000000"')));
      if (health.hpMode === "rolled" && draft.level > 1) html += `<fieldset><legend>Recorded ${escape(derived.classProgressions.length>1?"class hit-die":derived.cls?.hitDie || "hit die")} rolls</legend><p class="muted">Enter the die result before Constitution. Missing rolls use the fixed average in this preview.</p>${grid(Array.from({length:draft.level-1},(_,index) => field(`Level ${index+2}${derived.classProgressions.length>1?" · "+(classes.find(cls=>cls.id===globalThis.CharacterState.classHistory(draft)[index+1])?.name || "")+" "+(classes.find(cls=>cls.id===globalThis.CharacterState.classHistory(draft)[index+1])?.hitDie || ""):""}`,textInput(`build.health.rolls.${index}`,health.rolls?.[index] ?? "","number",`min="1" max="${Number(classes.find(cls=>cls.id===globalThis.CharacterState.classHistory(draft)[index+1])?.hitDie?.match(/d(\d+)/i)?.[1]) || sides}" inputmode="numeric"`))).join(""))}</fieldset>`;
      html += `<p>Rest dice: ${(derived.restPools || []).map(pool=>escape(pool.label)+' '+pool.max+escape(pool.die)).join(' · ')}</p>`;
      html += castingPreview(derived);
      if(derived.progressionNotes?.length)html+=`<details class="builder-granted"><summary>Level-dependent feature rules (${derived.progressionNotes.length})</summary>${derived.progressionNotes.map(note=>`<h3>${escape(note.name)}</h3><p>${escape(note.text)}</p>`).join('')}</details>`;
      const feats = derived.features.filter(feature=>feature.parent==='Feat');
      if(feats.length) html += `<h3>Chosen feats</h3>${feats.map(feat=>details(feat.name,feat.details)).join('')}`;
      const spellSelection=derived.casting?.profile && globalThis.CharacterCasting.spellSelection?.(draft,derived,rules.catalog);
      if(spellSelection) html+=`<h3>Chosen spells</h3><p>${spellSelection.chosen.map(row=>escape(row.name)+(row.prepared?'':' (not prepared)')).join(', ') || 'No class spells chosen.'}</p>`;
      html += `<h3>Equipped attacks</h3>${derived.attacks.length ? derived.attacks.map(attack => `<div class="list-card"><strong>${escape(attack.name)}</strong><p>${escape(signed(attack.bonus))} to hit · ${escape(attack.damage)} · Block DC ${escape(attack.blockDC)}</p>${attack.notes ? `<p class="muted">${escape(attack.notes)}</p>` : ""}</div>`).join("") : '<p class="muted">No equipped weapon attacks yet.</p>'}`;
      const raceSkills = new Set((draft.build.raceSkills || []).filter(skill => (derived.raceSkillOptions || allSkills).includes(skill)));
      const warnings = [...new Set([!derived.race ? "Choose an ancestry." : "",!derived.cls ? "Choose a class." : "",
        raceSkills.size < derived.raceSkillCount ? `${derived.race.name}: choose ${derived.raceSkillCount} ancestry skill${derived.raceSkillCount === 1 ? "" : "s"}.` : "",...derived.warnings,...spellSelection?.warnings || []].filter(Boolean))];
      html += `<section class="list-card builder-review-warnings"><h3>${warnings.length ? "Selections to review" : "Before saving"}</h3>${warnings.length ? `<ul>${warnings.map(warning => `<li>${escape(warning)}</li>`).join("")}</ul>` : '<p>No incomplete selections were detected for the currently supported choices.</p>'}<p class="muted">Conditional abilities, active powers, prerequisites and spell costs still follow their rule descriptions. Apply effects that require a manual ruling on the sheet.</p></section>`;
      return html;
    }

    function render() {
      if(!open)return;
      const derived=rules.derive(draft),flow=stages(derived);
      if(!flow.includes(stage))stage='Features';
      const step=flow.indexOf(stage),views={Ancestry:ancestry,Class:classStep,Abilities:abilitiesStep,Features:featuresStep,Spells:spellsStep,Feats:featsStep,Equipment:equipmentStep,Review:review};
      const nav=`<nav class="builder-steps row" aria-label="Character creation steps">${flow.map((name,index)=>`<button type="button" data-action="builder-step" data-builder-step="${name}"${name===stage?' aria-current="step"':''}>${index+1}. ${name}</button>`).join('')}</nav>`;
      show(`${step+1} of ${flow.length} · ${stage}`,`<div class="builder-flow">${nav}<progress value="${step+1}" max="${flow.length}" aria-label="Character creation progress">${step+1} of ${flow.length}</progress>${views[stage](derived)}</div>`,
        `<button type="button" data-action="builder-cancel">Cancel</button><button type="button" data-action="builder-back"${step===0?' disabled':''}>Back</button>${step<flow.length-1?'<button type="button" class="primary" data-action="builder-next">Next</button>':'<button type="button" class="primary" data-action="builder-finish">Save character</button>'}`);
    }

    function setPath(path, target) {
      const numeric = /^(?:level|abilities\.(?:str|dex|con|int|wis|cha)|build\.casting\.(?:maxSlotLevel|maxLearnLevel)|build\.health\.(?:baseHP|baseRestDice|restAdjustment|rolls\.\d+))$/;
      if (!/^(?:name|player|level|abilities\.(?:str|dex|con|int|wis|cha)|build\.(?:raceId|classId|backgroundId|archetypes\.\d+|casting\.(?:maxSlotLevel|maxLearnLevel)|health\.(?:hpMode|restMode|baseHP|baseRestDice|restAdjustment|rolls\.\d+)))$/.test(path)) return false;
      let value = numeric.test(path) ? Number(target.value) : String(target.value ?? "");
      if(path==='build.backgroundId') {
        const background=backgroundEntries().find(item=>item.id===value);
        if(value && !background)return true;
        draft.background=background?.name || '';
      }
      if (numeric.test(path) && (!Number.isInteger(value) || value < (path.endsWith("restAdjustment") ? -1000000 : path === "level" ? 1 : 0))) return true;
      if (/health\.rolls\./.test(path) && target.value === "") value = null;
      if (path === "level") value = Math.min(100,value);
      if(/^build\.casting\./.test(path) && (value>20 || value<(path.endsWith('maxSlotLevel')?1:0))) return true;
      const parts = path.split("."); let parent = draft;
      for (let index=0;index<parts.length-1;index++) {
        const key = parts[index];
        if (parent[key] === undefined) parent[key] = /^\d+$/.test(parts[index+1]) ? [] : {};
        parent = parent[key];
      }
      if(path==='build.classId' && draft.build.classId!==value){
        const old=draft.build.classId;if(globalThis.CharacterState.classLevels(draft).some(owner=>owner.id===value))return true;
        if(old){draft.build.classArchetypes[old]=draft.build.archetypes;draft.build.classSkills[old]=draft.build.skills;}
        draft.build.classOrder=draft.build.classOrder.map(id=>id===old?value:id);draft.build.archetypes=draft.build.classArchetypes[value] || [];draft.build.skills=draft.build.classSkills[value] || [];
      }
      if (Array.isArray(parent)) setSlot(parent,Number(parts.at(-1)),value,/health\.rolls\./.test(path) ? null : "");
      else parent[parts.at(-1)] = value;
      if (path === "build.classId") draft.className = selectedClass()?.name || "";
      if (path === "build.raceId") draft.ancestry = selectedRace()?.name || "";
      return true;
    }

    function update(target) {
      if (!open || !target?.dataset) return false;
      const data = target.dataset, index = Number(data.builderChoiceIndex);
      if (data.builderPath !== undefined) return setPath(data.builderPath,target);
      if(data.builderClassTool!==undefined){if(rules.derive(draft).classProgressions.some(owner=>owner.id===data.builderClassTool && owner.training?.instrument))draft.build.classTools[data.builderClassTool]=String(target.value || '');return true;}
      if(data.builderAddClass!==undefined){
        if(classes.some(item=>item.id===target.value) && !globalThis.CharacterState.classLevels(draft).some(owner=>owner.id===target.value) && draft.level<100){draft.build.classOrder=[...globalThis.CharacterState.classHistory(draft),target.value];draft.level=draft.build.classOrder.length;}
        return true;
      }
      if(data.builderClassLevel!==undefined){
        const id=data.builderClassLevel,level=Number(target.value),history=globalThis.CharacterState.classHistory(draft),count=history.filter(value=>value===id).length;
        if(!count || !Number.isInteger(level) || level<1 || history.length+level-count>100)return true;
        let remove=count-level;for(let index=history.length-1;index>0 && remove>0;index--)if(history[index]===id){history.splice(index,1);remove--;}
        while(history.filter(value=>value===id).length<level)history.push(id);
        draft.build.classOrder=history;draft.level=history.length;return true;
      }
      if(data.builderClassHistory!==undefined){const slot=Number(data.builderClassHistory),history=globalThis.CharacterState.classHistory(draft);if(slot>0 && slot<history.length && globalThis.CharacterState.classLevels(draft).some(owner=>owner.id===target.value)){history[slot]=target.value;draft.build.classOrder=history;}return true;}
      if(data.builderClassArchetype!==undefined){const owner=rules.derive(draft).classProgressions.find(owner=>owner.id===data.builderClassArchetype),slots=owner?.cls.archetypeLevels?.filter(level=>level<=owner.level) || [];if(owner && index>=0 && index<slots.length && (!target.value || archetypes.some(item=>item.id===target.value && item.className===owner.cls.name && item.minLevel<=slots[index])))setSlot(draft.build.classArchetypes[owner.id] ||= [],index,target.value);return true;}
      if(data.builderCastingClass!==undefined){if(rules.derive(draft).castings.some(item=>item.classId===target.value)){(draft.build.casting ||= {}).classId=target.value;spellToAdd='';spellLevel='';spellQuery='';spellKind='spells';}return true;}
      if(data.builderFeatureQuery!==undefined) {featureQuery=String(target.value || '');optionLimit=36;return true;}
      if(data.builderLocked!==undefined) {showLocked=!!target.checked;return true;}
      if(data.builderQualification!==undefined) {const key=data.builderQualification;if(['has-died','righteous-slaying','rest-crafting'].includes(key))draft.build.qualifications=[...draft.build.qualifications.filter(value=>value!==key),...(target.checked?[key]:[])];return true;}
      if(data.builderFeatChoice!==undefined){const d=rules.derive(draft),spec=d.featPlan?.specs[data.featId],choice=spec?.fields.find(field=>field.key===data.choiceKey),slot=Number(data.choiceSlot);if(choice && !choice.locked && Number.isInteger(slot) && slot>=0 && slot<choice.count && (choice.type==='text' || !target.value || choice.options.some(item=>item.id===target.value))){globalThis.CharacterFeats?.recordUpgradeSources?.(draft,d);const decisions=draft.build.featChoices[data.featId] ||= {},storage=choice.storageSlots?.[slot] ?? slot;setSlot(decisions[data.choiceKey] ||= [],storage,String(target.value || ''));if(choice.slotSources)setSlot(decisions['upgrade-sources'] ||= [],storage,choice.slotSources[slot]);}return true;}
      if(data.builderFeatBenefit!==undefined) {
        const feature=rules.derive(draft).features.find(feature=>feature.parent==='Feat' && feature.entryId===data.featId),specification=feature && globalThis.CharacterEffects.benefitOptions(feature);
        if(specification?.options.some(([key])=>key===data.builderFeatBenefit)) {
          const previous=draft.build.featBenefits[data.featId] || [],values=previous.filter(value=>value!==data.builderFeatBenefit);
          if(!target.checked || values.length<specification.count)draft.build.featBenefits[data.featId]=[...values,...(target.checked?[data.builderFeatBenefit]:[])];
        }return true;
      }
      if(data.builderSpellQuery!==undefined) {spellQuery=String(target.value || '');return true;}
      if(data.builderSpellLevel!==undefined) {spellKind=target.value==='0'?'cantrips':'spells';spellLevel=spellKind==='cantrips'?'':String(target.value || '');spellToAdd='';spellLimit=48;return true;}
      if(data.builderSpell!==undefined) {spellToAdd=String(target.value || '');return true;}
      if(data.builderSpellReady!==undefined) {const row=draft.spells.find(row=>row.id===data.builderSpellReady);if(row)row.prepared=!!target.checked;return true;}
      if (data.builderItemQuery !== undefined) { itemQuery=String(target.value || '');itemLimit=48;return true; }
      if(data.builderOwnedQuery!==undefined){ownedQuery=String(target.value || '');return true;}
      if (data.builderItemCategory !== undefined) { itemCategory = ["","weapons","armor","consumables","gear"].includes(target.value) ? target.value : "";itemLimit=48;return true; }
      if (data.builderItem !== undefined) { itemToAdd = items.some(item => item.entryId === target.value) ? target.value : ""; return true; }
      if (data.builderMode !== undefined || data.builderAbility !== undefined) {
        const id = data.builderMode ?? data.builderAbility, choice = selectedRace()?.abilityChoices?.find(item => item.id === id);
        if (!choice) return true;
        const saved = draft.build.abilityChoices[id] ||= {mode:0,values:[]};
        if (data.builderMode !== undefined) {
          const mode = Number(target.value);
          if (Number.isInteger(mode) && mode >= 0 && mode < [choice,...choice.alternatives || []].length) { saved.mode = mode; saved.values = []; }
        } else if (Number.isInteger(index) && index >= 0) {
          const mode = [choice,...choice.alternatives || []][saved.mode] || choice;
          if (index < mode.count && (!target.value || mode.options.includes(target.value))) setSlot(saved.values,index,target.value);
        }
        return true;
      }
      if (data.builderChoice !== undefined) {
        const choice = rules.derive(draft).choices.find(item => item.id === data.builderChoice);
        if (choice && Number.isInteger(index) && index >= 0 && index < choice.count && (!target.value || choice.options.some(item => item.id === target.value))) {
          const candidate=copy(draft),values=candidate.build.choices[choice.id] ||= [];
          setSlot(values,index,target.value);
          const checked=rules.derive(candidate).choices.find(item=>item.id===choice.id);
          if(!target.value || checked?.selectedSlots[index]===target.value) {
            draft=candidate;
            if(target.value===choice.featureId+':feat'){focusedTask=choice.featureId+':feat-choice';focusedOption='';featureQuery='';}
          }
        }
        return true;
      }
      if (data.builderSkills !== undefined) {
        if (["skills","raceSkills"].includes(data.builderSkills) && Number.isInteger(index) && index >= 0 && index < 100) setSlot(data.builderSkillClass?(draft.build.classSkills[data.builderSkillClass] ||= []):draft.build[data.builderSkills],index,target.value);
        return true;
      }
      if (data.builderGroup !== undefined) {
        if (weaponGroups.includes(data.builderGroup)) draft.build.weaponGroups = [...new Set([...draft.build.weaponGroups.filter(group => group !== data.builderGroup),...target.checked ? [data.builderGroup] : []])];
        return true;
      }
      if (data.builderGear !== undefined) {
        const row = draft.inventory[Number(data.builderIndex)], key = data.builderGear;
        if (!row) return true;
        if (key === "equipped") draft = globalThis.CharacterEquipment?.equip ? globalThis.CharacterEquipment.equip(draft,Number(data.builderIndex),target.checked,rules.catalog) : draft;
        else if (["twoHanded","offHand","attuned"].includes(key)) row[key] = !!target.checked;
        else if (["quantity","magicBonus"].includes(key) && Number.isInteger(Number(target.value))) row[key] = Number(target.value);
        else if (key === "weaponTraining" && ["","proficient","untrained"].includes(target.value)) row[key] = target.value;
        return true;
      }
      return false;
    }

    function start(character, fresh = false) {
      spellToAdd='';spellQuery='';spellLevel='';spellKind='spells';spellLimit=48;spellWorkspace='library';focusedTask='';focusedOption='';featureQuery='';optionLimit=36;showLocked=false;
      items=itemEntries();
      weaponGroups=[...new Set(items.flatMap(entry => {
        // Base weapon groups already come from ordinary equipment; magic collections group by rarity.
        const group=entry.section === "magic-items" ? entry.details?.weapon_group : entry.group;
        const profile=globalThis.MagicItems?.equipment(entry,rules.catalog) || entry;
        return group && profile.details?.damage && profile.details?.type ? [group] : [];
      }))].sort();
      draft = rules.enable(copy(character)); stage = "Ancestry"; open = true; isNew = !!fresh; itemToAdd = ""; itemQuery = ""; itemCategory = "";equipmentView='catalog';itemLimit=48;focusedItem='';ownedQuery='';lastAdded='';spellToAdd='';spellQuery='';spellLevel='';spellKind='spells';spellLimit=48;spellWorkspace='library';focusedTask='';focusedOption='';featureQuery='';showLocked=false;optionLimit=36;globalThis.CharacterFeats?.recordUpgradeSources?.(draft,rules.derive(draft));render(); return true;
    }
    function cancel() { if (!open) return false; open = false; draft = null; onCancel(); return true; }
    function handleInput(target) {
      const handled = update(target);
      if(handled && target.dataset.builderFeatureQuery!==undefined) {
        const dialog=globalThis.document?.getElementById('editor-dialog'),scroll=dialog?.scrollTop || 0,position=target.selectionStart;
        render();
        const replacement=globalThis.document?.querySelector('[data-builder-feature-query]');replacement?.focus();replacement?.setSelectionRange?.(position,position);
        if(dialog)dialog.scrollTop=scroll;
      }
      if(handled && target.dataset.builderSpellQuery!==undefined) refreshSpellPicker();
      if(handled && target.dataset.builderItemQuery!==undefined)refreshEquipmentPicker();
      if(handled && target.dataset.builderOwnedQuery!==undefined){const host=globalThis.document?.getElementById('builder-owned-results');if(host)host.innerHTML=ownedEquipment();else render();}
      return handled;
    }
    function handleChange(target) {
      const handled = update(target);
      if(handled && ['builderSpell','builderSpellQuery'].some(key=>target.dataset[key]!==undefined)) {refreshSpellPicker();return true;}
      if (handled && ["builderItem", "builderItemQuery", "builderItemCategory"].some(key => target.dataset[key] !== undefined)) refreshEquipmentPicker();
      else if (handled) render();
      return handled;
    }
    function handleAction(action, target) {
      if (!open || !action?.startsWith("builder-")) return false;
      if (action === "builder-cancel") return cancel();
      const flow=stages(rules.derive(draft)),step=flow.indexOf(stage);
      if(action==='builder-task') {focusedTask=target.dataset.taskId;focusedOption='';featureQuery='';optionLimit=36;}
      else if(action==='builder-remove-class'){const history=globalThis.CharacterState.classHistory(draft).filter(id=>id!==target.dataset.classId);if(target.dataset.classId!==draft.build.classId && history.length){draft.build.classOrder=history;draft.level=history.length;}}
      else if(action==='builder-preview-option')focusedOption=target.dataset.optionId;
      else if(action==='builder-more-options')optionLimit+=36;
      else if(action==='builder-more-spells')spellLimit+=48;
      else if(action==='builder-more-items')itemLimit+=48;
      else if(action==='builder-preview-item'){itemToAdd=target.dataset.entryId;lastAdded='';}
      else if(action==='builder-edit-item')focusedItem=target.dataset.itemId;
      else if(action==='builder-equipment-view')equipmentView=target.dataset.equipmentView==='inventory'?'inventory':'catalog';
      else if(action==='builder-next-choice') {
        const groups=tasks(rules.derive(draft),stage==='Feats',stage==='Spells' && spellWorkspace==='upgrades'),index=groups.findIndex(group=>group.id===focusedTask),ordered=[...groups.slice(index+1),...groups.slice(0,index+1)];
        focusedTask=(ordered.find(group=>!group.optional && group.selected.length<group.count) || ordered[0])?.id || '';focusedOption='';featureQuery='';
      }
      else if(action==='builder-choose-option') {
        const group=rules.derive(draft).choices.find(group=>group.id===target.dataset.choiceId);
        const slots=group && rules.placeChoice(group,target.dataset.optionId);
        if(slots){const candidate=copy(draft),values=candidate.build.choices[group.id] ||= [];for(const [index,id] of slots.entries())if(id)setSlot(values,index,id);const checked=rules.derive(candidate).choices.find(item=>item.id===group.id);if(checked?.selected.length>=group.selected.length+1 && slots.every((id,index)=>!id || checked.selectedSlots[index]===id)){draft=candidate;if(target.dataset.optionId===group.featureId+':feat'){focusedTask=group.featureId+':feat-choice';focusedOption='';featureQuery='';}}}
      }
      else if(action==='builder-remove-choice') {
        const d=rules.derive(draft),group=d.choices.find(group=>group.id===target.dataset.choiceId),slot=Number(target.dataset.choiceSlot);
        if(group && Number.isInteger(slot) && slot>=0 && slot<group.count){
          const limit=slot>=group.baseCount?group.bonusSlots[slot-group.baseCount]:null;
          if(limit?.choiceKey && limit.autoSelect===group.selectedSlots[slot]){const saved=draft.build.featChoices[limit.source] ||= {};setSlot(saved[limit.choiceKey] ||= [],0,'');}
          const origin=group.sourceSlots?.[slot] ?? slot;if(origin>=0 && draft.build.choices[group.id])draft.build.choices[group.id][origin]='';
        }
      }
      else if(action==='builder-spell-workspace'){spellWorkspace=target.dataset.spellWorkspace==='upgrades'?'upgrades':'library';focusedTask='';focusedOption='';featureQuery='';}
      else if(action==='builder-spell-kind') {spellKind=target.dataset.spellKind==='cantrips'?'cantrips':'spells';spellLevel='';spellToAdd='';spellQuery='';spellLimit=48;}
      else if(action==='builder-preview-spell') {
        spellToAdd=target.dataset.entryId;const entry=globalThis.CharacterCasting.spellSelection(draft,rules.derive(draft),rules.catalog).eligible.find(entry=>globalThis.CharacterCasting.spellId(entry)===spellToAdd);
        if(entry)spellKind=globalThis.CharacterCasting.spellInfo(entry).cantrip?'cantrips':'spells';
      }
      else if (action === "builder-next") stage=flow[Math.min(flow.length-1,step+1)];
      else if (action === "builder-back") stage=flow[Math.max(0,step-1)];
      else if (action === "builder-step") {
        const value=target?.dataset?.builderStep;
        if(flow.includes(value))stage=value;
        else if(Number.isInteger(Number(value)) && Number(value)>=0 && Number(value)<flow.length)stage=flow[Number(value)];
      } else if (action === "builder-add-item" || action === "builder-add-equip") {
        const entry = items.find(item => item.entryId === itemToAdd);
        if(entry){const row={id:uid(),name:entry.name,entryId:entry.entryId,quantity:1,equipped:false,notes:'',...(globalThis.MagicItems?.inventoryFields(entry) || {})};draft.inventory.push(row);focusedItem=row.id;
          if(action==='builder-add-equip')draft=globalThis.CharacterEquipment.equip(draft,draft.inventory.length-1,true,rules.catalog);
          lastAdded=entry.name+(action==='builder-add-equip'?' equipped.':' added to pack. Equip it in Your equipment to apply its effects.');}
      } else if(action==='builder-add-spell' || action==='builder-learn-spell') {
        if(action==='builder-learn-spell')spellToAdd=target.dataset.entryId;
        const derived=rules.derive(draft),casting=globalThis.CharacterCasting;
        const selection=casting.spellSelection(draft,derived,rules.catalog),entry=selection.eligible.find(entry=>casting.spellId(entry)===spellToAdd);
        if(entry && !draft.spells.some(row=>row.entryId===spellToAdd && row.classId===derived.casting.classId)) {
          if(!casting.spellLearningError(draft,derived,rules.catalog,entry)) {draft.spells.push({id:uid(),entryId:spellToAdd,name:entry.name,notes:'',prepared:true,classId:derived.casting.classId});spellToAdd='';}
        }
      } else if(action==='builder-remove-spell') {
        draft.spells=draft.spells.filter(row=>row.id!==target?.dataset?.spellId);
      } else if (action === "builder-remove-item") {
        const index = Number(target?.dataset?.builderIndex); if (Number.isInteger(index) && index >= 0 && index < draft.inventory.length) draft.inventory.splice(index,1);
      } else if (action === "builder-finish") {
        if(stage!=='Review')return true;
        const current=rules.derive(draft);for(const source of current.featPlan?.sources || [])for(const field of current.featPlan.specs[source.id]?.fields || [])if(field.immutable && current.featPlan.specs[source.id].values[field.key]?.length){const locks=draft.build.choiceLocks[source.id] ||= {};locks[field.key] ||= current.featPlan.specs[source.id].values[field.key][0];}
        const result = rules.reconcile(copy(draft)); if(isNew){result.restDice.current=result.restDice.max;if(result.restDice.pools.length)globalThis.CharacterState.syncRestDice(result,result.restDice.pools);}open = false; draft = null; onFinish(result,isNew); return true;
      } else return false;
      render(); return true;
    }
    return Object.freeze({start,handleInput,handleChange,handleAction,isOpen:() => open,cancel});
  }
  globalThis.CharacterBuilder = Object.freeze({create});
})();
