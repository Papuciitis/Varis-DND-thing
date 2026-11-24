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
  const downloads=[],objectUrls=new Map();
  class Node {
    constructor(tag = '') { this.localName = tag; this.children = []; this.parentNode = null; this.listeners = {}; this.attributes = {}; this.className = ''; this.value = ''; this._text = ''; this.scrollLeft = 0; this.clientWidth = 500; }
    get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.replaceChildren(); }
    get childElementCount() { return this.children.filter(n => !['#text', '#fragment'].includes(n.localName)).length; }
    get firstElementChild() { return this.children.find(n => n.localName !== '#text'); }
    get firstChild() { return this.children[0]; }
    get isConnected() { return this === document || !!this.parentNode?.isConnected; }
    get classList() { return {add: name => { this.className += ' ' + name; }}; }
    append(...nodes) { for (let node of nodes) { if (typeof node === 'string') { const t = new Node('#text'); t._text = node; node = t; } if (node.localName === '#fragment') { this.append(...node.children); node.children = []; } else { node.parentNode = this; this.children.push(node); } } }
    replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...nodes); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    dispatch(type, extra = {}) { for (const listener of this.listeners[type] || []) listener({target: this, preventDefault() {}, ...extra}); }
    click() { if (!this.disabled) {if(this.localName==='a'&&this.download)downloads.push({name:this.download,blob:objectUrls.get(this.href)});this.dispatch('click');} }
    focus() { document.activeElement = this; }
    select() {}
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); this.parentNode = null; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatch('close'); }
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
  document.body = document;
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
    showSaveFilePicker: options.showSaveFilePicker,
    Blob,setTimeout:fn=>fn(),URL:{createObjectURL(blob){const url='blob:test-'+objectUrls.size;objectUrls.set(url,blob);return url;},revokeObjectURL(url){objectUrls.delete(url);}},
    localStorage: {getItem:key=>options.storage?.get(key) || null,setItem:(key,value)=>{if(options.storageFailure)throw new Error('Storage unavailable');if(options.storage)options.storage.set(key,value);}},
    history: {replaceState(_state, _title, hash) { location.hash = hash; }},
    Option: function Option(name, value) { const node = new Node('option'); node.textContent = name; node.value = value; return node; }
  });
  if (options.manifestGlobal) context.DND_CATALOG = sections;
  if (options.portable) { context.DND_CATALOG = sections; sections.forEach(s => { s.entries = data[s.key]; }); delete context.DndCatalog; }
  vm.runInContext(orderSource, context, {filename:'entry-order.js'});
  for (const name of ['magic-categories.js', 'item-views.js', 'browse-views.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../web',name),'utf8'),context,{filename:name});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/magic-items.js'),'utf8'),context,{filename:'magic-items.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/monster-editor.js'),'utf8'),context,{filename:'monster-editor.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/monster-views.js'),'utf8'),context,{filename:'monster-views.js'});
  vm.runInContext(source, context, {filename: 'app.js'});
  const reader = document.getElementById('reader');
  return {document, reader, calls, sections, downloads, get hash() { return location.hash; }, async route(hash) { location.hash = hash; window.dispatch('hashchange'); await settle(); }, async change(id, value) { const select = document.getElementById(id); assert(select, 'Missing '+id); select.value = value; select.dispatch('change'); window.dispatch('hashchange'); await settle(); }, link(text) { return reader.querySelectorAll('a').find(n => n.textContent === text); }};
}

const names = h => h.reader.querySelectorAll('.result-name, .monster-list-name').map(node => node.textContent);

