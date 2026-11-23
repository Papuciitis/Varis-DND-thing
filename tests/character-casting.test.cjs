'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const browser = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'web/character-state.js'), 'utf8'), browser);
const modulePath = path.join(root, 'web/character-casting.js');
if (fs.existsSync(modulePath)) vm.runInContext(fs.readFileSync(modulePath, 'utf8'), browser);
const plain = value => JSON.parse(JSON.stringify(value));
const state = browser.CharacterState;
const casting = () => {
  assert.equal(typeof browser.CharacterCasting?.derive, 'function', 'casting module must be available');
  return browser.CharacterCasting;
};
const row = (level, counts, extra = {}) => ({level, slots: counts.map((max, index) => ({level: index + 1, max})), slotCount: null, cantrips: null, knownSpells: null, ...extra});
const leveled = (name, progression) => ({id: name.toLowerCase(), name, casting: {mode: 'leveled', tradition: name === 'Druid' ? 'mystic' : 'arcane', progression, recovery: [], warnings: []}});
// Printed table values, rather than a shared standard-5e progression.
const wizard = leveled('Wizard', [row(1, [1, 0, 0]), row(2, [2, 0, 0]), row(3, [2, 1, 0]), row(4, [3, 2, 0]), row(12, [5, 4, 4, 3, 3, 2])]);
wizard.casting.startingSpellbook = {base: 2, ability: 'int', spellLevel: 1, perAdditionalClassLevel: 1};
const sorcerer = leveled('Sorcerer', [row(1, [2, 0, 0], {knownSpells: 2}), row(3, [3, 2, 0], {knownSpells: 6}), row(4, [3, 3, 1], {knownSpells: 8}), row(12, [3, 3, 3, 3, 3, 3], {knownSpells: 24})]);
sorcerer.casting.pointResources = [{id: 'metamagic', name: 'Metamagic points', minLevel: 4, capacity: {ability: 'cha', proficiency: true}, recovery: [{name: 'Metamagic', details: 'Regain 1d4+1 spent MP each rest. All spent MP is regained every long rest.'}]}];
const druid = leveled('Druid', [row(1, [1, 0, 0], {cantrips: 2, knownSpells: 2}), row(3, [2, 1, 0], {cantrips: 2, knownSpells: 7}), row(6, [3, 3, 2], {cantrips: 3, knownSpells: 15})]);
druid.casting.recovery = [{name: 'Per-rest slot regain', details: 'Every rest, regain slots of a combined spell level equal to half your druid level, rounded up; choose the distribution.'}];
const occultist = {id: 'occultist', name: 'Occultist', casting: {mode: 'occult', tradition: 'occult', progression: [row(1, [], {slotCount: 2, knownSpells: 2, cantrips: 1}), row(3, [], {slotCount: 3, knownSpells: 4, cantrips: 1}), row(5, [], {slotCount: 4, knownSpells: 6, cantrips: 2})], slotLevelRule: {basis: 'characterLevel', divisor: 2, rounding: 'up'}, modifiers: [{optionId: 'reward-slots', resource: 'occultSlots', amount: 2}], recovery: [{name: 'Occult slots', details: 'Occult slots are restored every long rest.'}], warnings: []}};
const cleric = {id: 'cleric', name: 'Cleric', casting: {mode: 'full', tradition: 'oath', progression: [row(1, [], {slotCount: 2}), row(4, [], {slotCount: 3})], maxCastLevelRule: null, recovery: [{name: 'Spellcasting', details: 'You regain your slots at the end of a long rest.'}], warnings: ['The maximum level of a full cleric slot is unspecified.']}};
const bard = {id: 'bard', name: 'Bard', casting: {mode: 'rest-dice', tradition: 'any', progression: [row(1, [], {knownSpells: 2}), row(2, [], {knownSpells: 3}), row(4, [], {knownSpells: 4})], maxCastLevelRule: {basis: 'characterLevel', divisor: 2, rounding: 'up'}, recovery: [], warnings: []}};
function character(level = 1, fields = {}) {
  return state.normalizeCharacter({level, abilities: {int: 16, cha: 14}, build: {enabled: true}, ...fields});
}
function derive(c, cls = wizard, context = {}) {
  return casting().derive(c, cls, {abilities: c.abilities, proficiency: state.proficiencyBonus(c.level), ...context});
}
const slot = (derived, level) => derived.pools.find(pool => pool.kind === 'slot' && pool.level === level);

