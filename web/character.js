"use strict";

(() => {
  const State = globalThis.CharacterState;
  const Rules = globalThis.CharacterRules.create(globalThis.DND_CHARACTER_RULES || {}, globalThis.DND_CATALOG || []);
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
  const catalog = (globalThis.DND_CATALOG || []).flatMap(section => section.entries.map(entry => ({
    ...entry, section: section.key, sectionTitle: section.title, entryId: JSON.stringify([section.key, entry.group, entry.name]),
    searchText: (entry.name + " " + entry.group + " " + JSON.stringify(entry.details)).toLowerCase()
  })));
  const entries = new Map(catalog.map(entry => [entry.entryId, entry]));
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
    document.title = (character.name || "Character sheet") + " · Vara DnD";
    byId("character-picker").innerHTML = library.map(item => `<option value="${escape(item.id)}" ${item.id === character.id ? "selected" : ""}>${escape(item.name || "Unnamed character")}</option>`).join("");
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
    document.title = (character.name || "Character sheet") + " · Vara DnD";
  }

  function resourceCard(key) {
    const resource = character.resources[key];
    const percentage = resource.max ? Math.min(100, resource.current / resource.max * 100) : 0;
    const note = key === "block" ? "Each attempt is spent even if its defence check fails." : key === "tempBlock" ? "Spent before regular Block. Keep the higher grant and track its expiry." : key === "arcaneHealth" ? "Adjust this pool according to the effect's rules." : "";
    return `<section class="resource-card ${key === "hp" ? "health-card" : ""}"><h3 class="resource-label">${resourceNames[key]}</h3>
      <div class="resource-controls">${button("−", "resource", `data-key="${key}" data-delta="-1" aria-label="Decrease ${resourceNames[key]}"`, "counter-button")}
      <label class="resource-value"><span class="sr-only">Current ${resourceNames[key]}</span><input type="number" inputmode="numeric" min="0" max="1000000" data-path="resources.${key}.current" value="${resource.current}"></label>
      ${button("+", "resource", `data-key="${key}" data-delta="1" aria-label="Increase ${resourceNames[key]}"`, "counter-button")}</div>
      <label class="resource-max">Maximum <input type="number" inputmode="numeric" min="0" max="1000000" data-path="resources.${key}.max" value="${resource.max}" aria-label="Maximum ${resourceNames[key]}" ${values().enabled && ["hp","block"].includes(key)?'readonly':''}></label>
      <div class="meter" aria-hidden="true"><span class="meter-fill" data-resource-meter="${key}" style="width:${percentage}%"></span></div>${note ? `<p class="resource-note">${note}</p>` : ""}</section>`;
  }

  function abilityPanel() {
    const d=values();
    const abilities = `<div class="abilities-grid">${Object.entries(abilityNames).map(([key, name]) => `<div class="ability"><label class="ability-label" for="ability-${key}">${escape(name)}${d.enabled?' base':''}</label><input id="ability-${key}" class="ability-score" type="number" inputmode="numeric" min="0" max="100" data-path="abilities.${key}" value="${character.abilities[key]}">${d.enabled?`<span class="muted">Total <strong data-effective-score="${key}">${d.abilities[key]}</strong></span>`:''}${button(signed(State.abilityModifier(d.abilities[key])), "roll", `data-ability-roll="${key}" data-label="${escape(name)} check" data-bonus="${State.abilityModifier(d.abilities[key])}" aria-label="Roll ${escape(name)} check"`, "ability-mod")}</div>`).join("")}</div>`;
    const saves = Object.entries(abilityNames).map(([key, name]) => {
      const bonus = State.abilityModifier(d.abilities[key]) + (d.saves[key] ? proficiency() : 0) + (d.saveBonuses[key] || 0);
      return `<div class="save-row"><label class="check-label"><input type="checkbox" data-path="training.saves.${key}" ${d.saves[key] ? "checked" : ""} ${d.saves[key]&&!character.training.saves[key]?'disabled':''}>${name}</label><input class="bonus-input" type="number" inputmode="numeric" data-path="training.saveBonuses.${key}" value="${character.training.saveBonuses?.[key] || 0}" aria-label="Additional ${name} save bonus" min="-1000" max="1000">${button(signed(bonus), "roll", `data-save-roll="${key}" data-label="${name} saving throw" data-bonus="${bonus}" aria-label="Roll ${name} saving throw"`, "skill-bonus")}</div>`;
    }).join("");
    const skillRows = Object.entries(skills).map(([name, ability]) => {
      const rank = d.skillRanks[name] || 0;
      const bonus = State.abilityModifier(d.abilities[ability]) + rank * proficiency() + (d.skillBonuses[name] || 0);
      return `<div class="skill-row"><span class="skill-name">${escape(name)}<small class="skill-ability">${ability.toUpperCase()}</small></span><select class="training-select" data-path="training.skills.${escape(name)}" data-number="true" aria-label="${escape(name)} training"><option value="0" ${rank === 0 ? "selected" : ""}>Untrained</option><option value="1" ${rank === 1 ? "selected" : ""}>Proficient</option><option value="2" ${rank === 2 ? "selected" : ""}>Expertise</option></select><input class="bonus-input" type="number" inputmode="numeric" min="-1000" max="1000" data-path="training.skillBonuses.${escape(name)}" value="${character.training.skillBonuses?.[name] || 0}" aria-label="Additional ${escape(name)} bonus">${button(signed(bonus), "roll", `data-skill-roll="${escape(name)}" data-label="${escape(name)}" data-bonus="${bonus}" aria-label="Roll ${escape(name)}"`, "skill-bonus")}</div>`;
    }).join("");
    return `<aside class="ability-panel">${panel("Ability scores", abilities)}<details class="panel disclosure" data-expanded="saves" ${expanded.has("saves") ? "open" : ""}><summary>Saving throws</summary><p class="section-note">Select proficient saves. The adjustment field adds feature or situational bonuses.</p>${saves}</details><details class="panel disclosure" data-expanded="skills" ${expanded.has("skills") ? "open" : ""}><summary>Skills</summary><p class="section-note">Includes the draft's proposed Stamina, Instinct, and Mechanism skills. Set training and any additional bonus.</p><div class="skill-list">${skillRows}</div></details></aside>`;
  }

  function derivedAttacks() {
    return values().attacks.map(attack=>`<article class="list-card"><div class="attack-row"><div><h3 class="attack-name">${escape(attack.name)}</h3><p class="attack-damage">${escape(attack.damage)}</p></div>${button(signed(attack.bonus),"roll",`data-label="${escape(attack.name)} attack" data-bonus="${attack.bonus}" aria-label="Roll ${escape(attack.name)} attack"`)}</div><p class="list-card-meta">From equipped gear · ${escape(attack.ability?.toUpperCase() || '')} · ${attack.trained?'Proficient':'Untrained'} · Block DC ${attack.blockDC}</p><p>${escape(attack.properties)}</p>${attack.notes?`<p class="section-note">${escape(attack.notes)}</p>`:''}${attack.maneuvers?`<details class="detail-section"><summary>Weapon manoeuvres</summary>${ruleContent(attack.maneuvers)}</details>`:''}</article>`).join('');
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
    const resources = `<div class="resources-grid">${Object.keys(resourceNames).map(resourceCard).join("")}</div>`;
    const pools=d.enabled?["auto","hp","arcaneHealth","tempHP"]:["hp","arcaneHealth","tempHP"];
    const quickHealth = `<div class="quick-health"><label class="field"><span>Health pool</span><select id="health-pool">${pools.map(key=>`<option value="${key}" ${healthAdjustment.pool===key?'selected':''}>${key==='auto'?'Automatic damage order':resourceNames[key]}</option>`).join('')}</select></label><label class="field"><span>Amount</span><input id="health-amount" type="number" inputmode="numeric" min="1" max="1000000" value="${healthAdjustment.amount}"></label>${button("Damage","health",'data-sign="-1"','button-danger')}${button("Heal","health",'data-sign="1"','button-primary')}</div>${d.enabled?`<p class="section-note">Damage uses Arcane Health, then Temporary HP, then HP. For healing, choose the pool to restore.</p><div class="form-grid"><label class="field"><span>Damage type (for reduction)</span><select id="damage-type"><option value="">Untyped / already adjusted</option>${['bludgeoning','piercing','slashing','fire','cold','acid','lightning','sonic','poison','necrotic','radiant','psychic','force'].map(t=>`<option>${t}</option>`).join('')}</select></label><label class="check-label"><input id="damage-half" type="checkbox">Apply half damage (resistance)</label></div>`:''}`;
    const blocks = `<div class="entry-actions">${button("Use 1 Block", "resource", 'data-key="block" data-delta="-1"', "button-primary")}${button("Use 2 Blocks", "resource", 'data-key="block" data-delta="-2"')}${button("Grant Temp Block", "grant-temp")}</div>`;
    const rest = `<div class="form-grid">${field("Rest die size", "restDice.die", "text", {placeholder: "d6"})}${numberField("Rest dice available", "restDice.current")}${d.enabled?numberField("Base rest dice maximum", "build.health.baseRestDice"):numberField("Rest dice maximum", "restDice.max")}</div><div class="entry-actions">${button("Spend 1 rest die", "resource", 'data-key="restDice" data-delta="-1"')}${button("Recover 1 rest die", "resource", 'data-key="restDice" data-delta="1"')}</div>`;
    const marks = Array.from({length:d.deathSaveSlots+1},(_,n)=>[n,String(n)]);
    const deathSaves = `<div class="form-grid">${selectField("Successes", "deathSaves.successes", marks, "", true)}${selectField("Failures", "deathSaves.failures", marks, "", true)}</div>`;
    const conditionChips = character.conditions.length ? `<div class="condition-chips">${character.conditions.map((condition, index) => `<span class="pill">${escape(condition)}${button("×", "remove-condition", `data-index="${index}" aria-label="Remove ${escape(condition)}"`, "button-quiet button-small")}</span>`).join("")}</div>` : `<p class="section-note">No conditions recorded.</p>`;
    byId("pane-sheet").innerHTML = `<div class="sheet-layout"><div class="main-panel">${combatStrip}${panel("Health & defence", resources + quickHealth + blocks + (d.enabled?`<div class="entry-actions">${button("Roll initiative / start combat","start-combat")}${button("End combat","end-combat")}${button("Short rest","short-rest")}${button("Long rest","long-rest")}</div><p class="section-note">Block check ${signed(d.blockCheck)} · ${escape(d.gear.blockCheckAbility?.toUpperCase())} · ${escape(d.hpExplanation)}. Rests recover Block and Fatigue; apply other recovery from the relevant feature.</p>${numberField("Fatigue", "build.health.fatigue", {max:10})}`:""), button("Edit combat", "combat", "", "button-quiet button-small"))}${panel("Death saves", deathSaves)}${panel("Rest dice", rest)}${panel("Attacks & actions", `<div class="list" id="derived-attacks">${derivedAttacks()}</div>` + renderAttacks() + textArea("Known manoeuvres", "maneuvers"), character.attacks.length ? button("Add attack", "add-attack", "", "button-small") : "")}${panel("Class resources", renderCustomResources(), button("Add resource", "add-resource", "", "button-small"))}${panel("Conditions", conditionChips, button("Add condition", "condition", "", "button-small"))}</div>${abilityPanel()}</div>`;
  }

  function referenceActions(item, list, index) {
    const found = item.entryId && entries.has(item.entryId);
    const missing = item.entryId && !found ? `<p class="source-warning">This rule is missing from this rules snapshot. Your saved name and notes are preserved.</p>` : "";
    return missing + `<div class="entry-actions">${found ? button("Read rule", "read-rule", `data-entry-id="${escape(item.entryId)}"`, "button-small") : ""}${button("Edit", "edit-item", `data-list="${list}" data-index="${index}"`, "button-quiet button-small")}</div>`;
  }

  function renderCollection(list, title, description, kind) {
    const items = character[list];
    const actions = button("Add from rules", "catalog", `data-kind="${kind}"`, "button-primary") + button("Add custom", "add-item", `data-list="${list}"`);
    const body = items.length ? `<div class="list">${items.map((item, index) => {
      const rule = entries.get(item.entryId);
      let toggle = "";
      if (list === "inventory") toggle = `<div class="inline-fields"><label class="check-label"><input type="checkbox" data-path="inventory.${index}.equipped" ${item.equipped ? "checked" : ""}>Equipped</label>${numberField("Quantity", `inventory.${index}.quantity`)}</div>`;
      if (list === "spells") toggle = `<label class="check-label"><input type="checkbox" data-path="spells.${index}.prepared" ${item.prepared ? "checked" : ""}>Readied / prepared</label>`;
      const details = rule?.details || {};
      const meta = [rule?.group, details.lvl != null ? "Level " + details.lvl : "", details.casting, details.range].filter(value => typeof value === "string" && value).join(" · ");
      return `<article class="list-card"><header class="list-card-header"><div><h3 class="list-card-title">${escape(item.name)}</h3>${meta ? `<p class="list-card-meta">${escape(meta)}</p>` : ""}</div>${toggle}</header>${item.notes ? `<p class="preserve-lines">${escape(item.notes)}</p>` : ""}${referenceActions(item, list, index)}</article>`;
    }).join("")}</div>` : empty("Your " + title.toLowerCase() + " starts here", description, actions);
    return panel(title, `<p class="section-note">${escape(description)}</p>${body}`, items.length ? `<div class="entry-actions">${actions}</div>` : "");
  }

  function renderSpells() {
    const combat = character.combat;
    const castingAbility=values().castingAbility;
    const modifier = castingAbility ? State.abilityModifier(values().abilities[castingAbility]) : 0;
    const saveModifier = character.className.toLowerCase() === "wizard" ? Math.max(0, modifier) : modifier;
    const spellAttack = combat.spellAttackOverride ?? proficiency() + modifier + combat.spellAttackBonus;
    const spellSave = combat.spellSaveOverride ?? 8 + proficiency() + saveModifier + combat.spellSaveBonus;
    const casting = `<div class="combat-strip"><div class="combat-stat"><span class="combat-value">${castingAbility ? castingAbility.toUpperCase() : "—"}</span><span class="combat-label">Casting ability</span></div><div class="combat-stat"><span class="combat-value">${castingAbility || combat.spellAttackOverride != null ? signed(spellAttack) : "—"}</span><span class="combat-label">Spell attack</span></div><div class="combat-stat"><span class="combat-value">${castingAbility || combat.spellSaveOverride != null ? spellSave : "—"}</span><span class="combat-label">Save DC</span></div></div>`;
    const slots = character.spellSlots.length ? `<div class="list">${character.spellSlots.map((slot, index) => `<div class="slot-row" data-slot-index="${index}">${numberField("Level", `spellSlots.${index}.level`, {min: 0, max: 20})}${numberField("Available", `spellSlots.${index}.current`)}${numberField("Maximum", `spellSlots.${index}.max`)}${button("−1", "resource", `data-key="slot:${slot.level}" data-delta="-1" aria-label="Spend a level ${slot.level} slot"`)}${button("Remove", "remove", `data-list="spellSlots" data-index="${index}"`, "button-quiet button-small")}</div>`).join("")}</div>` : `<p class="section-note">Add slots by level where your class uses them. Use named Class resources for occult slots, individual partial slots, or other spell costs.</p>`;
    byId("pane-spells").innerHTML = panel("Spellcasting", casting, button("Edit spellcasting", "casting", "", "button-small")) + panel("Spell slots", slots, button("Add slot level", "add-slot", "", "button-small")) + renderCollection("spells", "Spells", "Select spells from the rules. Record preparations and apply each spell's listed costs using your resource trackers.", "spells");
  }

  function renderGear() {
    const money = `<div class="currency-grid">${numberField("Gold", "coins.gold")}${numberField("Silver", "coins.silver")}${numberField("Copper", "coins.copper")}</div>`;
    const training = `<div class="form-grid">${[["Weapons", "weapons"], ["Armour", "armor"], ["Tools", "tools"], ["Languages", "languages"]].map(([label, key]) => textArea(label, "proficiencies." + key, 2)).join("")}</div>`;
    byId("pane-gear").innerHTML = renderCollection("inventory", "Equipment", values().enabled?"Equip armor, a shield and weapons to update your defences and attacks. Custom effects can use manual adjustments.":"Use Build character to enable equipment calculations, or keep tracking this manual sheet.", "inventory") + panel("Coin purse", money) + panel("Proficiencies & languages", training);
  }

  function renderFeatures() {
    const d=values();
    const automatic=d.enabled?panel("Your ancestry & class features",`<p class="section-note">Features unlock at your level. Open the builder to choose options or level up.</p><div class="list">${d.features.map(feature=>`<details class="list-card"><summary>${escape(feature.name)} <span class="muted">· ${escape(feature.parent)} · level ${feature.level || 1}</span></summary>${ruleContent(feature.details)}${d.choices.filter(c=>c.featureId===feature.id).map(c=>`<p><strong>${escape(c.label)}</strong>: ${c.selected.map(id=>escape(c.options.find(o=>o.id===id)?.name || '')).join(', ') || 'Not chosen yet'}</p>`).join('')}</details>`).join('')}</div>${d.warnings.length?`<details class="source-warning"><summary>${d.warnings.length} choices or rules to check</summary><ul>${d.warnings.map(w=>`<li>${escape(w)}</li>`).join('')}</ul></details>`:''}`,button("Choices & level up","builder")):'';
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
    if (tab === "spells") renderSpells();
    activeTab = tab;
    document.querySelectorAll("[data-tab]").forEach(button => {
      const selected = button.dataset.tab === tab;
      button.setAttribute("aria-selected", selected);
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    });
    document.querySelectorAll(".pane").forEach(pane => { pane.hidden = pane.id !== "pane-" + tab; });
  }

  function openDialog(title, content, footer = "") {
    byId("dialog-title").textContent = title;
    byId("dialog-body").innerHTML = content;
    byId("dialog-footer").innerHTML = '<p class="dialog-message" id="dialog-message" role="status" aria-live="polite"></p>' + footer;
    if (!byId("editor-dialog").open) byId("editor-dialog").showModal();
  }

  function closeDialog() {
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
    openDialog("Combat values", `<div class="form-grid">${numberField("Armour class", "combat.armorClass")}${numberField("Speed (ft)", "combat.speed")}${numberField("Additional initiative bonus", "combat.initiativeBonus", {min: -1000, max: 1000})}${numberField("Proficiency total override", "combat.proficiencyOverride", {min: -1000, max: 1000, placeholder: State.proficiencyBonus(character.level)})}${numberField("Passive Perception override", "combat.passivePerceptionOverride", {min: -1000, max: 1000})}</div><p class="section-note">Initiative includes your Dexterity modifier. Vara proficiency normally rises every three levels. Passive Perception is 10 plus your Perception check bonus. Clear either override to use its calculated value.</p>`, button("Done", "done", "", "button-primary"));
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
    openDialog(entry.name, `<p class="list-card-meta">${escape([entry.sectionTitle, entry.group].filter(Boolean).join(" · "))}</p><div class="detail-content">${ruleContent(entry.details)}</div><p class="section-note">Source · ${escape(entry.source)}</p>`, footer);
  }

  function openCatalog(kind) {
    catalogKind = kind;
    catalogLimit = 30;
    const allowed = kind === "spells" ? ["spells"] : kind === "inventory" ? ["items"] : ["classes", "feats", "races", "backgrounds"];
    const groups = [...new Set(catalog.filter(entry => allowed.includes(entry.section) && entry.group !== "Magic rules").map(entry => entry.group).filter(Boolean))].sort();
    openDialog("Add " + (kind === "inventory" ? "equipment" : kind), `<div class="catalog-search"><label class="field"><span>Search rules</span><input id="catalog-query" type="search" placeholder="Search by name or rule text" autocomplete="off"></label><label class="field"><span>Group</span><select id="catalog-group"><option value="">All groups</option>${groups.map(group => `<option>${escape(group)}</option>`).join("")}</select></label></div><p class="section-note" id="catalog-count"></p><div class="catalog-results" id="catalog-results"></div>`, button("Close", "close-dialog"));
    renderCatalogResults();
  }

  function renderCatalogResults() {
    const allowed = catalogKind === "spells" ? ["spells"] : catalogKind === "inventory" ? ["items"] : ["classes", "feats", "races", "backgrounds"];
    const query = byId("catalog-query").value.toLowerCase().trim();
    const group = byId("catalog-group").value;
    const words = query.split(/\s+/).filter(Boolean);
    const results = catalog.filter(entry => allowed.includes(entry.section) && entry.group !== "Magic rules" && (!group || entry.group === group) && words.every(word => entry.searchText.includes(word))).sort((a, b) => a.name.localeCompare(b.name));
    byId("catalog-count").textContent = `${results.length} matching ${results.length === 1 ? "rule" : "rules"}`;
    byId("catalog-results").innerHTML = results.slice(0, catalogLimit).map(entry => `<article class="catalog-result"><div><h3>${escape(entry.name)}</h3><p class="list-card-meta">${escape(entry.group || entry.sectionTitle)}</p></div><div class="entry-actions">${button("Read", "catalog-read", `data-entry-id="${escape(entry.entryId)}"`, "button-small")}${button("Add", "add-catalog", `data-entry-id="${escape(entry.entryId)}" aria-label="Add ${escape(entry.name)}"`, "button-primary button-small")}</div></article>`).join("") + (results.length > catalogLimit ? button("Show more", "catalog-more", "", "full-width") : "") + (!results.length ? `<p class="empty-state">No matching rules. Try another name or group.</p>` : "");
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
    const name = (character.name || "Vara-character").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "Vara-character";
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
    builder() { if(Wizard)Wizard.start(character,false); },
    identity() {if(character.build?.enabled && Wizard)Wizard.start(character,false);else identityDialog();},
    combat: combatDialog,
    casting: castingDialog,
    "close-dialog": closeDialog,
    done() { closeDialog(); persist(); render(); },
    export: exportBackup,
    import() { byId("backup-input").click(); },
    print() { window.print(); },
    new() { persist(); if(Wizard && Rules.metadata.classes?.length){Wizard.start(State.createCharacter(),true);return;} character = State.createCharacter(); library.push(character); commit(); activeTab = "sheet"; render(); identityDialog(); },
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
    condition() { openDialog("Add condition", `<label class="field"><span>Condition or temporary effect</span><input id="condition-name" type="text" list="condition-options" maxlength="120" placeholder="Choose or type a condition"></label><datalist id="condition-options">${catalog.filter(entry => entry.section === "conditions").map(entry => `<option value="${escape(entry.name)}"></option>`).join("")}</datalist>`, button("Add condition", "save-condition", "", "button-primary")); },
    "save-condition"() { const name = byId("condition-name").value.trim(); if (!name) return notify("Enter a condition name."); if (!character.conditions.includes(name)) character.conditions.push(name); closeDialog(); commit(); render(); },
    "remove-condition"(target) { character.conditions.splice(Number(target.dataset.index), 1); commit(); render(); },
    catalog(target) { openCatalog(target.dataset.kind); },
    "catalog-more"() { catalogLimit += 30; renderCatalogResults(); },
    "catalog-read"(target) { readRule(target.dataset.entryId, true); },
    "read-rule"(target) { readRule(target.dataset.entryId); },
    "add-catalog"(target) {
      const entry = entries.get(target.dataset.entryId);
      if (!entry) return;
      const list = catalogKind;
      if (list !== "inventory" && character[list].some(item => item.entryId === entry.entryId)) return notify("This rule is already on your character sheet.");
      const item = {id: uid(), entryId: entry.entryId, name: entry.name, notes: ""};
      if (list === "inventory") Object.assign(item, {quantity: 1, equipped: false});
      if (list === "spells") item.prepared = false;
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
    if(character.build?.enabled && /^inventory\.\d+\.equipped$/.test(path))character=globalThis.CharacterEquipment.equip(character,Number(path.split('.')[1]),value);
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
    applyInput(event.target);
  });
  document.addEventListener("change", event => {
    const target = event.target;
    if(Wizard?.handleChange(target))return;
    if (target.id === "backup-input") { importBackup(target.files[0]); return; }
    if (target.id === "catalog-group") { catalogLimit = 30; renderCatalogResults(); return; }
    if (target.id === "health-pool") { healthAdjustment.pool = target.value; return; }
    if (target.id === "character-picker") { selectCharacter(target.value); return; }
    if (target.dataset.path) {
      applyInput(target, true);
      if(character.build?.enabled && (target.dataset.path.startsWith('inventory.') || target.dataset.path==='level')) {persist();render();}
    }
  });
  document.addEventListener("click", event => {
    const tab = event.target.closest("[data-tab]");
    if (tab) { switchTab(tab.dataset.tab, false); return; }
    const action = event.target.closest("[data-action]");
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
  byId("editor-dialog").addEventListener("close", () => { flushAndPersist(); render(); });
  let printDetails = [];
  window.addEventListener("beforeprint", () => {
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
  if(character.build?.enabled)healthAdjustment.pool='auto';
  render();
  persist();
})();
