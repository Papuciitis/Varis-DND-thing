'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),catalog=require('./helpers/catalog.cjs')(),plain=value=>JSON.parse(JSON.stringify(value));
const identity=(section,name)=>JSON.stringify([section,'Test fixtures',name]);
const pick=(key='paths',count=1)=>({key,label:'Choose a path',type:'select',count,upgradeable:true,options:[{id:'first',name:'First path',effects:{restDice:1}},{id:'second',name:'Second path',requires:['first'],repeatLimit:3,effects:{restDice:2}}]});
function setup({feats=[],background=null,features=[],archetypes=[],level=3,sources={}}={}){
 const context=vm.createContext({crypto:require('node:crypto').webcrypto});
 for(const name of ['entry-order','character-state','character-effects','character-equipment','character-casting','character-prerequisites','character-automation','character-feats','character-rules','character-builder'])vm.runInContext(fs.readFileSync(path.join(root,'web',name+'.js'),'utf8'),context);
 const entries=feats.map(([name,automation])=>({name,group:'Test fixtures',details:{description:'Test rules'},automation}));
 const data=[...catalog.filter(section=>!['feats','backgrounds'].includes(section.key)),{key:'feats',entries},{key:'backgrounds',entries:background?[{name:background[0],group:'Test fixtures',details:{description:'Test background'},automation:background[1]}]:[]}];
 const metadata={races:[],classes:[{id:'test-class',name:'Test class',hitDie:'d8',description:'Test class',saves:[],proficiencies:{},castingAbilities:[],archetypeLevels:[2],features:[{id:'test-feats',name:'Test feat grants',level:1,grantsFeat:entries.length,choices:[],details:''},...features]}],archetypes,automation:{version:1,sources}};
 const State=context.CharacterState,rules=context.CharacterRules.create(metadata,data),c=rules.enable(State.normalizeCharacter({level,restDice:{current:level,max:level}}));c.build.classId='test-class';
 if(background)c.build.backgroundId=identity('backgrounds',background[0]);
 const d=rules.derive(c),group=d.choices.find(group=>group.kind==='feat');if(group)c.build.choices[group.id]=entries.map(entry=>identity('feats',entry.name));
 const source=name=>rules.derive(c).featPlan.sources.find(source=>source.name===name),decide=(source,key,values)=>{(c.build.featChoices[source.id] ||= {})[key]=Array.isArray(values)?values:[values];};
 return {context,State,rules,c,data,metadata,source,decide};
}

test('a new feat uses prerequisite trees, per-option repeats and effects without a name adapter',()=>{
 const h=setup({feats:[['Unregistered craft',{choices:[pick('paths',4)]}]]}),source=h.source('Unregistered craft');
 h.decide(source,'paths',['first','second','second','second']);let d=h.rules.derive(h.c);
 assert.equal(d.restMaximum,10);assert.deepEqual(plain(d.featPlan.specs[source.id].values.paths),['first','second','second','second']);
 h.decide(source,'paths',['second','second','second','second']);d=h.rules.derive(h.c);assert.equal(d.restMaximum,3);assert.equal(d.featPlan.specs[source.id].values.paths.length,0);
 h.decide(source,'paths',['first','first','second','second']);d=h.rules.derive(h.c);assert.deepEqual(plain(d.featPlan.specs[source.id].slots.paths),['first','','second','second']);assert.equal(d.restMaximum,8);
});

