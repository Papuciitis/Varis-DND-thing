"use strict";

// Creature presentation is independent of source file shape and reader routes.
(() => {
  const types=Object.freeze(["aberration","beast","celestial","construct","dragon","elemental","fey","fiend","giant","humanoid","monstrosity","ooze","plant","undead","object"]);
  const titles=Object.freeze(Object.fromEntries(types.map(type=>[type,type[0].toUpperCase()+type.slice(1)])));
  const normalize=value=>String(value??"").normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
  const cap=value=>String(value??"").replace(/^./,char=>char.toUpperCase());
  const object=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
  const present=value=>value!=null&&value!==""&&(!Array.isArray(value)||value.length>0);
  const provenance=key=>/^(?:original_|source_|conversion_|replacement_sources$|fallback_reference$|ability_score_sources$)/.test(key);
  function challenge(value){
    if(typeof value!=="number"&&typeof value!=="string")return null;
    const text=String(value).trim().replace(/^CR\s*/i,"").replace(/[⅛¼½]/g,char=>({"⅛":"1/8","¼":"1/4","½":"1/2"})[char]);
    const match=text.match(/^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?(?:\s*\([^)]*\))?$/);
    if(!match)return null;const number=Number(match[1])/(match[2]?Number(match[2]):1);return Number.isFinite(number)&&number>=0?number:null;
  }
  function metadata(entry){
    const value=entry?.details||{},meta=typeof value.meta==="string"?value.meta.trim():"";
    const explicitType=typeof value.type==="string"?value.type.trim():"",rawType=explicitType||meta;
    const matches=types.filter(type=>new RegExp("\\b"+type+"(?:s)?\\b","i").test(rawType));
    const size=typeof value.size==="string"&&value.size.trim()?cap(value.size.trim()):cap(meta.match(/\b(tiny|small|medium|large|lage|huge|gargantuan)\b/i)?.[1]?.replace(/^lage$/i,"large")||"");
    const alignment=typeof value.alignment==="string"?value.alignment.trim():(meta.split(/[,;]/).find(piece=>/\b(?:lawful|chaotic|neutral|good|evil|unaligned|alignment)\b/i.test(piece))||"").trim();
    const fallback=explicitType||(!matches.length?meta.replace(/\b(?:tiny|small|medium|large|lage|huge|gargantuan)\b/ig,"").split(/[,;]/)[0].trim():"");
    const type=matches.length?matches.map(type=>titles[type]).join(" / "):cap(fallback)||"Unknown";
    const rawCR=value.cr??value.challenge??value.challenge_rating;
    const cr=present(rawCR)?String(rawCR).replace(/^CR\s*/i,"").trim():"";
    const explicitSummary=[value.size,value.type,value.alignment].some(value=>typeof value==="string"&&value.trim());
    const summaryType=explicitType||meta.replace(/\b(?:tiny|small|medium|large|lage|huge|gargantuan)\b/i,"").split(/[,;]/).filter(piece=>!(/\b(?:lawful|chaotic|neutral|good|evil|unaligned|alignment)\b/i.test(piece))).join(",").trim();
    const summary=explicitSummary?[[size,summaryType||type!=="Unknown"&&type].filter(Boolean).join(" "),alignment].filter(Boolean).join(", "):meta||[size,type!=="Unknown"?type:"",alignment].filter(Boolean).join(", ");
    return{size,type,types:matches.length?matches:["unknown"],alignment,cr,challenge:challenge(rawCR),summary};
  }
  function matches(entry,filters={}){
    const meta=metadata(entry),type=normalize(filters.type);
    if(type&&type!=="all"&&!meta.types.includes(type)&&normalize(meta.type)!==type)return false;
    const selection=normalize(filters.cr),number=meta.challenge;
    if(selection&&selection!=="all"){
      if(["unknown","unrated"].includes(selection)){if(number!==null)return false;}
      else{
        if(number===null)return false;
        const range=selection.match(/^(.+?)\s*(?:-|–|to)\s*(.+)$/),minimum=selection.match(/^(.+?)\s*\+$/);
        if(range){const low=challenge(range[1]),high=challenge(range[2]);if(low===null||high===null||number<low||number>high)return false;}
        else if(minimum){const low=challenge(minimum[1]);if(low===null||number<low)return false;}
        else if(number!==challenge(selection))return false;
      }
    }
    if(present(filters.crMin)){const low=challenge(filters.crMin);if(low===null||number===null||number<low)return false;}
    if(present(filters.crMax)){const high=challenge(filters.crMax);if(high===null||number===null||number>high)return false;}
    return true;
  }
  function ability(entry,key){
    const raw=entry?.details?.abilities?.[key],value=object(raw)?raw.score??raw.value:raw;
    if(!present(value))return{score:"—",modifier:"—",text:"—",title:"Ability score not recorded"};
    const text=String(value).trim(),numeric=/^\d+$/.test(text)?Number(text):null;
    if(numeric!==null&&Number.isSafeInteger(numeric)){const modifier=Math.floor((numeric-10)/2),signed=modifier>=0?"+"+modifier:String(modifier);return{score:text,modifier:signed,text:text+" ("+signed+")",title:"Score "+text+", modifier "+signed};}
    const explicit=object(raw)?raw.modifier:entry?.details?.ability_modifiers?.[key];
    const printed=present(explicit)?String(explicit).trim():text.match(/([+-]\d+)\s*(?:modifier|\)?\s*;?\s*score not recorded)/i)?.[1]||text.match(/modifier\s*([+-]\d+)/i)?.[1];
    if(printed){const signed=/^-/.test(printed)?printed:"+"+printed.replace(/^\+/,"");const score=text.match(/^\d+\s*[–-]\s*\d+/)?.[0]||"—";return{score,modifier:signed,text:score+" ("+signed+")",title:"Exact score not recorded; modifier "+signed};}
    return{score:text,modifier:"varies",text:text+" (varies)",title:"Variable ability score; calculate its modifier after rolling"};
  }
  const fieldLabels={ac:"Armor Class",hp:"Hit Points",block:"Block",speed:"Speed",saving_throws:"Saving Throws",skills:"Skills",damage_vulnerabilities:"Damage Vulnerabilities",vulnerabilities:"Vulnerabilities",damage_resistances:"Damage Resistances",resistances:"Resistances",damage_immunities:"Damage Immunities",immunities:"Immunities",condition_immunities:"Condition Immunities",senses:"Senses",languages:"Languages",proficiency_bonus:"Proficiency Bonus",cr:"Challenge",spell_save_dc:"Spell Save DC",spell_attack:"Spell Attack",casting_ability:"Casting Ability",damage_reduction:"Damage Reduction"};
  const label=key=>fieldLabels[key]||cap(String(key).replace(/_/g," "));
  const actionFields=[["traits","Traits"],["actions","Actions"],["bonus_actions","Bonus Actions"],["reactions","Reactions"],["legendary_actions","Legendary Actions"],["mythic_actions","Mythic Actions"],["lair_actions","Lair Actions"],["regional_effects","Regional Effects"]];
  function statblock(entry,helpers={}){
    const el=helpers.el||((tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;});
    const depth=helpers.depth||2,heading=level=>"h"+Math.min(6,Math.max(2,level));
    const renderValue=(value,title="")=>helpers.renderValue?helpers.renderValue(value,depth+2,title):fallback(value);
    function fallback(value){if(value===null||typeof value!=="object")return el("span","",String(value??""));const wrap=el(Array.isArray(value)?"ul":"dl","monster-value");for(const[key,item]of Object.entries(value)){const child=el(Array.isArray(value)?"li":"div");if(!Array.isArray(value))child.append(el("strong","",label(key)+": "));child.append(fallback(item));wrap.append(child);}return wrap;}
    function compact(parent,title,value,className="monster-stat-line"){
      const row=el("div",className);row.append(el("strong","monster-stat-label",title+" "),renderValue(value,title));parent.append(row);return row;
    }
    function fold(parent,title,value,className="monster-stat-note"){
      if(!present(value))return;const disclosure=el("details",className);disclosure.append(el("summary","",title),renderValue(value,title));parent.append(disclosure);
    }
    const d=entry.details||{},meta=metadata(entry),known=new Set(["id","name","group","meta","size","type","alignment","abilities","ability_modifiers","ability_score_status","notes","description","desc","source_ref","spell_references","status","cr","challenge","challenge_rating","xp"]);
    const block=el("article","stat-block monster-parchment");block.setAttribute("aria-label",entry.name+" statblock");
    const header=el("header","monster-stat-header");if(helpers.showTitle!==false)header.append(el(heading(depth),"monster-stat-name",cap(entry.name)));if(meta.summary)header.append(el("p","monster-stat-meta",meta.summary));if(d.status)header.append(el("p","monster-stat-status",d.status));block.append(header);
    const body=el("div","monster-stat-body"),lead=el("div","monster-stat-lead");
    for(const key of ["ac","hp","block","speed"]){known.add(key);if(present(d[key]))compact(lead,label(key),d[key]);}body.append(lead);
    const scores=el("dl","monster-score-grid");scores.setAttribute("aria-label","Ability scores and modifiers");
    for(const key of ["str","dex","con","int","wis","cha"]){const item=el("div","monster-score"),value=ability(entry,key);item.setAttribute("title",value.title);item.append(el("dt","",key.toUpperCase()),el("dd","",value.text));scores.append(item);}if(!meta.types.includes("object")||Object.keys(d.abilities||{}).length)body.append(scores);
    if(normalize(d.ability_score_status)==="reconstructed"){const badge=el("span","monster-score-status","Reconstructed scores");badge.setAttribute("title",d.source_ability_scores?.note||"Scores reconstructed from the source modifiers. Original modifiers are preserved in source notes.");body.append(badge);}
    const secondary=el("div","monster-stat-secondary");
    for(const key of Object.keys(fieldLabels).filter(key=>!["ac","hp","block","speed","cr"].includes(key))){known.add(key);if(present(d[key]))compact(secondary,label(key),d[key]);}
    if(meta.cr||present(d.xp))compact(secondary,"Challenge",[meta.cr,present(d.xp)?"("+d.xp+" XP)":""].filter(Boolean).join(" "));body.append(secondary);
    for(const[key,title]of actionFields){known.add(key);if(!present(d[key]))continue;
      const section=el("section","monster-stat-section monster-stat-"+key);if(key!=="traits")section.append(el(heading(depth+1),"monster-section-heading",title));
      const records=Array.isArray(d[key])?d[key]:object(d[key])?Object.entries(d[key]).map(([name,description])=>({name,description})):[d[key]];
      for(const record of records){if(!object(record)){section.append(renderValue(record,title));continue;}const row=el("div","monster-named-rule"),name=record.name??"",description=record.description??record.desc;
        if(name){const strong=el("strong","monster-rule-name");strong.append(el("em","",String(name).replace(/\.$/,"")+". "));row.append(strong);}
        if(present(description))row.append(typeof description==="string"?el("span","monster-rule-description",description):renderValue(description,title));
        for(const[field,value]of Object.entries(record))if(!["name","description","desc"].includes(field)&&present(value))compact(row,label(field),value,"monster-rule-extra");section.append(row);
      }body.append(section);
    }
    const notes=el("div","monster-stat-notes");
    if(d.description||d.desc)fold(notes,"Description and lore",d.description||d.desc);
    if(present(d.notes))fold(notes,"Notes",d.notes);
    if(present(d.block_rules)){known.add("block_rules");fold(notes,"How this creature blocks",d.block_rules);}
    for(const[key,value]of Object.entries(d)){
      if(provenance(key)){known.add(key);fold(notes,key==="original_5e"?"Original source statblock":label(key),value,"monster-provenance");}
      if(known.has(key)||!present(value))continue;
      const section=el("section","monster-stat-section monster-additional-rule");section.append(el(heading(depth+1),"monster-section-heading",label(key)),renderValue(value,label(key)));body.append(section);
    }
    if(Array.isArray(d.spell_references)&&d.spell_references.length){const spells=el("details","monster-stat-note monster-spell-references");spells.append(el("summary","","Current spell rules"));const list=el("ul","monster-spell-list");for(const reference of d.spell_references){const row=el("li");if(helpers.link)row.append(helpers.link(reference.name,{section:"spells",entry:reference.name,group:reference.group},"monster-spell-link"));else row.append(el("strong","",reference.name));if(reference.source_spell&&normalize(reference.source_spell)!==normalize(reference.name))row.append(el("span",""," (replaces "+reference.source_spell+")"));for(const[key,value]of Object.entries(reference))if(!["name","group","source_spell"].includes(key)&&present(value))fold(row,label(key),value);list.append(row);}spells.append(list);notes.append(spells);}
    block.append(body);if(notes.children?.length||notes.childElementCount)block.append(notes);return block;
  }
  const expanded=new Set();
  function expandableList(rows,helpers){
    const{el,link,entryRoute}=helpers,list=el("div","monster-directory");
    for(const{section,entry}of rows){const meta=metadata(entry),key=JSON.stringify([section.key,entry.details?.id||entry.source||"",entry.group,entry.name]),item=el("details","monster-disclosure"),summary=el("summary","monster-disclosure-heading");
      summary.append(el("span","monster-list-name",cap(entry.name)),el("span","monster-list-cr",meta.cr?"CR "+meta.cr:"CR —"),el("span","monster-list-type",[meta.size,meta.type].filter(Boolean).join(" ")));
      const body=el("div","monster-disclosure-body");let rendered=false;
      function render(){if(rendered)return;rendered=true;const tools=el("div","monster-disclosure-tools");if(link&&entryRoute){const open=link("Open monster page",entryRoute(section,entry),"text-link");open.setAttribute("aria-label","Open "+entry.name+" monster page");tools.append(open);}if(helpers.editor){const edit=helpers.editor(section,entry);if(edit)tools.append(edit);}body.append(tools);if(helpers.renderDetails)helpers.renderDetails(entry,body);else body.append(statblock(entry,helpers));}
      item.addEventListener("toggle",()=>{if(item.open){expanded.add(key);render();}else expanded.delete(key);});item.append(summary,body);if(expanded.has(key)){item.open=true;render();}list.append(item);
    }return list;
  }
  globalThis.MonsterViews=Object.freeze({types,titles,metadata,matches,challenge,ability,statblock,expandableList});
})();