test('Wizard, Sorcerer and Druid capacities use their distinct printed level rows', () => {
  const c = character(3);
  assert.deepEqual(plain(derive(c, wizard).pools.map(p => [p.level, p.max, p.current])), [[1, 2, 2], [2, 1, 1]]);
  assert.deepEqual(plain(derive(c, sorcerer).pools.map(p => [p.level, p.max])), [[1, 3], [2, 2]]);
  assert.equal(derive(c, druid).knownSpells, 7);
  assert.equal(derive(c, druid).cantrips, 2);
});

test('new class capacities appear full while manual adoption requires an explicit opt in', () => {
  const fresh = derive(character());
  assert.equal(fresh.enabled, true);
  assert.equal(slot(fresh, 1).current, 1);
  const legacy = character(1, {spellSlots: [{level: 1, current: 1, max: 2}], customResources: [{id: 'old', name: 'Mana', current: 1, max: 3}]});
  const dormant = derive(legacy);
  assert.equal(dormant.enabled, false);
  assert.equal(dormant.needsMigration, true);
  legacy.build.casting = {enabled: true};
  assert.equal(derive(legacy).enabled, true);
});

test('adopted automatic class pools remain enabled when later manual extras are added', () => {
  let c = character(3);
  c = casting().reconcile(c, derive(c));
  c.spellSlots.push({level: 8, current: 1, max: 1});
  c.customResources.push({id: 'focus', name: 'Arcane focus', current: 2, max: 3});
  const d = derive(c);
  assert.equal(d.enabled, true);
  assert.equal(d.needsMigration, false);
  assert.equal(slot(d, 1).current, 2);
});

test('explicit activation imports matching manual level spending without deleting or mutating manual pools', () => {
  const c = character(3, {spellSlots: [{level: 1, current: 1, max: 3}, {level: 2, current: 0, max: 1}], customResources: [{id: 'mana', name: 'Mana', current: 1, max: 4}]});
  const before = JSON.stringify(c);
  assert.equal(typeof casting().activate, 'function');
  const activated = casting().activate(c, derive(c));
  assert.equal(activated.build.casting.enabled, true);
  assert.equal(slot(derive(activated), 1).current, 0, 'two used manual slots remain used against a capacity of two');
  assert.equal(slot(derive(activated), 2).current, 0);
  assert.deepEqual(plain(activated.spellSlots), plain(c.spellSlots));
  assert.deepEqual(plain(activated.customResources), plain(c.customResources));
  assert.equal(JSON.stringify(c), before);
});

test('re-activation preserves existing managed spending instead of reimporting an older manual row', () => {
  let c = character(3, {spellSlots: [{level: 1, current: 2, max: 2}]});
  c = casting().activate(c, derive(c));
  let d = derive(c);
  c = casting().change(c, d, slot(d, 1).id, -1);
  c.build.casting.enabled = false;
  c = casting().activate(c, derive(c));
  assert.equal(slot(derive(c), 1).current, 1);
  const other = derive(c, sorcerer);
  c = casting().activate(c, other);
  assert.equal(slot(derive(c), 1).current, 1, 'returning to Wizard preserves its separate spending');
});

test('activation imports unseen manual spending even when automatic mode was explicitly selected first', () => {
  const c = character(3, {build: {enabled: true, casting: {enabled: true}}, spellSlots: [{level: 1, current: 0, max: 2}]});
  const activated = casting().activate(c, derive(c));
  assert.equal(slot(derive(activated), 1).current, 0);
});

test('Occultist activation migrates a single matching-level row and flags ambiguous rows', () => {
  const c = character(3, {spellSlots: [{level: 2, current: 1, max: 3}]});
  const activated = casting().activate(c, derive(c, occultist));
  assert.equal(derive(activated, occultist).pools[0].current, 1);
  const ambiguous = character(3, {spellSlots: [{level: 1, current: 0, max: 2}, {level: 2, current: 1, max: 3}]});
  const pending = casting().activate(ambiguous, derive(ambiguous, occultist));
  assert.ok(derive(pending, occultist).warnings.some(w => /occult.*review|review.*occult/i.test(w)));
  assert.equal(Object.keys(pending.build.casting.spent).length, 0);
});

