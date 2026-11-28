'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const catalog = require('./helpers/catalog.cjs')();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'site/data/catalog-manifest.json'), 'utf8'));
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'site', manifest.builder), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));

function setup(className = 'Fighter', raceName = '', level = 1) {
  const context = vm.createContext({crypto: require('node:crypto').webcrypto});
  for (const name of ['magic-items', 'character-state', 'character-effects', 'character-equipment',
    'character-casting', 'character-prerequisites', 'character-feats', 'character-rules', 'character-builder']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'web', name + '.js'), 'utf8'), context);
  }
  const State = context.CharacterState, Equipment = context.CharacterEquipment;
  const rules = context.CharacterRules.create(metadata, catalog);
  const c = rules.enable(State.normalizeCharacter({level, abilities: {str: 14, dex: 16}}));
  c.build.classId = metadata.classes.find(item => item.name === className).id;
  c.build.raceId = metadata.races.find(item => item.name === raceName)?.id || '';
  const own = name => {
    const entry = catalog.find(section => section.key === 'items').entries.find(item => item.name === name);
    assert.ok(entry, name);
    c.inventory.push({id: name, name, quantity: 1, equipped: false,
      entryId: JSON.stringify(['items', entry.group, entry.name])});
    return c.inventory.length - 1;
  };
  const pick = (feature, option) => {
    const group = rules.derive(c).choices.find(group => group.featureName === feature);
    assert.ok(group, feature);
    const item = group.options.find(item => item.name === option);
    assert.ok(item, option);
    (c.build.choices[group.id] ||= []).push(item.id);
    assert.ok(rules.derive(c).choices.find(item => item.id === group.id).selected.includes(item.id), option + ' activates');
  };
  const feat = name => {
    const group = rules.derive(c).choices.find(group => group.kind === 'feat');
    const item = group.options.find(item => item.name === name);
    assert.ok(item, name);
    c.build.choices[group.id] = [item.id];
  };
  const equip = (index, on = true) => Object.assign(c, Equipment.equip(c, index, on, catalog));
  return {context, State, Equipment, rules, c, own, pick, feat, equip};
}

test('light shields activate Shield-brother AC and advanced Shield proficiency Block checks', () => {
  for (const feat of ['Shield-brother', 'Shield proficiency']) {
    const h = setup('Fighter', 'Human');
    const index = h.own('Round shield');
    h.equip(index);
    const before = h.rules.derive(h.c);
    assert.equal(before.gear.shieldBlock, 0);
    h.feat(feat);
    const after = h.rules.derive(h.c);
    assert.equal(after.armorClass, before.armorClass + (feat === 'Shield-brother' ? 1 : 0));
    assert.equal(after.blockCheck, before.blockCheck + (feat === 'Shield proficiency' ? 2 : 0));
    h.equip(index, false);
    const unshielded = h.rules.derive(h.c);
    assert.equal(unshielded.armorClass, 13);
    assert.equal(unshielded.blockCheck, 3);
  }
});

test('plated leather breastplate explains why low Strength can make AC worse than unarmored', () => {
  const h = setup();
  h.c.abilities.str = 10;
  h.c.abilities.dex = 14;
  const before = h.rules.derive(h.c);
  assert.equal(before.armorClass, 12);
  const index = h.own('Plated leather breastplate');
  h.equip(index);
  let d = h.rules.derive(h.c), summary = h.Equipment.defenseSummary(d);
  assert.equal(d.armorClass, 11);
  assert.deepEqual(plain(summary.ac), [
    {label: 'Plated leather breastplate', amount: 14},
    {label: 'Dexterity after Bulk 3', amount: 0},
    {label: 'Bulk exceeds Strength modifier', amount: -3}
  ]);
  assert.match(summary.penalty, /Bulk 3.*removes 2 Dexterity AC.*Strength modifier \+0.*-3 AC/);
  h.c.abilities.str = 16;
  d = h.rules.derive(h.c);
  summary = h.Equipment.defenseSummary(d);
  assert.equal(d.armorClass, 14);
  assert.match(summary.penalty, /Strength covers the Bulk penalty/);
  h.equip(index, false);
  assert.equal(h.Equipment.defenseSummary(h.rules.derive(h.c)).penalty, '');
});

