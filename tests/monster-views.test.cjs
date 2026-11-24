'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const copy=value=>JSON.parse(JSON.stringify(value));
function setup(){
  class Node{
    constructor(tag,className='',text=''){this.tag=tag;this.className=className||'';this.text=String(text??'');this.children=[];this.attributes={};this.events={};this.open=false;}
    append(...nodes){this.children.push(...nodes);}
    setAttribute(key,value){this.attributes[key]=String(value);}
    addEventListener(key,callback){this.events[key]=callback;}
    toggle(open){this.open=open;this.events.toggle?.();}
    get textContent(){return this.text+this.children.map(node=>node.textContent).join('');}
    all(tag){return this.children.flatMap(node=>[...(node.tag===tag?[node]:[]),...node.all(tag)]);}
    byClass(name){return this.children.flatMap(node=>[...(node.className.split(' ').includes(name)?[node]:[]),...node.byClass(name)]);}
  }
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'..','web','monster-views.js'),'utf8'),context);
  const helpers={el:(tag,className,text)=>new Node(tag,className,text),link(text,params,className){const link=new Node('a',className,text);link.href='#'+new URLSearchParams(params);return link;},entryRoute:(section,entry)=>({section:section.key,entry:entry.name,group:entry.group})};
  return{views:context.MonsterViews,helpers};
}
const entry=(details={})=>({name:'Steel wyrmling',group:'Dragons',source:'monsters/steel-dragons.yaml',details:{meta:'Medium dragon, lawful neutral',cr:'1/2',ac:'16 (natural armor)',hp:'30 (4d8 + 12)',block:'2 / +4',speed:'30 ft., fly 60 ft.',abilities:{str:'15',dex:'10',con:'16',int:'12',wis:'11',cha:'13'},...details}});

test('metadata normalizes sizes, hybrid types, fractions and structured edits without changing source',()=>{
  const{views}=setup(),source=entry({meta:'small humanoid fiend elemental',cr:'1 / 4'}),before=JSON.stringify(source),meta=views.metadata(source);
  assert.deepEqual(copy(meta.types),['elemental','fiend','humanoid']);assert.equal(meta.size,'Small');assert.equal(meta.challenge,.25);assert.equal(meta.summary,source.details.meta);
  const edited=views.metadata(entry({meta:'Medium humanoid, neutral',size:'Large',type:'Dragon',alignment:'lawful good'}));assert.equal(edited.summary,'Large Dragon, lawful good');assert.deepEqual(copy(edited.types),['dragon']);
  assert.equal(views.metadata(entry({meta:'Large beast, chaotic evil',alignment:'lawful good'})).summary,'Large beast, lawful good');
  assert.equal(views.metadata(entry({meta:'lage elemental, eldritch'})).size,'Large');assert.equal(JSON.stringify(source),before);
});

test('type and challenge filters intersect, include exact zero and fractions, and never invent unknown ratings',()=>{
  const{views}=setup(),beast=entry({meta:'Large Beast',cr:'0'}),unknown=entry({meta:'Humanoid',cr:''}),hybrid=entry({meta:'Humanoid/Beast',cr:'1/4'});
  assert.equal(views.matches(beast,{type:'beast',cr:'0'}),true);assert.equal(views.matches(beast,{type:'dragon',cr:'0'}),false);
  assert.equal(views.matches(hybrid,{type:'humanoid',cr:'0-1'}),true);assert.equal(views.matches(hybrid,{type:'beast',crMin:'1/8',crMax:'1/2'}),true);assert.equal(views.matches(hybrid,{cr:'1+'}),false);
  assert.equal(views.matches(unknown,{cr:'unknown'}),true);assert.equal(views.matches(unknown,{cr:'0-5'}),false);assert.equal(views.matches(hybrid,{cr:'unknown'}),false);
  assert.equal(views.challenge('⅛'),.125);assert.equal(views.challenge('¼'),.25);assert.equal(views.challenge('½'),.5);assert.equal(views.challenge('?'),null);assert.equal(views.challenge('4 (1,100 XP)'),4);assert.equal(views.challenge('1/0'),null);
  assert.deepEqual(copy(views.metadata(entry({type:'Object'})).types),['object']);
});

