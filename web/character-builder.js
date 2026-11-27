"use strict";

(() => {
  const steps = ["Ancestry", "Class", "Abilities", "Features", "Equipment", "Review"];
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
    let draft = null, step = 0, open = false, isNew = false, itemToAdd = "", itemQuery = "", itemCategory = "";
    let spellToAdd = '', spellQuery = '', spellLevel = '';
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

    function featuresStep(derived) {
      let html = `<p>Choose the skills and feature options granted by your current ancestry, class and archetypes. Expand each rule to read its costs, conditions and prerequisites.</p>`;
      if (derived.cls?.skillChoice) html += `<fieldset><legend>Class skills</legend>${skillChoices("skills",derived.cls.skillChoice.count,derived.cls.skillChoice.options)}</fieldset>`;
      if (derived.raceSkillCount) {
        const raw = (derived.race?.proficiencies || []).find(text => /skills?\b.*\bfrom\b/i.test(text));
        const restricted = raw ? allSkills.filter(skill => raw.toLowerCase().includes(skill.toLowerCase()) || (skill === "Animal Handling" && /handle[- ]animal/i.test(raw))) : [];
        const options = derived.raceSkillOptions || (restricted.length ? restricted : allSkills);
        html += `<fieldset><legend>Ancestry skills</legend>${skillChoices("raceSkills",derived.raceSkillCount,options)}</fieldset>`;
      }
      html += [...derived.features].sort((a,b)=>order.compare(a,b,'level-asc')).map(feature => {
        const groups = derived.choices.filter(group => group.featureId === feature.id || (feature.choices || []).some(own => own.id === group.id));
        return `<section class="list-card"><h3>${escape(feature.name)}</h3><p class="muted">${escape(feature.parent)} · Level ${escape(feature.requiredLevel ?? feature.level ?? 1)}</p>${details("Read feature rules",feature.details)}${groups.map(group => {
          const selected = (draft.build.choices[group.id] || []).slice(0,group.count);
          const tree = group.options.some(item=>item.requires?.length);
          const pickers = Array.from({length:group.count},(_,index) => {
            const values = group.options.map(item => {
              const repeats = selected.filter((id,other)=>other!==index && id===item.id).length;
              const label = item.name+(item.unavailableReason ? ` (${item.unavailableReason})` : '');
              return option(item.id,label,item.id===selected[index],!!item.unavailableReason || repeats >= (item.repeatLimit || 1));
            }).join('');
            return field(group.kind==='feat' ? 'Choose a feat' : `Selection ${index+1}`,`<select data-builder-choice="${escape(group.id)}" data-builder-choice-index="${index}">${option("",group.kind==='feat' ? "Browse feats and choose one" : group.optional ? "Skip this optional choice" : "Choose an option",!selected[index])}${values}</select>`);
          }).join('');
          return `<fieldset><legend>${escape(group.label === "minitrait_list" ? "Traits" : group.label)} - choose ${group.count}</legend>${tree ? '<p class="muted">Choose a starting skill to unlock its upgrades. Each upgrade uses a selection and requires its parent skill.</p>' : ''}${grid(pickers)}${group.options.filter(item => selected.includes(item.id)).map(item => details(item.name,item.details)).join("")}</fieldset>`;
        }).join("")}</section>`;
      }).join("");
      if (!derived.features.length) html += `<p class="muted">Choose an ancestry and class to see their features here.</p>`;
      return html + spellsStep(derived);
    }

    function spellResults(derived) {
      const casting=globalThis.CharacterCasting, selection=casting.spellSelection(draft,derived,rules.catalog);
      const words=spellQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const matching=selection.eligible.filter(entry=>(spellLevel==='' || String(casting.spellInfo(entry,derived.casting.profile.tradition).level)===spellLevel) && words.every(word=>(entry.name+' '+JSON.stringify(entry.details)).toLowerCase().includes(word)));
      matching.sort((a,b)=>casting.spellInfo(a,derived.casting.profile.tradition).level-casting.spellInfo(b,derived.casting.profile.tradition).level || a.name.localeCompare(b.name));
      const picked=selection.eligible.find(entry=>casting.spellId(entry)===spellToAdd);
      const info=picked?casting.spellInfo(picked,derived.casting.profile.tradition):null;
      const already=picked && draft.spells.some(row=>row.entryId===spellToAdd);
      const full=info && casting.spellLearningError(draft,derived,rules.catalog,picked);
      return `<p class="muted">${matching.length} available spells match</p>${field('Available class spells',`<select data-builder-spell>${option('','Choose a spell to read its rules',!spellToAdd)}${picked && !matching.includes(picked)?option(spellToAdd,picked.name,true):''}${matching.map(entry=>option(casting.spellId(entry),`${entry.name} — ${casting.spellInfo(entry,derived.casting.profile.tradition).cantrip?'Cantrip':'Level '+casting.spellInfo(entry,derived.casting.profile.tradition).level}`,casting.spellId(entry)===spellToAdd)).join('')}</select>`)}${picked?`<section class="list-card"><h3>${escape(picked.name)}</h3>${details('Spell rules',picked.details)}<button type="button" data-action="builder-add-spell"${already || full?' disabled':''}>${already?'Already chosen':full?'Class selections full':'Learn spell'}</button>${full && !already?`<p class="muted">${escape(full)}</p>`:''}</section>`:''}`;
    }

    function spellsStep(derived) {
      if(!derived.casting?.profile || !globalThis.CharacterCasting?.spellSelection) return '';
      const casting=globalThis.CharacterCasting, selection=casting.spellSelection(draft,derived,rules.catalog);
      let configuration='';
      if(derived.casting.mode==='full') configuration=field('Maximum full-slot level',textInput('build.casting.maxSlotLevel',draft.build.casting?.maxSlotLevel ?? '', 'number','min="1" max="20"'),'Use the maximum spell level agreed at your table.');
      if(derived.casting.profile.tradition==='any') configuration=field('Maximum spell level you can learn',textInput('build.casting.maxLearnLevel',draft.build.casting?.maxLearnLevel ?? '', 'number','min="0" max="20"'),'Bard learning is limited to half Bard level; its source leaves rounding unspecified.');
      const levels=[...new Set(selection.eligible.map(entry=>casting.spellInfo(entry,derived.casting.profile.tradition).level))].sort((a,b)=>a-b);
      return `<section class="builder-spells"><h2>Choose your spells</h2><p>${escape(derived.cls.name)} · ${escape(derived.casting.profile.tradition==='any'?'Any tradition, including hexes as level 1–3 spells':derived.casting.profile.tradition+' magic')} · ${selection.spells.length} / ${selection.spellLimit} ${derived.casting.spellbookCount!==null?'spellbook spells':'spells known'} · ${selection.cantrips.length} / ${selection.cantripLimit} cantrips</p>${configuration}<div class="form-grid">${field('Search spells','<input type="search" data-builder-spell-query value="'+escape(spellQuery)+'" autocomplete="off">')}${field('Spell level',`<select data-builder-spell-level>${option('','All available levels',spellLevel==='')}${levels.map(level=>option(level,level===0?'Cantrips':'Level '+level,String(level)===spellLevel)).join('')}</select>`)}</div><div id="builder-spell-results">${spellResults(derived)}</div><h3>Chosen spells</h3>${selection.chosen.length?selection.chosen.map(row=>{const entry=selection.eligible.find(entry=>casting.spellId(entry)===row.entryId);return `<article class="list-card"><h4>${escape(row.name)}</h4>${details('Read spell rules',entry.details)}<label class="check-label"><input type="checkbox" data-builder-spell-ready="${escape(row.id)}" ${row.prepared?'checked':''}>${derived.cls.name==='Wizard'?'Prepared':'Ready on the sheet'}</label><button type="button" data-action="builder-remove-spell" data-spell-id="${escape(row.id)}">Remove</button></article>`;}).join(''):'<p class="muted">Choose spells above to add them to this character.</p>'}${selection.warnings.map(warning=>`<p class="muted">${escape(warning)}</p>`).join('')}</section>`;
    }

    function refreshSpellPicker() {
      const host=globalThis.document?.getElementById('builder-spell-results');
      if(host) host.innerHTML=spellResults(rules.derive(draft));
      else render();
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
        field("Base rest dice pool",textInput("build.health.baseRestDice",health.baseRestDice,"number",'min="0"'),"Enter the pool granted by your table; selected bonuses are added."));
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
      if (!open) return;
      const derived = rules.derive(draft);
      const body = [ancestry,classStep,abilitiesStep,featuresStep,equipmentStep,review][step](derived);
      const nav = `<nav class="builder-steps row" aria-label="Character creation steps">${steps.map((name,index) => `<button type="button" data-action="builder-step" data-builder-step="${index}"${index === step ? ' aria-current="step"' : ""}>${index+1}. ${escape(name)}</button>`).join("")}</nav>`;
      show(`${step+1} of ${steps.length} · ${steps[step]}`,`<div class="builder-flow" style="display:grid;gap:1rem">${nav}<progress value="${step+1}" max="6" aria-label="Character creation progress" style="width:100%">${step+1} of 6</progress>${body}<p class="muted">Varis house rules · Source descriptions retain draft and unresolved mechanics.</p></div>`,
        `<button type="button" data-action="builder-cancel">Cancel</button><button type="button" data-action="builder-back"${step === 0 ? " disabled" : ""}>Back</button>${step < steps.length-1 ? '<button type="button" class="primary" data-action="builder-next">Next</button>' : '<button type="button" class="primary" data-action="builder-finish">Save character</button>'}`);
    }

    function setPath(path, target) {
      const numeric = /^(?:level|abilities\.(?:str|dex|con|int|wis|cha)|build\.casting\.(?:maxSlotLevel|maxLearnLevel)|build\.health\.(?:baseHP|baseRestDice|rolls\.\d+))$/;
      if (!/^(?:name|player|level|abilities\.(?:str|dex|con|int|wis|cha)|build\.(?:raceId|classId|backgroundId|archetypes\.\d+|casting\.(?:maxSlotLevel|maxLearnLevel)|health\.(?:hpMode|baseHP|baseRestDice|rolls\.\d+)))$/.test(path)) return false;
      let value = numeric.test(path) ? Number(target.value) : String(target.value ?? "");
      if(path==='build.backgroundId') {
        const background=backgroundEntries().find(item=>item.id===value);
        if(value && !background)return true;
        draft.background=background?.name || '';
      }
      if (numeric.test(path) && (!Number.isInteger(value) || value < (path === "level" ? 1 : 0))) return true;
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
          if(!target.value || checked?.selectedSlots[index]===target.value) draft=candidate;
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
      spellToAdd='';spellQuery='';spellLevel='';
      items=itemEntries();
      weaponGroups=[...new Set(items.flatMap(entry => {
        // Base weapon groups already come from ordinary equipment; magic collections group by rarity.
        const group=entry.section === "magic-items" ? entry.details?.weapon_group : entry.group;
        const profile=globalThis.MagicItems?.equipment(entry,rules.catalog) || entry;
        return group && profile.details?.damage && profile.details?.type ? [group] : [];
      }))].sort();
      draft = rules.enable(copy(character)); step = 0; open = true; isNew = !!fresh; itemToAdd = ""; itemQuery = ""; itemCategory = ""; render(); return true;
    }
    function cancel() { if (!open) return false; open = false; draft = null; onCancel(); return true; }
    function handleInput(target) {
      const handled = update(target);
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
      if (action === "builder-next") step = Math.min(steps.length-1,step+1);
      else if (action === "builder-back") step = Math.max(0,step-1);
      else if (action === "builder-step") {
        const value = Number(target?.dataset?.builderStep); if (Number.isInteger(value) && value >= 0 && value < steps.length) step = value;
      } else if (action === "builder-add-item") {
        const entry = items.find(item => item.entryId === itemToAdd);
        if (entry) draft.inventory.push({id:uid(),name:entry.name,entryId:entry.entryId,quantity:1,equipped:false,notes:"",...(globalThis.MagicItems?.inventoryFields(entry) || {})});
      } else if(action==='builder-add-spell') {
        const derived=rules.derive(draft),casting=globalThis.CharacterCasting;
        const selection=casting.spellSelection(draft,derived,rules.catalog),entry=selection.eligible.find(entry=>casting.spellId(entry)===spellToAdd);
        if(entry && !draft.spells.some(row=>row.entryId===spellToAdd)) {
          const cantrip=casting.spellInfo(entry,derived.casting.profile.tradition).cantrip;
          if(!casting.spellLearningError(draft,derived,rules.catalog,entry)) draft.spells.push({id:uid(),entryId:spellToAdd,name:entry.name,notes:'',prepared:true,classId:derived.cls.id});
        }
      } else if(action==='builder-remove-spell') {
        draft.spells=draft.spells.filter(row=>row.id!==target?.dataset?.spellId);
      } else if (action === "builder-remove-item") {
        const index = Number(target?.dataset?.builderIndex); if (Number.isInteger(index) && index >= 0 && index < draft.inventory.length) draft.inventory.splice(index,1);
      } else if (action === "builder-finish") {
        if (step !== steps.length-1) return true;
        const result = rules.reconcile(copy(draft)); open = false; draft = null; onFinish(result,isNew); return true;
      } else return false;
      render(); return true;
    }
    return Object.freeze({start,handleInput,handleChange,handleAction,isOpen:() => open,cancel});
  }
  globalThis.CharacterBuilder = Object.freeze({create});
})();
