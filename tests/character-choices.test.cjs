'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'site/data/catalog-manifest.json'),'utf8'));
const metadata = JSON.parse(fs.readFileSync(path.join(root,'site',manifest.builder),'utf8'));
const catalog = require('./helpers/catalog.cjs')();
const plain = value => JSON.parse(JSON.stringify(value));

function setup(className='Fighter',level=1) {
  const context=vm.createContext({crypto:require('node:crypto').webcrypto});
  for(const name of ['entry-order','character-state','character-effects','character-equipment','character-casting','character-rules','character-builder']) {
    vm.runInContext(fs.readFileSync(path.join(root,'web',name+'.js'),'utf8'),context);
  }
  const State=context.CharacterState,rules=context.CharacterRules.create(metadata,catalog);
  const character=rules.enable(State.normalizeCharacter({level}));
  character.build.classId=metadata.classes.find(item=>item.name===className).id;
  const choice=name=>rules.derive(character).choices.find(group=>group.featureName===name);
  return {context,State,rules,character,choice};
}

test('Fighter receives starting skills, every level-up skill and each class ASI bonus',()=>{
  const {character,choice}=setup();
  const original=choice('Fighting skills');
  for(const [index,count] of [2,4,5,6,8,9,10,12,13,14,16,17].entries()) {
    character.level=index+1;
    assert.equal(choice('Fighting skills').count,count);
    assert.equal(choice('Fighting skills').id,original.id);
  }
});

test('Fighter prerequisites gate effects and survive removal, downgrades and save reloads',()=>{
  const {character,rules,choice,State}=setup();
  const group=choice('Fighting skills'),find=name=>group.options.find(option=>option.name===name).id;
  character.build.choices[group.id]=[find('Conditioning'),find('Survival training')];
  assert.equal(rules.derive(character).saveBonuses.str,1,'slot order does not change prerequisites');
  character.build.choices[group.id][1]='';
  assert.equal(rules.derive(character).saveBonuses.str,0);
  assert.ok(choice('Fighting skills').options.find(option=>option.name==='Conditioning').unavailableReason);
  character.build.choices[group.id][1]=find('Survival training');
  character.level=2;
  character.build.choices[group.id].push(find('Fortified will'),find('Pain tolerance'));
  assert.equal(rules.derive(character).saveBonuses.wis,2);
  assert.equal(rules.derive(character).reductions.all,1);
  character.level=1;
  assert.equal(rules.derive(character).saveBonuses.wis,0);
  assert.equal(rules.derive(character).reductions.all,undefined);
  character.level=2;
  const restored=State.normalizeCharacter(plain(rules.reconcile(character)));
  assert.equal(rules.derive(restored).reductions.all,1);
  assert.equal(restored.build.choices[group.id].length,4);
});

test('repeatable upgrades use their printed limit while ordinary skills cannot stack',()=>{
  const {character,choice}=setup('Alchemist',2);
  const group=choice('Alchemy methods'),bomb=group.options.find(option=>option.name==='Bombmaker');
  assert.equal(bomb.repeatLimit,2);
  character.build.choices[group.id]=[bomb.id,bomb.id,bomb.id];
  assert.equal(choice('Alchemy methods').selected.length,2);
  const fighter=setup();
  const skills=fighter.choice('Fighting skills'),survival=skills.options.find(option=>option.name==='Survival training');
  fighter.character.build.choices[skills.id]=[survival.id,survival.id];
  assert.equal(fighter.rules.derive(fighter.character).skillBonuses.Survival,1);
});

test('other classes receive cumulative and additional choices alongside regular ASIs',()=>{
  for(const [owner,level,feature,count] of [
    ['Alchemist',5,'Alchemy methods',4],['Bard',3,'Bardic traits',3],['Bard',6,'Inspiration dice upgrade',3],
  ]) {
    assert.equal(setup(owner,level).choice(feature).count,count);
  }
  for(const owner of ['Druid','Ranger']) {
    const {character,rules}=setup(owner,2),groups=rules.derive(character).choices.filter(group=>/ability score improvement/i.test(group.featureName));
    assert.equal(groups.length,2,owner+' needs both an ASI and its bonus choice');
    const asi=groups.find(group=>group.label==='Ability score improvement');
    character.build.choices[asi.id]=[asi.options.find(option=>option.name==='+2 Strength').id];
    assert.equal(rules.derive(character).abilities.str,12);
  }
});

