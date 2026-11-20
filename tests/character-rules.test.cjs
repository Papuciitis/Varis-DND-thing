'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const enginePath = path.join(root, 'web/character-rules.js');

function setup() {
  assert.ok(fs.existsSync(enginePath), 'A rules engine must derive choices without permanently stacking bonuses');
  const context = vm.createContext({crypto: require('node:crypto').webcrypto});
  for (const name of ['character-state.js', 'character-effects.js', 'character-equipment.js', 'character-rules.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'web', name), 'utf8'), context);
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'site/index.html'), 'utf8').match(/globalThis\.DND_CATALOG=(.*?);(?=\s*globalThis\.DND_RULES_VERSION=)/s)[1]);
  const metadata = {
    races: [{id:'dwarf',name:'Dwarf',speed:25,size:'medium',abilityBonuses:{con:2},abilityChoices:[],traits:[{id:'hearty',name:'Test hearty trait',level:1,details:'',choices:[]}],proficiencies:[]},
      {id:'human',name:'Human',speed:30,size:'medium',abilityBonuses:{},abilityChoices:[{id:'human-score',count:1,amount:2,options:['str','dex'],repeat:false,label:'Ability bonus',alternatives:[{count:2,amount:1,options:['str','dex'],repeat:false,label:'Two scores'}]}],traits:[],proficiencies:[]}],
    classes:[{id:'fighter',name:'Fighter',hitDie:'d10',saves:['str','dex'],proficiencies:{weapons:'simple weapons',armor:'all armor, all shields',tools:''},skillChoice:{count:2,options:['Athletics','Perception']},castingAbilities:[],archetypeLevels:[4,7,10],features:[{id:'f1',name:'First feature',level:1,details:'',choices:[]},{id:'f4',name:'Later feature',level:4,details:'',choices:[]}]}],
    archetypes:[{id:'arch',name:'Veteran',className:'Fighter',minLevel:4,features:[{id:'a4',name:'Veteran feature',level:4,details:'',choices:[]}]},{id:'wrong',name:'Wrong class',className:'Wizard',minLevel:1,features:[]}],
  };
  const rules = context.CharacterRules.create(metadata, catalog);
  return {State:context.CharacterState,rules,context};
}
const plain = value => JSON.parse(JSON.stringify(value));

test('race and class values are derived, reversible and do not alter base scores or manual saves',()=>{
  const {State,rules}=setup();
  let c=rules.enable(State.normalizeCharacter({abilities:{str:14,dex:16,con:12},training:{saves:{wis:true}}}));
  c.build.raceId='dwarf';c.build.classId='fighter';c.build.skills=['Athletics','Perception'];
  let d=rules.derive(c);
  assert.equal(d.abilities.con,14);assert.equal(c.abilities.con,12);
  assert.equal(d.speed,25);assert.equal(d.saves.str,true);assert.equal(d.saves.wis,true);
  assert.equal(d.skillRanks.Athletics,1);
  assert.deepEqual(plain(rules.derive(c)),plain(d),'rendering must not stack derived values');
  c.build.raceId='';c.build.classId='';d=rules.derive(c);
  assert.equal(d.abilities.con,12);assert.equal(d.saves.str,false);assert.equal(d.saves.wis,true);
});

test('ability allocation alternatives ignore duplicate, stale and illegal selections',()=>{
  const {State,rules}=setup();let c=rules.enable(State.createCharacter());c.build.raceId='human';
  c.build.abilityChoices['human-score']={mode:1,values:['str','dex']};
  assert.equal(rules.derive(c).abilities.str,11);assert.equal(rules.derive(c).abilities.dex,11);
  c.build.abilityChoices['human-score'].values=['str','str'];
  assert.equal(rules.derive(c).abilities.str,11,'a distinct-score choice cannot stack on one score');
  c.build.abilityChoices['human-score'].values=['con','dex'];
  assert.equal(rules.derive(c).abilities.con,10);
  c.build.raceId='dwarf';assert.equal(rules.derive(c).abilities.str,10,'old race choices must stop applying');
});

