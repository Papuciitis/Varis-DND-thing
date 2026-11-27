"use strict";

(async () => {
  const loader = globalThis.DndCatalog;
  if (loader) {
    document.querySelector(".sheet-shell").inert = true;
    document.querySelector(".app-header").inert = true;
    document.getElementById("save-status").textContent = "Loading character rules…";
    try {
      globalThis.DND_CATALOG = await loader.ready;
      const [metadata] = await Promise.all([loader.loadBuilder(), ...["classes", "races", "items", "feats", "backgrounds"].map(key => loader.loadSection(key))]);
      globalThis.DND_CHARACTER_RULES = metadata;
      globalThis.DND_RULES_VERSION = loader.version;
    } catch (error) {
      const main = document.querySelector(".sheet-shell");
      main.inert = false;
      main.innerHTML = '<section class="panel"><h1>Character rules could not load</h1><p id="load-error"></p><p><a class="button" href="character.html">Retry</a> <a class="button" href="offline/character.html">Open portable copy</a></p></section>';
      document.getElementById("load-error").textContent = error.message;
      return;
    }
    document.getElementById("save-status").textContent = "Autosaves on this device";
  }
  const State = globalThis.CharacterState;
  for(const section of globalThis.DND_CATALOG || [])globalThis.MagicItems?.apply(section);
  const Rules = globalThis.CharacterRules.create(globalThis.DND_CHARACTER_RULES || {}, globalThis.DND_CATALOG || []);
  const Order = globalThis.EntryOrder;
  const storageKey = "vara.character-sheets.v1";
  const currentRules = globalThis.DND_RULES_VERSION || "vara-rules-prototype";
  const abilityNames = {str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma"};
  const skills = {
    Athletics: "str", Stamina: "str", Acrobatics: "dex", "Sleight of Hand": "dex", Stealth: "dex", Instinct: "con",
    Arcana: "int", History: "int", Investigation: "int", Nature: "int", Religion: "int", Mechanism: "int",
    "Animal Handling": "wis", Insight: "wis", Medicine: "wis", Perception: "wis", Survival: "wis",
    Deception: "cha", Intimidation: "cha", Performance: "cha", Persuasion: "cha"
  };
  const resourceNames = {hp: "Hit points", arcaneHealth: "Arcane Health", tempHP: "Temporary HP", block: "Block", tempBlock: "Temp Block"};
  let catalog;
  let dialogGeneration = 0;
  const entries = new Map();
  function refreshCatalog() {
    for(const section of globalThis.DND_CATALOG || [])globalThis.MagicItems?.apply(section);
    catalog = (globalThis.DND_CATALOG || []).flatMap(section => section.entries.map(entry => {
      const indexed = {...entry, section: section.key, sectionTitle: section.title,
        entryId: globalThis.MagicItems?.entryId(section.key,entry) || JSON.stringify([section.key, entry.group, entry.name])};
      const magic = section.key === "magic-items";
      indexed.magicCategory = magic ? globalThis.MagicCategories?.category(indexed) || "" : "";
      indexed.magicCategoryTitle = magic ? globalThis.MagicCategories?.categories.find(category => category.key === indexed.magicCategory)?.title || "" : "";
      indexed.searchText = (entry.name + " " + entry.group + " " + JSON.stringify(magic && globalThis.MagicItems ? globalThis.MagicItems.searchable(entry) : entry.details)
        + (magic ? " magic item magic items " + (globalThis.MagicCategories?.searchTerms(indexed) || "") : "")).toLowerCase();
      return indexed;
    }));
    entries.clear();
    for (const entry of catalog) entries.set(entry.entryId, entry);
  }
  refreshCatalog();
  function withSections(keys, continuation, dialogRequest = false) {
    if (!loader || keys.every(key => loader.isLoaded(key))) return continuation();
    const generation = dialogRequest ? ++dialogGeneration : null;
    notify("Loading rules…");
    return Promise.all(keys.map(key => loader.loadSection(key))).then(() => {
      refreshCatalog();
      notify("Rules loaded.");
      if (!dialogRequest || generation === dialogGeneration) return continuation();
    }).catch(error => notify(error.message + " Try the action again to retry."));
  }
  function referenceSections(characters) {
    const keys = new Set();
    for (const sheet of characters) for (const list of [sheet.spells, sheet.features, sheet.inventory]) {
      for (const item of list || []) {
        try { const key = JSON.parse(item.entryId)[0]; if (globalThis.DND_CATALOG.some(section => section.key === key)) keys.add(key); } catch {}
      }
    }
    return [...keys];
  }
  const byId = id => document.getElementById(id);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char]));
  const signed = value => Number(value) >= 0 ? "+" + Number(value) : String(value);
  const uid = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  const labelize = value => String(value).replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
  let activeTab = "sheet";
  let library = [];
  let character;
  let saveTimer;
  let toastTimer;
  let storageAvailable = true;
  let dirty = false;
  let catalogKind = "spells";
  let catalogLimit = 30;
  let spellSort = "level-asc";
  let spellFilter = "";
  let catalogSpellAll = false;
  const spellCastChoices = new Map();
  let featureSort = "level-asc";
  let gearQuery = "";
  const catalogPreferences = {spells:{sort:"level-asc",level:""},inventory:{sort:"name",level:""},features:{sort:"name",level:""}};
  const healthAdjustment = {pool: "hp", amount: 1};
  const expanded = new Set();
  const baselines = new Map();
  let computed;
  const values = () => computed ||= Rules.derive(character);
  const Wizard = globalThis.CharacterBuilder?.create({rules:Rules,show:openDialog,renderRule:ruleContent,
    onCancel:() => { byId("editor-dialog").close(); },
    onFinish:(draft,isNew) => {
      character=Rules.reconcile(draft);computed=null;
      if(isNew)library.push(character);
      healthAdjustment.pool="auto";commit();byId("editor-dialog").close();render();
    }});

  function notify(message) {
    byId("toast").textContent = message;
    byId("toast").hidden = false;
    const dialogMessage = byId("dialog-message");
    if (dialogMessage) dialogMessage.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { byId("toast").hidden = true; }, 6500);
  }

  function load() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.version !== 1 || !Array.isArray(parsed.characters)) throw new Error("Unsupported device save.");
        for (const item of parsed.characters) {
          try {
            const normalized = State.normalizeCharacter(item);
            library.push(normalized);
            baselines.set(normalized.id, JSON.stringify(normalized));
          }
          catch (error) { storageAvailable = false; }
        }
        if (!storageAvailable) notify("Some device saves could not be read. Working characters are available. Use Save backup to preserve your changes.");
        character = library.find(item => item.id === parsed.activeId) || library[0];
      }
    } catch (error) {
      storageAvailable = false;
      notify("Device saves are unavailable. Use Save backup to keep your character.");
    }
    if (!character) {
      character = State.createCharacter();
      library.push(character);
      dirty = true;
    }
  }

  function persist() {
    clearTimeout(saveTimer);
    if (!dirty) return;
    character=Rules.reconcile(character);computed=null;
    character.updatedAt = new Date().toISOString();
    const index = library.findIndex(item => item.id === character.id);
    if (index < 0) library.push(character);
    else library[index] = character;
    if (!storageAvailable) return;
    let conflictCopy = false;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const stored = JSON.parse(saved);
        if (stored.version !== 1 || !Array.isArray(stored.characters)) throw new Error("Unsupported device save.");
        const latest = new Map(stored.characters.map(item => {
          const normalized = State.normalizeCharacter(item);
          return [normalized.id, normalized];
        }));
        const remote = latest.get(character.id);
        if (remote && baselines.has(character.id) && JSON.stringify(remote) !== baselines.get(character.id)) {
          character = {...character, id: uid(), name: (character.name || "Unnamed character") + " (local copy)"};
          conflictCopy = true;
          notify("This character changed in another tab. Your edits were saved as a separate copy.");
        }
        for (const item of library) if (!latest.has(item.id)) latest.set(item.id, item);
        latest.set(character.id, character);
        library = [...latest.values()];
      }
      localStorage.setItem(storageKey, JSON.stringify({version: 1, activeId: character.id, characters: library}));
      baselines.set(character.id, JSON.stringify(character));
      if (conflictCopy) {
        const nameInput = byId("character-name");
        const selection = document.activeElement === nameInput ? [nameInput.selectionStart, nameInput.selectionEnd] : null;
        renderHeader();
        if (selection && nameInput.setSelectionRange) nameInput.setSelectionRange(...selection);
      }
      byId("save-status").textContent = "Saved on this device";
      dirty = false;
    } catch (error) {
      storageAvailable = false;
      byId("save-status").textContent = "Use Save backup to keep changes";
      notify("Your browser could not save these changes. Download a backup to keep them.");
    }
  }

  function scheduleSave() {
    dirty = true;
    byId("save-status").textContent = storageAvailable ? "Saving…" : "Use Save backup to keep changes";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
  }

  function commit() {
    dirty = true;
    persist();
  }

  function selectCharacter(id) {
    persist();
    if (storageAvailable) {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        if (saved?.version === 1 && Array.isArray(saved.characters)) {
          library = saved.characters.map(item => State.normalizeCharacter(item));
          saved.activeId = id;
          localStorage.setItem(storageKey, JSON.stringify(saved));
        }
      } catch (error) {
        storageAvailable = false;
        notify("Device saves are unavailable. Use Save backup to keep your character.");
      }
    }
    character = library.find(item => item.id === id) || character;
    baselines.set(character.id, JSON.stringify(character));
    character = Rules.reconcile(character);
    render();
  }

  function getPath(path) {
    return path.split(".").reduce((value, key) => value?.[key], character);
  }

  function setPath(path, value) {
    computed=null;
    const keys = path.split(".");
    const last = keys.pop();
    let target = character;
    for (const key of keys) {
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      target = target[key];
    }
    target[last] = value;
    if (keys[0] === "resources" || keys[0] === "restDice" || keys[0] === "customResources" || keys[0] === "spellSlots") {
      if (last === "current" && target.current > target.max) target.max = target.current;
      if (last === "max" && target.current > target.max) target.current = target.max;
    }
  }

  function field(text, path, type = "text", options = {}) {
    const value = getPath(path) ?? "";
    const extra = Object.entries(options).map(([name, content]) => `${name}="${escape(content)}"`).join(" ");
    return `<label class="field"><span>${escape(text)}</span><input type="${type}" data-path="${escape(path)}" value="${escape(value)}" ${type === "number" ? 'inputmode="numeric"' : 'maxlength="200"'} ${extra}></label>`;
  }

  function numberField(text, path, options = {}) {
    return field(text, path, "number", {min: 0, max: 1000000, step: 1, ...options});
  }

  function textArea(text, path, rows = 3) {
    return `<label class="field field-wide"><span>${escape(text)}</span><textarea data-path="${escape(path)}" rows="${rows}" maxlength="100000">${escape(getPath(path))}</textarea></label>`;
  }

  function selectField(text, path, options, className = "", numeric = false) {
    const value = String(getPath(path) ?? "");
    return `<label class="field ${className}"><span>${escape(text)}</span><select data-path="${escape(path)}"${numeric ? ' data-number="true"' : ""}>${options.map(([key, label]) => `<option value="${escape(key)}" ${String(key) === value ? "selected" : ""}>${escape(label)}</option>`).join("")}</select></label>`;
  }

  function button(text, action, attributes = "", className = "") {
    return `<button type="button" class="button ${className}" data-action="${action}" ${attributes}>${escape(text)}</button>`;
  }

  function panel(title, content, tools = "", className = "") {
    return `<section class="panel ${className}"><header class="panel-heading"><h2 class="panel-title">${escape(title)}</h2><div class="panel-tools">${tools}</div></header>${content}</section>`;
  }

  function empty(title, text, action) {
    return `<div class="empty-state"><p class="empty-title">${escape(title)}</p><p>${escape(text)}</p>${action}</div>`;
  }

  function proficiency() {
    return values().proficiency;
  }

  function passivePerception() {
    const d=values(),rank = d.skillRanks.Perception || 0;
    const adjustment = d.skillBonuses.Perception || 0;
    return character.combat.passivePerceptionOverride ?? 10 + State.abilityModifier(d.abilities.wis) + rank * proficiency() + adjustment;
  }

  function renderHeader() {
    byId("character-name").value = character.name;
    byId("character-subtitle").textContent = ["Level " + character.level, character.className || "Choose a class", character.ancestry].filter(Boolean).join(" · ");
    document.title = (character.name || "Character sheet") + " · Varis DnD";
    byId("character-picker").innerHTML = library.map(item => `<option value="${escape(item.id)}" ${item.id === character.id ? "selected" : ""}>${escape(item.name || "Unnamed character")}</option>`).join("");
    const built = !!character.build?.enabled;
    byId("edit-build").textContent = built ? "Edit build" : "Build character";
    byId("edit-build").className = "button button-small" + (built ? " button-quiet" : " button-primary");
    byId("edit-identity").hidden = built;
    if (!storageAvailable) byId("save-status").textContent = "Use Save backup to keep changes";
  }

  function refreshCalculations() {
    const d=values();
    const setRoll = (node, bonus) => { node.textContent = signed(bonus); node.dataset.bonus = String(bonus); };
    document.querySelectorAll("[data-ability-roll]").forEach(node => setRoll(node, State.abilityModifier(d.abilities[node.dataset.abilityRoll])));
    document.querySelectorAll("[data-save-roll]").forEach(node => {
      const key = node.dataset.saveRoll;
      setRoll(node, State.abilityModifier(d.abilities[key]) + (d.saves[key] ? proficiency() : 0) + (d.saveBonuses[key] || 0));
    });
    document.querySelectorAll("[data-skill-roll]").forEach(node => {
      const name = node.dataset.skillRoll;
      setRoll(node, State.abilityModifier(d.abilities[skills[name]]) + (d.skillRanks[name] || 0) * proficiency() + (d.skillBonuses[name] || 0));
    });
    const totals = {armorClass:d.armorClass, initiative:signed(d.initiative), speed:d.speed + " ft", proficiency:signed(proficiency()),passivePerception:passivePerception()};
    document.querySelectorAll("[data-combat-value]").forEach(node => { node.textContent = totals[node.dataset.combatValue]; });
    document.querySelectorAll("[data-effective-score]").forEach(node=>{node.textContent=d.abilities[node.dataset.effectiveScore];});
    document.querySelectorAll("[data-pool-maximum]").forEach(node=>{node.textContent=character.resources[node.dataset.poolMaximum].max;});
    document.querySelectorAll("[data-training-save], [data-training-skill]").forEach(node=>{
      const rank=node.dataset.trainingSave?Number(!!d.saves[node.dataset.trainingSave]):d.skillRanks[node.dataset.trainingSkill]||0;
      node.className="training-mark"+(rank?" trained":"")+(rank===2?" expert":"");
      node.setAttribute("aria-label",rank===2?"Expertise":rank?"Proficient":"Untrained");
    });
    const attacks=byId("derived-attacks");if(attacks)attacks.innerHTML=derivedAttacks();
    document.querySelectorAll("[data-resource-meter]").forEach(node => {
      const pool = character.resources[node.dataset.resourceMeter];
      node.style.width = (pool.max ? Math.min(100, pool.current / pool.max * 100) : 0) + "%";
    });
    document.querySelectorAll("input[data-path]").forEach(node => {
      if (node !== document.activeElement && node.type === "number") node.value = getPath(node.dataset.path) ?? "";
    });
    document.querySelectorAll("[data-slot-index]").forEach(node => {
      const level = character.spellSlots[Number(node.dataset.slotIndex)].level;
      const spend = node.querySelector('[data-action="resource"]');
      spend.dataset.key = "slot:" + level;
      spend.setAttribute("aria-label", "Spend a level " + level + " slot");
    });
    byId("character-subtitle").textContent = ["Level " + character.level, character.className || "Choose a class", character.ancestry].filter(Boolean).join(" · ");
    const option = byId("character-picker").querySelector("option:checked");
    if (option) option.textContent = character.name || "Unnamed character";
    document.title = (character.name || "Character sheet") + " · Varis DnD";
  }

  function resourceCard(key) {
    const resource = character.resources[key];
    const percentage = resource.max ? Math.min(100, resource.current / resource.max * 100) : 0;
    return `<section class="resource-card ${key === "hp" ? "health-card" : ""}" data-pool="${key}"><h3 class="resource-label">${resourceNames[key]}</h3>
      <div class="resource-reading">
      <label class="resource-value"><span class="sr-only">Current ${resourceNames[key]}</span><input type="number" inputmode="numeric" min="0" max="1000000" data-path="resources.${key}.current" value="${resource.current}"></label>
      <span class="resource-divider" aria-hidden="true">/</span><span class="resource-max"><span class="resource-max-label">maximum</span><strong data-pool-maximum="${key}">${resource.max}</strong></span>
      <div class="resource-adjusters">${button("−", "resource", `data-key="${key}" data-delta="-1" aria-label="Decrease ${resourceNames[key]}"`, "counter-button")}${button("+", "resource", `data-key="${key}" data-delta="1" aria-label="Increase ${resourceNames[key]}"`, "counter-button")}</div></div>
      <div class="meter" aria-hidden="true"><span class="meter-fill" data-resource-meter="${key}" style="width:${percentage}%"></span></div></section>`;
  }

  function poolSettings(keys) {
    return `<details class="quiet-disclosure" data-expanded="pools-${keys[0]}" ${expanded.has("pools-"+keys[0])?'open':''}><summary>Set pool maximums</summary><div class="form-grid">${keys.map(key=>numberField(resourceNames[key],`resources.${key}.max`,values().enabled&&["hp","block"].includes(key)?{readonly:"readonly"}:{})).join("")}</div>${values().enabled?'<p class="section-note">HP and Block maximums follow your build. Use Edit build or combat adjustments to change them.</p>':''}</details>`;
  }

  function abilityPanel() {
    const d=values();
    const abilities = `<div class="abilities-grid">${Object.entries(abilityNames).map(([key, name]) => `<div class="ability"><span class="ability-label">${escape(name)}</span>${button(signed(State.abilityModifier(d.abilities[key])), "roll", `data-ability-roll="${key}" data-label="${escape(name)} check" data-bonus="${State.abilityModifier(d.abilities[key])}" aria-label="Roll ${escape(name)} check"`, "ability-mod")}<span class="ability-total">Score <strong data-effective-score="${key}">${d.abilities[key]}</strong></span></div>`).join("")}</div><details class="quiet-disclosure" data-expanded="ability-edit" ${expanded.has("ability-edit")?'open':''}><summary>Adjust base scores</summary><div class="form-grid">${Object.entries(abilityNames).map(([key,name])=>numberField(name,`abilities.${key}`,{max:100})).join("")}</div></details>`;
    const saves = Object.entries(abilityNames).map(([key, name]) => {
      const bonus = State.abilityModifier(d.abilities[key]) + (d.saves[key] ? proficiency() : 0) + (d.saveBonuses[key] || 0);
      return `<div class="save-row play-row"><span class="skill-name"><span class="training-mark ${d.saves[key]?'trained':''}" data-training-save="${key}" aria-label="${d.saves[key]?'Proficient':'Untrained'}"></span>${name}</span>${button(signed(bonus), "roll", `data-save-roll="${key}" data-label="${name} saving throw" data-bonus="${bonus}" aria-label="Roll ${name} saving throw"`, "skill-bonus")}</div>`;
    }).join("");
    const saveSettings=Object.entries(abilityNames).map(([key,name])=>`<div class="save-row"><label class="check-label"><input type="checkbox" data-path="training.saves.${key}" ${d.saves[key]?'checked':''} ${d.saves[key]&&!character.training.saves[key]?'disabled':''}>${name}</label><input class="bonus-input" type="number" inputmode="numeric" data-path="training.saveBonuses.${key}" value="${character.training.saveBonuses?.[key]||0}" aria-label="Additional ${name} save bonus" min="-1000" max="1000"></div>`).join("");
    const skillRows = Object.entries(skills).map(([name, ability]) => {
      const rank = d.skillRanks[name] || 0;
      const bonus = State.abilityModifier(d.abilities[ability]) + rank * proficiency() + (d.skillBonuses[name] || 0);
      return `<div class="skill-row play-row"><span class="skill-name"><span class="training-mark ${rank?'trained':''} ${rank===2?'expert':''}" data-training-skill="${escape(name)}" aria-label="${rank===2?'Expertise':rank?'Proficient':'Untrained'}"></span>${escape(name)}<small class="skill-ability">${ability.toUpperCase()}</small></span>${button(signed(bonus), "roll", `data-skill-roll="${escape(name)}" data-label="${escape(name)}" data-bonus="${bonus}" aria-label="Roll ${escape(name)}"`, "skill-bonus")}</div>`;
    }).join("");
    const skillSettings=Object.entries(skills).map(([name])=>{const rank=d.skillRanks[name]||0;return `<div class="skill-settings-row"><label class="field"><span>${escape(name)}</span><select class="training-select" data-path="training.skills.${escape(name)}" data-number="true" aria-label="${escape(name)} training"><option value="0" ${rank===0?'selected':''}>Untrained</option><option value="1" ${rank===1?'selected':''}>Proficient</option><option value="2" ${rank===2?'selected':''}>Expertise</option></select></label><input class="bonus-input" type="number" inputmode="numeric" min="-1000" max="1000" data-path="training.skillBonuses.${escape(name)}" value="${character.training.skillBonuses?.[name]||0}" aria-label="Additional ${escape(name)} bonus"></div>`;}).join("");
    return `<aside class="ability-panel">${panel("Ability scores", abilities)}<details class="panel disclosure" data-expanded="saves" ${expanded.has("saves") ? "open" : ""}><summary>Saving throws</summary>${saves}<details class="quiet-disclosure"><summary>Adjust save training</summary>${saveSettings}</details></details><details class="panel disclosure" data-expanded="skills" ${expanded.has("skills") ? "open" : ""}><summary>Skills</summary><div class="skill-list">${skillRows}</div><details class="quiet-disclosure"><summary>Adjust skill training</summary><p class="section-note">Training and additional bonuses.</p>${skillSettings}</details></details></aside>`;
  }

  function derivedAttacks() {
    return values().attacks.map(attack=>`<article class="list-card"><div class="attack-row"><div><h3 class="attack-name">${escape(attack.name)}</h3><p class="attack-damage">${escape(attack.damage)}</p></div>${button(signed(attack.bonus),"roll",`data-label="${escape(attack.name)} attack" data-bonus="${attack.bonus}" aria-label="Roll ${escape(attack.name)} attack"`)}</div><p class="list-card-meta">From equipped gear · ${escape(attack.ability?.toUpperCase() || '')} · ${attack.trained?'Proficient':'Untrained'} · Block DC ${attack.blockDC}</p><p>${escape(attack.properties)}</p>${attack.notes?`<p class="section-note">${escape(attack.notes)}</p>`:''}${attack.maneuvers?`<details class="detail-section"><summary>Weapon manoeuvres</summary>${ruleContent(attack.maneuvers)}</details>`:''}</article>`).join('');
  }

  function spellUseControls(item, index) {
    const casting=globalThis.CharacterCasting, entry=entries.get(item.entryId), d=values();
    if(!entry) return '<p class="section-note">Custom spell: record its costs with your manual trackers.</p>';
    const choices=casting.castOptions(character,d,entry,item),key=character.id+':'+item.id;
    const selected=choices.find(choice=>choice.id===spellCastChoices.get(key)) || choices.find(choice=>choice.available) || choices[0];
    const info=casting.spellInfo(entry,d.casting?.profile?.tradition);
    const modifier=State.abilityModifier(d.abilities[d.castingAbility] ?? 10);
    const attackBonus=character.combat.spellAttackOverride ?? proficiency()+modifier+character.combat.spellAttackBonus;
    const saveDC=character.combat.spellSaveOverride ?? 8+proficiency()+(d.cls?.name==='Wizard'?Math.max(0,modifier):modifier)+character.combat.spellSaveBonus;
    const spellCheck=info.simpleAttack?`<p class="list-card-meta">${/spell attack/i.test(entry.details.effect)?'Spell attack '+signed(attackBonus):/save/i.test(entry.details.effect)?'Spell save DC '+saveDC:''}</p>`:'';
    const quick=item.onBar ?? info.simpleAttack;
    const emptyReason=d.cls?.name==='Wizard' && !info.cantrip && !item.prepared?'Prepare this spell before casting.':info.hex && d.casting?.profile?.tradition!=='any'?'Apply this hex’s listed costs using its feature or manual trackers.':'No compatible casting resource is configured.';
    return `<div class="spell-use" data-spell-card="${escape(item.id)}">${spellCheck}<div class="spell-cast-controls">${choices.length?`<label class="field"><span>Casting level / resource</span><select data-spell-option data-spell-id="${escape(item.id)}">${choices.map(choice=>`<option value="${escape(choice.id)}" ${choice.id===selected?.id?'selected':''} ${choice.available?'':'disabled'}>${escape(choice.label)}</option>`).join('')}</select></label>${button(info.cantrip?'Cast cantrip':'Cast spell','cast-known-spell',`data-spell-id="${escape(item.id)}" ${selected?.available?'':'disabled'}`,'button-primary')}`:`<p class="section-note">${escape(emptyReason)}</p>`}</div><label class="check-label spell-pin"><input type="checkbox" data-path="spells.${index}.onBar" ${quick?'checked':''}>Quick action on main sheet</label></div>`;
  }

  function renderQuickSpells() {
    const casting=globalThis.CharacterCasting;
    const rows=character.spells.map((item,index)=>({item,index,entry:entries.get(item.entryId)})).filter(({item,entry})=>entry && item.prepared && (item.onBar ?? casting.spellInfo(entry,values().casting?.profile?.tradition).simpleAttack) && (!item.classId || item.classId===values().cls?.id));
    if(!rows.length)return '';
    return panel('Spell actions',`<div class="quick-spells">${rows.map(({item,index,entry})=>`<article class="list-card quick-spell"><h3>${escape(item.name)}</h3><p class="list-card-meta">${escape([entryLevelLabel(entry),entry.details.casting,entry.details.range].filter(Boolean).join(' · '))}</p>${spellUseControls(item,index)}${button('Read spell rules','read-rule',`data-entry-id="${escape(item.entryId)}"`,'button-quiet button-small')}</article>`).join('')}</div><p class="section-note">Casting spends the selected resource. Full effects, higher-level rules and other spells are on the Spells page.</p>`);
  }

  function renderAttacks() {
    if(values().attacks.length && !character.attacks.length)return `<p class="section-note">Equipped attacks update with your abilities and training.</p>${button('Add custom attack','add-attack')}`;
    return character.attacks.length ? `<div class="list">${character.attacks.map((attack, index) => `<article class="list-card"><div class="attack-row"><div><h3 class="attack-name">${escape(attack.name)}</h3><p class="attack-damage">${escape(attack.damage || "Set damage in Edit")}</p></div>${button(signed(attack.bonus), "roll", `data-label="${escape(attack.name)} attack" data-bonus="${attack.bonus}" aria-label="Roll ${escape(attack.name)} attack"`)}${button("Edit", "edit-attack", `data-index="${index}"`, "button-quiet")}</div>${attack.maneuver ? `<p class="preserve-lines"><strong>Manoeuvre</strong> · ${escape(attack.maneuver)}</p>` : ""}${attack.notes ? `<p class="preserve-lines">${escape(attack.notes)}</p>` : ""}</article>`).join("")}</div>` : empty("Ready your first attack", "Add the attack bonus and damage from your weapon, spell, or feature.", button("Add attack", "add-attack", "", "button-primary"));
  }

  function renderCustomResources() {
    return character.customResources.length ? `<div class="list">${character.customResources.map((resource, index) => `<div class="list-card resource-form"><label class="field"><span>Resource</span><input data-path="customResources.${index}.name" value="${escape(resource.name)}" maxlength="100"></label><div class="inline-fields">${numberField("Current", `customResources.${index}.current`)}${numberField("Maximum", `customResources.${index}.max`)}</div><div class="entry-actions">${button("−1", "resource", `data-key="custom:${escape(resource.id)}" data-delta="-1" aria-label="Spend one ${escape(resource.name)}"`)}${button("+1", "resource", `data-key="custom:${escape(resource.id)}" data-delta="1" aria-label="Recover one ${escape(resource.name)}"`)}${button("Remove", "remove", `data-list="customResources" data-index="${index}"`, "button-quiet")}</div></div>`).join("")}</div>` : `<p class="section-note">Add fatigue, mana, charges, or other resources your character uses.</p>`;
  }

  function renderSheet() {
    const d=values();
    const combat = character.combat;
    const initiative = d.initiative;
    const stats = [["armorClass", d.armorClass, "Armour class"], ["initiative", signed(initiative), "Initiative"], ["speed", d.speed + " ft", "Speed"], ["proficiency", signed(proficiency()), "Proficiency"], ["passivePerception", passivePerception(), "Passive Perception"]];
    const combatStrip = `<div class="combat-strip">${stats.map(([key, value, label]) => `<div class="combat-stat"><span class="combat-value" data-combat-value="${key}">${escape(value)}</span><span class="combat-label">${label}</span></div>`).join("")}<label class="combat-stat check-label inspiration-toggle"><input type="checkbox" data-path="inspiration" ${character.inspiration ? "checked" : ""}>Inspiration</label></div>`;
    const resources = `<div class="health-pools">${resourceCard("hp")}</div>`;
    const wardKeys=["arcaneHealth","tempHP"], activeWards=wardKeys.filter(key=>character.resources[key].current||character.resources[key].max), unusedWards=wardKeys.filter(key=>!activeWards.includes(key));
    const wards = `<div class="ward-pools">${activeWards.map(resourceCard).join("")}</div><details class="quiet-disclosure" data-expanded="extra-health" ${expanded.has("extra-health")?'open':''}><summary>Health pools & maximums</summary>${unusedWards.length?`<div class="ward-pools">${unusedWards.map(resourceCard).join("")}</div>`:''}${poolSettings(["hp",...wardKeys])}</details>`;
    const pools=d.enabled?["auto","hp","arcaneHealth","tempHP"]:["hp","arcaneHealth","tempHP"];
    const quickHealth = `<div class="quick-health"><label class="field"><span>Health pool</span><select id="health-pool">${pools.map(key=>`<option value="${key}" ${healthAdjustment.pool===key?'selected':''}>${key==='auto'?'Automatic damage order':resourceNames[key]}</option>`).join('')}</select></label><label class="field"><span>Amount</span><input id="health-amount" type="number" inputmode="numeric" min="1" max="1000000" value="${healthAdjustment.amount}"></label>${button("Damage","health",'data-sign="-1"','button-danger')}${button("Heal","health",'data-sign="1"','button-primary')}</div>${d.enabled?`<details class="damage-options" data-expanded="damage-options" ${expanded.has("damage-options")?'open':''}><summary>Damage options</summary><p class="section-note">Damage uses Arcane Health, then Temporary HP, then HP. For healing, choose the pool to restore.</p><div class="form-grid"><label class="field"><span>Damage type (for reduction)</span><select id="damage-type"><option value="">Untyped / already adjusted</option>${['bludgeoning','piercing','slashing','fire','cold','acid','lightning','sonic','poison','necrotic','radiant','psychic','force'].map(t=>`<option>${t}</option>`).join('')}</select></label><label class="check-label"><input id="damage-half" type="checkbox">Apply half damage (resistance)</label></div></details>`:''}`;
    const temporaryBlock=character.resources.tempBlock.current||character.resources.tempBlock.max;
    const blocks = `<div class="defence-pools">${resourceCard("block")}${temporaryBlock?resourceCard("tempBlock"):''}</div><div class="entry-actions defence-actions">${button("Use Block", "resource", 'data-key="block" data-delta="-1"', "button-primary")}${button("Use 2", "resource", 'data-key="block" data-delta="-2"')}${button("Grant Temp Block", "grant-temp", "", "button-quiet")}</div><details class="quiet-disclosure" data-expanded="block-settings" ${expanded.has("block-settings")?'open':''}><summary>Pool adjustments</summary>${temporaryBlock?'':`<div class="defence-pools">${resourceCard("tempBlock")}</div>`}${poolSettings(["block","tempBlock"])}</details>`;
    const rest = `<div class="form-grid">${field("Rest die size", "restDice.die", "text", {placeholder: "d6"})}${numberField("Rest dice available", "restDice.current")}${numberField("Rest dice maximum","restDice.max",d.enabled?{readonly:'readonly'}:{})}</div>${d.enabled?`<ul class="rest-dice-breakdown">${d.restBreakdown.map(item=>`<li>${escape(item.label)}: ${signed(item.amount)}</li>`).join('')}</ul>${d.restWarnings.map(warning=>`<p class="section-note">${escape(warning)}</p>`).join('')}<details class="quiet-disclosure"><summary>Table adjustments</summary>${selectField('Rest dice base','build.health.restMode',[['level','One per character level'],['manual','Manual base override']])}${character.build.health.restMode==='manual'?numberField('Manual base rest dice','build.health.baseRestDice'):''}${numberField('Additional rest dice adjustment','build.health.restAdjustment',{min:-1000000,max:1000000})}</details>`:''}<div class="entry-actions">${button("Spend 1 rest die", "resource", 'data-key="restDice" data-delta="-1"')}${button("Recover 1 rest die", "resource", 'data-key="restDice" data-delta="1"')}</div>`;
    const deathSaves = `<div class="death-save-tracks">${[['successes','Successes'],['failures','Failures']].map(([key,label])=>`<div class="death-save-track"><span>${label}</span><div class="death-save-dots" role="group" aria-label="Death save ${key}">${Array.from({length:d.deathSaveSlots},(_,index)=>`<button type="button" class="death-save-dot ${key==='failures'?'failure':''}" data-action="death-save-dot" data-save-kind="${key}" data-save-count="${index+1}" aria-label="${label}: ${index+1} of ${d.deathSaveSlots}" aria-pressed="${character.deathSaves[key]>index}"></button>`).join('')}</div></div>`).join('')}</div>${d.deathSaveBonus?`<p class="section-note">Death saving throw bonus ${signed(d.deathSaveBonus)}</p>`:''}`;
    const conditionChips = character.conditions.length ? `<div class="condition-chips">${character.conditions.map((condition, index) => `<span class="pill">${escape(condition)}${button("×", "remove-condition", `data-index="${index}" aria-label="Remove ${escape(condition)}"`, "button-quiet button-small")}</span>`).join("")}</div>` : `<p class="section-note">No conditions recorded.</p>`;
    const defence = blocks + (d.enabled?`<p class="block-check">Block check <strong>${signed(d.blockCheck)}</strong><span>${escape(d.gear.blockCheckAbility?.toUpperCase())}</span></p><div class="entry-actions combat-actions">${button("Start combat","start-combat",'aria-label="Roll initiative and start combat"')}${button("End combat","end-combat")}</div>`:"") + `<details class="quiet-disclosure rules-hint" data-expanded="recovery" ${expanded.has("recovery")?'open':''}><summary>Rest & recovery</summary>${d.enabled?`<div class="entry-actions rest-actions">${button("Short rest","short-rest")}${button("Long rest","long-rest")}</div>`:''}<p class="section-note">Each Block attempt is spent even if its defence check fails. Temp Block is spent before regular Block; keep the higher grant and track its expiry. Adjust Arcane Health according to the effect's rules.</p>${d.enabled?`<p class="section-note">${escape(d.hpExplanation)}. Rests recover Block and Fatigue; apply other recovery from the relevant feature.</p>${numberField("Fatigue", "build.health.fatigue", {max:10})}`:""}</details>`;
    const secondary = renderQuickSpells() + `<div class="overview-secondary"><details class="panel disclosure" data-expanded="death-saves" ${expanded.has("death-saves")?'open':''}><summary>Death saves</summary>${deathSaves}</details><details class="panel disclosure" data-expanded="rest-dice" ${expanded.has("rest-dice")?'open':''}><summary>Rest dice</summary>${rest}</details></div>`;
    byId("pane-sheet").innerHTML = `<div class="sheet-layout"><div class="main-panel">${combatStrip}<div class="vital-layout">${panel("Health", resources + quickHealth + wards, "", "health-panel")}${panel("Block & defence", defence, button("Adjust", "combat", "", "button-quiet button-small"), "defence-panel")}</div>${panel("Attacks & actions", `<div class="list" id="derived-attacks">${derivedAttacks()}</div>` + renderAttacks() + `<details class="quiet-disclosure"><summary>Known manoeuvres</summary>${textArea("Known manoeuvres", "maneuvers")}</details>`, character.attacks.length ? button("Add attack", "add-attack", "", "button-small") : "", "attacks-panel")}${secondary}${panel("Class resources", renderCustomResources(), button("Add resource", "add-resource", "", "button-small"))}${panel("Conditions", conditionChips, button("Add condition", "condition", "", "button-small"))}</div>${abilityPanel()}</div>`;
  }

  function referenceActions(item, list, index) {
    const found = item.entryId && entries.has(item.entryId);
    let pending = false;
    try { pending = loader && !loader.isLoaded(JSON.parse(item.entryId)[0]); } catch {}
    const missing = item.entryId && !found ? `<p class="source-warning">${pending ? "This rule has not loaded yet. Try adding from rules to retry." : "This rule is missing from this rules snapshot. Your saved name and notes are preserved."}</p>` : "";
    return missing + `<div class="entry-actions">${found ? button("Read rule", "read-rule", `data-entry-id="${escape(item.entryId)}"`, "button-small") : ""}${button("Edit", "edit-item", `data-list="${list}" data-index="${index}"`, "button-quiet button-small")}</div>`;
  }

  function sortField(id, value, level=true) {
    const options = level ? [["level-asc","Level: low to high"],["level-desc","Level: high to low"],["name","Name: A–Z"]] : [["name","Name: A–Z"]];
    return `<label class="field"><span>Sort by</span><select id="${id}">${options.map(([key,label])=>`<option value="${key}" ${value===key?'selected':''}>${label}</option>`).join("")}</select></label>`;
  }

  function entryLevelLabel(entry) {
    const level = Order.level(entry);
    return level === null ? "" : level === 0 && /\bcantrips?\b/i.test(entry?.group || "") ? "Cantrip" : "Level " + level;
  }

  function spellViewTools() {
    const levels = [...new Set(character.spells.map(item=>Order.level(entries.get(item.entryId))).filter(level=>level!==null))].sort((a,b)=>a-b);
    return `<div class="collection-tools">${sortField("spell-sort",spellSort)}<label class="field"><span>Spell level</span><select id="spell-filter"><option value="">All levels</option>${levels.map(level=>`<option value="${level}" ${String(level)===spellFilter?'selected':''}>${level===0?'Level 0 / cantrips':'Level '+level}</option>`).join("")}</select></label></div>`;
  }

  function renderCollection(list, title, description, kind) {
    let items = character[list].map((item,index)=>({item,index,rule:entries.get(item.entryId)}));
    if (list === "spells") items = items.filter(row=>!spellFilter || String(Order.level(row.rule))===spellFilter).sort((a,b)=>Order.compare({...a.rule,name:a.item.name},{...b.rule,name:b.item.name},spellSort));
    const actions = button("Add from rules", "catalog", `data-kind="${kind}"`, "button-primary") + button("Add custom", "add-item", `data-list="${list}"`);
    const body = items.length ? `<div class="list">${items.map(({item,index,rule}) => {
      let toggle = "";
      if (list === "inventory") toggle = `<div class="inline-fields"><label class="check-label"><input type="checkbox" data-path="inventory.${index}.equipped" ${item.equipped ? "checked" : ""}>Equipped</label>${globalThis.MagicItems?.requiresAttunement(rule)?`<label class="check-label"><input type="checkbox" data-path="inventory.${index}.attuned" ${item.attuned?'checked':''}>Attuned</label>`:''}${numberField("Quantity", `inventory.${index}.quantity`)}</div>`;
      if (list === "spells") toggle = `<label class="check-label"><input type="checkbox" data-path="spells.${index}.prepared" ${item.prepared ? "checked" : ""}>Readied / prepared</label>`;
      const details = rule?.details || {};
      const meta = [rule?.group, entryLevelLabel(rule), details.casting, details.range].filter(value => typeof value === "string" && value).join(" · ");
      return `<article class="list-card"><header class="list-card-header"><div><h3 class="list-card-title">${escape(item.name)}</h3>${meta ? `<p class="list-card-meta">${escape(meta)}</p>` : ""}</div>${toggle}</header>${item.notes ? `<p class="preserve-lines">${escape(item.notes)}</p>` : ""}${list==='spells'?spellUseControls(item,index):''}${referenceActions(item, list, index)}</article>`;
    }).join("")}</div>` : empty("Your " + title.toLowerCase() + " starts here", description, actions);
    return panel(title, `<p class="section-note">${escape(description)}</p>${list==='spells'&&character.spells.length?spellViewTools():''}${body}`, character[list].length ? `<div class="entry-actions">${actions}</div>` : "");
  }

  function renderSpells() {
    if (spellFilter && !character.spells.some(item=>String(Order.level(entries.get(item.entryId)))===spellFilter)) spellFilter="";
    const combat = character.combat;
    const castingAbility=values().castingAbility;
    const modifier = castingAbility ? State.abilityModifier(values().abilities[castingAbility]) : 0;
    const saveModifier = character.className.toLowerCase() === "wizard" ? Math.max(0, modifier) : modifier;
    const spellAttack = combat.spellAttackOverride ?? proficiency() + modifier + combat.spellAttackBonus;
    const spellSave = combat.spellSaveOverride ?? 8 + proficiency() + saveModifier + combat.spellSaveBonus;
    const casting = `<div class="combat-strip"><div class="combat-stat"><span class="combat-value">${castingAbility ? castingAbility.toUpperCase() : "—"}</span><span class="combat-label">Casting ability</span></div><div class="combat-stat"><span class="combat-value">${castingAbility || combat.spellAttackOverride != null ? signed(spellAttack) : "—"}</span><span class="combat-label">Spell attack</span></div><div class="combat-stat"><span class="combat-value">${castingAbility || combat.spellSaveOverride != null ? spellSave : "—"}</span><span class="combat-label">Save DC</span></div></div>`;
    const slots = character.spellSlots.length ? `<div class="list">${character.spellSlots.map((slot,index)=>({slot,index})).sort((a,b)=>a.slot.level-b.slot.level).map(({slot,index}) => `<div class="slot-row" data-slot-index="${index}">${numberField("Level", `spellSlots.${index}.level`, {min: 0, max: 20})}${numberField("Available", `spellSlots.${index}.current`)}${numberField("Maximum", `spellSlots.${index}.max`)}${button("−1", "resource", `data-key="slot:${slot.level}" data-delta="-1" aria-label="Spend a level ${slot.level} slot"`)}${button("Remove", "remove", `data-list="spellSlots" data-index="${index}"`, "button-quiet button-small")}</div>`).join("")}</div>` : `<p class="section-note">Add slots by level where your class uses them. Use named Class resources for occult slots, individual partial slots, or other spell costs.</p>`;
    const manual = values().casting?.profile ? `<details class="panel disclosure manual-casting" ${character.spellSlots.length?'open':''}><summary>Manual spell slots</summary>${slots}<div class="entry-actions">${button("Add slot level", "add-slot", "", "button-small")}</div></details>` : panel("Spell slots", slots, button("Add slot level", "add-slot", "", "button-small"));
    byId("pane-spells").innerHTML = panel("Spellcasting", casting, button("Edit spellcasting", "casting", "", "button-small")) + renderClassCasting() + manual + renderCollection("spells", "Spells", "Choose a casting level, then cast to spend its slot or rest dice. Check the spell's rules for components, additional costs and effects.", "spells");
  }

  function renderClassCasting() {
    const casting = values().casting;
    if (!casting?.profile) return "";
    const summary = [casting.maxCastLevel!==null?'Maximum spell level '+casting.maxCastLevel:'',casting.knownSpells!==null?casting.knownSpells+' spells known':'',casting.cantrips!==null?casting.cantrips+(casting.cantrips===1?' cantrip':' cantrips'):'',casting.spellbookCount!==null?casting.spellbookCount+' class-granted spellbook spells':''].filter(Boolean);
    let body = `<div id="class-casting"><p class="section-note">${escape(summary.join(' · '))}</p>`;
    if (!casting.enabled) {
      body += `<p class="section-note">${casting.needsMigration?'Your existing manual trackers are kept below. Matching spent slots are carried over when you activate class tracking.':'Class tracking is switched off. You can keep manual trackers or use your class progression.'}</p>${button("Use class slots","enable-casting","","button-primary")}`;
    } else {
      if (casting.mode==='full') body += `<div class="collection-tools">${numberField("Maximum full-slot level","build.casting.maxSlotLevel",{min:1,max:20,placeholder:casting.maxCastLevel??'From your table'})}${button("Apply level","casting-configure")}<p class="section-note">Full slots can be reduced independently by the level of the spell you cast.</p></div>`;
      body += `<div class="casting-pools">${casting.pools.map(pool=>{
        const attr = `data-pool-id="${escape(pool.id)}"`;
        const usable = pool.current!==null && pool.current>0;
        const levelOptions = ['full','rest-dice'].includes(pool.kind) && pool.level!==null ? `<label class="field"><span>Cast at level</span><select data-cast-level>${Array.from({length:Math.min(20,pool.level)},(_,index)=>`<option value="${index+1}">${index+1}</option>`).join('')}</select></label>`:'';
        return `<article class="casting-pool" ${attr}><div><h3>${escape(pool.label)}</h3>${pool.kind==='occult'?`<p class="list-card-meta">Each slot casts at level ${pool.level}</p>`:''}${pool.kind==='full'?'<p class="list-card-meta">Remaining spell levels</p>':''}</div><div class="casting-count"><strong data-casting-current>${pool.current??'—'}</strong><span> / ${pool.max??'—'}</span></div><div class="casting-controls">${levelOptions}${button(pool.kind==='full'?'Cast / reduce':pool.kind==='rest-dice'?'Cast spell':pool.kind==='points'?'Spend point':'Spend slot','casting-spend',`${attr} ${usable?'':'disabled'}`,'button-primary button-small')}${pool.kind==='full'?button('Spend whole slot','casting-whole',`${attr} ${usable?'':'disabled'}`,'button-small'):''}${button('Restore 1','casting-restore',`${attr} ${pool.max===null||pool.current===pool.max?'disabled':''}`,'button-small')}</div></article>`;
      }).join('')}</div><p class="section-note">Class capacities update with your level and selected features. Restore uses only when their recovery rules allow it. Manual trackers below are separate.</p>${button("Use manual trackers","disable-casting","","button-quiet button-small")}`;
    }
    if(casting.warnings.length)body+=`<details class="source-warning"><summary>${casting.warnings.length} casting rules to check</summary><ul>${casting.warnings.map(w=>`<li>${escape(w)}</li>`).join('')}</ul></details>`;
    if(casting.recovery.length)body+=`<details class="detail-section"><summary>Spell recovery rules</summary>${casting.recovery.map(rule=>`<h3>${escape(rule.name)}</h3>${ruleContent(rule.details)}`).join('')}</details>`;
    return panel("Class casting · "+values().cls.name,body+'</div>');
  }

  function gearGroup(item, rule) {
    if(rule?.section==="magic-items") {
      const category=rule.magicCategory || globalThis.MagicCategories?.category(rule);
      return category==="weapons"?"Weapons":category==="armor-shields"?"Armor & shields":["consumables","scrolls"].includes(category)?"Consumables":"Miscellaneous";
    }
    if(rule?.section==="items" && globalThis.ItemViews) {
      const category=globalThis.ItemViews.category(rule);
      return category==="weapons"?"Weapons":category==="armor-shields"?"Armor & shields":category==="consumables"?"Consumables":"Miscellaneous";
    }
    const details=rule?.details || {}, text=[rule?.group,details.type,item.name].join(" ").toLowerCase();
    if(details.damage || /\b(?:weapons?|ammunition|heavy arms|light arms|simple arms)\b/.test(text))return "Weapons";
    if(/\b(?:armou?r|shields?)\b/.test(text) || details["AC bonus"])return "Armor & shields";
    if(/\b(?:potions?|consumables?|scrolls?|rations?|food)\b/.test(text))return "Consumables";
    return "Miscellaneous";
  }

  function printInventoryRows() {
    if(!character.inventory.length)return '<p>Your pack is empty.</p>';
    return ["Weapons","Armor & shields","Consumables","Miscellaneous"].map(group=>{
      const members=character.inventory.map(item=>({item,rule:entries.get(item.entryId)})).filter(({item,rule})=>gearGroup(item,rule)===group);
      if(!members.length)return "";
      return `<section class="gear-print-group"><h3>${group}</h3>${members.map(({item,rule})=>`<article class="gear-print-item"><h4 class="gear-print-name">${escape(item.name)}</h4><p>${[`Quantity ${item.quantity}`,item.equipped?'Equipped':'',globalThis.MagicItems?.requiresAttunement(rule)&&item.attuned?'Attuned':''].filter(Boolean).join(' · ')}</p>${item.notes?`<p class="preserve-lines">${escape(item.notes)}</p>`:''}</article>`).join("")}</section>`;
    }).join("");
  }

  function gearRows() {
    const query=gearQuery.trim().toLowerCase();
    const rows=character.inventory.map((item,index)=>({item,index,rule:entries.get(item.entryId)})).map(row=>({...row,group:gearGroup(row.item,row.rule)}));
    const filtered=rows.filter(({item,rule,group})=>[item.name,item.notes,rule?.group,group].join(" ").toLowerCase().includes(query));
    if(!filtered.length)return `<p class="section-note">${rows.length?'No equipment matches your search.':'Your pack is empty. Add equipment from the rules or create a custom item.'}</p>`;
    return ["Weapons","Armor & shields","Consumables","Miscellaneous"].map(group=>{
      const members=filtered.filter(row=>row.group===group);
      if(!members.length)return "";
      return `<section class="gear-group"><h3 class="gear-group-title">${group}<span>${members.length}</span></h3><div class="gear-list">${members.map(({item,index,rule})=>{
        const key="gear-"+item.id, attunes=globalThis.MagicItems?.requiresAttunement(rule);
        return `<details class="gear-item list-card" data-expanded="${escape(key)}" ${expanded.has(key)?'open':''}><summary><span class="gear-item-name"><span class="list-card-title">${escape(item.name)}</span><span class="gear-item-status">${[item.equipped?'Equipped':'',attunes&&item.attuned?'Attuned':'',rule?.group].filter(Boolean).map(escape).join(' · ')}</span></span><span class="gear-quantity" aria-label="Quantity ${item.quantity}">×${item.quantity}</span></summary><div class="gear-item-body"><div class="inline-fields"><label class="check-label"><input type="checkbox" data-path="inventory.${index}.equipped" ${item.equipped?'checked':''}>Equipped</label>${attunes?`<label class="check-label"><input type="checkbox" data-path="inventory.${index}.attuned" ${item.attuned?'checked':''}>Attuned</label>`:''}${numberField("Quantity",`inventory.${index}.quantity`)}</div>${item.notes?`<p class="preserve-lines">${escape(item.notes)}</p>`:''}${referenceActions(item,"inventory",index)}</div></details>`;
      }).join("")}</div></section>`;
    }).join("");
  }

  function renderGear() {
    const money = `<div class="currency-grid">${numberField("Gold", "coins.gold")}${numberField("Silver", "coins.silver")}${numberField("Copper", "coins.copper")}</div>`;
    const training = `<div class="form-grid">${[["Weapons", "weapons"], ["Armour", "armor"], ["Tools", "tools"], ["Languages", "languages"]].map(([label, key]) => textArea(label, "proficiencies." + key, 2)).join("")}</div>`;
    const tools=button("Add from rules","catalog",'data-kind="inventory"',"button-primary button-small")+button("Add custom","add-item",'data-list="inventory"',"button-quiet button-small");
    byId("pane-gear").innerHTML = panel("Equipment",`<label class="field gear-search"><span class="sr-only">Find owned equipment</span><input type="search" id="owned-gear-search" placeholder="Find equipment in your pack" value="${escape(gearQuery)}" autocomplete="off"></label><div id="owned-gear-groups">${gearRows()}</div><div class="inventory-print" id="print-inventory">${printInventoryRows()}</div>`,tools,"gear-panel") + panel("Coin purse", money) + `<details class="panel disclosure" data-expanded="gear-training" ${expanded.has("gear-training")?'open':''}><summary>Proficiencies & languages</summary>${training}</details>`;
  }

  function renderFeatures() {
    const d=values();
    const automatic=d.enabled?panel("Your ancestry & class features",`<p class="section-note">Features unlock at your level. Open the builder to choose options or level up.</p>${sortField("feature-sort",featureSort)}<div class="list">${[...d.features].sort((a,b)=>Order.compare(a,b,featureSort)).map(feature=>`<details class="list-card"><summary>${escape(feature.name)} <span class="muted">· ${escape(feature.parent)} · level ${feature.requiredLevel ?? feature.level ?? 1}</span></summary>${ruleContent(feature.details)}${d.choices.filter(c=>c.featureId===feature.id).map(c=>`<p><strong>${escape(c.label)}</strong>: ${c.selected.map(id=>escape(c.options.find(o=>o.id===id)?.name || '')).join(', ') || 'Not chosen yet'}</p>`).join('')}</details>`).join('')}</div>${d.warnings.length?`<details class="source-warning"><summary>${d.warnings.length} choices or rules to check</summary><ul>${d.warnings.map(w=>`<li>${escape(w)}</li>`).join('')}</ul></details>`:''}`,button("Choices & level up","builder")):'';
    byId("pane-features").innerHTML = automatic+renderCollection("features", "Additional features", "Keep extra feats, background rules and custom features within reach.", "features");
  }

  function renderNotes() {
    byId("pane-notes").innerHTML = panel("Character notes", textArea("Backstory, temporary effects, rulings, and adventure notes", "notes", 16));
  }

  function render() {
    computed=null;
    renderHeader();
    renderSheet();
    renderSpells();
    renderGear();
    renderFeatures();
    renderNotes();
    switchTab(activeTab, false);
  }

  function switchTab(tab, focus) {
    const changed=activeTab!==tab;
    if (tab === "spells") renderSpells();
    activeTab = tab;
    document.querySelectorAll("[data-tab]").forEach(button => {
      const selected = button.dataset.tab === tab;
      button.setAttribute("aria-selected", selected);
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    });
    document.querySelectorAll(".pane").forEach(pane => { pane.hidden = pane.id !== "pane-" + tab; });
    if(changed)byId("sheet-content").scrollIntoView?.({block:"start",behavior:"instant"});
  }

  function openDialog(title, content, footer = "") {
    dialogGeneration++;
    byId("dialog-title").textContent = title;
    byId("dialog-body").innerHTML = content;
    byId("dialog-footer").innerHTML = '<p class="dialog-message" id="dialog-message" role="status" aria-live="polite"></p>' + footer;
    if (!byId("editor-dialog").open) byId("editor-dialog").showModal();
  }

  function closeDialog() {
    dialogGeneration++;
    if(Wizard?.isOpen()){Wizard.cancel();return;}
    byId("editor-dialog").close();
  }

  function identityDialog() {
    const suggestions = (id, section, group) => `<datalist id="${id}">${catalog.filter(entry => entry.section === section && (!group || entry.group === group)).map(entry => `<option value="${escape(entry.name)}"></option>`).join("")}</datalist>`;
    openDialog("Edit character", `<div class="form-grid">${field("Character name", "name")}${field("Player", "player")}${field("Ancestry", "ancestry", "text", {list: "ancestry-options"})}${field("Class", "className", "text", {list: "class-options"})}${field("Archetype / subclass", "subclass")}${field("Additional archetypes", "additionalArchetypes")}${numberField("Level", "level", {min: 1, max: 100})}${numberField("Experience points (XP)", "experience")}${field("Background", "background", "text", {list: "background-options"})}</div>${suggestions("ancestry-options", "races")}${suggestions("class-options", "classes", "Base class")}${suggestions("background-options", "backgrounds")}`, button("Done", "done", "", "button-primary"));
  }

  function combatDialog() {
    if(values().enabled){
      openDialog("Combat adjustments",`<p class="section-note">Armour class ${values().armorClass}, speed ${values().speed} ft and Block ${values().blockMaximum} come from your choices and equipped gear. Add situational or custom bonuses here.</p><div class="form-grid">${numberField("Additional armour class","build.adjustments.ac",{min:-1000})}${numberField("Additional speed (ft)","build.adjustments.speed",{min:-1000})}${numberField("Additional Block maximum","build.adjustments.block",{min:-1000})}${numberField("Additional Block check","build.adjustments.blockCheck",{min:-1000})}${numberField("Additional initiative bonus","combat.initiativeBonus",{min:-1000})}${numberField("Proficiency total override","combat.proficiencyOverride",{min:-1000})}${numberField("Passive Perception override","combat.passivePerceptionOverride",{min:-1000})}</div>`,button("Done","done","","button-primary"));return;
    }
    openDialog("Combat values", `<div class="form-grid">${numberField("Armour class", "combat.armorClass")}${numberField("Speed (ft)", "combat.speed")}${numberField("Additional initiative bonus", "combat.initiativeBonus", {min: -1000, max: 1000})}${numberField("Proficiency total override", "combat.proficiencyOverride", {min: -1000, max: 1000, placeholder: State.proficiencyBonus(character.level)})}${numberField("Passive Perception override", "combat.passivePerceptionOverride", {min: -1000, max: 1000})}</div><p class="section-note">Initiative includes your Dexterity modifier. Varis proficiency normally rises every three levels. Passive Perception is 10 plus your Perception check bonus. Clear either override to use its calculated value.</p>`, button("Done", "done", "", "button-primary"));
  }

  function castingDialog() {
    openDialog("Spellcasting values", `<div class="form-grid">${selectField("Casting ability", "combat.spellAbility", [["", "Choose ability"], ...Object.entries(abilityNames)])}${numberField("Additional spell attack bonus", "combat.spellAttackBonus", {min: -1000, max: 1000})}${numberField("Additional spell save bonus", "combat.spellSaveBonus", {min: -1000, max: 1000})}${numberField("Spell attack total override", "combat.spellAttackOverride", {min: -1000, max: 1000})}${numberField("Spell save DC total override", "combat.spellSaveOverride", {min: 0, max: 1000})}</div><p class="section-note">Spell attack uses proficiency plus casting modifier. Save DC starts at 8 plus proficiency and casting modifier. Wizard's base DC uses a minimum ability modifier of zero. Use total overrides for different class or feature rules.</p>`, button("Done", "done", "", "button-primary"));
  }

  function ruleContent(value, depth = 0) {
    if (depth > 18) return `<p>${escape(JSON.stringify(value))}</p>`;
    if (value == null) return "";
    if (Array.isArray(value)) return `<ul>${value.map(item => `<li>${ruleContent(item, depth + 1)}</li>`).join("")}</ul>`;
    if (typeof value === "object") return Object.entries(value).map(([key, item]) => `<section class="detail-section"><h${Math.min(5, depth + 3)}>${escape(labelize(key))}</h${Math.min(5, depth + 3)}>${ruleContent(item, depth + 1)}</section>`).join("");
    return `<p class="preserve-lines">${escape(value)}</p>`;
  }

  function readRule(entryId, canAdd = false) {
    const entry = entries.get(entryId);
    if (!entry) return notify("This rule is unavailable in the current compendium.");
    const route = new URLSearchParams({section: entry.section, entry: entry.name, group: entry.group});
    const footer = (canAdd ? button("Add to character", "add-catalog", `data-entry-id="${escape(entryId)}"`, "button-primary") + button("Back to rules", "catalog", `data-kind="${catalogKind}"`) : "") + `<a class="button button-quiet" href="index.html#${escape(route)}" target="_blank" rel="noopener">Open in compendium</a>`;
    let visible=entry.details, comparison="";
    if(entry.section==="magic-items" && globalThis.MagicItems){
      visible=globalThis.MagicItems.searchable(entry);delete visible.id;
      comparison=Object.entries(entry.details).filter(([key])=>/^(?:original_|conversion_notes$)/.test(key)).map(([key,value])=>`<details><summary>${escape(key==="original_5e"?"Original 5e text":labelize(key))}</summary>${ruleContent(value)}</details>`).join("");
      const source=Object.fromEntries(Object.entries(entry.details).filter(([key])=>/^source_/.test(key)).map(([key,value])=>[key.replace(/^source_/,""),value]));
      if(Object.keys(source).length)comparison+=`<details><summary>Source workbook</summary>${ruleContent(source)}</details>`;
    }
    openDialog(entry.name, `<p class="list-card-meta">${escape([entry.sectionTitle, entry.group].filter(Boolean).join(" · "))}</p><div class="detail-content">${ruleContent(visible)}${comparison}</div><p class="section-note">Source · ${escape(entry.source)}</p>`, footer);
  }

  function openCatalog(kind) {
    catalogKind = kind;
    catalogLimit = 30;
    const allowed = kind === "spells" ? ["spells"] : kind === "inventory" ? ["items", "magic-items"] : ["classes", "feats", "races", "backgrounds"];
    const groups = [...new Set(catalog.filter(entry => allowed.includes(entry.section) && entry.group !== "Magic rules").map(entry => entry.group).filter(Boolean))].sort((a,b)=>Order.compareGroups(kind,a,b));
    const preferences = catalogPreferences[kind];
    const levels = [...new Set(catalog.filter(entry=>allowed.includes(entry.section)).map(Order.level).filter(level=>level!==null))].sort((a,b)=>a-b);
    const ordering = sortField("catalog-sort",preferences.sort,kind!=='inventory'&&levels.length>0) + (kind==='spells'?`<label class="field"><span>Spell level</span><select id="catalog-level"><option value="">All levels</option>${levels.map(level=>`<option value="${level}" ${String(level)===preferences.level?'selected':''}>${level===0?'Level 0 / cantrips':'Level '+level}</option>`).join('')}</select></label>`:'');
    const magicCategories = kind === "inventory" ? `<label class="field"><span>Magic category</span><select id="catalog-magic-category"><option value="">All equipment</option><option value="all-magic">All magic items</option>${(globalThis.MagicCategories?.categories || []).map(category => `<option value="${escape(category.key)}">${escape(category.title)}</option>`).join("")}</select></label>` : "";
    const spellScope=kind==='spells' && values().casting?.profile?`<label class="check-label"><input type="checkbox" id="catalog-spell-all" ${catalogSpellAll?'checked':''}>Show other spell lists and extra selections for feature-granted or manually learned spells</label><p class="section-note">Class selections follow ${escape(values().cls.name)}'s spell list, level and learning allowance. Use the extra selections option for specific feature grants or copied spellbook spells.</p>`:'';
    openDialog("Add " + (kind === "inventory" ? "equipment" : kind), `<div class="catalog-search"><label class="field"><span>Search rules</span><input id="catalog-query" type="search" placeholder="Search by name or rule text" autocomplete="off"></label><label class="field"><span>Group</span><select id="catalog-group"><option value="">All groups</option>${groups.map(group => `<option>${escape(group)}</option>`).join("")}</select></label>${magicCategories}${ordering}</div>${spellScope}<p class="section-note" id="catalog-count"></p><div class="catalog-results" id="catalog-results"></div>`, button("Close", "close-dialog"));
    renderCatalogResults();
  }

  function renderCatalogResults() {
    const allowed = catalogKind === "spells" ? ["spells"] : catalogKind === "inventory" ? ["items", "magic-items"] : ["classes", "feats", "races", "backgrounds"];
    const query = byId("catalog-query").value.toLowerCase().trim();
    const group = byId("catalog-group").value;
    const magicCategory = catalogKind === "inventory" ? byId("catalog-magic-category")?.value || "" : "";
    const words = query.split(/\s+/).filter(Boolean);
    const preferences = catalogPreferences[catalogKind];
    const results = catalog.filter(entry => allowed.includes(entry.section) && entry.group !== "Magic rules" && (!group || entry.group === group)
      && (!magicCategory || entry.section === "magic-items" && (magicCategory === "all-magic" || entry.magicCategory === magicCategory))
      && (catalogKind!=='spells' || catalogSpellAll || !values().casting?.profile || globalThis.CharacterCasting.spellAccess(character,values(),entry).allowed)
      && (catalogKind!=='spells'||!preferences.level||String(Order.level(entry))===preferences.level) && words.every(word => entry.searchText.includes(word))).sort((a, b) => Order.compare(a,b,preferences.sort));
    byId("catalog-count").textContent = `${results.length} matching ${results.length === 1 ? "rule" : "rules"}`;
    byId("catalog-results").innerHTML = results.slice(0, catalogLimit).map(entry => `<article class="catalog-result"><div><h3>${escape(entry.name)}</h3><p class="list-card-meta">${escape((entry.magicCategoryTitle ? entry.magicCategoryTitle + " · " : "") + (entry.group || entry.sectionTitle))}${Order.level(entry)!==null?' · '+entryLevelLabel(entry):''}</p></div><div class="entry-actions">${button("Read", "catalog-read", `data-entry-id="${escape(entry.entryId)}"`, "button-small")}${button("Add", "add-catalog", `data-entry-id="${escape(entry.entryId)}" aria-label="Add ${escape(entry.name)}"`, "button-primary button-small")}</div></article>`).join("") + (results.length > catalogLimit ? button("Show more", "catalog-more", "", "full-width") : "") + (!results.length ? `<p class="empty-state">No matching rules. Try another name or group.</p>` : "");
  }

  function itemEditor(list, index) {
    const item = character[list][index];
    const gear = list==='inventory' && values().enabled ? `<div class="form-grid">${selectField("Weapon training",`inventory.${index}.weaponTraining`,[["auto","Use character proficiencies"],["proficient","Proficient"],["untrained","Untrained"]])}${selectField("Attack ability",`inventory.${index}.attackAbility`,[["auto","Automatic"],...Object.entries(abilityNames)])}${selectField("Damage ability",`inventory.${index}.damageAbility`,[["auto","Automatic"],...Object.entries(abilityNames)])}${numberField("Magic bonus",`inventory.${index}.magicBonus`,{min:-100,max:100})}<label class="check-label"><input type="checkbox" data-path="inventory.${index}.twoHanded" ${item.twoHanded?'checked':''}>Wield two-handed</label><label class="check-label"><input type="checkbox" data-path="inventory.${index}.offHand" ${item.offHand?'checked':''}>Off-hand weapon</label></div>`:'';
    openDialog("Edit " + item.name, `<div class="form-grid">${field("Name", `${list}.${index}.name`)}${list === "inventory" ? numberField("Quantity", `${list}.${index}.quantity`) : ""}${textArea("Notes and custom effects", `${list}.${index}.notes`, 6)}</div>${gear}`, button("Done", "done", "", "button-primary") + button("Remove", "remove", `data-list="${list}" data-index="${index}" data-close="true"`, "button-danger"));
  }

  function addItem(list) {
    const item = {id: uid(), entryId: "", name: list === "spells" ? "Custom spell" : list === "inventory" ? "Custom item" : "Custom feature", notes: ""};
    if (list === "spells") item.prepared = false;
    if (list === "inventory") Object.assign(item, {quantity: 1, equipped: false});
    character[list].push(item);
    commit();
    render();
    itemEditor(list, character[list].length - 1);
  }

  function attackEditor(index) {
    openDialog("Edit attack", `<div class="form-grid">${field("Attack name", `attacks.${index}.name`)}${numberField("Attack bonus total", `attacks.${index}.bonus`, {min: -1000, max: 1000})}${field("Damage (for example 1d8 + 3 slashing)", `attacks.${index}.damage`)}${field("Manoeuvre", `attacks.${index}.maneuver`)}${textArea("Properties, range, and notes", `attacks.${index}.notes`)}</div>`, button("Done", "done", "", "button-primary") + button("Remove attack", "remove", `data-list="attacks" data-index="${index}" data-close="true"`, "button-danger"));
  }

  function exportBackup() {
    flushAndPersist();
    const blob = new Blob([State.exportCharacter(character)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const name = (character.name || "Varis-character").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "Varis-character";
    link.href = url;
    link.download = name + ".json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    notify("Backup downloaded. Keep it in Files, Downloads, or your cloud drive.");
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("This file is too large. Choose a character JSON backup smaller than 5 MB.");
      const imported = State.importCharacter(await file.text());
      if (loader) await withSections(referenceSections([imported]), () => {});
      persist();
      imported.id = uid();
      library.push(imported);
      character = imported;
      commit();
      render();
      const mismatch = imported.rulesVersion && imported.rulesVersion !== currentRules;
      notify(mismatch ? "Backup loaded with a different rules snapshot. Check your saved choices and bonuses." : "Backup loaded as a separate character.");
    } catch (error) {
      notify(error.message || "This backup could not be read. Your current character is unchanged.");
    } finally {
      byId("backup-input").value = "";
    }
  }

  function roll(label, bonus) {
    const random = new Uint32Array(1);
    let face;
    if (globalThis.crypto?.getRandomValues) {
      do { crypto.getRandomValues(random); } while (random[0] >= 4294967280);
      face = random[0] % 20 + 1;
    } else face = Math.floor(Math.random() * 20) + 1;
    const fatigue=Rules.fatiguePenalty(character);
    notify(`${label} · d20 ${face} ${bonus < 0 ? "− " + Math.abs(bonus) : "+ " + bonus}${fatigue.amount?' − '+fatigue.amount+' Fatigue':''} = ${face + bonus-fatigue.amount}${fatigue.unresolved?' · Fatigue level 6/7 penalty needs a GM ruling.':''}`);
  }

  function changeResource(key, delta) {
    if (delta < 0) {
      const available = key === "block" ? character.resources.block.current + character.resources.tempBlock.current : key.startsWith("custom:") ? character.customResources.find(item => item.id === key.slice(7))?.current : key.startsWith("slot:") ? character.spellSlots.find(item => item.level === Number(key.slice(5)))?.current : key === "restDice" ? character.restDice.current : character.resources[key]?.current;
      if (available < -delta) return notify("There are not enough uses available for that action.");
    }
    character = State.resourceDelta(character, key, delta);
    commit();
    render();
  }

  const actions = {
    "death-save-dot"(target){const key=target.dataset.saveKind,count=Number(target.dataset.saveCount);if(['successes','failures'].includes(key)&&Number.isInteger(count)&&count>=1&&count<=values().deathSaveSlots){character.deathSaves[key]=character.deathSaves[key]===count?count-1:count;commit();render();}},
    "cast-known-spell"(target){
      try {
        const optionId=target.closest('[data-spell-card]').querySelector('[data-spell-option]').value;
        spellCastChoices.set(character.id+':'+target.dataset.spellId,optionId);
        const result=globalThis.CharacterCasting.castSpell(character,values(),Rules.catalog,target.dataset.spellId,optionId);
        character=result.character;commit();render();
        const label=`${result.name}${result.level?' — level '+result.level:' — cantrip'}`;
        const castingAbility=values().castingAbility;
        if(globalThis.CharacterCasting.spellInfo(result.entry).simpleAttack && /\bspell attack\b/i.test(result.entry.details.effect || '')) roll(label+' attack; '+result.cost,character.combat.spellAttackOverride ?? proficiency()+State.abilityModifier(values().abilities[castingAbility] ?? 10)+character.combat.spellAttackBonus);
        else notify(label+' cast. '+result.cost+'. Resolve its effects from the spell rules.');
      }catch(error){notify(error.message);}
    },
    "casting-configure"(){flushAndPersist();renderSpells();},
    "enable-casting"(){character=globalThis.CharacterCasting.activate(character,values().casting);commit();render();},
    "disable-casting"(){character.build.casting={...character.build.casting,enabled:false};commit();render();},
    "casting-spend"(target){try{const level=Number(target.closest('.casting-pool').querySelector('[data-cast-level]')?.value||0)||undefined;character=globalThis.CharacterCasting.spend(character,values().casting,target.dataset.poolId,{level});commit();render();}catch(error){notify(error.message);}},
    "casting-whole"(target){try{const level=Number(target.closest('.casting-pool').querySelector('[data-cast-level]')?.value||0)||undefined;character=globalThis.CharacterCasting.spend(character,values().casting,target.dataset.poolId,{level,whole:true});commit();render();}catch(error){notify(error.message);}},
    "casting-restore"(target){try{character=globalThis.CharacterCasting.change(character,values().casting,target.dataset.poolId,1);commit();render();}catch(error){notify(error.message);}},
    builder() { if(Wizard)return withSections(['spells',...(globalThis.DND_CATALOG || []).filter(section=>section.key==="magic-items").map(section=>section.key)],()=>Wizard.start(character,false),true); },
    identity() {if(character.build?.enabled && Wizard)return actions.builder();else identityDialog();},
    combat: combatDialog,
    casting: castingDialog,
    "close-dialog": closeDialog,
    done() { closeDialog(); persist(); render(); },
    export: exportBackup,
    import() { byId("backup-input").click(); },
    print() { window.print(); },
    new() { persist(); if(Wizard && Rules.metadata.classes?.length){return withSections(['spells',...(globalThis.DND_CATALOG || []).filter(section=>section.key==="magic-items").map(section=>section.key)],()=>Wizard.start(State.createCharacter(),true),true);} character = State.createCharacter(); library.push(character); commit(); activeTab = "sheet"; render(); identityDialog(); },
    resource(target) { changeResource(target.dataset.key, Number(target.dataset.delta)); },
    health(target) {
      const amount = Number(byId("health-amount").value);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) return notify("Enter a whole amount between 1 and 1,000,000.");
      const key = byId("health-pool").value;
      const delta = amount * Number(target.dataset.sign);
      if(delta>0 && key==='auto')return notify('Choose the pool you want to heal.');
      const before = key==='auto'?0:character.resources[key].current;
      let damageResult;
      if(delta<0){damageResult=Rules.damage(character,amount,{pool:key,type:byId('damage-type')?.value || '',half:byId('damage-half')?.checked || false});character=damageResult.character;}
      else character=Rules.heal(character,amount,key);
      const actual = key==='auto'?damageResult.changes.reduce((sum,c)=>sum+c.amount,0):Math.abs(character.resources[key].current-before);
      commit(); render();
      notify(key==='auto'?`Damage: ${damageResult.changes.map(c=>`${resourceNames[c.pool]} −${c.amount}`).join(', ') || 'no health lost'}.${damageResult.unabsorbed?` ${damageResult.unabsorbed} damage remains after reaching 0 HP; resolve its effects.`:''}`:resourceNames[key] + (delta < 0 ? " reduced by " : " healed by ") + actual + ".");
    },
    "start-combat"(){character=Rules.startCombat(character);commit();render();roll('Initiative',values().initiative);},
    "end-combat"(){character=Rules.endCombat(character);commit();render();notify('Combat-only Block removed. Check temporary effects for their own expiry.');},
    "short-rest"(){character=Rules.rest(character,'short');commit();render();notify('Short rest: Block recovered and Fatigue reduced. Apply feature-specific healing and recovery.');},
    "long-rest"(){character=Rules.rest(character,'long');commit();render();notify('Long rest: Block recovered and Fatigue cleared. Apply feature-specific healing and recovery.');},
    "grant-temp"() { openDialog("Grant Temporary Block", `<label class="field"><span>New grant</span><input id="temp-grant" type="number" inputmode="numeric" min="0" max="1000000" value="1"></label><p class="section-note">A new grant keeps the higher pool. Record its expiry in Notes.</p>`, button("Apply grant", "apply-temp", "", "button-primary")); },
    "apply-temp"() {
      const amount = Number(byId("temp-grant").value);
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000) return notify("Enter a valid whole number for the grant.");
      character.resources.tempBlock.current = Math.max(character.resources.tempBlock.current, amount);
      character.resources.tempBlock.max = Math.max(character.resources.tempBlock.max, amount);
      closeDialog(); commit(); render();
    },
    "add-resource"() { character.customResources.push({id: uid(), name: "New resource", current: 0, max: 0}); commit(); render(); },
    "add-slot"() {
      const level = Array.from({length: 20}, (_, index) => index + 1).find(level => !character.spellSlots.some(slot => slot.level === level));
      if (!level) return notify("All slot levels are already listed.");
      character.spellSlots.push({level, current: 0, max: 0}); commit(); render();
    },
    "add-attack"() { character.attacks.push({id: uid(), name: "New attack", bonus: 0, damage: "", notes: ""}); commit(); render(); attackEditor(character.attacks.length - 1); },
    "edit-attack"(target) { attackEditor(Number(target.dataset.index)); },
    "add-item"(target) { addItem(target.dataset.list); },
    "edit-item"(target) { itemEditor(target.dataset.list, Number(target.dataset.index)); },
    remove(target) { character[target.dataset.list].splice(Number(target.dataset.index), 1); if (target.dataset.close) closeDialog(); commit(); render(); },
    condition() { return withSections(["conditions"], () => openDialog("Add condition", `<label class="field"><span>Condition or temporary effect</span><input id="condition-name" type="text" list="condition-options" maxlength="120" placeholder="Choose or type a condition"></label><datalist id="condition-options">${catalog.filter(entry => entry.section === "conditions").map(entry => `<option value="${escape(entry.name)}"></option>`).join("")}</datalist>`, button("Add condition", "save-condition", "", "button-primary")), true); },
    "save-condition"() { const name = byId("condition-name").value.trim(); if (!name) return notify("Enter a condition name."); if (!character.conditions.includes(name)) character.conditions.push(name); closeDialog(); commit(); render(); },
    "remove-condition"(target) { character.conditions.splice(Number(target.dataset.index), 1); commit(); render(); },
    catalog(target) { const kind = target.dataset.kind;catalogSpellAll=false; return withSections(kind === "spells" ? ["spells"] : kind === "inventory" ? ["items", ...((globalThis.DND_CATALOG || []).some(section=>section.key==="magic-items")?["magic-items"]:[])] : ["classes", "feats", "races", "backgrounds"], () => openCatalog(kind), true); },
    "catalog-more"() { catalogLimit += 30; renderCatalogResults(); },
    "catalog-read"(target) { readRule(target.dataset.entryId, true); },
    "read-rule"(target) { readRule(target.dataset.entryId); },
    "add-catalog"(target) {
      const entry = entries.get(target.dataset.entryId);
      if (!entry) return;
      const list = catalogKind;
      if (list !== "inventory" && character[list].some(item => item.entryId === entry.entryId)) return notify("This rule is already on your character sheet.");
      const item = {id: uid(), entryId: entry.entryId, name: entry.name, notes: ""};
      if (list === "inventory") Object.assign(item, {quantity: 1, equipped: false}, globalThis.MagicItems?.inventoryFields(entry) || {});
      if (list === "spells") {
        item.prepared=true;
        if(values().casting?.profile && !catalogSpellAll) {
          const reason=globalThis.CharacterCasting.spellLearningError(character,values(),Rules.catalog,entry);
          if(reason)return notify(reason+' Use Edit build to replace selections, or extra selections for a feature grant or copied spell.');
          item.classId=values().cls.id;
        }
      }
      character[list].push(item);
      commit(); render();
      notify(entry.name + " added to your character.");
    },
    roll(target) { roll(target.dataset.label, Number(target.dataset.bonus)); }
  };

  function applyInput(target, committed = false) {
    const path = target.dataset.path;
    if (!path) return;
    if (target.type === "number" && !committed) return;
    let value = target.type === "checkbox" ? target.checked : target.value;
    if (target.type === "number" || target.dataset.number) {
      if (value === "" && /Override$/.test(path)) value = null;
      else {
        if (value === "" || !Number.isFinite(Number(value))) {
          if (committed) target.value = getPath(path) ?? "";
          return;
        }
        value = Math.trunc(Number(value));
        if (target.min !== "" && target.min != null) value = Math.max(Number(target.min), value);
        if (target.max !== "" && target.max != null) value = Math.min(Number(target.max), value);
      }
    }
    if (/^spellSlots\.\d+\.level$/.test(path)) {
      const index = Number(path.split(".")[1]);
      if (character.spellSlots.some((slot, other) => other !== index && slot.level === value)) {
        target.value = getPath(path);
        return notify("That slot level is already listed. Adjust its existing row.");
      }
    }
    if (committed && target.type === "number") target.value = value ?? "";
    const previous = getPath(path);
    if (previous === value || (previous == null && value === 0 && path.startsWith("training.skillBonuses."))) return;
    setPath(path, value);
    if(character.build?.enabled && /^inventory\.\d+\.equipped$/.test(path))character=globalThis.CharacterEquipment.equip(character,Number(path.split('.')[1]),value,Rules.catalog);
    if(character.build?.enabled){character=Rules.reconcile(character);computed=null;}
    scheduleSave();
    refreshCalculations();
  }

  function flushAndPersist() {
    const focused = document.activeElement;
    if (focused?.dataset?.path && focused.type === "number") applyInput(focused, true);
    persist();
  }

  document.addEventListener("input", event => {
    if(Wizard?.handleInput(event.target))return;
    if (event.target.id === "catalog-query") { catalogLimit = 30; renderCatalogResults(); return; }
    if (event.target.id === "health-amount") { healthAdjustment.amount = event.target.value; return; }
    if (event.target.id === "owned-gear-search") { gearQuery=event.target.value;byId("owned-gear-groups").innerHTML=gearRows();return; }
    applyInput(event.target);
  });
  document.addEventListener("change", event => {
    const target = event.target;
    if(Wizard?.handleChange(target))return;
    if (target.id === "backup-input") { importBackup(target.files[0]); return; }
    if(target.id==='catalog-spell-all') {catalogSpellAll=!!target.checked;catalogLimit=30;renderCatalogResults();return;}
    if(target.dataset.spellOption!==undefined) {spellCastChoices.set(character.id+':'+target.dataset.spellId,target.value);return;}
    if (target.id === "catalog-group" || target.id === "catalog-magic-category") { catalogLimit = 30; renderCatalogResults(); return; }
    if (target.id === "catalog-sort" || target.id === "catalog-level") { catalogPreferences[catalogKind][target.id==='catalog-sort'?'sort':'level']=target.value; catalogLimit=30; renderCatalogResults(); return; }
    if (target.id === "spell-sort" || target.id === "spell-filter") { if(target.id==='spell-sort')spellSort=target.value;else spellFilter=target.value; renderSpells(); return; }
    if (target.id === "feature-sort") { featureSort=target.value; renderFeatures(); return; }
    if (target.id === "health-pool") { healthAdjustment.pool = target.value; return; }
    if (target.id === "character-picker") { selectCharacter(target.value); return; }
    if (target.dataset.path) {
      applyInput(target, true);
      if(target.dataset.path.startsWith('inventory.') || /^spells\.\d+\.(?:prepared|onBar)$/.test(target.dataset.path) || character.build?.enabled && (target.dataset.path==='level' || /^build\.health\.(?:restMode|restAdjustment|baseRestDice)$/.test(target.dataset.path))) {persist();render();}
    }
  });
  document.addEventListener("click", event => {
    const tab = event.target.closest("[data-tab]");
    if (tab) { switchTab(tab.dataset.tab, false); return; }
    const action = event.target.closest("[data-action]");
    const menu = action?.closest(".sheet-menu");
    if (menu) { flushAndPersist(); menu.open = false; menu.querySelector("summary")?.focus(); }
    if(action && Wizard?.handleAction(action.dataset.action,action))return;
    if (action) actions[action.dataset.action]?.(action);
  });
  document.addEventListener("toggle", event => {
    const key = event.target.dataset.expanded;
    if (key) event.target.open ? expanded.add(key) : expanded.delete(key);
  }, true);
  document.querySelector(".tabs").addEventListener("keydown", event => {
    const tabs = [...document.querySelectorAll("[data-tab]")];
    const index = tabs.findIndex(tab => tab.dataset.tab === activeTab);
    const keys = {ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1};
    if (Object.hasOwn(keys, event.key)) { event.preventDefault(); switchTab(tabs[keys[event.key]].dataset.tab, true); }
  });
  byId("editor-dialog").addEventListener("cancel", () => {if(Wizard?.isOpen())Wizard.cancel();else flushAndPersist();});
  byId("editor-dialog").addEventListener("close", () => { dialogGeneration++; flushAndPersist(); render(); });
  let printDetails = [];
  window.addEventListener("beforeprint", () => {
    flushAndPersist();
    byId("print-inventory").innerHTML=printInventoryRows();
    printDetails = [...document.querySelectorAll("details:not([open])")];
    printDetails.forEach(details => { details.open = true; });
  });
  window.addEventListener("afterprint", () => {
    printDetails.forEach(details => { details.open = false; });
    printDetails = [];
  });
  window.addEventListener("pagehide", flushAndPersist);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushAndPersist(); });
  load();
  character = Rules.reconcile(character);
  if (loader) await withSections(referenceSections(library), () => {});
  if(character.build?.enabled)healthAdjustment.pool='auto';
  render();
  persist();
  if (loader) {
    document.querySelector(".sheet-shell").inert = false;
    document.querySelector(".app-header").inert = false;
  }
})();
