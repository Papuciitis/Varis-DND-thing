'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),catalog=require('./helpers/catalog.cjs')();
const manifest=JSON.parse(fs.readFileSync(path.join(root,'site/data/catalog-manifest.json'),'utf8'));
const metadata=JSON.parse(fs.readFileSync(path.join(root,'site',manifest.builder),'utf8'));
const spells=catalog.find(section=>section.key==='spells').entries;
const plain=value=>JSON.parse(JSON.stringify(value));
function setup(name='Sorcerer',level=3) {
  const context=vm.createContext({crypto:require('node:crypto').webcrypto});
  for(const name of ['entry-order','character-state','character-effects','character-equipment','character-casting','character-prerequisites','character-feats','character-rules','character-builder']) vm.runInContext(fs.readFileSync(path.join(root,'web',name+'.js'),'utf8'),context);
  const State=context.CharacterState,Casting=context.CharacterCasting,rules=context.CharacterRules.create(metadata,catalog);
  let c=rules.enable(State.normalizeCharacter({level,abilities:{int:16,cha:16},restDice:{current:8,max:8}}));
  c.build.classId=metadata.classes.find(cls=>cls.name===name).id;
  c=rules.reconcile(c);
  const spell=(tradition,level)=>spells.find(entry=>Casting.spellInfo(entry).tradition===tradition && Casting.spellInfo(entry).level===level);
  const learn=entry=>{const row={id:'spell-'+c.spells.length,entryId:Casting.spellId(entry),name:entry.name,prepared:true,notes:'',classId:c.build.classId};c.spells.push(row);return row;};
  return {context,State,Casting,rules,c,spell,learn};
}

test('class creation uses each actual spell tradition, level cap, known count and cantrip count',()=>{
  for(const [name,tradition] of [['Wizard','arcane'],['Sorcerer','arcane'],['Druid','mystic'],['Cleric','oath'],['Occultist','occult']]) {
    const {Casting,rules,c}=setup(name,1);
    if(name==='Cleric')c.build.casting.maxSlotLevel=1;
    const d=rules.derive(c),selection=Casting.spellSelection(c,d,catalog);
    assert.ok(selection.eligible.length>2,name);
    assert.ok(selection.eligible.every(entry=>{const info=Casting.spellInfo(entry);return info.tradition===tradition && info.level<=1;}),name+' must not show other traditions, hexes or higher levels');
    assert.equal(selection.cantripLimit,d.casting.cantrips);
    assert.equal(selection.spellLimit,name==='Wizard'?5:2);
  }
  const fighter=setup('Fighter');
  assert.equal(fighter.Casting.spellSelection(fighter.c,fighter.rules.derive(fighter.c),catalog).eligible.length,0);
});

test('unknown Cleric source limits require table settings rather than invented learning levels',()=>{
  for(const name of ['Cleric']) {
    const {c,rules,Casting}=setup(name,4);
    const selection=Casting.spellSelection(c,rules.derive(c),catalog);
    assert.ok(selection.eligible.every(entry=>Casting.spellInfo(entry).cantrip),name);
    assert.ok(selection.warnings.some(warning=>/Set the/.test(warning)),name);
  }
});

test('Bard automatically learns spell levels 1, 1, 2, 2 through 6 at Bard level 11',()=>{
  for(let level=1;level<=12;level++){
    const {c,rules,Casting,spell}=setup('Bard',level);c.build.casting.maxLearnLevel=20;
    const d=rules.derive(c),selection=Casting.spellSelection(c,d,catalog),maximum=Math.ceil(level/2);
    assert.equal(d.casting.maxLearnLevel,maximum);assert.equal(d.casting.maxCastLevel,maximum);
    assert.ok(selection.eligible.some(entry=>Casting.spellInfo(entry,'any').level===maximum));
    assert.ok(selection.eligible.every(entry=>Casting.spellInfo(entry,'any').level<=maximum));
    assert.ok(!selection.warnings.some(message=>/Set the Bard/.test(message)));
    if(maximum<6)assert.match(Casting.spellLearningError(c,d,catalog,spell('arcane',maximum+1)),/maximum spell level/);
  }
});

