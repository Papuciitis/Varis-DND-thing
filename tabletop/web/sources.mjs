import {SHEETS_KEY,MONSTERS_KEY,characterStats,monsterStats,monsterId,updateCharacterResources} from './resources.mjs';

const LINKS_KEY='vara.tabletop.links.v1';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}};
const request=async path=>{
  const response=await fetch(new URL('../'+path,import.meta.url));
  if(!response.ok)throw new Error('The rules could not be loaded. Rebuild the preview and try again.');
  return response.json();
};
let references;
export function loadReferences() {
  if(!references)references=(async()=>{
    for(const name of ['magic-categories','item-views','magic-items','character-state','character-effects','character-equipment','character-casting','character-rules']){
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
  constructor({getView,getServer,onPull,notify,onChange}) {
    Object.assign(this,{getView,getServer,onPull,notify,onChange});this.tail=Promise.resolve();
    window.addEventListener('storage',event=>{
      if(event.key==='vara.magic-items.v1')references=null;
      if([SHEETS_KEY,MONSTERS_KEY,'vara.magic-items.v1'].includes(event.key)){this.onChange?.();this.pull();}
    });
    window.addEventListener('focus',()=>{this.onChange?.();this.pull();});
  }
  key(id) {const view=this.getView();return this.getServer()+'|'+view.id+'|'+view.self.id+'|'+id;}
  linkFor(id) {return this.getView()?read(LINKS_KEY,{})[this.key(id)]:null;}
  characters() {const list=read(SHEETS_KEY,{}).characters;return Array.isArray(list)?list.filter(character=>character && typeof character.id==='string'):[];}
  async monsters() {
    const base=(await loadReferences()).monsters,entries=new Map(base.map(entry=>[monsterId(entry),entry]));
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
        const source=this.characters().find(character=>character.id===link.id);
        if(!source){this.notify('A linked character is missing from this browser. Relink it in the token statblock.',true);continue;}
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
      if(Object.entries({...patch,name}).some(([key,value])=>JSON.stringify(token[key])!==JSON.stringify(value))){
        const updated=await this.onPull(token.id,{...patch,name});
        if(!updated)throw new Error('The sheet could not update its token. Check the connection and try again.');
      }
    }
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
