'use strict';

// Delegated-event DOM simulation. This does not replace real-browser or layout QA.
const test = require('node:test');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const crypto=require('node:crypto').webcrypto;
const root=path.resolve(__dirname,'..');
const web=path.join(root,'web');
const catalog=require('./helpers/catalog.cjs')();
const source=fs.readFileSync(path.join(web,'character.html'),'utf8');
const decode=s=>s.replace(/&(amp|quot|#39|lt|gt);/g,(_,v)=>({amp:'&',quot:'"', '#39':"'", lt:'<',gt:'>'}[v]));
const storage=new Map();const key='vara.character-sheets.v1';const saved=()=>JSON.parse(storage.get(key));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const voids=new Set('img br hr input area base col embed link meta param source track wbr'.split(' '));
function boot(options={}){
 let downloads=[],blobData=new Map(),timers=new Map(),serial=0,document;
 const context={console,crypto,URLSearchParams,Blob,Date,Uint32Array,
  URL:{createObjectURL(blob){const u='blob:'+crypto.randomUUID();blobData.set(u,blob);return u;},revokeObjectURL(u){blobData.delete(u);}},
  setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},
  clearTimeout(id){timers.delete(id);},
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
  DND_CATALOG:catalog,DND_CHARACTER_RULES:options.metadata||{},DND_RULES_VERSION:'test-rules'};
 function fire(target,type,extra={}){const e={target,type,preventDefault(){},...extra};for(let n=target;n;n=n.parent)for(const l of n.listeners?.[type]||[])l(e);}
 function camel(s){return s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());}
 class E{
  constructor(tag,a={}){this.localName=tag;this.tagName=tag.toUpperCase();this.attrs=a;this.children=[];this.listeners={};this.parent=null;this.dataset={};
   for(const[k,v]of Object.entries(a))if(k.startsWith('data-'))this.dataset[camel(k.slice(5))]=v;
   this.id=a.id||'';this.checked='checked' in a;this.hidden='hidden' in a;this.open='open' in a;this.min=a.min??'';this.max=a.max??'';this.type=a.type??'';this._value=a.value??null;this.className=a.class??'';}
  get parentNode(){return this.parent}get parentElement(){return this.parent}get isConnected(){return this===document||!!this.parent?.isConnected}
  addEventListener(k,f){(this.listeners[k]??=[]).push(f)}
  setAttribute(k,v){this.attrs[k]=String(v);if(k.startsWith('data-'))this.dataset[camel(k.slice(5))]=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  append(n){n.parent=this;this.children.push(n)}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
  set innerHTML(s){for(const c of this.children)c.parent=null;this.children=[];this._text='';parse(s,this);}
  get textContent(){return (this._text||'')+this.children.map(n=>n.textContent).join('');}set textContent(t){this._text=String(t);this.children=[];}
  get value(){if(this._value!==null)return this._value;if(this.localName==='select'){const o=this.children.find(e=>'selected' in e.attrs)||this.children[0];return o?.attrs.value??o?.textContent??'';}return this.localName==='textarea'?this.textContent:'';}set value(v){this._value=String(v);}
  get style(){return this._style??={};}
  matches(s){if(s==='option:checked')return this.localName==='option'&&this.parent?.localName==='select'&&this.parent.value===(this.attrs.value??this.textContent);if(s.includes(','))return s.split(',').some(x=>this.matches(x.trim()));const tag=s.match(/^[a-z]+/i)?.[0];if(tag&&tag!==this.localName)return false;
   for(const m of s.matchAll(/#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g)){if(m[1]&&m[1]!==this.id)return false;if(m[2]&&!this.className.split(/\s+/).includes(m[2]))return false;if(m[3]&&(!(m[3]in this.attrs)||(m[4]!==undefined&&m[4]!==this.attrs[m[3]])))return false;}return true;}
  closest(sel){for(let n=this;n;n=n.parent)if(n.matches(sel))return n;return null;}
  find(f){for(const n of this.children){if(f(n))return n;const b=n.find(f);if(b)return b;}return null;}
  querySelector(s){return this.find(n=>n.matches(s));}
  querySelectorAll(s){const all=[];for(const c of this.children){if(c.matches(s))all.push(c);all.push(...c.querySelectorAll(s));}return all;}
  getElementById(id){return this.find(n=>n.id===id);}
  focus(){document.activeElement=this;}showModal(){this.open=true;}close(){this.open=false;fire(this,'close');}
  click(){if(this.localName==='a')downloads.push({name:this.download,blob:blobData.get(this.href)});fire(this,'click');}
 }
 function parse(src,root){const stack=[root];for(const match of src.matchAll(/<[^>]+>|[^<]+/gs)){const v=match[0];if(v.startsWith('<!'))continue;if(v.startsWith('</')){stack.pop();continue;}if(v[0]!=='<'){stack.at(-1)._text=(stack.at(-1)._text||'')+decode(v);continue;}const tag=v.match(/^<([\w-]+)/)[1].toLowerCase(),attrs={};for(const m of v.slice(tag.length+1,-1).matchAll(/([-\w:]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g)){attrs[m[1]]=decode(m[2]??m[3]??m[4]??'');}const n=new E(tag,attrs);stack.at(-1).append(n);if(!voids.has(tag)&&!v.endsWith('/>'))stack.push(n);}}
 document=new E('document');parse(source,document);document.body=document.querySelector('body');document.createElement=t=>new E(t);document.activeElement=document.body;context.document=document;context.window=new E('window');context.window.print=()=>{};
 const requests=[];
 if(options.lazy){
  const sections=catalog.map(section=>({...section,entries:[]}));const loaded=new Set();
  context.DND_CATALOG=sections;
  context.DndCatalog={ready:Promise.resolve(sections),version:'test-rules',isLoaded:key=>loaded.has(key),
   async loadBuilder(){requests.push('builder');return {};},
   async loadSection(key){requests.push(key);if(options.delay)await options.delay(key);const section=sections.find(item=>item.key===key);section.entries=catalog.find(item=>item.key===key).entries;loaded.add(key);return section;}};
 }
 const g=vm.createContext(context);for(const name of ['entry-order.js','magic-categories.js','item-views.js','magic-items.js','character-state.js','character-effects.js','character-equipment.js','character-casting.js','character-rules.js','character-builder.js','character.js'])vm.runInContext(fs.readFileSync(path.join(web,name),'utf8'),g,{filename:name});
 const q=(selector)=>{const n=document.querySelector(selector);assert(n,'missing control '+selector);return n;};
 const field=p=>q('[data-path="'+p+'"]');const action=(act,extra='')=>q('[data-action="'+act+'"]'+extra);
 function set(n,v,change=true){if(n.type==='checkbox')n.checked=v;else n.value=v;fire(n,'input');if(change)fire(n,'change');}
 function flush(){for(const [k,t] of [...timers])if(t.ms<=500){timers.delete(k);t.fn();}}
 return {q,field,action,fire,set,flush,downloads,document,context,requests};
}

test('spell views and slot rows sort by numeric level without changing saved edit targets',()=>{
 storage.clear();const base=boot();
 const all=catalog.find(s=>s.key==='spells').entries;
 const inferred=e=>e.details.lvl??(/cantrip/i.test(e.group)?0:null);
 const chosen=[all.find(e=>String(inferred(e))==='6'),all.find(e=>String(inferred(e))==='0'),all.find(e=>String(inferred(e))==='1')];
 const seed=base.context.CharacterState.normalizeCharacter({id:'ordered',spells:chosen.map((e,i)=>({id:'spell'+i,name:e.name,entryId:JSON.stringify(['spells',e.group,e.name])})),spellSlots:[{level:3,current:1,max:2},{level:1,current:2,max:4},{level:2,current:3,max:3}]});
 storage.set(key,JSON.stringify({version:1,activeId:seed.id,characters:[seed]}));const h=boot();
 const names=()=>h.q('#pane-spells').querySelectorAll('.list-card-title').map(e=>e.textContent);
 assert.deepEqual(names(),[chosen[1].name,chosen[2].name,chosen[0].name]);
 assert.deepEqual(h.q('#pane-spells').querySelectorAll('[data-slot-index]').map(e=>Number(e.dataset.slotIndex)),[1,2,0]);
 h.set(h.q('#spell-sort'),'name');assert.deepEqual(names(),chosen.map(e=>e.name).sort((a,b)=>a.localeCompare(b)));
 h.set(h.field('spellSlots.1.current'),1);h.flush();assert.equal(saved().characters[0].spellSlots.find(s=>s.level===1).current,1);
 assert.deepEqual(saved().characters[0].spells.map(e=>e.id),['spell0','spell1','spell2']);
 storage.clear();
});

test('play values stay readable while secondary ability and training adjustments remain functional',()=>{
 storage.clear();const h=boot();
 assert.equal(h.q('.ability').querySelector('input'),null);
 assert(h.field('abilities.str').closest('details'));
 assert(h.field('training.skills.Athletics').closest('details'));
 assert(h.field('resources.hp.max').closest('details'));
 h.set(h.field('abilities.str'),18);h.set(h.field('training.skills.Athletics'),2);h.flush();
 assert.equal(h.q('[data-effective-score="str"]').textContent,'18');
 assert.equal(h.q('[data-training-skill="Athletics"]').getAttribute('aria-label'),'Expertise');
 assert.equal(Number(h.q('[data-skill-roll="Athletics"]').dataset.bonus),8);
 assert.equal(saved().characters[0].abilities.str,18);
 storage.clear();
});

test('owned equipment search groups rows without changing their saved edit targets',()=>{
 storage.clear();const base=boot();const dagger=catalog.find(section=>section.key==='items').entries.find(entry=>entry.name==='Dagger');assert(dagger);
 const seed=base.context.CharacterState.normalizeCharacter({id:'grouped-gear',inventory:[
  {id:'bedroll',name:'Bedroll',quantity:1,notes:'Dry canvas'},
  {id:'dagger',name:dagger.name,entryId:JSON.stringify(['items',dagger.group,dagger.name]),quantity:1}
 ]});storage.set(key,JSON.stringify({version:1,activeId:seed.id,characters:[seed]}));const h=boot();
 assert.deepEqual(h.q('#owned-gear-groups').querySelectorAll('.list-card-title').map(node=>node.textContent),['Dagger','Bedroll']);
 const search=h.q('#owned-gear-search');h.set(search,'weapon',false);
 assert.deepEqual(h.q('#owned-gear-groups').querySelectorAll('.list-card-title').map(node=>node.textContent),['Dagger']);
 h.set(h.field('inventory.1.quantity'),3);h.flush();
 assert.deepEqual(saved().characters[0].inventory.map(item=>[item.id,item.quantity]),[['bedroll',1],['dagger',3]]);
 h.set(h.q('#owned-gear-search'),'not present',false);assert.match(h.q('#owned-gear-groups').textContent,/No equipment matches/);
 h.set(h.q('#owned-gear-search'),'',false);assert.equal(h.q('#owned-gear-groups').querySelectorAll('.gear-item').length,2);
 storage.clear();
});

test('changing sheet tabs starts at the content while routine redraws preserve the reading position',()=>{
 storage.clear();const h=boot();const positions=[];h.q('#sheet-content').scrollIntoView=options=>positions.push(options.block);
 h.q('[data-tab="gear"]').click();assert.deepEqual(positions,['start']);
 h.set(h.field('coins.gold'),4);h.flush();assert.deepEqual(positions,['start']);
 h.q('[data-tab="sheet"]').click();assert.deepEqual(positions,['start','start']);
 storage.clear();
});

test('printing includes all owned equipment and notes independently of search and closed item rows',()=>{
 storage.clear();const base=boot();
 const seed=base.context.CharacterState.normalizeCharacter({id:'print-pack',inventory:[
  {id:'bedroll',name:'Bedroll',quantity:1,notes:'Keep the dry canvas folded.'},
  {id:'potion',name:'Custom potion',quantity:3,notes:'Use only after resting.'}
 ]});storage.set(key,JSON.stringify({version:1,activeId:seed.id,characters:[seed]}));const h=boot();
 h.set(h.q('#owned-gear-search'),'bedroll',false);
 assert.equal(h.q('#owned-gear-groups').querySelectorAll('.gear-item').length,1);
 assert.equal(h.q('.gear-item').open,false);
 h.fire(h.context.window,'beforeprint');
 const printed=h.q('#print-inventory');
 assert.deepEqual(printed.querySelectorAll('.gear-print-name').map(node=>node.textContent),['Custom potion','Bedroll']);
 assert(printed.textContent.includes('Quantity 3'));
 assert(printed.textContent.includes('Keep the dry canvas folded.'));
 assert(printed.textContent.includes('Use only after resting.'));
 assert.equal(printed.querySelectorAll('details').length,0,'print notes must not depend on disclosure state');
 h.fire(h.context.window,'afterprint');
 assert.equal(h.q('#owned-gear-search').value,'bedroll');
 assert.equal(h.q('#owned-gear-groups').querySelectorAll('.gear-item').length,1);
 assert.deepEqual(saved().characters[0].inventory.map(item=>item.id),['bedroll','potion']);
 storage.clear();
});

test('owned catalog equipment shares compendium categories including Vial of mosa and source materials',()=>{
 storage.clear();const base=boot();const items=catalog.find(section=>section.key==='items').entries;
 const category=entry=>base.context.ItemViews.category(entry);
 const mosa=items.find(entry=>entry.name.toLowerCase()==='vial of mosa');assert(mosa);
 const samples=[[mosa,'Consumables'],...[
  ['weapons','Weapons'],['armor-shields','Armor & shields'],['items','Miscellaneous'],['materials','Miscellaneous'],['plants-fungi','Miscellaneous']
 ].map(([key,group])=>{const entry=items.find(item=>category(item)===key);assert(entry,key);return [entry,group];})];
 const seed=base.context.CharacterState.normalizeCharacter({id:'catalog-groups',inventory:samples.map(([entry],index)=>({id:'category-'+index,name:entry.name,entryId:JSON.stringify(['items',entry.group,entry.name]),quantity:1}))});
 storage.set(key,JSON.stringify({version:1,activeId:seed.id,characters:[seed]}));const h=boot();
 for(const [index,[entry,expected]] of samples.entries()){
  const row=h.q('[data-expanded="gear-category-'+index+'"]');
  assert.equal(row.closest('.gear-group').querySelector('.gear-group-title').textContent.replace(/\d+$/,''),expected,entry.name);
 }
 storage.clear();
});

test('spell picker defaults to level order and supports level filters and A-Z',()=>{
 storage.clear();const h=boot();h.action('catalog','[data-kind="spells"]').click();
 assert.equal(h.q('#catalog-sort').value,'level-asc');assert.ok(h.q('#catalog-level'));
 h.set(h.q('#catalog-level'),'2');
 const rows=h.q('#catalog-results').querySelectorAll('[data-action="add-catalog"]');assert.ok(rows.length);
 for(const row of rows){const id=JSON.parse(row.dataset.entryId);const e=catalog.find(s=>s.key===id[0]).entries.find(e=>e.name===id[2]&&e.group===id[1]);assert.equal(Number(e.details.lvl),2);}
 h.set(h.q('#catalog-sort'),'name');assert.equal(h.q('#catalog-level').value,'2');
 storage.clear();
});

test('inventory magic categories combine with rarity and category search while preserving stable saved identity',()=>{
 storage.clear();const h=boot();h.action('catalog','[data-kind="inventory"]').click();
 const category=h.q('#catalog-magic-category');
 const categories=h.context.MagicCategories.categories;
 assert.deepEqual(category.querySelectorAll('option').map(node=>node.value),['','all-magic',...categories.map(item=>item.key)]);
 assert.equal(category.querySelectorAll('option')[0].textContent,'All equipment');
 const magic=catalog.find(section=>section.key==='magic-items').entries;
 assert.equal(magic.length,300);
 const identity=entry=>h.context.MagicItems.entryId('magic-items',entry);
 const byIdentity=new Map(magic.map(entry=>[identity(entry),entry]));
 const visible=()=>h.q('#catalog-results').querySelectorAll('[data-action="add-catalog"]');
 h.set(category,'all-magic');
 assert.equal(h.q('#catalog-count').textContent,'300 matching rules');
 assert(visible().every(button=>byIdentity.has(button.dataset.entryId)));
 h.set(category,'weapons');
 assert(visible().length);
 assert(visible().every(button=>h.context.MagicCategories.category(byIdentity.get(button.dataset.entryId))==='weapons'));
 assert(!visible().some(button=>JSON.parse(button.dataset.entryId)[0]==='items'));
 h.set(category,'wearables');h.set(h.q('#catalog-query'),'jewellery',false);
 const wearables=magic.filter(entry=>h.context.MagicCategories.category(entry)==='wearables');
 assert.equal(h.q('#catalog-count').textContent,`${wearables.length} matching rules`);
 assert(visible().every(button=>h.context.MagicCategories.category(byIdentity.get(button.dataset.entryId))==='wearables'));
 const rarity=wearables[0].group;h.set(h.q('#catalog-group'),rarity);
 const matching=wearables.filter(entry=>entry.group===rarity);
 assert.equal(h.q('#catalog-count').textContent,`${matching.length} matching ${matching.length===1?'rule':'rules'}`);
 assert(h.q('#catalog-results').querySelectorAll('.list-card-meta').every(node=>node.textContent===`Wearables & jewelry · ${rarity}`));
 const selected=byIdentity.get(visible()[0].dataset.entryId),selectedId=identity(selected);
 visible()[0].click();h.action('close-dialog').click();
 assert.equal(saved().characters[0].inventory[0].entryId,selectedId);
 assert.deepEqual(JSON.parse(selectedId),['magic-items','',selected.details.id]);
 const reopened=boot();
 assert.equal(saved().characters[0].inventory[0].entryId,selectedId);
 assert(reopened.q('#pane-gear').textContent.includes(selected.name));
 reopened.action('catalog','[data-kind="spells"]').click();
 assert.equal(reopened.document.getElementById('catalog-magic-category'),null);
 storage.clear();
});

test('hosted inventory lazily loads all magic items before its category filter is used',async()=>{
 storage.clear();const h=boot({lazy:true});await delay(0);
 assert(!h.requests.includes('magic-items'));
 h.action('catalog','[data-kind="inventory"]').click();await delay(0);
 assert(h.requests.includes('magic-items'));
 h.set(h.q('#catalog-magic-category'),'all-magic');
 assert.equal(h.q('#catalog-count').textContent,'300 matching rules');
 assert(h.q('#catalog-results').querySelectorAll('[data-action="add-catalog"]').every(button=>JSON.parse(button.dataset.entryId)[0]==='magic-items'));
 h.set(h.q('#catalog-query'),'potions',false);
 assert(h.q('#catalog-results').querySelectorAll('.list-card-meta').some(node=>node.textContent.startsWith('Potions & consumables · ')));
 storage.clear();
});

test('spell groups agree with the reader and zero-level hexes are not labelled cantrips',()=>{
 storage.clear();const base=boot();const spells=catalog.find(section=>section.key==='spells').entries;
 const selected=[spells.find(rule=>rule.group==='Greater hexes'),spells.find(rule=>rule.group==='Arcane cantrips')];assert(selected.every(Boolean));
 const seed=base.context.CharacterState.normalizeCharacter({id:'zero-labels',spells:selected.map((rule,index)=>({id:'zero'+index,name:rule.name,entryId:JSON.stringify(['spells',rule.group,rule.name])}))});
 storage.set(key,JSON.stringify({version:1,activeId:seed.id,characters:[seed]}));const h=boot();
 const meta=h.q('#pane-spells').querySelectorAll('.list-card-meta').map(node=>node.textContent);
 assert(meta.some(text=>text.includes('Greater hexes · Level 0')));assert(meta.some(text=>text.includes('Arcane cantrips · Cantrip')));
 assert.equal(h.q('#spell-filter').querySelectorAll('option').find(node=>node.value==='0').textContent,'Level 0 / cantrips');
 h.action('catalog','[data-kind="spells"]').click();
 assert.deepEqual(h.q('#catalog-group').querySelectorAll('option').slice(1).map(node=>node.textContent),['Arcane cantrips','Arcane spells','Mystic cantrips','Mystic spells','Oath cantrips','Oath spells','Occult cantrips','Occult spells','Minor hexes','Major hexes','Greater hexes','Geomorphy spells']);
 assert.equal(h.q('#catalog-level').querySelectorAll('option').find(node=>node.value==='0').textContent,'Level 0 / cantrips');
 h.set(h.q('#catalog-group'),'Greater hexes');
 const hexMeta=h.q('#catalog-results').querySelectorAll('.list-card-meta');assert(hexMeta.length);assert(hexMeta.every(node=>node.textContent==='Greater hexes · Level 0'));
 h.set(h.q('#catalog-group'),'Arcane cantrips');assert(h.q('#catalog-results').querySelectorAll('.list-card-meta').every(node=>node.textContent==='Arcane cantrips · Cantrip'));
 storage.clear();
});

test('class summary uses the singular label for one cantrip',()=>{
 storage.clear();const base=boot();const manifest=JSON.parse(fs.readFileSync(path.join(root,'site/data/catalog-manifest.json'),'utf8'));
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'site',manifest.builder),'utf8'));const occultist=metadata.classes.find(row=>row.name==='Occultist');assert(occultist);
 const seed=base.context.CharacterState.normalizeCharacter({id:'one-cantrip',level:1,build:{enabled:true,classId:occultist.id}});
 storage.set(key,JSON.stringify({version:1,activeId:seed.id,characters:[seed]}));const h=boot({metadata});
 const summary=h.q('#class-casting').querySelector('.section-note').textContent;assert.match(summary,/\b1 cantrip\b/);assert.doesNotMatch(summary,/\b1 cantrips\b/);
 storage.clear();
});

test('class slots are initialized from real progression, spend safely and keep legacy manual rows',()=>{
 storage.clear();const base=boot();
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'site/data/catalog-manifest.json'),'utf8'));
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'site',manifest.builder),'utf8'));
 const wizard=metadata.classes.find(c=>c.name==='Wizard');
 const seed=base.context.CharacterState.normalizeCharacter({id:'caster',level:5,build:{enabled:true,classId:wizard.id}});
 storage.set(key,JSON.stringify({version:1,activeId:seed.id,characters:[seed]}));let h=boot({metadata});
 const pools=()=>h.q('#class-casting').querySelectorAll('.casting-pool');
 assert.deepEqual(pools().map(n=>n.querySelector('[data-casting-current]').textContent),['3','2','1']);
 const firstId=pools()[0].dataset.poolId;h.action('casting-spend').click();
 assert.equal(saved().characters[0].build.casting.spent[firstId],1);assert.equal(pools()[0].querySelector('[data-casting-current]').textContent,'2');
 h=boot({metadata});assert.equal(pools()[0].querySelector('[data-casting-current]').textContent,'2');
 const legacy=base.context.CharacterState.normalizeCharacter({id:'legacy',level:5,build:{enabled:true,classId:wizard.id},spellSlots:[{level:1,current:1,max:2}]});
 storage.set(key,JSON.stringify({version:1,activeId:legacy.id,characters:[legacy]}));h=boot({metadata});
 assert.equal(h.q('#class-casting').querySelectorAll('.casting-pool').length,0);h.action('enable-casting').click();
 assert.equal(pools()[0].querySelector('[data-casting-current]').textContent,'2');
 assert.equal(saved().characters[0].spellSlots[0].current,1);assert.equal(saved().characters[0].spellSlots[0].max,2);
 storage.clear();
});

