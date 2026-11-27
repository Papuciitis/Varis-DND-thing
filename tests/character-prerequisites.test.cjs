'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),catalog=require('./helpers/catalog.cjs')();
const manifest=JSON.parse(fs.readFileSync(path.join(root,'site/data/catalog-manifest.json'),'utf8'));
const metadata=JSON.parse(fs.readFileSync(path.join(root,'site',manifest.builder),'utf8'));
const plain=value=>JSON.parse(JSON.stringify(value));
function setup(className='Fighter',raceName='Human',level=1) {
 const context=vm.createContext({crypto:require('node:crypto').webcrypto});
 for(const name of ['entry-order','character-state','character-effects','character-equipment','character-casting','character-prerequisites','character-feats','character-rules','character-builder'])vm.runInContext(fs.readFileSync(path.join(root,'web',name+'.js'),'utf8'),context);
 const State=context.CharacterState,rules=context.CharacterRules.create(metadata,catalog);
 const c=rules.enable(State.normalizeCharacter({level}));c.build.classId=metadata.classes.find(item=>item.name===className).id;
 c.build.raceId=metadata.races.find(item=>item.name.toLowerCase()===raceName.toLowerCase()).id;
 return {context,State,rules,c,choice:name=>rules.derive(c).choices.find(group=>group.featureName===name)};
}
function takeFeat(h,name,group) {
 let d=h.rules.derive(h.c);
 if(!group){const asi=d.choices.find(group=>group.label==='Ability score improvement');h.c.build.choices[asi.id]=[asi.featureId+':feat'];d=h.rules.derive(h.c);group=d.choices.find(group=>group.kind==='feat'&&group.featureId===asi.featureId);}
 const option=group.options.find(option=>option.name===name);assert.ok(option,name+' must be eligible');h.c.build.choices[group.id]=[option.id];return option;
}
function takeOption(h,name) {
 const group=h.rules.derive(h.c).choices.find(group=>group.kind!=='feat'&&group.options.some(option=>option.name===name));
 assert.ok(group,name+' must have a choice');h.c.build.choices[group.id]=[group.options.find(option=>option.name===name).id];
}
function takeArchetype(h,name) {
 const item=metadata.archetypes.find(item=>item.name===name),cls=metadata.classes.find(item=>item.id===h.c.build.classId);
 assert.ok(item);const slot=cls.archetypeLevels.findIndex(level=>level>=item.minLevel);assert.ok(slot>=0);
 h.c.build.archetypes[slot]=item.id;
}

test('Human receives a real free feat at level one, independently of class ASIs, and changing ancestry deactivates it',()=>{
 const h=setup(),group=h.rules.derive(h.c).choices.find(group=>group.kind==='feat');
 assert.equal(group.featureName,'Extra Feat');assert.equal(group.count,1);
 assert.ok(group.options.some(option=>option.name==='Combat experience'));
 assert.ok(!group.options.some(option=>option.name==='Dwarven veteran'));
 const feat=takeFeat(h,'Combat experience',group),saved=h.State.importCharacter(h.State.exportCharacter(h.rules.reconcile(h.c)));
 assert.ok(h.rules.derive(saved).features.some(feature=>feature.parent==='Feat'&&feature.entryId===feat.id));
 saved.build.raceId=metadata.races.find(item=>item.name==='Dwarf').id;
 assert.ok(!h.rules.derive(saved).features.some(feature=>feature.entryId===feat.id));
 assert.equal(saved.build.choices[group.id][0],feat.id,'the dormant choice is retained');
});

test('feat eligibility checks effective ancestry scores and rejects other races, future grants and duplicate feats',()=>{
 const h=setup();let group=h.rules.derive(h.c).choices.find(group=>group.kind==='feat');
 assert.ok(!group.options.some(option=>option.name==='Armor proficiency'));
 const allocation=metadata.races.find(race=>race.name==='Human').abilityChoices[0];h.c.build.abilityChoices[allocation.id]={mode:0,values:['str']};
 group=h.rules.derive(h.c).choices.find(group=>group.kind==='feat');assert.ok(group.options.some(option=>option.name==='Armor proficiency'));
 assert.ok(!group.options.some(option=>option.name==='Great determination'),'level-three feat cannot use the Human level-one grant');
 takeFeat(h,'Combat experience',group);h.c.level=2;
 const asi=h.rules.derive(h.c).choices.find(group=>group.label==='Ability score improvement');h.c.build.choices[asi.id]=[asi.featureId+':feat'];
 const later=h.rules.derive(h.c).choices.find(group=>group.kind==='feat'&&group.featureId===asi.featureId);
 assert.ok(!later.options.some(option=>option.name==='Combat experience'));
});

