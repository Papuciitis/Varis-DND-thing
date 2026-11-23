'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const copy=value=>JSON.parse(JSON.stringify(value));
const magic=(name,id,details={})=>({name,group:'Rare',source:'magic-items/rare.yaml',details:{id,type:'Weapon',rarity:'Rare',desc:'Gain the stated effect.',original_5e:'Obsolete spell slot rule.',...details}});
function boot(storage=new Map()){
  const context=vm.createContext({localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}});
  for(const name of ['magic-items.js','character-equipment.js'])vm.runInContext(fs.readFileSync(path.join(root,'web',name),'utf8'),context);
  return context;
}

test('magic edits persist by stable ID through renames and restore the compiled original',()=>{
  const storage=new Map(),first=boot(storage),source=magic('Old name','mi-rare-2');
  const section={key:'magic-items',entries:[copy(source)]};first.MagicItems.apply(section);
  const edited={...copy(source),name:'New name',group:'Legendary',details:{...source.details,desc:'New Varis rules.'}};
  first.MagicItems.save(source,edited);first.MagicItems.apply(section);
  assert.equal(section.entries[0].name,'New name');
  assert.equal(first.MagicItems.entryId('magic-items',source),first.MagicItems.entryId('magic-items',edited));
  const second=boot(storage),reloaded={key:'magic-items',entries:[copy(source)]};second.MagicItems.apply(reloaded);
  assert.equal(reloaded.entries[0].details.desc,'New Varis rules.');
  second.MagicItems.reset(reloaded.entries[0]);second.MagicItems.apply(reloaded);
  assert.deepEqual(copy(reloaded.entries[0]),source);
});

test('backup imports validate the whole batch before changing existing edits',()=>{
  const context=boot(),one=magic('One','one'),two=magic('Two','two');
  context.MagicItems.apply({key:'magic-items',entries:[one,two]});
  context.MagicItems.save(one,{...one,name:'Saved'});
  const before=copy(context.MagicItems.backup());
  assert.throws(()=>context.MagicItems.importBackup({kind:'vara.magic-items',version:1,entries:[
    {id:'two',entry:{...two,name:'Imported'}},{id:'absent',entry:magic('Missing','absent')}
  ]}),/missing/);
  assert.deepEqual(copy(context.MagicItems.backup()),before);
  assert.throws(()=>context.MagicItems.save(one,{...one,details:{id:'changed'}}),/ID cannot change/);
});

test('source export contains every item from only the selected source and flattens the YAML shape',()=>{
  const context=boot(),one=magic('One','one'),two=magic('Two','two'),other={...magic('Other','other'),source:'magic-items/common.yaml'};
  const section={key:'magic-items',entries:[one,two,other]};context.MagicItems.apply(section);
  context.MagicItems.save(one,{...one,details:{...one.details,desc:'Edited rules.'}});context.MagicItems.apply(section);
  const result=copy(context.MagicItems.sourceCollection(section,one.source));
  assert.equal(result.section,'magic-items');assert.equal(result.entries.length,2);
  assert.equal(result.entries[0].desc,'Edited rules.');assert.equal(result.entries[0].id,'one');
  assert.equal(result.entries[0].details,undefined);assert.equal(result.entries[1].original_5e,two.details.original_5e);
  assert.equal(context.MagicItems.searchable(one).original_5e,undefined);
});

test('saved edits and imported backups preserve original workbook provenance',()=>{
  const storage=new Map(),context=boot(storage),original=magic('Original name','provenance',{
    price:'100 gp',source_name:'Workbook name',source_price:'100 gp',source_attunement:'Yes',source_rarity:'Rare',source_ref:'Rare!A2:F2'
  });
  const section={key:'magic-items',entries:[copy(original)]};context.MagicItems.apply(section);
  const edited={...copy(original),name:'Campaign name',group:'Legendary',source:'wrong.yaml',details:{
    ...original.details,price:'250 gp',rarity:'Legendary',attunement:'No',source_name:'Forged name',source_price:'0 gp',source_attunement:'No',source_rarity:'Common',source_ref:'Wrong!A1',source_invented:'Forged',original_5e:'Rewritten source'
  }};
  context.MagicItems.save(original,edited);context.MagicItems.apply(section);
  const assertSource=entry=>{
    assert.equal(entry.source,original.source);
    for(const key of ['source_name','source_price','source_attunement','source_rarity','source_ref','original_5e'])assert.equal(entry.details[key],original.details[key],key);
    assert.equal(entry.details.source_invented,undefined);
    assert.equal(entry.name,'Campaign name');assert.equal(entry.group,'Legendary');assert.equal(entry.details.price,'250 gp');assert.equal(entry.details.rarity,'Legendary');assert.equal(entry.details.attunement,'No');
  };
  assertSource(section.entries[0]);
  context.MagicItems.importBackup({kind:'vara.magic-items',version:1,entries:[{id:'provenance',entry:edited}]});context.MagicItems.apply(section);assertSource(section.entries[0]);
  assertSource(context.MagicItems.backup().entries[0].entry);
  const exported=copy(context.MagicItems.sourceCollection(section,original.source));
  assert.equal(exported.entries[0].name,'Campaign name');assert.equal(exported.entries[0].source_name,'Workbook name');assert.equal(exported.entries[0].price,'250 gp');
  // Device saves from an older editor are sanitized after the compiled originals load.
  storage.set('vara.magic-items.v1',JSON.stringify({version:1,entries:[{id:'provenance',entry:edited}]}));
  const reloaded=boot(storage),fresh={key:'magic-items',entries:[copy(original)]};reloaded.MagicItems.apply(fresh);assertSource(fresh.entries[0]);
});

