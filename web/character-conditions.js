"use strict";

// Audited condition mechanics from data/conditions.yaml. Full source wording
// stays in the compendium; contextual saves and periodic damage remain explicit.
(() => {
  const groups = {
    control:["Prone","Grappled","Pinned","Dazed","Shocked","Blinded","Deafened","Incapacitated","Winded","Exhausted","Stunned","Paralyzed","Hobbled","Snared"],
    injury:["Fatigue","On-fire/Burning","Bleeding","Frostbite","Diseased","Melting","Acid exposure","Chilled"],
    disadvantage:["Maimed","Weakened","Off-balance","Disoriented","Sickened","Confused","Poisoned","Intoxicated","exposed","tricked","distracted"],
    fear:["shaken","afraid","terrified"],
    mind:["charmed","fascinated","enraged","hypnotized","compulsion","madness","Psychosis"],
    benefit:["Soaked","Invisible","Ethereal","clarity"]
  };
  const key=value=>String(value ?? "").normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
  const clean=value=>String(value ?? "").replace(/[\u0000-\u001f\u007f]/g,"").trim().slice(0,80);
  const slug=name=>key(name).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  const definitions=Object.entries(groups).flatMap(([color,names])=>names.map(name=>({
    id:slug(name),name:name[0].toUpperCase()+name.slice(1),sourceName:name,color,maxStacks:name==="Fatigue"?10:99
  })));
  const byId=new Map(definitions.map(row=>[row.id,row]));
  const byName=new Map(definitions.map(row=>[key(row.name),row]));
  for(const alias of ["burning","on-fire","on fire"])byName.set(alias,byId.get("on-fire-burning"));
  const lookup=value=>byId.get(value) || byName.get(key(value)) || null;
  const customId=name=>"custom:"+key(name);
  function normalize(input=[],options={}) {
    const strict=!!options.strict;
    if(!Array.isArray(input)){if(strict)throw new Error("Conditions must be a list.");return [];}
    if(input.length>64 && strict)throw new Error("Use at most 64 conditions.");
    const result=new Map();
    for(const item of input.slice(0,strict?64:4096)){
      let name,stacks=1,raw={};
      if(typeof item==="string"){
        const match=item.trim().match(/^(.*?)\s*(?:[x×]\s*(\d+)|\((\d+)\))$/i);
        name=clean(match?match[1]:item);if(match)stacks=Number(match[2] || match[3]);
      }else if(item && typeof item==="object" && !Array.isArray(item)){
        raw=item;name=clean(item.name || lookup(item.id)?.name || "");stacks=item.stacks ?? 1;
      }else{if(strict)throw new Error("Invalid condition.");continue;}
      const definition=lookup(raw.id) || lookup(name);
      if(!name && definition)name=definition.name;
      if(!name){if(strict)throw new Error("Enter a condition name.");continue;}
      if(strict && raw.id && !definition && raw.id!==customId(name))throw new Error("Unknown condition.");
      const maximum=definition?.maxStacks || 99;
      if(!Number.isInteger(stacks) || stacks<1 || stacks>maximum){
        if(strict)throw new Error(name+" stacks must be a whole number from 1 to "+maximum+".");
        stacks=Math.max(1,Math.min(maximum,Math.floor(Number(stacks) || 1)));
      }
      if(strict && raw.blocksMovement!==undefined && typeof raw.blocksMovement!=="boolean")throw new Error("Invalid movement effect.");
      const id=definition?.id || customId(name),previous=result.get(id);
      const row={id,name:definition?.name || name,stacks:Math.min(maximum,(previous?.stacks || 0)+stacks),
        color:definition?.color || (raw.blocksMovement?"control":"disadvantage"),
        blocksMovement:!definition && (raw.blocksMovement===true || previous?.blocksMovement===true),
        notes:String(raw.notes || previous?.notes || "").replace(/[\u0000-\u001f\u007f]/g,"").trim().slice(0,600)};
      result.set(id,row);
    }
    return [...result.values()];
  }
  const merge=(...lists)=>normalize(lists.flat());
  const has=(rows,id)=>normalize(rows).some(row=>row.id===(lookup(id)?.id || id));
  const serialise=rows=>normalize(rows).map(row=>row.name+(row.stacks>1?" ×"+row.stacks:""));
  function manualDelta(input,id,delta) {
    const rows=normalize(input),row=rows.find(row=>row.id===id);
    if(row)row.stacks+=delta;
    return serialise(rows.filter(row=>row.stacks>0));
  }
  function forCharacter(character) {
    const manual=normalize(character.conditions || []);
    const fatigue=Number(character.build?.health?.fatigue) || 0,row=manual.find(row=>row.id==="fatigue");
    if(fatigue>0){if(row)row.stacks=Math.max(row.stacks,Math.min(10,fatigue));else manual.push({id:"fatigue",stacks:Math.min(10,fatigue)});}
    return normalize(manual.map(row=>row.id.startsWith("custom:")?{...row,...character.conditionEffects?.[row.id],id:row.id,name:row.name,stacks:row.stacks}:row));
  }
  const signature=rows=>JSON.stringify(normalize(rows).sort((a,b)=>a.id.localeCompare(b.id)));
  function applyToCharacter(character,rows) {
    const next=globalThis.structuredClone?structuredClone(character):JSON.parse(JSON.stringify(character)),normalized=normalize(rows);
    next.conditions=serialise(normalized);
    next.conditionEffects=Object.fromEntries(normalized.filter(row=>row.id.startsWith("custom:")).map(row=>[row.id,{blocksMovement:row.blocksMovement,notes:row.notes}]));
    if(next.build?.health)next.build.health.fatigue=normalized.find(row=>row.id==="fatigue")?.stacks || 0;
    return next;
  }
  function status(input,{speed=null,abilities={},size="Medium"}={}) {
    const rows=normalize(input),ids=new Set(rows.map(row=>row.id)),count=id=>rows.find(row=>row.id===id)?.stacks || 0;
    if(ids.has("stunned") || ids.has("paralyzed"))ids.add("incapacitated");
    if(ids.has("hypnotized")){ids.add("charmed");ids.add("fascinated");}
    const any=(...names)=>names.some(name=>ids.has(name)),notes=[];
    const stops=rows.filter(row=>row.blocksMovement || ["snared","pinned","grappled","incapacitated","stunned","paralyzed"].includes(row.id));
    let movement=Number.isFinite(speed)?Math.max(0,speed):null;
    if(ids.has("chilled") && movement!==null)movement=Math.max(0,movement-5);
    if(ids.has("hobbled") && movement!==null && movement>0)movement=typeof abilities.dex==="number" && abilities.dex<10?Math.min(movement,Math.max(5,Math.ceil(movement/3))):movement/2;
    if(ids.has("prone") && movement!==null)movement=Math.min(movement,5);
    if(stops.length)movement=0;
    const blocked=movement===0,reason=stops.map(row=>row.name).join(", ") || (blocked?"Speed is 0":"");
    const flags={
      noActions:ids.has("incapacitated"),noBonusActions:any("dazed","incapacitated"),noReactions:any("shocked","winded","exhausted","confused","distracted","incapacitated"),
      noBlock:any("blinded","paralyzed"),noConcentration:any("confused","distracted"),
      attackDisadvantage:any("weakened","blinded","disoriented","intoxicated"),blockDisadvantage:any("off-balance","disoriented","grappled","stunned","intoxicated"),
      physicalDisadvantage:any("sickened","poisoned","intoxicated"),mentalDisadvantage:any("confused","distracted","poisoned","intoxicated"),
      skillDisadvantage:any("madness","poisoned","intoxicated"),mentalSaveDisadvantage:any("madness","confused","distracted","poisoned","intoxicated"),
      blockAdvantage:ids.has("clarity"),mentalSaveAdvantage:ids.has("clarity"),noProficiency:ids.has("madness")
    };
    if(flags.noActions)notes.push("Cannot take actions or reactions.");
    else {if(flags.noBonusActions)notes.push("Cannot take bonus actions.");if(flags.noReactions)notes.push("Cannot take reactions.");}
    if(flags.noBlock)notes.push("Cannot make Block checks.");else if(flags.blockDisadvantage || flags.blockAdvantage)notes.push("Block checks: "+(flags.blockDisadvantage && flags.blockAdvantage?"normal (advantage and disadvantage cancel)":flags.blockAdvantage?"advantage":"disadvantage")+".");
    if(flags.attackDisadvantage)notes.push("Attacks have disadvantage.");
    if(ids.has("prone"))notes.push("Prone: melee attacks have disadvantage; a bonus action stands up.");
    if(ids.has("hobbled"))notes.push("Hobbled: move with a standard action; ordinary move actions are unavailable.");
    if(ids.has("disoriented"))notes.push("Cannot target beyond 15 feet.");
    if(flags.noConcentration)notes.push("Cannot maintain concentration.");
    if(flags.noProficiency)notes.push("Cannot benefit from proficiency.");
    if(ids.has("bleeding")){
      const sides=/^(tiny|small)$/i.test(size)?4:/^(large|huge|gargantuan|colossal)$/i.test(size)?8:6;
      notes.push("End of turn: "+count("bleeding")+"d"+sides+" bleeding damage; DC 15 Constitution save at turn start removes one stack.");
    }
    if(ids.has("acid-exposure"))notes.push("Turn start: "+count("acid-exposure")+"d6 acid damage; lose one stack per round.");
    if(ids.has("frostbite"))notes.push("Frostbite: DC "+(17+count("frostbite")-1)+" Constitution save per minute; hourly damage is "+count("frostbite")+"d6 per failed save.");
    if(ids.has("on-fire-burning"))notes.push("Turn start: burning damage depends on size. Being soaked or a successful drop-and-roll save can end it.");
    if(ids.has("melting"))notes.push("Turn start: 1d10 acid damage, doubled for constructs. Default duration is one round.");
    if(ids.has("fatigue") && [6,7].includes(count("fatigue")))notes.push("Fatigue levels 6 and 7 have no printed penalty; a GM ruling is required.");
    if(ids.has("diseased"))notes.push("Healing is halved, rounded down.");
    if(ids.has("soaked"))notes.push("Fire damage of 10 or less is resisted; cold/lightning saves have disadvantage.");
    if(ids.has("ethereal"))notes.push("Immune to physical damage; cannot attack or interact materially.");
    if(ids.has("invisible"))notes.push("Attacks against this creature have disadvantage.");
    if(ids.has("blinded"))notes.push("Cannot see or target beyond adjacent tiles.");
    if(ids.has("deafened"))notes.push("Verbal spells require a DC 15 Performance check; hearing checks are unavailable.");
    if(ids.has("winded") || ids.has("exhausted"))notes.push("Turn start: forfeit "+(ids.has("exhausted")?"two action types":"one action type")+". Repeated applications require the printed save/escalation.");
    if(any("shaken","afraid","terrified"))notes.push("Fear penalties use the strongest active fear level; repeated fear requires the printed Wisdom save.");
    if(any("afraid","terrified"))notes.push("When its source is detectable, use move actions to retreat or forfeit them.");
    if(ids.has("charmed"))notes.push("Cannot harm the charmer.");
    if(ids.has("fascinated"))notes.push("Can target only the source of fascination.");
    if(ids.has("hypnotized"))notes.push("Automatically fails non-Constitution saves.");
    if(ids.has("enraged"))notes.push("Must attack at turn start if possible and treats everyone as enemies.");
    if(ids.has("compulsion"))notes.push("Spend actions according to the source of compulsion.");
    if(ids.has("psychosis"))notes.push("Turn start: d3 chance die; on success skip the turn. Check the printed death-save threshold.");
    if(ids.has("exposed"))notes.push("Next incoming attack has advantage; damage or movement normally removes Exposed.");
    if(ids.has("tricked"))notes.push("Next maneuver is free or next save has disadvantage; check the ending trigger.");
    if(ids.has("maimed"))notes.push("Choose an action or a bonus action each turn.");
    for(const row of rows)if(row.notes)notes.push(row.name+": "+row.notes);
    return {rows,speed:movement,blocked,reason,flags,notes,ids:[...ids]};
  }
  function rollPolicy(input,context={},abilities={}) {
    const state=status(input,{abilities}),ids=new Set(state.ids),flags=state.flags,kind=context.kind || "check";
    const physical=["str","dex","con"].includes(context.ability),mental=["int","wis","cha"].includes(context.ability);
    let advantage=false,disadvantage=ids.has("intoxicated"),blocked="",automaticFailure=false;
    if(kind==="attack"){disadvantage ||= flags.attackDisadvantage || (ids.has("prone") && context.melee===true);if(flags.noActions || ids.has("ethereal"))blocked="This condition prevents attacks.";}
    if(kind==="block"){advantage=flags.blockAdvantage;disadvantage ||= flags.blockDisadvantage;if(flags.noBlock)blocked="This condition prevents Block checks.";}
    if(kind==="save"){
      advantage=mental && flags.mentalSaveAdvantage;disadvantage ||= physical && flags.physicalDisadvantage || mental && flags.mentalSaveDisadvantage || ids.has("tricked");
      if(ids.has("hypnotized") && context.ability!=="con")automaticFailure=true;
      if(ids.has("paralyzed")){automaticFailure=["str","dex","int","wis"].includes(context.ability);if(!automaticFailure)blocked="Paralyzed prevents saving throws.";}
      if(ids.has("stunned") && ["str","dex","int","wis"].includes(context.ability)){if((abilities[context.ability] ?? 10)<15)automaticFailure=true;else disadvantage=true;}
      if(ids.has("soaked") && ["cold","lightning"].includes(context.damageType))disadvantage=true;
    }
    if(kind==="skill" || kind==="check")disadvantage ||= flags.skillDisadvantage || physical && flags.physicalDisadvantage || mental && flags.mentalDisadvantage;
    if(context.skill==="Perception" && ids.has("madness") && (abilities.int ?? 10)<12)automaticFailure=true;
    const penalties=[],fatigue=state.rows.find(row=>row.id==="fatigue")?.stacks || 0,sides={2:2,3:3,4:4,5:6,8:8,9:10,10:12}[fatigue];
    if(fatigue===1)penalties.push({label:"Fatigue",flat:1});else if(sides)penalties.push({label:"Fatigue",sides});
    const fear=ids.has("terrified")?12:ids.has("afraid")?8:ids.has("shaken")?4:0;
    if(fear)penalties.push({label:"Fear",sides:fear});
    if(ids.has("chilled") && kind==="skill" && physical)penalties.push({label:"Chilled",sides:4});
    return {mode:advantage===disadvantage?"normal":advantage?"advantage":"disadvantage",blocked,automaticFailure,penalties,unresolvedFatigue:fatigue===6 || fatigue===7};
  }
  function spellRestriction(input,details={},abilities={}) {
    const state=status(input,{abilities}),ids=new Set(state.ids),time=String(details.casting_time || details.castingTime || details.time || "").toLowerCase();
    if(state.flags.noActions)return "Cannot cast while incapacitated.";
    if(state.flags.noBonusActions && /bonus/.test(time))return "Cannot take bonus actions.";
    if(state.flags.noReactions && /reaction/.test(time))return "Cannot take reactions.";
    if(ids.has("confused") && (abilities.int ?? 10)<10 && /\b[vs]\b|verbal|somatic/i.test(String(details.components || "")))return "Confused prevents verbal and somatic spells below Intelligence 10.";
    return "";
  }
  const api=Object.freeze({definitions,lookup,normalize,merge,has,serialise,manualDelta,forCharacter,status,rollPolicy,spellRestriction,customId,signature,applyToCharacter});
  globalThis.CharacterConditions=api;
  if(typeof module!=="undefined" && module.exports)module.exports=api;
})();
