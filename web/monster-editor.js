"use strict";

// Browser changes and custom.yaml contain additions and targeted overrides.
(() => {
  const storageKey="vara.monsters.v1",originals=new Map();
  const clone=value=>JSON.parse(JSON.stringify(value));
  const object=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
  let changes=new Map(),storageError="",fileHandle;
  const targetOf=entry=>clone(entry.monster_target||{source:entry.source||"",group:entry.group||"",name:entry.name});
  const targetKey=target=>JSON.stringify([target.source||"",target.group||"",target.name]);
  const id=entry=>entry._monsterEditorKey||(entry.details?.id?"id:"+entry.details.id:targetKey(targetOf(entry)));
  const provenance=key=>/^(?:source_|original_|conversion_|replacement_sources$|fallback_reference$)/.test(key);
  function validTarget(target){return object(target)&&["source","group","name"].every(key=>typeof target[key]==="string")&&target.name.trim();}
  function validate(entry){
    if(!object(entry)||typeof entry.name!=="string"||!entry.name.trim()||entry.name.length>300||typeof entry.group!=="string"||!entry.group.trim()||!object(entry.details))throw new Error("A monster needs a name, a collection, and statblock fields.");
    const result=clone(entry);result.name=result.name.trim();result.group=result.group.trim();
    if(["name","group","source","section","monster_target","monster_overrides","_monsterEditorKey"].some(key=>Object.hasOwn(result.details,key)))throw new Error("Additional fields cannot contain reserved catalog fields (name, group, source or section).");
    for(const field of ["traits","actions","bonus_actions","reactions","legendary_actions","mythic_actions","lair_actions","regional_effects"])
      if(result.details[field]!=null&&(!Array.isArray(result.details[field])||result.details[field].some(row=>!object(row)||typeof row.name!=="string"||!row.name.trim()||typeof row.description!=="string")))throw new Error(field.replace(/_/g," ")+" must contain named descriptions.");
    if(result.details.abilities!=null&&!object(result.details.abilities))throw new Error("Ability scores must be a mapping.");
    for(const field of ["ac","hp","speed","block","cr"])if(result.details[field]!=null&&typeof result.details[field]==="object")throw new Error(field.toUpperCase()+" must be text or a number.");
    if(result.details.encounter_theme!=null&&(typeof result.details.encounter_theme!=="string"||!result.details.encounter_theme.trim()))throw new Error("Theme / setting must be nonempty text.");
    return result;
  }
  function validateIdentities(next){
    const identities=new Map(),addName=(key,name)=>{const identity=name.trim().normalize("NFKC").toLowerCase();if(identities.has(identity)&&identities.get(identity)!==key)throw new Error("Another monster already has this name, or this name is reserved by a renamed monster.");identities.set(identity,key);},add=(key,entry)=>addName(key,entry.name);
    for(const [key,entry]of originals)add(key,next.get(key)?.entry||entry);
    for(const [key,row]of next)if(!originals.has(key))add(key,row.entry);
    for(const [key,entry]of originals)addName(key,targetOf(entry).name);
    for(const [key,row]of next)if(row.target)addName(key,row.target.name);
  }
  function persist(next){changes=next;try{if(!globalThis.localStorage)throw new Error("Storage unavailable");globalThis.localStorage.setItem(storageKey,JSON.stringify({version:1,changes:[...next].map(([key,row])=>({key,...row}))}));storageError="";}catch(_){storageError="This browser could not save your changes. Export custom.yaml before closing the page.";}return !storageError;}
  try{
    const saved=globalThis.localStorage?.getItem(storageKey);
    if(saved){const parsed=JSON.parse(saved);if(parsed.version!==1||!Array.isArray(parsed.changes))throw new Error("Unsupported save");const next=new Map();for(const row of parsed.changes){if(!object(row)||typeof row.key!=="string"||next.has(row.key)||!["addition","override"].includes(row.mode)||(row.mode==="override"&&!validTarget(row.target)))throw new Error("Invalid save");next.set(row.key,{mode:row.mode,...(row.target?{target:row.target}:{}),entry:validate(row.entry)});}changes=next;}
  }catch(_){storageError="Saved monster edits could not be loaded. Import a custom.yaml backup to recover them.";}
  function cleanEntry(entry){const result=clone(entry);delete result._monsterEditorKey;return result;}
  function keepProvenance(entry,original){
    const result=clone(entry);if(!original)return result;
    if(!Object.hasOwn(result.details,"encounter_theme")&&original.details.encounter_theme)result.details.encounter_theme=original.details.encounter_theme;
    for(const key of Object.keys(result.details))if(provenance(key))delete result.details[key];
    for(const[key,value]of Object.entries(original.details||{}))if(provenance(key))result.details[key]=clone(value);
    return result;
  }
  function apply(section){
    if(section?.key!=="monsters")return section;
    for(const entry of section.entries){const key=id(entry);if(!originals.has(key)&&!entry._monsterEditorKey)originals.set(key,cleanEntry(entry));}
    const result=[];
    for(const [key,original]of originals){const row=changes.get(key),value=clone(row?.entry||original);if(row?.mode==="override"){value.source=original.source;value.monster_target=clone(row.target);if(!Object.hasOwn(value.details,"encounter_theme")&&original.details.encounter_theme)value.details.encounter_theme=original.details.encounter_theme;for(const field of Object.keys(value.details))if(provenance(field))delete value.details[field];for(const [field,item]of Object.entries(original.details))if(provenance(field))value.details[field]=clone(item);}value._monsterEditorKey=key;result.push(value);}
    for(const [key,row]of changes)if(row.mode==="addition"&&!originals.has(key))result.push({...clone(row.entry),_monsterEditorKey:key});
    section.entries=result;return section;
  }
  function save(section,original,edited,duplicate=false){
    const entry=validate(edited),next=new Map(changes);let savedKey;
    if(original&&!duplicate){const key=id(original),previous=changes.get(key),target=previous?.target||targetOf(originals.get(key)||original),mode=previous?.mode||(original.source==="monsters/custom.yaml"&&!original.monster_target?"addition":"override");if(original.details?.id&&entry.details.id!==original.details.id)throw new Error("A monster's ID cannot change.");next.set(key,{mode,...(mode==="addition"?{}:{target}),entry:cleanEntry(keepProvenance({...entry,source:original.source},originals.get(key)||original))});savedKey=key;}
    else{entry.details.id="custom-"+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));entry.source="monsters/custom.yaml";delete entry.monster_target;delete entry._monsterEditorKey;const key=id(entry);next.set(key,{mode:"addition",entry:cleanEntry(entry)});savedKey=key;}
    validateIdentities(next);persist(next);apply(section);return section.entries.find(value=>id(value)===savedKey);
  }
  function reset(section,entry){const next=new Map(changes);next.delete(id(entry));persist(next);apply(section);}
  const flatten=entry=>({name:entry.name,group:entry.group,...clone(entry.details)});
  function customCollection(){
    const records=new Map();
    for(const [key,entry]of originals){if(entry.monster_target)records.set(key,{mode:"override",target:targetOf(entry),entry});else if(entry.source==="monsters/custom.yaml")records.set(key,{mode:"addition",entry});}
    for(const [key,row]of changes)records.set(key,{...row,entry:keepProvenance(row.entry,originals.get(key))});
    const result={section:"monsters",entries:[],monster_overrides:[]};for(const row of records.values()){if(row.mode==="addition")result.entries.push(flatten(row.entry));else result.monster_overrides.push({target:clone(row.target),entry:flatten(row.entry)});}return result;
  }
  function sourceCollection(section){return{section:"monsters",entries:section.entries.map(flatten)};}
  function importCollection(value,section){
    if(!object(value)||value.section!=="monsters"||!Array.isArray(value.entries)||(value.monster_overrides!=null&&!Array.isArray(value.monster_overrides)))throw new Error("Choose a monster YAML collection exported from this editor.");
    const next=new Map(changes),seen=new Set(),unpack=raw=>{if(!object(raw))throw new Error("Every monster must be a mapping.");const{name,group,...details}=clone(raw);return validate({name,group:group||"Custom monsters",source:"monsters/custom.yaml",details});};
    for(const raw of value.entries){const entry=unpack(raw);if(!entry.details.id)entry.details.id="custom-import-"+JSON.stringify([entry.group,entry.name]);const key=id(entry);if(seen.has(key))throw new Error("The file repeats a monster ID.");seen.add(key);const original=originals.get(key)||[...originals.values()].find(item=>item.name===entry.name&&item.group===entry.group),actualKey=original?id(original):key;if(original&&original.source!=="monsters/custom.yaml")next.set(actualKey,{mode:"override",target:targetOf(original),entry:{...entry,source:original.source,details:{...entry.details,...(original.details.id?{id:original.details.id}:{})}}});else next.set(actualKey,{mode:"addition",entry});}
    for(const row of value.monster_overrides||[]){if(!object(row)||!validTarget(row.target))throw new Error("An override needs its original source, collection and name.");const original=[...originals.values()].find(item=>targetKey(targetOf(item))===targetKey(row.target));if(!original)throw new Error("The overridden monster is missing from this catalog: "+row.target.name);const key=id(original);if(seen.has(key))throw new Error("The file repeats an overridden monster.");seen.add(key);const entry=unpack(row.entry);if(original.details.id&&entry.details.id!==original.details.id)throw new Error("A monster's ID cannot change.");next.set(key,{mode:"override",target:clone(row.target),entry:{...entry,source:original.source}});}
    validateIdentities(next);persist(next);apply(section);return!storageError;
  }
  // Quoted scalars keep dice, dates, colons and multiline descriptions intact.
  function stringifyYaml(value,indent=0){
    const pad=" ".repeat(indent);
    if(Array.isArray(value))return value.length?value.map(item=>(object(item)&&Object.keys(item).length)||(Array.isArray(item)&&item.length)?pad+"-\n"+stringifyYaml(item,indent+2):pad+"- "+JSON.stringify(item)).join("\n"):pad+"[]";
    if(object(value))return Object.entries(value).map(([key,item])=>{const label=/^[a-zA-Z_][\w-]*$/.test(key)?key:JSON.stringify(key);if((object(item)&&Object.keys(item).length)||(Array.isArray(item)&&item.length))return pad+label+":\n"+stringifyYaml(item,indent+2);return pad+label+": "+JSON.stringify(item);}).join("\n");
    return pad+JSON.stringify(value);
  }
  function parseYaml(text){
    if(typeof text!=="string"||text.length>10000000)throw new Error("The YAML file is too large.");
    const source=text.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n");try{return JSON.parse(source);}catch(_){}
    const lines=source.split("\n");let position=0;
    const error=()=>new Error("Unsupported or invalid YAML near line "+(position+1)+". Use a file exported from this editor."),skip=()=>{while(position<lines.length&&(!lines[position].trim()||/^\s*(?:#|---\s*$|\.\.\.\s*$)/.test(lines[position])))position++;},indentation=line=>line.match(/^ */)[0].length;
    const scalar=text=>{text=text.trim();if(/^[!&*]/.test(text))throw error();if(text.startsWith('"')||text.startsWith("[")||text.startsWith("{")){try{return JSON.parse(text);}catch(_){throw error();}}if(text.startsWith("'")){if(!text.endsWith("'"))throw error();return text.slice(1,-1).replace(/''/g,"'");}if(text==="null"||text==="~")return null;if(text==="true")return true;if(text==="false")return false;if(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text))return Number(text);return text.replace(/\s+#.*$/,"");};
    function read(indent){
      skip();if(position>=lines.length)return{};const list=/^(?:-\s|-$)/.test(lines[position].slice(indent)),result=list?[]:{};
      while(position<lines.length){skip();if(position>=lines.length)break;const line=lines[position],depth=indentation(line);if(depth<indent)break;if(depth!==indent||line.includes("\t"))throw error();let content=line.slice(indent);
        if(list){if(!/^(?:-\s|-$)/.test(content))break;content=content.slice(1).trimStart();position++;if(!content){skip();result.push(position<lines.length&&indentation(lines[position])>indent?read(indentation(lines[position])):null);continue;}if(/^[^\[\{"'].*?:\s/.test(content)||/^[\w-]+:$/.test(content)){lines.splice(position,0," ".repeat(indent+2)+content);result.push(read(indent+2));}else result.push(scalar(content));}
        else{const match=content.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:#][^:]*):(?:\s+(.*)|\s*)$/);if(!match)throw error();const key=String(scalar(match[1]));if(["__proto__","prototype","constructor"].includes(key)||Object.hasOwn(result,key))throw error();const tail=match[2]?.trim()||"";position++;
          if(/^[|>][+-]?$/.test(tail)){const values=[];let textIndent;while(position<lines.length&&(!lines[position].trim()||indentation(lines[position])>indent)){if(lines[position].trim()&&textIndent===undefined)textIndent=indentation(lines[position]);values.push(lines[position].slice(textIndent||indent+2));position++;}result[key]=values.join(tail.startsWith(">")?" ":"\n")+(tail.endsWith("-")?"":"\n");}
          else if(tail)result[key]=scalar(tail);else{skip();result[key]=position<lines.length&&indentation(lines[position])>indent?read(indentation(lines[position])):null;}
        }
      }return result;
    }
    skip();const value=read(position<lines.length?indentation(lines[position]):0);skip();if(position<lines.length)throw error();return value;
  }
  function searchable(entry){return Object.fromEntries(Object.entries(entry.details||{}).filter(([key])=>!provenance(key)));}
  const node=(tag,text,className)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(className)value.className=className;return value;};
  const button=(text,action,className="button-link")=>{const value=node("button",text,className);value.type="button";value.addEventListener("click",action);return value;};
  function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:"application/yaml"})),anchor=node("a");anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function saveFile(){if(typeof globalThis.showSaveFilePicker!=="function"){download("custom.yaml",stringifyYaml(customCollection())+"\n");return"Downloaded custom.yaml. Replace data/monsters/custom.yaml and rebuild to update the shared catalog.";}if(!fileHandle)fileHandle=await globalThis.showSaveFilePicker({suggestedName:"custom.yaml",types:[{description:"Monster YAML",accept:{"application/yaml":[".yaml"]}}]});const writable=await fileHandle.createWritable();await writable.write(stringifyYaml(customCollection())+"\n");await writable.close();return"Saved "+fileHandle.name+". Rebuild the compendium to update the shared catalog.";}
  function toolbar(section,changed){
    const wrap=node("section",undefined,"monster-tools");wrap.setAttribute("aria-label","Monster editor");
    const status=node("p",storageError||"Your changes save on this device. Export a backup to keep a portable copy.","state-message");status.setAttribute("role","status");
    const actions=node("div",undefined,"monster-editor-actions collection-actions"),menu=node("details",undefined,"utility-menu"),contents=node("div",undefined,"utility-menu-content");
    menu.append(node("summary","Tools"));
    contents.append(button("Export custom.yaml",()=>download("custom.yaml",stringifyYaml(customCollection())+"\n")),button("Save YAML file…",async()=>{try{status.textContent=await saveFile();}catch(error){if(error.name!=="AbortError")status.textContent=error.message;}}));
    const input=node("input");input.type="file";input.accept=".yaml,.yml,.json";input.hidden=true;input.addEventListener("change",async()=>{const file=input.files?.[0];if(!file)return;try{importCollection(parseYaml(await file.text()),section);changed();}catch(error){status.textContent=error.message;}input.value="";});
    contents.append(button("Import monster YAML",()=>input.click()),input);
    if(!storageError)contents.append(status);menu.append(contents);actions.append(button("Create monster",()=>open(section,null,changed),"monster-primary"),menu);wrap.append(actions);if(storageError)wrap.append(status);return wrap;
  }
  function editor(section,entry,changed){
    const wrap=node("div",undefined,"monster-editor-actions"),menu=node("details",undefined,"utility-menu monster-entry-menu"),contents=node("div",undefined,"utility-menu-content");menu.append(node("summary","Monster tools"));
    contents.append(button("Edit statblock",()=>open(section,entry,changed)),button("Duplicate monster",()=>open(section,entry,changed,true)));
    if(changes.has(id(entry)))contents.append(button(changes.get(id(entry)).mode==="addition"&&!originals.has(id(entry))?"Remove custom monster":"Reset browser edit",()=>{if(globalThis.confirm?.("Remove this browser change? Export custom.yaml first if you need a backup.")===false)return;reset(section,entry);changed();},"button-link button-danger"));
    menu.append(contents);wrap.append(menu);if(storageError){const warning=node("p",storageError,"state-message");warning.setAttribute("role","status");wrap.append(warning);}return wrap;
  }
  const scalarFields=[
    ["meta","Creature summary","e.g. Medium humanoid, neutral"],["cr","Challenge","e.g. 2"],["ac","Armor class","e.g. 14"],["hp","Hit points","e.g. 32 (5d8 + 10)"],["block","Block pool / check","e.g. 3 / +5"],["speed","Speed","e.g. 30 ft., climb 20 ft."],["proficiency_bonus","Proficiency bonus","e.g. +2"],["saving_throws","Saving throws","e.g. STR +5, CON +4"],["skills","Skills","e.g. Perception +4"],["senses","Senses","e.g. darkvision 60 ft."],["languages","Languages","e.g. Common, Draconic"],["damage_resistances","Damage resistances","e.g. cold"],["damage_immunities","Damage immunities","e.g. poison"],["damage_vulnerabilities","Damage vulnerabilities",""],["condition_immunities","Condition immunities",""],
    ["encounter_theme","Theme / setting","e.g. Seas & coasts"]
  ];
  const actionFields=[["traits","Traits"],["actions","Actions"],["bonus_actions","Bonus actions"],["reactions","Reactions"],["legendary_actions","Legendary actions"],["mythic_actions","Mythic actions"],["lair_actions","Lair actions"],["regional_effects","Regional effects"]];
  function preview(entry){
    if(globalThis.MonsterViews){const block=globalThis.MonsterViews.statblock(entry);block.classList.add("monster-editor-preview");return block;}
    const wrap=node("article",undefined,"monster-editor-preview stat-block"),d=entry.details||{};wrap.append(node("h2",entry.name||"Your monster"));if(d.meta)wrap.append(node("p",d.meta,"monster-meta"));const stats=node("dl",undefined,"stats monster-stats");
    for(const[key,title]of[["ac","Armor class"],["hp","Hit points"],["block","Block"],["speed","Speed"],["cr","Challenge"]])if(d[key]!=null&&d[key]!==""){const field=node("div");field.append(node("dt",title),node("dd",String(d[key])));stats.append(field);}wrap.append(stats);
    if(d.abilities){const scores=node("dl",undefined,"stats monster-abilities");for(const[key,value]of Object.entries(d.abilities)){const field=node("div");field.append(node("dt",key.toUpperCase()),node("dd",String(value)));scores.append(field);}wrap.append(scores);}
    for(const[key,title]of scalarFields.slice(6))if(d[key])wrap.append(node("p",title+": "+(typeof d[key]==="object"?JSON.stringify(d[key]):d[key])));if(d.description||d.desc)wrap.append(node("p",d.description||d.desc));
    for(const[key,title]of actionFields)if(d[key]?.length){wrap.append(node("h3",title));for(const row of d[key]){const p=node("p");p.append(node("strong",row.name+". "),document.createTextNode(row.description));if(row.block_dc)p.append(document.createTextNode(" Block DC "+row.block_dc+"."));wrap.append(p);}}return wrap;
  }
  function open(section,original,changed,duplicate=false){
    document.querySelector("dialog.monster-editor-dialog")?.remove();const seed=original?clone(original):{name:"",group:"Custom monsters",source:"monsters/custom.yaml",details:{meta:"Medium humanoid",cr:"1",ac:"12",hp:"20 (3d8 + 6)",block:"2 / +2",speed:"30 ft.",abilities:{str:"10",dex:"14",con:"14",int:"10",wis:"10",cha:"10"},actions:[]}};
    if(duplicate){seed.name+=" (copy)";delete seed.details.id;delete seed.monster_target;}
    const dialog=node("dialog",undefined,"monster-editor-dialog");dialog.setAttribute("aria-labelledby","monster-editor-title");dialog.setAttribute("data-view","edit");const heading=node("header",undefined,"monster-editor-heading");heading.append(node("h2",original&&!duplicate?"Edit monster":"Create monster"));heading.firstChild.id="monster-editor-title";heading.append(button("Close",()=>dialog.close()));dialog.append(heading);
    const body=node("div",undefined,"monster-editor-body"),form=node("form",undefined,"monster-editor-form"),previewHost=node("section",undefined,"monster-editor-preview-host");form.id="monster-statblock-form";previewHost.setAttribute("aria-label","Live statblock preview");const fields=new Map(),rowLists=new Map();
    const viewbar=node("div",undefined,"monster-editor-viewbar");viewbar.setAttribute("role","group");viewbar.setAttribute("aria-label","Editor view");
    function setView(view){dialog.setAttribute("data-view",view);for(const control of views)control.setAttribute("aria-pressed",String(control.getAttribute("data-view")===view));}
    const views=["edit","preview"].map(view=>button(view==="edit"?"Edit":"Preview",()=>setView(view),"monster-editor-view"));
    views.forEach((control,index)=>{control.setAttribute("data-view",index?"preview":"edit");control.setAttribute("aria-pressed",String(!index));viewbar.append(control);});dialog.append(viewbar);
    function field(parent,key,title,value,placeholder="",multiline=false){const label=node("label",title),input=node(multiline?"textarea":"input");input.value=value??"";if(placeholder)input.placeholder=placeholder;if(multiline)input.rows=4;label.append(input);parent.append(label);fields.set(key,input);return input;}
    const identity=node("fieldset");identity.append(node("legend","Basics"));field(identity,"name","Name",seed.name).required=true;field(identity,"group","Collection",seed.group).required=true;
    const combat=node("fieldset"),defenses=node("fieldset");combat.append(node("legend","Combat statistics"));defenses.append(node("legend","Senses and defenses"));
    for(const[key,title,placeholder]of scalarFields){if(object(seed.details[key])||Array.isArray(seed.details[key]))continue;const parent=["meta","cr","encounter_theme"].includes(key)?identity:["ac","hp","block","speed","proficiency_bonus"].includes(key)?combat:defenses;field(parent,key,title,seed.details[key],placeholder);}form.append(identity,combat,defenses);
    const themeOptions=node("datalist");themeOptions.id="monster-theme-options";fields.get("encounter_theme").setAttribute("list",themeOptions.id);for(const title of [...new Set(section.entries.map(entry=>entry.details?.encounter_theme).filter(Boolean))].sort()){const option=node("option");option.value=title;themeOptions.append(option);}identity.append(themeOptions);
    const abilities=node("fieldset");abilities.append(node("legend","Ability scores"));for(const key of["str","dex","con","int","wis","cha"])field(abilities,"ability_"+key,key.toUpperCase(),seed.details.abilities?.[key]??"");form.append(abilities);
    const story=node("fieldset");story.append(node("legend","Description"));field(story,"description","Description and lore",seed.details.description||seed.details.desc||"","",true);form.append(story);
    for(const[key,title]of actionFields){const box=node("fieldset");box.append(node("legend",title));const rows=node("div");box.append(rows);const list=[];rowLists.set(key,list);
      const add=(value={name:"",description:""})=>{const wrap=node("div",undefined,"monster-action-row"),nameLabel=node("label","Name"),name=node("input"),descLabel=node("label","Description"),description=node("textarea"),blockLabel=node("label","Block DC (if applicable)"),block=node("input");name.value=value.name||"";description.value=value.description||"";description.rows=3;block.value=value.block_dc||"";nameLabel.append(name);descLabel.append(description);blockLabel.append(block);const row={seed:clone(value),name,description,block,wrap};list.push(row);wrap.append(nameLabel,descLabel,blockLabel,button("Remove",()=>{list.splice(list.indexOf(row),1);wrap.remove();update();}));rows.append(wrap);update();};
      box.append(button("Add "+title.toLowerCase().replace(/s$/,""),()=>add()));form.append(box);box._populate=()=>{for(const row of seed.details[key]||[])add(row);};
    }
    const known=new Set([...scalarFields.map(row=>row[0]),...actionFields.map(row=>row[0]),"abilities","description","desc"]),extras=Object.fromEntries(Object.entries(seed.details).filter(([key])=>!known.has(key)||object(seed.details[key])||Array.isArray(seed.details[key])&&!actionFields.some(row=>row[0]===key)));
    const advanced=node("details");advanced.append(node("summary","Additional fields (JSON)"));field(advanced,"extras","Preserved source fields and additional statistics",JSON.stringify(extras,null,2),"",true);fields.get("extras").rows=8;form.append(advanced);
    const message=node("p","","monster-editor-message");message.setAttribute("role","status");const footer=node("footer",undefined,"monster-editor-footer"),actions=node("div",undefined,"monster-editor-actions"),submit=node("button","Save monster","monster-primary");submit.type="submit";submit.setAttribute("form",form.id);actions.append(submit,button("Cancel",()=>dialog.close()));footer.append(message,actions);body.append(form,previewHost);dialog.append(body,footer);
    function collect(){let details;try{details=JSON.parse(fields.get("extras").value||"{}");}catch(_){throw new Error("Additional fields must contain valid JSON.");}if(!object(details))throw new Error("Additional fields must be a JSON object.");for(const[key]of scalarFields)if(fields.has(key)){const value=fields.get(key).value.trim();if(value)details[key]=value;else delete details[key];}const description=fields.get("description").value.trim();if(description)details.description=description;details.abilities={};for(const key of["str","dex","con","int","wis","cha"]){const value=fields.get("ability_"+key).value.trim();if(value)details.abilities[key]=value;}for(const[key,list]of rowLists){const rows=list.map(row=>{const result={...clone(row.seed),name:row.name.value.trim(),description:row.description.value.trim()};if(row.block.value.trim())result.block_dc=row.block.value.trim();else delete result.block_dc;return result;});if(rows.length)details[key]=rows;else delete details[key];}return{...seed,name:fields.get("name").value,group:fields.get("group").value,details};}
    function update(){if(!fields.has("extras"))return;try{previewHost.replaceChildren(preview(collect()));message.textContent="";}catch(error){message.textContent=error.message;}}
    form.addEventListener("input",update);form.addEventListener("invalid",()=>setView("edit"),true);form.addEventListener("submit",event=>{event.preventDefault();try{const result=save(section,original,collect(),duplicate);dialog.close();changed(result);}catch(error){message.textContent=error.message;}});for(const fieldset of form.querySelectorAll("fieldset"))fieldset._populate?.();update();dialog.addEventListener("close",()=>dialog.remove());document.body.append(dialog);dialog.showModal();fields.get("name").focus();
  }
  globalThis.MonsterEditor={apply,save,reset,validate,id,toolbar,editor,open,searchable,customCollection,sourceCollection,importCollection,stringifyYaml,parseYaml,preview,get storageError(){return storageError;}};
})();
