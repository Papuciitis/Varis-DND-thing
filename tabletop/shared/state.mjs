import {damagePlan} from '../web/damage.mjs';
import {snapToken} from '../web/grid.mjs';
import Conditions from '../../web/character-conditions.js';
import {createAdventure} from './adventure.mjs';

export const VERSION = 1;
export const LIMITS = Object.freeze({players:12, tokens:128, cells:10000, image:1500000, backup:2000000,command:70000});

export class RoomError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const copy = value => structuredClone(value);
export const uid = () => crypto.randomUUID();
export function secret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2,'0')).join('');
}
export function label(value, fallback = '', max = 60) {
  if (value !== undefined && typeof value !== 'string') throw new RoomError('Names must be text.');
  return (value || fallback).replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max) || fallback;
}
export function numeric(value, min, max, name = 'Value') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RoomError(`${name} must be a number between ${min} and ${max}.`);
  }
  return value;
}
export function whole(value, min, max, name) {
  const n = numeric(value,min,max,name);
  if (!Number.isInteger(n)) throw new RoomError(`${name || 'Value'} must be a whole number.`);
  return n;
}
export function flag(value) {
  if (typeof value !== 'boolean') throw new RoomError('Expected true or false.');
  return value;
}
export async function hashKey(roomId, key) {
  if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) throw new RoomError('Invalid room access key.',401);
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${roomId}:${key}`));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2,'0')).join('');
}
export const columns = scene => Math.ceil(scene.width / scene.gridSize);
export const cellCount = scene => columns(scene) * Math.ceil(scene.height / scene.gridSize);
export function cellAt(scene,x,y) {
  return Math.floor(y/scene.gridSize)*columns(scene)+Math.floor(x/scene.gridSize);
}
export function isRevealed(scene,x,y) {
  return !scene.fog.enabled || scene.fog.revealed.includes(cellAt(scene,x,y));
}
export function requireDM(actor) {
  if (actor.role !== 'dm') throw new RoomError('Only the DM can change this.',403);
}
export const RESOURCE_KEYS = ['tempHP','arcaneHealth','armorClass','block','tempBlock','custom1','custom2'];
export const defaultBars = (kind='hero') => kind==='hero' ? [
  {enabled:true,label:'Block',resource:'block',valueOnly:false},
  {enabled:true,label:'Temp HP',resource:'tempHP',valueOnly:true}
] : [
  {enabled:true,label:'Block',resource:'block',valueOnly:false},
  {enabled:true,label:'AC',resource:'armorClass',valueOnly:true}
];
const legacyBars = bars => Array.isArray(bars) && bars.length===2 &&
  bars.every(bar=>bar && typeof bar==='object') &&
  !bars[0].enabled && bars[0].resource==='tempHP' && bars[0].label==='Temp HP' &&
  !bars[1].enabled && bars[1].resource==='arcaneHealth' && bars[1].label==='Arcane Health';
export function resourcesFrom(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RoomError('Resources must be an object.');
  return Object.fromEntries(RESOURCE_KEYS.map(key => {
    const pool=raw[key] ?? {};
    let max=pool.max === null || key==='armorClass' ? null : whole(pool.max ?? 0,0,999999,'Resource maximum');
    if(['tempHP','arcaneHealth'].includes(key) && max===0 && typeof pool.current==='number' && pool.current>0)max=whole(pool.current,0,999999,'Resource value');
    return [key,{current:whole(pool.current ?? (key==='armorClass'?10:0),0,max ?? 999999,'Resource value'),max}];
  }));
}
export function barsFrom(raw = defaultBars()) {
  if (!Array.isArray(raw) || raw.length!==2) throw new RoomError('Use two optional resource bars.');
  return raw.map(bar => {
    if (!bar || !RESOURCE_KEYS.includes(bar.resource)) throw new RoomError('Choose a valid resource for each bar.');
    return {enabled:flag(bar.enabled),label:label(bar.label,'Resource',24),resource:bar.resource,
      valueOnly:bar.valueOnly===undefined?false:flag(bar.valueOnly)};
  });
}
const MONSTER_OVERRIDES=['maxHp','speed','armorClass','blockMax','tempBlockMax','ability.str','ability.dex','ability.con','ability.int','ability.wis','ability.cha','initiativeBonus','notes','rules'];
function conditionsFrom(raw=[]){
  try{return Conditions.normalize(raw,{strict:true});}catch(error){throw new RoomError(error.message);}
}
function statblockFrom(raw) {
  if (raw == null) return null;
  if (typeof raw!=='object' || Array.isArray(raw)) throw new RoomError('Invalid statblock.');
  const abilities={};
  for (const key of ['str','dex','con','int','wis','cha']) {
    if (raw.abilities?.[key]!==undefined) abilities[key]=whole(raw.abilities[key],0,999,'Ability score');
  }
  const prose=(value,max)=>{
    if(value!==undefined && typeof value!=='string')throw new RoomError('Statblock text must be text.');
    return (value || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').slice(0,max);
  };
  if(raw.attacks!==undefined && (!Array.isArray(raw.attacks) || raw.attacks.length>64))throw new RoomError('Use up to 64 attacks per sheet.');
  const attacks=(raw.attacks || []).map(attack=>{
    if(!attack || typeof attack!=='object')throw new RoomError('Invalid attack.');
    return {name:label(attack.name,'Attack',80),bonus:whole(attack.bonus ?? 0,-999,999,'Attack bonus'),
      damage:prose(attack.damage,240),notes:prose(attack.notes,800),
      blockDC:attack.blockDC==null?null:whole(attack.blockDC,0,999999,'Block DC')};
  });
  const result={type:['character','monster','custom'].includes(raw.type)?raw.type:'custom',
    sourceId:label(raw.sourceId,'',512),abilities,attacks,initiativeBonus:whole(raw.initiativeBonus ?? 0,-99,99,'Initiative bonus'),
    notes:prose(raw.notes,4000),rules:prose(raw.rules,12000)};
  if(result.type==='monster'){
    const overrides=raw.encounterOverrides ?? [];
    if(!Array.isArray(overrides) || overrides.length>MONSTER_OVERRIDES.length || overrides.some(key=>!MONSTER_OVERRIDES.includes(key)))throw new RoomError('Invalid monster encounter overrides.');
    result.encounterOverrides=[...new Set(overrides)];
  }
  return result;
}
function markMonsterEdits(before,next) {
  if(before.statblock?.type!=='monster' || !before.statblock.sourceId || next.statblock?.type!=='monster' || before.statblock.sourceId!==next.statblock.sourceId)return next;
  const overrides=new Set(before.statblock.encounterOverrides || []);
  if(before.maxHp!==next.maxHp)overrides.add('maxHp');
  if(before.speed!==next.speed)overrides.add('speed');
  for(const key of ['str','dex','con','int','wis','cha'])if(before.statblock.abilities?.[key]!==next.statblock.abilities?.[key])overrides.add('ability.'+key);
  for(const key of ['initiativeBonus','notes','rules'])if(before.statblock[key]!==next.statblock[key])overrides.add(key);
  if(before.resources.armorClass.current!==next.resources?.armorClass?.current && next.resources?.armorClass)overrides.add('armorClass');
  for(const [key,label] of [['block','blockMax'],['tempBlock','tempBlockMax']])if(next.resources?.[key] && before.resources[key].max!==next.resources[key].max)overrides.add(label);
  return {...next,statblock:{...next.statblock,encounterOverrides:[...overrides]}};
}
export const canEditStats = (token,actor) => token.ownerId ? token.ownerId===actor.id : actor.role==='dm';
export const canViewStats = (token,actor) => canEditStats(token,actor) || (actor.role==='dm' && token.shareWithDM===true);
export function clearPrivateStats(token) {
  Object.assign(token,{hp:20,maxHp:20,speed:null,resources:resourcesFrom(),bars:defaultBars(token.kind),barsCustomized:false,statblock:null,shareWithDM:false});
  Object.assign(token,{movementProfile:{},movementOverrides:{},mobilityGrantTimer:null,mobility:{mode:'walk',z:0,spent:0,extra:0,dashed:false},resourceRevision:0,pendingMove:null,motion:null});
}
export function templateFrom(raw,scene,ownerId) {
  if(!raw || !['circle','cone','line','square'].includes(raw.shape))throw new RoomError('Choose a circle, cone, line or square.');
  if(!['ft','m','squares'].includes(raw.unit))throw new RoomError('Choose a unit for the spell area.');
  return {id:uid(),ownerId,name:label(raw.name,'Spell area',40),shape:raw.shape,unit:raw.unit,
    x:numeric(raw.x,0,scene.width-1,'Area X'),y:numeric(raw.y,0,scene.height-1,'Area Y'),
    angle:numeric(raw.angle ?? 0,-36000,36000,'Area direction')%360,
    size:numeric(raw.size,.01,1000,'Area size'),width:numeric(raw.width ?? 5,.01,1000,'Line width'),
    coneAngle:numeric(raw.coneAngle ?? 60,10,180,'Cone angle')};
}
function noteFrom(raw) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new RoomError('Invalid campaign note.');
  if(typeof raw.text!=='string' || raw.text.length>8000)throw new RoomError('A note can contain up to 8,000 characters.');
  return {id:typeof raw.id==='string' && /^[a-z0-9-]{6,64}$/i.test(raw.id)?raw.id:uid(),
    title:label(raw.title,'Untitled note',80),text:raw.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,''),
    shared:raw.shared===undefined?false:flag(raw.shared)};
}
export function tokenFrom(raw,scene) {
  if (!raw || typeof raw !== 'object') throw new RoomError('A token must be an object.');
  const color = raw.color ?? '#337c89';
  if (!/^#[a-f0-9]{6}$/i.test(color)) throw new RoomError('Choose a valid token color.');
  const maxHp = whole(raw.maxHp ?? 20,1,999999,'Maximum HP');
  const kind = ['hero','monster','npc','summon'].includes(raw.kind) ? raw.kind : 'hero';
  const barsCustomized=raw.barsCustomized===undefined ? !!raw.bars && !legacyBars(raw.bars) : flag(raw.barsCustomized);
  const barKind=raw.statblock?.type==='character'?'hero':raw.statblock?.type==='monster'?'monster':kind;
  const size=numeric(raw.size ?? 1,.25,6,'Token size');
  const sizeCategory=['Tiny','Small','Medium','Large','Huge','Gargantuan','Colossal'].includes(raw.sizeCategory)?raw.sizeCategory:
    size<1?'Tiny':size<2?'Medium':size<3?'Large':size<4?'Huge':size<6?'Gargantuan':'Colossal';
  const position={x:numeric(raw.x ?? 325,0,scene.width-1,'Token X'),y:numeric(raw.y ?? 525,0,scene.height-1,'Token Y')};
  if(size<1 && !raw.positionFree)Object.assign(position,snapToken(scene,{size},position));
  return {
    id: typeof raw.id === 'string' && /^[a-z0-9-]{6,64}$/i.test(raw.id) ? raw.id : uid(),
    name:label(raw.name,'New token',40), kind, color,
    ...position,...Adventure.tokenFields(raw),
    size,sizeCategory,initiative:raw.initiative==null?null:whole(raw.initiative,-999,999,'Initiative'),
    speed:raw.speed==null?null:numeric(raw.speed,0,999999,'Speed'),
    conditions:conditionsFrom(raw.conditions),conditionsRevision:whole(raw.conditionsRevision ?? 0,0,999999999,'Condition revision'),
    hp:whole(raw.hp ?? maxHp,0,maxHp,'HP'), maxHp,
    hidden:raw.hidden === undefined ? false : flag(raw.hidden),
    ownerId:typeof raw.ownerId === 'string' ? raw.ownerId : null,
    resources:resourcesFrom(raw.resources),bars:barsFrom(barsCustomized?raw.bars:defaultBars(barKind)),barsCustomized,statblock:statblockFrom(raw.statblock),
    shareWithDM:raw.shareWithDM===undefined ? false : flag(raw.shareWithDM)
  };
}
export function initialScene() {
  const scene = {name:'The old watchtower',width:1600,height:1000,gridSize:50,showGrid:true,gridOpacity:.6,
    distancePerSquare:5,distanceUnit:'ft',mapAsset:'sample',
    fog:{enabled:true,revealed:[]},tokens:[],templates:[],notes:[],combat:{active:false,order:[],index:0,round:1}};
  for (let y=7;y<18;y++) for (let x=0;x<14;x++) scene.fog.revealed.push(y*32+x);
  scene.tokens = [
    tokenFrom({name:'Wayfarer',x:325,y:525,color:'#c39b54',kind:'hero',maxHp:24},scene),
    tokenFrom({name:'Camp companion',x:475,y:625,color:'#69845d',kind:'npc',maxHp:18},scene),
    tokenFrom({name:'Watchtower guardian',x:1175,y:375,color:'#a35450',kind:'monster',maxHp:38,hidden:true,size:2},scene)
  ];
  return scene;
}
export function project(room,actor) {
  const scene = copy(room.scene);
  const dm = actor.role === 'dm';
  scene.notes=(scene.notes || []).filter(note=>dm || note.shared);
  scene.templates=(scene.templates || []).filter(area=>dm || area.ownerId===actor.id || isRevealed(scene,area.x,area.y));
  scene.tokens = scene.tokens.filter(t => dm || (!t.hidden && (t.ownerId === actor.id || isRevealed(scene,t.x,t.y))));
  scene.tokens = scene.tokens.map(t => {
    const visible=canViewStats(t,actor),editable=canEditStats(t,actor);
    t.conditionState=Conditions.status(t.conditions,{speed:t.speed,abilities:t.statblock?.abilities,size:t.sizeCategory});
    Adventure.projectToken(t,actor,visible,room.scene);
    if (!visible) {Object.assign(t,{hp:null,maxHp:null,speed:null,resources:{},bars:[],barsCustomized:false,statblock:null,shareWithDM:false});t.conditionState.speed=null;}
    return {...t,canViewStats:visible,canEditStats:editable};
  });
  const visibleIds = new Set(scene.tokens.map(t => t.id));
  Adventure.projectScene(scene,actor,visibleIds);
  const activeId = scene.combat.active ? scene.combat.order[scene.combat.index] || null : null;
  scene.combat = {...scene.combat,order:scene.combat.order.filter(id => visibleIds.has(id)),
    activeId:visibleIds.has(activeId) ? activeId : null};
  if (!dm) delete scene.combat.index;
  return {version:VERSION,id:room.id,name:room.name,revision:room.revision,savedAt:room.savedAt,
    self:{id:actor.id,name:actor.name,role:actor.role},players:copy(room.players),scene,
    log:copy(room.log.filter(event=>(!event.privateTo || event.privateTo===actor.id) && (dm || !event.tokenId || visibleIds.has(event.tokenId))))};
}
function tokenById(room,id) {
  const token = room.scene.tokens.find(t => t.id === id);
  if (!token) throw new RoomError('That token is no longer in this scene.',404);
  return token;
}
export function addLog(room,event) {
  room.log.push({id:uid(),at:new Date().toISOString(),...event});
  room.log = room.log.slice(-60);
}
function orderCombat(scene) {
  const combat=scene.combat,active=combat.order[combat.index];
  const previous=new Map(combat.order.map((id,index)=>[id,index]));
  const tokens=scene.tokens.filter(token=>!token.hidden);
  tokens.sort((a,b)=>{
    const clarity=Number(Conditions.has(b.conditions,'clarity'))-Number(Conditions.has(a.conditions,'clarity'));
    if(clarity)return clarity;
    const score=(b.initiative ?? -Infinity)-(a.initiative ?? -Infinity);
    return score || (previous.get(a.id) ?? scene.tokens.indexOf(a)+scene.tokens.length)-
      (previous.get(b.id) ?? scene.tokens.indexOf(b)+scene.tokens.length);
  });
  combat.order=tokens.map(token=>token.id);
  combat.index=active && combat.order.includes(active)?combat.order.indexOf(active):Math.min(combat.index,Math.max(0,combat.order.length-1));
  if(!combat.order.length)combat.active=false;
}
function roll(formula,limit=20) {
  if (typeof formula !== 'string') throw new RoomError('Enter dice such as 1d20 or 2d6+3.');
  const pattern=limit>20?/^(\d{1,3})d(2|3|4|6|8|10|12|20|100)([+-]\d{1,4})?$/:/^(\d{1,2})d(4|6|8|10|12|20|100)([+-]\d{1,2})?$/;
  const match = pattern.exec(formula.replace(/\s/g,''));
  if (!match || +match[1]<1 || +match[1]>limit) throw new RoomError('Choose a supported dice expression within the dice limit.');
  const count=+match[1], sides=+match[2], modifier=+(match[3] || 0), rolls=[];
  // Rejection sampling avoids modulo bias in dice results.
  const cutoff = Math.floor(4294967296/sides)*sides;
  for (let i=0;i<count;i++) {
    let n; do {n=crypto.getRandomValues(new Uint32Array(1))[0];} while (n>=cutoff);
    rolls.push(n%sides+1);
  }
  return {formula:match[0],rolls,modifier,total:rolls.reduce((a,b)=>a+b,modifier)};
}
export const Adventure=createAdventure({RoomError,numeric,whole,label,flag,uid,addLog,canEditStats,tokenById,roll,damagePlan,templateFrom,isRevealed,orderCombat});
function checkResourceRevision(token,command){
  if(['hp','maxHp','resources'].some(key=>key in command) && (command.expectedResourceRevision ?? 0)!==token.resourceRevision)throw new RoomError('Health changed at the table. Apply the newer resource revision first.',409);
}
export function applyCommand(room,actor,command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new RoomError('Invalid game action.');
  const scene=room.scene;
  if(Adventure.handle(room,actor,command))return;
  if(command.type==='chat.send'){
    if(typeof command.text!=='string' || !command.text.trim() || command.text.length>1000)throw new RoomError('Enter a message of 1-1,000 characters.');
    const text=command.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').trim();
    if(!text)throw new RoomError('Enter a message.');
    addLog(room,{kind:'chat',name:actor.name,actorId:actor.id,text});return;
  }
  if (command.type === 'token.move') {
    Adventure.move(room,actor,command);
    return;
  }
  if (command.type === 'dice.roll') {
    addLog(room,{kind:'roll',name:actor.name,...roll(command.formula)});
    return;
  }
  if(command.type==='combat.set' || command.type==='combat.roll'){
    const t=tokenById(room,command.id);
    if(actor.role!=='dm' && t.ownerId!==actor.id)throw new RoomError('You can only change initiative for your own tokens.',403);
    if(command.type==='combat.set'){
      t.initiative=command.value===null?null:whole(command.value,-999,999,'Initiative');
    }else{
      const modifier=whole(command.modifier ?? 0,-99,99,'Initiative bonus');
      t.initiative=roll('1d20'+(modifier>=0?'+':'')+modifier).total;
      addLog(room,{kind:'system',tokenId:t.id,text:t.name+' rolled initiative: '+t.initiative});
    }
    orderCombat(scene);return;
  }
  if (command.type === 'token.share') {
    const t=tokenById(room,command.id);
    if (!t.ownerId || t.ownerId!==actor.id) throw new RoomError('Only the player who owns this token can share its stats.',403);
    t.shareWithDM=flag(command.enabled);return;
  }
  if (command.type === 'template.add') {
    if((scene.templates || []).length>=32)throw new RoomError('Remove a spell area before adding more (32 per scene).');
    const area=templateFrom(command.template,scene,actor.id);
    if(actor.role!=='dm' && !isRevealed(scene,area.x,area.y))throw new RoomError('Place spell areas inside the revealed map.',403);
    scene.templates ??= [];scene.templates.push(area);return;
  }
  if (command.type === 'template.delete') {
    const area=scene.templates?.find(area=>area.id===command.id);
    if(!area)throw new RoomError('That spell area has already been removed.',404);
    if(actor.role!=='dm' && area.ownerId!==actor.id)throw new RoomError('You can only remove your own spell areas.',403);
    scene.templates=scene.templates.filter(area=>area.id!==command.id);return;
  }
  if (command.type === 'token.stats') {
    const t=tokenById(room,command.id);
    if (!canEditStats(t,actor)) throw new RoomError('Only the token owner can edit these private stats.',403);
    checkResourceRevision(t,command);
    const before=copy(t);
    const fields={};
    for (const key of ['hp','maxHp','speed','movementProfile','resources','bars','barsCustomized','statblock','size','sizeCategory']) if (key in command) fields[key]=command[key];
    if('bars' in fields && !('barsCustomized' in fields))fields.barsCustomized=true;
    if('speed' in fields && !fields.movementProfile)fields.movementProfile={...t.movementProfile,speeds:{...t.movementProfile.speeds,walk:fields.speed}};
    Object.assign(t,tokenFrom(markMonsterEdits(t,{...t,...fields}),scene));Adventure.afterStats(room,t,before);return;
  }
  if (command.type === 'token.update') {
    const t=tokenById(room,command.id),dm=actor.role==='dm',fields={};
    const before=copy(t);
    if (!dm && t.ownerId!==actor.id) throw new RoomError('You can only edit your own tokens.',403);
    const structural=['kind','hidden','ownerId'];
    if (!dm && structural.some(key => key in command)) throw new RoomError('Only the DM can change token ownership and visibility.',403);
    const stats=['hp','maxHp','speed','movementProfile','resources','bars','barsCustomized','statblock'];
    if (stats.some(key => key in command) && !canEditStats(t,actor)) throw new RoomError('Only the token owner can edit these private stats.',403);
    checkResourceRevision(t,command);
    for (const key of ['name','color','size','sizeCategory',...(dm?structural:[]),...stats]) if (key in command) fields[key]=command[key];
    if('bars' in fields && !('barsCustomized' in fields))fields.barsCustomized=true;
    if (fields.ownerId && !room.players.some(p=>p.id===fields.ownerId)) throw new RoomError('Select a player who has joined the game.');
    // Reassignment must never expose the previous player's private character.
    const next={...t,...fields};
    if('speed' in fields && !fields.movementProfile)next.movementProfile={...t.movementProfile,speeds:{...t.movementProfile.speeds,walk:fields.speed}};
    if('size' in fields && !('sizeCategory' in fields))delete next.sizeCategory;
    if (t.ownerId && 'ownerId' in fields && fields.ownerId!==t.ownerId) clearPrivateStats(next);
    Object.assign(t,tokenFrom(next,scene));Adventure.afterStats(room,t,before);orderCombat(scene);return;
  }
  if(command.type==='token.conditions.sync'){
    const t=tokenById(room,command.id);
    if(!canEditStats(t,actor))throw new RoomError('Only the token owner can sync character conditions.',403);
    if(command.expectedRevision!==t.conditionsRevision)throw new RoomError('Conditions changed at the table. Apply the newer condition revision first.',409);
    const before=copy(t.conditions);t.conditions=conditionsFrom(command.conditions);t.conditionsRevision++;Adventure.afterConditions(room,t,before);orderCombat(scene);return;
  }
  requireDM(actor);
  switch (command.type) {
    case 'token.condition': {
      const token=tokenById(room,command.id),action=command.action || 'add';
      if(action==='clear-all'){const before=copy(token.conditions);token.conditions=[];token.conditionsRevision++;Adventure.afterConditions(room,token,before);orderCombat(scene);break;}
      if(!['add','remove','clear','set'].includes(action))throw new RoomError('Choose a condition action.');
      const raw=command.condition;
      if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new RoomError('Choose a condition.');
      const parsed=conditionsFrom([{...raw,stacks:action==='clear' || action==='remove'?1:raw.stacks ?? 1}])[0];
      const before=copy(token.conditions),rows=copy(token.conditions),index=rows.findIndex(row=>row.id===parsed.id),previous=index<0?null:rows[index];
      if(action==='add' && ['charmed','hypnotized','enraged'].includes(parsed.id) && Conditions.has(rows,'clarity'))throw new RoomError('Clarity prevents becoming '+parsed.name+'.');
      const stacks=action==='clear'?0:action==='remove'?(previous?.stacks || 0)-1:action==='set'?parsed.stacks:(previous?.stacks || 0)+parsed.stacks;
      if(stacks<=0){if(index>=0)rows.splice(index,1);}
      else {const next=conditionsFrom([{...previous,...parsed,blocksMovement:raw.blocksMovement ?? previous?.blocksMovement ?? parsed.blocksMovement,notes:raw.notes ?? previous?.notes ?? parsed.notes,stacks}])[0];if(index<0)rows.push(next);else rows[index]=next;}
      token.conditions=conditionsFrom(rows);token.conditionsRevision++;Adventure.afterConditions(room,token,before);orderCombat(scene);break;
    }
    case 'token.damage': {
      const token=tokenById(room,command.id);
      const before=copy(token);
      if(!canEditStats(token,actor))throw new RoomError('Apply automatic damage to a GM-controlled token. Players adjust their own tokens.',403);
      const amount=whole(command.amount,1,999999,'Damage'),plan=damagePlan(token,amount);
      for(const pool of plan.pools)if(pool.key==='hp')token.hp=pool.after;else token.resources[pool.key].current=pool.after;
      token.resourceRevision++;Adventure.afterStats(room,token,before);
      const spent=plan.pools.map(pool=>pool.label+' '+pool.spent).join(', ');
      addLog(room,{kind:'damage',privateTo:actor.id,tokenId:token.id,text:token.name+': '+amount+' damage ('+spent+')'+(plan.remaining?'; '+plan.remaining+' excess damage.':'.')});
      break;
    }
    case 'note.save': {
      scene.notes ??= [];
      const index=command.id===undefined?-1:scene.notes.findIndex(note=>note.id===command.id);
      if(command.id!==undefined && index<0)throw new RoomError('That note has already been removed.',404);
      if(index<0 && scene.notes.length>=20)throw new RoomError('Use up to 20 campaign notes.');
      const note=noteFrom(command);
      if(index<0)scene.notes.push(note);else scene.notes[index]=note;
      break;
    }
    case 'note.delete': {
      if(!(scene.notes || []).some(note=>note.id===command.id))throw new RoomError('That note has already been removed.',404);
      scene.notes=scene.notes.filter(note=>note.id!==command.id);break;
    }
    case 'room.rename': room.name=label(command.name,'Untitled game'); scene.name=room.name; break;
    case 'player.remove': {
      const player=room.players.find(p=>p.id===command.id);
      if(!player)throw new RoomError('That guest is no longer at this table.',404);
      room.players=room.players.filter(p=>p.id!==command.id);
      for(const [hash,guest] of Object.entries(room.auth.guests))if(guest.id===command.id)delete room.auth.guests[hash];
      for(const token of scene.tokens)if(token.ownerId===command.id){clearPrivateStats(token);token.ownerId=null;}
      scene.templates=(scene.templates || []).filter(area=>area.ownerId!==command.id);
      for(const trap of scene.traps)if(trap.ownerId===command.id)trap.ownerId='dm';
      for(const effect of scene.effects)if(effect.ownerId===command.id)effect.ownerId='dm';
      addLog(room,{kind:'system',text:`${player.name} was removed from the guest list. Their tokens remain on the map.`});
      break;
    }
    case 'token.add': {
      if (scene.tokens.length>=LIMITS.tokens) throw new RoomError('This prototype supports up to 128 tokens per scene.');
      const t=tokenFrom(command.token || command,scene);
      if (scene.tokens.some(existing=>existing.id === t.id)) t.id=uid();
      if (t.ownerId && !room.players.some(p=>p.id===t.ownerId)) throw new RoomError('Select a player who has joined the game.');
      scene.tokens.push(t);orderCombat(scene);break;
    }
    case 'token.delete': {
      tokenById(room,command.id);
      scene.tokens=scene.tokens.filter(t=>t.id!==command.id);
      scene.effects=scene.effects.filter(effect=>effect.tokenId!==command.id);
      scene.events=scene.events.filter(event=>event.tokenId!==command.id);
      for(const trap of scene.traps)if(trap.tokenId===command.id){trap.tokenId='';trap.ignoreOwner=false;if(trap.pending){trap.pending=false;trap.armed=false;}}
      for(const token of scene.tokens){for(const [id,timer] of Object.entries(token.conditionTimers))if(timer.anchorId===command.id)delete token.conditionTimers[id];if(token.mobilityGrantTimer?.anchorId===command.id)token.mobilityGrantTimer=null;}
      const active=scene.combat.order[scene.combat.index];
      scene.combat.order=scene.combat.order.filter(id=>id!==command.id);
      scene.combat.index=Math.max(0,scene.combat.order.indexOf(active));
      if (!scene.combat.order.length) scene.combat.active=false;
      break;
    }
    case 'fog.set': scene.fog.enabled=flag(command.enabled); break;
    case 'fog.paint': {
      if (!Array.isArray(command.cells) || command.cells.length>LIMITS.cells) throw new RoomError('Invalid fog brush stroke.');
      const reveal=flag(command.reveal), cells=new Set(scene.fog.revealed);
      for (const c of command.cells) { whole(c,0,cellCount(scene)-1,'Map cell'); reveal ? cells.add(c) : cells.delete(c); }
      scene.fog.revealed=[...cells].sort((a,b)=>a-b); break;
    }
    case 'fog.all': scene.fog.revealed=flag(command.reveal) ? Array.from({length:cellCount(scene)},(_,i)=>i) : []; break;
    case 'scene.grid': {
      const grid=whole(command.gridSize ?? scene.gridSize,20,160,'Grid size');
      if (Math.ceil(scene.width/grid)*Math.ceil(scene.height/grid)>LIMITS.cells) throw new RoomError('Choose a larger grid size.');
      if (grid!==scene.gridSize) {
        scene.gridSize=grid; scene.fog.revealed=[];
        for(const token of scene.tokens)if(token.size<1)Object.assign(token,snapToken(scene,token,token));
      }
      if (command.showGrid!==undefined) scene.showGrid=flag(command.showGrid);
      if (command.gridOpacity!==undefined) scene.gridOpacity=numeric(command.gridOpacity,.2,.9,'Grid contrast');
      if (command.distancePerSquare!==undefined) scene.distancePerSquare=numeric(command.distancePerSquare,.01,10000,'Distance per square');
      if (command.distanceUnit!==undefined) {
        if (!['ft','m'].includes(command.distanceUnit)) throw new RoomError('Choose feet or meters for the map scale.');
        scene.distanceUnit=command.distanceUnit;
      }
      break;
    }
    case 'combat.start': {
      if(scene.combat.active)throw new RoomError('Initiative is already running.',409);
      orderCombat(scene);
      if(!scene.combat.order.length)throw new RoomError('Add a visible token before starting initiative.');
      Object.assign(scene.combat,{active:true,index:0,round:1});break;
    }
    case 'combat.next': {
      Adventure.nextTurn(room);
      break;
    }
    case 'combat.end': scene.combat.active=false; break;
    default: throw new RoomError('Unknown game action.');
  }
  if(command.type==='combat.start'){
    addLog(room,{kind:'event',text:'Round 1 begins.'});
    for(const token of scene.tokens)Adventure.hooks(room,'round-start',token);
    Adventure.startTurn(room);
  }
}

export function validateImage(data) {
  if (typeof data !== 'string' || data.length>LIMITS.image || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new RoomError('Use a PNG, JPEG or WebP image under 1 MB after compression.');
  }
  return data;
}
export function importedScene(raw) {
  if (!raw || typeof raw !== 'object' || !raw.fog || !Array.isArray(raw.tokens)) throw new RoomError('The campaign has no valid scene.');
  const scene={name:label(raw.name,'Imported scene'),width:whole(raw.width,100,4096,'Map width'),
    height:whole(raw.height,100,4096,'Map height'),gridSize:whole(raw.gridSize,20,160,'Grid size'),
    showGrid:flag(raw.showGrid),gridOpacity:numeric(raw.gridOpacity ?? .6,.2,.9,'Grid contrast'),
    distancePerSquare:numeric(raw.distancePerSquare ?? 5,.01,10000,'Distance per square'),
    distanceUnit:raw.distanceUnit==='m'?'m':'ft',mapAsset:'sample',fog:{enabled:flag(raw.fog.enabled),revealed:[]},tokens:[],
    templates:[],notes:[],combat:{active:false,order:[],index:0,round:1}};
  if (cellCount(scene)>LIMITS.cells || raw.tokens.length>LIMITS.tokens || !Array.isArray(raw.fog.revealed) || raw.fog.revealed.length>LIMITS.cells) {
    throw new RoomError('The imported scene exceeds the prototype limits.');
  }
  scene.fog.revealed=[...new Set(raw.fog.revealed.map(c=>whole(c,0,cellCount(scene)-1,'Map cell')))];
  scene.tokens=raw.tokens.map(t=>{
    const source=t.hp===null && t.maxHp===null
      ? {...t,hp:20,maxHp:20,bars:undefined,barsCustomized:false,resources:undefined,statblock:null,resourceRevision:0}
      : t;
    return {...tokenFrom(source,scene),ownerId:null,shareWithDM:false};
  });
  if (new Set(scene.tokens.map(t=>t.id)).size!==scene.tokens.length) throw new RoomError('The campaign has duplicate token IDs.');
  if(raw.templates!==undefined){
    if(!Array.isArray(raw.templates) || raw.templates.length>32)throw new RoomError('The campaign has too many spell areas.');
    scene.templates=raw.templates.map(area=>templateFrom(area,scene,'dm'));
  }
  if(raw.notes!==undefined){
    if(!Array.isArray(raw.notes) || raw.notes.length>20)throw new RoomError('Use up to 20 campaign notes.');
    scene.notes=raw.notes.map(noteFrom);
    if(new Set(scene.notes.map(note=>note.id)).size!==scene.notes.length)throw new RoomError('Duplicate campaign note IDs.');
  }
  Adventure.importScene(scene,raw);return scene;
}