test('new background grants two independent upgrades to the same arbitrary choice field',()=>{
 const h=setup({feats:[['Unregistered craft',{choices:[pick()]}]],background:['Unregistered origin',{choices:[{key:'extras',label:'Extend lists',type:'upgrade-target',targetMode:'upgrades',count:2,repeat:true}],grants:[{from:'extras',count:1}],effects:[{add:{restDice:1}}]}]}),target=h.source('Unregistered craft'),origin=h.source('Unregistered origin');
 const field=h.rules.derive(h.c).featPlan.specs[origin.id].fields[0],id=field.options.find(option=>option.targetSource===target.id).id;
 h.decide(origin,'extras',[id,id]);h.decide(target,'paths',['first','second','second']);let d=h.rules.derive(h.c);
 assert.equal(d.restMaximum,9);const paths=d.featPlan.specs[target.id].fields[0];assert.equal(paths.count,3);assert.equal(new Set(paths.slotSources).size,3);
 let saved=h.rules.reconcile(h.c);saved=h.State.importCharacter(h.State.exportCharacter(saved));assert.equal(h.rules.derive(saved).restMaximum,9);
 saved.build.featChoices[origin.id].extras=['',id];d=h.rules.derive(saved);assert.equal(d.restMaximum,7);assert.equal(d.featPlan.specs[target.id].fields[0].count,2);assert.deepEqual(plain(d.featPlan.specs[target.id].slots.paths),['first','second']);
 saved.build.backgroundId='';d=h.rules.derive(saved);assert.equal(d.restMaximum,4);assert.deepEqual(plain(d.featPlan.specs[target.id].values.paths),['first']);assert.equal(d.featPlan.specs[target.id].inactive.paths.length,2);
});

test('a new background can grant a feat which grants another feat and cleans up its descendants',()=>{
 const h=setup({feats:[['Unregistered teacher',{choices:[],featGrants:[{key:'pupil',count:1}]}],['Unregistered student',{choices:[pick()],effects:[{add:{hpFlat:3}}]}]],background:['Unregistered school',{choices:[{key:'study',label:'Study',type:'select',count:1,options:[{id:'yes',name:'Study'}]}],featGrants:[{key:'teacher',count:1,when:{choice:'study',includes:'yes'}}]}]});
 // Use only the background's grants for this test.
 h.c.build.choices={};const origin=h.source('Unregistered school');h.decide(origin,'study','yes');let d=h.rules.derive(h.c);
 let group=d.choices.find(group=>group.id.startsWith(origin.id+':feat-grant:teacher'));assert.ok(group);
 h.c.build.choices[group.id]=[identity('feats','Unregistered teacher')];d=h.rules.derive(h.c);const teacher=d.featPlan.sources.find(source=>source.name==='Unregistered teacher');assert.ok(teacher);
 group=d.choices.find(group=>group.id.startsWith(teacher.id+':feat-grant:pupil'));assert.ok(group);h.c.build.choices[group.id]=[identity('feats','Unregistered student')];const student=h.source('Unregistered student');h.decide(student,'paths','first');
 d=h.rules.derive(h.c);assert.equal(d.restMaximum,4);assert.equal(d.effects.hpFlat,3);
 h.c.build.featChoices[origin.id].study=[];d=h.rules.derive(h.c);assert.equal(d.restMaximum,3);assert.equal(d.effects.hpFlat,undefined);assert.equal(d.featPlan.sources.some(source=>source.name==='Unregistered teacher'),false);assert.equal(d.featPlan.sources.some(source=>source.name==='Unregistered student'),false);
});

test('a new subclass scales its choices by that class level and grants abilities and proficiencies',()=>{
 const rule={choices:[{...pick('paths'),countByLevel:[{level:3,count:2}]},{key:'ability',label:'Ability',type:'ability',abilities:['wis'],count:1},{key:'tool',label:'Tool',type:'text',count:1}],effects:[{target:'abilities',choice:'ability',amount:1},{target:'proficiencies.tools',choice:'tool'}]};
 const h=setup({archetypes:[{id:'test-subclass',name:'Unregistered subclass',className:'Test class',minLevel:2,features:[{id:'subclass-training',name:'Unregistered training',automationId:'subclass-training',level:2,choices:[],details:''}]}],sources:{'subclass-training':rule}});h.c.build.archetypes=['test-subclass'];const source=h.source('Unregistered training');h.decide(source,'paths',['first','second']);h.decide(source,'ability','wis');h.decide(source,'tool','New test tool');
 let d=h.rules.derive(h.c);assert.equal(d.restMaximum,6);assert.equal(d.abilities.wis,h.c.abilities.wis+1);assert.match(d.proficiencies.tools,/New test tool/);assert.equal(d.restPools[0].max,6);
 h.c.level=2;d=h.rules.derive(h.c);assert.equal(d.featPlan.specs[source.id].fields[0].count,1);assert.equal(d.restMaximum,3);
 h.c.build.archetypes=[];d=h.rules.derive(h.c);assert.equal(d.restMaximum,2);assert.equal(d.abilities.wis,h.c.abilities.wis);assert.doesNotMatch(d.proficiencies.tools || '',/New test tool/);
});

