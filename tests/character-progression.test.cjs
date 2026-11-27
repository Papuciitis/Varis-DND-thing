'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),catalog=require('./helpers/catalog.cjs')(),manifest=JSON.parse(fs.readFileSync(path.join(root,'site/data/catalog-manifest.json'),'utf8')),metadata=JSON.parse(fs.readFileSync(path.join(root,'site',manifest.builder),'utf8'));
function setup(className='Fighter',raceName='Human',level=1){const context=vm.createContext({crypto:require('node:crypto').webcrypto});for(const name of ['entry-order','character-state','character-effects','character-equipment','character-casting','character-prerequisites','character-feats','character-rules'])vm.runInContext(fs.readFileSync(path.join(root,'web',name+'.js'),'utf8'),context);const rules=context.CharacterRules.create(metadata,catalog),c=rules.enable(context.CharacterState.normalizeCharacter({level}));c.build.classId=metadata.classes.find(cls=>cls.name===className).id;c.build.raceId=metadata.races.find(race=>race.name===raceName).id;return {context,rules,c};}
function learn(h,name){const entry=catalog.find(section=>section.key==='spells').entries.find(entry=>entry.name===name),entryId=JSON.stringify(['spells',entry.group,entry.name]);h.c.spells.push({id:name,entryId,name,prepared:true,classId:''});return entryId;}
function choose(h,name){const group=h.rules.derive(h.c).choices.find(group=>group.options.some(item=>item.name===name));assert.ok(group,name+' must be selectable');const item=group.options.find(item=>item.name===name),selected=[];function add(option){for(const id of option.requires || [])add(group.options.find(item=>item.id===id));if(!selected.includes(option.id))selected.push(option.id);}add(item);h.c.build.choices[group.id]=selected;return group;}
function decisions(h,source,values){h.c.build.featChoices[source.id]=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,Array.isArray(value)?value:[value]]));}