test('higher-level Wizard creation preserves the level-one starting spellbook allocation',()=>{
  const {c,rules,Casting,learn}=setup('Wizard',3);
  const higher=spells.filter(entry=>Casting.spellInfo(entry).tradition==='arcane' && Casting.spellInfo(entry).level===2);
  assert.equal(Casting.spellLearningError(c,rules.derive(c),catalog,higher[0]),'');learn(higher[0]);learn(higher[1]);
  assert.match(Casting.spellLearningError(c,rules.derive(c),catalog,higher[2]),/starting Wizard spellbook/);
});

test('Bard can learn any tradition and the three hex tiers at their explicit equivalent spell levels',()=>{
  const {c,rules,Casting}=setup('Bard',6);
  const selection=Casting.spellSelection(c,rules.derive(c),catalog);
  for(const tradition of ['arcane','mystic','oath','occult'])assert.ok(selection.eligible.some(entry=>Casting.spellInfo(entry).tradition===tradition));
  for(const [group,level] of [['Minor hexes',1],['Major hexes',2],['Greater hexes',3]]) {
    const entry=selection.eligible.find(entry=>entry.group===group);assert.ok(entry,group);
    assert.equal(Casting.spellInfo(entry,'any').level,level);
    assert.equal(Casting.spellInfo(entry,'any').cantrip,false);
  }
  assert.ok(!selection.eligible.some(entry=>Casting.spellInfo(entry).cantrip));
});

test('upcasting spends only the chosen slot and rejects exhausted, forged and stale casts without mutation',()=>{
  const {c,rules,Casting,spell,learn,State}=setup(),entry=spell('arcane',1),row=learn(entry);
  const d=rules.derive(c),choices=Casting.castOptions(c,d,entry,row),upcast=choices.find(choice=>choice.level===2);
  const before=plain(c),result=Casting.castSpell(c,d,catalog,row.id,upcast.id);
  assert.equal(result.level,2);assert.deepEqual(plain(c),before,'casting returns an independent updated character');
  assert.equal(rules.derive(result.character).casting.pools.find(pool=>pool.level===2).current,d.casting.pools.find(pool=>pool.level===2).current-1);
  assert.equal(rules.derive(result.character).casting.pools.find(pool=>pool.level===1).current,d.casting.pools.find(pool=>pool.level===1).current);
  assert.throws(()=>Casting.castSpell(c,d,catalog,row.id,'forged'),/unavailable/);
  const changed=plain(c);changed.level=1;assert.throws(()=>Casting.castSpell(changed,d,catalog,row.id,upcast.id),/changed/);
  let spent=result.character;
  while(Casting.castOptions(spent,rules.derive(spent),entry,row).find(choice=>choice.id===upcast.id)?.available)spent=Casting.castSpell(spent,rules.derive(spent),catalog,row.id,upcast.id).character;
  const empty=plain(spent);assert.throws(()=>Casting.castSpell(spent,rules.derive(spent),catalog,row.id,upcast.id),/unavailable/);assert.deepEqual(plain(spent),empty);
  const reloaded=State.importCharacter(State.exportCharacter(spent));
  assert.equal(rules.derive(reloaded).casting.pools.find(pool=>pool.level===2).current,0);
});

test('cantrips are free, hexes are not free cantrips, and prepared Wizard spells gate casting',()=>{
  const {c,rules,Casting,spell,learn}=setup('Wizard'),entry=spell('arcane',0),row=learn(entry);
  const before=plain(c.build.casting.spent),result=Casting.castSpell(c,rules.derive(c),catalog,row.id,'free');
  assert.equal(result.level,0);assert.deepEqual(plain(result.character.build.casting.spent),before);
  row.prepared=false;assert.equal(Casting.castOptions(c,rules.derive(c),entry,row)[0].poolId,'free','cantrips do not require spell preparation');
  const levelled=spell('arcane',1),levelledRow=learn(levelled);levelledRow.prepared=false;
  assert.equal(Casting.castOptions(c,rules.derive(c),levelled,levelledRow).length,0);
  const hex=spells.find(entry=>entry.group==='Minor hexes');
  assert.equal(Casting.castOptions(c,rules.derive(c),hex,{prepared:true}).length,0);
});

