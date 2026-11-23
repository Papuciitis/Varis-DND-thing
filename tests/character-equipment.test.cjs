'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const browser = vm.createContext({});
const modulePath = path.join(root, 'web', 'character-equipment.js');
if (fs.existsSync(modulePath)) vm.runInContext(fs.readFileSync(modulePath, 'utf8'), browser);
const plain = value => JSON.parse(JSON.stringify(value));

// Fixtures retain the compiled catalog's actual entry/details shapes and printed rules.
const item = (name, group, details, source = 'weapons.yaml') => ({name, group, details, source});
const dagger = item('Dagger', 'daggers & knives', {type: 'simple', group: 'daggers & knives', damage: '1d4p', properties: ['agile', 'light', 'throw 20/40', 'swift'], maneuvers: [{stab: 'Attack > If unshielded > crit range+.'}]});
const dirk = item('Dirk', 'daggers & knives', {type: 'simple', group: 'daggers & knives', damage: '1d4p', properties: ['balanced', 'light', 'swift', 'versatile 1d6'], maneuvers: [{lunge: 'Dash up. Attack with dice+'}]});
const bow = item('Hunting bow', 'simple bows', {type: 'simple', group: 'bows', damage: '1d6p', properties: ['range 80/160', 'two-handed', 'reload II'], maneuvers: []});
const crossbow = item('Hand crossbow', 'martial crossbows', {type: 'martial', group: 'crossbows', damage: '1d4p', properties: ['range 30/60', 'reload II', 'light', 'swift'], maneuvers: []});
const blowgun = item('blowgun', 'thrown & other', {type: 'simple', group: 'thrown & other', damage: '1d3p', properties: ['balanced', 'effort', 'two-handed', 'range 40/80', 'reload III', 'very-inaccurate'], maneuvers: []});
const longbow = item('Longbow', 'martial bows', {type: 'martial', group: 'bows', damage: '1d8p', properties: ['range 100/200', 'two-handed', 'overdraw'], maneuvers: []});
const polearm = item('Test polearm', 'polearms', {type: 'martial', group: 'polearms', damage: '1d10s', properties: ['reach II', 'DC++', 'two-handed'], maneuvers: [{cut: 'Attack with cleave > if strike > dmg +1d6.'}]});
const armorItem = (name, group, details) => item(name, group, details, 'draft-reference/armor-and-shields.yaml');
const leather = armorItem('Leather armor', 'Light armor', {'Base AC': '13'});
const plated = armorItem('Plated armor suit', 'Heavy armor', {'Base AC': '18', properties: 'Bulk 9, block 2, slow 4, physical reduction 2, protection 3.'});
const mountain = armorItem('Mountain-pattern armor suit', 'Heavy armor', {'Base AC': '18', properties: 'Bulk 10, block 3, slow 5, protection 3, slashing resistance, bludgeoning resistance.'});
const tower = armorItem('Tower shield', 'Heavy shields', {'AC bonus': '+3', properties: 'Block 1, bolster 2, bash 1d4.'});
const round = armorItem('Round shield', 'Light shields', {'AC bonus': '+2', properties: 'Bolster 1, brace 2, bash 1d6.'});
const catalog = [{key: 'items', title: 'Items', entries: [dagger, dirk, bow, crossbow, blowgun, longbow, polearm, leather, plated, mountain, tower, round]}];
const entryId = entry => JSON.stringify(['items', entry.group, entry.name]);
const carried = (entry, fields = {}) => ({id: entry.name, entryId: entryId(entry), name: entry.name, quantity: 1, equipped: true, ...fields});
const context = fields => ({abilities: {str: 16, dex: 14, con: 12, int: 10, wis: 10, cha: 10}, proficiency: 3, proficiencies: {weapons: 'Simple weapons, 4 martial weapon groups.', armor: 'Light armor, medium armor, heavy armor, light shields, heavy shields', tools: ''}, weaponGroups: [], raceSize: 'Medium', speed: 30, ...fields});
function derive(inventory = [], fields = {}, extra = {}) {
  assert.equal(typeof browser.CharacterEquipment?.derive, 'function', 'equipment derivation must be available');
  return plain(browser.CharacterEquipment.derive({inventory, attacks: [], ...extra}, catalog, context(fields)));
}

test('unarmored AC uses base ten and a nonnegative Dexterity contribution', () => {
  assert.equal(derive().armorClass, 12);
  assert.equal(derive([], {abilities: {str: 10, dex: 6}}).armorClass, 10);
});

