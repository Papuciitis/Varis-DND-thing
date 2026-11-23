'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = () => fs.readFileSync(path.join(__dirname, '../web/catalog-loader.js'), 'utf8');
function boot(failFirst = false) {
  const requests = [];
  const sections = [{key:'classes',title:'Classes',count:1,url:'data/classes.hash.json'}, {key:'monsters',title:'Monsters',count:1,url:'data/monsters.hash.json'}];
  const data = {'data/catalog-manifest.json':{version:'catalog-test',sections,builder:'data/builder.hash.json'},
    'data/classes.hash.json':{key:'classes',title:'Classes',entries:[{name:'Fighter'}]},
    'data/monsters.hash.json':{key:'monsters',title:'Monsters',entries:[{name:'Imp'}]},
    'data/builder.hash.json':{classes:[{name:'Fighter'}]}};
  let failed = false;
  const context = vm.createContext({location:{protocol:'https:'}, fetch:async url => {
    requests.push(url);
    if (failFirst && !failed && url.includes('classes.hash')) {failed=true;return {ok:false,status:503};}
    return {ok:true,json:async()=>JSON.parse(JSON.stringify(data[url]))};
  }});
  vm.runInContext(source(), context);
  return {loader:context.DndCatalog,context,requests};
}
test('home loads only manifest, section requests deduplicate and preserve shared identity',async()=>{
  const {loader,requests} = boot();
  const sections = await loader.ready;
  assert.deepEqual(requests,['data/catalog-manifest.json']);
  assert.equal(sections[0].entries.length,0);
  const [a,b] = await Promise.all([loader.loadSection('classes'),loader.loadSection('classes')]);
  assert.equal(a,b);assert.equal(a,sections[0]);assert.equal(a.entries[0].name,'Fighter');
  assert.equal(requests.length,2);assert.equal(loader.version,'catalog-test');
  await loader.loadBuilder();await loader.loadBuilder();assert.equal(requests.length,3);
  await loader.loadAll();assert.equal(requests.length,4);
});
test('failed section can be retried, and unknown section is rejected',async()=>{
  const {loader,requests} = boot(true);await loader.ready;
  await assert.rejects(loader.loadSection('classes'),/503/);
  assert.equal((await loader.loadSection('classes')).entries[0].name,'Fighter');
  await assert.rejects(loader.loadSection('missing'),/Unknown section/);
  assert.equal(requests.filter(x=>x.includes('classes.hash')).length,2);
});
test('portable embedded data uses the same API without network requests',async()=>{
  const context=vm.createContext({DND_CATALOG:[{key:'classes',title:'Classes',entries:[{name:'Fighter'}]}],DND_CHARACTER_RULES:{classes:[]},DND_RULES_VERSION:'portable',fetch(){throw Error('Network requested');}});
  vm.runInContext(source(),context);
  assert.equal((await context.DndCatalog.loadSection('classes')).entries.length,1);
  assert.equal((await context.DndCatalog.loadAll()).length,1);
  assert.equal((await context.DndCatalog.loadBuilder()).classes.length,0);
  assert.equal(context.DndCatalog.version,'portable');
});
test('original file URL loads a script fallback and retains the URL for existing saves',async()=>{
  const scripts=[];
  const context=vm.createContext({location:{protocol:'file:',href:'file:///existing/site/character.html'},
    fetch(){throw Error('File URLs must not fetch JSON');},
    document:{createElement:()=>({}),head:{append(script){scripts.push(script.src);context.DND_CATALOG=[{key:'classes',entries:[]}];context.DND_CHARACTER_RULES={classes:[]};context.DND_RULES_VERSION='file-rules';script.onload();}}}});
  vm.runInContext(source(),context);
  const sections=await context.DndCatalog.ready;
  assert.deepEqual(scripts,['data/portable-catalog.js']);
  assert.equal(sections.length,1);assert.equal(context.DndCatalog.version,'file-rules');
  assert.equal(context.location.href,'file:///existing/site/character.html');
  assert.ok(context.DndCatalog.isLoaded('classes'));
  assert.equal((await context.DndCatalog.loadBuilder()).classes.length,0);
});
