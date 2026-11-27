export const SHEETS_KEY='vara.character-sheets.v1';
export const MONSTERS_KEY='vara.monsters.v1';
export const RESOURCE_NAMES={tempHP:'Temp HP',arcaneHealth:'Arcane Health',armorClass:'AC',block:'Block',tempBlock:'Temp Block',custom1:'Custom resource 1',custom2:'Custom resource 2'};
export const ABILITIES=['str','dex','con','int','wis','cha'];

export function healthSummary(token) {
  if(!token?.canViewStats || token.hp===null)return null;
  const hp=Math.max(0,Number(token.hp)||0),maximum=Math.max(1,Number(token.maxHp)||1);
  const temporary=Math.max(0,Number(token.resources?.tempHP?.current)||0),arcane=Math.max(0,Number(token.resources?.arcaneHealth?.current)||0);
  const max=maximum+temporary+arcane;
  return {current:hp+temporary+arcane,max,armorClass:token.resources?.armorClass?.current ?? 10,
    segments:[{key:'hp',label:'HP',value:hp,color:'#bd4946'},{key:'tempHP',label:'Temp HP',value:temporary,color:'#f4f2ed'},
      {key:'arcaneHealth',label:'Arcane health',value:arcane,color:'#9bd7ec'}].map(segment=>({...segment,fraction:segment.value/max}))};
}
export const tokenBarsVisible=(token,selected,hovered)=>!!token?.canViewStats && token.hp!==null && (token.id===selected || token.id===hovered);
export const auxiliaryReadings=token=>readings(token).filter(bar=>!['hp','tempHP','arcaneHealth','armorClass'].includes(bar.key));
export const utilityReadings=token=>{const all=readings(token);return all.length?[all[0],...auxiliaryReadings(token)]:[];};
export function readings(token) {
  if (!token?.canViewStats || token.hp===null) return [];
  return [{key:'hp',label:'HP',current:token.hp,max:token.maxHp,color:'#bd4946'},
    ...(token.bars || []).filter(bar=>bar.enabled).map((bar,index)=>({
      key:bar.resource,label:bar.label,...token.resources[bar.resource],
      max:bar.valueOnly || !token.resources[bar.resource].max?null:token.resources[bar.resource].max,color:index?'#8f89bf':'#5f9cba'
    }))];
}
export function distanceLabel(scene,start,end,unit='ft') {
  const squares=Math.hypot(end.x-start.x,end.y-start.y)/scene.gridSize;
  const distance=squares*(scene.distancePerSquare ?? 5);
  const meters=scene.distanceUnit==='m'?distance:distance*.3048;
  const value=unit==='squares'?squares:unit==='m'?meters:meters/.3048;
  return Number(value.toFixed(2))+' '+(unit==='squares'?(Number(value.toFixed(2))===1?'square':'squares'):unit);
}
const count=value=>Math.max(0,Math.min(999999,Math.round(Number(value)||0)));
const leadingNumber=value=>{
  const match=String(value ?? '').match(/^\s*(\d+(?:\.\d+)?)/);
  return match?count(match[1]):null;
};
export function monsterHP(value) {
  const source=String(value ?? '').trim().replace(/\u2212/g,'-');
  // Preserve the author's printed total, including intentionally fixed HP.
  const printed=source.match(/^(\d+(?:\.\d+)?)(?:\s*\([^)]*\))?$/);
  const valid=value=>Number.isFinite(value) && value>=1 && value<=999999?Math.floor(value):null;
  if(printed)return valid(Number(printed[1]));
  const suffix=source.match(/^(.+?)\s*\(\s*(\d+(?:\.\d+)?)\s*\)$/);
  const formula=(suffix?suffix[1]:source).replace(/\s/g,'');
  if(!/^[+-]?(?:\d*d\d+|\d+)(?:[+-](?:\d*d\d+|\d+))*$/i.test(formula) || !/d/i.test(formula))return null;
  let total=0;
  for(const term of formula.match(/[+-]?(?:\d*d\d+|\d+)/ig)){
    const sign=term[0]==='-'?-1:1,body=term.replace(/^[+-]/,''),dice=/^(\d*)d(\d+)$/i.exec(body);
    if(dice){const count=Number(dice[1] || 1),sides=Number(dice[2]);if(count<1 || count>10000 || sides<1 || sides>1000)return null;total+=sign*count*(sides+1)/2;}
    else total+=sign*Number(body);
  }
  return valid(suffix?Number(suffix[2]):total);
}
const text=value=>typeof value==='string'?value:'';
function prose(value,depth=0) {
  if(depth>5 || value==null)return '';
  if(typeof value==='string' || typeof value==='number')return String(value);
  if(Array.isArray(value))return value.map(item=>prose(item,depth+1)).filter(Boolean).join('\n');
  if(typeof value==='object')return Object.entries(value).filter(([key])=>!/^(source_|original_)/.test(key))
    .map(([key,item])=>key+': '+prose(item,depth+1)).join('\n');
  return '';
}
export function sizeStats(value) {
  const name=String(value || '').match(/\b(tiny|small|medium|large|huge|gargantuan|colossal)\b/i)?.[1]?.toLowerCase() || 'medium';
  return {sizeCategory:name[0].toUpperCase()+name.slice(1),size:{tiny:.5,small:1,medium:1,large:2,huge:3,gargantuan:4,colossal:6}[name]};
}
export const tokenRadius=(scene,token)=>scene.gridSize*token.size*(token.sizeCategory==='Small'?.28:.35);
const signed=(value,limit=999)=>Math.max(-limit,Math.min(limit,Math.round(Number(value)||0)));
export function characterStats(character,derived={},catalog=[]) {
  const hp=character.resources?.hp || {current:20,max:20},resources={};
  for (const key of ['tempHP','arcaneHealth','block','tempBlock']) {
    const pool=character.resources?.[key] || {current:0,max:0};
    resources[key]={current:count(pool.current),max:count(pool.max)};
  }
  resources.armorClass={current:count(derived.armorClass ?? character.combat?.armorClass ?? 10),max:null};
  for(let index=0;index<2;index++){
    const resource=character.customResources?.[index];
    if(resource)resources['custom'+(index+1)]={current:count(resource.current),max:count(resource.max)};
  }
  const references=new Map(catalog.flatMap(section=>(section.entries || []).map(entry=>[JSON.stringify([section.key,entry.group || '',entry.name]),entry])));
  const rules=[...(derived.features || []),...(character.features || []),...(character.spells || [])]
    .map(row=>{
      const body=prose(row.description || row.details) || prose(references.get(row.entryId)?.details);
      return row.name+': '+[body,text(row.notes)].filter(Boolean).join('\n').replace(/\n\s*\n/g,'\n');
    }).join('\n\n').slice(0,12000);
  const attacks=[...(derived.attacks || []),...(character.attacks || [])].slice(0,64).map(attack=>({
    name:text(attack.name).slice(0,80) || 'Attack',bonus:signed(attack.bonus),damage:text(attack.damage).slice(0,240),
    blockDC:attack.blockDC==null?null:count(attack.blockDC),notes:text(attack.notes).slice(0,800)
  }));
  const dex=derived.abilities?.dex ?? character.abilities?.dex ?? 10;
  return {hp:Math.min(count(hp.current),Math.max(1,count(hp.max))),maxHp:Math.max(1,count(hp.max)),resources,
    ...sizeStats(character.size || character.combat?.size || derived.race?.size),
    statblock:{type:'character',sourceId:character.id || '',abilities:derived.abilities || character.abilities || {},
      attacks,initiativeBonus:signed(derived.initiative ?? Math.floor((dex-10)/2)+(Number(character.combat?.initiativeBonus)||0),99),
      notes:text(character.notes).slice(0,4000),rules}};
}
export function monsterStats(entry,token=null) {
  const details=entry.details || entry,sourceId=monsterId(entry);
  const sameSource=token?.statblock?.type==='monster' && token.statblock.sourceId===sourceId;
  const overrides=new Set(sameSource?token.statblock.encounterOverrides || []:[]);
  const max=overrides.has('maxHp')?token.maxHp:monsterHP(details.hp);
  if (!max) throw new Error('This monster has no numeric HP. Set its HP in the statblock first.');
  const resources={
    armorClass:{current:leadingNumber(details.ac) ?? 10,max:null},
    block:{current:leadingNumber(details.block) ?? 0,max:leadingNumber(details.block) ?? 0},
    tempBlock:{current:leadingNumber(details.temp_block ?? details.tempBlock) ?? 0,max:leadingNumber(details.temp_block ?? details.tempBlock) ?? 0}
  };
  const abilities={};
  for (const key of ABILITIES) {const value=leadingNumber(details.abilities?.[key]);if(value!==null)abilities[key]=value;}
  for(const key of ABILITIES)if(overrides.has('ability.'+key)){
    if(token.statblock.abilities[key]===undefined)delete abilities[key];else abilities[key]=token.statblock.abilities[key];
  }
  if(overrides.has('armorClass'))resources.armorClass={...token.resources.armorClass};
  for(const [key,marker] of [['block','blockMax'],['tempBlock','tempBlockMax']])if(overrides.has(marker))resources[key]={...token.resources[key]};
  const rules=overrides.has('rules')?token.statblock.rules:['traits','actions','bonus_actions','reactions','legendary_actions','lair_actions']
    .flatMap(key=>(Array.isArray(details[key])?details[key]:[]).map(row=>row.name+': '+text(row.description).replace(/\n\s*\n/g,'\n'))).join('\n\n').slice(0,12000);
  return {hp:token && token.hp!==token.maxHp?Math.min(token.hp,max):max,maxHp:max,resources,...sizeStats(details.size || details.meta),
    statblock:{type:'monster',sourceId,abilities,attacks:[],
      initiativeBonus:overrides.has('initiativeBonus')?token.statblock.initiativeBonus:signed(details.initiative ?? Math.floor(((abilities.dex ?? 10)-10)/2),99),
      notes:overrides.has('notes')?token.statblock.notes:text(details.description || details.desc || details.meta).slice(0,4000),rules,encounterOverrides:[...overrides]}};
}
export const monsterId=entry=>entry._monsterEditorKey || (entry.details?.id?'id:'+entry.details.id:JSON.stringify([entry.source || '',entry.group || '',entry.name]));

