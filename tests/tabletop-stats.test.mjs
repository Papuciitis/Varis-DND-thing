import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomService,MemoryStore} from '../tabletop/server/room-service.mjs';
import {distanceLabel,readings,characterStats,monsterStats,updateCharacterResources} from '../tabletop/web/resources.mjs';
import {worldDistance,templateGeometry} from '../tabletop/web/templates.mjs';
import {roomRequest} from '../tabletop/server/protocol.mjs';

async function fixture() {
  const store=new MemoryStore(),service=new RoomService(store);
  const dm=await service.create('0123456789abcdef','Stats table','DM');
  const key='a'.repeat(64),player=await service.join(key,'Scout');
  const otherKey='b'.repeat(64);await service.join(otherKey,'Friend');
  const token=player.scene.tokens.find(token=>token.ownerId===player.self.id);
  return {service,store,dm,key,otherKey,player,token};
}
const privateStats={
  hp:7,maxHp:31,resources:{arcaneHealth:{current:8,max:15},armorClass:{current:19,max:null}},
  bars:[{enabled:true,label:'Ward',resource:'arcaneHealth'},{enabled:true,label:'AC',resource:'armorClass'}],
  statblock:{type:'character',sourceId:'secret-character',abilities:{str:18},notes:'PRIVATE NOTE',rules:'A private rule.\nAnother paragraph.'}
};

test('owners edit their stats and optional bars; private data never reaches DM or other players',async()=>{
  const {service,dm,key,otherKey,token}=await fixture();
  const own=await service.command(key,{type:'token.stats',id:token.id,...privateStats});
  assert.equal(own.scene.tokens.find(t=>t.id===token.id).statblock.abilities.str,18);
  assert.equal(readings(own.scene.tokens.find(t=>t.id===token.id))['1'].current,8);
  for(const access of [dm.key,otherKey]){
    const projected=await service.view(access),view=projected.scene.tokens.find(t=>t.id===token.id);
    assert.equal(view.hp,null);assert.equal(view.maxHp,null);assert.equal(view.statblock,null);
    assert.deepEqual(view.resources,{});assert.deepEqual(view.bars,[]);assert.equal(view.canViewStats,false);
    assert(!JSON.stringify(projected).includes('PRIVATE NOTE'));
  }
  await assert.rejects(service.command(dm.key,{type:'token.stats',id:token.id,hp:5}),/owner/i);
  await assert.rejects(service.command(otherKey,{type:'token.update',id:token.id,hp:5}),/own/i);
  await assert.rejects(service.command(key,{type:'token.update',id:token.id,ownerId:null}),/DM/i);
});

test('sharing is opt-in, read-only for the DM, revocable, and never grants other players access',async()=>{
  const {service,dm,key,otherKey,token}=await fixture();
  await service.command(key,{type:'token.stats',id:token.id,...privateStats});
  await assert.rejects(service.command(dm.key,{type:'token.share',id:token.id,enabled:true}),/own/i);
  await service.command(key,{type:'token.share',id:token.id,enabled:true});
  const shared=(await service.view(dm.key)).scene.tokens.find(t=>t.id===token.id);
  assert.equal(shared.hp,7);assert.equal(shared.canViewStats,true);assert.equal(shared.canEditStats,false);
  assert.equal(shared.statblock.rules,privateStats.statblock.rules);
  await assert.rejects(service.command(dm.key,{type:'token.update',id:token.id,hp:0}),/owner/i);
  assert.equal((await service.view(otherKey)).scene.tokens.find(t=>t.id===token.id).hp,null);
  await service.command(key,{type:'token.share',id:token.id,enabled:false});
  assert.equal((await service.view(dm.key)).scene.tokens.find(t=>t.id===token.id).statblock,null);
});

