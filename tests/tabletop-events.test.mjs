import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomService,MemoryStore} from '../tabletop/server/room-service.mjs';
import {areaInterval,trapInterval,routeCells} from '../tabletop/shared/route-geometry.mjs';

async function fixture(){
  const storage=new MemoryStore(),service=new RoomService(storage),dm=await service.create('0123456789abcdef','Events','GM'),key='e'.repeat(64),player=await service.join(key,'Scout');
  const own=player.scene.tokens.find(t=>t.ownerId===player.self.id);
  await service.command(dm.key,{type:'fog.all',reveal:true});
  await service.command(key,{type:'token.stats',id:own.id,hp:100,maxHp:100,speed:30,statblock:{type:'character',abilities:{con:14}},movementProfile:{speeds:{walk:30,fly:30,swim:20,burrow:10},hover:true,traits:{creatureType:'humanoid',saveBonuses:{con:2}}}});
  const read=async()=> (await service.read()).scene.tokens.find(t=>t.id===own.id);
  const trap=async(x,options={})=>{
    const next=await service.command(dm.key,{type:'trap.save',trap:{shape:'circle',x,y:525,size:2.5,unit:'ft',width:5,coneAngle:60,angle:0,name:'Secret trap '+x,hidden:true,revealOnTrigger:false,action:{type:'message',text:'The trigger resolved.'},...options}});
    return next.scene.traps.at(-1);
  };
  const start=async()=>{await service.command(key,{type:'combat.set',id:own.id,value:99});await service.command(dm.key,{type:'combat.start'});};
  return {storage,service,dm,key,player,own,read,trap,start};
}
test('a long drag stops at each crossed trap, persists its exact stop, and resumes the checked remaining route',async()=>{
  const f=await fixture();await f.trap(375);await f.trap(475);
  await f.service.command(f.key,{type:'token.move',id:f.own.id,x:625,y:525});
  let token=await f.read();assert.equal(token.x,325);assert(token.pendingMove);assert.equal(token.mobility.spent,10);
  assert.equal((await new RoomService(f.storage).view(f.key)).scene.tokens.find(t=>t.id===token.id).x,325);
  await assert.rejects(f.service.command(f.key,{type:'token.move',id:token.id,x:675,y:525}),/pending|resolve/i);
  let playerView=await f.service.view(f.key);assert(!JSON.stringify(playerView).includes('Secret trap'));assert.equal(playerView.scene.traps.length,0);
  await f.service.command(f.dm.key,{type:'event.resolve',id:token.pendingMove.eventId,resolution:'apply'});
  token=await f.read();assert.equal(token.x,425);assert(token.pendingMove);assert.equal(token.mobility.spent,20);
  await f.service.command(f.dm.key,{type:'event.resolve',id:token.pendingMove.eventId,resolution:'apply'});
  token=await f.read();assert.equal(token.x,625);assert.equal(token.pendingMove,null);assert.equal(token.mobility.spent,40);
});
test('height, travel mode and vertical distance filter traps and share the turn movement allowance',async()=>{
  const f=await fixture();await f.trap(375);await f.start();
  await f.service.command(f.key,{type:'token.travel',id:f.own.id,mode:'fly',z:20});
  assert.equal((await f.read()).mobility.spent,20);
  await f.service.command(f.key,{type:'token.move',id:f.own.id,x:325,y:525});
  let token=await f.read();assert.equal(token.mobility.spent,30);assert.equal(token.pendingMove,null);
  await assert.rejects(f.service.command(f.key,{type:'token.move',id:token.id,x:375,y:525}),/movement remains/i);
  await f.service.command(f.key,{type:'movement.dash',id:token.id});
  await f.service.command(f.key,{type:'token.move',id:token.id,x:525,y:525});
  token=await f.read();assert.equal(token.pendingMove,null);assert.equal(token.mobility.z,20);assert.equal(token.mobility.spent,50);
  await f.service.command(f.dm.key,{type:'token.move',id:token.id,x:625,y:525,z:0,mode:'walk',force:true});
  assert.equal((await f.read()).mobility.spent,50);
});
test('swimming without a swim speed costs double movement and zero-speed conditions still stop it',async()=>{
  const f=await fixture();await f.service.command(f.key,{type:'token.mobility',id:f.own.id,profile:{speeds:{swim:0}},sourceName:'No dedicated swimming speed'});await f.start();
  await f.service.command(f.key,{type:'token.travel',id:f.own.id,mode:'swim',z:0});
  await f.service.command(f.key,{type:'token.move',id:f.own.id,x:425,y:525});
  let token=await f.read();assert.equal(token.x,375);assert.equal(token.mobility.spent,30);
  await f.service.command(f.dm.key,{type:'token.condition',id:token.id,condition:{id:'snared'}});
  await assert.rejects(f.service.command(f.key,{type:'token.move',id:token.id,x:425,y:525}),/Snared/i);
});
test('regeneration, finite effect applications and condition expiration tick exactly once at their owner’s turn',async()=>{
  const f=await fixture();await f.service.command(f.key,{type:'token.stats',id:f.own.id,hp:50});
  await f.service.command(f.key,{type:'effect.save',effect:{name:'Regeneration',tokenId:f.own.id,trigger:'turn-start',uses:2,action:{type:'heal',amount:5}}});
  await f.service.command(f.dm.key,{type:'token.condition',id:f.own.id,condition:{id:'snared'}});
  await f.service.command(f.dm.key,{type:'condition.duration',id:f.own.id,conditionId:'snared',turns:1,timing:'turn-end'});
  await f.start();assert.equal((await f.read()).hp,55);
  await f.service.command(f.dm.key,{type:'combat.next'});assert.equal((await f.read()).conditions.length,0);
  for(let i=0;i<2;i++)await f.service.command(f.dm.key,{type:'combat.next'});
  assert.equal((await f.read()).hp,60);assert.equal((await f.service.read()).scene.effects.length,0);
  for(let i=0;i<3;i++)await f.service.command(f.dm.key,{type:'combat.next'});
  assert.equal((await f.read()).hp,60);
  const dmView=await f.service.view(f.dm.key);assert.equal(dmView.scene.tokens.find(t=>t.id===f.own.id).hp,null);assert(!dmView.log.some(entry=>entry.text?.includes('HP 60 / 100')));
});
test('Bleeding queues its printed start-turn save, applies end-turn stack damage, and protects new health from stale sheets',async()=>{
  const f=await fixture();await f.service.command(f.dm.key,{type:'token.condition',id:f.own.id,condition:{id:'bleeding',stacks:3}});await f.start();
  const event=(await f.service.view(f.key)).scene.events.find(e=>e.status==='pending');assert.equal(event.save.dc,15);
  await assert.rejects(f.service.command(f.key,{type:'token.move',id:f.own.id,x:275,y:525}),/pending|resolve/i);
  await f.service.command(f.key,{type:'event.resolve',id:event.id,resolution:'manual',total:20});
  assert.equal((await f.read()).conditions[0].stacks,2);
  await f.service.command(f.dm.key,{type:'combat.next'});
  const token=await f.read();assert(token.hp>=88 && token.hp<=98);assert.equal(token.resourceRevision,1);
  await assert.rejects(f.service.command(f.key,{type:'token.update',id:token.id,hp:100,expectedResourceRevision:0}),/Health changed/i);
  assert.equal((await f.read()).hp,token.hp);
});
test('players propose owned item/spell traps; the GM arms them and other players cannot edit them',async()=>{
  const f=await fixture();
  let view=await f.service.command(f.key,{type:'trap.save',trap:{shape:'line',x:300,y:525,size:15,unit:'ft',width:1,coneAngle:60,angle:90,name:'Snare',tokenId:f.own.id,sourceName:'Inventory snare',action:{type:'condition',condition:{id:'snared'}}}});
  const trap=view.scene.traps[0];assert(trap.pending);assert.equal(trap.armed,false);
  const approval=view.scene.events.find(e=>e.kind==='approval');
  await assert.rejects(f.service.command(f.key,{type:'event.resolve',id:approval.id,resolution:'apply'}),/GM/);
  view=await f.service.command(f.dm.key,{type:'event.resolve',id:approval.id,resolution:'apply'});assert(view.scene.traps[0].armed);
  const otherKey='f'.repeat(64);await f.service.join(otherKey,'Other player');
  await assert.rejects(f.service.command(otherKey,{type:'trap.remove',id:trap.id}),/GM|own/i);
});
test('saving a campaign while paused preserves pending events and routes across restore',async()=>{
  const f=await fixture();await f.trap(375);await f.service.command(f.key,{type:'token.move',id:f.own.id,x:525,y:525});
  const backup=await f.service.exportCampaign(f.dm.key),restored=await f.service.importCampaign(f.dm.key,backup),token=restored.scene.tokens.find(t=>t.id===f.own.id);
  assert(token.pendingMove);assert(restored.scene.events.some(e=>e.id===token.pendingMove.eventId));
  await f.service.command(f.dm.key,{type:'event.resolve',id:token.pendingMove.eventId,resolution:'apply'});
  assert.equal((await f.read()).x,525);
});
test('healing triggers and condition triggers are bounded rather than recursively running forever',async()=>{
  const f=await fixture();await f.service.command(f.key,{type:'token.stats',id:f.own.id,hp:50});
  await f.service.command(f.key,{type:'effect.save',effect:{name:'Echo heal',tokenId:f.own.id,trigger:'heal',action:{type:'heal',amount:1}}});
  await f.service.command(f.key,{type:'token.stats',id:f.own.id,hp:55});assert.equal((await f.read()).hp,56);
  await f.service.command(f.key,{type:'effect.save',effect:{name:'Exposed ended',tokenId:f.own.id,trigger:'condition-removed',conditionId:'exposed',action:{type:'heal',amount:2}}});
  await f.service.command(f.dm.key,{type:'token.condition',id:f.own.id,condition:{id:'exposed'}});
  await f.service.command(f.key,{type:'token.move',id:f.own.id,x:275,y:525});assert.equal((await f.read()).conditions.length,0);assert.equal((await f.read()).hp,59);
});