test('monster type and fractional CR filters combine with search and preserve display settings', async () => {
  const h = boot({monsters:[
    entry('Ash wolf','Wilderness',{meta:'Medium beast, unaligned',cr:'1/4',hp:'11'}),
    entry('Ash dragon','Dragons',{meta:'Large dragon, neutral',cr:'5',hp:'100'}),
    entry('Ash mystery','Wilderness',{meta:'Small beast',hp:'8'})
  ]});
  await h.route('#section=monsters');
  assert.equal(h.reader.querySelectorAll('.monster-disclosure').length,3);
  await h.change('monster-type','beast'); assert.deepEqual(names(h),['Ash wolf','Ash mystery']);
  await h.change('monster-cr','1/4'); assert.deepEqual(names(h),['Ash wolf']);
  const search=h.document.getElementById('section-search');search.value='ash';search.dispatch('input');await settle();
  assert.equal(new URLSearchParams(h.hash.slice(1)).get('cr'),'1/4');
  assert.equal(new URLSearchParams(h.hash.slice(1)).get('type'),'beast');
  await h.change('entry-view','pages');assert(h.reader.querySelector('.results'));assert.deepEqual(names(h),['Ash wolf']);
  await h.change('monster-cr','unknown');assert.deepEqual(names(h),['Ash mystery']);
  await h.route('#section=monsters&type=dragon&cr=2-5');assert.deepEqual(names(h),['Ash dragon']);
});

test('expandable monster rows render on first open, expand independently, and remember opened entries', async () => {
  const h=boot({monsters:[entry('Wolf','Beasts',{meta:'Medium beast',hp:'11',abilities:{str:'12'},actions:[{name:'Bite',description:'Bite rules'}]}),entry('Bear','Beasts',{meta:'Large beast',hp:'34',actions:[{name:'Claw',description:'Claw rules'}]})]});
  await h.route('#section=monsters');assert.equal(h.reader.querySelectorAll('.monster-parchment').length,0);
  let rows=h.reader.querySelectorAll('.monster-disclosure');rows[0].open=true;rows[0].dispatch('toggle');
  assert.equal(h.reader.querySelectorAll('.monster-parchment').length,1);
  rows[1].open=true;rows[1].dispatch('toggle');assert.equal(h.reader.querySelectorAll('.monster-parchment').length,2);
  assert(rows[0].open&&rows[1].open);
  await h.change('entry-sort','challenge-desc');
  rows=h.reader.querySelectorAll('.monster-disclosure');assert(rows.every(row=>row.open));
  assert.equal(h.reader.querySelectorAll('.monster-parchment').length,2);
  assert.match(h.reader.textContent,/12 \(\+1\)/);
  assert(h.reader.querySelectorAll('a').some(link=>link.textContent==='Open monster page'));
});

test('monster authoring refreshes the catalog, persists, exports YAML, and leaves Cancel unchanged', async () => {
  const storage = new Map();
  const original = {...entry('City guard', 'Guards', {ac:'12', hp:'20', abilities:{dex:'14'}, actions:[{name:'Spear', description:'Attack +3; Block DC 11.'}]}), source:'monsters/guards.yaml'};
  const h = boot({monsters:[original]}, '', {storage});
  await h.route('#section=monsters');
  h.reader.querySelectorAll('button').find(button => button.textContent === 'Add your monster statblock').click();
  let dialog = h.document.querySelector('dialog');
  const input = (title, root=dialog) => root.querySelectorAll('label').find(label => label._text === title).querySelector('input');
  input('Name').value = 'Lantern wisp';
  input('Hit points').value = '7';
  dialog.querySelector('form').dispatch('input');
  assert.match(dialog.querySelector('.monster-editor-preview').textContent, /Lantern wisp/);
  dialog.querySelector('form').dispatch('submit');
  await h.route(h.hash);
  assert.match(h.reader.textContent, /Lantern wisp/);
  assert.match(h.reader.textContent, /Hit Points\s*7/);
  await h.route('#section=monsters');
  assert.deepEqual(names(h), ['Lantern wisp', 'City guard']);
  h.reader.querySelectorAll('button').find(button => button.textContent === 'Export custom.yaml').click();
  assert.equal(h.downloads[0].name, 'custom.yaml');
  assert.match(await h.downloads[0].blob.text(), /name: "Lantern wisp"/);
  const reloaded = boot({monsters:[original]}, '#section=monsters', {storage});
  await settle();
  assert(names(reloaded).includes('Lantern wisp'));
  await h.route('#section=monsters&entry=Lantern+wisp&group=Custom+monsters');
  h.reader.querySelectorAll('button').find(button => button.textContent === 'Edit statblock').click();
  dialog = h.document.querySelector('dialog'); input('Name').value = 'Discard this';
  dialog.querySelectorAll('button').find(button => button.textContent === 'Cancel').click();
  assert.equal(h.document.querySelector('dialog'), null);
  assert.match(h.reader.textContent, /Lantern wisp/);
  assert.doesNotMatch(h.reader.textContent, /Discard this/);
});