test('long data-defined grant chains resolve and disappear when their root choice is removed',()=>{
 const features=[],sources={};for(let index=0;index<12;index++){const id='chain-'+index;features.push({id,name:'Chain '+index,level:1,automationId:id,details:'',choices:[]});sources[id]={choices:[{key:'paths',label:'Continue',type:'select',count:index?0:1,upgradeable:true,options:[{id:'go',name:'Continue',effects:{restDice:1}}]}],grants:index<11?[{targetSource:'chain-'+(index+1),targetChoice:'paths',count:1,when:{choice:'paths',includes:'go'}}]:[]};}
 const h=setup({features,sources});for(const feature of features)h.decide(feature,'paths','go');let d=h.rules.derive(h.c);assert.equal(d.restMaximum,15);assert.ok(!d.warnings.some(warning=>/stable result/.test(warning)));
 h.c.build.featChoices['chain-0'].paths=[];d=h.rules.derive(h.c);assert.equal(d.restMaximum,3);for(let index=1;index<12;index++)assert.equal(d.featPlan.specs['chain-'+index].values.paths.length,0);
});

test('runtime selected grant cycles do not activate each other',()=>{
 const features=['a','b'].map(id=>({id,name:'Cycle '+id,level:1,automationId:id,details:'',choices:[]})),sources={};
 for(const id of ['a','b'])sources[id]={choices:[{...pick('paths',id==='a'?1:0)}],grants:[{targetSource:id==='a'?'b':'a',targetChoice:'paths',count:1,when:{choice:'paths',includes:'first'}}]};
 const h=setup({features,sources});for(const feature of features)h.decide(feature,'paths','first');const d=h.rules.derive(h.c);assert.equal(d.restMaximum,4);assert.equal(d.featPlan.specs.b.values.paths.length,0);assert.ok(d.warnings.some(warning=>/Circular upgrade/.test(warning)));
});

test('new spell followups filter the tradition, cast and disappear with the granting choice',()=>{
 const rule={choices:[{key:'mode',label:'Mode',type:'select',count:1,options:[{id:'magic',name:'Magic'}]},{key:'gift',label:'Gift',type:'spell',count:1,level:1,traditions:['arcane'],when:{choice:'mode',includes:'magic'},grantSpell:{ability:'int',resource:'restDice'}}]};
 const h=setup({background:['Unregistered magical origin',rule]}),origin=h.source('Unregistered magical origin');h.decide(origin,'mode','magic');let d=h.rules.derive(h.c),field=d.featPlan.specs[origin.id].fields.find(field=>field.key==='gift');assert.ok(field.options.length);assert.ok(field.options.every(option=>h.context.CharacterCasting.spellInfo(h.data.find(section=>section.key==='spells').entries.find(entry=>h.context.CharacterCasting.spellId(entry)===option.id)).tradition==='arcane'));
 h.decide(origin,'gift',field.options[0].id);let c=h.rules.reconcile(h.c);d=h.rules.derive(c);assert.equal(d.featPlan.spells.length,1);const row=c.spells.find(row=>row.featSource===origin.id),entry=h.data.find(section=>section.key==='spells').entries.find(entry=>h.context.CharacterCasting.spellId(entry)===row.entryId),options=h.context.CharacterCasting.castOptions(c,d,entry,row);assert.ok(options.find(option=>option.poolId==='feat:rest'));c=h.context.CharacterCasting.castSpell(c,d,h.data,row.id,'feat:rest').character;assert.equal(c.restDice.current,2);
 c.build.featChoices[origin.id].mode=[];c=h.rules.reconcile(c);assert.equal(c.spells.some(row=>row.featSource===origin.id),false);
});

