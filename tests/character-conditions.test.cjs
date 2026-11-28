const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function setup(){
  const context={console,structuredClone};context.globalThis=context;vm.createContext(context);
  for(const file of ['character-conditions','character-state','character-effects','character-equipment','character-casting','character-prerequisites','character-feats','character-rules']){
    vm.runInContext(fs.readFileSync(path.join(root,'web',file+'.js'),'utf8'),context);
  }
  return {c:context.CharacterConditions,state:context.CharacterState,rules:context.CharacterRules.create({},[]),casting:context.CharacterCasting};
}
test('condition registry matches every published condition and keeps custom effects separate',()=>{
  const {c}=setup(),manifest=JSON.parse(fs.readFileSync(path.join(root,'site/data/catalog-manifest.json'),'utf8'));
  const section=manifest.sections.find(s=>s.key==='conditions'),entries=JSON.parse(fs.readFileSync(path.join(root,'site',section.url),'utf8')).entries;
  assert.equal(c.definitions.length,47);assert.equal(entries.length,47);
  for(const entry of entries)assert(c.lookup(entry.name),entry.name);
  assert.equal(c.lookup('Frozen'),null);
  assert.equal(c.status(['Frozen'],{speed:30}).speed,30);
  assert.equal(c.status([{id:'custom:frozen',name:'Frozen',blocksMovement:true,stacks:2}],{speed:30}).speed,0);
});
test('stacks merge into one row and only explicitly stacked mechanics scale',()=>{
  const {c}=setup(),rows=c.normalize(['Bleeding','Bleeding ×2','Hobbled ×3','Frostbite ×3']);
  assert.equal(rows.find(r=>r.id==='bleeding').stacks,3);
  const effects=c.status(rows,{speed:30,abilities:{dex:12},size:'Small'});
  assert.equal(effects.speed,15);
  assert(effects.notes.some(note=>note.includes('3d4 bleeding')));
  assert(effects.notes.some(note=>note.includes('DC 19')));
  assert.equal(c.status(['Frostbite ×3'],{speed:30}).speed,30);
});
test('conditions update character speed and proficiency without overwriting saved base resources',()=>{
  const {c,state,rules}=setup();let character=state.createCharacter();
  character.level=6;character.combat.speed=30;character.training.skills.Athletics=1;character.training.saves.str=true;
  const base=rules.derive(character),hp=character.resources.hp.max;
  character.conditions=['Snared','Madness'];const changed=rules.derive(character);
  assert.equal(changed.speed,0);assert.equal(changed.conditionBase.speed,30);assert.equal(changed.proficiency,0);
  const saveTotal=d=>state.abilityModifier(d.abilities.str)+(d.saves.str?d.proficiency:0)+d.saveBonuses.str;
  assert(saveTotal(changed)<saveTotal(base));assert.equal(rules.reconcile(character).resources.hp.max,hp);
  character.conditions=[];const restored=rules.derive(character);assert.equal(restored.speed,30);assert.equal(restored.proficiency,base.proficiency);
});
test('condition roll policies apply advantage, disadvantage, automatic failures and printed penalty dice',()=>{
  const {c}=setup();
  assert.equal(c.rollPolicy(['Weakened'],{kind:'attack'}).mode,'disadvantage');
  assert.equal(c.rollPolicy(['Off-balance','Clarity'],{kind:'block'}).mode,'normal');
  assert.equal(c.rollPolicy(['Clarity'],{kind:'save',ability:'wis'}).mode,'advantage');
  assert.equal(c.rollPolicy(['Stunned'],{kind:'save',ability:'dex'},{dex:14}).automaticFailure,true);
  assert.equal(c.rollPolicy(['Stunned'],{kind:'save',ability:'dex'},{dex:15}).mode,'disadvantage');
  assert.equal(c.rollPolicy(['Hypnotized'],{kind:'save',ability:'cha'}).automaticFailure,true);
  const penalties=c.rollPolicy(['Fatigue ×3','Shaken','Terrified','Chilled'],{kind:'skill',ability:'str'}).penalties;
  assert.deepEqual(Array.from(penalties,row=>row.sides),[3,12,4]);
  assert.equal(c.rollPolicy(['Fatigue ×6'],{kind:'attack'}).unresolvedFatigue,true);
});
test('known spell restrictions use action timing and the printed Intelligence threshold',()=>{
  const {c}=setup();
  assert(c.spellRestriction(['Dazed'],{casting_time:'1 bonus action'}));
  assert.equal(c.spellRestriction(['Dazed'],{casting_time:'1 action'}),'');
  assert(c.spellRestriction(['Confused'],{components:'V, S'},{int:9}));
  assert.equal(c.spellRestriction(['Confused'],{components:'V, S'},{int:10}),'');
  assert(c.spellRestriction(['Paralyzed'],{casting_time:'1 action'}));
  assert.equal(c.spellRestriction(['Ethereal'],{casting_time:'1 action'}),'');
});
test('character condition synchronization preserves private fields and custom mechanics through export',()=>{
  const {c,state}=setup(),original=state.createCharacter();original.notes='Private personal note';
  const updated=c.applyToCharacter(original,[{id:'bleeding',stacks:3},{id:'custom:ice binding',name:'Ice binding',stacks:1,blocksMovement:true,notes:'An explicit custom effect.'}]);
  const imported=state.importCharacter(state.exportCharacter(updated));
  assert.equal(imported.notes,original.notes);assert.equal(original.conditions.length,0);
  assert.equal(c.forCharacter(imported).find(row=>row.id==='bleeding').stacks,3);
  assert.equal(c.status(c.forCharacter(imported),{speed:30}).blocked,true);
});

