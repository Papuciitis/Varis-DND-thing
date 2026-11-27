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
  const context=boot(),data=copy(section);context.MonsterEditor.apply(data);assert.equal(data.entries.length,301);
  for(const record of records){
    const entry=data.entries.find(entry=>entry.name===record.to);assert(entry,record.to);
    assert.doesNotThrow(()=>context.MonsterEditor.validate(entry));assert.equal(entry.details.id,record.id);
    assert.equal(entry.monster_target.name,record.from);assert(entry.details.encounter_theme);
  }
  const exported=copy(context.MonsterEditor.customCollection());assert.equal(exported.entries.length,0);assert.equal(exported.monster_overrides.length,20);
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