test('overlapping triggers and a damage-triggered save preserve the remaining route until all blockers resolve',async()=>{
  const f=await fixture();await f.trap(375,{action:{type:'damage',amount:4}});await f.trap(375);
  await f.service.command(f.key,{type:'effect.save',effect:{name:'Pain save',tokenId:f.own.id,trigger:'damage',uses:1,action:{type:'condition',condition:{id:'shaken'},save:{ability:'con',dc:10}}}});
  await f.service.command(f.key,{type:'token.move',id:f.own.id,x:625,y:525});let token=await f.read();
  await f.service.command(f.dm.key,{type:'event.resolve',id:token.pendingMove.eventId,resolution:'apply'});
  token=await f.read();assert.equal(token.x,325);assert(token.pendingMove);assert.equal(token.hp,96);
  await f.service.command(f.key,{type:'event.resolve',id:token.pendingMove.eventId,resolution:'manual',total:20});
  token=await f.read();assert.equal(token.x,325);assert(token.pendingMove);assert.equal((await f.service.read()).scene.events.filter(e=>e.status==='pending').length,1);
  await f.service.command(f.dm.key,{type:'event.resolve',id:token.pendingMove.eventId,resolution:'apply'});
  assert.equal((await f.read()).x,625);
});

test('editing and restoring a reusable trap preserves its identity and the exact Tiny-token interruption point',async()=>{
  const f=await fixture(),trap=await f.trap(378,{once:false,size:.1});
  await f.service.command(f.dm.key,{type:'trap.save',trap:{...trap,name:'Edited reusable trap'}});
  assert.equal((await f.service.read()).scene.traps[0].id,trap.id);
  await f.service.command(f.key,{type:'token.stats',id:f.own.id,size:.5,sizeCategory:'Tiny'});
  await f.service.command(f.key,{type:'token.move',id:f.own.id,x:625,y:525});let token=await f.read();const stopped=token.x;
  assert.notEqual(stopped%25,12.5);assert(token.positionFree);
  await f.service.importCampaign(f.dm.key,await f.service.exportCampaign(f.dm.key));token=await f.read();
  assert.equal(token.x,stopped);assert.equal((await f.service.read()).scene.traps[0].id,trap.id);
  await f.service.command(f.dm.key,{type:'event.resolve',id:token.pendingMove.eventId,resolution:'apply',continue:false});
  await f.service.command(f.dm.key,{type:'token.mobility',id:token.id,profile:{speeds:{fly:30}}});
  await f.service.command(f.dm.key,{type:'token.travel',id:token.id,mode:'fly',z:10});assert.equal((await f.read()).x,stopped);
});

