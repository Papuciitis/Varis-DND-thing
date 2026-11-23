'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const copy=value=>JSON.parse(JSON.stringify(value));
const creature=(name='Guard',group='Humanoids')=>({name,group,source:'monsters/converted.yaml',details:{id:'guard',meta:'Medium humanoid',ac:'12',hp:'20 (3d8 + 6)',block:'2 / +3',speed:'30 ft.',abilities:{str:'12–13 (modifier +1; score not recorded)'},actions:[{name:'Spear',description:'Melee attack +3; 1d6 + 1 piercing damage.',block_dc:'11'}],original_5e:{hp:20},source_ref:'Imported source',conversion_notes:['Converted block rules']}});
function boot(storage=new Map(),throws=false){const context=vm.createContext({localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>{if(throws)throw new Error('Quota');storage.set(key,value);}}});vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web','monster-editor.js'),'utf8'),context);return context.MonsterEditor;}

test('new statblocks persist across reloads, enter the catalog once, and can be removed',()=>{
  const storage=new Map(),editor=boot(storage),section={key:'monsters',entries:[creature()]};editor.apply(section);
  const added=editor.save(section,null,{name:'Custom wisp',group:'Custom monsters',details:{hp:'8',block:'0 / +2',actions:[{name:'Spark',description:'2 lightning damage.'}]}});
  assert.equal(section.entries.length,2);assert.match(added.details.id,/^custom-/);editor.apply(section);assert.equal(section.entries.length,2);
  const second=boot(storage),fresh={key:'monsters',entries:[creature()]};second.apply(fresh);assert.equal(fresh.entries.length,2);second.reset(fresh,fresh.entries.find(row=>row.name==='Custom wisp'));assert.equal(fresh.entries.length,1);
});

test('renamed edits retain the original YAML target and reset the original monster',()=>{
  const editor=boot(),section={key:'monsters',entries:[creature()]};editor.apply(section);const original=section.entries[0];
  editor.save(section,original,{...copy(original),name:'Veteran guard',group:'Town guards',details:{...original.details,hp:'42'}});
  const exported=copy(editor.customCollection());assert.equal(exported.entries.length,0);assert.equal(exported.monster_overrides[0].target.name,'Guard');assert.equal(exported.monster_overrides[0].target.group,'Humanoids');assert.equal(exported.monster_overrides[0].entry.name,'Veteran guard');
  assert.equal(section.entries[0].details.hp,'42');assert.equal(section.entries[0].monster_target.name,'Guard');editor.save(section,section.entries[0],{...copy(section.entries[0]),name:'Guard captain'});assert.equal(section.entries[0].monster_target.name,'Guard');editor.reset(section,section.entries[0]);assert.equal(section.entries[0].name,'Guard');assert.equal(section.entries[0].details.hp,'20 (3d8 + 6)');
});

test('compiled additions and targeted renames survive rebuilding without duplicating entries',()=>{
  const storage=new Map(),editor=boot(storage),section={key:'monsters',entries:[creature()]};editor.apply(section);
  editor.save(section,section.entries[0],{...copy(section.entries[0]),name:'Renamed guard'});
  const added=editor.save(section,null,{name:'New beast',group:'Beasts',details:{hp:'10'}});
  const compiledGuard={...creature('Renamed guard'),monster_target:{source:'monsters/converted.yaml',group:'Humanoids',name:'Guard'}};
  const compiledAddition={...copy(added),source:'monsters/custom.yaml'};delete compiledAddition._monsterEditorKey;
  const fresh={key:'monsters',entries:[compiledGuard,compiledAddition]},second=boot(storage);second.apply(fresh);assert.equal(fresh.entries.length,2);assert.equal(fresh.entries[0].name,'Renamed guard');
});

test('YAML serialization roundtrips dice, hashes, Unicode, multiline text and original nested fields',()=>{
  const editor=boot(),collection={section:'monsters',entries:[{name:'Mārtiņa monster',group:'Custom monsters',cr:'1/4',hp:'3d8 + 2',note:'yes: true # not a comment',description:'First line\nSecond line',traits:[{name:'Odd trait',description:'Text: with colon'}],original_5e:{abilities:{str:12},enabled:false},empty:[]}],monster_overrides:[]};
  assert.deepEqual(copy(editor.parseYaml(editor.stringifyYaml(collection))),collection);
  const ordinary='section: monsters\nentries:\n  - name: Goblin\n    group: Humanoids\n    hp: 2d6 + 2\n    description: |-\n      First line\n      Second line\nmonster_overrides: []\n';
  const parsed=editor.parseYaml(ordinary);assert.equal(parsed.entries[0].description,'First line\nSecond line');assert.equal(parsed.entries[0].hp,'2d6 + 2');
});

test('imports are atomic and reject invalid overrides, repeated IDs, and duplicate names',()=>{
  const editor=boot(),section={key:'monsters',entries:[creature()]};editor.apply(section);
  editor.save(section,null,{name:'Existing custom',group:'Beasts',details:{hp:'10'}});const before=copy(editor.customCollection());
  assert.throws(()=>editor.importCollection({section:'monsters',entries:[{name:'Valid',group:'Beasts',hp:'20'}],monster_overrides:[{target:{source:'missing.yaml',name:'Missing',group:'Beasts'},entry:{name:'Missing',group:'Beasts'}}]},section),/missing/i);
  assert.deepEqual(copy(editor.customCollection()),before);
  assert.throws(()=>editor.importCollection({section:'monsters',entries:[{id:'same',name:'One',group:'Beasts'},{id:'same',name:'Two',group:'Beasts'}]},section),/repeats/);
  assert.throws(()=>editor.save(section,null,{name:'Guard',group:'Humanoids',details:{hp:'5'}}),/already/);
});

