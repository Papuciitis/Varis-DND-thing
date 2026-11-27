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
export const defaultBars = () => [
  {enabled:false,label:'Temp HP',resource:'tempHP'},
  {enabled:false,label:'Arcane Health',resource:'arcaneHealth'}
];
export function resourcesFrom(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RoomError('Resources must be an object.');
  return Object.fromEntries(RESOURCE_KEYS.map(key => {
    const pool=raw[key] ?? {},max=pool.max === null || key==='armorClass' ? null : whole(pool.max ?? 0,0,999999,'Resource maximum');
    return [key,{current:whole(pool.current ?? 0,0,max ?? 999999,'Resource value'),max}];
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
  return {type:['character','monster','custom'].includes(raw.type)?raw.type:'custom',
    sourceId:label(raw.sourceId,'',512),abilities,
    notes:prose(raw.notes,4000),rules:prose(raw.rules,12000)};
}
export const canEditStats = (token,actor) => token.ownerId ? token.ownerId===actor.id : actor.role==='dm';
export const canViewStats = (token,actor) => canEditStats(token,actor) || (actor.role==='dm' && token.shareWithDM===true);
export function clearPrivateStats(token) {
  Object.assign(token,{hp:20,maxHp:20,resources:resourcesFrom(),bars:defaultBars(),statblock:null,shareWithDM:false});
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
export function tokenFrom(raw,scene) {
  if (!raw || typeof raw !== 'object') throw new RoomError('A token must be an object.');
  const color = raw.color ?? '#337c89';
  if (!/^#[a-f0-9]{6}$/i.test(color)) throw new RoomError('Choose a valid token color.');
  const maxHp = whole(raw.maxHp ?? 20,1,999999,'Maximum HP');
  const kind = ['hero','monster','npc','summon'].includes(raw.kind) ? raw.kind : 'hero';
  return {
    id: typeof raw.id === 'string' && /^[a-z0-9-]{6,64}$/i.test(raw.id) ? raw.id : uid(),
    name:label(raw.name,'New token',40), kind, color,
    x:numeric(raw.x ?? 325,0,scene.width-1,'Token X'),
    y:numeric(raw.y ?? 525,0,scene.height-1,'Token Y'),
    size:whole(raw.size ?? 1,1,4,'Token size'),
    hp:whole(raw.hp ?? maxHp,0,maxHp,'HP'), maxHp,
    hidden:raw.hidden === undefined ? false : flag(raw.hidden),
    ownerId:typeof raw.ownerId === 'string' ? raw.ownerId : null,
    resources:resourcesFrom(raw.resources),bars:barsFrom(raw.bars),statblock:statblockFrom(raw.statblock),
    shareWithDM:raw.shareWithDM===undefined ? false : flag(raw.shareWithDM)
  };
}
export function initialScene() {
  const scene = {name:'The old watchtower',width:1600,height:1000,gridSize:50,showGrid:true,gridOpacity:.6,
    distancePerSquare:5,distanceUnit:'ft',mapAsset:'sample',
    fog:{enabled:true,revealed:[]},tokens:[],templates:[],combat:{active:false,order:[],index:0,round:1}};
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
  scene.templates=(scene.templates || []).filter(area=>dm || area.ownerId===actor.id || isRevealed(scene,area.x,area.y));
  scene.tokens = scene.tokens.filter(t => dm || (!t.hidden && (t.ownerId === actor.id || isRevealed(scene,t.x,t.y))));
  scene.tokens = scene.tokens.map(t => {
    const visible=canViewStats(t,actor),editable=canEditStats(t,actor);
    if (!visible) Object.assign(t,{hp:null,maxHp:null,resources:{},bars:[],statblock:null,shareWithDM:false});
    return {...t,canViewStats:visible,canEditStats:editable};
  });
  const visibleIds = new Set(scene.tokens.map(t => t.id));
  const activeId = scene.combat.order[scene.combat.index] || null;
  scene.combat = {...scene.combat,order:scene.combat.order.filter(id => visibleIds.has(id)),
    activeId:visibleIds.has(activeId) ? activeId : null};
  if (!dm) delete scene.combat.index;
  return {version:VERSION,id:room.id,name:room.name,revision:room.revision,savedAt:room.savedAt,
    self:{id:actor.id,name:actor.name,role:actor.role},players:copy(room.players),scene,log:copy(room.log)};
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
function roll(formula) {
  if (typeof formula !== 'string') throw new RoomError('Enter dice such as 1d20 or 2d6+3.');
  const match = /^(\d{1,2})d(4|6|8|10|12|20|100)([+-]\d{1,2})?$/.exec(formula.replace(/\s/g,''));
  if (!match || +match[1]<1 || +match[1]>20) throw new RoomError('Use 1–20 dice: d4, d6, d8, d10, d12, d20 or d100.');
  const count=+match[1], sides=+match[2], modifier=+(match[3] || 0), rolls=[];
  // Rejection sampling avoids modulo bias in dice results.
  const cutoff = Math.floor(4294967296/sides)*sides;
  for (let i=0;i<count;i++) {
    let n; do {n=crypto.getRandomValues(new Uint32Array(1))[0];} while (n>=cutoff);
    rolls.push(n%sides+1);
  }
  return {formula:match[0],rolls,modifier,total:rolls.reduce((a,b)=>a+b,modifier)};
}
export function applyCommand(room,actor,command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new RoomError('Invalid game action.');
  const scene=room.scene;
  if (command.type === 'token.move') {
    const t=tokenById(room,command.id);
    if (actor.role !== 'dm' && t.ownerId !== actor.id) throw new RoomError('You can only move your own tokens.',403);
    const x=numeric(command.x,0,scene.width-1,'Token X'), y=numeric(command.y,0,scene.height-1,'Token Y');
    const snappedX=Math.min(scene.width-1,(Math.floor(x/scene.gridSize)+.5)*scene.gridSize);
    const snappedY=Math.min(scene.height-1,(Math.floor(y/scene.gridSize)+.5)*scene.gridSize);
    if (actor.role !== 'dm' && (t.hidden || !isRevealed(scene,snappedX,snappedY))) throw new RoomError('Move within the revealed map.',403);
    t.x=snappedX; t.y=snappedY;
    return;
  }
  if (command.type === 'dice.roll') {
    addLog(room,{kind:'roll',name:actor.name,...roll(command.formula)});
    return;
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
    const fields={};
    for (const key of ['hp','maxHp','resources','bars','statblock']) if (key in command) fields[key]=command[key];
    Object.assign(t,tokenFrom({...t,...fields},scene));return;
  }
  if (command.type === 'token.update') {
    const t=tokenById(room,command.id),dm=actor.role==='dm',fields={};
    if (!dm && t.ownerId!==actor.id) throw new RoomError('You can only edit your own tokens.',403);
    const structural=['kind','size','hidden','ownerId'];
    if (!dm && structural.some(key => key in command)) throw new RoomError('Only the DM can change token ownership and visibility.',403);
    const stats=['hp','maxHp','resources','bars','statblock'];
    if (stats.some(key => key in command) && !canEditStats(t,actor)) throw new RoomError('Only the token owner can edit these private stats.',403);
    for (const key of ['name','color',...(dm?structural:[]),...stats]) if (key in command) fields[key]=command[key];
    if (fields.ownerId && !room.players.some(p=>p.id===fields.ownerId)) throw new RoomError('Select a player who has joined the game.');
    // Reassignment must never expose the previous player's private character.
    const next={...t,...fields};
    if (t.ownerId && 'ownerId' in fields && fields.ownerId!==t.ownerId) clearPrivateStats(next);
    Object.assign(t,tokenFrom(next,scene));return;
  }
  requireDM(actor);
  switch (command.type) {
    case 'room.rename': room.name=label(command.name,'Untitled game'); scene.name=room.name; break;
    case 'player.remove': {
      const player=room.players.find(p=>p.id===command.id);
      if(!player)throw new RoomError('That guest is no longer at this table.',404);
      room.players=room.players.filter(p=>p.id!==command.id);
      for(const [hash,guest] of Object.entries(room.auth.guests))if(guest.id===command.id)delete room.auth.guests[hash];
      for(const token of scene.tokens)if(token.ownerId===command.id){clearPrivateStats(token);token.ownerId=null;}
      scene.templates=(scene.templates || []).filter(area=>area.ownerId!==command.id);
      addLog(room,{kind:'system',text:`${player.name} was removed from the guest list. Their tokens remain on the map.`});
      break;
    }
    case 'token.add': {
      if (scene.tokens.length>=LIMITS.tokens) throw new RoomError('This prototype supports up to 128 tokens per scene.');
      const t=tokenFrom(command.token || command,scene);
      if (scene.tokens.some(existing=>existing.id === t.id)) t.id=uid();
      if (t.ownerId && !room.players.some(p=>p.id===t.ownerId)) throw new RoomError('Select a player who has joined the game.');
      scene.tokens.push(t); break;
    }
    case 'token.delete': {
      tokenById(room,command.id);
      scene.tokens=scene.tokens.filter(t=>t.id!==command.id);
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
      if (grid!==scene.gridSize) {scene.gridSize=grid; scene.fog.revealed=[];}
      if (command.showGrid!==undefined) scene.showGrid=flag(command.showGrid);
      if (command.gridOpacity!==undefined) scene.gridOpacity=numeric(command.gridOpacity,.2,.9,'Grid contrast');
      if (command.distancePerSquare!==undefined) scene.distancePerSquare=numeric(command.distancePerSquare,.01,10000,'Distance per square');
      if (command.distanceUnit!==undefined) {
        if (!['ft','m'].includes(command.distanceUnit)) throw new RoomError('Choose feet or meters for the map scale.');
        scene.distanceUnit=command.distanceUnit;
      }
      break;
    }
    case 'combat.start': scene.combat={active:true,order:scene.tokens.filter(t=>!t.hidden).map(t=>t.id),index:0,round:1}; break;
    case 'combat.next': {
      if (!scene.combat.active || !scene.combat.order.length) throw new RoomError('Start initiative first.');
      scene.combat.index++;
      if (scene.combat.index>=scene.combat.order.length) {scene.combat.index=0;scene.combat.round++;}
      break;
    }
    case 'combat.end': scene.combat.active=false; break;
    default: throw new RoomError('Unknown game action.');
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
    templates:[],combat:{active:false,order:[],index:0,round:1}};
  if (cellCount(scene)>LIMITS.cells || raw.tokens.length>LIMITS.tokens || !Array.isArray(raw.fog.revealed) || raw.fog.revealed.length>LIMITS.cells) {
    throw new RoomError('The imported scene exceeds the prototype limits.');
  }
  scene.fog.revealed=[...new Set(raw.fog.revealed.map(c=>whole(c,0,cellCount(scene)-1,'Map cell')))];
  scene.tokens=raw.tokens.map(t=>{
    const source=t.hp===null && t.maxHp===null
      ? {...t,hp:20,maxHp:20,bars:undefined,resources:undefined,statblock:null}
      : t;
    return {...tokenFrom(source,scene),ownerId:null,shareWithDM:false};
  });
  if (new Set(scene.tokens.map(t=>t.id)).size!==scene.tokens.length) throw new RoomError('The campaign has duplicate token IDs.');
  if(raw.templates!==undefined){
    if(!Array.isArray(raw.templates) || raw.templates.length>32)throw new RoomError('The campaign has too many spell areas.');
    scene.templates=raw.templates.map(area=>templateFrom(area,scene,'dm'));
  }
  return scene;
}