test('Cleric whole-slot casting respects the chosen spell level and features sort by grant level',()=>{
 storage.clear();const base=boot();
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'site/data/catalog-manifest.json'),'utf8'));
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'site',manifest.builder),'utf8'));
 const cleric=metadata.classes.find(c=>c.name==='Cleric');
 const seed=base.context.CharacterState.normalizeCharacter({id:'cleric',level:5,build:{enabled:true,classId:cleric.id,casting:{maxSlotLevel:3}}});
 storage.set(key,JSON.stringify({version:1,activeId:seed.id,characters:[seed]}));const h=boot({metadata});
 h.action('casting-spend').click();
 const available=()=>h.q('#class-casting').querySelector('[data-casting-current]').textContent;
 assert.equal(available(),'2');h.q('#class-casting').querySelector('[data-cast-level]').value='3';h.action('casting-whole').click();
 assert.equal(available(),'2');assert.match(h.q('#toast').textContent,/Not enough/);
 const levels=h.q('#pane-features').querySelectorAll('summary').map(n=>n.textContent.match(/· level (\d+)/)?.[1]).filter(Boolean).map(Number);
 assert.ok(levels.length);assert.deepEqual(levels,[...levels].sort((a,b)=>a-b));assert.equal(h.q('#feature-sort').value,'level-asc');
 storage.clear();
});