test('custom YAML restores both additions and edits without replacing source collections',()=>{
  const editor=boot(),section={key:'monsters',entries:[creature()]};editor.apply(section);editor.save(section,section.entries[0],{...copy(section.entries[0]),name:'Campaign guard'});editor.save(section,null,{name:'Campaign imp',group:'Fiends',details:{hp:'12'}});
  const exported=editor.stringifyYaml(editor.customCollection()),freshEditor=boot(),fresh={key:'monsters',entries:[creature()]};freshEditor.apply(fresh);freshEditor.importCollection(freshEditor.parseYaml(exported),fresh);
  assert.equal(fresh.entries.length,2);assert.equal(fresh.entries[0].name,'Campaign guard');assert.equal(fresh.entries[1].name,'Campaign imp');assert.equal(fresh.entries[0].source,'monsters/converted.yaml');
});

test('storage failure preserves an exportable in-memory statblock and reports its status',()=>{
  const editor=boot(new Map(),true),section={key:'monsters',entries:[]};editor.apply(section);editor.save(section,null,{name:'Unsaved monster',group:'Custom monsters',details:{hp:'20'}});
  assert.match(editor.storageError,/could not save/);assert.equal(editor.customCollection().entries[0].name,'Unsaved monster');
});

test('editor keeps text scores and filters obsolete source mechanics out of search',()=>{
  const editor=boot(),entry=creature();assert.equal(editor.validate(entry).details.abilities.str,entry.details.abilities.str);
  assert.equal(editor.searchable(entry).original_5e,undefined);assert.equal(editor.searchable(entry).source_ref,undefined);assert.equal(editor.searchable(entry).conversion_notes,undefined);
});

test('duplicating a converted monster keeps its source and donor attribution under a new custom identity',()=>{
  const editor=boot(),original=creature(); original.details.replacement_sources=['Existing donor rule'];
  const section={key:'monsters',entries:[original]};editor.apply(section);
  const draft=copy(section.entries[0]);draft.name='Guard variant';delete draft.details.id;
  const added=editor.save(section,section.entries[0],draft,true);
  assert.notEqual(added.details.id,original.details.id);
  assert.equal(added.source,'monsters/custom.yaml');
  assert.deepEqual(copy(added.details.replacement_sources),['Existing donor rule']);
  assert.deepEqual(copy(added.details.original_5e),{hp:20});
  assert.equal(added.details.source_ref,'Imported source');
});

test('YAML parser rejects tags, duplicate keys and prototype pollution',()=>{
  const editor=boot();assert.throws(()=>editor.parseYaml('section: monsters\nsection: spells'),/invalid YAML/);assert.throws(()=>editor.parseYaml('value: !!js/function dangerous'),/invalid YAML/);assert.throws(()=>editor.parseYaml('__proto__: malicious'),/invalid YAML/);
});

test('re-export from clean browser storage preserves compiled custom additions and overrides',()=>{
  const custom={name:'Homebrew imp',group:'Fiends',source:'monsters/custom.yaml',details:{id:'custom-imp',hp:'12'}};
  const edited={...creature('City guard'),monster_target:{source:'monsters/converted.yaml',group:'Humanoids',name:'Guard'}};
  const editor=boot(),section={key:'monsters',entries:[custom,edited]};editor.apply(section);
  let exported=copy(editor.customCollection());assert.equal(exported.entries.length,1);assert.equal(exported.monster_overrides.length,1);assert.equal(exported.monster_overrides[0].target.name,'Guard');
  editor.save(section,section.entries[0],{...copy(section.entries[0]),details:{...section.entries[0].details,hp:'18'}});
  exported=copy(editor.customCollection());assert.equal(exported.entries[0].hp,'18');assert.equal(exported.monster_overrides.length,1);assert.equal(exported.entries.length,1);assert.equal(exported.monster_overrides.some(row=>row.target.source==='monsters/custom.yaml'),false);
  editor.reset(section,section.entries[0]);assert.equal(editor.customCollection().entries[0].hp,'12');
});

test('monster names are unique across collections and renamed original aliases stay reserved',()=>{
  const editor=boot(),section={key:'monsters',entries:[creature()]};editor.apply(section);
  assert.throws(()=>editor.save(section,null,{name:'Guard',group:'Other collection',details:{hp:'10'}}),/already/);
  editor.save(section,section.entries[0],{...copy(section.entries[0]),name:'Veteran'});
  assert.throws(()=>editor.save(section,null,{name:'Guard',group:'Other collection',details:{hp:'10'}}),/reserved/);
});

test('provenance survives direct and imported edits, and reserved metadata cannot become monster fields',()=>{
  const editor=boot(),section={key:'monsters',entries:[creature()]};editor.apply(section);const original=section.entries[0];
  editor.save(section,original,{...copy(original),details:{...original.details,original_5e:'Changed source',source_ref:'Wrong source'}});
  assert.deepEqual(copy(editor.customCollection().monster_overrides[0].entry.original_5e),{hp:20});assert.equal(editor.customCollection().monster_overrides[0].entry.source_ref,'Imported source');
  assert.throws(()=>editor.validate({...creature(),details:{source:'arbitrary.yaml'}}),/reserved/);
});
