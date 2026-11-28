'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),catalog=require('./helpers/catalog.cjs')(),manifest=JSON.parse(fs.readFileSync(path.join(root,'site/data/catalog-manifest.json'),'utf8')),metadata=JSON.parse(fs.readFileSync(path.join(root,'site',manifest.builder),'utf8'));
const plain=value=>JSON.parse(JSON.stringify(value));
function setup(pairs){
 const context=vm.createContext({crypto:require('node:crypto').webcrypto});for(const name of ['entry-order','character-state','character-effects','character-equipment','character-casting','character-prerequisites','character-feats','character-rules','character-builder'])vm.runInContext(fs.readFileSync(path.join(root,'web',name+'.js'),'utf8'),context);
 const State=context.CharacterState,Casting=context.CharacterCasting,rules=context.CharacterRules.create(metadata,catalog),cls=name=>metadata.classes.find(item=>item.name===name),history=pairs.flatMap(([name,level])=>Array(level).fill(cls(name).id));
 let c=rules.enable(State.normalizeCharacter({level:history.length,restDice:{current:history.length,max:history.length,die:cls(pairs[0][0]).hitDie}}));c.build.classId=history[0];c.build.classOrder=history;c=rules.reconcile(c);return {context,State,Casting,rules,c,cls};
}
function archetype(h,className,slot=0){const cls=h.cls(className),level=cls.archetypeLevels[slot],entry=metadata.archetypes.find(item=>item.className===className && item.minLevel<=level && item.features.length);assert.ok(entry,className+' archetype');const choices=cls.id===h.c.build.classId?h.c.build.archetypes:(h.c.build.classArchetypes[cls.id] ||= []);while(choices.length<=slot)choices.push('');choices[slot]=entry.id;return entry;}
function spell(h,className,level=1){const cls=h.cls(className),entry=catalog.find(section=>section.key==='spells').entries.find(item=>h.Casting.spellInfo(item).tradition===cls.casting.tradition && h.Casting.spellInfo(item).level===level),row={id:className+'-spell',entryId:h.Casting.spellId(entry),name:entry.name,prepared:true,classId:cls.id};h.c.spells.push(row);return {entry,row};}

test('multiclass features, choice counts and archetypes use each class level',()=>{
 const h=setup([['Bard',5],['Fighter',4]]),bard=archetype(h,'Bard'),fighter=archetype(h,'Fighter'),d=h.rules.derive(h.c);assert.equal(d.classProgressions.length,2);assert.ok(d.eligibleArchetypes.some(item=>item.id===bard.id));assert.ok(d.eligibleArchetypes.some(item=>item.id===fighter.id));
 for(const owner of d.classProgressions){for(const feature of d.features.filter(item=>item.classId===owner.id))assert.ok((feature.level || 1)<=owner.level,feature.name);const solo=setup([[owner.cls.name,owner.level]]).rules.derive(setup([[owner.cls.name,owner.level]]).c);for(const group of solo.choices.filter(item=>item.parent===owner.cls.name && item.kind!=='feat'))assert.equal(d.choices.find(item=>item.id===group.id)?.count,group.count,group.featureName);}
});

test('another class unlocks its own archetype slots and preserves inactive selections',()=>{
 const h=setup([['Bard',8],['Fighter',4]]),entry=archetype(h,'Fighter');assert.ok(h.rules.derive(h.c).eligibleArchetypes.some(item=>item.id===entry.id));h.c.level=11;assert.ok(!h.rules.derive(h.c).eligibleArchetypes.some(item=>item.id===entry.id));assert.equal(h.c.build.classArchetypes[h.cls('Fighter').id][0],entry.id);h.c.level=12;assert.ok(h.rules.derive(h.c).eligibleArchetypes.some(item=>item.id===entry.id));
 const restored=h.State.importCharacter(h.State.exportCharacter(h.rules.reconcile(h.c)));assert.deepEqual(plain(restored.build.classOrder),plain(h.c.build.classOrder));assert.ok(h.rules.derive(restored).eligibleArchetypes.some(item=>item.id===entry.id));
});

