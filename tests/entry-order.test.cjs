'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const c=vm.createContext({Intl});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../web/entry-order.js'),'utf8'),c);return c.EntryOrder;}
test('numeric level ordering handles cantrips, 2 before 10, name ties and unknowns last in either direction',()=>{
 const order=setup(),rows=[{name:'Unknown',details:{}},{name:'Ten',details:{lvl:'10'}},{name:'Beta',details:{lvl:'2'}},{name:'Alpha',details:{lvl:'2'}},{name:'Zero',group:'Arcane cantrips',details:{}}];
 assert.deepEqual([...rows].sort((a,b)=>order.compare(a,b,'level-asc')).map(e=>e.name),['Zero','Alpha','Beta','Ten','Unknown']);
 assert.deepEqual([...rows].sort((a,b)=>order.compare(a,b,'level-desc')).map(e=>e.name),['Ten','Alpha','Beta','Zero','Unknown']);
 assert.equal(order.level({requiredLevel:4}),4);assert.equal(order.level({minLevel:7}),7);
 assert.equal(order.level({details:{requirements:'level 5'}}),null);assert.equal(order.level({details:{lvl:''}}),null);
});
test('challenge sorting preserves fractional CR and never treats missing or malformed CR as zero',()=>{
 const order=setup(),rows=[{name:'Whole',details:{cr:'2'}},{name:'Half',details:{cr:'1/2'}},{name:'Quarter',details:{cr:'1/4'}},{name:'None',details:{}},{name:'Bad',details:{cr:'1/0'}}];
 assert.deepEqual([...rows].sort((a,b)=>order.compare(a,b,'challenge-asc')).map(e=>e.name),['Quarter','Half','Whole','Bad','None']);
 assert.equal(order.challenge({details:{cr:'0'}}),0);assert.equal(order.challenge({details:{cr:'draft'}}),null);
});
test('hexes keep their explicit zero level but follow minor, major, greater tiers',()=>{
 const order=setup(),rows=[{name:'A greater',group:'Greater hexes',details:{lvl:'0'}},{name:'Z minor',group:'Minor hexes',details:{lvl:'0'}},{name:'M major',group:'Major hexes',details:{lvl:'0'}},{name:'Z cantrip',group:'Oath cantrips',details:{lvl:'0'}}];
 assert.deepEqual([...rows].sort((a,b)=>order.compare(a,b,'level-asc')).map(e=>e.name),['Z cantrip','Z minor','M major','A greater']);
 assert.equal(order.level(rows[0]),0);
});
test('sorting never mutates source records or infers levels for backgrounds and equipment',()=>{
 const order=setup(),row={name:'Zed',details:{effect:'Cast a level 3 spell'}};const before=JSON.stringify(row);
 assert.equal(order.level(row),null);assert.equal(order.compare(row,{name:'Able'},'name')>0,true);assert.equal(JSON.stringify(row),before);
});

test('group ordering pairs spell traditions, orders hex tiers and leaves unknown rules last',()=>{
 const order=setup();assert.equal(typeof order.compareGroups,'function');
 const groups=['Arcane cantrips','Arcane spells','Mystic cantrips','Mystic spells','Oath cantrips','Oath spells','Occult cantrips','Occult spells','Minor hexes','Major hexes','Greater hexes','Ancient rituals','Magic rules'];
 assert.deepEqual([...groups].reverse().sort((a,b)=>order.compareGroups('spells',a,b)),groups);
 assert.deepEqual(['Fighter archetypes','Base class','Bard archetypes'].sort((a,b)=>order.compareGroups({key:'classes'},a,b)),['Base class','Bard archetypes','Fighter archetypes']);
 assert.deepEqual(['Z gear','A gear'].sort((a,b)=>order.compareGroups('items',a,b)),['A gear','Z gear']);
});

test('class of magic unifies each tradition\'s spells and cantrips without assigning hex magic',()=>{
 const order=setup();
 assert.deepEqual(Array.from(order.magicClasses),['Arcane','Oath','Occult','Mystic']);
 for (const name of order.magicClasses) {
   for (const group of [name,name+' spells',name+' cantrips']) assert.equal(order.magicClass({group}),name);
 }
 assert.equal(order.magicClass('  oAtH  cantrips '),'Oath');
 assert.equal(order.magicClass({group:'Custom group',details:{tradition:'Mystic'}}),'Mystic');
 for (const group of ['Minor hexes','Major hexes','Greater hexes','Magic rules','Ancient rituals']) assert.equal(order.magicClass({group}),'');
 assert.equal(order.magicClass({name:'Occult reference',details:{description:'An Arcane cantrip'}}),'');
});

test('default spell ordering prioritizes class of magic then numeric level and name',()=>{
 const order=setup(),rows=[
  {name:'Mystic zero',group:'Mystic cantrips'},
  {name:'Occult zero',group:'Occult cantrips'},
  {name:'Oath zero',group:'Oath cantrips'},
  {name:'Arcane ten',group:'Arcane spells',details:{lvl:'10'}},
  {name:'Beta second',group:'Arcane spells',details:{lvl:'2'}},
  {name:'Alpha second',group:'Arcane spells',details:{lvl:'2'}},
  {name:'Arcane zero',group:'Arcane cantrips'},
  {name:'Unknown level',group:'Arcane spells'},
  {name:'Hex',group:'Minor hexes',details:{lvl:'0'}},
  {name:'Casting rules',group:'Magic rules'}
 ];
 const before=JSON.stringify(rows);
 assert.deepEqual([...rows].sort((a,b)=>order.compare(a,b,'magic-asc')).map(e=>e.name),[
  'Arcane zero','Alpha second','Beta second','Arcane ten','Unknown level',
  'Oath zero','Occult zero','Mystic zero','Hex','Casting rules'
 ]);
 assert.equal(JSON.stringify(rows),before);
 // An explicit numeric-level sort remains independent of the class ordering.
 assert.equal(order.compare(rows[0],rows[3],'level-asc')<0,true);
});
