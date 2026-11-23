'use strict';

// Exercise the reader's rendered DOM and navigation with a deliberately delayed
// data boundary. Layout and native swipe behavior still need browser inspection.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
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
  vm.runInContext(source, context, {filename: 'app.js'});
  const reader = document.getElementById('reader');
  return {document, reader, calls, sections, async route(hash) { location.hash = hash; window.dispatch('hashchange'); await settle(); }, link(text) { return reader.querySelectorAll('a').find(n => n.textContent === text); }};
}

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