test('Cleric activation keeps aggregated manual allocation separate and explains the required review', () => {
  const c = character(4, {spellSlots: [{level: 2, current: 1, max: 3}]});
  const activated = casting().activate(c, derive(c, cleric));
  assert.ok(derive(activated, cleric).warnings.some(w => /cleric.*allocation|allocation.*cleric/i.test(w)));
  assert.deepEqual(plain(activated.spellSlots), plain(c.spellSlots));
  assert.deepEqual(plain(activated.build.casting.spent), {});
});

test('spending stays spent through repeated reconciliation and unrelated manual resources remain untouched', () => {
  const c = character(3, {build: {enabled: true, casting: {enabled: true}}, spellSlots: [{level: 8, current: 1, max: 2}], customResources: [{id: 'mana', name: 'Mana', current: 2, max: 5}]});
  const before = JSON.stringify(c);
  const d = derive(c);
  const spent = casting().spend(c, d, slot(d, 1).id, {});
  assert.equal(slot(derive(spent), 1).current, 1);
  const reconciled = casting().reconcile(spent, derive(spent));
  assert.equal(slot(derive(reconciled), 1).current, 1);
  assert.deepEqual(plain(casting().reconcile(reconciled, derive(reconciled))), plain(reconciled));
  assert.deepEqual(plain(reconciled.spellSlots), plain(c.spellSlots));
  assert.deepEqual(plain(reconciled.customResources), plain(c.customResources));
  assert.equal(JSON.stringify(c), before);
});

test('level decreases and class switches retain dormant spending without clearing the ledger', () => {
  let c = character(3), d = derive(c);
  c = casting().change(c, d, slot(d, 1).id, -2);
  c.level = 1;
  c = casting().reconcile(c, derive(c));
  assert.equal(slot(derive(c), 1).current, 0);
  const other = derive(c, sorcerer);
  assert.equal(slot(other, 1).current, 2);
  c = casting().reconcile(c, other);
  c.level = 3;
  assert.equal(slot(derive(c), 1).current, 0);
});

test('Occultist uses one count pool with the character-level slot level and selected reward capacity', () => {
  const c = character(5);
  const d = derive(c, occultist, {classLevel: 3, choices: [{selected: ['reward-slots']}]});
  assert.equal(d.pools.length, 1);
  assert.equal(d.pools[0].kind, 'occult');
  assert.equal(d.pools[0].level, 3);
  assert.equal(d.pools[0].max, 5); // Class-level 3 gives three slots, selected reward adds two.
  assert.equal(d.maxCastLevel, 3);
});

test('removing and reselecting a capacity choice never erases spending', () => {
  let c = character(3);
  const chosen = {choices: [{selected: ['reward-slots']}]};
  const d = derive(c, occultist, chosen);
  c = casting().change(c, d, d.pools[0].id, -4);
  assert.equal(derive(c, occultist).pools[0].current, 0);
  assert.equal(derive(c, occultist, chosen).pools[0].current, 1);
});

test('zero and positive recovery preserve dormant spending above a reduced capacity', () => {
  const chosen = {choices: [{selected: ['reward-slots']}]};
  let c = character(3), d = derive(c, occultist, chosen);
  c = casting().change(c, d, d.pools[0].id, -4);
  const reduced = derive(c, occultist);
  const unchanged = casting().change(c, reduced, reduced.pools[0].id, 0);
  assert.equal(derive(unchanged, occultist, chosen).pools[0].current, 1);
  const recovered = casting().change(c, reduced, reduced.pools[0].id, 1);
  assert.equal(derive(recovered, occultist, chosen).pools[0].current, 2, 'recovering one cannot restore two uses');
});

test('Cleric exposes its known count without inventing the missing maximum slot level', () => {
  const d = derive(character(4), cleric);
  assert.equal(d.pools.length, 3);
  assert.equal(d.maxCastLevel, null);
  assert.equal(d.pools[0].max, null);
  assert.equal(d.pools[0].current, null);
  assert.ok(d.warnings.some(w => /maximum|unspecified/i.test(w)));
  assert.throws(() => casting().spend(character(4), d, d.pools[0].id, {level: 1}), /level|configure/i);
});

