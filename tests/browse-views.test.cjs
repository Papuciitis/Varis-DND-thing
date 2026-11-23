'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  class Node {
    constructor(tag, className = '', text = '') { this.tag = tag; this.className = className; this.text = String(text); this.children = []; this.attributes = {}; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    get textContent() { return this.text + this.children.map(node => node.textContent).join(''); }
    all(tag) { return this.children.flatMap(node => [...(node.tag === tag ? [node] : []), ...node.all(tag)]); }
  }
  const context = vm.createContext({Intl});
  for (const file of ['entry-order.js', 'browse-views.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../web', file), 'utf8'), context);
  const rendered = [];
  const helpers = {
    el: (tag, className, text) => new Node(tag, className, text),
    link(text, params, className) { const node = new Node('a', className, text); node.href = '#' + new URLSearchParams(params); return node; },
    entryRoute: (section, entry) => ({section: section.key, entry: entry.name, group: entry.group}),
    renderDetails(entry, target) { rendered.push(entry.name); target.append(new Node('p', '', entry.details?.desc || '')); }
  };
  return {views: context.BrowseViews, helpers, rendered};
}

test('class overview separates base-class links from disclosures containing only their own archetypes', () => {
  const {views, helpers} = setup();
  const entries = [
    {name:'Wizard',group:'Base class'}, {name:'Fighter',group:'Base class'}, {name:'Alchemist',group:'Base class'},
    {name:'Z early',group:'Fighter archetype',details:{lvl:'4'}},
    {name:'A late',group:'Fighter archetypes',details:{lvl:'7'}},
    {name:'Unknown level',group:'Fighter archetype'}, {name:'Evoker',group:'Wizard archetype'},
    {name:'Additional fighter features',group:'Class supplements'}
  ];
  const before = JSON.stringify(entries);
  const result = views.classDirectory({key:'classes',entries}, helpers);
  assert.equal(result.tag, 'ul');
  assert.equal(result.children.length, 3);
  assert.deepEqual(result.children.map(card => card.children[0].textContent), ['Alchemist','Fighter','Wizard']);
  const fighter = result.children[1];
  assert.equal(fighter.children[0].tag, 'a');
  assert.equal(fighter.children[0].className, 'result-name class-name');
  assert.match(fighter.children[0].href, /entry=Fighter/);
  const disclosure = fighter.children[1];
  assert.equal(disclosure.tag, 'details');
  assert.equal(disclosure.children[0].tag, 'summary');
  assert.equal(disclosure.children[0].attributes['aria-label'], 'Fighter archetypes, 3');
  assert.deepEqual(disclosure.all('a').map(link => link.textContent), ['Z early','A late','Unknown level']);
  assert.deepEqual(disclosure.all('span').map(span => span.textContent), ['Level 4','Level 7']);
  assert.deepEqual(result.children[2].all('details')[0].all('a').map(link => link.textContent), ['Evoker']);
  assert.equal(result.children[0].all('details').length, 0);
  assert.equal(JSON.stringify(entries), before);
});

test('comparison view renders every supplied row and keeps disclosures independently expandable', () => {
  const {views, helpers, rendered} = setup();
  const rows = Array.from({length:27}, (_, index) => ({section:{key:'races'},entry:{name:'Race '+index,group:'Ancestries',details:{desc:'Trait '+index}}}));
  const before = JSON.stringify(rows);
  const result = views.expandableList(rows, helpers);
  assert.equal(result.children.length, 27);
  assert.equal(rendered.length, 27);
  assert.equal(result.children.every(node => node.tag === 'details' && !node.attributes.name), true);
  result.children[0].open = true;
  result.children[1].open = true;
  assert.equal(result.children[0].open, true);
  assert.equal(result.children[1].open, true);
  const first = result.children[0];
  assert.equal(first.children[0].tag, 'summary');
  assert.equal(first.children[0].all('a').length, 0);
  assert.equal(first.children[0].all('span')[0].className, 'result-name');
  assert.equal(first.children[1].all('a')[0].attributes['aria-label'], 'Open Race 0 entry');
  assert.match(first.children[1].all('a')[0].href, /section=races&entry=Race\+0/);
  assert.equal(first.children[1].all('p')[0].textContent, 'Trait 0');
  assert.equal(JSON.stringify(rows), before);
});

test('comparison summaries preserve literal data and stable route identity', () => {
  const {views, helpers} = setup();
  const entry = {name:'<Elf & "kin">',group:'',details:{desc:'<script>literal rule text</script>'}};
  const result = views.expandableList([{section:{key:'races'},entry}], helpers);
  assert.equal(result.all('summary')[0].textContent, entry.name);
  assert.equal(result.all('summary')[0].children.length, 1);
  assert.equal(result.all('p')[0].textContent, entry.details.desc);
  const params = new URLSearchParams(result.all('a')[0].href.slice(1));
  assert.equal(params.get('entry'), entry.name);
  assert.equal(params.get('group'), '');
});