test('Vara bulk reduces Dexterity and applies its separate Strength deficit before the shield bonus', () => {
  const result = derive([carried(plated), carried(tower)]);
  assert.equal(result.armorClass, 15); // 18 + max(0, 2-9) - max(0, 9-3) + 3.
  assert.equal(result.speedPenalty, 5); // Slow 4 - STR 3, in five-foot steps.
  assert.equal(result.armorBlock, 2);
  assert.equal(result.shieldBlock, 1);
  assert.equal(result.protection, 3);
  assert.equal(result.blockCheckAbility, 'str');
  assert.equal(result.blockProficient, true);
  assert.deepEqual(result.reductions, {physical: 2});
  assert.equal(result.armor.name, 'Plated armor suit');
  assert.equal(result.shield.name, 'Tower shield');
});

test('armor AC floors at eight and has no standard 5e category Dexterity cap', () => {
  assert.equal(derive([carried(plated), carried(tower)], {abilities: {str: 0, dex: 6}}).armorClass, 11);
  assert.equal(derive([carried(leather)], {abilities: {str: 10, dex: 22}}).armorClass, 19);
});

test('missing Bulk and Slow properties do not penalize a negative Strength modifier', () => {
  const weak = {abilities: {str: 6, dex: 12}};
  assert.equal(derive([], weak).speedPenalty, 0);
  const light = derive([carried(leather)], weak);
  assert.equal(light.armorClass, 14);
  assert.equal(light.speedPenalty, 0);
});

test('multiple equipped armor and shields select the strongest result without stacking properties', () => {
  const result = derive([carried(plated), carried(leather), carried(tower), carried(round)]);
  assert.equal(result.armorClass, 18); // Leather 13 + DEX 2, then Tower +3.
  assert.equal(result.armorBlock, 0);
  assert.equal(result.protection, 0);
  assert.equal(result.attacks.filter(attack => /bash/i.test(attack.name)).length, 1);
  assert.ok(result.warnings.some(note => /multiple.*armor/i.test(note)));
  assert.ok(result.warnings.some(note => /multiple.*shield/i.test(note)));
});

test('only equipped items with positive quantity generate attacks and defenses', () => {
  const result = derive([carried(dagger, {quantity: 0}), carried(plated, {equipped: false}), carried(tower, {quantity: 0})]);
  assert.equal(result.armorClass, 12);
  assert.equal(result.attacks.length, 0);
  assert.equal(result.armorBlock, 0);
});

test('Agile dagger derives trained attack, damage, block DC and a separate thrown attack', () => {
  const result = derive([carried(dagger, {magicBonus: 1})]);
  assert.equal(result.attacks.length, 2);
  const [melee, thrown] = result.attacks;
  assert.equal(melee.bonus, 6);
  assert.equal(melee.damage, '1d4p + 3');
  assert.equal(melee.blockDC, 14);
  assert.equal(melee.ability, 'dex');
  assert.equal(melee.trained, true);
  assert.equal(melee.inventoryId, 'Dagger');
  assert.equal(melee.entryId, entryId(dagger));
  assert.deepEqual(melee.maneuvers, dagger.details.maneuvers);
  assert.match(thrown.name, /thrown/i);
  assert.match(thrown.notes, /20\/40/);
  assert.match(thrown.notes, /no.*disadvantage.*melee/i);
});

test('Balanced auto chooses the better ability and two-handed Versatile preserves damage type', () => {
  const result = derive([carried(dirk, {twoHanded: true})]);
  assert.equal(result.attacks[0].ability, 'str');
  assert.equal(result.attacks[0].bonus, 6);
  assert.equal(result.attacks[0].damage, '1d6p + 3');
});

test('ranged weapons default to Dexterity and Effort adds Constitution to trained damage and DC', () => {
  const result = derive([carried(bow), carried(blowgun)]);
  assert.equal(result.attacks[0].ability, 'dex');
  assert.equal(result.attacks[0].bonus, 5);
  assert.equal(result.attacks[1].ability, 'str');
  assert.equal(result.attacks[1].bonus, 6);
  assert.equal(result.attacks[1].damage, '1d3p + 4');
  assert.equal(result.attacks[1].blockDC, 15);
});

test('optional weapon group grants are not treated as every martial proficiency', () => {
  const untrained = derive([carried(polearm, {magicBonus: 1})]);
  assert.equal(untrained.attacks[0].trained, false);
  assert.equal(untrained.attacks[0].bonus, 1);
  assert.equal(untrained.attacks[0].damage, '1d10s + 1');
  assert.equal(untrained.attacks[0].blockDC, 11); // 8 + magic 1 + listed DC++ 2.
  assert.deepEqual(untrained.attacks[0].maneuvers, polearm.details.maneuvers);
  assert.match(untrained.attacks[0].notes, /cannot use.*maneuver/i);
  const trained = derive([carried(polearm)], {weaponGroups: ['polearms']});
  assert.equal(trained.attacks[0].trained, true);
  assert.equal(trained.attacks[0].bonus, 6);
  assert.equal(trained.attacks[0].blockDC, 16);
  assert.match(trained.attacks[0].notes, /15 ft/);
});

