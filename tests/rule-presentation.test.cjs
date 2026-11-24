'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');

function setup() {
  class Node {
    constructor(tag,document){this.tag=tag;this.ownerDocument=document;this.className='';this.children=[];this.text='';this.attributes={};this.events={};this.open=false;}
    append(...nodes){this.children.push(...nodes);}
    set textContent(value){this.text=String(value);this.children=[];}
    get textContent(){return this.text+this.children.map(child=>child.textContent).join('');}
    set innerHTML(_){throw new Error('Rules must never be interpreted as HTML.');}
    setAttribute(key,value){this.attributes[key]=String(value);}
    addEventListener(name,fn){this.events[name]=fn;}
    all(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.all(tag)]);}
    byClass(name){return this.children.flatMap(child=>[...(child.className.split(' ').includes(name)?[child]:[]),...child.byClass(name)]);}
    click(){this.events.click?.();}
  }
  const document={createElement(tag){return new Node(tag,document);},createTextNode(text){const node=new Node('#text',document);node.textContent=text;return node;}};
  const context=vm.createContext({document,localStorage:{getItem:()=>null,setItem:()=>{}},confirm:()=>true});
  for(const name of ['rule-presentation.js','magic-items.js'])vm.runInContext(fs.readFileSync(path.join(root,'web',name),'utf8'),context);
  const render=(text,entry)=>{const host=document.createElement('div');context.RulePresentation.appendDescription(host,text,entry);return host;};
  return {context,document,render};
}

function catalog() {
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'site/data/catalog-manifest.json'),'utf8'));
  const section=manifest.sections.find(section=>section.key==='magic-items');
  return JSON.parse(fs.readFileSync(path.join(root,'site',section.url),'utf8')).entries;
}

const rulesText=host=>host.byClass('rule-copy').map(node=>node.textContent).join('');

test('every catalog item retains every rule character and original order in its reading layout',()=>{
  const {render}=setup();
  const entries=catalog();
  assert.equal(entries.length,300);
  for(const entry of entries) {
    for(const key of ['desc','description'])if(typeof entry.details?.[key]==='string') {
      const original=entry.details[key],before=JSON.stringify(entry),host=render(original,entry);
      assert.equal(rulesText(host),original,entry.name);
      assert.equal(JSON.stringify(entry),before,entry.name+' source was mutated');
    }
  }
});

test('Abyssal Harpoon exposes its three stages without changing damage, saves, or restrictions',()=>{
  const {render}=setup(),entry=catalog().find(entry=>entry.details.id==='mi-rare-066');
  const host=render(entry.details.desc,entry);
  assert.deepEqual(host.byClass('rule-section-heading').map(node=>node.textContent),['Throw','Tether','Pull']);
  assert.equal(rulesText(host),entry.details.desc);
  assert.match(host.byClass('rule-section')[2].textContent,/does not bypass the barrier or repeat without further movement/);
  assert.equal(host.byClass('rule-key').some(node=>node.textContent==='As a bonus action'),false);
  assert.equal(host.byClass('rule-key').some(node=>node.textContent==='bonus action'),true);
  assert.equal(host.byClass('rule-key').some(node=>node.textContent==='DC 8 + proficiency + your Strength modifier'),true);
});

test('custom edits do not inherit stale item-specific headings',()=>{
  const {render}=setup(),entry={name:'New harpoon',details:{id:'mi-rare-066'}};
  const text='This is a completely edited rule. You can carry a light.';
  const host=render(text,entry);
  assert.equal(host.byClass('rule-section-heading').length,0);
  assert.equal(rulesText(host),text);
});

test('author line breaks, abbreviations, decimals and markup-looking text remain literal',()=>{
  const {render}=setup();
  const text='Range 30 ft. As an action, deal 1d6 + 2 damage. Carry 2.5 lb., e.g. a tiny stone.\r\n\r\n<script>literal rules</script>\nDC 15 Dexterity save.  No HTML is created.';
  const host=render(text,{});
  assert.equal(rulesText(host),text);
  assert.equal(host.all('script').length,0);
  assert.match(host.textContent,/<script>literal rules<\/script>/);
  assert.equal(host.byClass('rule-key').some(node=>node.textContent==='DC 15'),true);
});

test('long ordinary rules gain paragraphs and explicit actions gain headings',()=>{
  const {render}=setup();
  const intro='While wearing this item, you may read the script that is printed inside the case. The writing remains visible only to you, and the item has no other effect on anyone carrying it. ';
  const detail='The light illuminates a five-foot radius and follows you until the effect ends. It passes through no barrier, and its appearance cannot grant any bonus to your attacks or saving throws. ';
  const text=intro+detail+'As a bonus action, extinguish the light. '+detail;
  const host=render(text,{});
  assert.equal(rulesText(host),text);
  assert.ok(host.byClass('rule-copy').length>1);
  assert.deepEqual(host.byClass('rule-section-heading').map(node=>node.textContent),['Bonus action']);
  const short=render('Gain 1d4 temporary HP.',{});
  assert.equal(short.byClass('rule-copy').length,1);
  assert.equal(short.byClass('rule-section-heading').length,0);
  assert.equal(render('',{}).children.length,0);
});

test('backup tools stay collapsed while errors remain discoverable and save is the primary editor action',()=>{
  const {context}=setup();
  const entry={name:'Ring',group:'Rare',source:'magic-items/rare.yaml',details:{id:'ring',type:'Ring',desc:'A literal rule.'}};
  const section={key:'magic-items',entries:[entry]};
  context.MagicItems.apply(section);
  const toolbar=context.MagicItems.toolbar(section,()=>{});
  assert.equal(toolbar.tag,'details');
  assert.equal(toolbar.open,false);
  assert.equal(toolbar.all('summary')[0].textContent,'Item tools');
  assert.deepEqual(toolbar.all('button').map(node=>node.textContent),['Export item edits','Import item edits']);
  const editor=context.MagicItems.editor(section,entry,()=>{});
  const save=editor.all('button').find(node=>node.textContent==='Save changes');
  assert.equal(save.type,'submit');
  assert.ok(save.className.split(' ').includes('button-primary'));
  const restore=editor.byClass('magic-reset-actions')[0].all('button')[0];
  assert.equal(restore.textContent,'Restore source version');
  assert.ok(restore.className.split(' ').includes('button-danger'));
  assert.equal(editor.byClass('magic-source-tools')[0].tag,'details');
  context.localStorage.setItem=()=>{throw new Error('Device storage unavailable');};
  assert.equal(context.MagicItems.save(entry,{...entry,name:'Edited ring'}),false);
  const failed=context.MagicItems.toolbar(section,()=>{});
  assert.equal(failed.open,true);
  assert.match(failed.textContent,/could not save item edits/);
});
