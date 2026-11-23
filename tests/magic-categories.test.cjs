'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const copy=value=>JSON.parse(JSON.stringify(value));
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/magic-categories.js'),'utf8'),context);
const api=context.MagicCategories;
const item=(name,type,details={})=>({name,group:'Rare',details:{type,...details}});

test('explicit category keys and display labels override ambiguous names and item types',()=>{
  assert.deepEqual(copy(api.categories).map(row=>row.key),[
    'weapons','armor-shields','wearables','spellcasting','scrolls','consumables','misc'
  ]);
  assert.equal(api.category(item('Sword ring','Weapon',{category:'wearables'})),'wearables');
  assert.equal(api.category(item('Spell scroll','Scroll',{category:'  STAVES, WANDS & RODS  '})),'spellcasting');
  assert.equal(api.category(item('Shield','Shield',{category:'misc'})),'misc');
});

test('fallback uses item type before name and avoids treating rarity as a category',()=>{
  const cases=[
    [item('Ring-shaped blade','Weapon'),'weapons'],
    [item('Arrows','Ammunition'),'weapons'],
    [item('Paradiso','Shield'),'armor-shields'],
    [item('Old coat','Armor'),'armor-shields'],
    [item('Invisible band','Ring'),'wearables'],
    [item('Spellblade','Staff'),'spellcasting'],
    [item('Anything','Wand'),'spellcasting'],
    [item('Anything','Rod'),'spellcasting'],
    [item('Anything','Scroll'),'scrolls'],
    [item('Anything','Potion'),'consumables'],
    [item('Dream knife','Wondrous item',{base_item:'Dagger'}),'weapons'],
    [item('Dream staff','Wondrous item',{base_item:'Quarterstaff'}),'weapons'],
    [item('Veiled protection','Wondrous item',{base_item:'Leather armor'}),'armor-shields'],
    [item('Cloak of Elvenkind','Wondrous item'),'wearables'],
    [item('Staff of Rain','Wondrous item'),'spellcasting'],
    [item('Potion of Rain','Wondrous item'),'consumables'],
    [item('Scroll of Rain','Wondrous item'),'scrolls'],
    [item('Bag of Holding','Wondrous item'),'misc'],
    [item('No obvious kind','Wondrous item',{category:'unknown'}),'misc'],
    [{name:'Unknown',group:'Legendary',details:{}},'misc'],
    [undefined,'misc']
  ];
  for (const [entry,expected] of cases) assert.equal(api.category(entry),expected,entry?.name);
});

test('category grouping includes each entry once in canonical order without mutating sources',()=>{
  const entries=[item('Bag','Wondrous item'),item('Shield','Shield'),item('Dagger','Weapon'),item('Arrow','Ammunition')];
  const before=copy(entries),groups=api.categoriesFor(entries);
  assert.deepEqual(copy(groups).map(({key,count})=>({key,count})),[
    {key:'weapons',count:2},{key:'armor-shields',count:1},{key:'misc',count:1}
  ]);
  assert.equal(groups[0].entries[0],entries[2]);
  assert.equal(groups.reduce((sum,group)=>sum+group.count,0),entries.length);
  assert.deepEqual(entries,before);
  assert.deepEqual(copy(api.categoriesFor([])),[]);
});

test('category search terms include labels and common spelling aliases',()=>{
  assert.match(api.searchTerms(item('Shield','Shield')),/Armor & shields.*armour/);
  assert.match(api.searchTerms(item('Ring','Ring')),/Wearables & jewelry.*jewellery/);
  assert.match(api.searchTerms(item('Staff','Staff')),/Staves, wands & rods.*staff/);
  assert.match(api.searchTerms(item('Arrow','Ammunition')),/Weapons & ammunition.*ammo/);
});

test('the built magic-item collection is fully partitioned without losing stable identities',()=>{
  const catalog=require('./helpers/catalog.cjs')();
  const entries=catalog.find(section=>section.key==='magic-items').entries;
  const before=copy(entries),groups=api.categoriesFor(entries);
  assert.equal(entries.length,300);
  for (const entry of entries) assert.ok(api.categories.some(category=>category.key===entry.details.category), entry.name+' has no reviewed category');
  assert.equal(groups.reduce((sum,group)=>sum+group.count,0),entries.length);
  const ids=groups.flatMap(group=>Array.from(group.entries,entry=>entry.details.id));
  assert.equal(new Set(ids).size,entries.length);
  assert.deepEqual([...ids].sort(),entries.map(entry=>entry.details.id).sort());
  for (const group of groups) assert.ok(api.categories.some(row=>row.key===group.key));
  assert.deepEqual(entries,before);
});