test('ability presentation calculates numeric scores and keeps modifier-only and variable sources truthful',()=>{
  const{views}=setup();assert.equal(views.ability(entry(),'str').text,'15 (+2)');assert.equal(views.ability(entry(),'dex').text,'10 (+0)');
  assert.equal(views.ability(entry({abilities:{str:'+4 modifier (score not recorded)'}}),'str').text,'— (+4)');
  assert.equal(views.ability(entry({abilities:{str:'12 + 1d6'}}),'str').text,'12 + 1d6 (varies)');assert.equal(views.ability(entry({abilities:{}}),'str').text,'—');
});

test('statblock renders six abilities, compact named traits, defenses, every extra mechanic, and collapsed source context',()=>{
  const{views,helpers}=setup(),source=entry({traits:[{name:'Keen Senses',description:'Advantage on Perception.'}],actions:[{name:'Bite',description:'Attack +4; 1d8 piercing.',block_dc:'12'}],immunities:'poison, disease',resistances:'cold',multiattack:'Two bites.',additional_rules:{maneuver:'Push 5 ft.'},block_rules:'Spend one Block.',description:'A secret dragon.',notes:['Campaign detail'],original_5e:{ac:17},source_ref:'Steel Dragons document',ability_score_status:'reconstructed',source_ability_scores:{note:'Preserved original modifiers'}}),before=JSON.stringify(source),block=views.statblock(source,helpers);
  assert.equal(block.className,'stat-block monster-parchment');assert.equal(block.byClass('monster-score').length,6);assert.equal(block.all('em')[0].textContent,'Keen Senses. ');
  const body=block.byClass('monster-stat-body')[0];assert.match(body.textContent,/Immunities poison, disease/);assert.match(body.textContent,/Resistances cold/);assert.match(body.textContent,/Two bites/);assert.match(body.textContent,/Push 5 ft/);assert.match(body.textContent,/Block dc 12/);
  assert.doesNotMatch(body.textContent,/A secret dragon|Spend one Block|Preserved original modifiers/);assert.equal(body.byClass('monster-score-status')[0].textContent,'Reconstructed scores');const notes=block.byClass('monster-stat-notes')[0];assert.match(notes.textContent,/A secret dragon/);assert.match(notes.textContent,/Spend one Block/);assert.match(notes.textContent,/Preserved original modifiers/);assert.equal(notes.children.every(child=>child.tag==='details'&&!child.open),true);
  assert.equal(JSON.stringify(source),before);
});

test('spell references preserve reader routes and nested current rules without flattening them into combat text',()=>{
  const{views,helpers}=setup(),block=views.statblock(entry({spell_references:[{name:'Dragon spark',group:'Arcane spells',source_spell:'Fire bolt',current_rule:{cost:'1 mana',effect:'Current spell effect.'}}]}),helpers);
  const link=block.all('a')[0],params=new URLSearchParams(link.href.slice(1));assert.equal(params.get('entry'),'Dragon spark');assert.equal(params.get('group'),'Arcane spells');assert.match(block.textContent,/Current spell effect/);assert.match(block.textContent,/replaces Fire bolt/);
  assert.doesNotMatch(block.byClass('monster-stat-body')[0].textContent,/Current spell effect/);
});