// Only changed resource fields are written. Equipment, choices, notes and other
// characters in the device save remain untouched.
export function updateCharacterResources(character,before,after) {
  const next=structuredClone(character);
  next.resources ??= {};
  if (before.hp!==after.hp || before.maxHp!==after.maxHp) {
    const max=next.build?.enabled?next.resources.hp.max:after.maxHp;
    next.resources.hp={...next.resources.hp,current:Math.min(after.hp,max),max};
  }
  for (const key of ['tempHP','arcaneHealth','block','tempBlock']) {
    if (JSON.stringify(before.resources?.[key])!==JSON.stringify(after.resources?.[key])) {
      const pool={...after.resources[key]};
      if(pool.max===null)pool.max=Math.max(next.resources[key]?.max || 0,pool.current);
      next.resources[key]={...next.resources[key],...pool};
    }
  }
  if (!next.build?.enabled && before.resources?.armorClass?.current!==after.resources?.armorClass?.current) {
    next.combat={...next.combat,armorClass:after.resources.armorClass.current};
  }
  for(let index=0;index<2;index++){
    const key='custom'+(index+1),resource=next.customResources?.[index];
    if(resource && JSON.stringify(before.resources?.[key])!==JSON.stringify(after.resources?.[key])) {
      const pool={...after.resources[key]};
      if(pool.max===null)pool.max=Math.max(resource.max || 0,pool.current);
      Object.assign(resource,pool);
    }
  }
  next.updatedAt=new Date().toISOString();
  return next;
}
