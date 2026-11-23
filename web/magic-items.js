"use strict";

// Local item edits are separate from the compiled source until exported.
(() => {
  const storageKey = "vara.magic-items.v1";
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const originals = new Map();
  const provenanceKey = key => /^source_/.test(key) || key === "original_5e";
  let overrides = new Map();
  let storageError = "";
  const id = entry => String(entry.details?.id || JSON.stringify([entry.source || "", entry.group || "", entry.name]));
  function entryId(section, entry) {
    return JSON.stringify(section === "magic-items" && entry.details?.id
      ? [section, "", String(entry.details.id)] : [section, entry.group || "", entry.name]);
  }
  function validate(entry, expectedId) {
    if (!object(entry) || typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 300
      || typeof entry.group !== "string" || !object(entry.details)) throw new Error("Each item needs a name, group and item fields.");
    if (expectedId && id(entry) !== expectedId) throw new Error("An item's ID cannot change.");
    if (Object.hasOwn(entry.details,"name") || Object.hasOwn(entry.details,"group")) {
      throw new Error("Name and collection must be edited in their own fields.");
    }
    if (Object.hasOwn(entry.details,"magic_bonus")) {
      const value=entry.details.magic_bonus;
      if (!["number","string"].includes(typeof value) || String(value).trim()===""
        || !Number.isFinite(Number(value)) || !Number.isInteger(Number(value))) {
        throw new Error("Magic bonus must be a whole number.");
      }
    }
    const result=clone({...entry,name:entry.name.trim(),group:entry.group.trim()});
    const original=originals.get(expectedId);
    if(original) {
      result.source=original.source;
      for(const key of Object.keys(result.details))if(provenanceKey(key))delete result.details[key];
      for(const [key,value] of Object.entries(original.details || {}))if(provenanceKey(key))result.details[key]=clone(value);
    }
    return result;
  }
  function validateIdentities(next) {
    const seen=new Map();
    for(const [key,original] of originals) {
      const entry=next.get(key) || original;
      const identity=JSON.stringify([entry.group.trim().toLowerCase(),entry.name.trim().toLowerCase()]);
      if(seen.has(identity) && seen.get(identity)!==key)throw new Error("Another item already has this name in this collection.");
      seen.set(identity,key);
    }
  }
  try {
    const saved = globalThis.localStorage?.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.version !== 1 || !Array.isArray(parsed.entries)) throw new Error("Unsupported item save.");
      overrides = new Map(parsed.entries.map(row => [row.id, validate(row.entry, row.id)]));
    }
  } catch (_) { storageError = "Saved item edits could not be loaded. Import a backup to recover them."; }
  function persist(next) {
    try {
      if (!globalThis.localStorage) throw new Error("Storage unavailable");
      globalThis.localStorage.setItem(storageKey, JSON.stringify({version:1, entries:[...next].map(([id,entry]) => ({id,entry}))}));
      storageError = "";
    } catch (_) { storageError = "This browser could not save item edits. Export a backup before closing this page."; }
    overrides = next;
    return !storageError;
  }
  function apply(section) {
    if (section?.key !== "magic-items") return section;
    for (let index = 0; index < section.entries.length; index++) {
      const entry = section.entries[index], key = id(entry);
      if (!originals.has(key)) originals.set(key, clone(entry));
      const original = originals.get(key);
      if(overrides.has(key))overrides.set(key,validate(overrides.get(key),key));
      section.entries[index] = clone(overrides.has(key) ? overrides.get(key) : original);
    }
    return section;
  }
  function save(entry, edited) {
    const key = id(entry);
    if (!originals.has(key)) originals.set(key, clone(entry));
    const next = new Map(overrides);
    next.set(key, validate({...edited, source:originals.get(key).source}, key));
    validateIdentities(next);
    return persist(next);
  }
  function reset(entry) {
    const next = new Map(overrides); next.delete(id(entry)); return persist(next);
  }
  function backup() {
    return {kind:"vara.magic-items",version:1,entries:[...overrides].map(([id,entry]) => ({id,entry:validate(entry,id)}))};
  }
  function importBackup(value) {
    if (!object(value) || value.kind !== "vara.magic-items" || value.version !== 1 || !Array.isArray(value.entries)) {
      throw new Error("Choose a Varis magic item backup exported from this page.");
    }
    const next = new Map(overrides), seen = new Set();
    for (const row of value.entries) {
      if (!object(row) || typeof row.id !== "string" || seen.has(row.id)) throw new Error("The backup contains an invalid or repeated item ID.");
      if (!originals.has(row.id)) throw new Error("The backup contains an item missing from this catalog: " + (row.entry?.name || row.id));
      seen.add(row.id);
      next.set(row.id, validate({...row.entry,source:originals.get(row.id).source}, row.id));
    }
    validateIdentities(next);
    return persist(next);
  }
  function sourceCollection(section, source) {
    return {section:"magic-items",entries:section.entries.filter(entry => entry.source === source).map(entry => ({...clone(entry.details),name:entry.name,group:entry.group}))};
  }
  function equipment(entry, catalog, row) {
    if (entry?.section !== "magic-items") return entry;
    const base = (catalog || []).find(section => section.key === "items")?.entries.find(item => item.name.toLowerCase() === String(entry.details?.base_item || "").toLowerCase());
    const active=!row || !requiresAttunement(entry) || row.attuned===true;
    const profile=["damage","properties","Base AC","AC bonus","maneuvers"];
    const details = {...entry.details};
    for (const key of profile) {
      if(base?.details?.[key]!==undefined)details[key]=clone(base.details[key]);
      else delete details[key];
      if(active && entry.details?.[key]!==undefined)details[key]=clone(entry.details[key]);
    }
    if(base?.details?.type!==undefined)details.type=base.details.type;
    if(active && ["simple","martial"].includes(String(entry.details?.weapon_type).toLowerCase()))details.type=String(entry.details.weapon_type).toLowerCase();
    const group=(active && entry.details?.weapon_group) || base?.group || entry.group;
    if(active && entry.details?.weapon_group)details.group=entry.details.weapon_group;
    return {...entry,group,details};
  }
  function inventoryFields(entry) {
    const bonus = Number(entry.details?.magic_bonus);
    return {...(Number.isFinite(bonus) && bonus ? {magicBonus:bonus} : {}),...(requiresAttunement(entry)?{attuned:false}:{})};
  }
  function requiresAttunement(entry) {
    const value=String(entry?.details?.attunement || "").trim().toLowerCase();
    return !!value && !/^(?:no|none|false|not required|not needed)(?:$|\s|\()/.test(value) && !["-","n/a"].includes(value);
  }
  function searchable(entry) {
    const details={...entry.details};
    for(const key of Object.keys(details))if(/^(?:original_|source_|conversion_notes$)/.test(key))delete details[key];
    return details;
  }
  function download(name, value) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+"\n"],{type:"application/json"}));
    const a = document.createElement("a"); a.href=url; a.download=name; a.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  function node(tag, text, className) {
    const result=document.createElement(tag); if(text!==undefined)result.textContent=text;
    if(className)result.className=className; return result;
  }
  function button(text, action) {
    const result=node("button",text,"button-link"); result.type="button"; result.addEventListener("click",action); return result;
  }
  function toolbar(section, changed) {
    const wrap=node("section",undefined,"magic-tools");
    wrap.setAttribute("aria-label","Magic item backups");
    const status=node("p",storageError || "Item edits save in this browser. Export a backup to use them elsewhere.","state-message");
    status.setAttribute("role","status");
    const controls=node("div",undefined,"magic-actions");
    controls.append(button("Export item edits",() => download("Varis-magic-item-edits.json",backup())));
    const input=node("input");input.type="file";input.accept=".json,application/json";input.hidden=true;
    input.addEventListener("change",async () => {
      const file=input.files?.[0];if(!file)return;
      try {
        if(file.size>10000000)throw new Error("The backup is too large.");
        importBackup(JSON.parse(await file.text()));apply(section);changed();
      } catch(error){status.textContent=error.message;}
      input.value="";
    });
    controls.append(button("Import item edits",() => input.click()),input);
    wrap.append(controls,status);return wrap;
  }
  function editor(section, entry, changed) {
    const wrap=node("details",undefined,"magic-editor");
    wrap.append(node("summary","Edit this item"));
    const form=node("form"), fields=[];
    const status=node("p",overrides.has(id(entry))?"This item has edits saved in this browser.":"Edit the converted rules below. Save changes when finished.","state-message");
    status.setAttribute("role","status");form.append(status);
    const edited=clone(entry);
    function textField(title,value,setter,long=false) {
      const label=node("label",undefined,"magic-field");label.append(node("span",title));
      const input=node(long?"textarea":"input");if(!long)input.type="text";else input.rows=Math.min(12,Math.max(3,String(value || "").split("\n").length+1));
      input.value=String(value ?? "");label.append(input);form.append(label);fields.push(() => setter(input.value));
    }
    textField("Name",entry.name,value=>edited.name=value);
    textField("Collection",entry.group,value=>edited.group=value);
    for(const [key,value] of Object.entries(entry.details || {})) {
      if(key === "id" || provenanceKey(key))continue;
      const title=/^(?:desc|description)$/.test(key)?"Converted rules":key.replace(/_/g," ").replace(/^./,c=>c.toUpperCase());
      if(value===null || typeof value!=="object") {
        textField(title,value,text=>edited.details[key]=typeof value==="number"?Number(text):text,/desc|rules|notes|effect|usage|activation|recharge/i.test(key)||String(value).length>100);
      } else {
        const group=node("details",undefined,"magic-advanced");group.append(node("summary",title+" (structured fields)"));
        const label=node("label",undefined,"magic-field"), input=node("textarea");
        label.append(node("span",title+" as JSON"));input.rows=8;input.value=JSON.stringify(value,null,2);label.append(input);group.append(label);form.append(group);
        fields.push(() => {try{edited.details[key]=JSON.parse(input.value);}catch(_){throw new Error("Check the JSON in "+title+".");}});
      }
    }
    function saveDraft() {
      fields.forEach(set=>set());
      if(section.entries.some(other=>id(other)!==id(entry)&&other.name.toLowerCase()===edited.name.trim().toLowerCase()&&other.group.toLowerCase()===edited.group.trim().toLowerCase()))throw new Error("Another item already has this name in this collection.");
      save(entry,edited);apply(section);
      return section.entries.find(item=>id(item)===id(entry));
    }
    const actions=node("div",undefined,"magic-actions");
    const saveButton=node("button","Save changes","button-link");saveButton.type="submit";
    actions.append(saveButton,button("Discard changes",() => {wrap.open=false;changed();}),button("Restore source version",() => {
      if(!globalThis.confirm("Restore this item's original converted rules?"))return;
      reset(entry);apply(section);changed();
    }),button("Export source file",() => {
      try {
        const updated=saveDraft();
        download((entry.source || "magic-items.yaml").split("/").at(-1),sourceCollection(section,entry.source));
        if(storageError){status.textContent="Source file exported. "+storageError;return;}
        changed(updated);
      }catch(error){status.textContent=error.message;}
    }));
    form.addEventListener("submit",event => {
      event.preventDefault();try {
        const updated=saveDraft();
        if(storageError){status.textContent=storageError;return;}
        changed(updated);
      }catch(error){status.textContent=error.message;}
    });
    form.append(actions,node("p","Export source file saves your current edits and includes every item from this source. Replace the matching file under data/magic-items and rebuild to keep the changes in Git.","state-message"));
    wrap.append(form);return wrap;
  }
  globalThis.MagicItems={id,entryId,apply,save,reset,backup,importBackup,sourceCollection,equipment,inventoryFields,requiresAttunement,searchable,toolbar,editor,
    get storageError(){return storageError;}};
})();