test('Versatile shields retain AC but cannot Bash alongside a two-handed Versatile weapon', () => {
  const h = setup(), shield = h.own('Buckler'), weapon = h.own('Dirk');
  h.equip(shield);
  h.equip(weapon);
  const before = h.rules.derive(h.c);
  assert.ok(before.attacks.some(attack => /Buckler bash/.test(attack.name)));
  h.c.inventory[weapon].twoHanded = true;
  const after = h.rules.derive(h.c);
  assert.equal(after.armorClass, before.armorClass);
  assert.ok(!after.attacks.some(attack => /Buckler bash/.test(attack.name)));
  assert.ok(after.warnings.some(note => /cannot Bash while sharing a two-handed grip/.test(note)));
});

test('Fighter armor upgrades follow the worn armor and Bulk/Slow reductions', () => {
  const h = setup('Fighter', '', 6);
  h.c.abilities.str = 10;
  for (const name of ['Armor training', 'Heavy armor training', 'Weight shifting', 'Armored sprint']) h.pick('Fighting skills', name);
  assert.equal(h.rules.derive(h.c).armorClass, 13, 'armor training is inactive without armor');
  const light = h.own('Leather armor'), medium = h.own('Chain shirt');
  h.equip(light);
  let d = h.rules.derive(h.c);
  assert.equal(d.armorClass, 17);
  assert.equal(d.gear.armorBlock, 0);
  h.equip(medium);
  d = h.rules.derive(h.c);
  assert.equal(h.c.inventory[light].equipped, false);
  assert.equal(d.armorClass, 17);
  assert.equal(d.gear.bulk, 0);
  assert.equal(d.gear.speedPenalty, 0);
  assert.equal(d.gear.armorBlock, 2);
  assert.equal(d.combatFloor, 2);
  h.c.inventory[medium].quantity = 0;
  d = h.rules.derive(h.c);
  assert.equal(d.armorClass, 13);
  assert.equal(d.combatFloor, 0);
});

test('self defense switches between unarmed bonuses and armed combat Block', () => {
  const h = setup();
  h.pick('Fighting skills', 'Survival training');
  h.pick('Fighting skills', 'Self defense training');
  let d = h.rules.derive(h.c);
  assert.equal(d.armorClass, 14);
  assert.equal(d.gear.blockCheckBonus, 1);
  assert.equal(d.gear.combatBlockBonus, 0);
  const index = h.own('Round shield');
  h.equip(index);
  d = h.rules.derive(h.c);
  assert.equal(d.armorClass, 15);
  assert.equal(d.gear.blockCheckBonus, 0);
  assert.equal(d.gear.combatBlockBonus, 1);
  h.equip(index, false);
  assert.equal(h.rules.derive(h.c).armorClass, 14);
});

test('Bulwark adds shield AC and physical save bonuses only while wielding a shield', () => {
  const h = setup('Fighter', '', 4), before = h.rules.derive(h.c);
  h.c.build.archetypes = [metadata.archetypes.find(item => item.name === 'Shield bearer').id];
  let d = h.rules.derive(h.c);
  assert.equal(d.armorClass, before.armorClass);
  assert.equal(d.saveBonuses.str, before.saveBonuses.str);
  assert.equal(d.combatFloor, before.combatFloor + 1);
  const index = h.own('Round shield');
  h.equip(index);
  d = h.rules.derive(h.c);
  assert.equal(d.armorClass, before.armorClass + 3);
  assert.equal(d.saveBonuses.str, (before.saveBonuses.str || 0) + 1);
  assert.equal(d.saveBonuses.dex, (before.saveBonuses.dex || 0) + 1);
  h.equip(index, false);
  assert.equal(h.rules.derive(h.c).saveBonuses.dex, before.saveBonuses.dex);
});