test('level and parent class gate archetype features without deleting stored selections',()=>{
  const {State,rules}=setup();const c=rules.enable(State.createCharacter());
  c.build.classId='fighter';c.build.archetypes=['arch','wrong'];
  assert.ok(!rules.derive(c).features.some(f=>f.id==='a4'));
  c.level=4;let d=rules.derive(c);assert.ok(d.features.some(f=>f.id==='a4'));assert.ok(d.features.some(f=>f.id==='f4'));
  c.level=1;assert.ok(!rules.derive(c).features.some(f=>f.id==='a4'));assert.equal(c.build.archetypes[0],'arch');
});

test('equipped armor and weapons use effective ancestry scores and disappear when unequipped',()=>{
  const {State,rules}=setup();const c=rules.enable(State.normalizeCharacter({abilities:{str:12,dex:16},inventory:[
    {id:'leather',name:'Leather armor',entryId:JSON.stringify(['items','Light armor','Leather armor']),equipped:true},
    {id:'dagger',name:'Dagger',entryId:JSON.stringify(['items','daggers & knives','Dagger']),equipped:true,weaponTraining:'proficient'},
  ]}));c.build.classId='fighter';
  const d=rules.derive(c);assert.equal(d.armorClass,16);assert.ok(d.attacks.length>0);
  c.inventory.forEach(i=>i.equipped=false);assert.equal(rules.derive(c).armorClass,13);assert.equal(rules.derive(c).attacks.length,0);
});

test('maximum changes preserve wounds and never replenish spent Block during reconciliation',()=>{
  const {State,rules}=setup();const c=rules.enable(State.normalizeCharacter({resources:{hp:{current:6,max:10},block:{current:0,max:3}},abilities:{dex:16}}));
  c.build.health.baseHP=20;const adjusted=rules.reconcile(c);
  assert.equal(adjusted.resources.hp.max,20);assert.equal(adjusted.resources.hp.current,16);
  assert.equal(adjusted.resources.block.current,0);
  assert.deepEqual(plain(rules.reconcile(adjusted)),plain(adjusted),'reconciliation must be idempotent');
});

test('explicit configured damage order spills across pools while manual targeting stays independent',()=>{
  const {State,rules}=setup();const c=rules.enable(State.normalizeCharacter({resources:{hp:{current:10,max:10},arcaneHealth:{current:4,max:4},tempHP:{current:3,max:3}}}));
  const manual=rules.damage(c,5,{pool:'hp'}).character;
  assert.equal(manual.resources.hp.current,5);assert.equal(manual.resources.tempHP.current,3);
  c.build.health.poolOrder=['tempHP','arcaneHealth','hp'];
  const result=rules.damage(c,9,{pool:'auto'});
  assert.equal(result.character.resources.tempHP.current,0);assert.equal(result.character.resources.arcaneHealth.current,0);assert.equal(result.character.resources.hp.current,8);
  assert.equal(c.resources.hp.current,10,'damage must not mutate the input');
});

test('rest applies only established Block and Fatigue recovery, with no invented HP restoration',()=>{
  const {State,rules}=setup();const c=rules.enable(State.normalizeCharacter({abilities:{dex:16,con:14},resources:{hp:{current:3,max:10},block:{current:0,max:3}},restDice:{current:1,max:4}}));c.build.health.fatigue=5;
  let result=rules.rest(c,'short');assert.equal(result.resources.block.current,3);assert.equal(result.build.health.fatigue,3);assert.equal(result.resources.hp.current,3);assert.equal(result.restDice.current,1);
  result=rules.rest(result,'long');assert.equal(result.build.health.fatigue,0);
});

test('builder saves round-trip and malformed builder settings are rejected',()=>{
  const {State,rules}=setup();const c=rules.enable(State.createCharacter());c.build.raceId='human';
  assert.deepEqual(plain(State.importCharacter(State.exportCharacter(c))).build,plain(c).build);
  assert.throws(()=>State.normalizeCharacter({...plain(c),build:{...plain(c).build,archetypes:'wrong'}}));
  assert.throws(()=>State.normalizeCharacter({...plain(c),build:{...plain(c).build,health:{poolOrder:['hp','hp']}}}));
});