test('monster directories render lazy independent disclosures with safe summaries, routes, and editing tools',()=>{
  const{views,helpers}=setup(),rendered=[];helpers.renderDetails=(entry,body)=>{rendered.push(entry.name);body.append(helpers.el('p','',entry.name+' mechanics'));};helpers.editor=(section,entry)=>helpers.el('button','', 'Edit '+entry.name);
  const rows=[{section:{key:'monsters'},entry:entry()},{section:{key:'monsters'},entry:{...entry({cr:'4',meta:'Large beast'}),name:'Boar'}}],before=JSON.stringify(rows),list=views.expandableList(rows,helpers);
  assert.equal(rendered.length,0);assert.equal(list.children[0].children[0].tag,'summary');assert.equal(list.children[0].children[0].all('a').length,0);assert.match(list.children[0].children[0].textContent,/CR 1\/2/);
  list.children[0].toggle(true);list.children[1].toggle(true);assert.deepEqual(rendered,['Steel wyrmling','Boar']);assert.equal(list.children[0].open,true);assert.equal(list.children[1].open,true);list.children[0].toggle(false);list.children[0].toggle(true);assert.equal(rendered.length,2);
  const route=new URLSearchParams(list.children[0].all('a')[0].href.slice(1));assert.equal(route.get('entry'),'Steel wyrmling');assert.equal(list.children[0].all('button')[0].textContent,'Edit Steel wyrmling');
  const redrawn=views.expandableList(rows,helpers);assert.equal(redrawn.children.every(item=>item.open),true);assert.equal(rendered.length,4);assert.equal(JSON.stringify(rows),before);
});

test('monster names and literal mechanics remain text, including markup-looking source strings',()=>{
  const{views,helpers}=setup(),source={...entry({actions:[{name:'<Slash>',description:'<script>literal attack</script>'}]}),name:'<Dragon & kin>'},block=views.statblock(source,helpers);
  assert.match(block.textContent,/<Dragon & kin>/);assert.match(block.textContent,/<script>literal attack<\/script>/);assert.equal(block.all('script').length,0);
});

test('encounter objects omit inapplicable abilities while creatures and scored objects retain them',()=>{
  const{views,helpers}=setup();
  const portal=entry({meta:'Object, unaligned',type:'Object',abilities:{}});
  assert.equal(views.statblock(portal,helpers).byClass('monster-score-grid').length,0);
  assert.equal(views.statblock(entry({abilities:{}}),helpers).byClass('monster-score-grid').length,1);
  assert.equal(views.statblock(entry({type:'Object'}),helpers).byClass('monster-score-grid').length,1);
});

test('import cleanup unifies properties, removes duplicated summary and moves lore out of combat',()=>{
  const {views,helpers}=setup(),source=entry({properties:'Corpse eater: Restore 2d8 HP.|Chitinous: Reduce damage by 2d8.',additional_rules:'Senses darkvision 60 ft.\nLanguages Common\nChallenge 4 (1,100 XP)',height:'6 feet',weight:'500 pounds'}),before=JSON.stringify(source),block=views.statblock(source,helpers),body=block.byClass('monster-stat-body')[0];
  assert.equal(body.byClass('monster-stat-traits').length,1);assert.match(body.textContent,/Monster PropertiesCorpse eater/);assert.match(body.textContent,/Chitinous/);assert.doesNotMatch(body.textContent,/Additional rules|500 pounds|6 feet|\|/);assert.match(block.byClass('monster-stat-notes')[0].textContent,/500 pounds/);assert.equal(JSON.stringify(source),before);
});

test('multiattack is an action and imported spell replacements become linked compact use pools',()=>{
 const {views,helpers}=setup(),block=views.statblock(entry({multiattack:'The source permits repeated physical attacks: Claw (2x).',actions:[{name:'Claw (2x)',description:'Make two claw attacks as one Attack action, each +4 to hit.'},{name:'Burning Hands (4x)',description:'Existing Vara alternative: Cone of fire (Arcane spells).\n\nEnormous repeated spell text.'}],traits:[{name:'Control Flames',description:'Existing Vara alternative: minor pyromancy (Arcane cantrips).\n\nRepeated pyromancy.'},{name:'Fire Bolt',description:'Existing Vara alternative: minor pyromancy (Arcane cantrips).\n\nRepeated pyromancy.'}],spell_references:[{source_spell:'Burning Hands',name:'Cone of fire',group:'Arcane spells',level:'1'},{name:'minor pyromancy',group:'Arcane cantrips',level:'0'}]}),helpers),body=block.byClass('monster-stat-body')[0];
 assert.match(body.byClass('monster-stat-actions')[0].textContent,/ActionsMultiattack/);assert.doesNotMatch(body.textContent,/Enormous|Repeated pyromancy|Claw \(2x\)/);assert.match(body.textContent,/4 uses/);assert.equal(body.all('a').filter(node=>node.textContent==='minor pyromancy').length,1);assert.match(body.all('a').find(node=>node.textContent==='Cone of fire').href,/section=spells/);
});