test('Bard Martial skill combat Block follows the light-or-no-armor requirement', () => {
  const h = setup('Bard', '', 2);
  h.pick('Bardic traits', 'Martial skill');
  assert.equal(h.rules.derive(h.c).gear.combatBlockBonus, 1);
  const light = h.own('Leather armor'), medium = h.own('Chain shirt');
  h.equip(light);
  assert.equal(h.rules.derive(h.c).gear.combatBlockBonus, 1);
  h.equip(medium);
  assert.equal(h.rules.derive(h.c).gear.combatBlockBonus, 0);
});

test('Ironbeard and Heavy hauling use armor presence rather than armor Block', () => {
  const h = setup('Fighter', 'Dwarf');
  h.pick('Dwarven traits', 'Ironbeard');
  h.pick('Dwarven traits', 'Heavy hauling');
  const noArmor = h.rules.derive(h.c);
  const leather = h.own('Leather armor'), plate = h.own('Plated armor suit');
  h.equip(leather);
  const light = h.rules.derive(h.c);
  assert.equal(light.armorClass, noArmor.armorClass + 4);
  assert.equal(light.gear.armorBlock, 0);
  assert.equal(light.gear.blockCheckBonus, 1);
  h.equip(plate);
  const heavy = h.rules.derive(h.c);
  assert.equal(heavy.gear.bulk, 8);
  assert.equal(heavy.gear.speedPenalty, 0);
  h.equip(plate, false);
  assert.equal(h.rules.derive(h.c).gear.blockCheckBonus, 0);
});

test('Dwarven sturdiness requires both armor and a remaining rest die', () => {
  const h = setup('Fighter', 'Dwarf');
  h.pick('Dwarven traits', 'Dwarven sturdiness');
  h.c.restDice = {max: 2, current: 1, die: 'd10'};
  assert.equal(h.rules.derive(h.c).gear.armorBlock, 0);
  const index = h.own('Leather armor');
  h.equip(index);
  assert.equal(h.rules.derive(h.c).gear.armorBlock, 1);
  h.c.restDice.current = 0;
  assert.equal(h.rules.derive(h.c).gear.armorBlock, 0);
});

test('Barbarian king scales at its levels and stops applying in medium armor', () => {
  const h = setup('Barbarian', '', 2);
  h.pick('Barbarian traits', 'Barbarian king');
  assert.equal(h.rules.derive(h.c).armorClass, 14);
  h.c.level = 5;
  assert.equal(h.rules.derive(h.c).armorClass, 15);
  h.c.level = 9;
  assert.equal(h.rules.derive(h.c).armorClass, 16);
  const leather = h.own('Leather armor'), chain = h.own('Chain shirt');
  h.equip(leather);
  assert.equal(h.rules.derive(h.c).armorClass, 19);
  h.equip(chain);
  assert.equal(h.rules.derive(h.c).armorClass, 15);
  h.equip(chain, false);
  h.c.level = 2;
  assert.equal(h.rules.derive(h.c).armorClass, 14);
});

test('unarmored Monk defence and movement stop and return when equipping armor', () => {
  const h = setup('Monk', '', 3);
  const baseline = h.rules.derive(h.c);
  h.pick('Monk training', 'Shifting step discipline');
  let d = h.rules.derive(h.c);
  assert.equal(d.armorClass, baseline.armorClass + 1);
  assert.equal(d.speed, baseline.speed + 10);
  const index = h.own('Leather armor');
  h.equip(index);
  d = h.rules.derive(h.c);
  assert.equal(d.armorClass, 16);
  assert.equal(d.gear.speedBonus, 0);
  h.equip(index, false);
  assert.equal(h.rules.derive(h.c).armorClass, baseline.armorClass + 1);
});