test('browser monster renames keep summon cards linked to their original identity', async () => {
  const monster = {...entry('Skeleton', 'Undead', {hp:'13', actions:[{name:'Claw', description:'Block DC 12.'}]}), source:'monsters/undead.yaml'};
  const spell = entry('Raise skeleton', 'Occult spells', {summons:[{monster:'Skeleton'}]});
  const h = boot({monsters:[monster], spells:[spell]}, '', {storage:new Map()});
  await h.route('#section=monsters&entry=Skeleton&group=Undead');
  h.reader.querySelectorAll('button').find(button => button.textContent === 'Edit statblock').click();
  const dialog = h.document.querySelector('dialog');
  dialog.querySelectorAll('label').find(label => label._text === 'Name').querySelector('input').value = 'Rattler';
  dialog.querySelector('form').dispatch('submit'); await settle();
  await h.route('#section=spells&entry=Raise+skeleton&group=Occult+spells');
  const card = h.reader.querySelector('.summon-card');
  assert.match(card.textContent, /Rattler/);
  assert.doesNotMatch(card.textContent, /not available/);
  assert.match(card.querySelector('a').href, /entry=Rattler/);
});

test('monster sources remain collapsed and obsolete source rules are excluded from search', async () => {
  const monster = {...entry('Ash bird', 'Beasts', {hp:'9', actions:[{name:'Peck', description:'An unblocked strike deals fire damage.'}], original_5e:'Legacy spellslots', replacement_sources:[{name:'Donor beast', source:'https://example.test/rules'}]}), source:'monsters/ash.yaml'};
  const h = boot({monsters:[monster]});
  await h.route('#section=monsters&entry=Ash+bird&group=Beasts');
  const sources = h.reader.querySelectorAll('.monster-provenance');
  assert.equal(sources.length, 2); assert(sources.every(block => !block.open));
  await h.route('#q=Legacy+spellslots&scope=monsters'); assert.deepEqual(names(h), []);
  await h.route('#q=unblocked+strike&scope=monsters'); assert.deepEqual(names(h), ['Ash bird']);
});

test('saving a selected custom YAML file preserves compiled additions and reuses its handle', async () => {
  const writes = []; let selections = 0, closes = 0;
  const custom = {...entry('Saved beast', 'Custom monsters', {id:'custom-saved', hp:'12'}), source:'monsters/custom.yaml'};
  const h = boot({monsters:[custom]}, '', {showSaveFilePicker:async () => {
    selections++;
    return {name:'custom.yaml', createWritable:async () => ({write:async text => writes.push(text), close:async () => {closes++;}})};
  }});
  await h.route('#section=monsters');
  const save = h.reader.querySelectorAll('button').find(button => button.textContent.startsWith('Save YAML file'));
  save.click(); await settle(); save.click(); await settle();
  assert.equal(selections, 1); assert.equal(writes.length, 2); assert.equal(closes, 2);
  assert.match(writes[0], /name: "Saved beast"/);
  assert.match(h.reader.querySelector('.monster-tools').textContent, /Saved custom.yaml/);
});
const leveledSpells = [entry('Alpha third', 'Arcane', {lvl:'3'}), entry('Zeta first', 'Arcane', {level:1}), entry('Élan first', 'Arcane', {lvl:'1'}), entry('Beta second', 'Mystic', {lvl:'2'}), entry('Zing', 'Arcane cantrips', {description:'A cantrip'}), entry('A missing', 'Arcane', {description:'No stated spell level'})];