test('class feature upgrades add real spell-list picks and disappear when their granting choice is removed',()=>{
 const h=setup('Sorcerer','Human',2),entryId=learn(h,'Minor telekinesis'),source=choose(h,'Arcane ascension');let d=h.rules.derive(h.c);const target=d.choices.find(group=>group.label==='Choose cantrip to upgrade');assert.ok(target);h.c.build.choices[target.id]=[entryId];d=h.rules.derive(h.c);assert.equal(d.choices.find(group=>group.spellEntryId===entryId).count,3);
 h.c.build.choices[source.id]=[];assert.equal(h.rules.derive(h.c).choices.find(group=>group.spellEntryId===entryId).count,1);
});
test('hex upgrade lists receive only explicit feature grants and dormant sources cannot inflate them',()=>{
 const h=setup('Fighter','Human',6),entryId=learn(h,'Disruption'),group=choose(h,'Hex training III');let d=h.rules.derive(h.c);const target=d.choices.find(group=>group.label==='Choose hex to upgrade');assert.ok(target);h.c.build.choices[target.id]=[entryId];d=h.rules.derive(h.c);const upgrade=d.choices.find(group=>group.spellEntryId===entryId);assert.equal(upgrade.count,1);assert.ok(upgrade.options[0].name.includes('Double range'),'the first bullet is retained for hex lists');
 h.c.build.choices[group.id]=[];assert.equal(h.rules.derive(h.c).choices.find(group=>group.spellEntryId===entryId).count,0);
});
test('Arcane intuition learns its own cantrip and tracks separate ancestry upgrades at levels 1, 5 and 9',()=>{
 const h=setup('Fighter','elf',1);h.c.abilities.int=16;const group=choose(h,'Arcane intuition');let d=h.rules.derive(h.c),source=d.featPlan.sources.find(source=>source.name==='Arcane intuition');assert.ok(source);const profile=metadata.spellProgressions.find(profile=>profile.name==='Minor telekinesis');decisions(h,source,{'learn-cantrip':profile.entryId,'racial-upgrades':'own'});d=h.rules.derive(h.c);assert.equal(d.choices.find(group=>group.spellEntryId===profile.entryId).count,1);let saved=h.rules.reconcile(h.c);assert.ok(saved.spells.some(row=>row.entryId===profile.entryId && row.castingAbility==='int'));
 h.c.level=5;decisions(h,source,{'learn-cantrip':profile.entryId,'racial-upgrades':['own','attack']});d=h.rules.derive(h.c);assert.equal(d.choices.find(group=>group.spellEntryId===profile.entryId).count,3);assert.equal(h.context.CharacterFeats.spellModifiers(h.c,d,{entryId:profile.entryId}).attack,1);
 h.c.level=9;decisions(h,source,{'learn-cantrip':profile.entryId,'racial-upgrades':['own','attack','own']});assert.equal(h.rules.derive(h.c).choices.find(group=>group.spellEntryId===profile.entryId).count,5);
 h.c.build.choices[group.id]=[];saved=h.rules.reconcile(h.c);assert.ok(!saved.spells.some(row=>row.featSource===source.id));
});
test('the Outcast house minor hex gains its ancestry upgrade at level 2, not level 1',()=>{
 const h=setup('Fighter','elf',1);choose(h,'Outcast house descendant');let d=h.rules.derive(h.c);const source=d.featPlan.sources.find(source=>source.name==='Outcast house descendant'),profile=metadata.spellProgressions.find(profile=>profile.name==='Disruption');decisions(h,source,{'learn-hex':profile.entryId});assert.equal(h.rules.derive(h.c).choices.find(group=>group.spellEntryId===profile.entryId).count,0);h.c.level=2;assert.equal(h.rules.derive(h.c).choices.find(group=>group.spellEntryId===profile.entryId).count,1);
});
test('Ward’s selected death-save bonus scales to +2 at level 9',()=>{
 const h=setup('Wizard','Human',5),entryId=learn(h,'ward');let d=h.rules.derive(h.c),group=d.choices.find(group=>group.spellEntryId===entryId);h.c.build.choices[group.id]=[group.options.find(option=>/bonus to death saves/.test(option.name)).id];assert.equal(h.rules.derive(h.c).deathSaveBonus,1);h.c.level=9;assert.equal(h.rules.derive(h.c).deathSaveBonus,2);
});


test('Arcane ascension adds metamagic capacity only at its printed levels',()=>{
 const h=setup('Sorcerer','Human',4),before=h.rules.derive(h.c).casting.pools.find(pool=>pool.label==='Metamagic points');assert.ok(before);choose(h,'Arcane ascension');let d=h.rules.derive(h.c);assert.equal(d.casting.pools.find(pool=>pool.label==='Metamagic points').max,before.max+1);h.c.level=8;d=h.rules.derive(h.c);assert.equal(d.casting.pools.find(pool=>pool.label==='Metamagic points').max,h.context.CharacterState.abilityModifier(d.abilities.cha)+d.proficiency+4);
});


test('cryptic cyphers uses recorded insight progress instead of the normal character-level schedule',()=>{
 const h=setup('Occultist','Human',4);choose(h,'cryptic cyphers');let d=h.rules.derive(h.c);const source=d.featPlan.sources.find(source=>source.name==='cryptic cyphers');assert.ok(source);const profile=metadata.spellProgressions.find(profile=>profile.name==='Eldritch blast');decisions(h,source,{'insights':'6','learn-cantrip':profile.entryId});d=h.rules.derive(h.c);assert.equal(d.choices.find(group=>group.spellEntryId===profile.entryId).count,1);h.c.level=12;assert.equal(h.rules.derive(h.c).choices.find(group=>group.spellEntryId===profile.entryId).count,1);decisions(h,source,{'insights':'18','learn-cantrip':profile.entryId});assert.equal(h.rules.derive(h.c).choices.find(group=>group.spellEntryId===profile.entryId).count,5);const saved=h.rules.reconcile(h.c);assert.equal(saved.spells.find(row=>row.entryId===profile.entryId).progressionMode,'cypher');
});
