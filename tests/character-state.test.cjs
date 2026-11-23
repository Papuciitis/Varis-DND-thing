'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto').webcrypto;
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({crypto, DND_RULES_VERSION: 'catalog-test-fingerprint'});
const statePath = path.join(__dirname, '..', 'web', 'character-state.js');
vm.runInContext(fs.readFileSync(statePath, 'utf8'), context, {filename: statePath});
const State = context.CharacterState;
// Values returned by the browser script have VM prototypes. Compare JSON data.
const plain = value => JSON.parse(JSON.stringify(value));
const envelope = character => ({format: 'vara-character-sheet', version: 1, character});

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

test('versioned JSON backup round-trips a complete character and rules fingerprint', () => {
  const character = State.normalizeCharacter({
    id: 'naura',
    name: 'Naura of Druva',
    level: 7,
    abilities: {str: 16, dex: 12, con: 14, int: 9, wis: 13, cha: 11},
    resources: {hp: {current: 17, max: 24}, tempBlock: {current: 2, max: 3}},
    restDice: {current: 3, max: 5, die: 'd8'},
    deathSaves: {successes: 1, failures: 2},
    training: {skills: {Athletics: 2}, skillBonuses: {Athletics: 1}, saves: {str: true}},
    combat: {spellAbility: 'wis', proficiencyOverride: 5},
    attacks: [{id: 'spear', name: 'Spear', bonus: 6, damage: '1d6+3', notes: 'Reach'}],
    customResources: [{id: 'mana', name: 'Mana', current: 2, max: 4}],
    spellSlots: [{level: 1, current: 2, max: 3}],
    spells: [{id: 'spell', name: 'Arcane Hex', entryId: 'rule-spell', prepared: true}],
    inventory: [{id: 'gear', name: 'Dagger', entryId: 'rule-item', quantity: 2, equipped: true}],
    features: [{id: 'feat', name: 'Agile', entryId: 'rule-feat'}],
    conditions: ['Prone'],
    proficiencies: {weapons: 'Spears', armor: 'Light', tools: 'Herbalism', languages: 'Common'},
    coins: {gold: 7, silver: 2, copper: 1},
    maneuvers: 'Poke',
    notes: 'Camp beneath the old oak.',
  });
  const exported = State.exportCharacter(character);
  const backup = JSON.parse(exported);
  assert.equal(backup.format, 'vara-character-sheet');
  assert.equal(backup.version, State.version);
  assert.equal(backup.rulesVersion, 'catalog-test-fingerprint');
  assert.deepEqual(plain(State.importCharacter(exported)), plain(character));
  assert.deepEqual(plain(State.importCharacter('\uFEFF' + exported)), plain(character));
});

test('unknown extensions survive normalization, export and import without shared references', () => {
  const input = {
    id: 'extensions',
    extension: {plugin: 'homebrew', values: [null, true, 1, {text: 'Keep me'}]},
    abilities: {customScore: 11},
    resources: {hp: {current: 6, max: 10, color: 'red'}, focus: {current: 3, max: 5}},
    inventory: [{id: 'item', name: 'Token', extension: {charges: [1, 2]}}],
    spellSlots: [{level: 2, current: 1, max: 2, label: 'Ritual'}],
  };
  const original = plain(input);
  const normalized = State.normalizeCharacter(freeze(input));
  const imported = State.importCharacter(State.exportCharacter(normalized));
  assert.deepEqual(plain(input), original);
  assert.deepEqual(plain(imported.extension), original.extension);
  assert.equal(imported.abilities.customScore, 11);
  assert.equal(imported.resources.hp.color, 'red');
  assert.deepEqual(plain(imported.resources.focus), original.resources.focus);
  assert.deepEqual(plain(imported.inventory[0].extension), original.inventory[0].extension);
  assert.equal(imported.spellSlots[0].label, 'Ritual');
  imported.extension.values[3].text = 'Changed';
  imported.inventory[0].extension.charges.push(3);
  assert.deepEqual(plain(normalized.extension), original.extension);
  assert.deepEqual(plain(normalized.inventory[0].extension), original.inventory[0].extension);
});

