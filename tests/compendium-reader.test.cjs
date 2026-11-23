'use strict';

// Exercise the reader's rendered DOM and navigation with a deliberately delayed
// data boundary. Layout and native swipe behavior still need browser inspection.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const orderSource = fs.readFileSync(path.join(__dirname, '../web/entry-order.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const entry = (name, group = '', details = {description: name + ' rules'}) => ({name, group, details});
const baseNames = ['Alchemist', 'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Occultist', 'Ranger', 'Rogue', 'Sorcerer', 'Wizard'];
const classData = [...baseNames.map(name => entry(name, 'Base class')), entry('Battle master', 'Fighter archetype'), entry('Champion', 'Fighter archetype'), entry('Wild magic', 'Wizard archetype')];

function boot(data = {classes: classData}, initial = '', options = {}) {
  let document;
  class Node {
    constructor(tag = '') { this.localName = tag; this.children = []; this.parentNode = null; this.listeners = {}; this.attributes = {}; this.className = ''; this.value = ''; this._text = ''; this.scrollLeft = 0; this.clientWidth = 500; }
    get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.replaceChildren(); }
    get childElementCount() { return this.children.filter(n => !['#text', '#fragment'].includes(n.localName)).length; }
    get firstElementChild() { return this.children.find(n => n.localName !== '#text'); }
    get isConnected() { return this === document || !!this.parentNode?.isConnected; }
    get classList() { return {add: name => { this.className += ' ' + name; }}; }
    append(...nodes) { for (let node of nodes) { if (typeof node === 'string') { const t = new Node('#text'); t._text = node; node = t; } if (node.localName === '#fragment') { this.append(...node.children); node.children = []; } else { node.parentNode = this; this.children.push(node); } } }
    replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...nodes); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    dispatch(type, extra = {}) { for (const listener of this.listeners[type] || []) listener({target: this, preventDefault() {}, ...extra}); }
    click() { if (!this.disabled) this.dispatch('click'); }
    focus() { document.activeElement = this; }
    select() {}
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    scrollIntoView() {}
    scrollTo(value) { this.scrollLeft = value.left; this.dispatch('scroll'); }
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(s => this.matches(s.trim()));
      if (selector === 'details:not([open])') return this.localName === 'details' && !this.open;
      const tag = selector.match(/^[\w-]+/)?.[0];
      if (tag && tag !== this.localName) return false;
      for (const match of selector.matchAll(/#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g)) {
        if (match[1] && this.id !== match[1]) return false;
        if (match[2] && !this.className.split(/\s+/).includes(match[2])) return false;
        if (match[3] && (!(match[3] in this.attributes) || match[4] !== undefined && this.attributes[match[3]] !== match[4])) return false;
      }
      return true;
    }
    closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
    querySelectorAll(selector) { return this.children.flatMap(n => [...(n.matches(selector) ? [n] : []), ...n.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  document = new Node('document');
  for (const [id, tag] of [['reader','article'], ['trail','nav'], ['search','input'], ['section-picker','select'], ['announcement','p'], ['search-form','form'], ['skip','a']]) { const node = new Node(tag); node.id = id; document.append(node); }
  document.getElementById = id => document.querySelector('#' + id);
  document.createElement = tag => new Node(tag);
  document.createDocumentFragment = () => new Node('#fragment');
  document.createTextNode = value => { const node = new Node('#text'); node._text = String(value); return node; };
  document.activeElement = document;
  const window = new Node('window'); window.scrollTo = () => {};
  const location = {hash: initial};
  const sections = Object.entries(data).map(([key, entries]) => ({key, title: key[0].toUpperCase() + key.slice(1), count: entries.length, entries: []}));
  const calls = [];
  const loaded = new Set();
  const loader = {
    ready: options.ready ? options.ready.then(() => sections) : Promise.resolve(sections),
    async loadSection(key) { calls.push(key); if (options.load) await options.load(key); const section = sections.find(s => s.key === key); section.entries = data[key]; loaded.add(key); return section; },
    async loadAll() { await Promise.all(sections.filter(s => !loaded.has(s.key)).map(s => loader.loadSection(s.key))); return sections; }
  };
  const context = vm.createContext({console, document, window, location, URLSearchParams, Intl, DndCatalog: loader,
    history: {replaceState(_state, _title, hash) { location.hash = hash; }},
    Option: function Option(name, value) { const node = new Node('option'); node.textContent = name; node.value = value; return node; }
  });
  if (options.manifestGlobal) context.DND_CATALOG = sections;
  if (options.portable) { context.DND_CATALOG = sections; sections.forEach(s => { s.entries = data[s.key]; }); delete context.DndCatalog; }
  vm.runInContext(orderSource, context, {filename:'entry-order.js'});
  vm.runInContext(source, context, {filename: 'app.js'});
  const reader = document.getElementById('reader');
  return {document, reader, calls, sections, get hash() { return location.hash; }, async route(hash) { location.hash = hash; window.dispatch('hashchange'); await settle(); }, async change(id, value) { const select = document.getElementById(id); assert(select, 'Missing '+id); select.value = value; select.dispatch('change'); window.dispatch('hashchange'); await settle(); }, link(text) { return reader.querySelectorAll('a').find(n => n.textContent === text); }};
}

const names = h => h.reader.querySelectorAll('.result-name').map(node => node.textContent);
const leveledSpells = [entry('Alpha third', 'Arcane', {lvl:'3'}), entry('Zeta first', 'Arcane', {level:1}), entry('Élan first', 'Arcane', {lvl:'1'}), entry('Beta second', 'Mystic', {lvl:'2'}), entry('Zing', 'Arcane cantrips', {description:'A cantrip'}), entry('A missing', 'Arcane', {description:'No stated spell level'})];

test('hex source tiers order within level zero without changing their spell level', async () => {
  const spells = [entry('B greater','Greater hexes',{lvl:'0'}),entry('Z minor','Minor hexes',{lvl:'0'}),entry('A major','Major hexes',{lvl:'0'}),entry('B minor','Minor hexes',{lvl:'0'}),entry('Z cantrip','Arcane cantrips',{lvl:'0'}),entry('A cantrip','Mystic cantrips',{lvl:'0'}),entry('A first','Arcane spells',{lvl:'1'}),entry('A unknown','Magic rules')];
  const h = boot({spells}); await h.route('#section=spells');
  assert.deepEqual(names(h), ['A cantrip','Z cantrip','B minor','Z minor','A major','B greater','A first','A unknown']);
  const hex = h.reader.querySelectorAll('.result').find(node => node.querySelector('.result-name').textContent === 'B greater');
  assert.match(hex.textContent, /Level 0/);
  await h.route('#section=spells&sort=level-desc');
  assert.deepEqual(names(h), ['A first','B greater','A major','B minor','Z minor','A cantrip','Z cantrip','A unknown']);
  await h.route('#section=spells&sort=name');
  assert.deepEqual(names(h), ['A cantrip','A first','A major','A unknown','B greater','B minor','Z cantrip','Z minor']);
  await h.route('#section=spells&filter=minor'); assert.deepEqual(names(h), ['B minor','Z minor']);
});

test('spell group filter presents tradition pairs and minor-to-greater hex tiers before other rules', async () => {
  const groups = ['Arcane cantrips','Arcane spells','Mystic cantrips','Mystic spells','Oath cantrips','Oath spells','Occult cantrips','Occult spells','Minor hexes','Major hexes','Greater hexes','Ancient rituals','Magic rules'];
  const h = boot({spells:groups.toReversed().map((group,index)=>entry('Entry '+index,group,{lvl:'0'}))}); await h.route('#section=spells');
  const select = h.document.getElementById('group'); assert(select);
  assert.deepEqual(select.children.slice(1).map(node=>node.textContent), groups);
  await h.change('group','Minor hexes');
  assert.equal(names(h).length, 1); assert.match(h.reader.querySelector('.result').textContent, /Level 0/);
});

test('browse and result-page links use plain labels', async () => {
  const h = boot({classes:classData,spells:Array.from({length:26},(_,index)=>entry('Spell '+index,'Arcane spells',{lvl:'1'}))});
  await h.route('#section=classes'); assert(h.link('Browse all class entries'));
  await h.route('#section=spells'); assert(h.link('Next'));
  await h.route('#section=spells&page=2'); assert(h.link('Previous'));
});

test('spell directory defaults to levels, including cantrips, name ties and unknowns last', async () => {
  const h = boot({spells:leveledSpells}); await h.route('#section=spells');
  assert.deepEqual(names(h), ['Zing','Élan first','Zeta first','Beta second','Alpha third','A missing']);
  assert.equal(h.reader.querySelectorAll('.groups').length, 0);
  const sort = h.document.getElementById('entry-sort'); assert(sort); assert.equal(sort.value, 'level-asc');
  assert(h.reader.textContent.includes('Level 0'));
  await h.route('#section=spells&sort=level-desc');
  assert.deepEqual(names(h), ['Alpha third','Beta second','Élan first','Zeta first','Zing','A missing']);
  await h.route('#section=spells&sort=name');
  assert.deepEqual(names(h), ['A missing','Alpha third','Beta second','Élan first','Zeta first','Zing']);
});

test('changing spell sort keeps filters in the bookmark and resets pagination', async () => {
  const h = boot({spells:leveledSpells}); await h.route('#section=spells&group=Arcane&filter=first&level=1&browse=all&page=3');
  await h.change('entry-sort', 'level-desc');
  const state = new URLSearchParams(h.hash.slice(1));
  assert.equal(state.get('sort'), 'level-desc'); assert.equal(state.get('group'), 'Arcane'); assert.equal(state.get('filter'), 'first'); assert.equal(state.get('level'), '1'); assert.equal(state.get('browse'), 'all'); assert.equal(state.has('page'), false);
  assert.deepEqual(names(h), ['Élan first','Zeta first']);
  assert.equal(h.document.getElementById('entry-sort').value, 'level-desc');
});

test('spell search defaults to relevance while explicit level and name order override ranking', async () => {
  const spells = [entry('Bolt', 'Arcane', {lvl:3}),entry('A first', 'Arcane', {lvl:1,description:'A bolt spell'}),entry('Z low', 'Arcane cantrips', {description:'A bolt spell'})];
  const h = boot({spells}); await h.route('#q=bolt&scope=spells');
  assert.deepEqual(names(h), ['Bolt','A first','Z low']);
  const sort = h.document.getElementById('entry-sort'); assert(sort); assert.equal(sort.value, 'relevance');
  await h.change('entry-sort','level-asc');
  assert.deepEqual(names(h), ['Z low','A first','Bolt']);
  assert.equal(new URLSearchParams(h.hash.slice(1)).get('q'), 'bolt');
  assert.equal(new URLSearchParams(h.hash.slice(1)).get('scope'), 'spells');
  await h.change('entry-sort','name'); assert.deepEqual(names(h), ['A first','Bolt','Z low']);
  await h.route('#section=spells&filter=bolt'); assert.deepEqual(names(h), ['Bolt','A first','Z low']);
  await h.route('#section=spells&filter=bolt&sort=level-asc'); assert.deepEqual(names(h), ['Z low','A first','Bolt']);
});

test('editing search text retains explicit order and changing scope removes incompatible order', async () => {
  const h = boot({spells:leveledSpells, monsters:[entry('A creature','Creatures',{cr:1})]});
  await h.route('#q=first&scope=spells&sort=level-desc&page=2');
  const search = h.document.getElementById('search'); search.value = 'second'; search.dispatch('input'); await settle();
  const state = new URLSearchParams(h.hash.slice(1));
  assert.equal(state.get('q'), 'second'); assert.equal(state.get('scope'), 'spells'); assert.equal(state.get('sort'), 'level-desc'); assert.equal(state.has('page'), false);
  assert.deepEqual(names(h), ['Beta second']);
  await h.change('search-scope','monsters');
  assert.equal(new URLSearchParams(h.hash.slice(1)).has('sort'), false);
  assert.equal(h.document.getElementById('entry-sort').value, 'relevance');
});

test('monster challenge ordering respects fractions and keeps unknown challenge last', async () => {
  const h = boot({monsters:[entry('A giant','Creatures',{cr:'3'}),entry('Z small','Creatures',{cr:'1/4'}),entry('B beast','Creatures',{cr:'1/2'}),entry('A unknown','Creatures',{hp:1})]});
  await h.route('#section=monsters'); assert.deepEqual(names(h), ['Z small','B beast','A giant','A unknown']);
  assert.equal(h.document.getElementById('entry-sort').value, 'challenge-asc');
  await h.change('entry-sort','challenge-desc'); assert.deepEqual(names(h), ['A giant','B beast','Z small','A unknown']);
  assert(h.reader.querySelectorAll('.result-meta').some(node=>node.textContent.includes('CR 1/4')));
});

test('free-text feat requirements and class progression never become guessed directory levels', async () => {
  const h = boot({feats:[entry('A advanced','Feats',{requirements:'Level 9'}),entry('Z basic','Feats',{requirements:'Level 1'})],classes:classData});
  await h.route('#section=feats'); assert.deepEqual(names(h), ['A advanced','Z basic']);
  assert.equal(h.document.getElementById('entry-sort'), null);
  await h.route('#section=classes'); assert.deepEqual(names(h), baseNames);
});

test('archetype links and group lists use only explicitly supplied unlock levels', async () => {
  const classes = [entry('Fighter','Base class'),Object.assign(entry('A advanced','Fighter archetype'),{requiredLevel:7,levelSource:'explicit'}),Object.assign(entry('Z early','Fighter archetype'),{requiredLevel:2,levelSource:'explicit'}),entry('B unknown','Fighter archetype',{description:'At level 1 you may choose this option.'})];
  const h = boot({classes}); await h.route('#section=classes&entry=Fighter&group=Base+class');
  const links = h.reader.querySelector('.class-archetypes'); assert(links);
  assert.deepEqual(links.querySelectorAll('a').map(node=>node.textContent), ['Z early','A advanced','B unknown']);
  assert.match(links.textContent, /Z early · Level 2/); assert.match(links.textContent, /A advanced · Level 7/); assert.doesNotMatch(links.textContent, /Level 1/);
  await h.route('#section=classes&group=Fighter+archetype'); assert.deepEqual(names(h), ['Z early','A advanced','B unknown']);
  assert.equal(h.document.getElementById('entry-sort').value, 'level-asc');
  await h.change('entry-sort','name'); assert.deepEqual(names(h), ['A advanced','B unknown','Z early']);
  await h.route('#section=classes&browse=all'); assert.deepEqual(names(h), ['A advanced','B unknown','Fighter','Z early']);
});

test('home uses manifest counts without fetching sections', async () => {
  const h = boot({classes: classData, spells: [entry('Arcane hex')]}); await settle();
  assert.match(h.reader.textContent, /Classes15 entries/);
  assert.match(h.reader.textContent, /Spells1 entry/);
  assert.deepEqual(h.calls, []);
});

test('a ready manifest global is not mistaken for a fully embedded catalog', async () => {
  const h = boot({classes:classData}, '#section=classes', {manifestGlobal:true}); await settle();
  assert.equal(h.reader.querySelectorAll('.result-name').length, 12);
  assert.deepEqual(h.calls, ['classes']);
});

test('startup waits for the manifest and follows the latest deep link', async () => {
  const gate = deferred();
  const h = boot({classes:classData, spells:[entry('Arcane hex')]}, '#section=classes', {ready:gate.promise});
  await h.route('#section=spells&entry=Arcane+hex');
  assert.match(h.reader.textContent, /Loading compendium/); assert.deepEqual(h.calls, []);
  gate.resolve(); await settle();
  assert.match(h.reader.textContent, /Arcane hex rules/); assert.deepEqual(h.calls, ['spells']);
});

test('class directory starts with twelve base classes and explicit full browsing', async () => {
  const h = boot(); await h.route('#section=classes');
  assert.deepEqual(h.reader.querySelectorAll('.result-name').map(n => n.textContent), baseNames);
  assert.equal(h.reader.querySelectorAll('.groups').length, 0);
  assert.match(h.reader.textContent, /Choose a class/i);
  assert(h.reader.querySelectorAll('a').some(n => /Browse all class entries/.test(n.textContent)));
  assert.deepEqual(h.calls, ['classes']);
  await h.route('#section=classes&browse=all');
  assert(h.reader.querySelectorAll('.result-name').some(n => n.textContent === 'Champion'));
  await h.route('#section=classes&filter=champion');
  assert.deepEqual(h.reader.querySelectorAll('.result-name').map(n => n.textContent), ['Champion']);
});

test('base class details list only their archetypes and archetypes link back', async () => {
  const h = boot(); await h.route('#section=classes&entry=Fighter&group=Base+class');
  const archetypes = h.reader.querySelector('.class-archetypes');
  assert(archetypes, 'Fighter should contain its archetypes');
  assert.deepEqual(archetypes.querySelectorAll('a').map(n => n.textContent), ['Battle master', 'Champion']);
  assert.doesNotMatch(archetypes.textContent, /Wild magic/);
  await h.route('#section=classes&entry=Champion&group=Fighter+archetype');
  assert(h.link('Base class · Fighter'));
});

test('a slow previous route cannot replace a newer route', async () => {
  const slow = deferred();
  const h = boot({classes: classData, spells: [entry('Arcane hex')]}, '', {load: key => key === 'classes' ? slow.promise : Promise.resolve()});
  await h.route('#section=classes');
  assert.match(h.reader.textContent, /Loading/i);
  await h.route('#section=spells&entry=Arcane+hex');
  assert.match(h.reader.textContent, /Arcane hex rules/);
  slow.resolve(); await settle();
  assert.match(h.reader.textContent, /Arcane hex rules/);
  assert.doesNotMatch(h.reader.textContent, /Choose a class/i);
});

test('search loads only its selected scope and preserves accent matching', async () => {
  const h = boot({classes: classData, spells: [entry('Élan bolt', 'Cantrips')]});
  await h.route('#q=elan&scope=spells');
  assert.deepEqual(h.calls, ['spells']);
  assert.deepEqual(h.reader.querySelectorAll('.result-name').map(n => n.textContent), ['Élan bolt']);
  await h.route('#q=champion');
  assert(h.reader.querySelectorAll('.result-name').some(n => n.textContent === 'Champion'));
  assert(h.calls.includes('classes'));
});

test('failed section requests show retry and retry the current route', async () => {
  let fail = true;
  const h = boot({classes: classData}, '#section=classes', {load: () => { if (fail) throw new Error('Network unavailable'); }}); await settle();
  assert.match(h.reader.textContent, /could not|unable to|couldn't/i);
  const retry = h.reader.querySelector('button'); assert(retry); assert.match(retry.textContent, /retry|try again/i);
  fail = false; retry.click(); await settle();
  assert.equal(h.reader.querySelectorAll('.result-name').length, 12);
});

test('summon picker reads canonical monsters on demand and navigates cards', async () => {
  const wolves = entry('Wolf', 'Beasts', {size:'Medium', type:'Beast', ac:13, hp:11, abilities:{str:12,dex:15}, actions:[{name:'Bite',description:'Canonical bite rules'}]});
  const bears = entry('Bear', 'Beasts', {type:'Beast', hp:34, traits:[{name:'Keen smell',description:'Canonical bear trait'}]});
  const spell = entry('Summon beasts', 'Primal', {description:'Call a companion.', summons:[{monster:'Wolf',notes:'A swift companion.'},{monster:'Bear'}]});
  const h = boot({spells:[spell], monsters:[wolves,bears]});
  await h.route('#section=spells&entry=Summon+beasts');
  assert.deepEqual(h.calls, ['spells','monsters']);
  const picker = h.reader.querySelector('.summon-picker'); assert(picker);
  assert.match(picker.textContent, /Canonical bite rules/); assert.match(picker.textContent, /Canonical bear trait/);
  const cards = picker.querySelectorAll('.summon-card'); assert.equal(cards.length, 2);
  assert.match(cards[0].querySelector('a').href, /section=monsters.*entry=Wolf/);
  const buttons = picker.querySelectorAll('button'); assert.equal(buttons.length, 2);
  assert.equal(buttons[0].disabled, true); buttons[1].click(); assert.equal(buttons[1].disabled, true); assert.equal(buttons[0].disabled, false);
  assert.doesNotMatch(cards[1].textContent, /Armor class|Strength/);
  await h.route('#section=monsters&entry=Wolf&group=Beasts');
  assert.match(h.reader.textContent, /Canonical bite rules/); assert.match(h.reader.textContent, /Armor class13/);
});

test('portable catalog fallback and rules prose render safely', async () => {
  const h = boot({rules:[entry('Unsafe <script>', '', {description:'A <strong>bold</strong> rule <img src=x onerror=alert(1)>'})]}, '#section=rules&entry=Unsafe+%3Cscript%3E', {portable:true}); await settle();
  assert.match(h.reader.textContent, /Unsafe <script>/);
  assert.equal(h.reader.querySelectorAll('script,img').length, 0);
  assert.equal(h.reader.querySelector('strong').textContent, 'bold');
});
