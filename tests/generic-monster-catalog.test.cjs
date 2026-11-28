'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const output=process.env.VARA_MONSTER_TEST_OUTPUT||path.join(root,'site');
const read=file=>JSON.parse(fs.readFileSync(path.join(output,file),'utf8'));
const manifest=read('data/catalog-manifest.json');
const catalog=manifest.sections.map(section=>read(section.url));
const section=catalog.find(section=>section.key==='monsters');
const records=JSON.parse(fs.readFileSync(path.join(root,'data/monsters/source/generic-name-index.json'),'utf8')).records;
const copy=value=>JSON.parse(JSON.stringify(value));
function boot(saved){
  const context=vm.createContext({localStorage:{getItem:()=>saved||null,setItem:()=>{}}});
  for(const file of ['monster-editor.js','monster-views.js'])vm.runInContext(fs.readFileSync(path.join(root,'web',file),'utf8'),context);
  return context;
}

test('built generic profiles remain editable and export all targeted renames without adding creatures',()=>{
  const context=boot(),data=copy(section);context.MonsterEditor.apply(data);assert.equal(data.entries.length,302);
  for(const record of records){
    const entry=data.entries.find(entry=>entry.name===record.to);assert(entry,record.to);
    assert.doesNotThrow(()=>context.MonsterEditor.validate(entry));assert.equal(entry.details.id,record.id);
    assert.equal(entry.monster_target.name,record.from);assert(entry.details.encounter_theme);
  }
  const exported=copy(context.MonsterEditor.customCollection());assert.equal(exported.entries.length,0);assert.equal(exported.monster_overrides.length,69);
  for(const record of records){const row=exported.monster_overrides.find(row=>row.target.name===record.from);assert.equal(row.entry.name,record.to);assert.equal(row.entry.id,record.id);}
});

test('legacy browser edits adopt generic default names while retaining HP edits and explicit custom names',()=>{
  const record=records.find(record=>record.from==='Aurumathar'),current=section.entries.find(entry=>entry.name===record.to),legacy=copy(current);legacy.name=record.from;legacy.details.hp='123';delete legacy.details.source_naming;
  const key='id:'+record.id,target={source:record.source,group:record.group,name:record.from};
  const saved=name=>JSON.stringify({version:1,changes:[{key,mode:'override',target,entry:{...legacy,name}}]});
  const context=boot(saved(record.from)),data=copy(section);context.MonsterEditor.apply(data);
  const renamed=data.entries.find(entry=>entry.details.id===record.id);assert.equal(renamed.name,record.to);assert.equal(renamed.details.hp,'123');
  const row=context.MonsterEditor.customCollection().monster_overrides.find(row=>row.target.name===record.from);assert.equal(row.entry.name,record.to);assert.equal(row.entry.hp,'123');
  const custom=boot(saved('My campaign dragon')),customData=copy(section);custom.MonsterEditor.apply(customData);assert.equal(customData.entries.find(entry=>entry.details.id===record.id).name,'My campaign dragon');
});

test('previous generic defaults migrate without changing explicit campaign names',()=>{
  const record=records.find(r=>r.to==='Lionfolk Greataxe Captain');
  const current=section.entries.find(e=>e.name===record.to),legacy=copy(current);
  const previous=current.details.source_naming.previous_names.find(n=>n!==record.from);
  assert(previous);legacy.name=previous;legacy.details.hp='198';delete legacy.details.source_naming;
  const saved=name=>JSON.stringify({version:1,changes:[{key:'id:'+record.id,mode:'override',target:current.monster_target,entry:{...legacy,name}}]});
  const context=boot(saved(previous)),data=copy(section);context.MonsterEditor.apply(data);
  assert.equal(data.entries.find(e=>e.details.id===record.id).name,record.to);
  assert.equal(data.entries.find(e=>e.details.id===record.id).details.hp,'198');
  const custom=boot(saved('My spear captain')),customData=copy(section);custom.MonsterEditor.apply(customData);
  assert.equal(customData.entries.find(e=>e.details.id===record.id).name,'My spear captain');
});

test('saved edits and YAML imports adopt a moved collection by stable ID',()=>{
  const record=records.find(r=>r.to==='Stormcloud Devourer'),current=section.entries.find(e=>e.name===record.to);
  const legacy=copy(current),target={source:'monsters/retired-collection.yaml',group:'Retired creature collection',name:record.from};
  legacy.name=record.from;legacy.group=target.group;legacy.source=target.source;legacy.details.hp='61';delete legacy.details.source_naming;
  const saved=JSON.stringify({version:1,changes:[{key:'id:'+record.id,mode:'override',target,entry:legacy}]});
  const context=boot(saved),data=copy(section);context.MonsterEditor.apply(data);
  const migrated=data.entries.find(e=>e.details.id===record.id);
  assert.equal(migrated.name,record.to);assert.equal(migrated.details.hp,'61');assert.equal(migrated.group,current.group);
  const exported=copy(context.MonsterEditor.customCollection()).monster_overrides.find(r=>r.entry.id===record.id);
  assert.equal(exported.target.source,current.source);assert.equal(exported.entry.group,current.group);
  const fresh=boot(),freshData=copy(section);fresh.MonsterEditor.apply(freshData);
  fresh.MonsterEditor.importCollection({section:'monsters',entries:[],monster_overrides:[{target,entry:{name:legacy.name,group:legacy.group,...legacy.details}}]},freshData);
  const imported=freshData.entries.find(e=>e.details.id===record.id);
  assert.equal(imported.name,record.to);assert.equal(imported.source,current.source);assert.equal(imported.details.hp,'61');
});