test('incapacitated casting fails before it can spend a saved spell slot',()=>{
  const {state,rules,casting}=setup(),character=state.createCharacter();
  const entry={group:'Arcane 1',name:'Test ward',details:{lvl:1,casting_time:'1 action'}},row={id:'ward',entryId:casting.spellId(entry),prepared:true};
  character.spells.push(row);character.spellSlots=[{level:1,current:2,max:2}];
  const derived={abilities:character.abilities};
  assert.equal(casting.castSpell(character,derived,[{key:'spells',entries:[entry]}],row.id,'manual:1').character.spellSlots[0].current,1);
  character.conditions=['Paralyzed'];
  const before=JSON.stringify(character);
  assert.throws(()=>casting.castSpell(character,derived,[{key:'spells',entries:[entry]}],row.id,'manual:1'),/incapacitated/);
  assert.equal(JSON.stringify(character),before);
});

test('condition healing and typed damage use the published thresholds without stacking reductions',()=>{
  const {state,rules}=setup(),character=state.createCharacter();character.resources.hp={current:20,max:40};
  character.conditions=['Soaked x3'];
  assert.equal(rules.damage(character,10,{type:'fire'}).afterDefence,5);
  assert.equal(rules.damage(character,10,{type:'fire',half:true}).afterDefence,5);
  assert.equal(rules.damage(character,11,{type:'fire'}).afterDefence,11);
  character.conditions=['Ethereal'];assert.equal(rules.damage(character,10,{type:'slashing'}).afterDefence,0);
  assert.equal(rules.damage(character,10,{type:'cold'}).afterDefence,10);
  character.conditions=['Diseased x2'];assert.equal(rules.heal(character,9).resources.hp.current,24);
  assert.equal(character.resources.hp.current,20);
});

test('resting reconciles fatigue counts and the numeric tracker without losing other effects',()=>{
  const {state,rules,c}=setup();let character=state.createCharacter();character.conditions=['Fatigue x5','Snared'];character.abilities.con=14;
  character=rules.rest(character,'short');assert.equal(c.forCharacter(character).find(row=>row.id==='fatigue').stacks,3);
  assert(c.has(c.forCharacter(character),'snared'));
  character=rules.rest(character,'long');assert.equal(c.has(c.forCharacter(character),'fatigue'),false);
  assert(c.has(c.forCharacter(character),'snared'));
});