test('magic item browsing filters converted rules, hides original comparisons and saves item edits',async()=>{
  const storage=new Map();
  const items=[{...entry('Ember blade','Rare',{id:'ember',type:'Weapon',rarity:'Rare',desc:'An unblocked strike deals fire damage.',original_5e:'Obsolete healing surge wording.',conversion_notes:'Convert surge to rest dice.',source_name:'Workbook blade',source_price:'100 gp',source_ref:'Rare!A2:F2'}),source:'magic-items/rare.yaml'},
    {...entry('Frost ring','Uncommon',{id:'frost',type:'Ring',rarity:'Uncommon',desc:'Cold resistance.'}),source:'magic-items/uncommon.yaml'}];
  const h=boot({'magic-items':items},'',{storage});await h.route('#section=magic-items');
  assert.equal(h.document.getElementById('group'),null);
  assert.deepEqual(h.reader.querySelectorAll('.panel-name').map(node=>node.textContent),['Weapons & ammunition','Wearables & jewelry']);
  assert(h.link('Uncommon (1)'));assert(h.link('Rare (1)'));
  await h.route('#section=magic-items&browse=all');
  assert.deepEqual(names(h),['Ember blade','Frost ring']);assert(h.document.getElementById('magic-rarity'));assert(h.document.getElementById('magic-type'));
  await h.change('magic-rarity','Rare');assert.deepEqual(names(h),['Ember blade']);
  await h.route('#section=magic-items&filter=surge');assert.deepEqual(names(h),[]);
  await h.route('#section=magic-items&entry=Ember+blade&group=Rare');
  const original=h.reader.querySelectorAll('.magic-provenance').find(node=>node.querySelector('summary').textContent==='Original 5e text');assert(original);assert.equal(!!original.open,false);
  const edit=h.reader.querySelector('.magic-editor'),form=edit.querySelector('form');
  assert.equal(h.reader.querySelectorAll('.magic-provenance').length,3);
  const sourceBlock=h.reader.querySelectorAll('.magic-provenance').find(node=>node.querySelector('summary').textContent==='Source workbook');assert(sourceBlock);assert.equal(!!sourceBlock.open,false);assert(sourceBlock.textContent.includes('Workbook blade'));
  assert.equal(form.querySelectorAll('label').some(node=>/^Source /.test(node.querySelector('span')?.textContent || '')),false);
  const description=form.querySelectorAll('label').find(node=>node.querySelector('span')?.textContent==='Converted rules');assert(description);
  description.querySelector('textarea').value='A converted fire burst.';form.dispatch('submit');await settle();
  assert(h.reader.textContent.includes('A converted fire burst.'));assert.equal(storage.size,1);
  await h.route('#section=magic-items&filter=burst');assert.deepEqual(names(h),['Ember blade']);
});

test('source export validates and saves the unsaved editor draft before downloading its complete collection',async()=>{
  const storage=new Map(),items=['One','Two'].map((name,index)=>({...entry(name,'Rare',{id:'item-'+index,desc:'Original converted rules.',source_name:name,original_5e:'Workbook original.'}),source:'magic-items/rare.yaml'}));
  const h=boot({'magic-items':items},'',{storage});await h.route('#section=magic-items&entry=One&group=Rare');
  const form=h.reader.querySelector('.magic-editor').querySelector('form');
  const field=title=>form.querySelectorAll('label').find(node=>node.querySelector('span')?.textContent===title).querySelector(title==='Converted rules'?'textarea':'input');
  const exportButton=form.querySelectorAll('button').find(node=>node.textContent==='Export source file');
  field('Name').value='Campaign version';field('Converted rules').value='Unsaved converted burst.';exportButton.click();
  assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].name,'rare.yaml');assert.equal(storage.size,1);
  const exported=JSON.parse(await h.downloads[0].blob.text());assert.equal(exported.entries.length,2);assert.equal(exported.entries[0].name,'Campaign version');assert.equal(exported.entries[0].desc,'Unsaved converted burst.');assert.equal(exported.entries[0].source_name,'One');assert.equal(exported.entries[1].name,'Two');
  field('Name').value='';exportButton.click();assert.equal(h.downloads.length,1);assert.match(form.textContent,/Each item needs a name/);
  field('Name').value='Two';exportButton.click();assert.equal(h.downloads.length,1);assert.match(form.textContent,/already has this name/);
});