test('golem infusion selections cap at four, calculate costs and bonuses, and never alter source stats',()=>{
 const {views,helpers}=setup(),options=[
  {name:'Lanthara Crystal',cost_gp:400,effect:'Armor Class +2.'},
  {name:'Holmara Rock',cost_gp:400,effect:'Melee attack and damage +2.'},
  {name:'Euralite Gem',cost_gp:150,effect:'Bright light.'},
  {name:'Samarkium Ore',cost_gp:250,effect:'Poison cloud.'},
  {name:'Erbion Essence',cost_gp:450,effect:'Touch healing.'}
 ],source=entry({ac:'16 (natural armor)',material_options:options,material_rules:'Up to four different materials.'}),before=JSON.stringify(source),block=views.statblock(source,helpers),section=block.byClass('monster-material-infusions')[0],inputs=section.all('input'),summary=()=>section.byClass('monster-infusion-configuration')[0].textContent;
 assert.equal(inputs.length,5);assert.match(summary(),/Base golem.*1,000 gp/);assert.doesNotMatch(summary(),/Poison cloud|Touch healing/);
 const links=section.all('a');assert.equal(links.length,5);const route=new URLSearchParams(links[0].href.slice(1));assert.equal(route.get('section'),'rules');assert.equal(route.get('entry'),'Lanthara Crystal');assert.equal(route.get('group'),'Tarta Homebrewery - Materials');
 const change=(index,checked)=>{inputs[index].checked=checked;inputs[index].events.change();};
 change(0,true);assert.match(summary(),/Configured Armor Class 18/);assert.doesNotMatch(summary(),/Melee attack and damage \+2/);
 change(1,true);assert.match(summary(),/melee attack rolls, Block DCs and damage \+2/);assert.match(summary(),/Creation materials: 1,000 gp/);
 change(2,true);assert.match(summary(),/Creation materials: 1,400 gp/);
 change(3,true);assert.match(summary(),/Creation materials: 3,600 gp/);assert.equal(inputs[4].disabled,true);
 change(4,true);assert.equal(inputs[4].checked,false);assert.doesNotMatch(summary(),/Touch healing/);
 change(0,false);assert.equal(inputs[4].disabled,false);assert.match(summary(),/Armor Class unchanged/);change(4,true);assert.match(summary(),/Touch healing/);assert.match(summary(),/Creation materials: 3,650 gp/);
 assert.equal(JSON.stringify(source),before);assert.match(block.byClass('monster-stat-lead')[0].textContent,/Armor Class 16/);assert.equal(block.byClass('monster-additional-rule').length,0);
});

test('summon creator links lead to the controlling spell or feature without implying self spellcasting',()=>{
 const {views,helpers}=setup(),block=views.statblock(entry({summoned_by:[{name:'Summon elemental',section:'spells',group:'Arcane spells'},{name:'Tarta creature options',section:'rules',group:'Tarta Homebrewery - Creature options'}]}),helpers),creation=block.byClass('monster-creation-links')[0];
 assert.equal(creation.tag,'details');assert.equal(creation.open,false);assert.equal(creation.all('a').length,2);const routes=creation.all('a').map(link=>new URLSearchParams(link.href.slice(1)));assert.equal(routes[0].get('section'),'spells');assert.equal(routes[1].get('section'),'rules');assert.equal(block.byClass('monster-stat-spellcasting').length,0);assert.equal(block.byClass('monster-additional-rule').length,0);
});