test('backup rules fingerprint falls back to the envelope while character value takes precedence', () => {
  const backup = {...envelope({name: 'Imported'}), rulesVersion: 'catalog-old'};
  assert.equal(State.importCharacter(JSON.stringify(backup)).rulesVersion, 'catalog-old');
  backup.character.rulesVersion = 'catalog-character';
  assert.equal(State.importCharacter(JSON.stringify(backup)).rulesVersion, 'catalog-character');
});

for (const [label, input, message] of [
  ['non-text input', {}, /JSON character file/],
  ['malformed JSON', '{', /not valid JSON/],
  ['null', 'null', /not a Varis/],
  ['wrong format', '{"format":"other","version":1,"character":{"name":"A"}}', /not a Varis/],
  ['missing format', '{"version":1,"character":{"name":"A"}}', /not a Varis/],
  ...[undefined, 0, -1, 1.5, '1'].map(version => [
    'invalid version ' + JSON.stringify(version),
    JSON.stringify({...envelope({name: 'A'}), version}),
    /invalid character sheet version/,
  ]),
  ['future version', JSON.stringify({...envelope({name: 'A'}), version: 2}), /newer character sheet version/],
  ['missing character', '{"format":"vara-character-sheet","version":1}', /no character details/],
  ['empty character', JSON.stringify(envelope({})), /no character details/],
  ['array character', JSON.stringify(envelope([])), /must be an object/],
  ['non-text fingerprint', JSON.stringify({...envelope({name: 'A'}), rulesVersion: 42}), /must be text/],
]) {
  test('import rejects ' + label, () => {
    assert.throws(() => State.importCharacter(input), message);
  });
}

for (const [label, patch] of [
  ['fractional level', c => { c.level = 1.5; }],
  ['NaN score', c => { c.abilities.str = NaN; }],
  ['infinite HP maximum', c => { c.resources.hp.max = Infinity; }],
  ['fractional current HP', c => { c.resources.hp.current = 2.5; }],
  ['empty experience', c => { c.experience = ''; }],
  ['decimal text', c => { c.coins.gold = '1.5'; }],
  ['numeric boolean', c => { c.abilities.dex = true; }],
  ['numeric array', c => { c.abilities.con = []; }],
  ['numeric object', c => { c.training.skillBonuses.Perception = {}; }],
  ['invalid combat override', c => { c.combat.proficiencyOverride = 'abc'; }],
  ['invalid custom resource', c => { c.customResources = [{id: 'mana', current: 1.25, max: 4}]; }],
  ['invalid slot level', c => { c.spellSlots = [{level: 'one', current: 1, max: 2}]; }],
]) {
  test('normalization rejects ' + label, () => {
    const character = State.createCharacter();
    patch(character);
    assert.throws(() => State.normalizeCharacter(character), /whole number|valid JSON values/);
  });
}

test('resource deltas reject invalid numbers and unknown resources', () => {
  const character = freeze(State.createCharacter());
  for (const value of [NaN, Infinity, 0.5, '', '1.2', true, [], {}]) {
    assert.throws(() => State.resourceDelta(character, 'hp', value), /whole number/);
  }
  for (const key of ['missing', 'custom:missing', 'slot:9', null]) {
    assert.throws(() => State.resourceDelta(character, key, -1), /no longer on this character/);
  }
});

test('whole-number input clamps resources, death saves, training and bounded fields', () => {
  const character = State.normalizeCharacter({
    level: 999, experience: -2, abilities: {str: -5, dex: 2000000},
    resources: {hp: {current: 30, max: ' +20 '}, block: {current: -2, max: -5}},
    restDice: {current: 10, max: 4},
    deathSaves: {successes: 5, failures: -1},
    training: {skills: {Athletics: 5, Stealth: -1}, skillBonuses: {Athletics: -2}},
    coins: {gold: 2000000},
    customResources: [{id: 'mana', current: 10, max: 3}],
    spellSlots: [{level: 1, current: -1, max: 3}],
  });
  assert.equal(character.level, 100);
  assert.equal(character.experience, 0);
  assert.equal(character.abilities.str, 0);
  assert.equal(character.abilities.dex, 1000000);
  assert.deepEqual(plain(character.resources.hp), {current: 20, max: 20});
  assert.deepEqual(plain(character.resources.block), {current: 0, max: 0});
  assert.equal(character.restDice.current, 4);
  assert.deepEqual(plain(character.deathSaves), {successes: 3, failures: 0});
  assert.deepEqual(plain(character.training.skills), {Athletics: 2, Stealth: 0});
  assert.equal(character.training.skillBonuses.Athletics, -2);
  assert.equal(character.coins.gold, 1000000);
  assert.equal(character.customResources[0].current, 3);
  assert.equal(character.spellSlots[0].current, 0);
});

