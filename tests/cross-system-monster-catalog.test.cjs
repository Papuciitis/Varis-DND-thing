'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),copy=value=>JSON.parse(JSON.stringify(value));
const records=JSON.parse(fs.readFileSync(path.join(root,'data/monsters/source/cross-system-index.json'),'utf8')).records;
const names=new Set(records.map(r=>r.name));
const catalog=require('./helpers/catalog.cjs')();

test('all cross-system profiles survive editor YAML export/import with original system notes',()=>{
  const section=copy(catalog.find(s=>s.key==='monsters'));
  const context=vm.createContext({localStorage:{getItem:()=>null,setItem:()=>{}}});
  vm.runInContext(fs.readFileSync(path.join(root,'web/monster-editor.js'),'utf8'),context);
  const editor=context.MonsterEditor;editor.apply(section);
  const added=section.entries.filter(e=>names.has(e.name));assert.equal(added.length,86);
  for(const entry of added)assert.doesNotThrow(()=>editor.validate(entry),entry.name);
  const payload=editor.sourceCollection({entries:added});
  const roundtrip=editor.parseYaml(editor.stringifyYaml(payload));
  assert.deepEqual(copy(roundtrip),copy(payload));
  editor.importCollection(roundtrip,section);
  assert.equal(section.entries.length,301);
  for(const record of records){
    const entry=section.entries.find(e=>e.name===record.name);
    assert.equal(entry.details.id,record.id);
    assert.equal(entry.details.original_5e.source_system,record.source_system);
    assert.equal(entry.details.encounter_theme,record.theme);
  }
  const original=section.entries.find(e=>e.name==='Goblin Shark'),edited=copy(original);
  edited.details.hp='87';editor.save(section,original,edited);
  assert.equal(section.entries.find(e=>e.name==='Goblin Shark').details.hp,'87');
  assert.equal(section.entries.find(e=>e.name==='Shark-Shifting Goblin').details.hp,'27');
  assert.equal(section.entries.length,301);
});