test('class HP uses maximum first die, later average or recorded rolls, and CON per level',()=>{
  const {State,rules}=setup();const c=rules.enable(State.normalizeCharacter({level:3,abilities:{con:14}}));c.build.classId='fighter';
  assert.equal(rules.derive(c).hpMaximum,28,'d10 +2, then 6+2 twice');
  c.build.health.hpMode='rolled';c.build.health.rolls=[4,9];assert.equal(rules.derive(c).hpMaximum,29);
  c.build.health.rolls=[null,9];assert.equal(rules.derive(c).hpMaximum,31,'unrecorded roll uses a visible average until recorded');
  assert.ok(rules.derive(c).warnings.some(w=>w.includes('level 2 HP roll')));
  c.build.health.hpMode='manual';c.build.health.baseHP=19;assert.equal(rules.derive(c).hpMaximum,19);
});

test('automatic damage uses the confirmed Arcane Health then Temp HP then HP order',()=>{
  const {State,rules}=setup();const c=rules.enable(State.normalizeCharacter({resources:{hp:{current:10,max:10},arcaneHealth:{current:4,max:4},tempHP:{current:3,max:3}}}));
  const result=rules.damage(c,5,{pool:'auto'});
  assert.equal(result.character.resources.arcaneHealth.current,0);assert.equal(result.character.resources.tempHP.current,2);assert.equal(result.character.resources.hp.current,10);
});

test('each unlocked ability score improvement creates a selectable reversible allocation',()=>{
  const {State,rules}=setup();rules.metadata.classes[0].features.push({id:'asi2',name:'Ability score improvement',level:2,details:'Increase one score by 2, or two by 1. Alternatively gain a feat.',choices:[]});
  const c=rules.enable(State.normalizeCharacter({level:2}));c.build.classId='fighter';
  let d=rules.derive(c);const choice=d.choices.find(g=>g.featureName==='Ability score improvement');assert.ok(choice,'ASI needs an actual choice in the builder');
  const strength=choice.options.find(o=>o.name==='+2 Strength');assert.ok(strength);
  c.build.choices[choice.id]=[strength.id];assert.equal(rules.derive(c).abilities.str,12);
  c.level=1;assert.equal(rules.derive(c).abilities.str,10);
});

test('Fatigue roll penalties use the source dice and flag undefined levels',()=>{
  const {State,rules}=setup();const c=rules.enable(State.createCharacter());
  c.build.health.fatigue=1;assert.equal(rules.fatiguePenalty(c,()=>99).amount,1);
  c.build.health.fatigue=5;assert.equal(rules.fatiguePenalty(c,sides=>sides).amount,6);
  c.build.health.fatigue=6;assert.equal(rules.fatiguePenalty(c,()=>1).unresolved,true);
});

test('ancestry armor training, expertise and named skill lists reach derived values',()=>{
  const {State,rules}=setup();const race=rules.metadata.races[0];race.proficiencies=['light armor','light shields','expertise with 1 skill of choice'];
  const c=rules.enable(State.normalizeCharacter({abilities:{str:14},inventory:[{id:'shield',name:'Buckler',entryId:JSON.stringify(['items','Light shields','Buckler']),equipped:true}]}));c.build.raceId='dwarf';c.build.raceSkills=['Athletics'];
  let d=rules.derive(c);assert.equal(d.gear.blockProficient,true);assert.equal(d.gear.attacks[0].bonus,4);assert.equal(d.skillRanks.Athletics,2);
  race.proficiencies=['1 of athletics, survival, intimidation, religion, or deception.'];
  d=rules.derive(c);assert.equal(d.raceSkillCount,1);assert.ok(d.raceSkillOptions.includes('Athletics'));assert.ok(!d.raceSkillOptions.includes('Perception'));assert.equal(d.skillRanks.Athletics,1);
});

test('ending combat expires armor Block only once and starting again cannot refill an active combat',()=>{
  const {State,rules}=setup();const c=rules.enable(State.normalizeCharacter({abilities:{dex:16,str:14},inventory:[{id:'shirt',name:'Chain shirt',entryId:JSON.stringify(['items','Medium armor','Chain shirt']),equipped:true}]}));
  let active=rules.startCombat(c);active.resources.block.current=3;
  let ended=rules.endCombat(active);assert.equal(ended.resources.block.current,2);assert.equal(rules.endCombat(ended).resources.block.current,2);
  active=rules.startCombat(ended);active.resources.block.current=0;assert.equal(rules.startCombat(active).resources.block.current,0);
});