test('source export recovers current editor changes when browser storage cannot save',async()=>{
  const item={...entry('One','Rare',{id:'one',desc:'Original rules.'}),source:'magic-items/rare.yaml'};
  const h=boot({'magic-items':[item]},'',{storageFailure:true});await h.route('#section=magic-items&entry=One&group=Rare');
  const form=h.reader.querySelector('.magic-editor').querySelector('form');
  form.querySelectorAll('label').find(node=>node.querySelector('span')?.textContent==='Converted rules').querySelector('textarea').value='Recovered current rules.';
  form.querySelectorAll('button').find(node=>node.textContent==='Export source file').click();
  assert.equal(h.downloads.length,1);assert.equal(JSON.parse(await h.downloads[0].blob.text()).entries[0].desc,'Recovered current rules.');assert.match(form.textContent,/Source file exported.*could not save/);
});

test('hex source tiers order within level zero without changing their spell level', async () => {
  const spells = [entry('B greater','Greater hexes',{lvl:'0'}),entry('Z minor','Minor hexes',{lvl:'0'}),entry('A major','Major hexes',{lvl:'0'}),entry('B minor','Minor hexes',{lvl:'0'}),entry('Z cantrip','Arcane cantrips',{lvl:'0'}),entry('A cantrip','Mystic cantrips',{lvl:'0'}),entry('A first','Arcane spells',{lvl:'1'}),entry('A unknown','Magic rules')];
  const h = boot({spells}); await h.route('#section=spells&sort=level-asc');
  assert.deepEqual(names(h), ['A cantrip','Z cantrip','B minor','Z minor','A major','B greater','A first','A unknown']);
  const hex = h.reader.querySelectorAll('.result').find(node => node.querySelector('.result-name').textContent === 'B greater');
  assert.match(hex.textContent, /Level 0/);
  await h.route('#section=spells&sort=level-desc');
  assert.deepEqual(names(h), ['A first','B greater','A major','B minor','Z minor','A cantrip','Z cantrip','A unknown']);
  await h.route('#section=spells&sort=name');
  assert.deepEqual(names(h), ['A cantrip','A first','A major','A unknown','B greater','B minor','Z cantrip','Z minor']);
  await h.route('#section=spells&filter=minor'); assert.deepEqual(names(h), ['B minor','Z minor']);
});

test('spell class filter has four combined classes while hexes and references stay accessible', async () => {
  const groups = ['Arcane cantrips','Arcane spells','Mystic cantrips','Mystic spells','Oath cantrips','Oath spells','Occult cantrips','Occult spells','Minor hexes','Major hexes','Greater hexes','Ancient rituals','Magic rules'];
  const h = boot({spells:groups.toReversed().map((group,index)=>entry('Entry '+index,group,{lvl:'0'}))}); await h.route('#section=spells');
  const select = h.document.getElementById('group'); assert(select);
  assert.deepEqual(select.children.slice(1).map(node=>node.textContent), ['Arcane','Oath','Occult','Mystic']);
  await h.change('group','Arcane');
  assert.equal(names(h).length, 2);
  assert(h.link('Minor hexes')); assert(h.link('Magic rules'));
  await h.route(h.link('Minor hexes').href);
  assert.equal(names(h).length, 1); assert.match(h.reader.querySelector('.result').textContent, /Level 0/);
});

test('browse and result-page links use plain labels', async () => {
  const h = boot({classes:classData,spells:Array.from({length:26},(_,index)=>entry('Spell '+index,'Arcane spells',{lvl:'1'}))});
  await h.route('#section=classes'); assert(h.link('Browse all class entries'));
  await h.route('#section=spells'); assert(h.link('Next'));
  await h.route('#section=spells&page=2'); assert(h.link('Previous'));
});

test('spell directory defaults to class of magic then level and name, with explicit numeric orders available', async () => {
  const h = boot({spells:leveledSpells}); await h.route('#section=spells');
  assert.deepEqual(names(h), ['Zing','Élan first','Zeta first','Alpha third','A missing','Beta second']);
  assert.equal(h.reader.querySelectorAll('.groups').length, 0);
  const sort = h.document.getElementById('entry-sort'); assert(sort); assert.equal(sort.value, 'magic-asc');
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
  assert(h.reader.querySelectorAll('.monster-list-cr').some(node=>node.textContent.includes('CR 1/4')));
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
  assert.match(h.reader.textContent, /Canonical bite rules/); assert.match(h.reader.textContent, /Armor Class\s*13/);
});