test('hosted character starts with core rules, lazily opens spells, and restores saved rule references',async()=>{
 storage.clear();
 const h=boot({lazy:true});await delay(0);
 assert.deepEqual(h.requests,['builder','classes','races','items']);
 assert.equal(h.q('.sheet-shell').inert,false);
 h.action('catalog','[data-kind="spells"]').click();await delay(0);
 assert.equal(h.requests.at(-1),'spells');assert.match(h.q('#catalog-count').textContent,/matching/);
 h.document.querySelector('[data-action="add-catalog"]').click();h.action('close-dialog').click();
 assert.equal(saved().characters[0].spells.length,1);
 const reopened=boot({lazy:true});await delay(0);
 assert.ok(reopened.requests.includes('spells'));
 assert.doesNotMatch(reopened.q('#pane-spells').textContent,/missing from this rules snapshot|has not loaded/);
 assert.ok(!reopened.requests.includes('monsters'));
 storage.clear();
});

test('a delayed rule picker cannot replace a newer character dialog',async()=>{
 storage.clear();let resolve;
 const pending=new Promise(done=>{resolve=done;});
 const h=boot({lazy:true,delay:key=>key==='spells'?pending:Promise.resolve()});await delay(0);
 h.action('catalog','[data-kind="spells"]').click();
 h.action('identity').click();assert.equal(h.q('#dialog-title').textContent,'Edit character');
 resolve();await delay(0);
 assert.equal(h.q('#dialog-title').textContent,'Edit character');
 storage.clear();
});
test('character controls, backups and concurrent saves (DOM simulation)', {timeout:30000}, async()=>{
 let h=boot();const set=(p,v)=>h.set(h.field(p),v),act=(...args)=>h.action(...args).click(),direct=(name,v)=>h.set(h.q('#'+name),v);const cur=()=>{const s=saved();return s.characters.find(x=>x.id===s.activeId);};
 h.set(h.q('#character-name'),'Naura of Druva',false);h.flush();assert.equal(cur().name,'Naura of Druva');h=boot();assert.equal(h.q('#character-name').value,'Naura of Druva');
 for(const [k,v] of Object.entries({hp:20,tempHP:4,arcaneHealth:8,block:5,tempBlock:1})){set('resources.'+k+'.max',v);set('resources.'+k+'.current',v);}
 act('resource','[data-key="block"][data-delta="-2"]');assert.equal(cur().resources.tempBlock.current,0);assert.equal(cur().resources.block.current,4);
 act('grant-temp');h.q('#temp-grant').value='3';act('apply-temp');act('grant-temp');h.q('#temp-grant').value='2';act('apply-temp');assert.equal(cur().resources.tempBlock.current,3);
 h.q('#health-pool').value='hp';h.q('#health-amount').value='6';act('health','[data-sign="-1"]');assert.equal(cur().resources.hp.current,14);assert.equal(cur().resources.tempHP.current,4);assert.equal(cur().resources.arcaneHealth.current,8);
 direct('health-pool','arcaneHealth');direct('health-amount','2');const impendingClick=h.action('health','[data-sign="-1"]');h.fire(h.field('resources.arcaneHealth.current'),'change');assert(impendingClick.isConnected);impendingClick.click();assert.equal(cur().resources.arcaneHealth.current,6);assert.equal(cur().resources.hp.current,14);assert.equal(h.q('#health-pool').value,'arcaneHealth');assert.equal(h.q('#health-amount').value,'2');
 set('abilities.str',16);set('training.skills.Athletics','2');set('training.skillBonuses.Athletics',1);h.flush();
 assert.equal(h.action('roll','[data-label="Strength check"]').dataset.bonus,'3');assert.equal(h.action('roll','[data-label="Athletics"]').dataset.bonus,'8');
 for(const [kind,sec,word]of [['spells','spells','arcane hex'],['inventory','items','Dagger'],['features','feats','Agile']]){
  act('catalog','[data-kind="'+kind+'"]');const entry=catalog.find(x=>x.key===sec).entries.find(x=>x.name.toLowerCase()===word.toLowerCase())||catalog.find(x=>x.key===sec).entries[0];
  h.set(h.q('#catalog-query'),entry.name,false);const id=JSON.stringify([sec,entry.group,entry.name]);
  const choose=()=>{const b=h.document.querySelectorAll('[data-action="add-catalog"]').find(n=>n.dataset.entryId===id);assert(b,entry.name);b.click();};choose();choose();act('close-dialog');
  const records=cur()[kind];assert.equal(records.length,kind==='inventory'?2:1);assert.equal(new Set(records.map(i=>i.id)).size,records.length);assert(records.every(i=>i.entryId===id));
 }
 set('spells.0.prepared',true);set('inventory.0.equipped',true);h.flush();const original=cur();assert(original.spells[0].prepared);assert(original.inventory[0].equipped);assert(!original.inventory[1].equipped);
 act('export');const [download]=h.downloads;assert.equal(download.name,'Naura-of-Druva.json');const text=await download.blob.text();assert(JSON.parse(text).character.spells[0].prepared);
 const backup=h.q('#backup-input'),beforeInvalid=storage.get(key),invalidNumber=JSON.parse(text);invalidNumber.character.resources.hp.current=1.25;
 for(const invalid of ['{}','{',JSON.stringify({...JSON.parse(text),version:2}),JSON.stringify(invalidNumber)]){
  backup.files=[{size:invalid.length,text:async()=>invalid}];h.fire(backup,'change');await delay(5);
  assert.equal(storage.get(key),beforeInvalid,'invalid import changed existing saves');assert.equal(saved().characters.length,1);assert.equal(cur().id,original.id);assert.equal(h.q('#character-name').value,original.name);assert.match(h.q('#toast').textContent,/backup|file|format|version|number/i);
 }
 backup.files=[{size:text.length,text:async()=>text}];h.fire(backup,'change');await delay(5);assert.equal(saved().characters.length,2);assert.notEqual(cur().id,original.id);assert.equal(cur().spells[0].entryId,original.spells[0].entryId);assert(cur().inventory[0].equipped);h=boot();assert.equal(h.q('#character-name').value,original.name);assert(h.field('spells.0.prepared').checked);
 {
  act('add-slot');act('add-slot');set('spellSlots.1.level',1);h.flush();
  assert.equal(new Set(cur().spellSlots.map(s=>s.level)).size,cur().spellSlots.length,'duplicate slot levels persisted');h=boot();assert.equal(h.q('#character-name').value,original.name);
 }
 const idle=boot(), active=boot();const beforeEdit=cur().id;
 active.set(active.q('#character-name'),'Newer in active tab');active.flush();assert.equal(cur().id,beforeEdit);
 const latest=storage.get(key);idle.fire(idle.context.window,'pagehide');assert.equal(storage.get(key),latest,'idle closing tab overwrote newer changes');
 const typing=boot();const max=typing.field('resources.hp.max'),current=typing.field('resources.hp.current');
 typing.set(max,'100');typing.set(current,'100');typing.flush();assert.equal(cur().resources.hp.current,100);
 max.focus();for(const digits of ['2','20','200']){typing.set(max,digits,false);typing.flush();assert.equal(cur().resources.hp.current,100);assert.equal(cur().resources.hp.max,100);}
 typing.fire(max,'change');typing.flush();assert.equal(cur().resources.hp.current,100);assert.equal(cur().resources.hp.max,200);
 current.focus();typing.set(current,'87',false);assert.equal(cur().resources.hp.current,100);typing.fire(typing.context.window,'pagehide');assert.equal(cur().resources.hp.current,87);assert.equal(boot().field('resources.hp.current').value,'87');
 const hidden=boot();const hiddenCurrent=hidden.field('resources.hp.current');hiddenCurrent.focus();hidden.set(hiddenCurrent,86,false);hidden.document.hidden=true;hidden.fire(hidden.document,'visibilitychange');assert.equal(cur().resources.hp.current,86);
 const exportNumeric=boot();const pending=exportNumeric.field('resources.hp.current');pending.focus();exportNumeric.set(pending,85,false);exportNumeric.action('export').click();assert.equal(JSON.parse(await exportNumeric.downloads[0].blob.text()).character.resources.hp.current,85);
 console.log('PASS — typing 2, 20, 200 without change never clamps 100 current HP; committing saves maximum 200; pagehide, hidden and backup export flush the pending numeric input.');
 {
  for(const fieldName of ['resources.hp.current','training.skillBonuses.Perception']){
   const staleNumber=boot(),editor=boot();staleNumber.field(fieldName).focus();editor.set(editor.q('#character-name'),'Newer after focus on '+fieldName);editor.flush();
   const beforeIdle=storage.get(key);staleNumber.fire(staleNumber.context.window,'pagehide');assert(storage.get(key)===beforeIdle,'Closing a tab with an unchanged, focused '+fieldName+' wrote to storage after another tab edited that character');
  }
  console.log('PASS — stale tab pagehide with focused untouched HP or an absent skill-bonus field displayed at 0 leaves newer storage byte-identical.');
 }
 const left=boot(),right=boot(),beforeNames=saved().characters.length;
 for(const [tab,name]of [[left,'Independent tab A'],[right,'Independent tab B']]){
   tab.action('new').click();tab.set(tab.field('name'),name);tab.flush();tab.action('done').click();
 }
 const both=saved().characters;assert.equal(both.length,beforeNames+2);assert(both.some(c=>c.name==='Independent tab A'));assert(both.some(c=>c.name==='Independent tab B'));
 console.log("PASS — markup-backed delegated UI harness: autosave/reload; 2-block cross-pool spend; max grant; HP/Arcane/temp HP independence; health choices retained; blur retains button; ability and skill bonuses; catalog IDs, duplicates and equipment copies; backup export, invalid and valid file imports; idle tab cannot overwrite a newer save; two independently created sheets coexist.");
 {const first=both.find(c=>c.name==='Independent tab A');const chooser=boot();chooser.set(chooser.q('#character-picker'),first.id);const reopened=boot();assert.equal(reopened.q('#character-name').value,first.name,'last selected character did not survive reload');}
 const originalForConflict=cur(),beforeConflict=saved().characters.length,writer=boot(),stale=boot();
 writer.set(writer.field('notes'),'Independent first edit');writer.flush();
 stale.set(stale.q('#character-name'),'Conflicting name');stale.flush();
 const conflicted=saved(),firstWriter=conflicted.characters.find(c=>c.id===originalForConflict.id),copy=cur();
 assert.equal(conflicted.characters.length,beforeConflict+1);assert.equal(firstWriter.notes,'Independent first edit');assert.equal(firstWriter.name,originalForConflict.name);
 assert.notEqual(copy.id,firstWriter.id);assert.equal(copy.name,'Conflicting name (local copy)');assert.equal(copy.notes,originalForConflict.notes);
 assert.equal(stale.q('#character-picker').value,copy.id,'conflict copy must be selected in the character picker');
 assert.equal(stale.q('#character-name').value,copy.name,'header must show the conflict copy name');
 assert.match(stale.q('#toast').textContent,/another tab.+separate copy/);
 stale.set(stale.field('notes'),'Second edit on local copy');stale.flush();
 assert.equal(saved().characters.length,beforeConflict+1);assert.equal(cur().id,copy.id);assert.equal(cur().notes,'Second edit on local copy');

 const unavailable=boot(),beforeFailure=storage.get(key);let failedAttempts=0;
 unavailable.context.localStorage.setItem=()=>{failedAttempts++;throw new Error('Quota exceeded');};
 unavailable.set(unavailable.q('#character-name'),'Unsaved but exportable');unavailable.flush();
 assert.equal(failedAttempts,1);assert.equal(storage.get(key),beforeFailure);assert.match(unavailable.q('#save-status').textContent,/backup/i);
 unavailable.action('export').click();assert.equal(JSON.parse(await unavailable.downloads[0].blob.text()).character.name,'Unsaved but exportable');
 assert.equal(failedAttempts,1);assert.equal(storage.get(key),beforeFailure);

 const good=[structuredClone(firstWriter),structuredClone(copy)];const broken={id:'broken-id',name:'Broken',abilities:{str:[]}};
 const damagedBytes=JSON.stringify({version:1,activeId:broken.id,characters:[broken,...good]},null,2)+'\n';storage.set(key,damagedBytes);
 const recovery=boot();assert.equal(recovery.q('#character-name').value,good[0].name);assert.equal(recovery.q('#character-picker').children.length,2);assert.match(recovery.q('#toast').textContent,/Some device saves/);
 recovery.set(recovery.q('#character-picker'),good[1].id);assert.equal(recovery.q('#character-name').value,good[1].name);
 recovery.set(recovery.q('#character-name'),'Recovered with changes');recovery.flush();recovery.fire(recovery.context.window,'pagehide');
 recovery.action('export').click();assert.equal(JSON.parse(await recovery.downloads[0].blob.text()).character.name,'Recovered with changes');assert.equal(storage.get(key),damagedBytes);
 console.log('PASS — colliding same-character edits are preserved separately, subsequent edits target the copy, quota failure preserves prior bytes and supports export, partially invalid roster allows navigation/export and preserves original storage bytes.');
});