test('magic weapons use Varis base equipment and copied magic bonus in automatic attacks',()=>{
  const context=boot();
  const dagger={name:'Dagger',group:'daggers & knives',details:{type:'simple',damage:'1d4p',properties:['agile','light']}};
  const enchanted=magic('Enchanted dagger','mi-rare-3',{base_item:'Dagger',magic_bonus:'2'});
  const catalog=[{key:'items',entries:[dagger]},{key:'magic-items',entries:[enchanted]}];
  const row={id:'row',name:enchanted.name,entryId:context.MagicItems.entryId('magic-items',enchanted),quantity:1,equipped:true,...context.MagicItems.inventoryFields(enchanted)};
  const result=context.CharacterEquipment.derive({inventory:[row]},catalog,{abilities:{str:10,dex:16},proficiency:2,proficiencies:{weapons:'Simple weapons'}});
  assert.equal(result.attacks.length,1);assert.equal(result.attacks[0].bonus,7);assert.equal(result.attacks[0].damage,'1d4p + 5');
  assert.match(result.warnings.join(' '),/special magic effects/);
});

test('equipping magic armor removes other armor through the inherited equipment category',()=>{
  const context=boot(),leather={name:'Leather armor',group:'Light armor',details:{'Base AC':'13'}};
  const enchanted=magic('Enchanted leather','mi-rare-4',{type:'Armor',base_item:'Leather armor',magic_bonus:'1'});
  const catalog=[{key:'items',entries:[leather]},{key:'magic-items',entries:[enchanted]}];
  const character={inventory:[{id:'old',name:leather.name,entryId:JSON.stringify(['items',leather.group,leather.name]),quantity:1,equipped:true},
    {id:'new',name:enchanted.name,entryId:context.MagicItems.entryId('magic-items',enchanted),quantity:1,equipped:false}]};
  const result=context.CharacterEquipment.equip(character,1,true,catalog);
  assert.equal(result.inventory[0].equipped,false);assert.equal(result.inventory[1].equipped,true);
});

test('required attunement gates magical bonuses while retaining mundane attacks',()=>{
  const context=boot(),dagger={name:'Dagger',group:'daggers & knives',details:{type:'simple',damage:'1d4p',properties:['agile']}};
  const enchanted=magic('Bound dagger','bound',{base_item:'Dagger',magic_bonus:'2',attunement:'Yes, by a creature'});
  const catalog=[{key:'items',entries:[dagger]},{key:'magic-items',entries:[enchanted]}];
  const row={id:'row',name:enchanted.name,entryId:context.MagicItems.entryId('magic-items',enchanted),quantity:1,equipped:true,...context.MagicItems.inventoryFields(enchanted)};
  const derive=attuned=>context.CharacterEquipment.derive({inventory:[{...row,attuned}]},catalog,{abilities:{dex:16},proficiency:2,proficiencies:{weapons:'Simple weapons'}});
  assert.equal(derive(false).attacks[0].bonus,5);assert.equal(derive(true).attacks[0].bonus,7);
  assert.equal(context.MagicItems.requiresAttunement({...enchanted,details:{attunement:'No'}}),false);
  assert.equal(context.MagicItems.requiresAttunement({...enchanted,details:{attunement:'-'}}),false);
  for(const name of ['character-state.js'])vm.runInContext(fs.readFileSync(path.join(root,'web',name),'utf8'),context);
  const normalized=context.CharacterState.normalizeCharacter({inventory:[{...row,attuned:true}]});
  assert.equal(normalized.inventory[0].attuned,true);
  assert.throws(()=>context.CharacterState.normalizeCharacter({inventory:[{...row,attuned:'yes'}]}),/attuned/);
});
