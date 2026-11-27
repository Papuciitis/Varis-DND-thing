import test from 'node:test';
import assert from 'node:assert/strict';
import * as shapes from '../tabletop/web/templates.mjs';
import {RoomService,MemoryStore} from '../tabletop/server/room-service.mjs';
import {monsterStats,characterStats} from '../tabletop/web/resources.mjs';

const scene={gridSize:50,distancePerSquare:5,distanceUnit:'ft'};
const area={x:300,y:400,size:20,width:5,unit:'ft',angle:0,coneAngle:60};
test('spell area hit testing follows the drawn circle, rotated cone, line and square',()=>{
  assert.equal(typeof shapes.templateContains,'function','Area hit testing must be available to the map context menu.');
  const hit=(shape,x,y,patch={})=>shapes.templateContains({...area,shape,...patch},{x,y},scene);
  assert(hit('circle',490,400));assert(!hit('circle',510,400));
  assert(hit('square',390,490));assert(!hit('square',410,400));
  assert(hit('line',450,420));assert(!hit('line',450,430));assert(!hit('line',290,400));
  assert(hit('cone',450,430));assert(!hit('cone',450,500));assert(!hit('cone',200,400));
  assert(hit('cone',300,550,{angle:90}));assert(!hit('cone',450,400,{angle:90}));
});

test('new character and creature tokens show the requested resource presets',async()=>{
  const service=new RoomService(new MemoryStore()),dm=await service.create('0123456789abcdef','Presets','DM');
  const hero=dm.view.scene.tokens.find(t=>t.kind==='hero'),npc=dm.view.scene.tokens.find(t=>t.kind==='npc');
  const monster=dm.view.scene.tokens.find(t=>t.kind==='monster');
  assert.deepEqual(hero.bars.map(b=>b.resource),['block','tempHP']);
  for(const token of [npc,monster]){
    assert.deepEqual(token.bars.map(b=>b.resource),['block','armorClass']);
    assert(token.bars.every(b=>b.enabled));
  }
  assert(hero.bars.every(b=>b.enabled));
});

test('linking a monster fills AC and block without overwriting deliberately chosen bars',async()=>{
  const service=new RoomService(new MemoryStore()),dm=await service.create('0123456789abcdef','Presets','DM');
  const token=dm.view.scene.tokens[0],source={name:'Test summon',details:{hp:'30',ac:'17',block:'4 / +2',abilities:{str:16}}};
  let view=await service.command(dm.key,{type:'token.stats',id:token.id,...monsterStats(source)});
  let changed=view.scene.tokens.find(t=>t.id===token.id);
  assert.deepEqual(changed.bars.map(b=>b.resource),['block','armorClass']);
  assert.equal(changed.resources.armorClass.current,17);assert.equal(changed.resources.block.current,4);
  const bars=[{enabled:true,label:'Ward',resource:'arcaneHealth'},{enabled:true,label:'Luck',resource:'custom1'}];
  await service.command(dm.key,{type:'token.stats',id:token.id,bars});
  view=await service.command(dm.key,{type:'token.stats',id:token.id,...monsterStats({...source,details:{...source.details,ac:'19'}})});
  changed=view.scene.tokens.find(t=>t.id===token.id);
  assert.deepEqual(changed.bars.map(b=>b.label),['Ward','Luck']);
  assert.equal(changed.resources.armorClass.current,19);
});

test('a linked character includes referenced spell descriptions in its quick sheet',()=>{
  const character={id:'caster',resources:{hp:{current:10,max:10}},spells:[{name:'Flame fan',entryId:JSON.stringify(['spells','Fire','Flame fan'])}]};
  const catalog=[{key:'spells',entries:[{name:'Flame fan',group:'Fire',details:{description:'A 15 foot cone of fire.'}}]}];
  assert.match(characterStats(character,{},catalog).statblock.rules,/A 15 foot cone of fire/);
});

test('older rooms gain the new defaults while older custom resource bars stay intact',async()=>{
  const storage=new MemoryStore(),service=new RoomService(storage),dm=await service.create('0123456789abcdef','Old room','DM');
  const room=await service.read(),[hero,npc,custom]=room.scene.tokens;
  for(const token of [hero,npc]){
    delete token.barsCustomized;
    token.bars=[{enabled:false,label:'Temp HP',resource:'tempHP'},{enabled:false,label:'Arcane Health',resource:'arcaneHealth'}];
  }
  delete custom.barsCustomized;custom.bars=[{enabled:true,label:'Ward',resource:'arcaneHealth'},{enabled:true,label:'Custom',resource:'custom1'}];
  await storage.put('room',room);
  const loaded=await new RoomService(storage).view(dm.key);
  assert.deepEqual(loaded.scene.tokens[0].bars.map(b=>b.resource),['block','tempHP']);
  assert.deepEqual(loaded.scene.tokens[1].bars.map(b=>b.resource),['block','armorClass']);
  assert.deepEqual(loaded.scene.tokens[2].bars.map(b=>b.label),['Ward','Custom']);
});

test('malformed resource bars are rejected as invalid input without changing saved tokens',async()=>{
  const service=new RoomService(new MemoryStore()),dm=await service.create('0123456789abcdef','Validation','DM');
  const before=await service.view(dm.key);
  await assert.rejects(service.command(dm.key,{type:'token.add',token:{bars:[null,null]}}),error=>error.status===400);
  assert.deepEqual(await service.view(dm.key),before);
});
