import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomService,MemoryStore} from '../tabletop/server/room-service.mjs';
import {characterStats,monsterStats,tokenRadius} from '../tabletop/web/resources.mjs';

async function fixture(){
  const storage=new MemoryStore(),service=new RoomService(storage);
  const dm=await service.create('0123456789abcdef','Initiative','DM'),key='c'.repeat(64),guest=await service.join(key,'Scout');
  const own=guest.scene.tokens.find(t=>t.ownerId===guest.self.id);
  const other=dm.view.scene.tokens.find(t=>!t.hidden),hidden=dm.view.scene.tokens.find(t=>t.hidden);
  return {storage,service,dm,key,own,other,hidden};
}
test('initiative begins unrolled and manual totals sort descending, including zero and negatives',async()=>{
  const {service,dm,key,own,other}=await fixture();
  await service.command(dm.key,{type:'combat.start'});
  let view=await service.view(dm.key);
  assert(view.scene.tokens.every(t=>t.initiative===null));
  assert.equal(view.log.filter(e=>e.text?.includes('initiative')).length,0);
  await service.command(key,{type:'combat.set',id:own.id,value:0});
  view=await service.command(dm.key,{type:'combat.set',id:other.id,value:-2});
  assert.deepEqual(view.scene.combat.order.slice(0,2),[own.id,other.id]);
  view=await service.command(dm.key,{type:'combat.set',id:other.id,value:19});
  assert.deepEqual(view.scene.combat.order.slice(0,2),[other.id,own.id]);
});
test('reordering initiative preserves the active creature and round, with stable ties',async()=>{
  const {service,dm,key,own,other}=await fixture();
  await service.command(key,{type:'combat.set',id:own.id,value:15});
  await service.command(dm.key,{type:'combat.set',id:other.id,value:12});
  assert.equal((await service.view(dm.key)).scene.combat.activeId,null);
  let view=await service.command(dm.key,{type:'combat.start'});
  assert.equal(view.scene.combat.activeId,own.id);
  await service.command(dm.key,{type:'combat.next'});
  view=await service.command(key,{type:'combat.set',id:own.id,value:1});
  assert.equal(view.scene.combat.activeId,other.id);assert.equal(view.scene.combat.round,1);
  view=await service.command(key,{type:'combat.set',id:own.id,value:12});
  assert.deepEqual(view.scene.combat.order.slice(0,2),[other.id,own.id]);
});
test('players only set their own initiative; explicit browser rolls apply the supplied modifier',async()=>{
  const {service,dm,key,own,other}=await fixture();
  await assert.rejects(service.command(key,{type:'combat.set',id:other.id,value:20}),/own/i);
  const view=await service.command(key,{type:'combat.roll',id:own.id,modifier:3});
  const rolled=view.scene.tokens.find(t=>t.id===own.id).initiative;
  assert(rolled>=4 && rolled<=23);
  assert.match(view.log.at(-1).text,/initiative/i);
  const before=await service.view(dm.key);
  await assert.rejects(service.command(key,{type:'combat.set',id:own.id,value:1.5}));
  assert.deepEqual(await service.view(dm.key),before);
});
test('hidden creature initiative rolls do not leak through the player log or order',async()=>{
  const {service,dm,key,hidden}=await fixture();
  await service.command(dm.key,{type:'combat.roll',id:hidden.id,modifier:5});
  const player=await service.view(key);
  assert(!JSON.stringify(player).includes(hidden.name));assert(!player.scene.combat.order.includes(hidden.id));
});
test('linked characters expose manual and equipped attacks, initiative bonus and physical size',()=>{
  const character={id:'hero',size:'Small',abilities:{dex:16},combat:{initiativeBonus:1},resources:{hp:{current:9,max:12}},
    attacks:[{id:'a',name:'Ice bolt',bonus:6,damage:'2d8 cold',notes:'Range 60 ft.'}]};
  const stats=characterStats(character,{initiative:5,race:{size:'medium'},attacks:[{name:'Longbow',bonus:7,damage:'1d8 + 3 piercing',blockDC:15,notes:'Range 150/600 ft.'}]});
  assert.equal(stats.statblock.attacks.length,2);assert.equal(stats.statblock.attacks[0].name,'Longbow');
  assert.equal(stats.statblock.initiativeBonus,5);assert.equal(stats.sizeCategory,'Small');assert.equal(stats.size,1);
  const ancestry=characterStats({...character,size:undefined},{race:{size:'large'}});
  assert.equal(ancestry.size,2);
  const scene={gridSize:50};
  assert(tokenRadius(scene,stats)<tokenRadius(scene,{size:1,sizeCategory:'Medium'}));
  assert.equal(tokenRadius(scene,{size:3,sizeCategory:'Huge'}),52.5);
});
test('source creature sizes scale tokens and player links can update their own public size',async()=>{
  const {service,dm,key,own}=await fixture();
  const tiny=monsterStats({name:'Sprite',details:{hp:4,size:'Tiny',ac:14}});
  assert.equal(tiny.size,.5);assert.equal(tiny.sizeCategory,'Tiny');
  const huge=monsterStats({name:'Giant',details:{hp:100,meta:'Huge giant, neutral'}});
  assert.equal(huge.size,3);assert.equal(huge.sizeCategory,'Huge');
  const view=await service.command(key,{type:'token.update',id:own.id,...huge});
  assert.equal(view.scene.tokens.find(t=>t.id===own.id).size,3);
  const dmView=await service.view(dm.key);
  assert.equal(dmView.scene.tokens.find(t=>t.id===own.id).size,3);
  assert.equal(dmView.scene.tokens.find(t=>t.id===own.id).statblock,null);
});
test('attack details remain private until the player shares their statblock',async()=>{
  const {service,dm,key,own}=await fixture();
  await service.command(key,{type:'token.stats',id:own.id,statblock:{type:'character',attacks:[{name:'Private blade',bonus:8,damage:'2d6',notes:'Secret technique'}]}});
  assert(!JSON.stringify(await service.view(dm.key)).includes('Private blade'));
  await service.command(key,{type:'token.share',id:own.id,enabled:true});
  assert.equal((await service.view(dm.key)).scene.tokens.find(t=>t.id===own.id).statblock.attacks[0].name,'Private blade');
});
