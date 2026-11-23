'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const copy=value=>JSON.parse(JSON.stringify(value));
const source=fs.readFileSync(path.join(__dirname,'../web/magic-items.js'),'utf8');
const item=(name,id)=>({name,group:'Rare',source:'magic-items/rare.yaml',details:{id,desc:'Converted rules.',magic_bonus:'1'}});
function setup({storage=new Map(),entries=[item('One','one'),item('Two','two')],document}={}){
  const context=vm.createContext({document,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/magic-categories.js'),'utf8'),context);
  vm.runInContext(source,context);
  const section={key:'magic-items',entries};
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

test('category edits normalize labels, survive backup and export, and reject invalid batches atomically',()=>{
  const {api,section,storage}=setup();
  const [one,two]=section.entries;
  api.save(one,{...copy(one),details:{...one.details,category:' Wearables & jewelry '}});
  api.apply(section);
  assert.equal(section.entries[0].details.category,'wearables');
  assert.equal(api.backup().entries[0].entry.details.category,'wearables');
  assert.equal(api.sourceCollection(section,one.source).entries[0].category,'wearables');
  const before=storage.get('vara.magic-items.v1');
  for (const category of ['unknown',7,false,[],{}]) {
    const edited={...copy(two),details:{...two.details,category}};
    assert.throws(()=>api.save(two,edited),/valid magic item category/);
    assert.throws(()=>api.importBackup({kind:'vara.magic-items',version:1,entries:[
      {id:'one',entry:{...copy(one),name:'Valid first edit'}},{id:'two',entry:edited}
    ]}),/valid magic item category/);
    assert.equal(storage.get('vara.magic-items.v1'),before);
    assert.equal(api.backup().entries[0].entry.details.category,'wearables');
  }
  api.importBackup({kind:'vara.magic-items',version:1,entries:[
    {id:'two',entry:{...copy(two),details:{...two.details,category:'spellcasting'}}}
  ]});
  api.apply(section);
  assert.equal(section.entries[1].details.category,'spellcasting');
});

test('legacy saved edits and backups inherit compiled categories while retaining their current rules',()=>{
  const original={...item('Original','one'),details:{id:'one',type:'Weapon',category:'weapons',desc:'Source rules.',original_5e:'Original workbook text.'}};
  const legacy={...copy(original),name:'Renamed locally',details:{id:'one',type:'Weapon',desc:'Local rules.',original_5e:'Changed source text.'}};
  const storage=new Map([['vara.magic-items.v1',JSON.stringify({version:1,entries:[{id:'one',entry:legacy}]})]]);
  const {api,section}=setup({storage,entries:[copy(original)]});
  assert.equal(section.entries[0].name,'Renamed locally');
  assert.equal(section.entries[0].details.desc,'Local rules.');
  assert.equal(section.entries[0].details.category,'weapons');
  assert.equal(section.entries[0].details.original_5e,original.details.original_5e);
  api.importBackup({kind:'vara.magic-items',version:1,entries:[{id:'one',entry:legacy}]});
  api.apply(section);
  assert.equal(section.entries[0].details.category,'weapons');
  assert.equal(api.backup().entries[0].entry.details.category,'weapons');
  api.save(section.entries[0],{...copy(section.entries[0]),details:{...section.entries[0].details,category:'  '}});
  api.apply(section);
  assert.equal(section.entries[0].details.category,'');
  assert.equal(section.entries[0].details.desc,'Local rules.');
});

test('the category editor offers canonical choices and saves the selection with other edits',()=>{
  class Node {
    constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.textContent='';}
    append(...nodes){this.children.push(...nodes);}
    setAttribute(){}
    addEventListener(type,listener){this.listeners[type]=listener;}
  }
  const walk=node=>[node,...node.children.flatMap(walk)];
  const original={...item('Blade','one'),details:{id:'one',category:'weapons',desc:'Source rules.'}};
  const {api,section}=setup({entries:[original],document:{createElement:tag=>new Node(tag)}});
  let updated;
  const editor=api.editor(section,section.entries[0],entry=>updated=entry);
  const labels=walk(editor).filter(node=>node.tag==='label'&&node.children[0]?.textContent==='Category');
  assert.equal(labels.length,1);
  const select=labels[0].children.find(node=>node.tag==='select');
  assert.equal(select.value,'weapons');
  assert.equal(select.children.length,8);
  assert.ok(select.children.some(option=>option.value==='armor-shields'&&option.textContent==='Armor & shields'));
  select.value='wearables';
  const form=walk(editor).find(node=>node.tag==='form');
  form.listeners.submit({preventDefault(){}});
  assert.equal(updated.details.category,'wearables');
  assert.equal(updated.details.desc,'Source rules.');
  assert.equal(api.backup().entries[0].entry.details.category,'wearables');
});