test('the builder exposes a new background choice as its own feature task',()=>{
 const h=setup({background:['Unregistered origin',{choices:[{key:'tool',label:'Choose a tool',type:'text',count:1}]}]}),shows=[],builder=h.context.CharacterBuilder.create({rules:h.rules,show:(...args)=>shows.push(args),onFinish:()=>{},onCancel:()=>{},renderRule:value=>String(value)});
 builder.start(h.c);for(let n=0;n<3;n++)builder.handleAction('builder-next',{});
 const html=shows.at(-1).join(' ');assert.match(html,/Unregistered origin/);assert.match(html,/data-choice-key="tool"/);
});

test('repeating an upgrade adds independent followups and preserves the surviving grant’s spell',()=>{
 const rule={choices:[{key:'paths',label:'Spell upgrades',type:'select',count:1,upgradeable:true,options:[{id:'spell',name:'Learn a spell',repeatLimit:3}]},{key:'learn',label:'Granted spell',type:'spell',count:1,level:1,traditions:['arcane'],perChoice:{choice:'paths',includes:'spell'},grantSpell:{ability:'int',resource:'manual'}}]};
 const h=setup({feats:[['Unregistered repeated gift',rule]],background:['Unregistered origin',{choices:[{key:'targets',label:'Extra picks',type:'upgrade-target',targetMode:'upgrades',count:2,repeat:true}],grants:[{from:'targets',count:1}]}]}),gift=h.source('Unregistered repeated gift'),origin=h.source('Unregistered origin');
 let d=h.rules.derive(h.c),target=d.featPlan.specs[origin.id].fields[0].options.find(option=>option.targetSource===gift.id).id;h.decide(origin,'targets',[target,target]);h.decide(gift,'paths',['spell','spell','spell']);d=h.rules.derive(h.c);const field=d.featPlan.specs[gift.id].fields.find(field=>field.key==='learn'),spells=field.options.slice(0,3).map(option=>option.id);assert.equal(field.count,3);h.decide(gift,'learn',spells);
 let c=h.rules.reconcile(h.c);c.build.featChoices[origin.id].targets=['',target];d=h.rules.derive(c);assert.deepEqual(plain(d.featPlan.specs[gift.id].values.learn),[spells[0],spells[2]]);assert.equal(d.featPlan.spells.some(row=>row.entryId===spells[1]),false);
 c.build.backgroundId='';d=h.rules.derive(c);assert.deepEqual(plain(d.featPlan.specs[gift.id].values.learn),[spells[0]]);
});

test('new structured prerequisites filter feat choices at the level of the grant',()=>{
 const h=setup({feats:[['Unregistered restricted craft',{prerequisites:{all:[{class:'Test class',level:2},{ability:'wis',minimum:13}]},choices:[],effects:[{add:{hpFlat:2}}]}]]});
 // Its only feat grant was received at level 1, so current level 3 cannot qualify it.
 let d=h.rules.derive(h.c);assert.equal(d.features.some(feature=>feature.name==='Unregistered restricted craft'),false);
 h.metadata.classes[0].features[0].level=2;h.c.abilities.wis=13;d=h.rules.derive(h.c);assert.equal(d.features.some(feature=>feature.name==='Unregistered restricted craft'),true);assert.equal(d.effects.hpFlat,2);
 h.c.abilities.wis=12;d=h.rules.derive(h.c);assert.equal(d.features.some(feature=>feature.name==='Unregistered restricted craft'),false);
});