test('DM backups and reassignment cannot reveal unshared player stats',async()=>{
  const {service,dm,key,player,token}=await fixture();
  await service.command(key,{type:'token.stats',id:token.id,...privateStats});
  const backup=await service.exportCampaign(dm.key);
  assert(!JSON.stringify(backup).includes('PRIVATE NOTE'));
  assert.equal(backup.scene.tokens.find(t=>t.id===token.id).hp,null);
  await service.command(dm.key,{type:'token.update',id:token.id,ownerId:null});
  const freed=(await service.view(dm.key)).scene.tokens.find(t=>t.id===token.id);
  assert.equal(freed.hp,20);assert.equal(freed.statblock,null);assert.equal(freed.shareWithDM,false);
  await service.importCampaign(dm.key,backup);
  assert.equal((await service.view(dm.key)).scene.tokens.find(t=>t.id===token.id).statblock,null);
  await service.command(dm.key,{type:'token.update',id:token.id,ownerId:player.self.id});
  await service.command(key,{type:'token.stats',id:token.id,...privateStats});
  await service.command(dm.key,{type:'player.remove',id:player.self.id});
  assert(!JSON.stringify(await service.view(dm.key)).includes('PRIVATE NOTE'));
});

test('summons follow their player ownership and monster encounter stats remain DM-only',async()=>{
  const {service,dm,key,player}=await fixture();
  const result=await service.command(dm.key,{type:'token.add',token:{name:'Summon',kind:'summon',ownerId:player.self.id}});
  const summon=result.scene.tokens.find(t=>t.name==='Summon');
  assert.equal(summon.canViewStats,false);
  await service.command(key,{type:'token.stats',id:summon.id,hp:3,maxHp:12});
  const creature=result.scene.tokens.find(t=>t.kind==='monster');
  await assert.rejects(service.command(key,{type:'token.stats',id:creature.id,hp:3}),/owner/i);
});

test('invalid resource changes are atomic and grid contrast / map scale survive re-opening',async()=>{
  const {service,store,dm,key,token}=await fixture();
  const before=await service.view(key);
  await assert.rejects(service.command(key,{type:'token.stats',id:token.id,resources:{arcaneHealth:{current:30,max:10}}}),/number/i);
  assert.deepEqual(await service.view(key),before);
  await service.command(dm.key,{type:'scene.grid',gridOpacity:.85,distancePerSquare:1.5,distanceUnit:'m'});
  const reopened=await new RoomService(store).view(dm.key);
  assert.equal(reopened.scene.gridOpacity,.85);assert.equal(reopened.scene.distanceUnit,'m');
  assert.equal(reopened.scene.distancePerSquare,1.5);
  await assert.rejects(service.command(dm.key,{type:'scene.grid',gridOpacity:4}));
});

test('ruler converts real map scale and both units without changing square distance',()=>{
  const a={x:0,y:0},b={x:150,y:200},scene={gridSize:50,distancePerSquare:5,distanceUnit:'ft'};
  assert.equal(distanceLabel(scene,a,b,'squares'),'5 squares');
  assert.equal(distanceLabel(scene,a,b,'ft'),'25 ft');
  assert.equal(distanceLabel(scene,a,b,'m'),'7.62 m');
  assert.equal(distanceLabel({...scene,distancePerSquare:1.5,distanceUnit:'m'},a,b,'m'),'7.5 m');
});

test('character links use actual resources and derived AC; token changes preserve unrelated sheet data',()=>{
  const character={id:'hero-123',name:'Hero',notes:'My note',abilities:{str:12},resources:{hp:{current:14,max:30},arcaneHealth:{current:9,max:16},tempHP:{current:3,max:5}},
    customResources:[{id:'stamina',name:'Stamina',current:4,max:7}],combat:{armorClass:11},inventory:[{name:'Important equipment'}]};
  const stats=characterStats(character,{armorClass:18,abilities:{str:16}});
  assert.equal(stats.resources.armorClass.current,18);assert.equal(stats.statblock.abilities.str,16);
  const updated=updateCharacterResources(character,stats,{...stats,hp:8,resources:{...stats.resources,arcaneHealth:{current:4,max:16},custom1:{current:2,max:7}}});
  assert.equal(updated.resources.hp.current,8);assert.equal(updated.resources.arcaneHealth.current,4);
  assert.deepEqual(updated.inventory,character.inventory);assert.equal(character.resources.hp.current,14);
  assert.equal(updated.notes,character.notes);
  assert.equal(updated.customResources[0].current,2);assert.equal(updated.customResources[0].name,'Stamina');
  const bars=readings({...stats,canViewStats:true,bars:[{enabled:true,label:'Stamina',resource:'custom1',valueOnly:true}]});
  assert.equal(bars[1].current,4);assert.equal(bars[1].max,null);assert.equal(stats.resources.custom1.max,7);
});