test('end-turn pending events survive backup without rerunning turn damage or finite regeneration',async()=>{
  const f=await fixture();await f.service.command(f.key,{type:'token.stats',id:f.own.id,hp:60});
  await f.service.command(f.key,{type:'effect.save',effect:{name:'End-turn save',tokenId:f.own.id,trigger:'turn-end',uses:1,action:{type:'damage',amount:8,save:{ability:'dex',dc:15,half:true}}}});
  await f.start();await f.service.command(f.dm.key,{type:'combat.next',requestId:'ending-001'});
  const before=await f.service.read();assert.equal(before.scene.combat.phase,'ending');
  await f.service.command(f.dm.key,{type:'combat.next',requestId:'ending-001'});assert.equal((await f.service.read()).revision,before.revision);
  await f.service.importCampaign(f.dm.key,await f.service.exportCampaign(f.dm.key));
  const restored=await f.service.read();assert.equal(restored.scene.combat.phase,'ending');assert.equal(restored.scene.combat.turnSerial,1);
  const e=restored.scene.events.find(e=>e.status==='pending');await f.service.command(f.dm.key,{type:'event.resolve',id:e.id,resolution:'success'});
  assert.equal((await f.service.read()).scene.combat.turnSerial,2);assert.equal((await f.read()).hp,16); // Unshared private HP is intentionally absent from GM backups.
  assert.equal((await f.service.read()).scene.effects.length,0);
});