test('lineage-granted bonus feats activate only while their granting option is selected',()=>{
 const h=setup('Fighter','Ginasi');let d=h.rules.derive(h.c);
 assert.equal(d.choices.some(group=>group.kind==='feat'),false);
 const lineage=d.choices.find(group=>group.options.some(option=>option.name==='Distant descendant'));
 h.c.build.choices[lineage.id]=[lineage.options.find(option=>option.name==='Distant descendant').id];
 d=h.rules.derive(h.c);const featGroup=d.choices.find(group=>group.kind==='feat');assert.ok(featGroup);
 takeFeat(h,'Combat experience',featGroup);h.c.build.choices[lineage.id]=[];
 assert.ok(!h.rules.derive(h.c).features.some(feature=>feature.parent==='Feat'));
});

test('ineligible imported feats remain stored but contribute no feature or rest-dice effect',()=>{
 const h=setup(),group=h.rules.derive(h.c).choices.find(group=>group.kind==='feat');
 const elf=catalog.find(section=>section.key==='feats').entries.find(entry=>entry.name==='Elven power');
 const id=JSON.stringify(['feats',elf.group,elf.name]);h.c.build.choices[group.id]=[id];
 const d=h.rules.derive(h.c);assert.ok(!d.features.some(feature=>feature.entryId===id));assert.equal(d.restMaximum,1);
 assert.equal(h.c.build.choices[group.id][0],id);assert.ok(d.warnings.some(warning=>/Elven power.*prerequisites/.test(warning)));
});

test('AND, OR, alternative ability scores, requires fields and story qualifications follow their literal conditions',()=>{
 const h=setup(),check=req=>h.context.CharacterPrerequisites.evaluate({details:{requirements:req}},h.context.CharacterPrerequisites.context(h.c,h.rules.derive(h.c),catalog)).eligible;
 h.c.abilities.int=15;h.c.abilities.wis=8;h.c.training.skills.Arcana=1;
 assert.equal(check('15 Intelligence or Wisdom, and proficiency with arcana, insight, or investigation.'),true);
 h.c.training.skills.Arcana=0;assert.equal(check('15 Intelligence or Wisdom, and proficiency with arcana, insight, or investigation.'),false);
 h.c.training.skills.Nature=1;h.c.training.skills.Medicine=1;assert.equal(check('Proficiency with nature, investigation or survival, and proficiency with medicine.'),true);
 h.c.training.skills.Medicine=0;assert.equal(check('Proficiency with nature, investigation or survival, and proficiency with medicine.'),false);
 assert.equal(check(['has died']),false);h.c.build.qualifications=['has-died'];assert.equal(check(['has died']),true);
 assert.equal(h.context.CharacterPrerequisites.evaluate({details:{requires:['human']}},h.context.CharacterPrerequisites.context(h.c,h.rules.derive(h.c),catalog)).eligible,true);
 assert.equal(check('A deliberately unmodeled requirement'),false);
});

test('a later ASI cannot retroactively satisfy a feat taken at level one',()=>{
 const h=setup('Fighter','Human',5);h.c.abilities.str=10;
 const asi=h.rules.derive(h.c).choices.find(group=>group.label==='Ability score improvement'&&group.level===2);
 h.c.build.choices[asi.id]=[asi.options.find(option=>option.name==='+2 Strength').id];
 const d=h.rules.derive(h.c);assert.equal(d.abilities.str,12);
 assert.ok(!d.choices.find(group=>group.featureName==='Extra Feat').options.some(option=>option.name==='Armor proficiency'));
});