test('archetype grants expand the earlier list only while the relevant feature is active',()=>{
  for(const [owner,archetype,feature,beforeLevel,afterLevel,before,after,slot] of [
    ['Monk','Ki channeler','KI powers',4,5,2,3,0],
    ['Monk','Sensei','Master of an art',8,9,1,2,1],
    ['Ranger','Seeker','Special training',8,9,1,2,1],
    ['Sorcerer','Graymage','Graymage trait',7,8,1,2,0],
    ['Sorcerer','Wildmage','Wild traits',5,6,1,2,0],
  ]) {
    const {character,choice}=setup(owner,beforeLevel);
    character.build.archetypes=Array(slot+1).fill('');
    character.build.archetypes[slot]=metadata.archetypes.find(item=>item.name===archetype).id;
    assert.equal(choice(feature).count,before,archetype);
    character.level=afterLevel;
    assert.equal(choice(feature).count,after,archetype);
    character.build.archetypes[slot]='';
    assert.equal(choice(feature),undefined,archetype+' is inactive when unselected');
  }
});

test('specific feats are selected, displayed, saved and gated by their ASI choice and level',()=>{
  const {character,rules,State}=setup('Fighter',2);
  const asi=rules.derive(character).choices.find(group=>group.label==='Ability score improvement');
  character.build.choices[asi.id]=[asi.featureId+':feat'];
  let d=rules.derive(character),feats=d.choices.find(group=>group.kind==='feat');
  assert.ok(feats.options.length>=150);
  assert.ok(d.warnings.some(warning=>warning.includes('for Feat')));
  const feat=feats.options.find(option=>option.name==='Armor proficiency');
  character.build.choices[feats.id]=[feat.id];
  d=rules.derive(character);
  assert.ok(d.features.some(feature=>feature.parent==='Feat' && feature.entryId===feat.id && feature.details.requirements));
  const saved=State.normalizeCharacter(plain(rules.reconcile(character)));
  assert.ok(rules.derive(saved).features.some(feature=>feature.entryId===feat.id));
  saved.level=1;
  assert.ok(!rules.derive(saved).features.some(feature=>feature.entryId===feat.id));
  saved.level=2;
  saved.build.choices[asi.id]=[asi.options.find(option=>option.name==='+2 Strength').id];
  assert.ok(!rules.derive(saved).features.some(feature=>feature.entryId===feat.id));
  assert.equal(saved.build.choices[feats.id][0],feat.id,'inactive choices remain available if selected again');
});

test('cross-class archetype grants add the full level schedule and disappear when deselected',()=>{
  for(const [className,archetype,level,count,slot] of [['Fighter','Weapon master',7,11,1],['Fighter','Weapon master',8,14,1],['Fighter','Champion',10,21,2],['Fighter','Champion',12,26,2]]) {
    const {character,rules,choice}=setup(className,level);
    character.build.archetypes=Array(slot+1).fill('');character.build.archetypes[slot]=metadata.archetypes.find(item=>item.name===archetype).id;
    assert.equal(choice('Fighting skills').count,count,archetype+' level '+level);
    character.build.archetypes[slot]='';assert.ok(choice('Fighting skills').count<count);
  }
  const evoker=setup('Sorcerer',12);evoker.character.build.archetypes=['',metadata.archetypes.find(item=>item.name==='Evoker').id];
  assert.equal(evoker.choice('Evoker traits').count,4);assert.equal(evoker.choice('Powerful Arts').count,2);
});

test('alternative upgrades expand earlier lists while retaining dormant selections when the route changes',()=>{
  const {character,rules,choice}=setup('Occultist',8);
  character.build.archetypes=[metadata.archetypes.find(item=>item.name==='Spellblade').id];
  const route=choice('final spell-blade exploit'),option=route.options.find(item=>item.name==='1 extra: spell-blade exploit');
  assert.ok(option);
  character.build.choices[route.id]=[option.id];assert.equal(choice('spell-blade exploit').count,2);
  character.build.choices[route.id]=[''];assert.equal(choice('spell-blade exploit').count,1);
  const monk=setup('Monk',5);monk.character.build.archetypes=[metadata.archetypes.find(item=>item.name==='Ki channeler').id];
  const asi=monk.rules.derive(monk.character).choices.find(group=>group.featureName==='Ability score improvement' && group.level===5);
  monk.character.build.choices[asi.id]=[asi.options.find(item=>item.name==='Take 2 KI powers upgrades').id];
  assert.equal(monk.choice('KI powers').count,5);monk.character.level=6;assert.equal(monk.choice('KI powers').count,6);
});