test('portable catalog fallback and rules prose render safely', async () => {
  const h = boot({rules:[entry('Unsafe <script>', '', {description:'A <strong>bold</strong> rule <img src=x onerror=alert(1)>'})]}, '#section=rules&entry=Unsafe+%3Cscript%3E', {portable:true}); await settle();
  assert.match(h.reader.textContent, /Unsafe <script>/);
  assert.equal(h.reader.querySelectorAll('script,img').length, 0);
  assert.equal(h.reader.querySelector('strong').textContent, 'bold');
});

test('entry navigation stays in its original group and item category, including disabled ends', async () => {
  const items = [entry('A gear','Miscellaneous magical items'),entry('Memory stone fragment','Miscellaneous magical items'),entry('Z gear','Miscellaneous magical items')];
  const h = boot({items,spells:[entry('First','Arcane spells',{lvl:1}),entry('Last','Arcane spells',{lvl:3}),entry('Cantrip','Arcane cantrips',{lvl:0})]});
  await h.route('#section=items&entry=A+gear&group=Miscellaneous+magical+items');
  let nav = h.reader.querySelector('.entry-navigation');
  assert.equal(nav.querySelector('[aria-disabled="true"]').textContent,'Previous');
  assert.equal(nav.querySelector('a').getAttribute('aria-label'),'Next entry: Z gear');
  assert.match(nav.textContent,/1 of 2/);
  await h.route(nav.querySelector('a').href);
  nav = h.reader.querySelector('.entry-navigation');
  assert.equal(nav.querySelector('[aria-disabled="true"]').textContent,'Next');
  assert.equal(nav.querySelector('a').getAttribute('aria-label'),'Previous entry: A gear');
  await h.route('#section=spells&entry=Last&group=Arcane+spells');
  nav = h.reader.querySelector('.entry-navigation');
  assert.equal(nav.querySelector('a').getAttribute('aria-label'),'Previous entry: First');
  assert.equal(nav.querySelectorAll('a').length,1);
});

test('race comparison defaults to every entry with independent bodies and no duplicate feature picker IDs', async () => {
  const races=Array.from({length:30},(_,index)=>entry('Race '+index,'Ancestries',{
    description:'Race '+index+' rules',
    sections:Array.from({length:6},(_,n)=>({heading:'Feature '+n,body:'Feature text '+n}))
  }));
  const h=boot({races});await h.route('#section=races');
  assert.equal(h.document.getElementById('entry-view').value,'list');
  assert.equal(h.reader.querySelectorAll('.comparison-entry').length,30);
  assert.equal(h.reader.querySelectorAll('#chapter-picker').length,0);
  assert.equal(h.reader.querySelectorAll('.pagination').length,0);
  const cards=h.reader.querySelectorAll('.comparison-entry');cards[0].open=true;cards[1].open=true;
  assert.equal(cards[0].open,true);assert.equal(cards[1].open,true);
  assert.match(cards[29].querySelector('.comparison-body').textContent,/Feature text 5/);
  await h.change('entry-view','pages');
  assert.equal(names(h).length,24);assert(h.link('Next'));
});

test('feats and backgrounds offer a complete comparison list while retaining group and text filters', async () => {
  for(const key of ['feats','backgrounds']){
    const records=Array.from({length:29},(_,index)=>entry('Choice '+index,index<27?'Common':'Other'));
    const h=boot({[key]:records});await h.route('#section='+key+'&group=Common');
    assert.equal(names(h).length,24);
    await h.change('entry-view','list');
    assert.equal(names(h).length,27);
    assert.equal(new URLSearchParams(h.hash.slice(1)).get('group'),'Common');
    const input=h.document.getElementById('section-search');input.value='Choice 26';input.dispatch('input');await settle();
    assert.deepEqual(names(h),['Choice 26']);
    assert.equal(h.document.getElementById('entry-view').value,'list');
  }
});

test('mini traits render under their parent ability as named nested choices without a Trait options heading', async () => {
  const race=entry('Dwarf','',{traits:[{name:'Dwarven traits',description:'Choose two traits.',minitrait_list:[{'Ironbeard':'Armor benefit.'},{name:'Craftsmanship',description:'Tool benefit.'}]}]});
  const h=boot({races:[race]});await h.route('#section=races&entry=Dwarf');
  assert.doesNotMatch(h.reader.textContent,/Trait options/);
  const list=h.reader.querySelector('.trait-children');assert(list);
  assert.equal(list.querySelectorAll('.trait-child').length,2);
  assert.match(list.parentNode.textContent,/Dwarven traitsChoose two traits/);
  assert.match(list.textContent,/IronbeardArmor benefit/);assert.match(list.textContent,/CraftsmanshipTool benefit/);
  await h.route('#section=races');assert(h.reader.querySelector('.comparison-body').querySelector('.trait-children'));
});