test('feat grants and class prerequisites follow the recorded chronological class levels',()=>{
 const h=setup([['Bard',2],['Fighter',2],['Bard',2]]),d=h.rules.derive(h.c),asi=d.choices.find(group=>group.parent==='Fighter' && group.label==='Ability score improvement');assert.equal(asi.level,4);const facts=h.context.CharacterPrerequisites.context(h.c,d,catalog,4),eligible=raw=>h.context.CharacterPrerequisites.evaluate({details:{requirements:raw}},facts).eligible;assert.equal(eligible('At least 2 levels in Fighter'),true);assert.equal(eligible('At least 3 levels in Fighter'),false);assert.equal(eligible('At least 3 levels in Bard'),false);assert.equal(h.State.proficiencyBonus(h.c.level),d.proficiency);
});

test('multiclass HP uses each level’s hit die and secondary classes do not grant saving throws or heavy armor',()=>{
 const h=setup([['Wizard',2],['Fighter',2]]),d=h.rules.derive(h.c),sides=name=>Number(h.cls(name).hitDie.slice(1));assert.equal(d.hpMaximum,sides('Wizard')+sides('Wizard')/2+1+2*(sides('Fighter')/2+1));assert.equal(d.saves.str,false);assert.equal(d.saves.int,true);assert.match(d.proficiencies.armor,/medium armor/);assert.doesNotMatch(d.proficiencies.armor,/heavy armor/);assert.equal(d.trainingClasses.find(owner=>owner.cls.name==='Fighter').training.skillChoice,null);
});

test('Alchemist and Occultist use the reduced Artificer and Warlock multiclass training',()=>{
 for(const [name,armor,tools,weapons] of [['Alchemist','light armor, medium armor, shields',"thieves' tools, tinker's tools",''],['Occultist','light armor','','simple weapons']]){
  const h=setup([['Wizard',3],[name,1]]),baseline=setup([['Wizard',3]]),d=h.rules.derive(h.c),owner=d.classProgressions.find(owner=>owner.cls.name===name);
  assert.deepEqual(plain(owner.training.proficiencies),{armor,tools,weapons});assert.equal(owner.training.skillChoice,null);assert.deepEqual(plain(d.saves),plain(baseline.rules.derive(baseline.c).saves));
  assert.doesNotMatch(d.proficiencies.armor,/heavy armor/);if(tools)assert.match(d.proficiencies.tools,/thieves' tools, tinker's tools/);
  let html='';const ui=h.context.CharacterBuilder.create({rules:h.rules,show:(_title,body)=>{html=body;}});ui.start(h.c);ui.handleAction('builder-step',{dataset:{builderStep:'Class'}});assert.match(html,/Multiclass proficiencies/);assert.doesNotMatch(html,/no specified multiclass starting-training package/);
  h.c.level=3;const removed=h.rules.derive(h.c);assert.deepEqual(plain(removed.proficiencies),plain(baseline.rules.derive(baseline.c).proficiencies));
 }
});

test('multiclass casting keeps learning, slots, spell sources and casting abilities separate',()=>{
 const h=setup([['Wizard',3],['Sorcerer',2]]),wizard=spell(h,'Wizard'),sorcerer=spell(h,'Sorcerer');h.c=h.State.normalizeCharacter(h.c);const d=h.rules.derive(h.c);assert.equal(d.castings.length,2);for(const [name,level] of [['Wizard',3],['Sorcerer',2]])assert.equal(d.castings.find(item=>item.className===name).classLevel,level);
 const sw=h.Casting.spellSelection(h.c,h.Casting.classView(d,h.cls('Wizard').id),catalog),ss=h.Casting.spellSelection(h.c,h.Casting.classView(d,h.cls('Sorcerer').id),catalog);assert.deepEqual(plain(sw.chosen.map(row=>row.id)),[wizard.row.id]);assert.deepEqual(plain(ss.chosen.map(row=>row.id)),[sorcerer.row.id]);assert.equal(h.Casting.spellAbility(d,wizard.row),'int');assert.equal(h.Casting.spellAbility(d,sorcerer.row),'cha');
 const option=h.Casting.castOptions(h.c,d,sorcerer.entry,sorcerer.row).find(option=>option.level===2);assert.ok(option?.available);const after=h.Casting.castSpell(h.c,d,catalog,sorcerer.row.id,option.id).character,changed=h.rules.derive(after);assert.equal(changed.castings.find(item=>item.className==='Sorcerer').pools.find(pool=>pool.level===2).current,d.castings.find(item=>item.className==='Sorcerer').pools.find(pool=>pool.level===2).current-1);assert.equal(changed.castings.find(item=>item.className==='Wizard').pools.find(pool=>pool.level===2).current,d.castings.find(item=>item.className==='Wizard').pools.find(pool=>pool.level===2).current);
});