test('temporary flight expires with a visible review event and never invents falling damage',async()=>{
  const f=await fixture();await f.service.command(f.key,{type:'token.stats',id:f.own.id,movementProfile:{speeds:{walk:30}}});
  await f.service.command(f.key,{type:'token.mobility',id:f.own.id,profile:{speeds:{fly:30},hover:true},turns:1,sourceName:'Flight spell'});await f.start();
  await f.service.command(f.key,{type:'token.travel',id:f.own.id,mode:'hover',z:10});await f.service.command(f.dm.key,{type:'combat.next'});
  const token=await f.read();assert.equal(token.mobility.z,10);assert.equal(token.hp,100);assert.equal(token.mobilityGrantTimer,null);
  const view=await f.service.view(f.key);assert(view.scene.events.some(e=>e.kind==='movement-review'));assert(view.scene.tokens.find(t=>t.id===token.id).travelState.paused);
});

test('printed Melting expires after its next start-turn tick and saves end Tricked',async()=>{
  const f=await fixture();for(const id of ['melting','tricked'])await f.service.command(f.dm.key,{type:'token.condition',id:f.own.id,condition:{id}});
  await f.start();let token=await f.read();assert(token.hp>=90 && token.hp<=99);assert(!token.conditions.some(row=>row.id==='melting'));assert(!token.conditions.some(row=>row.id==='tricked'));
  await f.service.command(f.dm.key,{type:'token.condition',id:token.id,condition:{id:'tricked'}});
  await f.service.command(f.key,{type:'effect.save',effect:{name:'Test save',tokenId:token.id,trigger:'turn-end',uses:1,action:{type:'damage',amount:0,save:{ability:'con',dc:10}}}});
  await f.service.command(f.dm.key,{type:'combat.next'});const e=(await f.service.read()).scene.events.find(e=>e.status==='pending');
  await f.service.command(f.key,{type:'event.resolve',id:e.id,resolution:'manual',total:15});assert(!(await f.read()).conditions.some(row=>row.id==='tricked'));
});

