'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));

function setup() {
  const file = path.join(root, 'web/character-builder.js');
  assert.ok(fs.existsSync(file), 'The character creator must provide a six-step draft wizard');
  const context = vm.createContext({crypto:require('node:crypto').webcrypto});
  for (const name of ['character-state.js','character-effects.js','character-equipment.js','character-rules.js','character-builder.js']) {
    vm.runInContext(fs.readFileSync(path.join(root,'web',name),'utf8'),context);
  }
  const metadata = {
    races:[{id:'race"<&',name:'Ancestry <script>',speed:25,size:'medium',description:'Ancestry prose',abilityBonuses:{con:2},abilityChoices:[{id:'allocation',count:1,amount:2,options:['str','dex'],repeat:false,label:'Choose an ability'}],traits:[{id:'trait',name:'Trait',level:1,details:'Readable trait',choices:[{id:'feature-choice',label:'Origin',count:1,options:[{id:'a',name:'Origin A',details:'Origin A rules'},{id:'b',name:'Origin B',details:'Origin B rules'}]}]}],proficiencies:['1 skill of choice']}],
    classes:[{id:'fighter',name:'Fighter',hitDie:'d10',description:'Fighter prose',saves:['str','dex'],proficiencies:{armor:'all armor',weapons:'simple weapons',tools:''},skillChoice:{count:1,options:['Athletics','Perception']},castingAbilities:[],archetypeLevels:[4,7],features:[]}],
    archetypes:[{id:'arch4',name:'Early archetype',className:'Fighter',minLevel:4,features:[]},{id:'arch7',name:'Later archetype',className:'Fighter',minLevel:7,features:[]}]
  };
  const catalog=[{key:'items',entries:[{name:'Dagger',group:'Light blades',details:{damage:'1d4',type:'simple',properties:'light, versatile'}}]}];
  const rules=context.CharacterRules.create(metadata,catalog),shows=[],finished=[],cancelled=[];
  const builder=context.CharacterBuilder.create({rules,show:(...args)=>shows.push(args),onFinish:(...args)=>finished.push(args),onCancel:()=>cancelled.push(true),renderRule:value=>'<p>'+String(value).replace(/</g,'&lt;')+'</p>'});
  return {builder,rules,State:context.CharacterState,shows,finished,cancelled,catalog};
}
const input=(builderPath,value,type='text')=>({dataset:{builderPath},value,type});

test('wizard edits an isolated draft, preserves typing focus and cancels without saving',()=>{
  const {builder,State,shows,finished,cancelled}=setup();const c=State.createCharacter(),before=plain(c);
  builder.start(c,true);assert.equal(builder.isOpen(),true);assert.match(shows.at(-1)[0],/1.*6|Ancestry/);
  const count=shows.length;
  assert.equal(builder.handleInput(input('name','New draft name')),true);
  assert.equal(shows.length,count,'Typing a name must not replace the dialog contents');
  assert.deepEqual(plain(c),before);
  assert.equal(builder.cancel(),true);assert.equal(builder.isOpen(),false);assert.equal(finished.length,0);assert.equal(cancelled.length,1);
  assert.equal(builder.handleInput(input('name','stale')),false);
});

test('six steps finish with the draft selection and preserve the original character',()=>{
  const {builder,State,shows,finished}=setup();const c=State.createCharacter();
  builder.start(c,true);builder.handleInput(input('name','Nori'));
  builder.handleChange(input('build.raceId','race"<&'));builder.handleChange(input('level','4','number'));
  builder.handleAction('builder-next',{});assert.match(shows.at(-1)[0],/Class/);
  builder.handleChange(input('build.classId','fighter'));builder.handleChange(input('build.archetypes.0','arch4'));
  builder.handleAction('builder-next',{});assert.match(shows.at(-1)[0],/Abilit/);
  builder.handleInput(input('abilities.str','16','number'));
  builder.handleChange({dataset:{builderAbility:'allocation',builderChoiceIndex:'0'},value:'dex'});
  builder.handleAction('builder-next',{});assert.match(shows.at(-1)[0],/Features/);
  builder.handleChange({dataset:{builderChoice:'feature-choice',builderChoiceIndex:'0'},value:'b'});
  builder.handleChange({dataset:{builderSkills:'skills',builderChoiceIndex:'0'},value:'Athletics'});
  builder.handleAction('builder-next',{});assert.match(shows.at(-1)[0],/Equipment/);
  builder.handleAction('builder-next',{});assert.match(shows.at(-1)[0],/Review/);
  assert.equal(builder.handleAction('builder-finish',{}),true);
  assert.equal(builder.isOpen(),false);assert.equal(finished.length,1);
  const [draft,isNew]=finished[0];assert.equal(isNew,true);assert.equal(draft.name,'Nori');assert.equal(draft.abilities.str,16);
  assert.equal(draft.build.classId,'fighter');assert.equal(draft.build.archetypes[0],'arch4');assert.equal(draft.build.choices['feature-choice'][0],'b');
  assert.equal(draft.build.abilityChoices.allocation.values[0],'dex');assert.equal(draft.build.skills[0],'Athletics');
  assert.equal(c.name,'');assert.equal(c.build,undefined);
});

test('wizard escapes catalog identities and labels and reports incomplete review choices',()=>{
  const {builder,State,shows}=setup();builder.start(State.createCharacter());
  assert.ok(shows.at(-1)[1].includes('Ancestry &lt;script&gt;'));assert.ok(!shows.at(-1)[1].includes('<script>'));
  assert.ok(shows.at(-1)[1].includes('race&quot;&lt;&amp;'));
  builder.handleAction('builder-step',{dataset:{builderStep:'5'}});
  assert.match(shows.at(-1)[1],/Choose an ancestry/);assert.match(shows.at(-1)[1],/Choose a class/);
  assert.doesNotMatch(shows.at(-1)[1],/All choices complete/);
  assert.equal(builder.handleAction('delete-character',{}),false);assert.equal(builder.handleChange({dataset:{path:'name'},value:'wrong'}),false);
});

