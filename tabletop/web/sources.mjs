import {SHEETS_KEY,MONSTERS_KEY,characterStats,monsterStats,monsterId,updateCharacterResources} from './resources.mjs';

const LINKS_KEY='vara.tabletop.links.v1';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}};
const request=async path=>{
  const response=await fetch(new URL('../'+path,import.meta.url));
  if(!response.ok)throw new Error('The rules could not be loaded. Rebuild the preview and try again.');
  return response.json();
};
const sameValue=(a,b)=>{
  if(a===b)return true;if(!a || !b || typeof a!=='object' || typeof b!=='object' || Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a);return keys.length===Object.keys(b).length && keys.every(key=>Object.hasOwn(b,key) && sameValue(a[key],b[key]));
};
let references;
export function loadReferences() {
  if(!references)references=(async()=>{
    for(const name of ['magic-categories','item-views','magic-items','monster-editor','character-conditions','character-state','character-effects','character-equipment','character-casting','character-prerequisites','character-feats','character-rules']){
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src=new URL('./sheet/'+name+'.js',import.meta.url);
        script.onload=resolve;script.onerror=()=>reject(new Error('Character helpers could not load. Rebuild the preview.'));document.head.append(script);
      });
    }
    const manifest=await request('data/catalog-manifest.json');
    const [metadata,...sections]=await Promise.all([request(manifest.builder),...manifest.sections.map(section=>request(section.url))]);
    for(const section of sections)globalThis.MagicItems.apply(section);
    return {rules:globalThis.CharacterRules.create(metadata,sections),catalog:sections,monsters:sections.find(section=>section.key==='monsters')?.entries || []};
  })().catch(error=>{references=null;throw error;});
  return references;
}

