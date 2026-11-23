'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({crypto:require('node:crypto').webcrypto});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/character-state.js'),'utf8'),context);
const State=context.CharacterState,plain=v=>JSON.parse(JSON.stringify(v));
test('casting ledger survives backups without forcing automatic mode on legacy saves',()=>{
 const original=State.normalizeCharacter({build:{enabled:true,casting:{maxSlotLevel:3,spent:{'class:wizard:slot:1':2},exhausted:{'class:cleric:full:1':true}}}});
 assert.equal(original.build.casting.enabled,undefined);
 const loaded=State.importCharacter(State.exportCharacter(original));
 assert.deepEqual(plain(loaded.build.casting),plain(original.build.casting));
});
test('casting ledger validates modes, counts, slot override and full-slot state',()=>{
 for(const casting of [{enabled:'yes'},{maxSlotLevel:'invalid'},{spent:[]},{spent:{slot:1.5}},{spent:{slot:'bad'}},{exhausted:{slot:1}}]){
  assert.throws(()=>State.normalizeCharacter({build:{enabled:true,casting}}));
 }
 const c=State.normalizeCharacter({build:{enabled:true,casting:{enabled:false,maxSlotLevel:100,spent:{slot:-2},exhausted:{slot:false}}}});
 assert.equal(c.build.casting.maxSlotLevel,20);assert.equal(c.build.casting.spent.slot,0);
});