test('spending Block consumes Temp Block first and clamps exhaustion at zero', () => {
  const character = freeze(State.normalizeCharacter({
    resources: {block: {current: 5, max: 5}, tempBlock: {current: 2, max: 3}},
  }));
  const before = plain(character);
  const first = State.resourceDelta(character, 'block', -1);
  assert.equal(first.resources.tempBlock.current, 1);
  assert.equal(first.resources.block.current, 5);
  const crossing = State.resourceDelta(character, 'block', -4);
  assert.equal(crossing.resources.tempBlock.current, 0);
  assert.equal(crossing.resources.block.current, 3);
  const exhausted = State.resourceDelta(character, 'block', -99);
  assert.equal(exhausted.resources.tempBlock.current, 0);
  assert.equal(exhausted.resources.block.current, 0);
  const recovered = State.resourceDelta(crossing, 'block', 99);
  assert.equal(recovered.resources.block.current, 5);
  assert.equal(recovered.resources.tempBlock.current, 0);
  assert.deepEqual(plain(character), before);
});

test('resource changes return independent data, clamp each target and leave other health pools unchanged', () => {
  const character = freeze(State.normalizeCharacter({
    resources: {
      hp: {current: 10, max: 20}, arcaneHealth: {current: 8, max: 9},
      tempHP: {current: 4, max: 6}, block: {current: 5, max: 5},
      tempBlock: {current: 2, max: 3},
    },
    restDice: {current: 2, max: 4},
    customResources: [{id: 'mana', name: 'Mana', current: 2, max: 3}],
    spellSlots: [{level: 2, current: 1, max: 2}],
    extension: {values: [1, 2]},
  }));
  const before = plain(character);
  for (const [key, getPool] of [
    ['hp', c => c.resources.hp],
    ['arcaneHealth', c => c.resources.arcaneHealth],
    ['tempHP', c => c.resources.tempHP],
    ['tempBlock', c => c.resources.tempBlock],
    ['restDice', c => c.restDice],
    ['custom:mana', c => c.customResources[0]],
    ['slot:2', c => c.spellSlots[0]],
  ]) {
    const spent = State.resourceDelta(character, key, -99);
    const recovered = State.resourceDelta(character, key, 99);
    assert.equal(getPool(spent).current, 0, key);
    assert.equal(getPool(recovered).current, getPool(character).max, key);
    assert.deepEqual(plain(character), before, key + ' mutated the input');
    assert.notEqual(spent, character);
    assert.notEqual(spent.extension, character.extension);
    for (const health of ['hp', 'arcaneHealth', 'tempHP', 'block', 'tempBlock']) {
      if (health !== key) assert.deepEqual(plain(spent.resources[health]), before.resources[health], key + ' changed ' + health);
    }
  }
});

test('duplicate spell levels and list IDs are rejected before they can become ambiguous resource keys', () => {
  assert.throws(() => State.normalizeCharacter({spellSlots: [{level: 1}, {level: 1}]}), /duplicate level/);
  for (const kind of ['customResources', 'attacks', 'inventory', 'spells', 'features']) {
    assert.throws(() => State.normalizeCharacter({[kind]: [{id: 'duplicate'}, {id: 'duplicate'}]}), /duplicate id/);
  }
});

test('ability modifiers and house-rule proficiency progression preserve their level boundaries', () => {
  for (const [score, expected] of [[0, -5], [8, -1], [9, -1], [10, 0], [11, 0], [16, 3], [20, 5]]) {
    assert.equal(State.abilityModifier(score), expected, 'ability score ' + score);
  }
  for (const [level, expected] of [[1, 2], [3, 2], [4, 3], [6, 3], [7, 4], [9, 4], [10, 5], [12, 5], [13, 6], [15, 6], [16, 7], [18, 7], [19, 8], [20, 8]]) {
    assert.equal(State.proficiencyBonus(level), expected, 'level ' + level);
  }
});
