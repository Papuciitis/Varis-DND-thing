'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const copy = value => JSON.parse(JSON.stringify(value));
const crossbow = {name:'Heavy crossbow',group:'simple crossbows',details:{
  type:'simple',group:'crossbows',damage:'1d12p',properties:'Range 60/120, Reload III',maneuvers:[]
}};
const sword = {name:'Longsword',group:'swords',details:{
  type:'martial',group:'swords',damage:'1d8s',properties:'Versatile 1d10',maneuvers:[{cut:'Attack.'}]
}};
const leather = {name:'Leather armor',group:'Light armor',details:{'Base AC':'13'}};
const shield = {name:'Round shield',group:'Light shields',details:{'AC bonus':'2',properties:'Bash 1d6'}};
const magic = (name,id,details={}) => ({name,group:'Rare',source:'magic-items/rare.yaml',details:{
  id,type:'Weapon',rarity:'Rare',attunement:'No',desc:'Use the printed converted rules.',...details
}});
const context = {
  abilities:{str:16,dex:18,con:12},proficiency:3,
  proficiencies:{weapons:'Simple weapons, Martial weapons',armor:'Light shields'}
};

function boot(items) {
  const browser = vm.createContext({});
  for (const name of ['magic-items.js','character-equipment.js']) {
    vm.runInContext(fs.readFileSync(path.join(root,'web',name),'utf8'),browser,{filename:name});
  }
  const catalog = [{key:'items',entries:[crossbow,sword,leather,shield]},{key:'magic-items',entries:items}];
  const row = (entry,fields={}) => ({id:entry.details.id,name:entry.name,
    entryId:browser.MagicItems.entryId('magic-items',entry),quantity:1,equipped:true,
    ...browser.MagicItems.inventoryFields(entry),...fields});
  const derive = (inventory,options={}) => copy(browser.CharacterEquipment.derive({inventory},catalog,{...context,...options}));
  return {browser,catalog,row,derive};
}

test('custom firearm profiles replace inherited damage, range and training without granting crossbow training',()=>{
  const gun = magic('Converted rifle','rifle',{base_item:'Heavy crossbow',damage:'2d8 force',
    properties:'Range 90/360, Reload II',weapon_type:'martial',weapon_group:'firearms',magic_bonus:'1'});
  const {row,derive} = boot([gun]);
  const [attack] = derive([row(gun)]).attacks;
  assert.equal(attack.bonus,8);
  assert.equal(attack.damage,'2d8 force + 5');
  assert.equal(attack.blockDC,16);
  assert.equal(attack.trained,true);
  assert.match(attack.notes,/Range 90\/360 ft/);
  assert.equal(attack.properties,'Range 90/360, Reload II');
  const untrained = derive([row(gun)],{proficiencies:{weapons:'crossbows'},weaponGroups:['crossbows']}).attacks[0];
  assert.equal(untrained.trained,false);
  assert.equal(untrained.bonus,1);
});

test('attunement gates profile overrides and bonuses while retaining the mundane base attack',()=>{
  const gun = magic('Bound rifle','bound-rifle',{base_item:'Heavy crossbow',attunement:'Yes',damage:'2d8 force',
    properties:'Range 90/360',weapon_type:'martial',weapon_group:'firearms',magic_bonus:'2'});
  const {row,derive} = boot([gun]);
  const inactive = derive([row(gun,{attuned:false})]).attacks[0];
  const active = derive([row(gun,{attuned:true})]).attacks[0];
  assert.equal(inactive.damage,'1d12p + 4');
  assert.equal(inactive.bonus,7);
  assert.match(inactive.notes,/Range 60\/120 ft/);
  assert.equal(active.damage,'2d8 force + 6');
  assert.equal(active.bonus,9);
  assert.match(active.notes,/Range 90\/360 ft/);
  const simpleOnly = {proficiencies:{weapons:'Simple weapons'}};
  assert.equal(derive([row(gun,{attuned:false})],simpleOnly).attacks[0].trained,true);
  assert.equal(derive([row(gun,{attuned:true})],simpleOnly).attacks[0].trained,false);
});

test('renamed magic weapons retain proficiency in their named mundane base weapon',()=>{
  const blade = magic('Dream blade','named-blade',{base_item:'Longsword',attunement:'Yes',magic_bonus:'1'});
  const {row,derive} = boot([blade]);
  const training = {proficiencies:{weapons:'hand crossbows, longswords, rapiers, shortswords'}};
  const inactive = derive([row(blade,{attuned:false})],training).attacks[0];
  const active = derive([row(blade,{attuned:true})],training).attacks[0];
  assert.equal(inactive.trained,true);
  assert.equal(inactive.bonus,6);
  assert.equal(inactive.damage,'1d8s + 3');
  assert.equal(active.trained,true);
  assert.equal(active.bonus,7);
  assert.equal(active.damage,'1d8s + 4');
  assert.equal(derive([row(blade,{attuned:true,weaponTraining:'untrained'})],training).attacks[0].trained,false);
});