test('Occultist always casts at its shared slot level and Cleric reduces only the selected full slot',()=>{
  const occult=setup('Occultist',5),entry=occult.spell('occult',1),row=occult.learn(entry);
  const d=occult.rules.derive(occult.c),choices=occult.Casting.castOptions(occult.c,d,entry,row);
  assert.deepEqual(plain(choices.map(option=>option.level)),[3]);
  const result=occult.Casting.castSpell(occult.c,d,catalog,row.id,choices[0].id);
  assert.equal(occult.rules.derive(result.character).casting.pools[0].current,d.casting.pools[0].current-1);
  const cleric=setup('Cleric',4);cleric.c.build.casting.maxSlotLevel=3;
  const oath=cleric.spell('oath',1),oathRow=cleric.learn(oath),full=cleric.rules.derive(cleric.c);
  const cast=cleric.Casting.castOptions(cleric.c,full,oath,oathRow).find(option=>option.level===2);
  const reduced=cleric.Casting.castSpell(cleric.c,full,catalog,oathRow.id,cast.id).character;
  assert.equal(cleric.rules.derive(reduced).casting.pools[0].current,1);
  assert.equal(cleric.rules.derive(reduced).casting.pools[1].current,3);
});

test('Bard talent spells, including learned hexes, spend casting-level rest dice',()=>{
  const {c,rules,Casting,learn}=setup('Bard',4);c.build.casting.maxLearnLevel=2;
  const entry=spells.find(entry=>entry.group==='Minor hexes'),row=learn(entry),d=rules.derive(c);
  const option=Casting.castOptions(c,d,entry,row).find(choice=>choice.level===2);
  const result=Casting.castSpell(c,d,catalog,row.id,option.id);
  assert.equal(result.character.restDice.current,c.restDice.current-2);
  assert.equal(result.character.spellSlots.length,0);
});

test('manual slots still cast known spells while class changes deactivate prior class spell selections',()=>{
  const {c,rules,Casting,State,spell,learn}=setup(),entry=spell('arcane',1),row=learn(entry);
  const manual=State.normalizeCharacter({spells:[{...row,classId:''}],spellSlots:[{level:2,current:1,max:1}]});
  const result=Casting.castSpell(manual,rules.derive(manual),catalog,row.id,'manual:2');
  assert.equal(result.character.spellSlots[0].current,0);
  c.build.classId=metadata.classes.find(cls=>cls.name==='Druid').id;
  assert.equal(Casting.castOptions(c,rules.derive(c),entry,row).length,0);
  assert.equal(c.spells[0].entryId,row.entryId,'inactive choices are retained');
});

test('quick spell defaults distinguish straightforward attacks from area spells and multi-mode utility',()=>{
  const {Casting}=setup();
  assert.equal(Casting.spellInfo(spells.find(entry=>entry.name==='Eldritch blast')).simpleAttack,true);
  assert.equal(Casting.spellInfo(spells.find(entry=>entry.name==='Fireball')).simpleAttack,false);
  assert.equal(Casting.spellInfo(spells.find(entry=>entry.name==='Minor telekinesis')).simpleAttack,false);
});

test('builder learns only eligible spells within class allowances and saves, reopens or cancels the draft',()=>{
  const {c,rules,Casting,context,spell,State}=setup('Sorcerer',1),shown=[],finished=[];
  const original=plain(c),builder=context.CharacterBuilder.create({rules,show:(...args)=>shown.push(args),onFinish:draft=>finished.push(draft)});
  const choose=entry=>{builder.handleChange({dataset:{builderSpell:''},value:Casting.spellId(entry)});builder.handleAction('builder-add-spell',{});};
  builder.start(c);builder.handleAction('builder-step',{dataset:{builderStep:'Spells'}});
  assert.match(shown.at(-1)[1],/Choose your spells/);
  choose(spell('mystic',1));choose(spell('arcane',3));
  assert.match(shown.at(-1)[1],/Spells <strong>0 \/ 2/);
  const arcane=spells.filter(entry=>Casting.spellInfo(entry).tradition==='arcane'&&Casting.spellInfo(entry).level===1);
  choose(arcane[0]);choose(arcane[1]);choose(arcane[2]);
  builder.handleAction('builder-step',{dataset:{builderStep:'Review'}});builder.handleAction('builder-finish',{});
  assert.equal(finished[0].spells.length,2);assert.ok(finished[0].spells.every(row=>row.classId===c.build.classId));
  assert.deepEqual(plain(c),original);
  builder.start(State.normalizeCharacter(plain(finished[0])));builder.handleAction('builder-step',{dataset:{builderStep:'Spells'}});
  assert.match(shown.at(-1)[1],/Spells <strong>2 \/ 2/);builder.cancel();
});
