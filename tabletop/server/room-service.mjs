import {VERSION,LIMITS,RoomError,copy,uid,secret,label,whole,hashKey,initialScene,
  project,requireDM,applyCommand,validateImage,importedScene,addLog,tokenFrom} from '../shared/state.mjs';

export class MemoryStore {
  constructor() { this.values=new Map(); }
  async get(key) { return copy(this.values.get(key)); }
  async put(key,value) { this.values.set(key,copy(value)); }
  async delete(key) { this.values.delete(key); }
}

// Every adapter shares this service. Queue mutations so reads, validation and
// persistence form one ordered operation even when several players act together.
export class RoomService {
  constructor(storage) { this.storage=storage; this.tail=Promise.resolve(); }
  run(fn) {
    const next=this.tail.then(fn);
    this.tail=next.catch(()=>{});
    return next;
  }
  async read() {
    const room=await this.storage.get('room');
    if (!room) throw new RoomError('Game not found. Check the invitation link.',404);
    room.scene.gridOpacity ??= .6;
    room.scene.distancePerSquare ??= 5;
    room.scene.distanceUnit ??= 'ft';
    room.scene.templates ??= [];
    room.scene.notes ??= [];
    room.scene.tokens=room.scene.tokens.map(token=>tokenFrom(token,room.scene));
    return room;
  }
  async actor(room,key) {
    const hash=await hashKey(room.id,key);
    if (hash===room.auth.ownerHash) return {id:'dm',name:room.auth.ownerName,role:'dm'};
    const guest=room.auth.guests[hash];
    if (!guest) throw new RoomError('Join this game to get access.',401);
    return {...guest,role:'player'};
  }
  async save(room) {
    room.revision++;
    room.savedAt=new Date().toISOString();
    await this.storage.put('room',room);
  }
  create(id,name,ownerName) {
    return this.run(async()=>{
      if (await this.storage.get('room')) throw new RoomError('This game already exists.',409);
      const key=secret();
      const room={version:VERSION,id,name:label(name,'Untitled game'),revision:0,savedAt:new Date().toISOString(),
        auth:{ownerHash:await hashKey(id,key),ownerName:label(ownerName,'DM',32),guests:{}},
        players:[],scene:initialScene(),log:[],recent:[]};
      room.scene.name=room.name;
      addLog(room,{kind:'system',text:'The table is ready. Invite your party.'});
      await this.storage.put('room',room);
      return {key,view:project(room,{id:'dm',name:room.auth.ownerName,role:'dm'})};
    });
  }
  join(key,name) {
    return this.run(async()=>{
      const room=await this.read(),hash=await hashKey(room.id,key);
      if (hash===room.auth.ownerHash) return project(room,await this.actor(room,key));
      let guest=room.auth.guests[hash];
      if (!guest) {
        if (room.players.length>=LIMITS.players) throw new RoomError('This prototype supports 12 players per game.',409);
        if (room.scene.tokens.length>=LIMITS.tokens) throw new RoomError('This scene is full. Ask the DM to remove a token.',409);
        guest={id:uid(),name:label(name,'Adventurer',32)};
        room.auth.guests[hash]=guest;
        room.players.push(copy(guest));
        const y=Math.min(room.scene.height-25,525+(room.players.length-1)%4*50);
        const x=Math.min(room.scene.width-25,225+Math.floor((room.players.length-1)/4)*50);
        room.scene.tokens.push(tokenFrom({name:guest.name,kind:'hero',color:'#33838d',x,y,ownerId:guest.id},room.scene));
        addLog(room,{kind:'system',text:`${guest.name} joined the table.`});
        await this.save(room);
      }
      return project(room,{...guest,role:'player'});
    });
  }
  view(key) { return this.run(async()=>{const room=await this.read();return project(room,await this.actor(room,key));}); }
  command(key,command) {
    return this.run(async()=>{
      const room=await this.read(), actor=await this.actor(room,key);
      const requestId=command?.requestId;
      if (requestId!==undefined && (typeof requestId!=='string' || !/^[a-z0-9-]{6,64}$/i.test(requestId))) throw new RoomError('Invalid action ID.');
      if (requestId && room.recent.some(r=>r.id===requestId && r.actor===actor.id)) return project(room,actor);
      applyCommand(room,actor,command);
      if (requestId) room.recent=[...room.recent,{id:requestId,actor:actor.id}].slice(-80);
      await this.save(room);
      return project(room,actor);
    });
  }
  uploadMap(key,input) {
    return this.run(async()=>{
      const room=await this.read(),actor=await this.actor(room,key);
      requireDM(actor);
      validateImage(input?.dataUrl);
      const width=whole(input.width,100,4096,'Map width'),height=whole(input.height,100,4096,'Map height');
      const assetId=uid(),oldAsset=room.scene.mapAsset;
      await this.storage.put(`asset:${assetId}`,input.dataUrl);
      room.scene.mapAsset=assetId;
      room.scene.width=width;room.scene.height=height;room.scene.fog.revealed=[];
      room.scene.templates=[];
      if(Math.ceil(width/room.scene.gridSize)*Math.ceil(height/room.scene.gridSize)>LIMITS.cells)room.scene.gridSize=50;
      for (const t of room.scene.tokens) {t.x=Math.min(t.x,width-25);t.y=Math.min(t.y,height-25);}
      addLog(room,{kind:'system',text:'The DM changed the map. Areas are concealed until revealed.'});
      await this.save(room);
      if (oldAsset!=='sample') await this.storage.delete(`asset:${oldAsset}`);
      return project(room,actor);
    });
  }
  mapAsset(key,id) {
    return this.run(async()=>{
      const room=await this.read();await this.actor(room,key);
      if (id!==room.scene.mapAsset) throw new RoomError('Map not found.',404);
      const data=await this.storage.get(`asset:${id}`);
      if (!data) throw new RoomError('Map not found.',404);
      return data;
    });
  }
  exportCampaign(key) {
    return this.run(async()=>{
      const room=await this.read();requireDM(await this.actor(room,key));
      const mapDataUrl=room.scene.mapAsset==='sample' ? null : await this.storage.get(`asset:${room.scene.mapAsset}`);
      const scene=project(room,{id:'dm',role:'dm'}).scene;
      return {format:'vara-tabletop',version:VERSION,exportedAt:new Date().toISOString(),name:room.name,scene,mapDataUrl};
    });
  }
  importCampaign(key,backup) {
    return this.run(async()=>{
      const room=await this.read(),actor=await this.actor(room,key);requireDM(actor);
      if (!backup || backup.format!=='vara-tabletop' || backup.version!==VERSION) throw new RoomError('Choose a version 1 Vara tabletop campaign backup.');
      if (JSON.stringify(backup).length>LIMITS.backup) throw new RoomError('This backup is too large.');
      const scene=importedScene(backup.scene);
      if (backup.mapDataUrl) validateImage(backup.mapDataUrl);
      const oldAsset=room.scene.mapAsset;
      if (backup.mapDataUrl) {scene.mapAsset=uid();await this.storage.put(`asset:${scene.mapAsset}`,backup.mapDataUrl);}
      room.scene=scene;room.name=label(backup.name,'Imported game');room.recent=[];
      addLog(room,{kind:'system',text:'Campaign restored. The DM can reassign tokens to the current players.'});
      await this.save(room);
      if (oldAsset!=='sample') await this.storage.delete(`asset:${oldAsset}`);
      return project(room,actor);
    });
  }
}