test('Bard learning uses Bard levels while its explicit upcasting cap uses character level',()=>{
 const h=setup([['Fighter',8],['Bard',3]]),d=h.rules.derive(h.c);assert.equal(d.casting.className,'Bard');assert.equal(d.casting.maxLearnLevel,2);assert.equal(d.casting.maxCastLevel,6);assert.equal(d.casting.knownSpells,h.cls('Bard').casting.progression.find(row=>row.level===3).knownSpells);
});

test('Occultist and Druid spell learning use their own class levels',()=>{
 const occultist=setup([['Fighter',8],['Occultist',1]]),o=occultist.rules.derive(occultist.c).casting;assert.equal(o.maxLearnLevel,1);assert.equal(o.maxCastLevel,5);
 const druid=setup([['Fighter',8],['Druid',1]]),d=druid.rules.derive(druid.c).casting;assert.equal(d.maxLearnLevel,1);assert.equal(d.maxCastLevel,1);
 const selection=druid.Casting.spellSelection(druid.c,druid.rules.derive(druid.c),catalog);assert.ok(selection.eligible.every(entry=>druid.Casting.spellInfo(entry).level<=1));const higher=catalog.find(section=>section.key==='spells').entries.find(entry=>druid.Casting.spellInfo(entry).tradition==='mystic' && druid.Casting.spellInfo(entry).level===2);assert.match(druid.Casting.spellLearningError(druid.c,druid.rules.derive(druid.c),catalog,higher),/maximum spell level you can learn is 1/);
});

test('Wizard later spellbook choices use Wizard levels in a multiclass build',()=>{
 const h=setup([['Wizard',3],['Bard',5]]),entries=catalog.find(section=>section.key==='spells').entries.filter(item=>h.Casting.spellInfo(item).tradition==='arcane' && h.Casting.spellInfo(item).level===2);
 for(const [index,entry] of entries.slice(0,2).entries())h.c.spells.push({id:'later-'+index,name:entry.name,entryId:h.Casting.spellId(entry),prepared:true,classId:h.cls('Wizard').id});
 const d=h.rules.derive(h.c);assert.match(h.Casting.spellLearningError(h.c,d,catalog,entries[2]),/starting Wizard spellbook/);
});

test('rest dice retain class die sizes and typed spending through saves and level removal',()=>{
 const h=setup([['Fighter',3],['Sorcerer',2]]),fighter=h.c.restDice.pools.find(pool=>pool.classId===h.cls('Fighter').id),sorcerer=h.c.restDice.pools.find(pool=>pool.classId===h.cls('Sorcerer').id);assert.equal(fighter.die,'d10');assert.equal(sorcerer.die,'d4');assert.equal(fighter.max,3);assert.equal(sorcerer.max,2);
 h.c=h.State.resourceDelta(h.c,'rest-pool:'+sorcerer.id,-1);assert.equal(h.c.restDice.current,4);assert.equal(h.c.restDice.pools.find(pool=>pool.id===fighter.id).current,3);assert.equal(h.c.restDice.pools.find(pool=>pool.id===sorcerer.id).current,1);h.c=h.rules.reconcile(h.State.importCharacter(h.State.exportCharacter(h.c)));h.c.level=3;h.c=h.rules.reconcile(h.c);assert.equal(h.c.restDice.pools.length,1);h.c.level=5;h.c=h.rules.reconcile(h.c);assert.equal(h.c.restDice.pools.find(pool=>pool.id===sorcerer.id).current,1,'returning to a class does not reset its spending');
});

