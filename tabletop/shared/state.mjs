export const VERSION = 1;
export const LIMITS = Object.freeze({players:12, tokens:128, cells:10000, image:1500000, backup:2000000});

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
export function tokenFrom(raw,scene) {
  if (!raw || typeof raw !== 'object') throw new RoomError('A token must be an object.');
  const color = raw.color ?? '#337c89';
  if (!/^#[a-f0-9]{6}$/i.test(color)) throw new RoomError('Choose a valid token color.');
  const maxHp = whole(raw.maxHp ?? 20,1,999999,'Maximum HP');
  const kind = ['hero','monster','npc'].includes(raw.kind) ? raw.kind : 'hero';
  return {
    id: typeof raw.id === 'string' && /^[a-z0-9-]{6,64}$/i.test(raw.id) ? raw.id : uid(),
    name:label(raw.name,'New token',40), kind, color,
    x:numeric(raw.x ?? 325,0,scene.width-1,'Token X'),
    y:numeric(raw.y ?? 525,0,scene.height-1,'Token Y'),
    size:whole(raw.size ?? 1,1,4,'Token size'),
    hp:whole(raw.hp ?? maxHp,0,maxHp,'HP'), maxHp,
    hidden:raw.hidden === undefined ? false : flag(raw.hidden),
    ownerId:typeof raw.ownerId === 'string' ? raw.ownerId : null
  };
}
export function initialScene() {
  const scene = {name:'The old watchtower',width:1600,height:1000,gridSize:50,showGrid:true,mapAsset:'sample',
    fog:{enabled:true,revealed:[]},tokens:[],combat:{active:false,order:[],index:0,round:1}};
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
  scene.tokens = scene.tokens.filter(t => dm || (!t.hidden && (t.ownerId === actor.id || isRevealed(scene,t.x,t.y))));
  if (!dm) scene.tokens = scene.tokens.map(t => ({...t,hp:t.kind === 'monster' ? null : t.hp,maxHp:t.kind === 'monster' ? null : t.maxHp}));
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
  requireDM(actor);
  switch (command.type) {
    case 'room.rename': room.name=label(command.name,'Untitled game'); scene.name=room.name; break;
    case 'player.remove': {
      const player=room.players.find(p=>p.id===command.id);
      if(!player)throw new RoomError('That guest is no longer at this table.',404);
      room.players=room.players.filter(p=>p.id!==command.id);
      for(const [hash,guest] of Object.entries(room.auth.guests))if(guest.id===command.id)delete room.auth.guests[hash];
      for(const token of scene.tokens)if(token.ownerId===command.id)token.ownerId=null;
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
    case 'token.update': {
      const t=tokenById(room,command.id), fields={};
      for (const key of ['name','kind','color','size','hp','maxHp','hidden','ownerId']) if (key in command) fields[key]=command[key];
      const changed=tokenFrom({...t,...fields},scene);
      if (changed.ownerId && !room.players.some(p=>p.id===changed.ownerId)) throw new RoomError('Select a player who has joined the game.');
      Object.assign(t,changed); break;
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
    showGrid:flag(raw.showGrid),mapAsset:'sample',fog:{enabled:flag(raw.fog.enabled),revealed:[]},tokens:[],
    combat:{active:false,order:[],index:0,round:1}};
  if (cellCount(scene)>LIMITS.cells || raw.tokens.length>LIMITS.tokens || !Array.isArray(raw.fog.revealed) || raw.fog.revealed.length>LIMITS.cells) {
    throw new RoomError('The imported scene exceeds the prototype limits.');
  }
  scene.fog.revealed=[...new Set(raw.fog.revealed.map(c=>whole(c,0,cellCount(scene)-1,'Map cell')))];
  scene.tokens=raw.tokens.map(t=>({...tokenFrom(t,scene),ownerId:null}));
  if (new Set(scene.tokens.map(t=>t.id)).size!==scene.tokens.length) throw new RoomError('The campaign has duplicate token IDs.');
  return scene;
}