test('armor defenses survive normalization and serialization without refilling spent Block or healing', () => {
  const h = setup();
  const armor = h.own('Padded leather coat'), shield = h.own('Tower shield');
  h.equip(armor);
  h.equip(shield);
  let c = h.rules.reconcile(h.c);
  c.resources.hp.current -= 3;
  c.resources.block.current = 0;
  c = h.rules.reconcile(h.State.normalizeCharacter(JSON.parse(JSON.stringify(c))));
  const d = h.rules.derive(c), summary = h.Equipment.defenseSummary(d);
  assert.equal(d.armorClass, 15);
  assert.equal(c.resources.hp.max - c.resources.hp.current, 3);
  assert.equal(c.resources.block.current, 0);
  assert.equal(h.rules.startCombat(c).resources.block.current, 2);
  assert.equal(summary.ac.reduce((sum, part) => sum + part.amount, 0), d.armorClass);
  assert.ok(summary.notes.some(note => /Resistance: cold/.test(note)));
  assert.ok(summary.notes.some(note => /Damage reduction: physical 1/.test(note)));
  assert.ok(summary.notes.some(note => /Bolster:.*2 Temp Block/.test(note)));
  assert.equal(JSON.stringify(plain(h.rules.derive(c))), JSON.stringify(plain(h.rules.derive(c))), 'derivation never accumulates bonuses');
});

test('builder Add and equip updates the live defence preview and Review before saving', () => {
  const h = setup(), shows = [], finished = [];
  const builder = h.context.CharacterBuilder.create({rules: h.rules,
    show: (...args) => shows.push(args), onFinish: result => finished.push(result)});
  builder.start(h.c);
  builder.handleAction('builder-step', {dataset: {builderStep: 'Equipment'}});
  builder.handleChange({dataset: {builderItem: ''}, value: JSON.stringify(['items', 'Light armor', 'Leather armor'])});
  assert.match(shows.at(-1)[1], /Add and equip/);
  builder.handleAction('builder-add-equip', {});
  assert.match(shows.at(-1)[1], /Armor Class<\/span><strong>16<\/strong>/);
  assert.match(shows.at(-1)[1], /Leather armor \/ No shield/);
  assert.match(shows.at(-1)[1], /Leather armor equipped/);
  assert.equal(h.c.inventory.length, 0, 'equipment remains in the isolated draft');
  builder.handleChange({dataset: {builderGear: 'equipped', builderIndex: '0'}, checked: false, type: 'checkbox'});
  assert.match(shows.at(-1)[1], /Armor Class<\/span><strong>13<\/strong>/);
  builder.handleChange({dataset: {builderGear: 'equipped', builderIndex: '0'}, checked: true, type: 'checkbox'});
  builder.handleAction('builder-step', {dataset: {builderStep: 'Review'}});
  assert.match(shows.at(-1)[1], /Armor Class<\/span><p><strong>16<\/strong>/);
  builder.handleAction('builder-finish', {});
  assert.equal(h.rules.derive(finished[0]).armorClass, 16);
});

test('every catalog armor previews the character-specific AC calculation before adding it', () => {
  const h = setup(), shows = [];
  h.c.abilities.str = 10;
  h.c.abilities.dex = 14;
  const builder = h.context.CharacterBuilder.create({rules: h.rules,
    show: (...args) => shows.push(args), onFinish: () => {}});
  builder.start(h.c);
  builder.handleAction('builder-step', {dataset: {builderStep: 'Equipment'}});
  const armors = catalog.find(section => section.key === 'items').entries.filter(entry => entry.details['Base AC'] !== undefined);
  assert.ok(armors.length >= 22);
  for (const entry of armors) {
    builder.handleChange({dataset: {builderItem: ''}, value: JSON.stringify(['items', entry.group, entry.name])});
    const html = shows.at(-1)[1];
    assert.match(html, /aria-label="Defence if equipped"/, entry.name);
    assert.match(html, /If equipped: AC \d+/, entry.name);
    assert.ok(html.includes('Armor AC: ' + entry.details['Base AC'] + ' base'), entry.name);
    if (/Bulk [1-9]/i.test(entry.details.properties || '')) assert.match(html, /class="armor-penalty"/, entry.name);
    assert.ok(html.includes('Your equipment <strong>0</strong>'), 'preview must not add ' + entry.name);
  }
  assert.equal(h.c.inventory.length, 0);
});