test('a changed concealed route can resolve without rolling back damage or teleporting past fog',async()=>{
  const f=await fixture();await f.trap(375,{action:{type:'damage',amount:7}});await f.service.command(f.key,{type:'token.move',id:f.own.id,x:625,y:525});
  let token=await f.read();await f.service.command(f.dm.key,{type:'fog.all',reveal:false});
  await f.service.command(f.dm.key,{type:'event.resolve',id:token.pendingMove.eventId,resolution:'apply'});token=await f.read();
  assert.equal(token.hp,93);assert.equal(token.x,325);assert.equal(token.pendingMove,null);
});

test('malformed builders and foreign effect edits are rejected atomically; disabled automation stays idle',async()=>{
  const f=await fixture(),npc=(await f.service.read()).scene.tokens[0];
  const next=await f.service.command(f.dm.key,{type:'effect.save',effect:{tokenId:npc.id,name:'GM regeneration',trigger:'turn-start',action:{type:'heal',amount:2}}}),id=next.scene.effects[0].id;
  for(const command of [
    {type:'effect.save',effect:{id,tokenId:f.own.id,name:'Stolen effect',trigger:'move',action:{type:'heal',amount:50}}},
    {type:'trap.save',trap:null},
    {type:'token.mobility',id:f.own.id,profile:{speeds:[]}},
    {type:'effect.save',effect:{tokenId:f.own.id,trigger:'turn-start',action:{type:'damage',amount:'10000d6'}}}
  ]){const old=await f.service.read();await assert.rejects(f.service.command(f.key,command));assert.deepEqual(await f.service.read(),old);}
  await f.service.command(f.key,{type:'token.stats',id:f.own.id,hp:50});await f.service.command(f.key,{type:'effect.save',effect:{tokenId:f.own.id,name:'Regeneration',trigger:'turn-start',action:{type:'heal',amount:10}}});
  await f.service.command(f.dm.key,{type:'scene.adventure',enabled:false});await f.start();assert.equal((await f.read()).hp,50);
  await assert.rejects(f.service.command(f.dm.key,{type:'combat.start'}),/already/);
});

test('map pings are shared in revealed cells, bounded, and keep concealed GM points private',async()=>{
  const f=await fixture();await f.service.command(f.key,{type:'map.ping',x:400,y:500});assert.equal((await f.service.view(f.dm.key)).scene.pings.length,1);
  await assert.rejects(f.service.command(f.key,{type:'map.ping',x:450,y:500}),/Wait/);
  await f.service.command(f.dm.key,{type:'fog.all',reveal:false});await f.service.command(f.dm.key,{type:'map.ping',x:1100,y:500});
  assert.equal((await f.service.view(f.key)).scene.pings.length,0);await assert.rejects(f.service.command(f.key,{type:'map.ping',x:1100,y:500}),/revealed/);
});