test('Cleric slots each track remaining levels and whole-slot spending independently', () => {
  let c = character(4, {build: {enabled: true, casting: {maxSlotLevel: 3}}});
  let d = derive(c, cleric);
  c = casting().spend(c, d, d.pools[0].id, {level: 1});
  d = derive(c, cleric);
  assert.equal(d.pools[0].current, 2);
  assert.equal(d.pools[1].current, 3);
  c = casting().spend(c, d, d.pools[1].id, {level: 1, whole: true});
  d = derive(c, cleric);
  assert.equal(d.pools[1].current, 0);
  c.build.casting.maxSlotLevel = 5;
  assert.equal(derive(c, cleric).pools[1].current, 0, 'a consumed whole slot stays consumed when its level changes');
});

test('Bard derives rest-dice costs and casting spends existing rest dice rather than inventing slots', () => {
  const c = character(4, {restDice: {current: 4, max: 6, die: 'd6'}});
  const d = derive(c, bard);
  assert.equal(d.maxCastLevel, 2);
  assert.deepEqual(plain(d.costs), [{level: 1, resource: 'restDice', amount: 1}, {level: 2, resource: 'restDice', amount: 2}]);
  const after = casting().spend(c, d, d.pools[0].id, {level: 2});
  assert.equal(after.restDice.current, 2);
  assert.equal(c.restDice.current, 4);
  assert.equal(after.spellSlots.length, 0);
  assert.throws(() => casting().spend(c, d, d.pools[0].id, {level: 3}), /level/i);
});

test('Bard draft capacity uses the derived rest maximum without filling available rest dice', () => {
  const c = character(4, {restDice: {current: 2, max: 3, die: 'd6'}});
  const d = derive(c, bard, {restMaximum: 7});
  assert.equal(d.pools[0].max, 7);
  assert.equal(d.pools[0].current, 2);
  assert.equal(c.restDice.max, 3);
});

test('Sorcerer Metamagic appears at level four and uses effective Charisma plus proficiency', () => {
  assert.equal(derive(character(3), sorcerer).pools.some(p => p.kind === 'points'), false);
  const c = character(4);
  const d = derive(c, sorcerer, {abilities: {cha: 18}, proficiency: 3});
  const points = d.pools.find(p => p.kind === 'points');
  assert.equal(points.max, 7);
  const spent = casting().change(c, d, points.id, -3);
  assert.equal(derive(spent, sorcerer, {abilities: {cha: 18}, proficiency: 3}).pools.find(p => p.kind === 'points').current, 4);
});

test('known source long-rest recovery restores Occultist and Cleric but not unspecified slot systems', () => {
  for (const cls of [occultist, cleric]) {
    let c = character(3, {build: {enabled: true, casting: {maxSlotLevel: 2}}});
    const d = derive(c, cls);
    c = casting().spend(c, d, d.pools[0].id, {level: 1, whole: true});
    const short = casting().rest(c, derive(c, cls), 'short');
    assert.equal(derive(short, cls).pools[0].current, derive(c, cls).pools[0].current);
    const long = casting().rest(c, derive(c, cls), 'long');
    assert.equal(derive(long, cls).pools[0].current, derive(long, cls).pools[0].max);
  }
  for (const cls of [wizard, druid, sorcerer]) {
    let c = character(3), d = derive(c, cls);
    c = casting().spend(c, d, d.pools[0].id, {});
    const after = casting().rest(c, derive(c, cls), 'long');
    assert.equal(derive(after, cls).pools[0].current, derive(c, cls).pools[0].current);
  }
});

test('long rest restores modeled Metamagic while its rolled short-rest recovery remains explicit', () => {
  let c = character(4), d = derive(c, sorcerer);
  const id = d.pools.find(p => p.kind === 'points').id;
  c = casting().change(c, d, id, -2);
  assert.equal(derive(casting().rest(c, derive(c, sorcerer), 'short'), sorcerer).pools.find(p => p.kind === 'points').current, 3);
  assert.equal(derive(casting().rest(c, derive(c, sorcerer), 'long'), sorcerer).pools.find(p => p.kind === 'points').current, 5);
});

test('source-backed capacity adjustments affect active rows without clearing existing spending', () => {
  const d = derive(character(3), wizard, {effects: {eachSlotLevel: 1, slots: {'1': 2}}});
  assert.equal(slot(d, 1).max, 5);
  assert.equal(slot(d, 2).max, 2);
  assert.equal(d.maxCastLevel, 2, 'a capacity bonus must not unlock a spell level missing from the progression');
});