test('weapon training overrides and specific weapon or underlying group proficiencies work', () => {
  assert.equal(derive([carried(polearm, {weaponTraining: 'proficient'})]).attacks[0].bonus, 6);
  assert.equal(derive([carried(dagger, {weaponTraining: 'untrained'})]).attacks[0].bonus, 0);
  assert.equal(derive([carried(polearm)], {proficiencies: {weapons: 'Test polearm', armor: '', tools: ''}}).attacks[0].trained, true);
  assert.equal(derive([carried(longbow)], {weaponGroups: ['bows']}).attacks[0].trained, true);
  assert.equal(derive([carried(longbow)], {proficiencies: {weapons: '1 of either simple bows or martial bows', armor: ''}}).attacks[0].trained, false);
});

test('named weapon plurals and combined armor category declarations resolve training', () => {
  const named = derive([carried(polearm)], {proficiencies: {weapons: 'Test polearms', armor: ''}});
  assert.equal(named.attacks[0].trained, true);
  const lightShield = derive([carried(round)], {proficiencies: {weapons: '', armor: 'Light and heavy shields'}});
  assert.equal(lightShield.blockProficient, true);
  const lightArmor = derive([carried(leather)], {proficiencies: {weapons: '', armor: 'Light and medium armor'}});
  assert.equal(lightArmor.blockProficient, true);
});

test('fixed all-family proficiencies cover underlying and simple or martial catalog groups', () => {
  const grant = {proficiencies: {weapons: '1 simple weapon group, all crossbows', armor: ''}};
  assert.equal(derive([carried(crossbow)], grant).attacks[0].trained, true);
  assert.equal(derive([carried(dagger)], grant).attacks[0].trained, false);
  assert.equal(derive([carried(bow)], {proficiencies: {weapons: 'all bows'}}).attacks[0].trained, true);
  assert.equal(derive([carried(crossbow)], {proficiencies: {weapons: 'Hand crossbows'}}).attacks[0].trained, true);
});

test('all thrown weapons grants Throw-property weapons and the printed thrown category only', () => {
  const grant = {proficiencies: {weapons: 'all thrown weapons', armor: ''}};
  assert.equal(derive([carried(dagger)], grant).attacks[0].trained, true);
  assert.equal(derive([carried(blowgun)], grant).attacks[0].trained, true);
  assert.equal(derive([carried(bow)], grant).attacks[0].trained, false);
});

test('numbered and alternative weapon-family choices remain ungranted', () => {
  const options = {proficiencies: {weapons: '2 crossbows, 1 thrown weapon group, 1 of either simple bows or martial bows', armor: ''}};
  for (const entry of [crossbow, dagger, blowgun, bow]) {
    assert.equal(derive([carried(entry)], options).attacks[0].trained, false, entry.name);
  }
});

test('off-hand weapons omit normal ability damage, preserve attack bonus, and warn unless Light', () => {
  const light = derive([carried(dagger, {offHand: true})]).attacks[0];
  assert.equal(light.bonus, 5);
  assert.equal(light.damage, '1d4p');
  const granted = derive([carried(dagger, {offHand: true})], {offHandAbilityDamage: true}).attacks[0];
  assert.equal(granted.damage, '1d4p + 2');
  const heavy = derive([carried(polearm, {offHand: true, weaponTraining: 'proficient'})]).attacks[0];
  assert.match(heavy.notes, /disadvantage/i);
});

test('Overdraw uses Strength damage with an ambiguity warning and allows explicit ability overrides', () => {
  const result = derive([carried(longbow, {weaponTraining: 'proficient'})]);
  assert.equal(result.attacks[0].ability, 'dex');
  assert.equal(result.attacks[0].damage, '1d8p + 3');
  assert.ok(result.warnings.some(note => /overdraw/i.test(note)));
  const explicit = derive([carried(longbow, {weaponTraining: 'proficient', attackAbility: 'wis', damageAbility: 'con'})], {abilities: {str: 16, dex: 14, con: 12, wis: 18}});
  assert.equal(explicit.attacks[0].bonus, 7);
  assert.equal(explicit.attacks[0].damage, '1d8p + 1');
});