test('custom weapon training overrides stop inheriting named base proficiency only while active',()=>{
  for (const overrides of [{weapon_type:'martial'},{weapon_group:'firearms'},
    {weapon_type:'martial',weapon_group:'firearms'}]) {
    const gun = magic('Bound rifle','named-base-'+Object.keys(overrides).join('-'),{
      base_item:'Heavy crossbow',attunement:'Yes',damage:'2d8 force',magic_bonus:'1',...overrides
    });
    const {row,derive} = boot([gun]);
    const training = {proficiencies:{weapons:'heavy crossbow'}};
    const inactive = derive([row(gun,{attuned:false})],training).attacks[0];
    const active = derive([row(gun,{attuned:true})],training).attacks[0];
    assert.equal(inactive.trained,true);
    assert.equal(inactive.bonus,7);
    assert.equal(inactive.damage,'1d12p + 4');
    assert.equal(active.trained,false);
    assert.equal(active.bonus,1);
    assert.equal(active.damage,'2d8 force + 1');
    assert.equal(derive([row(gun,{attuned:true,weaponTraining:'proficient'})],training).attacks[0].trained,true);
  }
});

test('nondamaging item profiles never receive an ability or enchantment damage bonus',()=>{
  const rope = magic('Rope caster','rope',{base_item:'Heavy crossbow',damage:'-',magic_bonus:'2',
    properties:'Range 30/60',maneuvers:[]});
  const {row,derive} = boot([rope]);
  const [attack] = derive([row(rope)]).attacks;
  assert.equal(attack.damage,'-');
  assert.equal(attack.bonus,9);
  assert.deepEqual(attack.maneuvers,[]);
});

test('attuned armor overrides apply AC and Block properties without changing its mundane fallback',()=>{
  const armor = magic('Bound armor','bound-armor',{type:'Armor',base_item:'Leather armor',attunement:'Yes',
    'Base AC':'14',properties:'Block 2, Protection 1',magic_bonus:'2'});
  const {row,derive} = boot([armor]);
  const inactive = derive([row(armor,{attuned:false})]);
  const active = derive([row(armor,{attuned:true})]);
  assert.equal(inactive.armorClass,17);
  assert.equal(inactive.armorBlock,0);
  assert.equal(active.armorClass,20);
  assert.equal(active.armorBlock,2);
  assert.equal(active.protection,1);
});

test('two-handed Versatile attacks retain written psychic and force damage types',()=>{
  for (const damageType of ['psychic','force']) {
    const blade = magic('Dream blade','dream-'+damageType,{base_item:'Longsword',damage:'1d8 '+damageType,magic_bonus:'1'});
    const {row,derive} = boot([blade]);
    const [attack] = derive([row(blade,{twoHanded:true})]).attacks;
    assert.equal(attack.damage,'1d10 '+damageType+' + 4');
    assert.equal(attack.bonus,7);
  }
});

test('manual attack items omit incorrect generated attacks and retain ordinary unattuned use',()=>{
  const unusual = magic('Variable weapon','manual',{base_item:'Heavy crossbow',damage:'Coin count force',
    manual_attack:'Yes'});
  const bound = magic('Bound variable weapon','bound-manual',{base_item:'Heavy crossbow',attunement:'Yes',
    damage:'1d4p + 3 force',manual_attack:'Yes'});
  const {row,derive} = boot([unusual,bound]);
  const manual = derive([row(unusual),row(bound,{attuned:true})]);
  assert.equal(manual.attacks.length,0);
  assert.ok(manual.warnings.some(message=>/calculate its attack manually/.test(message)));
  assert.equal(derive([row(bound,{attuned:false})]).attacks[0].damage,'1d12p + 4');
});

test('converted shield enhancement improves AC without also enhancing Bash, preserving legacy shields',()=>{
  const converted = magic('Paradiso','paradiso',{type:'Shield',base_item:'Round shield',magic_bonus:'3'});
  const {browser,catalog,row,derive} = boot([converted]);
  const result = derive([row(converted)]);
  assert.equal(result.armorClass,19);
  assert.equal(result.attacks[0].bonus,6);
  assert.equal(result.attacks[0].damage,'1d6 + 3');
  assert.equal(result.attacks[0].blockDC,14);
  const legacy = copy(browser.CharacterEquipment.derive({inventory:[{id:'legacy',name:'Legacy shield',
    entryId:JSON.stringify(['items',shield.group,shield.name]),quantity:1,equipped:true,magicBonus:3}]},catalog,context));
  assert.equal(legacy.armorClass,19);
  assert.equal(legacy.attacks[0].bonus,9);
  assert.equal(legacy.attacks[0].damage,'1d6 + 6');
});

test('full weapon profiles can calculate without a mundane base entry',()=>{
  const custom = magic('Unique firearm','unique',{damage:'2d6 force',properties:'Range 40/80',
    weapon_type:'martial',weapon_group:'firearms',maneuvers:[]});
  const {row,derive} = boot([custom]);
  const [attack] = derive([row(custom)]).attacks;
  assert.equal(attack.trained,true);
  assert.equal(attack.damage,'2d6 force + 4');
  assert.equal(attack.bonus,7);
});

test('attunement count warning acknowledges item exceptions without disabling statistics',()=>{
  const weapons = Array.from({length:4},(_,index)=>magic('Bound weapon '+index,'count-'+index,{
    base_item:'Longsword',attunement:'Yes',magic_bonus:'1'}));
  const {row,derive} = boot(weapons);
  const result = derive(weapons.map(entry=>row(entry,{attuned:true})));
  assert.equal(result.attacks.length,4);
  assert.match(result.warnings.join(' '),/specific item can increase/);
  assert.doesNotMatch(result.warnings.join(' '),/Choose at most three/);
});