test('resource triggers restore capped Block and grow explicit extra-health grants without treating them as damage',async()=>{
  const f=await fixture(),token=await f.read();await f.service.command(f.key,{type:'token.stats',id:token.id,resources:{...token.resources,block:{current:2,max:5}}});
  for(const [name,resource,operation,value] of [['Restore Block','block','add',10],['Arcane grant','arcaneHealth','add',7]])await f.service.command(f.key,{type:'effect.save',effect:{tokenId:token.id,name,trigger:'turn-start',uses:1,action:{type:'resource',resource,operation,amount:value}}});
  await f.service.command(f.dm.key,{type:'token.condition',id:token.id,condition:{id:'exposed'}});await f.start();let after=await f.read();
  assert.equal(after.resources.block.current,5);assert.equal(after.resources.arcaneHealth.current,7);assert.equal(after.resources.arcaneHealth.max,7);assert(after.conditions.some(row=>row.id==='exposed'));
  await f.service.command(f.key,{type:'effect.save',effect:{tokenId:token.id,name:'Expire arcane grant',trigger:'turn-end',uses:1,action:{type:'resource',resource:'arcaneHealth',operation:'set',amount:0}}});
  await f.service.command(f.dm.key,{type:'combat.next'});after=await f.read();assert.equal(after.resources.arcaneHealth.current,0);assert.equal(after.resourceRevision,3);assert(after.conditions.some(row=>row.id==='exposed'));
});

test('a condition created during its own start phase does not lose its timer immediately',async()=>{
  const f=await fixture();await f.service.command(f.key,{type:'effect.save',effect:{tokenId:f.own.id,name:'Melt once',trigger:'turn-start',uses:1,action:{type:'condition',condition:{id:'melting'}}}});
  await f.start();assert((await f.read()).conditions.some(row=>row.id==='melting'));assert.equal((await f.read()).hp,100);
  for(let i=0;i<3;i++)await f.service.command(f.dm.key,{type:'combat.next'});
  const token=await f.read();assert(!token.conditions.some(row=>row.id==='melting'));assert(token.hp<100);
});

test('typed damage follows reduction then half rules, while an already-adjusted amount bypasses defenses',async()=>{
  const f=await fixture();await f.service.command(f.key,{type:'token.stats',id:f.own.id,movementProfile:{speeds:{walk:30},traits:{reductions:{all:4},resistances:['fire']}}});
  await f.trap(375,{action:{type:'damage',amount:20,damageType:'fire',save:{ability:'con',dc:10,half:true}}});await f.service.command(f.key,{type:'token.move',id:f.own.id,x:625,y:525});
  const event=(await f.service.read()).scene.events.find(e=>e.status==='pending');await f.service.command(f.dm.key,{type:'event.resolve',id:event.id,resolution:'success',continue:false});
  assert.equal((await f.read()).hp,96);
  await f.service.command(f.key,{type:'effect.save',effect:{tokenId:f.own.id,name:'Already adjusted damage',trigger:'turn-start',uses:1,action:{type:'damage',amount:10}}});await f.start();assert.equal((await f.read()).hp,86);
});
test('continuous intersections catch thin crossed lines, cone edges and altitude bands without endpoint sampling',()=>{
  const scene={gridSize:50,distancePerSquare:5,distanceUnit:'ft',width:1000,height:1000},a={x:100,y:300,z:0},b={x:900,y:300,z:0};
  const trap={shape:'line',x:500,y:100,size:40,width:.1,unit:'ft',angle:90,coneAngle:60,minHeight:0,maxHeight:5,touchFootprint:false};
  const interval=trapInterval(trap,a,b,scene,{size:1});assert(interval);assert(interval[0]<.5 && interval[1]>.5);
  assert.equal(trapInterval(trap,{...a,z:20},{...b,z:20},scene,{size:1}),null);
  const cone={...trap,shape:'cone',x:500,y:500,angle:0,size:20};assert(areaInterval(cone,{x:100,y:500},{x:900,y:500},scene));
  const covered=routeCells({x:25,y:25},{x:125,y:125},scene);for(const cell of [0,1,20,21,22,41,42])assert(covered.includes(cell));
});