test('stable feature IDs gate per-level and individual-slot capacity modifiers', () => {
  const cls = {...wizard, casting: {...wizard.casting, modifiers: [
    {featureId: 'court-capacity', resource: 'eachSlotLevel', amount: 1},
    {featureId: 'raw-power', resource: 'slot', level: 1, amount: 1}
  ]}};
  assert.equal(slot(derive(character(3), cls), 1).max, 2);
  const active = derive(character(3), cls, {features: [{id: 'court-capacity'}, {id: 'raw-power'}]});
  assert.equal(slot(active, 1).max, 4);
  assert.equal(slot(active, 2).max, 2);
  const priest = {...cleric, casting: {...cleric.casting, modifiers: [{featureId: 'extra-full', resource: 'fullSlots', amount: 1}]}};
  assert.equal(derive(character(1), priest, {features: [{id: 'extra-full'}]}).pools.length, 3);
});

test('spending rechecks the live ledger even if a caller reuses its previous derived snapshot', () => {
  let c = character(), d = derive(c);
  c = casting().spend(c, d, d.pools[0].id, {});
  assert.throws(() => casting().spend(c, d, d.pools[0].id, {}), /available|enough/i);
});

test('changed level, class and feature selections reject an obsolete capacity snapshot', () => {
  for (const mutation of [c => {c.level = 1;}, c => {c.build.classId = 'fighter';}, c => {c.build.choices = {changed: ['other']};}]) {
    const c = character(3), d = derive(c);
    mutation(c);
    assert.throws(() => casting().spend(c, d, slot(d, 2).id, {}), /recalculate|changed|snapshot/i);
  }
});

test('inactive builders and unsupported classes keep ledgers dormant', () => {
  const c = character(3, {build: {enabled: false, casting: {spent: {'class:wizard:slot:1': 1}}}});
  assert.equal(derive(c).enabled, false);
  const d = derive(character(3), {id: 'fighter', name: 'Fighter'});
  assert.equal(d.enabled, false);
  assert.deepEqual(plain(d.pools), []);
});

test('capacity tables do not extrapolate beyond their supported levels', () => {
  const d = derive(character(20), wizard);
  assert.equal(slot(d, 6).max, 2);
  assert.ok(d.warnings.some(w => /12|supported|progression/i.test(w)));
  assert.equal(d.spellbookCount, 16, 'base two, INT three and eleven supported level-ups');
});

test('half-character-level casting rules stop at Vara level twelve instead of extrapolating level fifty slots', () => {
  for (const cls of [occultist, bard]) {
    const d = derive(character(100), cls);
    assert.equal(d.maxCastLevel, 6);
    assert.ok(d.warnings.some(w => /12|supported|progression/i.test(w)));
  }
});

test('spending validates active pools and available capacity without partial mutation', () => {
  const c = character(), d = derive(c), before = JSON.stringify(c);
  assert.throws(() => casting().change(c, d, d.pools[0].id, -2), /available|enough|exceed/i);
  assert.throws(() => casting().spend(c, d, 'missing', {}), /pool|resource/i);
  assert.throws(() => casting().change(c, d, d.pools[0].id, 0.5), /whole|integer/i);
  assert.equal(JSON.stringify(c), before);
});

const manifestPath = path.join(root, 'site/data/catalog-manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
const built = manifest ? JSON.parse(fs.readFileSync(path.join(root, 'site', manifest.builder), 'utf8')) : null;
test('built source metadata derives all six class systems and its stable casting modifiers', {skip: !built?.classes?.find(cls => cls.name === 'Wizard')?.casting}, () => {
  const find = name => built.classes.find(cls => cls.name === name);
  const c = character(3);
  assert.equal(slot(derive(c, find('Wizard')), 2).max, 1);
  assert.equal(slot(derive(c, find('Sorcerer')), 2).max, 2);
  assert.equal(derive(c, find('Druid')).knownSpells, 7);
  assert.equal(derive(c, find('Occultist')).pools[0].max, 3);
  assert.equal(derive(c, find('Cleric')).maxCastLevel, null);
  assert.equal(derive(c, find('Bard')).costs[1].amount, 2);
  const cls = find('Occultist'), reward = cls.casting.modifiers.find(mod => mod.resource === 'occultSlots');
  assert.ok(reward?.optionId);
  assert.equal(derive(c, cls, {choices: [{selected: [reward.optionId]}]}).pools[0].max, 5);
});