test('rest dice add character level, ancestry, background, class and eligible feat exactly once without refilling spent dice',()=>{
 const h=setup('Monk','elf',2),moon=h.choice('Elven traits');
 h.c.build.choices[moon.id]=[moon.options.find(option=>option.name==='Moon-blooded').id];
 const background=catalog.find(section=>section.key==='backgrounds').entries.find(entry=>entry.name==='Ashlander');h.c.build.backgroundId=JSON.stringify(['backgrounds',background.group,background.name]);
 takeFeat(h,'Elven power');const d=h.rules.derive(h.c);
 assert.equal(d.restMaximum,7);assert.equal(d.restBreakdown.reduce((sum,line)=>sum+line.amount,0),7);
 h.c.restDice={current:2,max:7,die:'d6'};const saved=h.rules.reconcile(h.c);assert.equal(saved.restDice.current,2);assert.equal(saved.restDice.max,7);
 h.c.build.backgroundId='';assert.equal(h.rules.derive(h.c).restMaximum,6);
 h.c.build.choices[moon.id]=[];assert.equal(h.rules.derive(h.c).restMaximum,5);
});

test('a background reduction honors its minimum and manual overrides remain explicit',()=>{
 const h=setup(),background=catalog.find(section=>section.key==='backgrounds').entries.find(entry=>entry.name==='Mana-burn survivor');
 h.c.build.backgroundId=JSON.stringify(['backgrounds',background.group,background.name]);assert.equal(h.rules.derive(h.c).restMaximum,1);
 h.c.build.health.restMode='manual';h.c.build.health.baseRestDice=8;assert.equal(h.rules.derive(h.c).restMaximum,7);
 h.c.build.health.restAdjustment=2;assert.equal(h.rules.derive(h.c).restMaximum,9);
});

test('rest-dice bonuses include source count wording, bundled lists, signed bonuses and permanent penalties',()=>{
 const monk=setup('Monk','Human',3);takeOption(monk,'Tempered endurance');assert.equal(monk.rules.derive(monk.c).restMaximum,6);
 const druid=setup('Druid','Human',4);takeOption(druid,'The Toad');assert.equal(druid.rules.derive(druid.c).restMaximum,5,'Meditative applies, temporary Dousing does not');
 const fool=setup('Bard','Human',12);takeArchetype(fool,'Fool');takeOption(fool,'Comic relief');assert.equal(fool.rules.derive(fool.c).restMaximum,13);
 const gray=setup('Sorcerer','Human',12);takeArchetype(gray,'Graymage');takeOption(gray,'Graymage staff');assert.equal(gray.rules.derive(gray.c).restMaximum,11);
 const slayer=setup('Ranger','Human',12);takeArchetype(slayer,'Monster slayer');takeOption(slayer,'Rare materials expert');assert.equal(slayer.rules.derive(slayer.c).restMaximum,13);
 const warlord=setup('Barbarian','Human',12);takeArchetype(warlord,'Warlord');takeOption(warlord,'Blood oath of battle');assert.equal(warlord.rules.derive(warlord.c).restMaximum,13);
});

test('level-scaled rest-dice features follow their printed progression',()=>{
 const sorcerer=setup('Sorcerer','Human',6);takeOption(sorcerer,'Elder blood');assert.equal(sorcerer.rules.derive(sorcerer.c).restMaximum,7);
 sorcerer.c.level=7;assert.equal(sorcerer.rules.derive(sorcerer.c).restMaximum,9);
 sorcerer.c.level=9;takeArchetype(sorcerer,'Ascended sorcerer');assert.equal(sorcerer.rules.derive(sorcerer.c).restMaximum,12);
 const paladin=setup('Cleric','Human',7);takeArchetype(paladin,'Paladin');assert.equal(paladin.rules.derive(paladin.c).restMaximum,8);
 paladin.c.level=9;assert.equal(paladin.rules.derive(paladin.c).restMaximum,11);
 paladin.c.level=11;assert.equal(paladin.rules.derive(paladin.c).restMaximum,14);
});

test('conditional proficiency bonuses require expertise and a fractional oath formula requests an author ruling',()=>{
 const ranger=setup('Ranger','Human',3);takeOption(ranger,'Keen will');assert.equal(ranger.rules.derive(ranger.c).restMaximum,3);
 ranger.c.training.skills.Insight=2;assert.equal(ranger.rules.derive(ranger.c).restMaximum,4);
 const cleric=setup('Cleric','Human',1);takeOption(cleric,'Oath of vigilance');assert.equal(cleric.rules.derive(cleric.c).restMaximum,2);
 cleric.c.abilities.wis=24;const d=cleric.rules.derive(cleric.c);assert.ok(d.restWarnings.some(warning=>/fractional/.test(warning)));assert.equal(d.restMaximum,1);
});

