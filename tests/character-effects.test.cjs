'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const effectPath = path.join(__dirname, '..', 'web', 'character-effects.js');
const context = vm.createContext({});
if (fs.existsSync(effectPath)) vm.runInContext(fs.readFileSync(effectPath, 'utf8'), context, {filename: effectPath});
const lookup = (...args) => JSON.parse(JSON.stringify(context.CharacterEffects?.lookup(...args) || {}));

test('Dwarven fortitude adds health per character level and poison resistance', () => {
  const effect = lookup('Dwarf', 'Dwarven traits', 'Dwarven fortitude');
  assert.equal(effect.hpPerLevel, 1);
  assert.deepEqual(effect.resistances, ['poison']);
});

test('large Dragonborn applies its explicit AC and maximum block penalties', () => {
  const effect = lookup('Dragonborn', 'Large lizard');
  assert.equal(effect.ac, -1);
  assert.equal(effect.block, -1);
});

test('elf Sun-blooded adds four health without inventing general save bonuses', () => {
  const effect = lookup('elf', 'Elven traits', 'Sun-blooded');
  assert.equal(effect.hpFlat, 4);
  assert.equal(effect.saveBonuses, undefined);
});

test('Lumbering giant combines Strength, rest dice, and its speed penalty', () => {
  const effect = lookup('Firbolg', 'Firbolg traits', 'Lumbering giant');
  assert.deepEqual(effect.abilities, {str: 1});
  assert.equal(effect.restDice, 1);
  assert.equal(effect.speed, -5);
});

test('Kobold Small and swift differs from the same-named gnome trait', () => {
  const kobold = lookup('Kobold', 'Minor kobold traits', 'Small and swift');
  const gnome = lookup('Gnome', 'Minor gnome traits', 'Small and swift');
  assert.equal(kobold.ac, 1);
  assert.deepEqual(kobold.saveBonuses, {dex: 1});
  assert.deepEqual(kobold.skillBonuses, {Stealth: 1});
  assert.equal(gnome.speed, 5);
  assert.equal(gnome.saveBonuses, undefined);
});

test('Relic includes its flat and per-level health before chosen drawbacks', () => {
  const base = lookup('Relic', 'Relic traits');
  const wear = lookup('Relic', 'Relic downside', 'extensive wear');
  assert.equal(base.hpFlat, 13);
  assert.equal(base.hpPerLevel, 1);
  assert.equal(wear.hpFlat, -8);
  assert.deepEqual(wear.saveBonuses, {str: -1, dex: -1, con: -1});
});

test('Shadowling includes the race declared outside races.yml', () => {
  const mark = lookup('Shadowling', 'Shadowling mark');
  const origin = lookup('Shadowling', 'Shadowling origin', 'Frozen heart');
  assert.equal(mark.hpFlat, -2);
  assert.equal(origin.ac, 1);
  assert.deepEqual(origin.skillBonuses, {Persuasion: -1, Insight: -1});
});

test('armor, night, and rest conditions never become permanent passive bonuses', () => {
  for (const args of [
    ['Dwarf', 'Dwarven traits', 'Ironbeard'],
    ['Firbolg', 'Firbolg traits', 'Homebuilder'],
    ['Half-orc', 'Minor Half-Orc traits', 'Nocturnal'],
    ['Fighter', 'Fighting skills', 'Armor training'],
    ['Spellblade', 'Greater spell-blade exploit', 'Spell-blade link']
  ]) {
    const effect = lookup(...args);
    assert.equal(effect.ac, undefined, args.join('/'));
    assert.equal(effect.abilities, undefined, args.join('/'));
    assert.equal(effect.skillBonuses, undefined, args.join('/'));
  }
});

test('Occultist marks and rewards use literal source option text', () => {
  assert.equal(lookup('Occultist', 'Mark & reward', '-5 ft movement speed').speed, -5);
  assert.equal(lookup('Occultist', 'Mark & reward', 'Your rest dice maximum is increased by 2.').restDice, 2);
  assert.deepEqual(lookup('Occultist', 'Mark & reward', '-1 to physical saves').saveBonuses, {str: -1, dex: -1, con: -1});
});

test('Monk Tempered endurance and Fighter Conditioning grant their exact passive amounts', () => {
  const monk = lookup('Monk', 'Monk training', 'Tempered endurance');
  assert.equal(monk.hpFlat, 4);
  assert.equal(monk.restDice, 2);
  assert.deepEqual(lookup('Fighter', 'Fighting skills', 'Conditioning').saveBonuses, {str: 1, dex: 1, con: 1});
});

test('source damage reduction and rolled skill dice stay in notes', () => {
  const scaled = lookup('Dragonborn', 'Minor dragonborn traits', 'Scaled beast');
  assert.match(scaled.notes, /damage reduction 1/i);
  const wandering = lookup('Half-orc', 'Minor Half-Orc traits', 'Wandering clan');
  assert.equal(wandering.skillBonuses, undefined);
  assert.match(wandering.notes, /1d4/i);
});

test('unknown effects remain empty and returned effects do not share mutable state', () => {
  assert.deepEqual(lookup('Unknown', 'Feature', 'Unknown'), {});
  const effect = context.CharacterEffects?.lookup('Dwarf', 'Dwarven traits', 'Dwarven fortitude');
  assert.ok(effect, 'registry loaded');
  effect.resistances.push('fire');
  assert.deepEqual(lookup('Dwarf', 'Dwarven traits', 'Dwarven fortitude').resistances, ['poison']);
});

test('lookup normalizes case and whitespace while retaining parent identity', () => {
  assert.equal(lookup('  DWARF ', ' DWARVEN TRAITS ', 'dwarven fortitude').hpPerLevel, 1);
  assert.deepEqual(lookup('Gnome', 'Dwarven traits', 'Dwarven fortitude'), {});
});

test('archetype fixed bonuses retain their own parent and feature identity', () => {
  assert.equal(lookup('Guardian', 'Enduring').hpPerLevel, 3);
  assert.deepEqual(lookup('Martial artist', 'Mastered form').abilities, {str: 1, dex: 1, con: 1});
  assert.equal(lookup('Wanderer', 'Brisk').speed, 10);
  assert.equal(lookup('Soulstone alchemist', 'The cost of knowledge').deathSaveSlots, -1);
  assert.deepEqual(lookup('Brigand', 'Wild criminality').skillBonuses, {Intimidation: 2, 'Sleight of Hand': 2, Athletics: 2, Stealth: 2});
});

test('Relic choices explicitly remove superseded defenses', () => {
  assert.deepEqual(lookup('Relic', 'Relic downside', 'air-dependence').removeResistances, ['cold']);
  assert.deepEqual(lookup('Relic', 'Relic downside', 'fading spark').removeImmunities, ['sleep']);
});

test('race-specific Block rules distinguish Dexterity reduction from temporary Block', () => {
  const firbolg = lookup('Firbolg', 'Gentle giant');
  assert.equal(firbolg.dexBlock, -1);
  assert.equal(firbolg.block, undefined);
  const relic = lookup('Relic', 'Relic aspect', 'Armored core');
  assert.equal(relic.combatTempBlock, 1);
  assert.equal(relic.block, undefined);
});