export class LocalSources {
  constructor({getView,getServer,onPull,onConditions,notify,onChange}) {
    Object.assign(this,{getView,getServer,onPull,onConditions,notify,onChange});this.tail=Promise.resolve();
    window.addEventListener('storage',event=>{
      if([MONSTERS_KEY,'vara.magic-items.v1'].includes(event.key))references=null;
      if([SHEETS_KEY,MONSTERS_KEY,'vara.magic-items.v1'].includes(event.key)){this.onChange?.();this.pull();}
    });
    window.addEventListener('focus',()=>{this.onChange?.();this.pull();});
  }
  key(id) {const view=this.getView();return this.getServer()+'|'+view.id+'|'+view.self.id+'|'+id;}
  linkFor(id) {return this.getView()?read(LINKS_KEY,{})[this.key(id)]:null;}
  characters() {const list=read(SHEETS_KEY,{}).characters;return Array.isArray(list)?list.filter(character=>character && typeof character.id==='string'):[];}
  async monsters() {
    const base=(await loadReferences()).monsters;
    if(globalThis.MonsterEditor)return globalThis.MonsterEditor.apply({key:'monsters',entries:base}).entries;
    const entries=new Map(base.map(entry=>[monsterId(entry),entry]));
    for(const change of read(MONSTERS_KEY,{}).changes || [])if(change.entry)entries.set(change.key,{...change.entry,_monsterEditorKey:change.key});
    return [...entries.values()];
  }
  async link(id,kind,sourceId) {
    const session=this.getView(),token=session?.scene.tokens.find(token=>token.id===id);
    if(!token?.canEditStats)throw new Error('Only the token owner can link a sheet.');
    const targetKey=this.key(id);
    await loadReferences();
    if(this.getView()?.id!==session.id || this.getView()?.self.id!==session.self.id)throw new Error('Your table changed. Link the sheet again.');
    const links=read(LINKS_KEY,{});links[targetKey]={kind,id:sourceId};
    try{localStorage.setItem(LINKS_KEY,JSON.stringify(links));}
    catch{throw new Error('This browser cannot remember the link. Enable local storage first.');}
    await this.pull();
  }
  unlink(id) {
    const links=read(LINKS_KEY,{});delete links[this.key(id)];
    try{localStorage.setItem(LINKS_KEY,JSON.stringify(links));}
    catch{this.notify('This browser could not remove the local link.',true);}
    this.onChange?.();
  }
  pull() {
    const next=this.tail.then(()=>this.doPull());
    this.tail=next.catch(error=>this.notify(error.message,true));return next;
  }
  observeConditions() {
    const view=this.getView();if(!view)return;
    const linked=view.scene.tokens.filter(token=>token.canEditStats && this.linkFor(token.id)?.kind==='character');
    const signature=JSON.stringify([view.id,view.self.id,linked.map(token=>[token.id,token.conditionsRevision,token.resourceRevision])]);
    if(signature!==this.conditionSignature){this.conditionSignature=signature;if(linked.length)this.pull();}
  }
  async syncConditions(token,source) {
    if(!Array.isArray(token.conditions) || !Number.isInteger(token.conditionsRevision))return source;
    const conditions=globalThis.CharacterConditions,key=this.key(token.id),links=read(LINKS_KEY,{}),link=links[key];
    if(!link || link.kind!=='character')return null;
    const own=conditions.forCharacter(source),ownSignature=conditions.signature(own);
    const initial=link.conditionsRevision===undefined && token.conditionsRevision===0 && !token.conditions.length;
    const edited=link.conditionsRevision===token.conditionsRevision && ownSignature!==link.conditionsSignature;
    let sent=false;
    if((initial && own.length || edited) && this.onConditions){
      const next=await this.onConditions(token.id,token.conditionsRevision,own);if(!next)return null;
      token=next.scene.tokens.find(row=>row.id===token.id);if(!token)return null;sent=true;
    }
    const current=this.getView(),latestToken=current?.scene.tokens.find(row=>row.id===token.id);
    if(!current || this.key(token.id)!==key || !latestToken?.canEditStats)return null;
    if(latestToken.conditionsRevision>token.conditionsRevision)token=latestToken;
    const saved=read(SHEETS_KEY,null),index=saved?.characters?.findIndex(row=>row.id===source.id);
    const currentLinks=read(LINKS_KEY,{}),currentLink=currentLinks[key];
    if(index===undefined || index<0 || currentLink?.kind!=='character' || currentLink.id!==source.id)return null;
    let latest=saved.characters[index];
    // A second local edit made during the request is sent on the queued pull.
    if(!sent || conditions.signature(conditions.forCharacter(latest))===ownSignature){
      const updated=conditions.applyToCharacter(latest,token.conditions);
      if(JSON.stringify(updated)!==JSON.stringify(latest)){
        updated.updatedAt=new Date().toISOString();saved.characters[index]=updated;
        localStorage.setItem(SHEETS_KEY,JSON.stringify(saved));latest=updated;
      }
    }
    currentLinks[key]={...currentLink,conditionsRevision:token.conditionsRevision,conditionsSignature:conditions.signature(token.conditions)};
    localStorage.setItem(LINKS_KEY,JSON.stringify(currentLinks));
    return latest;
  }
  async doPull() {
    const initial=this.getView();if(!initial)return;
    const linked=initial.scene.tokens.filter(token=>token.canEditStats && this.linkFor(token.id));
    if(!linked.length)return;
    const {rules,catalog}=await loadReferences();
    for(const original of linked){
      const current=this.getView();
      if(!current || current.id!==initial.id || current.self.id!==initial.self.id)return;
      const token=current.scene.tokens.find(token=>token.id===original.id),link=this.linkFor(original.id);
      if(!token?.canEditStats || !link)continue;
      let patch,name;
      if(link.kind==='character'){
        let source=this.characters().find(character=>character.id===link.id);
        if(!source){this.notify('A linked character is missing from this browser. Relink it in the token statblock.',true);continue;}
        source=await this.syncConditions(token,source);if(!source)continue;
        source=this.syncServerResources(token,source,rules,catalog);if(!source)continue;
        const normalized=rules.reconcile(source);
        patch=characterStats(normalized,rules.derive(normalized),catalog);name=source.name || token.name;
      }else{
        const source=(await this.monsters()).find(entry=>monsterId(entry)===link.id);
        if(!source){this.notify('A linked monster is missing. Relink it in the token statblock.',true);continue;}
        patch=monsterStats(source,token);name=source.name;
        // Encounter resources stay per token; source edits update their maxima.
        for(const [key,pool] of Object.entries(patch.resources)){
          if(key!=='armorClass' && token.statblock?.sourceId===link.id && token.resources?.[key]) {
            pool.current=Math.min(token.resources[key].current,pool.max ?? 999999);
          }
        }
      }
      patch.resources={...token.resources,...patch.resources};
      if(Object.entries({...patch,name}).some(([key,value])=>!sameValue(token[key],value))){
        const updated=await this.onPull(token.id,{...patch,name,expectedResourceRevision:token.resourceRevision ?? 0});
        if(!updated)throw new Error('The sheet could not update its token. Check the connection and try again.');
      }
    }
  }
  syncServerResources(token,source,rules,catalog){
    if(!Number.isInteger(token.resourceRevision))return source;
    const links=read(LINKS_KEY,{}),key=this.key(token.id),link=links[key];if(!link || link.id!==source.id)return null;
    const previous=link.resourceRevision ?? 0;
    if(token.resourceRevision>previous && token.statblock?.type==='character' && token.statblock.sourceId===source.id){
      const saved=read(SHEETS_KEY,null),index=saved?.characters?.findIndex(character=>character.id===source.id);if(index===undefined || index<0)return null;
      const latest=saved.characters[index],before=characterStats(latest,rules.derive(latest),catalog);
      const updated=rules.reconcile(updateCharacterResources(latest,before,token));saved.characters[index]=updated;
      localStorage.setItem(SHEETS_KEY,JSON.stringify(saved));source=updated;
    }
    links[key]={...link,resourceRevision:token.resourceRevision};localStorage.setItem(LINKS_KEY,JSON.stringify(links));return source;
  }
  async push(before,after) {
    const link=this.linkFor(after.id);if(link?.kind!=='character')return;
    const saved=read(SHEETS_KEY,null),index=saved?.characters?.findIndex(character=>character.id===link.id);
    if(index===undefined || index<0)return;
    const {rules}=await loadReferences();
    const updated=updateCharacterResources(saved.characters[index],before,after);
    if(JSON.stringify({...updated,updatedAt:null})===JSON.stringify({...saved.characters[index],updatedAt:null}))return;
    saved.characters[index]=rules.reconcile(updated);
    try{localStorage.setItem(SHEETS_KEY,JSON.stringify(saved));}
    catch{throw new Error('The token saved, but this browser could not update the linked character sheet.');}
    // Re-read derived maxima after changing a manual resource.
    await this.pull();
  }
}
