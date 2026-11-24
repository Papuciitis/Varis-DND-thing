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
  const actionFields=[["traits","Monster Properties"],["actions","Actions"],["bonus_actions","Bonus Actions"],["reactions","Reactions"],["legendary_actions","Legendary Actions"],["mythic_actions","Mythic Actions"],["lair_actions","Lair Actions"],["regional_effects","Regional Effects"]];
  // Normalize imported shapes for play without altering editable source records.
  function presentation(source){
    const d=JSON.parse(JSON.stringify(source||{}));
    const records=value=>Array.isArray(value)?value:object(value)?Object.entries(value).map(([name,description])=>({name,description})):present(value)?String(value).split(/\|+/).map(text=>{const match=text.trim().match(/^([^:.]{1,90})[:.]\s+([\s\S]+)$/);return match?{name:match[1],description:match[2]}:{name:"",description:text.trim()};}):[];
    d.traits=[...records(d.traits),...records(d.properties)];delete d.properties;
    d.actions=records(d.actions);
    if(d.multiattack){
      if(!d.actions.some(row=>/multiattack/i.test(row.name||""))){
        const repeated=d.actions.filter(row=>/\(\d+x\)/i.test(row.name||"")&&!/^Existing Vara alternative:/i.test(row.description||""));
        const text=String(d.multiattack).startsWith("The source permits repeated physical attacks:")?repeated.map(row=>{const m=row.name.match(/^(.*?)\s*\((\d+)x\)/i);return `Make ${m[2]} ${m[1]} attacks as one Attack action.`;}).join(" ")+" Other attacks are alternatives.":d.multiattack;
        d.actions.unshift({name:"Multiattack",description:text});
      }
      for(const row of d.actions){
        if(!/multiattack/i.test(row.name||"")&&/\(\d+x\)/i.test(row.name||"")&&!/^Existing Vara alternative:/i.test(row.description||"")){
          row.name=row.name.replace(/\s*\(\d+x\)/i,"");
          row.description=String(row.description||"").replace(/^Make \w+ .*? attacks as one Attack action, each /i,"Attack ").replace(/Each unblocked strike deals /i,"Unblocked strike: ");
        }
      }delete d.multiattack;
    }
    const extra=(typeof d.additional_rules==="string"?d.additional_rules:"").split(/\n+/).filter(line=>line.trim()&&!/^\s*(?:Senses|Languages|Challenge|CR)\s*:?\s+/i.test(line));
    if(extra.length){if(/Human names:|Dwarf names:/i.test(extra.join(" "))){d.description=[d.description,extra.join("\n")].filter(Boolean).join("\n\n");}else d.additional_rules=extra.join("\n");}
    if(typeof d.additional_rules==="string"&&(!extra.length||/Human names:|Dwarf names:/i.test(extra.join(" "))))delete d.additional_rules;
    if(/^\d+$/.test(String(d.speed||"")))d.speed+=" ft.";
    if(typeof d.senses==="string")d.senses=d.senses.replace(/ \(untrained default; special senses not recorded\)/g,"");
    const seen=new Set();
    for(const key of ["traits","actions","bonus_actions","reactions","legendary_actions","lair_actions"]){
      if(!d[key])continue;
      d[key]=records(d[key]).filter(row=>{if(typeof row.description==="string")row.description=row.description.replace(/Existing SRD [^.]+ supplies [^.]+\./g,"").trim();
        row.name=String(row.name||"").replace(/\s*[–—-]\s*(?:existing )?[^–—]+ alternative$/i,"");
        const signature=normalize(row.name)+"|"+normalize(row.description);if(seen.has(signature))return false;seen.add(signature);return true;});
    }
    return d;
  }
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
    const d=presentation(entry.details),meta=metadata(entry),known=new Set(["id","name","group","meta","size","type","alignment","abilities","ability_modifiers","ability_score_status","notes","description","desc","source_ref","spell_references","status","cr","challenge","challenge_rating","xp","height","weight","hp_max_variant","spellcasting","spell_slots","limited_spell_uses","metamagic"]);
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
    const refs=Array.isArray(d.spell_references)?d.spell_references:[],spellRows=new Map();
    function linked(text){
      const span=el("span","monster-rule-description"),names=[...new Set(refs.flatMap(ref=>[ref.name,ref.source_spell]).filter(Boolean))].sort((a,b)=>b.length-a.length);
      if(!helpers.link||!names.length){span.append(el("span","",text));return span;}

      // Match literal spell names; punctuation in titles has no regex meaning.
      let cursor=0;const lower=text.toLowerCase();
      while(cursor<text.length){let best=null;
        for(const name of names){let at=lower.indexOf(name.toLowerCase(),cursor);while(at>=0&&((at>0&&/[a-z]/i.test(text[at-1]))||/[a-z]/i.test(text[at+name.length]||"")))at=lower.indexOf(name.toLowerCase(),at+1);if(at>=0&&(!best||at<best.at))best={at,name};}
        if(!best){span.append(el("span","",text.slice(cursor)));break;}
        if(best.at>cursor)span.append(el("span","",text.slice(cursor,best.at)));
        const ref=refs.find(ref=>[ref.name,ref.source_spell].some(name=>normalize(name)===normalize(best.name)));
        span.append(helpers.link(text.slice(best.at,best.at+best.name.length),{section:"spells",entry:ref.name,group:ref.group},"monster-spell-link"));cursor=best.at+best.name.length;
      }return span;
    }
    for(const key of ["traits","actions","bonus_actions","reactions"]){
      d[key]=(d[key]||[]).filter(row=>{
        const match=String(row.description||"").match(/^Existing Vara alternative: (.+?) \(([^)]+)\)\./);
        if(!match)return true;
        const ref=refs.find(ref=>normalize(ref.name)===normalize(match[1])&&normalize(ref.group)===normalize(match[2]));if(!ref)return true;
        const uses=String(row.name||"").match(/\((\d+x|[^)]*(?:day|rest)[^)]*)\)/i)?.[1]||"";
        const label=uses?uses.replace(/^(\d+)x$/,"$1 uses"):String(ref.level)==="0"?"At will":"";
        const signature=normalize(ref.name)+"|"+label;
        if(!spellRows.has(signature))spellRows.set(signature,{ref,label});return false;
      });
    }
    const casting=d.spellcasting,innate=(d.traits||[]).filter(row=>/spellcasting/i.test(row.name||""));
    d.traits=(d.traits||[]).filter(row=>!/spellcasting/i.test(row.name||""));
    const innateLines=typeof d.additional_rules==="string"?d.additional_rules.split("\n"):[];
    const castingLines=innateLines.filter(line=>/cast the following spells|^At will:|^\d+\/day|^\*/i.test(line.trim()));
    if(castingLines.length){const remaining=innateLines.filter(line=>!castingLines.includes(line)).join("\n");if(remaining)d.additional_rules=remaining;else delete d.additional_rules;}

    if(refs.length||casting||innate.length){
      const section=el("section","monster-stat-section monster-stat-spellcasting");section.append(el(heading(depth+1),"monster-section-heading","Spellcasting"));
      for(const row of innate)section.append(linked(row.description||""));
      for(const line of castingLines){const row=el("div","monster-casting-list");row.append(linked(line));section.append(row);}
      if(object(casting)){
        if(casting.description)section.append(linked(casting.description));
        if(casting.ability)compact(section,"Casting ability",casting.ability);
        if(casting.cantrips?.length)(()=>{const row=el("div","monster-casting-list");row.append(el("strong","","At will: "),linked(casting.cantrips.join(", ")));section.append(row);})();
        for(const [level,names]of Object.entries(casting.spells||{})){const row=el("div","monster-casting-list");row.append(el("strong","",`Level ${level}: `),linked(names.join(", ")));section.append(row);}
        const slots=casting.slots||d.spell_slots;if(slots)compact(section,"Spell slots",Object.entries(slots).map(([level,count])=>`Level ${level}: ${count}`).join("; "));
      }else if(casting)section.append(linked(String(casting)));
      for(const {ref,label}of spellRows.values()){const row=el("div","monster-casting-list");if(label)row.append(el("strong","",label+": "));row.append(linked(ref.name));section.append(row);}
      if(!casting&&!castingLines.length){const used=new Set([...spellRows.values()].map(row=>normalize(row.ref.name)));const other=[...new Map(refs.filter(ref=>!used.has(normalize(ref.name))).map(ref=>[normalize(ref.name),ref])).values()];if(other.length){const row=el("div","monster-casting-list");row.append(linked(other.map(ref=>ref.name).join(", ")));section.append(row);}}
      if(d.metamagic)compact(section,"Metamagic",d.metamagic);
      body.append(section);
    }
    for(const[key,title]of actionFields){known.add(key);if(!present(d[key]))continue;
      const section=el("section","monster-stat-section monster-stat-"+key);section.append(el(heading(depth+1),"monster-section-heading",title));
      const records=Array.isArray(d[key])?d[key]:object(d[key])?Object.entries(d[key]).map(([name,description])=>({name,description})):[d[key]];
      for(const record of records){if(!object(record)){section.append(renderValue(record,title));continue;}const row=el("div","monster-named-rule"),name=record.name??"",description=record.description??record.desc;
        if(name){const strong=el("strong","monster-rule-name");strong.append(el("em","",String(name).replace(/\.$/,"")+". "));row.append(strong);}
        if(present(description))row.append(typeof description==="string"?linked(description):renderValue(description,title));
        for(const[field,value]of Object.entries(record))if(!["name","description","desc"].includes(field)&&present(value))compact(row,label(field),value,"monster-rule-extra");section.append(row);
      }body.append(section);
    }
    const notes=el("div","monster-stat-notes"),sourceNotes=el("details","monster-provenance monster-source-notes");sourceNotes.append(el("summary","","Sources and conversion notes"));
    if(d.description||d.desc||d.height||d.weight)fold(notes,"Description and lore",[d.description||d.desc,d.height&&"Height: "+d.height,d.weight&&"Weight: "+d.weight].filter(Boolean).join("\n\n"));
    if(d.hp_max_variant)fold(notes,"Optional hit points",d.hp_max_variant);
    if(d.limited_spell_uses)fold(notes,"Spell use rules",d.limited_spell_uses);
    if(present(d.notes))fold(notes,"Notes",d.notes);
    if(present(d.block_rules)){known.add("block_rules");fold(notes,"How this creature blocks",d.block_rules);}
    for(const[key,value]of Object.entries(d)){
      if(provenance(key)){known.add(key);fold(sourceNotes,key==="original_5e"?"Original source statblock":label(key),value,"monster-provenance");}
      if(known.has(key)||!present(value))continue;
      const section=el("section","monster-stat-section monster-additional-rule");section.append(el(heading(depth+1),"monster-section-heading",label(key)),(typeof value==="string"?linked(value):renderValue(value,label(key))));body.append(section);
    }
    if(sourceNotes.children.length>1)notes.append(sourceNotes);
    if(Array.isArray(d.spell_references)&&d.spell_references.length){const spells=el("details","monster-stat-note monster-spell-references");spells.append(el("summary","","Current spell rules"));const list=el("ul","monster-spell-list");for(const reference of d.spell_references){const row=el("li");if(helpers.link)row.append(helpers.link(reference.name,{section:"spells",entry:reference.name,group:reference.group},"monster-spell-link"));else row.append(el("strong","",reference.name));if(reference.source_spell&&normalize(reference.source_spell)!==normalize(reference.name))row.append(el("span",""," (replaces "+reference.source_spell+")"));for(const[key,value]of Object.entries(reference))if(!["name","group","source_spell"].includes(key)&&present(value))fold(row,label(key),value);list.append(row);}spells.append(list);notes.append(spells);}
    const overview=el("div","monster-overview-column"),combat=el("div","monster-combat-column");
    for(const child of Array.from(body.children)){const left=["monster-stat-lead","monster-score-grid","monster-score-status","monster-stat-secondary","monster-stat-spellcasting"].some(name=>String(child.className).split(" ").includes(name));(left?overview:combat).append(child);}
    // append() moves real DOM nodes; replaceChildren also supports lightweight test renderers.
    if(body.replaceChildren)body.replaceChildren(overview,combat);
    else {body.children=[];body.append(overview,combat);}
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
  globalThis.MonsterViews=Object.freeze({presentation,types,titles,metadata,matches,challenge,ability,statblock,expandableList});
})();
