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
  DND_CATALOG:catalog,DND_RULES_VERSION:'test-rules'};
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
 const g=vm.createContext(context);for(const name of ['character-state.js','character-effects.js','character-equipment.js','character-rules.js','character-builder.js','character.js'])vm.runInContext(fs.readFileSync(path.join(web,name),'utf8'),g,{filename:name});
 const q=(selector)=>{const n=document.querySelector(selector);assert(n,'missing control '+selector);return n;};
 const field=p=>q('[data-path="'+p+'"]');const action=(act,extra='')=>q('[data-action="'+act+'"]'+extra);
 function set(n,v,change=true){if(n.type==='checkbox')n.checked=v;else n.value=v;fire(n,'input');if(change)fire(n,'change');}
 function flush(){for(const [k,t] of [...timers])if(t.ms<=500){timers.delete(k);t.fn();}}
 return {q,field,action,fire,set,flush,downloads,document,context,requests};
}

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