test('monster links read numeric statblock HP / AC without resetting encounter damage',()=>{
  const entry={name:'Guardian',details:{hp:'38 (7d8 + 7)',ac:'16 (natural armor)',block:'3 / +4',abilities:{str:'18 (+4)'},actions:[{name:'Slam',description:'A mighty hit.'}]}};
  const full=monsterStats(entry);assert.equal(full.hp,38);assert.equal(full.resources.armorClass.current,16);
  assert.equal(full.statblock.abilities.str,18);assert.match(full.statblock.rules,/Slam/);
  assert.equal(monsterStats(entry,{hp:7,maxHp:30}).hp,7);
  assert.equal(monsterStats(entry,{hp:30,maxHp:30}).hp,38);
  assert.throws(()=>monsterStats({name:'Missing HP',details:{hp:'Special'}}),/numeric HP/);
});

test('spell area geometry respects map scale, cone angle and line width',()=>{
  const scene={gridSize:50,distancePerSquare:5,distanceUnit:'ft'};
  assert.equal(worldDistance(20,'ft',scene),200);
  assert.equal(worldDistance(6.096,'m',scene),200);
  assert.equal(worldDistance(4,'squares',scene),200);
  const geometry=templateGeometry({x:200,y:300,angle:90,size:30,width:5,unit:'ft',coneAngle:60},scene);
  assert.equal(geometry.length,300);assert.equal(geometry.width,50);
  assert.equal(geometry.angle,Math.PI/2);assert.equal(geometry.halfAngle,Math.PI/6);
});

test('players place and remove their own shared spell areas; concealed DM areas stay private',async()=>{
  const {service,dm,key,otherKey}=await fixture();
  const template={shape:'cone',x:325,y:525,unit:'ft',size:30,width:5,coneAngle:60,angle:0};
  const placed=await service.command(key,{type:'template.add',template});
  const area=placed.scene.templates[0];
  assert((await service.view(dm.key)).scene.templates.some(t=>t.id===area.id));
  await assert.rejects(service.command(otherKey,{type:'template.delete',id:area.id}),/own/i);
  await assert.rejects(service.command(key,{type:'template.add',template:{...template,x:1225,y:125}}),/revealed/i);
  await service.command(dm.key,{type:'template.add',template:{...template,x:1225,y:125}});
  assert.equal((await service.view(key)).scene.templates.length,1);
  await service.command(key,{type:'template.delete',id:area.id});
  assert.equal((await service.view(key)).scene.templates.length,0);
  await service.command(dm.key,{type:'fog.all',reveal:true});
  assert.equal((await service.view(key)).scene.templates.length,1);
  const backup=await service.exportCampaign(dm.key);await service.importCampaign(dm.key,backup);
  assert.equal((await service.view(dm.key)).scene.templates.length,1);
});

test('HTTP commands accept bounded full statblocks and reject oversized requests',async()=>{
  const {service,key,token}=await fixture();
  const request=body=>new Request('http://preview.test/api/rooms/0123456789abcdef/command',{
    method:'POST',headers:{Authorization:'Bearer '+key},body:JSON.stringify(body)
  });
  const response=await roomRequest(service,request({type:'token.stats',id:token.id,
    statblock:{type:'character',notes:'法'.repeat(4000),rules:'攻'.repeat(12000)}}),'command');
  assert.equal(response.status,200);
  const before=await service.view(key);
  const rejected=await roomRequest(service,request({type:'token.stats',id:token.id,extra:'x'.repeat(100000)}),'command');
  assert.equal(rejected.status,413);assert.deepEqual(await service.view(key),before);
});