test('equipment controls add, equip, configure and remove gear in the draft',()=>{
  const {builder,State,shows,finished,catalog}=setup();builder.start(State.createCharacter());
  builder.handleAction('builder-step',{dataset:{builderStep:'4'}});
  builder.handleChange({dataset:{builderItem:''},value:JSON.stringify(['items',catalog[0].entries[0].group,'Dagger'])});
  builder.handleAction('builder-add-item',{});assert.match(shows.at(-1)[1],/Dagger/);
  builder.handleChange({dataset:{builderGear:'equipped',builderIndex:'0'},checked:true,type:'checkbox'});
  builder.handleChange({dataset:{builderGear:'twoHanded',builderIndex:'0'},checked:true,type:'checkbox'});
  builder.handleChange({dataset:{builderGear:'weaponTraining',builderIndex:'0'},value:'proficient'});
  builder.handleAction('builder-step',{dataset:{builderStep:'5'}});builder.handleAction('builder-finish',{});
  const c=finished[0][0];assert.equal(c.inventory.length,1);assert.equal(c.inventory[0].equipped,true);assert.equal(c.inventory[0].twoHanded,true);assert.equal(c.inventory[0].weaponTraining,'proficient');
  builder.start(c);builder.handleAction('builder-step',{dataset:{builderStep:'4'}});builder.handleAction('builder-remove-item',{dataset:{builderIndex:'0'}});
  builder.handleAction('builder-step',{dataset:{builderStep:'5'}});builder.handleAction('builder-finish',{});assert.equal(finished[1][0].inventory.length,0);assert.equal(c.inventory.length,1);
});

test('recorded HP rolls survive wizard navigation and use the actual class die',()=>{
  const {builder,State,shows,finished}=setup();const c=State.createCharacter();c.level=3;
  builder.start(c);builder.handleChange(input('build.classId','fighter'));builder.handleAction('builder-step',{dataset:{builderStep:'5'}});
  builder.handleChange(input('build.health.hpMode','rolled'));
  assert.match(shows.at(-1)[1],/Level 2/);assert.match(shows.at(-1)[1],/max="10"/);
  builder.handleInput(input('build.health.rolls.0','7','number'));builder.handleInput(input('build.health.rolls.1','8','number'));
  builder.handleAction('builder-back',{});builder.handleAction('builder-next',{});builder.handleAction('builder-finish',{});
  assert.deepEqual(plain(finished[0][0].build.health.rolls),[7,8]);assert.equal(finished[0][0].resources.hp.max,25);
});

test('later archetype slots can be filled before earlier slots without sparse save arrays',()=>{
  const {builder,State,shows,finished}=setup();const c=State.createCharacter();c.level=7;
  builder.start(c);builder.handleChange(input('build.classId','fighter'));
  assert.doesNotThrow(()=>builder.handleChange(input('build.archetypes.1','arch7')));
  builder.handleAction('builder-step',{dataset:{builderStep:'5'}});builder.handleAction('builder-finish',{});
  assert.deepEqual(plain(finished[0][0].build.archetypes),['','arch7']);
});

test('HP rolls can be entered out of order or cleared without inventing recorded rolls',()=>{
  const {builder,State,shows,finished}=setup();const c=State.createCharacter();c.level=3;
  builder.start(c);builder.handleChange(input('build.classId','fighter'));
  builder.handleAction('builder-step',{dataset:{builderStep:'5'}});builder.handleChange(input('build.health.hpMode','rolled'));
  assert.doesNotThrow(()=>builder.handleChange(input('build.health.rolls.1','8','number')));
  assert.match(shows.at(-1)[1],/Record the level 2 HP roll/);
  builder.handleAction('builder-finish',{});assert.deepEqual(plain(finished[0][0].build.health.rolls),[null,8]);
  builder.start(finished[0][0]);builder.handleAction('builder-step',{dataset:{builderStep:'5'}});
  builder.handleChange(input('build.health.rolls.1','','number'));builder.handleAction('builder-finish',{});
  assert.deepEqual(plain(finished[1][0].build.health.rolls),[null,null]);
});

test('review calls out unfinished ancestry skill selections',()=>{
  const {builder,State,shows}=setup();builder.start(State.createCharacter());
  builder.handleChange(input('build.raceId','race"<&'));builder.handleAction('builder-step',{dataset:{builderStep:'5'}});
  assert.match(shows.at(-1)[1],/choose 1 ancestry skill/i);
});

test('feature step presents engine-generated ability score improvement selections',()=>{
  const {builder,rules,State,shows,finished}=setup();
  rules.metadata.classes[0].features.push({id:'asi2',name:'Ability score improvement',level:2,details:'Increase one score by 2, or two by 1. Alternatively gain a feat.',choices:[]});
  const c=rules.enable(State.createCharacter());c.level=2;c.build.classId='fighter';
  builder.start(c);builder.handleAction('builder-step',{dataset:{builderStep:'3'}});
  assert.match(shows.at(-1)[1],/\+2 Strength/);
  const choice=rules.derive(c).choices.find(group=>group.featureName==='Ability score improvement');
  const strength=choice.options.find(item=>item.name==='+2 Strength');
  builder.handleChange({dataset:{builderChoice:choice.id,builderChoiceIndex:'0'},value:strength.id});
  builder.handleAction('builder-step',{dataset:{builderStep:'5'}});builder.handleAction('builder-finish',{});
  assert.equal(rules.derive(finished[0][0]).abilities.str,12);
});
