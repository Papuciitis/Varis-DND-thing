import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomService,MemoryStore} from '../tabletop/server/room-service.mjs';
import {monsterStats} from '../tabletop/web/resources.mjs';

const entry={name:'Test skeleton',details:{hp:'2d6',ac:11,block:3,abilities:{str:10,dex:12},actions:[{name:'Claw',description:'A bone claw.'}]}};
async function fixture(){
  const store=new MemoryStore(),service=new RoomService(store),dm=await service.create('0123456789abcdef','Monster fixes','DM');
  const id=dm.view.scene.tokens[0].id;
  await service.command(dm.key,{type:'token.update',id,...monsterStats(entry)});
  return {store,service,dm,id};
}
test('dice-only HP uses its average, while an explicit printed HP total takes precedence',()=>{
  for(const [hp,expected] of [['2d6',7],['2d8+2',11],['1d8 + 1',5],['4d8 + 8',26],['3d4',7],['2D6 + 1d4 - 2',7],['9 (2d6)',9],['2d8+4(13)',13],['9d8 + 27 (67)',67],['2d6 (9)',9],[38,38]]){
    const stats=monsterStats({...entry,details:{...entry.details,hp}});
    assert.equal(stats.maxHp,expected,String(hp));assert.equal(stats.hp,expected,String(hp));
  }
  for(const hp of ['2d0','2d6 + caster level','2d6; alert(1)','Special'])assert.throws(()=>monsterStats({...entry,details:{hp}}),/HP/);
});
test('monster encounter edits survive template refreshes and saved campaigns without changing the template',async()=>{
  const {store,service,dm,id}=await fixture(),original=structuredClone(entry);
  let before=(await service.view(dm.key)).scene.tokens.find(t=>t.id===id);
  const edited=await service.command(dm.key,{type:'token.stats',id,hp:6,maxHp:30,
    statblock:{...before.statblock,abilities:{...before.statblock.abilities,str:18},notes:'This skeleton has a broken jaw.'}});
  before=edited.scene.tokens.find(t=>t.id===id);
  assert(before.statblock.encounterOverrides.includes('maxHp'));
  assert(before.statblock.encounterOverrides.includes('ability.str'));
  const refreshed=monsterStats({...entry,details:{...entry.details,hp:'4d6',ac:15,abilities:{str:12,dex:16}}},before);
  assert.equal(refreshed.maxHp,30);assert.equal(refreshed.hp,6);
  assert.equal(refreshed.statblock.abilities.str,18);assert.equal(refreshed.statblock.abilities.dex,16);
  assert.equal(refreshed.resources.armorClass.current,15);assert.equal(refreshed.statblock.notes,'This skeleton has a broken jaw.');
  await service.command(dm.key,{type:'token.update',id,...refreshed});
  const restored=await new RoomService(store).view(dm.key);
  assert.equal(restored.scene.tokens.find(t=>t.id===id).maxHp,30);
  const backup=await service.exportCampaign(dm.key),imported=await service.importCampaign(dm.key,backup);
  assert.equal(imported.scene.tokens.find(t=>t.id===id).statblock.abilities.str,18);
  assert.equal(monsterStats(entry).maxHp,7);assert.deepEqual(entry,original);
});
test('a controller-scaled creature keeps the maximum HP chosen for its encounter',()=>{
  const scaled={...entry,details:{...entry.details,hp:'Half the controller maximum HP'}};
  const chosen=monsterStats({...scaled,details:{...scaled.details,hp:12}});
  chosen.statblock.encounterOverrides=['maxHp'];chosen.hp=8;
  const refreshed=monsterStats(scaled,chosen);
  assert.equal(refreshed.maxHp,12);assert.equal(refreshed.hp,8);
});
test('temporary and arcane health accept a positive value when their initial capacity is zero',async()=>{
  const {service,dm,id}=await fixture();
  const next=await service.command(dm.key,{type:'token.stats',id,resources:{tempHP:{current:8,max:0},arcaneHealth:{current:12,max:0}}});
  const token=next.scene.tokens.find(t=>t.id===id);
  assert.deepEqual(token.resources.tempHP,{current:8,max:8});assert.deepEqual(token.resources.arcaneHealth,{current:12,max:12});
  const before=await service.view(dm.key);
  await assert.rejects(service.command(dm.key,{type:'token.stats',id,resources:{tempHP:{current:-1,max:0}}}));
  await assert.rejects(service.command(dm.key,{type:'token.stats',id,resources:{arcaneHealth:{current:30,max:10}}}));
  assert.deepEqual(await service.view(dm.key),before);
});
test('GM damage spends arcane health then temporary HP then HP, leaving Block and AC alone',async()=>{
  const {service,dm,id}=await fixture();
  await service.command(dm.key,{type:'token.stats',id,hp:20,maxHp:20,resources:{arcaneHealth:{current:8,max:8},tempHP:{current:6,max:6},block:{current:5,max:5},armorClass:{current:16}}});
  const next=await service.command(dm.key,{type:'token.damage',id,amount:25}),token=next.scene.tokens.find(t=>t.id===id);
  assert.equal(token.resources.arcaneHealth.current,0);assert.equal(token.resources.tempHP.current,0);assert.equal(token.hp,9);
  assert.equal(token.resources.block.current,5);assert.equal(token.resources.armorClass.current,16);
  assert.match(next.log.at(-1).text,/Arcane Health.*8/);assert.match(next.log.at(-1).text,/Temp HP.*6/);assert.match(next.log.at(-1).text,/HP.*11/);
  const zeroed=await service.command(dm.key,{type:'token.damage',id,amount:999});
  assert.equal(zeroed.scene.tokens.find(t=>t.id===id).hp,0);
});
test('automatic damage is GM-only for GM-controlled tokens, and its resource breakdown stays private',async()=>{
  const {service,dm,id}=await fixture(),key='b'.repeat(64),player=await service.join(key,'Scout');
  await assert.rejects(service.command(key,{type:'token.damage',id,amount:1}),/DM/);
  const own=player.scene.tokens.find(t=>t.ownerId===player.self.id);
  await assert.rejects(service.command(dm.key,{type:'token.damage',id:own.id,amount:1}),/controlled/);
  await service.command(dm.key,{type:'token.damage',id,amount:2});
  assert(!(await service.view(key)).log.some(event=>event.kind==='damage'));
  const before=await service.view(dm.key);
  for(const amount of [-1,0,1.5,'2'])await assert.rejects(service.command(dm.key,{type:'token.damage',id,amount}));
  assert.deepEqual(await service.view(dm.key),before);
  const manual=await service.command(key,{type:'token.stats',id:own.id,hp:17});
  assert.equal(manual.scene.tokens.find(t=>t.id===own.id).hp,17);
});
