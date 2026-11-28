'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.VARA_MONSTER_TEST_OUTPUT || path.join(root, 'site'));
const catalog = require('./helpers/catalog.cjs')();
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'data/catalog-manifest.json'), 'utf8'));
const metadata = JSON.parse(fs.readFileSync(path.join(output, manifest.builder), 'utf8'));
const spells = catalog.find(section => section.key === 'spells').entries;
const promoted = spells.filter(entry => entry.source === 'spells/geomancy-approved.yaml');
const review = catalog.find(section => section.key === 'geomancy-review');
const plain = value => JSON.parse(JSON.stringify(value));

const expected = [
  ['Votive Gem', 'oath', 0], ['Compass', 'mystic', 1], ['Lithoresonance', 'mystic', 1],
  ['Wind Slash', 'mystic', 0], ['Rebuke thy Name', 'oath', 1], ['Gemstone Keenness', 'oath', 1],
  ['Geomantic Awareness', 'mystic', 1], ['Granite Gaze', 'mystic', 1], ['Barkskin', 'mystic', 1],
  ['Bestow Comfort', 'oath', 1], ['Thornmantle', 'occult', 1], ['Crystal Blight', 'occult', 2],
  ['Earthen Bonds', 'oath', 1], ['Landmemory', 'mystic', 2], ['Binding Smite', 'oath', 2],
  ['Stoneshell', 'oath', 2], ['Earthwalk', 'mystic', 3], ['Siege Stone', 'oath', 3],
  ['One with the land', 'mystic', 3], ['Grasping Green', 'mystic', 2], ['Crystal Shard', 'mystic', 3],
  ['Quake Hammer', 'oath', 2], ['Seal of protection', 'oath', 5], ['Stoneskin', 'mystic', 3],
];

function setup(className, level = 11, maxSlotLevel = 6) {
  const context = vm.createContext({crypto: require('node:crypto').webcrypto});
  for (const name of ['entry-order', 'character-state', 'character-effects', 'character-equipment',
    'character-casting', 'character-prerequisites', 'character-automation', 'character-feats', 'character-rules']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'web', name + '.js'), 'utf8'), context);
  }
  const State = context.CharacterState;
  const Casting = context.CharacterCasting;
  const rules = context.CharacterRules.create(metadata, catalog);
  let character = rules.enable(State.normalizeCharacter({level, abilities: {int: 16, wis: 16, cha: 16}}));
  character.build.classId = metadata.classes.find(row => row.name === className).id;
  character = rules.reconcile(character);
  character.build.casting.maxSlotLevel = maxSlotLevel;
  character = rules.reconcile(character);
  const derived = rules.derive(character);
  return {State, Casting, rules, character, derived,
    selection: Casting.spellSelection(character, derived, catalog)};
}

test('the built catalog exposes all 24 approvals as normal spell identities and levels', () => {
  assert.equal(promoted.length, expected.length);
  assert.deepEqual(promoted.map(entry => entry.name).sort(), expected.map(([name]) => name).sort());
  const {Casting} = setup('Druid');
  for (const [name, tradition, level] of expected) {
    const entry = promoted.find(row => row.name === name);
    const info = Casting.spellInfo(entry);
    assert.equal(info.tradition, tradition, name);
    assert.equal(info.level, level, name);
    assert.equal(info.cantrip, level === 0, name);
    assert.equal(spells.filter(row => Casting.spellId(row) === Casting.spellId(entry)).length, 1, name);
    assert.ok(entry.details.effect, name);
    assert.ok(!Object.keys(entry.details).some(key => /^(?:review|questions|design_notes)/.test(key)), name);
  }
});

test('class spell discovery includes approvals for the right tradition without automatically learning them', () => {
  for (const [className, tradition] of [['Druid', 'mystic'], ['Cleric', 'oath'], ['Occultist', 'occult']]) {
    const {character, rules, Casting, selection, State} = setup(className);
    const eligible = new Set(Array.from(selection.eligible, entry => Casting.spellId(entry)));
    for (const [name, school] of expected) {
      const entry = promoted.find(row => row.name === name);
      assert.equal(eligible.has(Casting.spellId(entry)), school === tradition, `${className}: ${name}`);
    }
    assert.equal(selection.chosen.length, 0, className);
    assert.equal(character.spells.length, 0, className);
    const reopened = rules.reconcile(State.importCharacter(State.exportCharacter(character)));
    assert.equal(reopened.spells.length, 0, `${className}: save/reopen must retain explicit learning choices`);
  }
  const wizard = setup('Wizard');
  assert.ok(!wizard.selection.eligible.some(entry => promoted.includes(entry)));
});

test('normal level gates apply to the promoted Barkskin, Quake Hammer and Seal of protection', () => {
  const names = selection => new Set(Array.from(selection.eligible, entry => entry.name));
  const druid = setup('Druid', 1);
  assert.ok(names(druid.selection).has('Wind Slash'));
  assert.ok(names(druid.selection).has('Barkskin'));
  assert.ok(!names(druid.selection).has('One with the land'));
  assert.ok(names(setup('Druid', 5).selection).has('One with the land'));
  const first = setup('Cleric', 1, 1);
  assert.ok(names(first.selection).has('Votive Gem'));
  assert.ok(!names(first.selection).has('Quake Hammer'));
  assert.ok(!names(first.selection).has('Seal of protection'));
  assert.ok(names(setup('Cleric', 3, 2).selection).has('Quake Hammer'));
  assert.ok(!names(setup('Cleric', 7, 4).selection).has('Seal of protection'));
  assert.ok(names(setup('Cleric', 9, 5).selection).has('Seal of protection'));
});

test('pending conversions remain in review and cannot enter character spell discovery', () => {
  assert.match(review.title, /pending/i);
  assert.equal(review.entries.length, 49);
  assert.ok(review.entries.every(entry => !['approved', 'rejected'].includes(entry.details.review_status)));
  const proposals = review.entries.filter(entry => entry.details.review_conversion);
  assert.equal(proposals.length, 9);
  for (const entry of proposals) {
    assert.ok(!spells.some(spell => spell.name === entry.details.review_conversion.name), entry.name);
  }
  for (const className of ['Druid', 'Cleric', 'Occultist', 'Wizard']) {
    const {selection} = setup(className);
    assert.ok(selection.eligible.every(entry => !entry.source.startsWith('geomancy-review')));
    assert.ok(selection.eligible.every(entry => !review.entries.includes(entry)));
  }
  const bloomguard = review.entries.find(entry => entry.name === 'Bloomguard');
  assert.equal(bloomguard.details.review_status, 'needs-design');
  assert.match(bloomguard.details.review_author_response, /\S/);
  const clay = review.entries.find(entry => entry.name === 'Rockplica');
  assert.equal(clay.details.review_status, 'draft');
  assert.equal(clay.details.review_conversion.name, 'Clay Simulacra');
  assert.match(clay.details.review_author_response, /\S/);
  assert.deepEqual(plain(review.entries.filter(entry => entry.details.review_status === 'source-missing').map(entry => entry.name)).sort(),
    ["Earth's Guidance", "Stone's Embrace"].sort());
});
