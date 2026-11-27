import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomService,MemoryStore} from '../tabletop/server/room-service.mjs';
import Conditions from '../web/character-conditions.js';
import {characterStats,monsterStats} from '../tabletop/web/resources.mjs';
import {MapBoard} from '../tabletop/web/board.mjs';

async function fixture(){
  const storage=new MemoryStore(),service=new RoomService(storage);
  const dm=await service.create('0123456789abcdef','Conditions','DM'),key='a'.repeat(64),player=await service.join(key,'Scout');
  const own=player.scene.tokens.find(t=>t.ownerId===player.self.id);
  await service.command(key,{type:'token.stats',id:own.id,speed:30,statblock:{type:'character',sourceId:'private-sheet',abilities:{dex:9},notes:'SECRET ATTRIBUTES'}});
  return {storage,service,dm,key,player,own};
}
test('GM condition stacks are public without exposing private sheets and persist through backups',async()=>{
  const {storage,service,dm,key,own}=await fixture();
  await service.command(dm.key,{type:'token.condition',id:own.id,condition:{id:'bleeding'},action:'add'});
  let view=await service.command(dm.key,{type:'token.condition',id:own.id,condition:{id:'bleeding'},action:'add'});
  const token=view.scene.tokens.find(t=>t.id===own.id);
  assert.equal(token.conditions.length,1);assert.equal(token.conditions[0].stacks,2);assert.equal(token.conditionsRevision,2);
  assert.equal(token.statblock,null);assert.equal(token.hp,null);assert(!JSON.stringify(view).includes('SECRET ATTRIBUTES'));
  assert.equal((await new RoomService(storage).view(key)).scene.tokens.find(t=>t.id===own.id).conditions[0].stacks,2);
  const restored=await service.importCampaign(dm.key,await service.exportCampaign(dm.key));
  assert.equal(restored.scene.tokens.find(t=>t.id===own.id).conditions[0].stacks,2);
});
test('condition changes stop player movement immediately, while the GM can reposition the token',async()=>{
  const {service,dm,key,own}=await fixture();
  await service.command(dm.key,{type:'token.condition',id:own.id,condition:{id:'snared'},action:'add'});
  await assert.rejects(service.command(key,{type:'token.move',id:own.id,x:325,y:525}),/Snared|move/i);
  const moved=await service.command(dm.key,{type:'token.move',id:own.id,x:325,y:525});
  assert.equal(moved.scene.tokens.find(t=>t.id===own.id).x,325);
  let view=await service.command(dm.key,{type:'token.condition',id:own.id,condition:{id:'snared'},action:'clear'});
  assert.equal(view.scene.tokens.find(t=>t.id===own.id).conditionState.blocked,false);
  await service.command(key,{type:'token.move',id:own.id,x:375,y:525});
  await service.command(key,{type:'token.stats',id:own.id,speed:0});
  await assert.rejects(service.command(key,{type:'token.move',id:own.id,x:425,y:525}),/Speed|move/i);
});
test('condition sync rejects stale source updates and preserves subsequent GM changes',async()=>{
  const {service,dm,key,own}=await fixture();
  await service.command(key,{type:'token.conditions.sync',id:own.id,expectedRevision:0,conditions:[{id:'chilled',stacks:1}]});
  await service.command(dm.key,{type:'token.condition',id:own.id,condition:{id:'snared'},action:'add'});
  await assert.rejects(service.command(key,{type:'token.conditions.sync',id:own.id,expectedRevision:1,conditions:[]}),/newer|changed|revision/i);
  const view=await service.view(key),token=view.scene.tokens.find(t=>t.id===own.id);
  assert(Conditions.has(token.conditions,'snared'));assert.equal(token.conditionState.speed,0);
});
test('condition validation and permissions are authoritative and failed commands are atomic',async()=>{
  const {service,dm,key,own}=await fixture(),other=dm.view.scene.tokens[0].id;
  await assert.rejects(service.command(key,{type:'token.condition',id:other,condition:{id:'snared'},action:'add'}),/DM/);
  await assert.rejects(service.command(key,{type:'token.conditions.sync',id:other,expectedRevision:0,conditions:[]}),/owner/i);
  const before=await service.view(dm.key);
  for(const condition of [{id:'snared',stacks:-1},{id:'snared',stacks:1.5},{id:'fatigue',stacks:11},{id:'not-a-rule'}]){
    await assert.rejects(service.command(dm.key,{type:'token.condition',id:own.id,condition,action:'set'}));
  }
  assert.deepEqual(await service.view(dm.key),before);
});
test('custom effects have explicit mechanics and Frozen is not added to the standard rules',async()=>{
  const {service,dm,key,own}=await fixture();
  assert.equal(Conditions.lookup('Frozen'),null);
  await service.command(dm.key,{type:'token.condition',id:own.id,condition:{id:'custom:frozen',name:'Frozen',blocksMovement:true,notes:'GM-created effect.'},action:'add'});
  await assert.rejects(service.command(key,{type:'token.move',id:own.id,x:325,y:525}),/Frozen|move/i);
  await service.command(dm.key,{type:'token.condition',id:own.id,condition:{id:'custom:frozen',name:'Frozen'},action:'clear'});
  assert.equal((await service.view(key)).scene.tokens.find(t=>t.id===own.id).conditionState.blocked,false);
});
test('movement derives from the written rules and uses the best available monster movement mode',()=>{
  assert.equal(Conditions.status([{id:'frostbite',stacks:3}],{speed:30}).speed,30);
  assert.equal(Conditions.status([{id:'hobbled',stacks:3}],{speed:30,abilities:{dex:9}}).speed,10);
  assert.equal(Conditions.status([{id:'hobbled',stacks:3}],{speed:30,abilities:{dex:12}}).speed,15);
  assert.equal(Conditions.status([{id:'prone',stacks:2}],{speed:30}).speed,5);
  assert.equal(Conditions.status([{id:'chilled',stacks:3}],{speed:5}).speed,0);
  assert.equal(monsterStats({name:'Flyer',details:{hp:10,speed:'0 ft., fly 40 ft. (hover)'}}).speed,40);
  assert.equal(characterStats({id:'hero',combat:{speed:0},resources:{hp:{current:5,max:5}}}).speed,0);
});
test('player pointer, keyboard and compendium permissions use the same movement lock',()=>{
  const token={id:'hero',ownerId:'player',conditionState:{blocked:true,reason:'Snared'}};
  const board=Object.assign(Object.create(MapBoard.prototype),{enabled:true,view:{self:{id:'player',role:'player'}}});
  assert.equal(board.canMove(token),false);board.view.self.role='dm';assert.equal(board.canMove(token),true);
});
