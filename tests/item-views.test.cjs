'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function setup() {
  const context = vm.createContext({Intl});
  vm.runInContext(fs.readFileSync(path.join(root, 'web/item-views.js'), 'utf8'), context);
  return context.ItemViews;
}

function catalogItems() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'site/data/catalog-manifest.json'), 'utf8'));
  return JSON.parse(fs.readFileSync(path.join(root, 'site', manifest.sections.find(section => section.key === 'items').url), 'utf8')).entries;
}

const flatten = nodes => nodes.flatMap(node => node.entries || flatten(node.children || []));
const plain = value => JSON.parse(JSON.stringify(value));

test('the six item shelves contain every built item exactly once without changing its source identity', () => {
  const views = setup(), entries = catalogItems(), before = JSON.stringify(entries);
  const shelves = views.categoriesFor(entries), flat = shelves.flatMap(shelf => shelf.entries);
  assert.equal(entries.length, 271);
  assert.deepEqual(plain(shelves.map(shelf => shelf.title)), ['Weapons', 'Armor & shields', 'Items', 'Consumables', 'Materials', 'Special plants & fungi']);
  assert.equal(flat.length, entries.length);
  assert.equal(new Set(flat).size, entries.length);
  assert.equal(shelves.reduce((total, shelf) => total + shelf.count, 0), entries.length);
  assert.equal(shelves.find(shelf => shelf.key === 'weapons').count, 133);
  for (const item of entries) assert(shelves.find(shelf => shelf.key === views.category(item)).entries.includes(item));
  assert.equal(JSON.stringify(entries), before);
});

test('raw material pieces, prepared consumables and plants are separated from ordinary gear', () => {
  const views = setup(), entries = catalogItems();
  for (const name of ['Ironwood', 'Memory stone', 'Ironwood twig', 'Memory stone fragment', 'Mithril', 'Forge amber']) {
    assert.equal(views.category(entries.find(entry => entry.name === name)), 'materials', name);
  }
  for (const name of ['Potion of clarity', 'Vial of mosa', 'Poison flask', 'Elderlychen spore bag']) {
    assert.equal(views.category(entries.find(entry => entry.name === name)), 'consumables', name);
  }
  assert.equal(views.category(entries.find(entry => entry.name === 'Elderlychen')), 'plants-fungi');
  assert.equal(views.category(entries.find(entry => entry.name === "Herbalism kit")), 'items');
});

test('damage alone never categorizes traps, shields or ammunition as weapons and unknown records remain Items', () => {
  const views = setup();
  assert.equal(views.category({name: 'Spring trap', group: 'Traps and components', details: {damage: '2d6'}}), 'items');
  assert.equal(views.category({name: 'Tower shield', group: 'Heavy shields', details: {damage: '1d4', type: 'simple'}}), 'armor-shields');
  assert.equal(views.category({name: 'Bolt', group: 'Ammunition', details: {damage: '1d4', type: 'Ammunition'}}), 'items');
  assert.equal(views.category({name: 'Simple bolt', group: 'Ammunition', details: {damage: '1d4', type: 'simple'}}), 'items');
  assert.equal(views.category({name: 'New material-like item', group: 'Unreviewed', details: {description: 'Made from ironwood.'}}), 'items');
  assert.equal(views.category({name: 'New', details: {}}), 'items');
  assert.equal(views.category(null), 'items');
});

test('weapon hierarchy preserves all real weapons once under training, range and their actual family', () => {
  const views = setup(), entries = catalogItems(), tree = views.weaponTree(entries), flat = flatten(tree);
  const weapons = entries.filter(entry => entry.source === 'weapons.yaml');
  assert.deepEqual(plain(tree.map(node => node.key)), ['simple', 'martial']);
  assert.equal(flat.length, weapons.length);
  assert.equal(new Set(flat).size, weapons.length);
  assert(weapons.every(entry => flat.includes(entry)));
  for (const training of tree) for (const range of training.children) for (const family of range.children) {
    assert.equal(training.count, flatten(training.children).length);
    assert.equal(range.count, flatten(range.children).length);
    assert.equal(family.count, family.entries.length);
    for (const entry of family.entries) {
      assert.equal(entry.details.type, training.key);
      assert.equal((entry.details.group || entry.group).toLowerCase(), family.key);
    }
  }
  const inBranch = (training, range, name) => flatten(tree.find(node => node.key === training).children.find(node => node.key === range).children).some(entry => entry.name === name);
  assert(inBranch('simple', 'melee', 'Dagger'));
  assert(inBranch('simple', 'melee', 'Skean dagger'));
  assert(inBranch('simple', 'ranged', 'Sling'));
  assert(inBranch('simple', 'ranged', 'javelin'));
  assert(inBranch('simple', 'ranged', 'net'));
  assert(inBranch('martial', 'ranged', 'Hand crossbow'));
});

test('the weapon tree handles unknown future training metadata without losing source weapons or mutating arrays', () => {
  const views = setup(), entry = {name: 'Unclassified weapon', group: 'Lost family', source: 'weapons.yaml', details: {damage: '-'}};
  const entries = [entry], before = JSON.stringify(entries), tree = views.weaponTree(entries);
  assert.deepEqual(plain(tree.map(node => node.key)), ['other']);
  assert.equal(flatten(tree)[0], entry);
  assert.equal(JSON.stringify(entries), before);
  assert.deepEqual(plain(views.weaponTree([])), []);
});
