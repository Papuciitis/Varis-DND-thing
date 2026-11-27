'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const builtCatalog = require('./helpers/catalog.cjs');

test('the built monster manual includes every supplied creature and the editor can open every statblock', () => {
  const section = builtCatalog().find(section => section.key === 'monsters');
  const expected = new Map([
    ['monsters/template.yaml',12], ['monsters/steel-dragons.yaml',4],
    ['monsters/chronica.yaml',66], ['monsters/smash-and-grab.yaml',10],
    ['monsters/tarta-wiki.yaml',13], ['monsters/tarta-elementals-low.yaml',13],
    ['monsters/tarta-elementals-high.yaml',13], ['monsters/tarta-summons.yaml',9],
    ['monsters/recovered-fauna.yaml',12], ['monsters/recovered-warriors.yaml',15],
    ['monsters/recovered-horrors.yaml',15], ['monsters/recovered-lore.yaml',13]
  ]);
  const context = vm.createContext({localStorage:{getItem:()=>null}});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/monster-editor.js'), 'utf8'), context);
  for (const [source, count] of expected) {
    const entries = section.entries.filter(entry => entry.source === source);
    assert.equal(entries.length, count, source);
    for (const entry of entries) {
      assert.doesNotThrow(() => context.MonsterEditor.validate(entry), entry.name);
      assert(entry.details.original_5e, entry.name + ' lost its original');
      assert(entry.details.source_ref, entry.name + ' lost its source');
      assert(entry.details.conversion_notes?.length, entry.name + ' lost its conversion notes');
      assert(entry.details.ac && entry.details.hp && entry.details.block, entry.name + ' lacks defenses');
    }
  }
  assert.equal(section.entries.length, 215);
  assert.equal(new Set(section.entries.map(entry => entry.name.toLowerCase())).size, 215);
});

test('built Chronica profiles expose six numeric ability scores with traceable reconstruction status', () => {
  const entries=builtCatalog().find(section=>section.key==='monsters').entries.filter(entry=>entry.source==='monsters/chronica.yaml');
  assert.equal(entries.length,66);
  for (const entry of entries) {
    for (const key of ['str','dex','con','int','wis','cha']) {
      const value=entry.details.abilities[key];
      assert(/^\d+$/.test(String(value)) && Number(value)>=1,entry.name+' '+key+': '+value);
    }
    assert(['sourced','reconstructed'].includes(entry.details.ability_score_status),entry.name);
    assert(entry.details.source_ability_scores,entry.name+' missing score provenance');
  }
});

test('converted spell references navigate to existing current spells', () => {
  const catalog = builtCatalog();
  const monsters = catalog.find(section => section.key === 'monsters').entries;
  const spells = catalog.find(section => section.key === 'spells').entries;
  let references = 0;
  for (const monster of monsters) {
    for (const reference of monster.details.spell_references || []) {
      references++;
      assert(spells.some(spell => spell.name === reference.name && spell.group === reference.group),
        monster.name + ': missing spell link ' + reference.name + ' / ' + reference.group);
    }
  }
  assert(references > 20);
});