test('class-owned rest bonuses use their class die and disappear with the granting choice',()=>{
 const h=setup([['Fighter',3],['Bard',2]]);h.c.build.classSkills[h.cls('Bard').id]=['Arcana','History'];h.c.build.classTools[h.cls('Bard').id]='Lute';const d=h.rules.derive(h.c);assert.equal(d.skillRanks.Arcana,1);assert.equal(d.skillRanks.History || 0,0,'secondary Bard grants one skill');assert.match(d.proficiencies.tools,/Lute/);const group=d.choices.find(group=>group.featureName==='Bardic traits'),presence=group.options.find(item=>item.name==='Presence');h.c.build.choices[group.id]=[presence.id];h.c=h.rules.reconcile(h.c);const pool=h.c.restDice.pools.find(pool=>pool.classId===h.cls('Bard').id);assert.equal(pool.die,'d6');assert.equal(pool.max,3);assert.equal(h.c.restDice.pools.find(pool=>pool.classId===h.cls('Fighter').id).max,3);h.c.build.choices[group.id]=[];h.c=h.rules.reconcile(h.c);assert.equal(h.c.restDice.pools.find(row=>row.id===pool.id).max,2);assert.equal(h.c.restDice.current,5,'removing an unavailable bonus must preserve the ordinary remaining dice');
});

test('a secondary class’s Paladin rest-dice bonus scales with that class rather than total level',()=>{
 const h=setup([['Fighter',2],['Cleric',7]]),paladin=metadata.archetypes.find(item=>item.name==='Paladin');assert.equal(paladin.className,'Cleric');h.c.build.classArchetypes[h.cls('Cleric').id]=['',paladin.id];let d=h.rules.derive(h.c);assert.equal(d.restBreakdown.find(item=>item.label==='Paladin: Divine power').amount,1);assert.equal(d.restPools.find(row=>row.classId===h.cls('Cleric').id).max,8);
 h.c.build.classOrder=[h.cls('Fighter').id,...Array(9).fill(h.cls('Cleric').id)];h.c.level=10;d=h.rules.derive(h.c);assert.equal(d.restBreakdown.find(item=>item.label==='Paladin: Divine power').amount,2);assert.equal(d.restPools.find(row=>row.classId===h.cls('Cleric').id).max,11);
});

test('builder can add class levels, choose that class’s archetype, save and remove it',()=>{
 const h=setup([['Bard',4]]);let saved,html='';const ui=h.context.CharacterBuilder.create({rules:h.rules,show:(_title,body)=>{html=body;},onFinish:value=>{saved=value;}});ui.start(h.c);ui.handleAction('builder-step',{dataset:{builderStep:'Class'}});ui.handleChange({dataset:{builderAddClass:''},value:h.cls('Fighter').id});ui.handleChange({dataset:{builderClassLevel:h.cls('Fighter').id},value:'4'});assert.match(html,/Fighter · Level 4/);const entry=metadata.archetypes.find(item=>item.className==='Fighter' && item.minLevel<=4);ui.handleChange({dataset:{builderClassArchetype:h.cls('Fighter').id,builderChoiceIndex:'0'},value:entry.id});ui.handleAction('builder-step',{dataset:{builderStep:'Review'}});ui.handleAction('builder-finish',{});assert.equal(saved.level,8);assert.ok(h.rules.derive(saved).eligibleArchetypes.some(item=>item.id===entry.id));
 ui.start(saved);ui.handleAction('builder-remove-class',{dataset:{classId:h.cls('Fighter').id}});ui.handleAction('builder-step',{dataset:{builderStep:'Review'}});ui.handleAction('builder-finish',{});assert.equal(saved.level,4);assert.equal(h.rules.derive(saved).classProgressions.length,1);assert.equal(saved.build.classArchetypes[h.cls('Fighter').id][0],entry.id);
});