test('item shelves and nested weapons preserve source links and allow ordinary result pages', async () => {
  const dagger={...entry('Dagger','simple melee',{type:'simple',group:'daggers',damage:'1d4p',properties:'agile, light'}),source:'weapons.yaml'};
  const bow={...entry('Shortbow','simple ranged',{type:'simple',group:'bows',damage:'1d6p',properties:'range 60/120'}),source:'weapons.yaml'};
  const plate=entry('Plate','Heavy armor',{'Base AC':'18'}),plant=entry('Wispcap','Special flora and fungus'),potion=entry('Healing draught','Potions');
  const h=boot({items:[dagger,bow,plate,plant,potion,entry('Rope','Equipment'),entry('Iron','Special metals and alloys')]});
  await h.route('#section=items');
  assert.deepEqual(h.reader.querySelectorAll('.panel-name').map(node=>node.textContent),['Weapons','Armor & shields','Items','Consumables','Materials','Special plants & fungi']);
  await h.route('#section=items&category=weapons');
  assert(h.reader.querySelector('.weapon-tree'));
  assert.match(h.reader.textContent,/Simple weapons/);assert.match(h.reader.textContent,/Melee/);assert.match(h.reader.textContent,/Ranged/);
  const links=h.reader.querySelectorAll('.weapon-entry-link');assert.equal(links.length,2);
  assert.equal(new URLSearchParams(links[0].href.slice(1)).get('group'),'simple melee');
  await h.change('entry-view','pages');assert.deepEqual(names(h),['Dagger','Shortbow']);
  assert.equal(new URLSearchParams(h.hash.slice(1)).get('category'),'weapons');
  await h.change('item-category','armor-shields');assert.deepEqual(names(h),['Plate']);
  await h.route('#section=items&group=Heavy+armor');assert.deepEqual(names(h),['Plate']);
});

test('a class of magic includes spells and level-zero cantrips through filters and legacy group links', async () => {
  const h=boot({spells:[entry('Arcane zero','Arcane cantrips'),entry('Arcane tenth','Arcane spells',{lvl:10}),entry('Oath zero','Oath cantrips'),entry('Oath first','Oath spells',{lvl:1})]});
  await h.route('#section=spells&group=Arcane');assert.deepEqual(names(h),['Arcane zero','Arcane tenth']);
  await h.change('spell-level','0');assert.deepEqual(names(h),['Arcane zero']);
  await h.route('#section=spells&group=Arcane+spells');assert.deepEqual(names(h),['Arcane zero','Arcane tenth']);
  await h.route('#section=spells');assert.deepEqual(names(h),['Arcane zero','Arcane tenth','Oath zero','Oath first']);
});

test('object-map trait choices like Shadowling render as individual children while named records remain intact', async () => {
  const options=Object.fromEntries(Array.from({length:15},(_,index)=>['Shadow gift '+index,'Gift rules '+index]));
  const race=entry('Shadowling','',{traits:[{name:'Shadow gifts',minitrait_list:options},{name:'Other gifts',minitrait_list:{name:'Named gift',description:'Named rules'}}]});
  const h=boot({races:[race]});await h.route('#section=races&entry=Shadowling');
  const lists=h.reader.querySelectorAll('.trait-children');
  assert.equal(lists[0].querySelectorAll('.trait-child').length,15);
  assert.equal(lists[1].querySelectorAll('.trait-child').length,1);
  assert.match(lists[0].textContent,/Shadow gift 14Gift rules 14/);
  assert.match(lists[1].textContent,/Named giftNamed rules/);
});