test('selected armor resistance is exposed without inventing a damage application order', () => {
  const result = derive([carried(mountain)]);
  assert.deepEqual(result.resistances, ['slashing', 'bludgeoning']);
  assert.equal(result.armorBlock, 3);
});

test('shield bash uses shield proficiency and does not duplicate selected shields', () => {
  const trained = derive([carried(tower)]).attacks[0];
  assert.match(trained.name, /Tower shield.*bash/i);
  assert.equal(trained.bonus, 6);
  assert.equal(trained.damage, '1d4 + 3');
  const untrained = derive([carried(tower)], {proficiencies: {weapons: '', armor: '', tools: ''}});
  assert.equal(untrained.blockProficient, false);
  assert.equal(untrained.attacks[0].bonus, 0);
});

test('derive leaves source data and manual attacks intact and warns about unknown custom equipment', () => {
  const character = {inventory: [carried(dagger), {id: 'custom', name: 'Moon armor', equipped: true, quantity: 1}], attacks: [{id: 'manual', name: 'Custom attack', bonus: 99, damage: '1d100'}]};
  const before = JSON.stringify(character);
  const result = derive(character.inventory, {}, character);
  assert.equal(JSON.stringify(character), before);
  assert.equal(result.attacks.length, 2);
  assert.ok(result.warnings.some(note => /Moon armor/.test(note)));
});

test('equip replaces armor or shield only and returns a clone without changing weapons', () => {
  assert.equal(typeof browser.CharacterEquipment?.equip, 'function');
  const character = {inventory: [carried(plated), carried(leather, {equipped: false}), carried(tower), carried(round, {equipped: false}), carried(dagger)]};
  const before = JSON.stringify(character);
  const armored = plain(browser.CharacterEquipment.equip(character, 1, true));
  assert.deepEqual(armored.inventory.map(row => row.equipped), [false, true, true, false, true]);
  const shielded = plain(browser.CharacterEquipment.equip(armored, 3, true));
  assert.deepEqual(shielded.inventory.map(row => row.equipped), [false, true, false, true, true]);
  assert.equal(JSON.stringify(character), before);
  assert.equal(plain(browser.CharacterEquipment.equip(shielded, 4, false)).inventory[4].equipped, false);
});

test('equip uses CharacterState normalization when loaded with the browser state module', () => {
  const live = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'web', 'character-state.js'), 'utf8'), live);
  if (fs.existsSync(modulePath)) vm.runInContext(fs.readFileSync(modulePath, 'utf8'), live);
  assert.equal(typeof live.CharacterEquipment?.equip, 'function');
  const result = live.CharacterEquipment.equip({inventory: [carried(leather, {equipped: false})]}, 0, true);
  assert.equal(result.inventory[0].equipped, true);
  assert.equal(result.level, 1);
  assert.equal(result.abilities.str, 10);
});

test('equipping a zero-quantity item does not replace usable armor', () => {
  const character = {inventory: [carried(leather), carried(plated, {equipped: false, quantity: 0})]};
  const result = browser.CharacterEquipment.equip(character, 1, true);
  assert.deepEqual(plain(result.inventory.map(row => row.equipped)), [true, false]);
});

const builtCatalog = path.join(root, 'site', 'data', 'catalog-manifest.json');
test('built catalog smoke derives real armor, shield and weapon records', {skip: !fs.existsSync(builtCatalog)}, () => {
  assert.equal(typeof browser.CharacterEquipment?.derive, 'function');
  const real = require('./helpers/catalog.cjs')();
  const items = real.find(section => section.key === 'items').entries;
  const gear = ['Plated armor suit', 'Tower shield', 'Dagger'].map(name => carried(items.find(entry => entry.name === name)));
  const result = browser.CharacterEquipment.derive({inventory: gear}, real, context());
  assert.equal(result.armorClass, 15);
  assert.equal(result.attacks.length, 3);
  assert.equal(result.attacks.find(attack => attack.name === 'Dagger').bonus, 5);
  const alchemist = context({proficiencies: {weapons: '1 simple weapon group, all crossbows, all thrown weapons', armor: 'Light armor'}});
  for (const [name, trained] of [['Light crossbow', true], ['Hand crossbow', true], ['Dagger', true], ['blowgun', true], ['Hunting bow', false], ['Dirk', false]]) {
    const weapon = carried(items.find(entry => entry.name === name));
    const attacks = browser.CharacterEquipment.derive({inventory: [weapon]}, real, alchemist).attacks;
    assert.equal(attacks[0].trained, trained, 'Alchemist proficiency for ' + name);
  }
});
