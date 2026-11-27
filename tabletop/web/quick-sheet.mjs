const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const button=(text,id,action)=>{const node=el('button','button secondary',text);node.type='button';node.id=id;node.onclick=action;return node;};
const abilities=['str','dex','con','int','wis','cha'];

export class QuickSheet {
  constructor({onLink,onEdit,getLink}) {
    this.getLink=getLink;this.openRules=new Set();this.element=el('section','sheet-sidebar');
    this.element.id='sheet-sidebar';this.element.setAttribute('aria-label','Linked character or monster');
    this.status=el('p','sheet-link-status');this.status.id='sheet-link-status';
    const links=el('div','sheet-link-actions');
    this.characterButton=button('Link character','sidebar-link-character',()=>onLink('character'));
    this.monsterButton=button('Link monster','sidebar-link-monster',()=>onLink('monster'));
    links.append(this.characterButton,this.monsterButton);
    this.attacks=el('section','sheet-attacks');this.attacks.id='sheet-attacks';this.attacks.setAttribute('aria-label','Attacks');
    this.attacks.append(el('h3','','Attacks'));this.attackList=el('div','sheet-attack-list');this.attacks.append(this.attackList);
    this.linkerHost=el('div');this.reading=el('details','quick-sheet');this.reading.id='quick-sheet';this.reading.open=true;
    this.reading.append(el('summary','','Abilities & actions'));this.body=el('div','quick-sheet-body');
    this.utilities=el('div','quick-sheet-utilities');
    this.fullSheet=el('a','button secondary','Open character sheet');this.fullSheet.id='open-linked-character';this.fullSheet.target='_blank';this.fullSheet.rel='noopener';
    this.editButton=button('Edit statblock','quick-edit-statblock',onEdit);this.utilities.append(this.fullSheet,this.editButton);
    this.searchLabel=el('label','field','Find an ability or action');this.search=el('input');this.search.type='search';this.search.id='sheet-rule-search';this.searchLabel.append(this.search);
    this.ruleList=el('div','sheet-rules');this.ruleList.id='sheet-rules';this.search.oninput=()=>this.renderRules();
    this.stats=el('div','sheet-stat-strip');this.abilities=el('div','sheet-abilities');this.empty=el('p','field-note');
    this.notes=el('details','sheet-notes');this.notes.append(el('summary','','Notes'));this.notesText=el('p');this.notes.append(this.notesText);
    this.body.append(this.empty,this.stats,this.abilities,this.utilities,this.searchLabel,this.ruleList,this.notes);
    this.reading.append(this.body);this.element.append(this.status,links,this.linkerHost,this.attacks,this.reading);
  }
  render(token,connected) {
    this.element.hidden=!token;if(!token)return;
    const link=this.getLink(token.id),visible=token.canViewStats;
    this.characterButton.hidden=this.monsterButton.hidden=!token.canEditStats;
    this.characterButton.disabled=this.monsterButton.disabled=!connected;
    this.editButton.hidden=!token.canEditStats;this.editButton.disabled=!connected;
    this.fullSheet.hidden=link?.kind!=='character' || !token.canEditStats;
    if(!this.fullSheet.hidden)this.fullSheet.href='../character.html?'+new URLSearchParams({character:link.id});
    this.status.textContent=!visible?'Private character - the player can share access':
      link?(link.kind==='character'?'Character linked - updates from your saved sheet':'Monster linked - encounter stats'):
      token.statblock?'Saved statblock - link a source to keep it updated':'No sheet linked. Choose a character or monster.';
    const signature=JSON.stringify([token.id,token.name,visible,token.hp,token.maxHp,token.resources,token.statblock,token.conditions,token.conditionState,link]);
    if(signature===this.signature)return;
    const changed=this.token?.id!==token.id;this.token=token;this.signature=signature;
    if(changed)this.search.value='';
    this.attacks.hidden=!visible || !(token.statblock?.type==='character' || token.statblock?.attacks?.length);
    this.attackList.replaceChildren();
    for(const node of [this.stats,this.abilities,this.utilities,this.searchLabel,this.ruleList,this.notes])node.hidden=!visible;
    this.empty.hidden=visible && !!token.statblock;
    this.empty.textContent=!visible?'Only the owning player can grant access to these stats.':'Link a sheet to load abilities, actions and spells, or enter a custom statblock.';
    if(!visible){this.stats.replaceChildren();this.abilities.replaceChildren();this.ruleList.replaceChildren();this.notesText.textContent='';this.rules=[];return;}
    this.attackList.replaceChildren(...(token.statblock?.attacks || []).map(attack=>{
      const card=el('article','sheet-attack'),heading=el('div','sheet-attack-heading');
      heading.append(el('strong','',attack.name),el('span','sheet-attack-bonus',(attack.bonus>=0?'+':'')+attack.bonus+' to hit'));
      const values=el('div','sheet-attack-values');values.append(el('span','',attack.damage || 'Damage not set'));
      if(attack.blockDC!==null && attack.blockDC!==undefined)values.append(el('span','sheet-attack-dc','Block DC '+attack.blockDC));
      card.append(heading,values);
      if(token.conditionState?.flags.noActions)card.append(el('p','condition-warning','Cannot take attack actions.'));
      else if(token.conditionState?.flags.attackDisadvantage)card.append(el('p','condition-warning','Attacks have disadvantage.'));
      if(attack.notes)card.append(el('p','sheet-attack-notes',attack.notes));return card;
    }));
    if(!this.attackList.childElementCount)this.attackList.append(el('p','field-note','Add attacks or equip a weapon in your character sheet to see them here.'));
    const stats=[['HP',token.hp+' / '+token.maxHp],['AC',token.resources.armorClass?.current ?? '-'],['Block',token.resources.block?.current ?? 0]];
    if(typeof token.conditionState?.speed==='number')stats.push(['Speed',token.conditionState.speed+' ft']);
    this.stats.replaceChildren(...stats.map(([label,value])=>{const item=el('div');item.append(el('span','',label),el('strong','',value));return item;}));
    this.abilities.replaceChildren(...abilities.map(key=>{
      const score=token.statblock?.abilities?.[key],item=el('div','sheet-ability'),modifier=score===undefined?null:Math.floor((score-10)/2);
      item.append(el('span','',key.toUpperCase()),el('strong','',score ?? '-'),el('small','',modifier===null?'':(modifier>=0?'+':'')+modifier));return item;
    }));
    this.rules=(token.statblock?.rules || '').split(/\n\s*\n/).filter(part=>part.trim()).map((part,index)=>{
      const split=part.indexOf(':'),named=split>0 && split<100;
      return {id:token.id+':'+index,title:named?part.slice(0,split).trim():'Rule '+(index+1),body:named?part.slice(split+1).trim():part.trim()};
    });
    this.searchLabel.hidden=!this.rules.length;this.notes.hidden=!token.statblock?.notes;
    this.notesText.textContent=token.statblock?.notes || '';this.renderRules();
  }
  renderRules() {
    if(!this.token?.canViewStats)return;
    const query=this.search.value.toLowerCase(),rules=(this.rules || []).filter(rule=>(rule.title+' '+rule.body).toLowerCase().includes(query));
    this.ruleList.replaceChildren(...rules.map(rule=>{
      const row=el('details','sheet-rule');row.open=this.openRules.has(rule.id);row.append(el('summary','',rule.title),el('p','',rule.body));
      row.addEventListener('toggle',()=>{if(row.isConnected)row.open?this.openRules.add(rule.id):this.openRules.delete(rule.id);});return row;
    }));
    if(!rules.length && query)this.ruleList.append(el('p','field-note','No matching abilities or actions.'));
  }
}