test('Occultist extra marks and rewards are optional at every ASI and grant no reward without their paired mark',()=>{
  const {character,rules}=setup('Occultist',3);
  let d=rules.derive(character),gate=d.choices.find(group=>group.optional);
  assert.ok(gate);assert.ok(!d.warnings.some(warning=>warning.includes('Extra Mark') || warning.includes('Extra Reward')));
  character.build.choices[gate.id]=[gate.options[0].id];
  d=rules.derive(character);const mark=d.choices.find(group=>group.label==='Extra Mark'),reward=d.choices.find(group=>group.label==='Extra Reward');
  const baseSlots=d.casting.pools[0].max;
  character.build.choices[reward.id]=[reward.options.find(option=>option.name==='+2 max occult slots.').id];
  assert.equal(rules.derive(character).casting.pools[0].max,baseSlots);
  character.build.choices[mark.id]=[mark.options.find(option=>option.name==='-5 ft movement speed').id];
  assert.equal(rules.derive(character).casting.pools[0].max,baseSlots+2);
  assert.equal(rules.derive(character).speed,d.speed-5);
  character.level=11;assert.equal(rules.derive(character).choices.filter(group=>group.optional).length,3);
});

test('Barbarian physical bonuses cap at 24 and Wildshaper can use its Druid bonus choice for another trait',()=>{
  const barbarian=setup('Barbarian',3),group=barbarian.rules.derive(barbarian.character).choices.find(group=>group.label==='Physical ability bonus');
  barbarian.character.abilities.str=24;barbarian.character.build.choices[group.id]=[group.options.find(option=>option.name==='+1 strength').id];
  assert.equal(barbarian.rules.derive(barbarian.character).abilities.str,24);
  barbarian.character.abilities.str=22;assert.equal(barbarian.rules.derive(barbarian.character).abilities.str,23);
  const wild=setup('Druid',6);wild.character.build.archetypes=[metadata.archetypes.find(item=>item.name==='Wildshaper').id];
  assert.equal(wild.choice('Wildshape traits').count,2);
  const bonus=wild.rules.derive(wild.character).choices.find(group=>group.featureName==='Ability score improvement' && group.level===6 && group.label!=='Ability score improvement');
  const alternative=bonus.options.find(option=>option.choiceGrants);assert.ok(alternative);
  wild.character.build.choices[bonus.id]=[alternative.id];assert.equal(wild.choice('Wildshape traits').count,3);
});

test('existing background names migrate to catalog references and remain visible after saving',()=>{
  const {rules,State}=setup();
  const character=rules.enable(State.normalizeCharacter({background:'Abandoned wanderer',notes:'Keep these notes'}));
  const d=rules.derive(character);
  assert.equal(d.background.name,'Abandoned wanderer');
  assert.ok(d.features.some(feature=>feature.parent==='Background' && feature.details.Hardened));
  const saved=rules.reconcile(character);
  assert.equal(saved.background,'Abandoned wanderer');
  assert.equal(saved.notes,'Keep these notes');
  assert.equal(rules.enable(State.normalizeCharacter({background:'My homebrew background'})).background,'My homebrew background');
});

test('existing characters can choose background and feat in the builder, cancel or save and reopen',()=>{
  const {context,State,rules,character}=setup('Fighter',2),shows=[],finished=[];
  character.name='Existing fighter';character.notes='Existing notes';
  const original=plain(character);
  const builder=context.CharacterBuilder.create({rules,show:(...args)=>shows.push(args),onFinish:result=>finished.push(result)});
  const step=value=>builder.handleAction('builder-step',{dataset:{builderStep:String(value)}});
  const set=(group,value,index=0)=>builder.handleChange({dataset:{builderChoice:group,builderChoiceIndex:String(index)},value});
  builder.start(character);
  assert.match(shows.at(-1)[1],/Choose a background/);
  const background=catalog.find(section=>section.key==='backgrounds').entries.find(entry=>entry.name==='Abandoned wanderer');
  builder.handleChange({dataset:{builderPath:'build.backgroundId'},value:JSON.stringify(['backgrounds',background.group,background.name])});
  step(3);
  const asi=rules.derive(character).choices.find(group=>group.label==='Ability score improvement');
  set(asi.id,asi.featureId+':feat');
  assert.match(shows.at(-1)[1],/Browse feats and choose one/);
  assert.match(shows.at(-1)[1],/Armor proficiency/);
  const feat=catalog.find(section=>section.key==='feats').entries.find(entry=>entry.name==='Armor proficiency');
  set(asi.featureId+':feat-choice',JSON.stringify(['feats',feat.group,feat.name]));
  step(5);
  assert.match(shows.at(-1)[1],/Chosen feats/);
  builder.handleAction('builder-finish',{});
  assert.deepEqual(plain(character),original,'the existing sheet changes only when the finished draft is applied');
  const saved=finished[0];
  assert.equal(saved.id,character.id);
  assert.equal(saved.background,background.name);
  assert.equal(saved.notes,'Existing notes');
  assert.ok(rules.derive(saved).features.some(feature=>feature.parent==='Feat' && feature.name===feat.name));
  builder.start(State.normalizeCharacter(plain(saved)));
  assert.match(shows.at(-1)[1],/Abandoned wanderer/);
  step(3);
  assert.match(shows.at(-1)[1],/Armor proficiency/);
  builder.cancel();
});