test('choice-dependent feat resources apply only to selected benefits of an eligible feat',()=>{
 const h=setup('Occultist');h.c.abilities.int=15;
 const group=h.rules.derive(h.c).choices.find(group=>group.kind==='feat'),feat=takeFeat(h,'Occult gnosis',group);
 assert.equal(h.rules.derive(h.c).restMaximum,1);
 h.c.build.featBenefits[feat.id]=['rest-die','occult-slot','death-bonus'];
 let d=h.rules.derive(h.c);assert.equal(d.restMaximum,2);assert.equal(d.deathSaveSlots,2);assert.equal(d.casting.pools[0].max,3);assert.equal(d.deathSaveBonus,0,'only two benefits are granted');
 h.c.abilities.int=14;d=h.rules.derive(h.c);assert.equal(d.restMaximum,1);assert.equal(d.deathSaveSlots,3);assert.equal(d.casting.pools[0].max,2);
});

test('Oaths of might follows the selected oath and its broken-oath condition',()=>{
 const h=setup('Cleric'),oath=h.choice('Oath');h.c.build.choices[oath.id]=[oath.options[0].id];
 takeFeat(h,'Oaths of might',h.rules.derive(h.c).choices.find(group=>group.kind==='feat'));
 assert.equal(h.rules.derive(h.c).restMaximum,3);
 h.c.conditions=['Broken oath'];assert.equal(h.rules.derive(h.c).restMaximum,1);
});

test('owning an unchosen weapon-family allowance does not satisfy weapon proficiency prerequisites',()=>{
 const h=setup('Wizard','Human');h.c.abilities.dex=13;
 const facts=h.context.CharacterPrerequisites.context(h.c,h.rules.derive(h.c),catalog);
 facts.derived.proficiencies.weapons='Choose 2 martial weapon groups';
 const entry={details:{requirements:'Proficiency with any crossbow or similar ranged trigger weapon.'}};
 assert.equal(h.context.CharacterPrerequisites.evaluate(entry,facts).eligible,false);
});

test('selected skill descriptions contain only that node, while genuine internal item lists remain readable',()=>{
 const h=setup('Fighter','Human',4),group=h.choice('Fighting skills');
 const juggernaut=group.options.find(option=>option.name==='Juggernaut'),weapon=group.options.find(option=>option.name==='Weapon expertise'),make=group.options.find(option=>option.name==='Make do');
 assert.ok(!juggernaut.ownDetails.includes('Armor heft'));assert.ok(!weapon.ownDetails.includes('Counter -'));
 assert.ok(make.ownDetails.includes('Alchemists kit'));
 const shown=[],builder=h.context.CharacterBuilder.create({rules:h.rules,show:(...args)=>shown.push(args),onFinish:()=>{}});
 builder.start(h.c);builder.handleAction('builder-step',{dataset:{builderStep:'Features'}});
 builder.handleAction('builder-task',{dataset:{taskId:group.id}});builder.handleAction('builder-preview-option',{dataset:{optionId:juggernaut.id}});
 assert.ok(shown.at(-1)[1].includes('For every two points of your combined bulk'));
 assert.ok(!shown.at(-1)[1].includes('Heft is an attack trigger'));
 assert.ok(!shown.at(-1)[1].includes('<select data-builder-choice='),'the tree does not render dozens of repeated dropdowns');
});

test('Human feat choices and spell choices have separate stages and cancelling preserves the saved character',()=>{
 const h=setup('Sorcerer','Human',1),shown=[],finished=[],before=plain(h.c);
 const builder=h.context.CharacterBuilder.create({rules:h.rules,show:(...args)=>shown.push(args),onFinish:draft=>finished.push(draft)});
 builder.start(h.c);builder.handleAction('builder-step',{dataset:{builderStep:'Feats'}});assert.match(shown.at(-1)[0],/Feats/);assert.match(shown.at(-1)[1],/Extra Feat/);
 assert.ok(!shown.at(-1)[1].includes('Choose your spells'));
 builder.handleAction('builder-step',{dataset:{builderStep:'Spells'}});assert.match(shown.at(-1)[1],/Eligible spells/);assert.ok(!shown.at(-1)[1].includes('Extra Feat'));
 builder.cancel();assert.deepEqual(plain(h.c),before);assert.equal(finished.length,0);
});
