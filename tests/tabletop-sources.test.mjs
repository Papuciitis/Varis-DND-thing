import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalSources} from '../tabletop/web/sources.mjs';
import {characterStats,SHEETS_KEY} from '../tabletop/web/resources.mjs';

const rules={derive:()=>({armorClass:10,speed:30,abilities:{}}),reconcile:character=>structuredClone(character)};
const make=()=>({id:'character-b',name:'New character',resources:{hp:{current:23,max:30},tempHP:{current:0,max:0},arcaneHealth:{current:0,max:0},block:{current:2,max:4},tempBlock:{current:0,max:0}},notes:'Keep these unrelated notes',inventory:[{name:'Keep this item'}]});
function storageFixture(source,run){
  const original=globalThis.localStorage,data=new Map([[SHEETS_KEY,JSON.stringify({characters:[source],activeId:source.id})],['vara.tabletop.links.v1',JSON.stringify({test:{id:source.id,kind:'character'}})]]);
  globalThis.localStorage={getItem:key=>data.get(key) ?? null,setItem:(key,value)=>data.set(key,value)};
  try{return run(data);}finally{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;}
}
test('switching linked characters never copies the previous character HP into the newly selected sheet',()=>{
  const source=make();storageFixture(source,data=>{
    const old={...characterStats(source,rules.derive(source)),hp:5,resourceRevision:4};old.statblock.sourceId='character-a';
    const result=LocalSources.prototype.syncServerResources.call({key:()=> 'test'},old,source,rules,[]);
    assert.equal(result.resources.hp.current,23);assert.equal(JSON.parse(data.get(SHEETS_KEY)).characters[0].resources.hp.current,23);
    assert.equal(JSON.parse(data.get('vara.tabletop.links.v1')).test.resourceRevision,4);
  });
});
test('server health changes for the same linked character update HP while preserving equipment and unrelated notes',()=>{
  const source=make();storageFixture(source,data=>{
    const changed={...characterStats(source,rules.derive(source)),hp:7,resourceRevision:3};
    const result=LocalSources.prototype.syncServerResources.call({key:()=> 'test'},changed,source,rules,[]);
    assert.equal(result.resources.hp.current,7);assert.equal(result.notes,source.notes);assert.deepEqual(result.inventory,source.inventory);
    assert.equal(JSON.parse(data.get(SHEETS_KEY)).characters[0].resources.hp.current,7);
  });
});
