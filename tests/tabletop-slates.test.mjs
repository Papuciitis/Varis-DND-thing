import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomService,MemoryStore} from '../tabletop/server/room-service.mjs';
import * as resources from '../tabletop/web/resources.mjs';
import {TokenTools} from '../tabletop/web/token-tools.mjs';

async function fixture(){
  const storage=new MemoryStore(),service=new RoomService(storage);
  const dm=await service.create('0123456789abcdef','Slates','DM'),key='d'.repeat(64);
  const player=await service.join(key,'Scout');return {storage,service,dm,key,player};
}
test('repeated ready notifications do not feed linked-sheet saves back into new pulls',()=>{
  let pulls=0;const tools={connected:false,render(){},sources:{pull(){pulls++;}}};
  for(const value of [true,true,true,false,true])TokenTools.prototype.setConnected.call(tools,value);
  assert.equal(pulls,2,'Only an initial connection or reconnection should pull saved sheets.');
});
test('combined health uses current extra health and fixed proportional capacity',()=>{
  const summary=resources.healthSummary({canViewStats:true,hp:20,maxHp:40,resources:{
    tempHP:{current:10,max:100},arcaneHealth:{current:5,max:80},armorClass:{current:17,max:null}}});
  assert.equal(summary.current,35);assert.equal(summary.max,55);assert.equal(summary.armorClass,17);
  assert.deepEqual(summary.segments.map(s=>s.value),[20,10,5]);
  assert(Math.abs(summary.segments.reduce((sum,s)=>sum+s.fraction,0)-35/55)<1e-10);
  assert.equal(resources.healthSummary({canViewStats:false,hp:null}),null);
});
test('map bars require selected or hovered tokens and retain privacy at zero HP',()=>{
  const token={id:'owned-token',hp:0,maxHp:20,canViewStats:true,resources:{}};
  assert.equal(resources.tokenBarsVisible(token,null,null),false);
  assert.equal(resources.tokenBarsVisible(token,token.id,null),true);
  assert.equal(resources.tokenBarsVisible(token,null,token.id),true);
  assert.equal(resources.tokenBarsVisible({...token,canViewStats:false},token.id,token.id),false);
  assert.equal(resources.healthSummary(token).current,0);
});
test('utility readings keep Block separate and represent AC and extra health in the combined display',()=>{
  const token={canViewStats:true,hp:20,maxHp:40,resources:{armorClass:{current:17,max:null},
    block:{current:4,max:8},tempHP:{current:5,max:10},arcaneHealth:{current:9,max:20}},
    bars:[{enabled:true,label:'AC',resource:'armorClass'},{enabled:true,label:'Block',resource:'block'}]};
  assert.deepEqual(resources.utilityReadings(token).map(bar=>bar.key),['hp','block']);
  token.bars=[{enabled:true,label:'Temp',resource:'tempHP'},{enabled:true,label:'Ward',resource:'arcaneHealth'}];
  assert.deepEqual(resources.utilityReadings(token).map(bar=>bar.key),['hp']);
  assert.equal(resources.healthSummary(token).current,34);
});
test('linked monster snapshots stay stable after server validation',async()=>{
  const {service,dm}=await fixture(),token=dm.view.scene.tokens[0],entry={name:'Giant',details:{hp:40,ac:16,meta:'Huge giant',abilities:{dex:12}}};
  const view=await service.command(dm.key,{type:'token.update',id:token.id,...resources.monsterStats(entry)});
  const saved=view.scene.tokens.find(t=>t.id===token.id),next=resources.monsterStats(entry,saved);
  assert.equal(JSON.stringify(saved.statblock),JSON.stringify(next.statblock),'Focusing a linked monster should not create another source update.');
});
test('campaign chat uses the authenticated sender and rejects empty or oversized text atomically',async()=>{
  const {service,dm,key}=await fixture();
  await service.command(key,{type:'chat.send',text:'Hello, party!',name:'Spoofed DM'});
  const view=await service.view(dm.key);
  assert.equal(view.log.at(-1).name,'Scout');assert.equal(view.log.at(-1).kind,'chat');
  assert.equal(view.log.at(-1).text,'Hello, party!');
  await assert.rejects(service.command(key,{type:'chat.send',text:'   '}));
  await assert.rejects(service.command(key,{type:'chat.send',text:'x'.repeat(1001)}));
  assert.deepEqual(await service.view(dm.key),view);
});
test('GM notes have private drafts, explicit publication, revocation and persistence',async()=>{
  const {service,storage,dm,key}=await fixture();
  let view=await service.command(dm.key,{type:'note.save',title:'Secret vault',text:'The dragon is asleep.',shared:false});
  const note=view.scene.notes[0];assert(note.id);
  assert(!JSON.stringify(await service.view(key)).includes('Secret vault'));
  await assert.rejects(service.command(key,{type:'note.save',id:note.id,title:'Forged',text:'Changed',shared:true}),/DM/);
  await service.command(dm.key,{type:'note.save',id:note.id,title:'Quest',text:'Find the vault.',shared:true});
  assert.equal((await service.view(key)).scene.notes[0].text,'Find the vault.');
  const reopened=new RoomService(storage);
  assert.equal((await reopened.view(key)).scene.notes[0].title,'Quest');
  await reopened.command(dm.key,{type:'note.save',id:note.id,title:'Quest',text:'Find the vault.',shared:false});
  assert.deepEqual((await reopened.view(key)).scene.notes,[]);
  await reopened.command(dm.key,{type:'note.delete',id:note.id});
  assert.deepEqual((await reopened.view(dm.key)).scene.notes,[]);
});
test('campaign backups preserve GM notes and invalid note edits leave stored notes unchanged',async()=>{
  const {service,dm}=await fixture();
  await service.command(dm.key,{type:'note.save',title:'Briefing',text:'Meet at dusk.',shared:true});
  const backup=await service.exportCampaign(dm.key),before=await service.view(dm.key);
  await assert.rejects(service.command(dm.key,{type:'note.save',title:'Too much',text:'x'.repeat(8001),shared:true}));
  assert.deepEqual(await service.view(dm.key),before);
  const restored=await service.importCampaign(dm.key,backup);
  assert.equal(restored.scene.notes[0].text,'Meet at dusk.');
});