test('new constant proficiencies are granted and removed without parsing their prose',()=>{
 const h=setup({background:['Unregistered origin',{choices:[],proficiencies:{armor:['light armor'],tools:['Unregistered tools'],languages:['Unregistered language']}}]});let d=h.rules.derive(h.c);assert.match(d.proficiencies.tools,/Unregistered tools/);assert.match(d.proficiencies.armor,/light armor/);assert.match(d.proficiencies.languages,/Unregistered language/);
 h.c.build.backgroundId='';d=h.rules.derive(h.c);assert.doesNotMatch(d.proficiencies.tools || '',/Unregistered tools/);
});

test('multiple copies of a repeatable feat from one grant retain separate answers and tier requirements',()=>{
 const rule={repeatLimit:3,repeatRequirements:['Wisdom 10','Wisdom 12','Wisdom 14'],choices:[{key:'ability',label:'Ability',type:'ability',abilities:['str','dex'],count:1}],effects:[{target:'abilities',choice:'ability',amount:1}]};
 const h=setup({feats:[['Unregistered repeatable craft',rule],['Unused fixture A',{choices:[]}],['Unused fixture B',{choices:[]}]]});h.c.abilities.wis=12;
 let d=h.rules.derive(h.c),group=d.choices.find(group=>group.kind==='feat'),id=identity('feats','Unregistered repeatable craft');h.c.build.choices[group.id]=[id,id,id];d=h.rules.derive(h.c);const copies=d.features.filter(source=>source.name==='Unregistered repeatable craft');assert.equal(copies.length,2);assert.equal(new Set(copies.map(source=>source.id)).size,2);assert.match(d.choices.find(item=>item.id===group.id).options.find(item=>item.id===id).unavailableReason,/Wisdom 14/);
 h.decide(copies[0],'ability','str');h.decide(copies[1],'ability','dex');d=h.rules.derive(h.c);assert.equal(d.abilities.str,h.c.abilities.str+1);assert.equal(d.abilities.dex,h.c.abilities.dex+1);
 h.c.build.choices[group.id]=['',id,''];d=h.rules.derive(h.c);assert.equal(d.features.find(source=>source.name==='Unregistered repeatable craft').id,copies[1].id);assert.equal(d.abilities.str,h.c.abilities.str);assert.equal(d.abilities.dex,h.c.abilities.dex+1);
});

test('feat grants nested beyond eight levels resolve without increasing the legacy iteration budget',()=>{
 const feats=Array.from({length:12},(_,index)=>['Unregistered chain feat '+index,{choices:[],effects:[{add:{restDice:1}}],featGrants:index<11?[{key:'next',count:1}]:[]}]);
 const h=setup({feats,background:['Unregistered chain origin',{choices:[],featGrants:[{key:'next',count:1}]}]});h.c.build.choices={};let parent=identity('backgrounds','Unregistered chain origin');
 for(let index=0;index<12;index++){const group=parent+':feat-grant:next:choices',id=identity('feats','Unregistered chain feat '+index);h.c.build.choices[group]=[id];parent=group+':'+id;}
 let d=h.rules.derive(h.c);assert.equal(d.features.filter(source=>source.parent==='Feat').length,12);assert.equal(d.restMaximum,15);assert.ok(!d.warnings.some(warning=>/stable result/.test(warning)));
 h.c.build.backgroundId='';d=h.rules.derive(h.c);assert.equal(d.features.filter(source=>source.parent==='Feat').length,0);assert.equal(d.restMaximum,3);
});

test('ability boosts in a new upgrade list participate in no-ability-increase feat restrictions',()=>{
 const h=setup();assert.equal(h.context.CharacterFeats.grantsAbility({name:'Unknown feat',automation:{choices:[{options:[{effects:{abilities:{wis:1}}}]}]}}),true);assert.equal(h.context.CharacterFeats.grantsAbility({name:'Unknown feat',automation:{choices:[{options:[{effects:{abilities:{wis:-1}}}]}]}}),false);
});
