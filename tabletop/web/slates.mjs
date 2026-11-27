import {loadReferences} from './sources.mjs';
import {characterStats,monsterStats,monsterId,monsterHP,SHEETS_KEY,MONSTERS_KEY} from './resources.mjs';
import {snapToken} from './grid.mjs';

const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const button=(label,action,cls='button secondary')=>{const node=el('button',cls,label);node.type='button';node.onclick=action;return node;};

export class Slates {
  constructor({getView,command,tools,board,selectToken,notify}) {
    Object.assign(this,{getView,command,tools,board,selectToken,notify});this.groups=new Map();this.connected=false;this.limit=40;
    const party=document.querySelector('.party-panel'),table=el('div');
    table.append(...party.childNodes);party.classList.add('campaign-slate');party.id='campaign-slate';party.setAttribute('aria-label','Campaign lobby slate');
    const log=document.querySelector('.dice-section'),turns=document.querySelector('.initiative-section');
    const areas=document.querySelector('.placed-areas');if(areas)turns.append(areas);
    const notes=this.mountNotes();
    this.tabs('campaign','Campaign',party,[['table','Table',table],['log','Log',log],['notes','Notes',notes],['turns','Turns',turns]],'table');
    this.mountChat(log);
    const inspector=$('inspector'),token=inspector.querySelector('.inspector-section'),scene=$('show-grid').closest('details');
    inspector.querySelector('.mobile-party').hidden=true;
    this.compendium=this.mountCompendium();
    this.tabs('data','Reference',inspector,[['token','Token',token],['compendium','Compendium',this.compendium],['scene','Scene',scene]],'token');
    this.groups.get('data').buttons.get('scene').setAttribute('data-dm','');
    this.campaignTrigger=button('Campaign',()=>{
      document.body.classList.toggle('campaign-open');document.body.classList.remove('panels-open');
      this.campaignTrigger.setAttribute('aria-expanded',String(document.body.classList.contains('campaign-open')));
    },'button subtle campaign-trigger');
    this.campaignTrigger.id='mobile-campaign';this.campaignTrigger.hidden=true;this.campaignTrigger.setAttribute('aria-controls','campaign-slate');this.campaignTrigger.setAttribute('aria-expanded','false');
    $('mobile-tools').before(this.campaignTrigger);
    const close=button('Close campaign',()=>{document.body.classList.remove('campaign-open');this.campaignTrigger.setAttribute('aria-expanded','false');},'campaign-close');
    party.prepend(close);
    board.canvas.addEventListener('dragover',event=>{
      if(!this.connected || !event.dataTransfer.types.includes('application/x-vara-source'))return;
      event.preventDefault();event.dataTransfer.dropEffect=this.getView()?.self.role==='dm'?'copy':'move';board.canvas.classList.add('drop-ready');
    });
    board.canvas.addEventListener('dragleave',()=>board.canvas.classList.remove('drop-ready'));
    board.canvas.addEventListener('drop',event=>{
      board.canvas.classList.remove('drop-ready');if(!this.connected)return;
      const data=event.dataTransfer.getData('application/x-vara-source');if(!data)return;event.preventDefault();
      try{if(data.length>4000)throw new Error('Choose an entry from the compendium.');this.place(JSON.parse(data),board.point(event));}
      catch(error){notify(error.message,true);}
    });
    window.addEventListener('storage',event=>{
      if([SHEETS_KEY,MONSTERS_KEY,'vara.magic-items.v1'].includes(event.key)){this.catalog=null;if(this.groups.get('data').active==='compendium')this.loadCompendium();}
    });
  }
  tabs(id,title,host,entries,active) {
    const header=el('div','slate-heading');header.append(el('span','eyebrow',id==='campaign'?'LOBBY SLATE':'DATA SLATE'),el('h2','',title));
    const tabs=el('div','slate-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',title+' views');
    const group={active,buttons:new Map(),panels:new Map()};this.groups.set(id,group);
    for(const [key,label,content] of entries){
      const tab=button(label,()=>this.show(id,key),'slate-tab');tab.id=id+'-tab-'+key;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',id+'-'+key);
      const panel=el('div','slate-content');panel.id=id+'-'+key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);panel.append(content);
      group.buttons.set(key,tab);group.panels.set(key,panel);tabs.append(tab);host.append(panel);
      tab.onkeydown=event=>{
        const available=[...group.buttons].filter(([,node])=>!node.hidden),index=available.findIndex(([name])=>name===key);
        const next=event.key==='Home'?0:event.key==='End'?available.length-1:event.key==='ArrowRight'?(index+1)%available.length:event.key==='ArrowLeft'?(index+available.length-1)%available.length:-1;
        if(next<0)return;event.preventDefault();this.show(id,available[next][0]);available[next][1].focus();
      };
    }
    host.prepend(header,tabs);this.show(id,active);
  }
  show(id,key) {
    const group=this.groups.get(id);if(!group?.panels.has(key))return;group.active=key;
    for(const [name,node] of group.buttons){node.setAttribute('aria-selected',String(name===key));node.tabIndex=name===key?0:-1;group.panels.get(name).hidden=name!==key;}
    if(id==='data' && key==='compendium')this.loadCompendium();
  }
  mountChat(log) {
    const form=el('form','chat-form'),label=el('label','field','Message the table'),input=el('textarea');
    input.id='chat-message';input.rows=2;input.maxLength=1000;input.placeholder='Speak to your party…';label.htmlFor=input.id;label.append(input);
    log.querySelector('h3').textContent='Dice & messages';
    this.chatSend=el('button','button primary','Send');this.chatSend.type='submit';form.append(label,this.chatSend);log.insertBefore(form,$('game-log'));
    this.chatInput=input;form.onsubmit=async event=>{
      event.preventDefault();if(!input.value.trim() || !this.connected || this.chatBusy)return;
      const room=this.getView()?.id,text=input.value;this.chatBusy=true;this.chatSend.disabled=true;
      try{if(await this.command({type:'chat.send',text}) && this.getView()?.id===room && input.value===text)input.value='';}
      finally{this.chatBusy=false;this.chatSend.disabled=!this.connected;}
    };
  }
  mountNotes() {
    const section=el('section','campaign-notes');section.append(el('h3','','Campaign notes'),el('p','slate-note','The GM can share handouts and keep private drafts.'));
    this.notesList=el('div','campaign-note-list');this.notesList.id='campaign-note-list';section.append(this.notesList);
    this.noteEditor=el('form','note-editor');this.noteEditor.id='note-editor';
    this.noteEditor.append(el('h3','','Write a note'));
    const input=(title,id,textarea=false)=>{
      const label=el('label','field',title),node=el(textarea?'textarea':'input');node.id=id;
      if(textarea){node.rows=7;node.maxLength=8000;}else node.maxLength=80;label.append(node);this.noteEditor.append(label);return node;
    };
    this.noteTitle=input('Title','note-title');this.noteText=input('Note','note-text',true);
    const share=el('label','check-field');this.noteShare=el('input');this.noteShare.type='checkbox';this.noteShare.id='note-shared';
    share.append(this.noteShare,document.createTextNode('Share with players'));this.noteEditor.append(share);
    const actions=el('div','button-row');this.noteSave=el('button','button primary','Save note');this.noteSave.type='submit';
    actions.append(this.noteSave,button('New note',()=>this.editNote(null)));this.noteEditor.append(actions);section.append(this.noteEditor);
    this.noteEditor.onsubmit=async event=>{
      event.preventDefault();if(!this.connected || this.noteBusy)return;
      const room=this.getView()?.id;this.noteBusy=true;this.render(this.connected);
      try{
        const next=await this.command({type:'note.save',...(this.editingNote?{id:this.editingNote}:{}),title:this.noteTitle.value,text:this.noteText.value,shared:this.noteShare.checked});
        if(next && this.getView()?.id===room)this.editNote(null);
      }finally{this.noteBusy=false;this.render(this.connected);}
    };
    return section;
  }
  editNote(note) {
    this.editingNote=note?.id || null;this.noteTitle.value=note?.title || '';this.noteText.value=note?.text || '';this.noteShare.checked=!!note?.shared;
  }
  mountCompendium() {
    const section=el('section','compendium');section.append(el('h3','','Compendium'));
    this.compendiumHint=el('p','slate-note');section.append(this.compendiumHint);
    const label=el('label','field','Find a character or creature');this.compendiumSearch=el('input');this.compendiumSearch.type='search';this.compendiumSearch.id='compendium-search';label.append(this.compendiumSearch);
    this.compendiumKind=el('select');this.compendiumKind.id='compendium-kind';this.compendiumKind.setAttribute('aria-label','Compendium source');
    this.compendiumKind.append(new Option('All entries','all'),new Option('Monster templates','monster'),new Option('Saved characters','character'));
    section.append(label,this.compendiumKind);this.compendiumStatus=el('p','slate-note');this.compendiumList=el('div','compendium-list');this.compendiumList.id='compendium-list';
    section.append(this.compendiumStatus,this.compendiumList);
    this.compendiumSearch.oninput=this.compendiumKind.onchange=()=>{this.limit=40;this.renderCompendium();};
    return section;
  }
  async loadCompendium() {
    const view=this.getView();if(!view || !this.compendiumList)return;
    if(view.self.role!=='dm'){this.renderCompendium();return;}
    if(this.catalog){this.renderCompendium();return;}
    if(this.loading)return;this.loading=true;this.compendiumStatus.textContent='Loading the compendium…';
    try{
      const [references,monsters]=await Promise.all([loadReferences(),this.tools.sources.monsters()]);
      this.references=references;this.catalog=monsters;this.catalogVersion=(this.catalogVersion || 0)+1;this.renderCompendium();
    }catch(error){
      this.compendiumStatus.textContent=error.message;
      this.compendiumList.replaceChildren(button('Try again',()=>this.loadCompendium()));
    }finally{this.loading=false;}
  }
  renderCompendium() {
    const view=this.getView();if(!view)return;const dm=view.self.role==='dm';
    this.compendiumHint.textContent=dm?'Drag a saved character or monster onto the map, or use Place.':'Your controllable characters and summons. Drag one to move it, or select it to inspect.';
    this.compendiumKind.hidden=!dm;
    if(dm && !this.catalog)return;
    const rows=dm?[...this.catalog.map(entry=>({kind:'monster',id:monsterId(entry),name:entry.name,entry})),
      ...this.tools.sources.characters().map(entry=>({kind:'character',id:entry.id,name:entry.name || 'Unnamed character',entry}))]:
      view.scene.tokens.filter(token=>token.ownerId===view.self.id).map(entry=>({kind:'token',id:entry.id,name:entry.name,entry}));
    const query=this.compendiumSearch.value.toLowerCase().trim(),kind=this.compendiumKind.value;
    const signature=JSON.stringify([view.id,view.self.id,this.connected,query,kind,this.limit,this.catalogVersion,
      dm?this.tools.sources.characters():rows.map(row=>row.entry)]);
    if(signature===this.compendiumSignature)return;this.compendiumSignature=signature;
    const matches=rows.filter(row=>(!dm || kind==='all' || kind===row.kind) && (row.name+' '+(row.entry.details?.meta || '')+' '+(row.entry.details?.type || '')).toLowerCase().includes(query));
    this.compendiumStatus.textContent=matches.length+(matches.length===1?' entry':' entries')+(matches.length>this.limit?' · showing '+this.limit:'');
    this.compendiumList.replaceChildren(...matches.slice(0,this.limit).map(row=>{
      const card=el('article','compendium-card');card.draggable=this.connected;card.dataset.sourceKind=row.kind;card.dataset.sourceId=row.id;
      card.addEventListener('dragstart',event=>{
        if(!this.connected){event.preventDefault();return;}
        event.dataTransfer.setData('application/x-vara-source',JSON.stringify({kind:row.kind,id:row.id}));event.dataTransfer.effectAllowed=dm?'copy':'move';
      });
      const details=el('details'),summary=el('summary');summary.append(el('strong','',row.name));
      const meta=row.kind==='monster'?row.entry.details?.meta:row.kind==='character'?'Saved character':row.entry.sizeCategory+' · '+row.entry.kind;
      summary.append(el('span','compendium-meta',meta || 'Creature template'));details.append(summary);
      const body=el('div','compendium-reference');
      try{
        const stats=row.kind==='monster'?monsterStats(row.entry):row.kind==='character' && this.references?
          characterStats(this.references.rules.reconcile(row.entry),this.references.rules.derive(this.references.rules.reconcile(row.entry)),this.references.catalog):row.entry;
        body.append(el('p','',stats.sizeCategory+' · HP '+stats.hp+' / '+stats.maxHp+' · AC '+(stats.resources?.armorClass?.current ?? 10)));
        for(const attack of stats.statblock?.attacks || [])body.append(el('p','',attack.name+' · '+(attack.bonus>=0?'+':'')+attack.bonus+' · '+attack.damage));
        body.append(el('p','',stats.statblock?.rules || stats.statblock?.notes || 'Open the linked sheet for full details.'));
      }catch(error){body.append(el('p','',row.kind==='monster' && !monsterHP(row.entry.details?.hp)?'HP: '+row.entry.details?.hp+'\nSet maximum HP when placing this creature.':error.message));}
      details.append(body);const action=button(dm?'Place':'Select',()=>dm?this.place(row):this.selectToken(row.id));action.disabled=!this.connected;
      card.append(details,action);return card;
    }));
    if(!matches.length)this.compendiumList.append(el('p','slate-note',dm?'No matching entries. Save a character or try another search.':'The GM can assign a character or summon to you.'));
    if(matches.length>this.limit)this.compendiumList.append(button('Show more',()=>{this.limit+=40;this.renderCompendium();}));
  }
  async place(source,point=null) {
    if(!this.connected)return;
    try{
      const view=this.getView(),scene=view.scene,position=point || {x:(this.board.width/2-this.board.camera.x)/this.board.camera.z,y:(this.board.height/2-this.board.camera.y)/this.board.camera.z};
      if(source.kind==='token'){
        const token=scene.tokens.find(token=>token.id===source.id);
        if(!token)throw new Error('This token is no longer in the scene.');
        if(view.self.role!=='dm' && token.conditionState?.blocked)throw new Error('Cannot move: '+token.conditionState.reason+'.');
        const {x,y}=snapToken(scene,token,position);
        if(await this.command({type:'token.move',id:source.id,x,y}))this.selectToken(source.id);return;
      }
      if(view.self.role!=='dm')throw new Error('The GM places compendium templates.');
      const references=await loadReferences();let stats,name;
      if(source.kind==='monster'){
        const entry=(await this.tools.sources.monsters()).find(entry=>monsterId(entry)===source.id);
        if(!entry)throw new Error('This monster is no longer in the compendium.');
        if(monsterHP(entry.details.hp))stats=monsterStats(entry);
        else{
          const input=prompt(entry.name+' HP: '+entry.details.hp+'\nEnter maximum HP for this encounter:','');
          if(input===null)return;
          const hp=Number(input);if(!Number.isInteger(hp) || hp<1 || hp>999999)throw new Error('Enter maximum HP as a whole number from 1 to 999999.');
          stats=monsterStats({...entry,details:{...entry.details,hp}});stats.statblock.encounterOverrides=['maxHp'];
        }
        name=entry.name;
      }else if(source.kind==='character'){
        const entry=this.tools.sources.characters().find(entry=>entry.id===source.id);
        if(!entry)throw new Error('This saved character is no longer available.');
        const normalized=references.rules.reconcile(entry);stats=characterStats(normalized,references.rules.derive(normalized),references.catalog);name=entry.name;
      }else throw new Error('Choose a character or monster from the compendium.');
      if(this.getView()?.id!==view.id || this.getView()?.self.id!==view.self.id)return;
      const {x,y}=snapToken(scene,stats,position);
      const id=crypto.randomUUID(),next=await this.command({type:'token.add',token:{...stats,id,name,x,y,kind:source.kind==='monster'?'monster':'hero',color:source.kind==='monster'?'#a35450':'#337c89'}});
      if(!next)return;this.selectToken(id);await this.tools.sources.link(id,source.kind,source.id);
      this.tools.render();this.notify(name+' placed and linked.');
    }catch(error){this.notify(error.message,true);}
  }
  render(connected) {
    const view=this.getView();this.connected=connected;if(!view)return;
    const dm=view.self.role==='dm';this.chatInput.disabled=!connected;this.chatSend.disabled=!connected || !!this.chatBusy;
    this.noteEditor.hidden=!dm;this.noteSave.disabled=!connected || !!this.noteBusy;
    for(const node of this.noteEditor.querySelectorAll('input,textarea,button'))node.disabled=!connected || !!this.noteBusy;
    const scope=view.id+'|'+view.self.id;
    if(this.notesRoom!==scope){this.notesSignature='';this.notesRoom=scope;this.editNote(null);this.chatInput.value='';}
    const signature=JSON.stringify([dm,connected,this.noteBusy,view.scene.notes]);
    if(signature!==this.notesSignature){
      this.notesSignature=signature;this.notesList.replaceChildren(...(view.scene.notes || []).map(note=>{
        const article=el('article','campaign-note'),heading=el('div','campaign-note-heading');
        heading.append(el('h4','',note.title),el('span','',note.shared?'Shared':'Private draft'));article.append(heading,el('p','campaign-note-text',note.text));
        if(dm){
          const actions=el('div','button-row'),edit=button('Edit',()=>this.editNote(note)),remove=button('Remove',()=>this.command({type:'note.delete',id:note.id}),'text-button danger');
          edit.disabled=remove.disabled=!connected || !!this.noteBusy;actions.append(edit,remove);article.append(actions);
        }return article;
      }));
      if(!this.notesList.childElementCount)this.notesList.append(el('p','slate-note',dm?'No notes yet. Write a private draft or share one with the party.':'The GM has not shared any notes.'));
    }
    if(!dm && this.groups.get('data').active==='scene')this.show('data','token');
    if(this.groups.get('data').active==='compendium')this.loadCompendium();
  }
}
