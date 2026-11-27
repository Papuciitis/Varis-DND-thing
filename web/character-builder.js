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
    let spellToAdd = '', spellQuery = '', spellLevel = '', spellKind = 'spells', spellLimit = 48;
    let focusedTask = '', focusedOption = '', featureQuery = '', showLocked = false, optionLimit = 36;
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
      const cls = selectedClass();
      let html = `<p>Choose your class, then an archetype for each slot your current level has unlocked.</p>${field("Class",select("build.classId",classes,draft.build.classId,"Choose a class"))}`;
      if (!cls) return html;
      html += `<div class="list-card"><h3>${escape(cls.name)}</h3><p>Hit die ${escape(cls.hitDie || "unspecified")} · Saves: ${escape((cls.saves || []).map(code => names[code] || code).join(", "))}</p>${details("Class description",cls.description)}${details("Class training",cls.proficiencies)}${cls.notes ? `<p class="muted">${escape(cls.notes)}</p>` : ""}</div>`;
      html += castingPreview(derived);
      const slots = (cls.archetypeLevels || []).filter(level => level <= draft.level).sort((a,b)=>a-b);
      if (!slots.length) html += `<p class="muted">${cls.archetypeLevels?.length ? `Your first archetype slot opens at level ${escape(cls.archetypeLevels[0])}.` : "This source has no specified archetype slots."}</p>`;
      html += grid(slots.map((level,index) => {
        const current = draft.build.archetypes[index] || "";
        const eligible = archetypes.filter(item => item.className.toLowerCase() === cls.name.toLowerCase() && item.minLevel <= level).sort((a,b)=>order.compare(a,b,'level-asc'));
        const selected = archetypes.find(item => item.id === current);
        const choices = eligible.map(item => option(item.id,item.name+` · level ${item.minLevel}`+(item.status ? ` (${item.status})` : ""),item.id === current,draft.build.archetypes.some((id,slot) => slot !== index && id === item.id))).join("");
        return `<div>${field(`Level ${level} archetype`,`<select data-builder-path="build.archetypes.${index}">${option("","Choose an archetype",!current)}${selected && !eligible.includes(selected) ? option(current,selected.name+" — review eligibility",true,true) : ""}${choices}</select>`)}${selected ? details(`${selected.name}: source details`,selected.description || selected.status || selected.features?.map(feature => ({name:feature.name,details:feature.details}))) : ""}${selected?.minLevelSource === "parent fallback" ? '<p class="muted">Starting level is provisional; review the unfinished source.</p>' : ""}</div>`;
      }).join(""));
      return html;
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

    function skillChoices(key, count, options) {
      const values = draft.build[key] || [];
      return grid(Array.from({length:count},(_,index) => field(`${key === "skills" ? "Class" : "Ancestry"} skill ${index+1}`,`<select data-builder-skills="${key}" data-builder-choice-index="${index}">${option("","Choose a skill",!values[index])}${options.map(name => option(name,name,name === values[index],values.some((value,other) => name === value && other !== index))).join("")}</select>`)).join(""));
    }

    const optionRules = item => item.ownDetails ?? (item.eligibility?item.details?.description || item.details:item.details);
    const featGroup = group => group.kind==='feat' || /ability.score.improvement/i.test(group.featureName);
    function featBenefits(option,task) {
      if(task.kind!=='feat' || !task.selected.includes(option.id))return '';
      const specification=globalThis.CharacterEffects.benefitOptions(option);if(!specification)return '';
      const selected=draft.build.featBenefits[option.id] || [];
      return `<fieldset class="builder-feat-benefits"><legend>Feat benefits${specification.count===2?' · choose two':''}</legend>${specification.note?`<p class="muted">${escape(specification.note)}</p>`:''}${specification.options.map(([key,label])=>`<label class="check-label"><input type="checkbox" data-builder-feat-benefit="${key}" data-feat-id="${escape(option.id)}" ${selected.includes(key)?'checked':''} ${!selected.includes(key)&&selected.length>=specification.count?'disabled':''}>${escape(label)}</label>`).join('')}</fieldset>`;
    }
    function tasks(derived, feats=false) {
      const result=[];
      if(!feats && derived.cls?.skillChoice) result.push({id:'class-skills',label:'Class skills',count:derived.cls.skillChoice.count,selected:[...new Set(draft.build.skills)].filter(skill=>derived.cls.skillChoice.options.includes(skill)),skills:'skills',options:derived.cls.skillChoice.options});
      if(!feats && derived.raceSkillCount) result.push({id:'race-skills',label:'Ancestry skills',count:derived.raceSkillCount,selected:[...new Set(draft.build.raceSkills)].filter(skill=>(derived.raceSkillOptions || allSkills).includes(skill)),skills:'raceSkills',options:derived.raceSkillOptions || allSkills});
      for(const group of derived.choices.filter(group=>featGroup(group)===feats)) result.push({...group,label:group.kind==='feat'?`${group.parent}: ${group.label}`:group.featureName+(group.label==='Choose features'?'':` · ${group.label}`)});
      return result;
    }
    function stages(derived) {
      return ['Ancestry','Class','Abilities','Features',...(derived.casting?.profile?['Spells']:[]),...(derived.choices.some(featGroup)?['Feats']:[]),'Equipment','Review'];
    }
    function taskPane(derived,feats=false) {
      const groups=tasks(derived,feats);
      let task=groups.find(group=>group.id===focusedTask) || groups.find(group=>!group.optional && group.selected.length<group.count) || groups[0];
      if(task) focusedTask=task.id;
      const remaining=groups.reduce((total,group)=>total+(group.optional?0:Math.max(0,group.count-group.selected.length)),0);
      const nav=`<nav class="builder-task-nav" aria-label="${feats?'Feat and ability':'Feature'} choices">${groups.map(group=>`<button type="button" data-action="builder-task" data-task-id="${escape(group.id)}" ${group.id===task?.id?'aria-current="true"':''}><span>${escape(group.label)}</span><small>${group.optional?'Optional':`${group.selected.length} / ${group.count}`}${group.level?` · Level ${group.level}`:''}</small>${group.kind==='feat'&&group.selected.length?`<small>${group.options.filter(option=>group.selected.includes(option.id)).map(option=>escape(option.name)).join(', ')}</small>`:''}</button>`).join('')}</nav>`;
      let body='<p class="muted">No choices are required here at this level.</p>';
      if(task?.skills) body=`<section class="builder-task-content"><h2>${escape(task.label)}</h2><p>Choose ${task.count} proficiencies.</p>${skillChoices(task.skills,task.count,task.options)}</section>`;
      else if(task) {
        const selected=task.selectedSlots || [],available=task.options.filter(item=>{
          const used=task.selected.filter(id=>id===item.id).length;
          return (showLocked || !item.unavailableReason) && used<(item.repeatLimit || 1) && (!featureQuery || (item.name+' '+JSON.stringify(optionRules(item))).toLowerCase().includes(featureQuery.toLowerCase()));
        });
        const preview=task.options.find(item=>item.id===focusedOption) || task.options.find(item=>task.selected.includes(item.id)) || available[0];
        const previewUsed=preview?task.selected.filter(id=>id===preview.id).length:0;
        const canAdd=preview && !preview.unavailableReason && previewUsed<(preview.repeatLimit || 1) && task.selected.length<task.count;
        const chosen=selected.map((id,index)=>({id,index,option:task.options.find(item=>item.id===id)})).filter(row=>row.option);
        body=`<section class="builder-task-content"><div class="builder-task-heading"><div><h2>${escape(task.featureName || task.label)}</h2><p>${escape(task.parent)}${task.level?` · Level ${task.level}`:''} · ${task.selected.length} / ${task.count} chosen</p></div><button type="button" data-action="builder-next-choice">Next unfinished choice</button></div><div class="builder-chosen" aria-label="Selected options">${chosen.map(({option,index})=>`<span class="builder-chip"><button type="button" data-action="builder-preview-option" data-option-id="${escape(option.id)}">${escape(option.name)}</button><button type="button" data-action="builder-remove-choice" data-choice-id="${escape(task.id)}" data-choice-slot="${index}" aria-label="Remove ${escape(option.name)}">×</button></span>`).join('') || '<p class="muted">Choose an option below.</p>'}</div>${task.unavailableSelected?.length?`<p class="builder-notice">${task.unavailableSelected.map(item=>escape(item.name)).join(', ')} no longer meets its prerequisites. Choose a replacement.</p>`:''}${field(task.kind==='feat'?'Search eligible feats':'Search options',`<input type="search" data-builder-feature-query value="${escape(featureQuery)}" autocomplete="off">`)}${task.options.some(item=>item.requires?.length)?`<label class="check-label"><input type="checkbox" data-builder-locked ${showLocked?'checked':''}>Show locked upgrades</label>`:''}<div class="builder-library"><div class="builder-option-list" aria-label="Available options">${available.slice(0,optionLimit).map(item=>`<button type="button" class="builder-option-card" data-action="builder-preview-option" data-option-id="${escape(item.id)}" ${item.id===preview?.id?'aria-pressed="true"':''}><strong>${escape(item.name)}</strong>${item.unavailableReason?`<small>${escape(item.unavailableReason)}</small>`:''}</button>`).join('') || '<p class="muted">No eligible options match. Adjust your search or review earlier choices.</p>'}${available.length>optionLimit?'<button type="button" data-action="builder-more-options">Show more options</button>':''}</div><aside class="builder-option-preview" aria-label="Option details">${preview?`<h3>${escape(preview.name)}</h3>${preview.eligibility?.requirements?.length?`<p class="muted">Requires: ${escape(preview.eligibility.requirements.join('; '))}</p>`:''}<div class="rule-body">${renderRule(optionRules(preview))}</div>${featBenefits(preview,task)}${preview.unavailableReason?`<p class="builder-notice">${escape(preview.unavailableReason)}</p>`:''}<button type="button" class="primary" data-action="builder-choose-option" data-choice-id="${escape(task.id)}" data-option-id="${escape(preview.id)}" ${canAdd?'':'disabled'}>${previewUsed>=(preview.repeatLimit || 1)?'Already selected':task.selected.length>=task.count?'Remove a selection to replace it':'Choose '+escape(preview.name)}</button>`:'<p>Select an option to read its rules.</p>'}</aside></div></section>`;
      }
      const intro=feats?'<p>Only feats whose prerequisites you meet are offered here. Each grant is checked at its own level. <a href="index.html#section=feats" target="_blank" rel="noopener">Browse every feat in the compendium</a>.</p>':'<p>Work through one choice at a time. Selected options stay in the summary above their list.</p>';
      const qualifications=feats?`<details class="builder-qualification"><summary>Story qualifications</summary><p class="muted">Record these only when they are true for your character.</p>${[['has-died','This character has died'],['righteous-slaying','Has slain a murderous vampire, fae, or sentient aberration or undead'],['rest-crafting','Can create or procure items during rest']].map(([key,label])=>`<label class="check-label"><input type="checkbox" data-builder-qualification="${key}" ${draft.build.qualifications.includes(key)?'checked':''}>${label}</label>`).join('')}</details>`:'';
      return `${intro}<p class="builder-progress-note">${remaining?`${remaining} selection${remaining===1?'':'s'} remaining`:'Required selections complete'}</p><div id="builder-choice-workspace" class="builder-choice-workspace">${nav}${body}</div>${qualifications}`;
    }
    function featuresStep(derived) {
      const given=derived.features.filter(feature=>feature.parent!=='Feat' && !derived.choices.some(group=>group.featureId===feature.id)).sort((a,b)=>order.compare(a,b,'level-asc'));
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
      const picked=selection.eligible.find(entry=>casting.spellId(entry)===spellToAdd) || matching[0];
      const pickedId=picked?casting.spellId(picked):'',already=draft.spells.some(row=>row.entryId===pickedId);
      const reason=picked&&!already?casting.spellLearningError(draft,derived,rules.catalog,picked):'';
      return `<p class="muted">${matching.length} eligible ${spellKind==='cantrips'?'cantrips':'spells'} match</p><div class="builder-library"><div class="builder-option-list" aria-label="Eligible spells">${matching.slice(0,spellLimit).map(entry=>{const id=casting.spellId(entry),info=casting.spellInfo(entry,derived.casting.profile.tradition);return `<button type="button" class="builder-option-card" data-action="builder-preview-spell" data-entry-id="${escape(id)}" ${id===pickedId?'aria-pressed="true"':''}><strong>${escape(entry.name)}</strong><small>${info.cantrip?'Cantrip':'Level '+info.level}${entry.details.casting?' · '+escape(entry.details.casting):''}${entry.details.range?' · '+escape(entry.details.range):''}</small>${draft.spells.some(row=>row.entryId===id)?'<span class="builder-picked-badge">Chosen</span>':''}</button>`;}).join('') || '<p class="muted">No spells match these filters. Review the level filter or your class settings.</p>'}${matching.length>spellLimit?'<button type="button" data-action="builder-more-spells">Show more spells</button>':''}</div><aside class="builder-option-preview" aria-label="Spell details">${picked?`<h3>${escape(picked.name)}</h3><div class="rule-body">${renderRule(picked.details)}</div><button type="button" class="primary" data-action="builder-learn-spell" data-entry-id="${escape(pickedId)}" ${already||reason?'disabled':''}>${already?'Already chosen':'Learn '+escape(picked.name)}</button>${reason?`<p class="builder-notice">${escape(reason)}</p>`:''}`:'<p>Choose a spell to read its rules before learning it.</p>'}</aside></div>`;
    }
    function spellsStep(derived) {
      if(!derived.casting?.profile)return '<p>This class has no base spell selections.</p>';
      const casting=globalThis.CharacterCasting,selection=casting.spellSelection(draft,derived,rules.catalog);
      let configuration='';
      if(derived.casting.mode==='full')configuration=field('Maximum full-slot level',textInput('build.casting.maxSlotLevel',draft.build.casting?.maxSlotLevel ?? '','number','min="1" max="20"'),'Use the maximum spell level agreed at your table.');
      if(derived.casting.profile.tradition==='any')configuration=field('Maximum spell level you can learn',textInput('build.casting.maxLearnLevel',draft.build.casting?.maxLearnLevel ?? '','number','min="0" max="20"'),'The source limits learning to half Bard level without specifying rounding.');
      const levels=[...new Set(selection.eligible.filter(entry=>!casting.spellInfo(entry,derived.casting.profile.tradition).cantrip).map(entry=>casting.spellInfo(entry,derived.casting.profile.tradition).level))].sort((a,b)=>a-b);
      return `<section class="builder-spells"><h2>Choose your spells</h2><p>${escape(derived.cls.name)} · ${escape(derived.casting.profile.tradition==='any'?'Any tradition, including hexes as level 1–3 spells':derived.casting.profile.tradition+' magic')}</p><div class="builder-spell-tabs" role="group" aria-label="Spell selections">${selection.cantripLimit?`<button type="button" data-action="builder-spell-kind" data-spell-kind="cantrips" aria-pressed="${spellKind==='cantrips'}">Cantrips <strong>${selection.cantrips.length} / ${selection.cantripLimit}</strong></button>`:''}<button type="button" data-action="builder-spell-kind" data-spell-kind="spells" aria-pressed="${spellKind==='spells'}">${derived.casting.spellbookCount!==null?'Spellbook':'Spells'} <strong>${selection.spells.length} / ${selection.spellLimit}</strong></button></div>${configuration?`<details class="builder-table-settings" ${selection.eligible.filter(entry=>!casting.spellInfo(entry,derived.casting.profile.tradition).cantrip).length?'':'open'}><summary>Table casting settings</summary>${configuration}</details>`:''}<div class="builder-chosen" aria-label="Chosen spells">${selection.chosen.map(row=>`<span class="builder-chip"><button type="button" data-action="builder-preview-spell" data-entry-id="${escape(row.entryId)}">${escape(row.name)}</button><button type="button" data-action="builder-remove-spell" data-spell-id="${escape(row.id)}" aria-label="Remove ${escape(row.name)}">×</button></span>`).join('') || '<p class="muted">Your chosen spells will appear here.</p>'}</div><div class="builder-search-row">${field('Search spells',`<input type="search" data-builder-spell-query value="${escape(spellQuery)}" autocomplete="off">`)}${spellKind==='spells'?field('Spell level',`<select data-builder-spell-level>${option('','All eligible levels',spellLevel==='')}${levels.map(level=>option(level,'Level '+level,String(level)===spellLevel)).join('')}</select>`):''}</div><div id="builder-spell-results">${spellResults(derived)}</div>${selection.chosen.length?`<details class="builder-readied"><summary>${derived.cls.name==='Wizard'?'Preparation':'Ready spells'} (${selection.chosen.filter(row=>row.prepared).length})</summary>${selection.chosen.map(row=>`<label class="check-label"><input type="checkbox" data-builder-spell-ready="${escape(row.id)}" ${row.prepared?'checked':''}>${escape(row.name)}</label>`).join('')}</details>`:''}${selection.warnings.map(warning=>`<p class="muted">${escape(warning)}</p>`).join('')}</section>`;
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

    function equipmentOptions() {
      const matching = matchingEquipment();
      const selected = items.find(item => item.entryId === itemToAdd);
      return option("", matching.length ? "Choose equipment" : "No matching equipment", !itemToAdd) +
        (selected && !matching.includes(selected) ? option(selected.entryId, `${selected.name} · selected`, true) : "") +
        matching.map(item => option(item.entryId, `${item.name} · ${item.group}`, item.entryId === itemToAdd)).join("");
    }

    function equipmentPreview() {
      const selected = items.find(item => item.entryId === itemToAdd);
      if (!selected) return '<p class="muted">Choose an item to preview its rules before adding it.</p>';
      const profile = globalThis.MagicItems?.equipment(selected, rules.catalog) || selected;
      const summary = [selected.group, profile.details?.damage, profile.details?.["AC bonus"] ? `AC ${profile.details["AC bonus"]}` : ""].filter(Boolean);
      return `<h3>${escape(selected.name)}</h3><p class="muted">${escape(summary.join(" · "))}</p>${details("Item rules", selected.details)}`;
    }

    function refreshEquipmentPicker() {
      const select = globalThis.document?.getElementById("builder-equipment-options");
      if (!select) { render(); return; }
      select.innerHTML = equipmentOptions();
      const count = globalThis.document.getElementById("builder-equipment-count");
      if (count) count.textContent = equipmentCount();
      const preview = globalThis.document.getElementById("builder-equipment-preview");
      if (preview) preview.innerHTML = equipmentPreview();
      const add = globalThis.document.getElementById("builder-add-equipment");
      if (add) add.disabled = !itemToAdd;
    }

    function equipmentStep() {
      let html = `<p>Choose equipment, preview its rules, then add it to your character.</p><section class="builder-equipment-picker">${grid(
        field("Find equipment", `<input type="search" data-builder-item-query value="${escape(itemQuery)}" placeholder="Name or equipment type" autocomplete="off">`) +
        field("Category", `<select data-builder-item-category>${[["","All equipment"],["weapons","Weapons & ammunition"],["armor","Armor & shields"],["consumables","Consumables"],["gear","Other gear"]].map(([value,label]) => option(value,label,itemCategory === value)).join("")}</select>`)
      )}<p class="muted" id="builder-equipment-count">${equipmentCount()}</p><div class="row builder-equipment-filters">${field("Catalog equipment",`<select id="builder-equipment-options" data-builder-item>${equipmentOptions()}</select>`)}<button type="button" id="builder-add-equipment" data-action="builder-add-item"${itemToAdd ? "" : " disabled"}>Add equipment</button></div><div class="builder-equipment-preview" id="builder-equipment-preview">${equipmentPreview()}</div></section>`;
      html += draft.inventory.map((row,index) => {
        const entry = items.find(item => item.entryId === row.entryId), weapon = entry?.details?.damage || entry?.details?.["AC bonus"];
        return `<section class="list-card"><div class="row"><h3>${escape(row.name)}</h3><button type="button" data-action="builder-remove-item" data-builder-index="${index}" aria-label="Remove ${escape(row.name)}">Remove</button></div>${grid(
          field("Equipped",`<input type="checkbox" data-builder-gear="equipped" data-builder-index="${index}"${row.equipped ? " checked" : ""}>`)+
          (globalThis.MagicItems?.requiresAttunement(entry)?field("Attuned",`<input type="checkbox" data-builder-gear="attuned" data-builder-index="${index}"${row.attuned?" checked":""}>`):"")+
          field("Quantity",`<input type="number" min="0" value="${escape(row.quantity)}" data-builder-gear="quantity" data-builder-index="${index}">`)+
          field("Magic bonus",`<input type="number" min="-100" max="100" value="${escape(row.magicBonus || 0)}" data-builder-gear="magicBonus" data-builder-index="${index}">`)+
          (weapon ? field("Weapon or shield training",`<select data-builder-gear="weaponTraining" data-builder-index="${index}">${option("","Use class and chosen groups",!row.weaponTraining)}${option("proficient","Proficient",row.weaponTraining === "proficient")}${option("untrained","Untrained",row.weaponTraining === "untrained")}</select>`)+field("Two-handed grip",`<input type="checkbox" data-builder-gear="twoHanded" data-builder-index="${index}"${row.twoHanded ? " checked" : ""}>`,"Changes Versatile damage where the weapon has that property.")+field("Off-hand weapon",`<input type="checkbox" data-builder-gear="offHand" data-builder-index="${index}"${row.offHand ? " checked" : ""}>`) : "")
        )}${entry ? details("Equipment rules",entry.details) : '<p class="muted">Custom item: review its effects on the sheet.</p>'}</section>`;
      }).join("");
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
      if (health.hpMode === "rolled" && draft.level > 1) html += `<fieldset><legend>Recorded ${escape(derived.cls?.hitDie || "hit die")} rolls</legend><p class="muted">Enter the die result before Constitution. Missing rolls use the fixed average in this preview.</p>${grid(Array.from({length:draft.level-1},(_,index) => field(`Level ${index+2}`,textInput(`build.health.rolls.${index}`,health.rolls?.[index] ?? "","number",`min="1" max="${sides}" inputmode="numeric"`))).join(""))}</fieldset>`;
      html += castingPreview(derived);
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
      if (path === "build.classId" && draft.build.classId !== value) { draft.build.archetypes = []; draft.build.skills = []; }
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
      if(data.builderFeatureQuery!==undefined) {featureQuery=String(target.value || '');optionLimit=36;return true;}
      if(data.builderLocked!==undefined) {showLocked=!!target.checked;return true;}
      if(data.builderQualification!==undefined) {const key=data.builderQualification;if(['has-died','righteous-slaying','rest-crafting'].includes(key))draft.build.qualifications=[...draft.build.qualifications.filter(value=>value!==key),...(target.checked?[key]:[])];return true;}
      if(data.builderFeatBenefit!==undefined) {
        const feature=rules.derive(draft).features.find(feature=>feature.parent==='Feat' && feature.entryId===data.featId),specification=feature && globalThis.CharacterEffects.benefitOptions(feature);
        if(specification?.options.some(([key])=>key===data.builderFeatBenefit)) {
          const previous=draft.build.featBenefits[data.featId] || [],values=previous.filter(value=>value!==data.builderFeatBenefit);
          if(!target.checked || values.length<specification.count)draft.build.featBenefits[data.featId]=[...values,...(target.checked?[data.builderFeatBenefit]:[])];
        }return true;
      }
      if(data.builderSpellQuery!==undefined) {spellQuery=String(target.value || '');return true;}
      if(data.builderSpellLevel!==undefined) {spellLevel=String(target.value || '');return true;}
      if(data.builderSpell!==undefined) {spellToAdd=String(target.value || '');return true;}
      if(data.builderSpellReady!==undefined) {const row=draft.spells.find(row=>row.id===data.builderSpellReady);if(row)row.prepared=!!target.checked;return true;}
      if (data.builderItemQuery !== undefined) { itemQuery = String(target.value || ""); return true; }
      if (data.builderItemCategory !== undefined) { itemCategory = ["","weapons","armor","consumables","gear"].includes(target.value) ? target.value : ""; return true; }
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
        if (["skills","raceSkills"].includes(data.builderSkills) && Number.isInteger(index) && index >= 0 && index < 100) setSlot(draft.build[data.builderSkills],index,target.value);
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
      spellToAdd='';spellQuery='';spellLevel='';spellKind='spells';spellLimit=48;focusedTask='';focusedOption='';featureQuery='';optionLimit=36;showLocked=false;
      items=itemEntries();
      weaponGroups=[...new Set(items.flatMap(entry => {
        // Base weapon groups already come from ordinary equipment; magic collections group by rarity.
        const group=entry.section === "magic-items" ? entry.details?.weapon_group : entry.group;
        const profile=globalThis.MagicItems?.equipment(entry,rules.catalog) || entry;
        return group && profile.details?.damage && profile.details?.type ? [group] : [];
      }))].sort();
      draft = rules.enable(copy(character)); stage = "Ancestry"; open = true; isNew = !!fresh; itemToAdd = ""; itemQuery = ""; itemCategory = ""; render(); return true;
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
      if (handled && target.dataset.builderItemQuery !== undefined && globalThis.document?.getElementById("builder-equipment-options")) refreshEquipmentPicker();
      return handled;
    }
    function handleChange(target) {
      const handled = update(target);
      if(handled && ['builderSpell','builderSpellQuery','builderSpellLevel'].some(key=>target.dataset[key]!==undefined)) {refreshSpellPicker();return true;}
      if (handled && ["builderItem", "builderItemQuery", "builderItemCategory"].some(key => target.dataset[key] !== undefined)) refreshEquipmentPicker();
      else if (handled) render();
      return handled;
    }
    function handleAction(action, target) {
      if (!open || !action?.startsWith("builder-")) return false;
      if (action === "builder-cancel") return cancel();
      const flow=stages(rules.derive(draft)),step=flow.indexOf(stage);
      if(action==='builder-task') {focusedTask=target.dataset.taskId;focusedOption='';featureQuery='';optionLimit=36;}
      else if(action==='builder-preview-option')focusedOption=target.dataset.optionId;
      else if(action==='builder-more-options')optionLimit+=36;
      else if(action==='builder-more-spells')spellLimit+=48;
      else if(action==='builder-next-choice') {
        const groups=tasks(rules.derive(draft),stage==='Feats'),index=groups.findIndex(group=>group.id===focusedTask),ordered=[...groups.slice(index+1),...groups.slice(0,index+1)];
        focusedTask=(ordered.find(group=>!group.optional && group.selected.length<group.count) || ordered[0])?.id || '';focusedOption='';featureQuery='';
      }
      else if(action==='builder-choose-option') {
        const group=rules.derive(draft).choices.find(group=>group.id===target.dataset.choiceId);
        if(group){const slot=Array.from({length:group.count},(_,index)=>index).find(index=>!group.selectedSlots[index]);if(slot!==undefined)update({dataset:{builderChoice:group.id,builderChoiceIndex:String(slot)},value:target.dataset.optionId});}
      }
      else if(action==='builder-remove-choice') {
        const group=rules.derive(draft).choices.find(group=>group.id===target.dataset.choiceId),slot=Number(target.dataset.choiceSlot);
        if(group && Number.isInteger(slot) && slot>=0 && slot<group.count && draft.build.choices[group.id])draft.build.choices[group.id][slot]='';
      }
      else if(action==='builder-spell-kind') {spellKind=target.dataset.spellKind==='cantrips'?'cantrips':'spells';spellLevel='';spellToAdd='';spellLimit=48;}
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
      } else if (action === "builder-add-item") {
        const entry = items.find(item => item.entryId === itemToAdd);
        if (entry) draft.inventory.push({id:uid(),name:entry.name,entryId:entry.entryId,quantity:1,equipped:false,notes:"",...(globalThis.MagicItems?.inventoryFields(entry) || {})});
      } else if(action==='builder-add-spell' || action==='builder-learn-spell') {
        if(action==='builder-learn-spell')spellToAdd=target.dataset.entryId;
        const derived=rules.derive(draft),casting=globalThis.CharacterCasting;
        const selection=casting.spellSelection(draft,derived,rules.catalog),entry=selection.eligible.find(entry=>casting.spellId(entry)===spellToAdd);
        if(entry && !draft.spells.some(row=>row.entryId===spellToAdd)) {
          if(!casting.spellLearningError(draft,derived,rules.catalog,entry)) draft.spells.push({id:uid(),entryId:spellToAdd,name:entry.name,notes:'',prepared:true,classId:derived.cls.id});
        }
      } else if(action==='builder-remove-spell') {
        draft.spells=draft.spells.filter(row=>row.id!==target?.dataset?.spellId);
      } else if (action === "builder-remove-item") {
        const index = Number(target?.dataset?.builderIndex); if (Number.isInteger(index) && index >= 0 && index < draft.inventory.length) draft.inventory.splice(index,1);
      } else if (action === "builder-finish") {
        if(stage!=='Review')return true;
        const result = rules.reconcile(copy(draft)); if(isNew)result.restDice.current=result.restDice.max;open = false; draft = null; onFinish(result,isNew); return true;
      } else return false;
      render(); return true;
    }
    return Object.freeze({start,handleInput,handleChange,handleAction,isOpen:() => open,cancel});
  }
  globalThis.CharacterBuilder = Object.freeze({create});
})();
