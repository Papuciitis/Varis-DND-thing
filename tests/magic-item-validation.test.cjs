'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const copy=value=>JSON.parse(JSON.stringify(value));
const source=fs.readFileSync(path.join(__dirname,'../web/magic-items.js'),'utf8');
const item=(name,id)=>({name,group:'Rare',source:'magic-items/rare.yaml',details:{id,desc:'Converted rules.',magic_bonus:'1'}});
function setup(){
  const storage=new Map();
  const context=vm.createContext({localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}});
  vm.runInContext(source,context);
  const section={key:'magic-items',entries:[item('One','one'),item('Two','two')]};
  context.MagicItems.apply(section);
  return {api:context.MagicItems,section,storage};
}

test('reserved identity fields and invalid enhancement values leave saved edits unchanged',()=>{
  const {api,section,storage}=setup();
  const original=section.entries[0];
  api.save(original,{...copy(original),name:'Saved one'});
  const before=storage.get('vara.magic-items.v1');
  for(const field of ['name','group']){
    const edited=copy(original);edited.details[field]='Forged';
    assert.throws(()=>api.save(original,edited),/own fields/);
    assert.throws(()=>api.importBackup({kind:'vara.magic-items',version:1,entries:[{id:'one',entry:edited}]}),/own fields/);
    assert.equal(storage.get('vara.magic-items.v1'),before);
  }
  for(const value of ['bad','', '1.5', Infinity, NaN, false, null, [], {}]){
    const edited=copy(original);edited.details.magic_bonus=value;
    assert.throws(()=>api.save(original,edited),/whole number/);
    assert.equal(storage.get('vara.magic-items.v1'),before);
  }
  for(const value of ['+2',0,-1]){
    const edited=copy(original);edited.details.magic_bonus=value;
    assert.doesNotThrow(()=>api.save(original,edited));
  }
});

test('backup name conflicts reject atomically while a complete valid name swap succeeds',()=>{
  const {api,section,storage}=setup();
  const [one,two]=section.entries;
  const before=copy(api.backup());
  assert.throws(()=>api.importBackup({kind:'vara.magic-items',version:1,entries:[
    {id:'two',entry:{...copy(two),name:' oNe '}}
  ]}),/already has this name/);
  assert.deepEqual(copy(api.backup()),before);
  assert.equal(storage.size,0);
  api.importBackup({kind:'vara.magic-items',version:1,entries:[
    {id:'one',entry:{...copy(one),name:'Two'}},
    {id:'two',entry:{...copy(two),name:'One'}}
  ]});
  api.apply(section);
  assert.deepEqual(section.entries.map(row=>row.name),['Two','One']);
});

test('source export preserves top-level identity even for an unexpected reserved detail',()=>{
  const {api,section}=setup();
  section.entries[0].details.name='Forged';
  section.entries[0].details.group='Wrong';
  const result=copy(api.sourceCollection(section,'magic-items/rare.yaml'));
  assert.equal(result.entries[0].name,'One');
  assert.equal(result.entries[0].group,'Rare');
  assert.equal(result.entries.length,2);
});