test('magic categories combine with rarity, type and search while legacy rarity routes still work', async () => {
  const make=(name,id,type,category,rarity='Rare')=>({...entry(name,rarity,{id,type,category,rarity,desc:'Converted campaign rules.'}),source:'magic-items/rare.yaml'});
  const items=[make('Ember blade','ember','Weapon','weapons'),make('Ember arrow','arrow','Ammunition','weapons'),make('Ember common','common','Weapon','weapons','Common'),make('Ember plate','plate','Armor','armor-shields'),make('Frost ring','ring','Ring','wearables')];
  const h=boot({'magic-items':items});await h.route('#section=magic-items');
  assert.deepEqual(h.reader.querySelectorAll('.panel-name').map(node=>node.textContent),['Weapons & ammunition','Armor & shields','Wearables & jewelry']);
  assert(h.reader.querySelector('.panel-examples'));assert(h.link('Browse all 5 entries'));
  await h.route('#section=magic-items&category=weapons');assert.deepEqual(names(h),['Ember arrow','Ember blade','Ember common']);
  await h.change('magic-rarity','Rare');assert.deepEqual(names(h),['Ember arrow','Ember blade']);
  await h.change('magic-type','Weapon');assert.deepEqual(names(h),['Ember blade']);
  const query=h.document.getElementById('section-search');query.value='ember';query.dispatch('input');await settle();assert.deepEqual(names(h),['Ember blade']);
  const state=new URLSearchParams(h.hash.slice(1));assert.equal(state.get('category'),'weapons');assert.equal(state.get('rarity'),'Rare');assert.equal(state.get('type'),'Weapon');
  await h.route('#section=magic-items&group=Rare');assert.equal(names(h).length,4);
  await h.route('#section=magic-items&filter=armour');assert.deepEqual(names(h),['Ember plate']);
  await h.route('#q=jewellery&scope=magic-items');assert.deepEqual(names(h),['Frost ring']);
});

test('editing a magic category refreshes browsing and search, persists through reload and exports with stable source identity', async () => {
  const storage=new Map(),original={...entry('Crystal charm','Rare',{id:'crystal',type:'Wondrous item',category:'misc',rarity:'Rare',desc:'A reusable charm.'}),source:'magic-items/rare.yaml'};
  const h=boot({'magic-items':[JSON.parse(JSON.stringify(original))]},'',{storage});await h.route('#section=magic-items&entry=Crystal+charm&group=Rare');
  let form=h.reader.querySelector('.magic-editor').querySelector('form');
  let category=form.querySelectorAll('label').find(label=>label.querySelector('span')?.textContent==='Category').querySelector('select');
  category.value='wearables';form.dispatch('submit');await settle();
  assert.match(h.document.getElementById('trail').textContent,/Wearables & jewelry/);
  await h.route('#section=magic-items&category=wearables&filter=jewellery');assert.deepEqual(names(h),['Crystal charm']);
  const reloaded=boot({'magic-items':[JSON.parse(JSON.stringify(original))]},'#section=magic-items&category=wearables',{storage});await settle();assert.deepEqual(names(reloaded),['Crystal charm']);
  await h.route('#section=magic-items&entry=Crystal+charm&group=Rare');form=h.reader.querySelector('.magic-editor').querySelector('form');
  form.querySelectorAll('button').find(button=>button.textContent==='Export source file').click();
  const exported=JSON.parse(await h.downloads[0].blob.text());
  assert.equal(exported.entries[0].category,'wearables');assert.equal(exported.entries[0].id,'crystal');assert.equal(exported.entries[0].group,'Rare');
});

test('magic item entry navigation never crosses its category even within the same rarity collection', async () => {
  const items=[entry('A blade','Rare',{id:'a',type:'Weapon',category:'weapons'}),entry('M ring','Rare',{id:'m',type:'Ring',category:'wearables'}),entry('Z blade','Rare',{id:'z',type:'Weapon',category:'weapons'})];
  const h=boot({'magic-items':items});await h.route('#section=magic-items&entry=A+blade&group=Rare');
  const nav=h.reader.querySelector('.entry-navigation');assert.equal(nav.querySelectorAll('a').length,1);
  assert.equal(nav.querySelector('a').getAttribute('aria-label'),'Next entry: Z blade');
  const crumbs=h.document.getElementById('trail').querySelectorAll('a');
  assert(crumbs.some(link=>link.href.includes('category=weapons')));
});
