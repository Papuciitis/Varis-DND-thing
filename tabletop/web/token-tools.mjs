import {utilityReadings,healthSummary,RESOURCE_NAMES,ABILITIES} from './resources.mjs';
import {LocalSources} from './sources.mjs';
import {templateLabel} from './templates.mjs';
import {QuickSheet} from './quick-sheet.mjs';

const $=id=>document.getElementById(id);
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const button=(text,action,className='button secondary')=>{const node=el('button',className,text);node.type='button';node.onclick=action;return node;};
function field(parent,title,{type='text',id,value,min,max}={}) {
  const label=el('label','field',title),input=el('input');input.type=type;
  if(id)input.id=id;if(value!==undefined)input.value=value;if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;
  label.append(input);parent.append(label);return input;
}
function selectField(parent,title,choices,id) {
  const label=el('label','field',title),select=el('select');if(id)select.id=id;
  select.replaceChildren(...choices.map(([key,name])=>new Option(name,key)));label.append(select);parent.append(label);return select;
}
function check(parent,title,id) {
  const label=el('label','check-field'),input=el('input');input.type='checkbox';input.id=id;label.append(input,document.createTextNode(title));parent.append(label);return input;
}
function dialog(title,id) {
  const node=el('dialog');node.id=id;
  const heading=el('div','dialog-heading');heading.append(el('h2','',title),button('Close',()=>node.close(),'text-button'));
  const body=el('div','dialog-body');node.append(heading,body);document.body.append(node);return {node,body};
}

export class TokenTools {
  constructor({getView,getSelected,getServer,command,selectToken,board,notify,onAdd}) {
    Object.assign(this,{getView,getSelected,command,selectToken,board,notify,onAdd});this.connected=false;
    this.sources=new LocalSources({getView,getServer,notify,onChange:()=>this.refreshCharacterChoices(),onPull:(id,patch)=>command({type:'token.update',id,...patch})});
    this.mountDock();this.mountInspector();this.mountStatblock();this.mountSidebar();this.mountRuler();this.mountTemplates();this.mountMenu();
    // Identity remains in the inspector; resources have one larger editor below the map.
    $('token-hp').closest('.field-row').hidden=true;
    for(const id of ['token-kind','token-owner','token-hidden'])$(id).closest('label').setAttribute('data-dm','');
    $('token-form').querySelector('[type="submit"]').removeAttribute('data-dm');
    $('new-token-kind').append(new Option('Summon','summon'));
    $('token-kind').append(new Option('Summon','summon'));
  }
  token(id=this.getSelected()) {return this.getView()?.scene.tokens.find(token=>token.id===id);}
  setConnected(value) {const resumed=value && !this.connected;this.connected=value;this.render();if(resumed)this.sources.pull();}
  async saveStats(id,patch) {
    const before=this.token(id);if(!before?.canEditStats)return;
    const next=await this.command({type:'token.stats',id,...patch});
    const after=next?.scene.tokens.find(token=>token.id===id);
    if(after){try{await this.sources.push(before,after);}catch(error){this.notify(error.message,true);}}
  }
  mountDock() {
    const panel=$('map-canvas').parentElement,viewport=el('div','map-viewport');
    viewport.append(...panel.childNodes);panel.append(viewport);this.viewport=viewport;
    const dock=el('section','token-dock');dock.id='token-dock';dock.setAttribute('aria-label','Selected token resources');
    const heading=el('div','dock-heading'),identity=el('div','dock-identity');
    this.dockName=el('strong');this.dockAccess=el('span','access-label');identity.append(this.dockName,this.dockAccess);
    heading.append(identity,button('Statblock',()=>this.openStatblock()),button('Actions',event=>{
      const rect=dock.getBoundingClientRect(),token=this.token();
      this.showMenu({tokenId:token?.id,x:rect.right-200,y:rect.top-180,point:token || {x:0,y:0}});
    }));
    this.dockBars=el('div','dock-bars');this.dockNote=el('p','dock-note');dock.append(heading,this.dockBars,this.dockNote);panel.append(dock);
    this.dock=dock;this.poolFields=[];
    for(let index=0;index<3;index++){
      const form=el('form','dock-resource'),title=el('label','resource-title'),values=el('div','resource-values');
      const current=el('input');current.type='number';current.min=0;current.max=999999;current.step=1;
      const maximum=el('input');maximum.type='number';maximum.min=0;maximum.max=999999;maximum.step=1;
      current.id='dock-current-'+index;title.htmlFor=current.id;
      const divider=el('span','resource-divider','/'),track=el('div','resource-track'),fill=el('span');track.append(fill);
      values.append(current,divider,maximum);form.append(title,values,track);this.dockBars.append(form);
      if(index===0){
        form.classList.add('health-resource');this.healthOverview=el('div','health-overview');
        const shield=el('div','ac-shield');shield.setAttribute('aria-label','Armor class');this.healthAC=el('strong');shield.append(el('span','','AC'),this.healthAC);
        const body=el('div','health-body'),heading=el('div','health-heading');this.healthTotal=el('strong');heading.append(el('span','','Combined health'),this.healthTotal);
        this.healthTrack=el('div','health-track');this.healthTrack.id='combined-health';this.healthTrack.setAttribute('role','progressbar');this.healthTrack.setAttribute('aria-label','Combined health');
        this.healthSegments=['hp','tempHP','arcaneHealth'].map(key=>{const node=el('span','health-segment '+key);this.healthTrack.append(node);return node;});
        body.append(heading,this.healthTrack);this.healthOverview.append(shield,body);
        const editors=el('div','health-editors'),hp=el('div');hp.append(title,values);editors.append(hp);this.healthExtras=new Map();
        for(const [key,name] of [['tempHP','Temp HP'],['arcaneHealth','Arcane']]){
          const label=el('label','health-extra '+key,name),input=el('input');input.type='number';input.id='health-'+key;input.min=0;input.max=999999;input.step=1;
          input.setAttribute('aria-label',name+' current');label.append(input);editors.append(label);this.healthExtras.set(key,input);
          input.onchange=()=>{
            const token=this.token();if(!this.connected || !token?.canEditStats || !input.reportValidity())return;
            const value=Number(input.value),pool=token.resources[key];
            this.saveStats(token.id,{resources:{...token.resources,[key]:{current:value,max:pool.max===null?null:Math.max(value,pool.max)}}});
          };
        }
        form.replaceChildren(this.healthOverview,editors);
      }
      const save=()=>this.savePool(index,current,maximum);
      current.addEventListener('change',save);maximum.addEventListener('change',save);
      form.onsubmit=event=>{event.preventDefault();save();};
      this.poolFields.push({form,title,current,maximum,divider,fill});
    }
  }
  async savePool(index,current,maximum) {
    const token=this.token(),bar=utilityReadings(token)[index];if(!bar || !token.canEditStats || !this.connected)return;
    current.setCustomValidity('');maximum.setCustomValidity('');
    if(!current.reportValidity() || (bar.max!==null && !maximum.reportValidity()))return;
    const max=bar.max===null?null:Number(maximum.value),value=Number(current.value);
    if(max!==null && (bar.key==='hp'?max<1:max<0)){maximum.setCustomValidity('Choose a valid maximum.');maximum.reportValidity();return;}
    if(max!==null && value>max){current.setCustomValidity('The current value must not exceed its maximum.');current.reportValidity();return;}
    if(bar.key==='hp')await this.saveStats(token.id,{hp:value,maxHp:max});
    else {
      const poolMax=max===null?token.resources[bar.key].max:max;
      await this.saveStats(token.id,{resources:{...token.resources,[bar.key]:{current:value,max:poolMax===null?null:Math.max(value,poolMax)}}});
    }
  }
  mountInspector() {
    const section=el('section','inspector-section resource-settings');$('token-form').after(section);this.resourceSection=section;
    this.privateNote=el('p','field-note');section.append(this.privateNote);
    this.share=check(section,'Share this character / summon with the DM','share-token-stats');
    this.share.onchange=async()=>{
      const token=this.token();if(!token || this.sharingToken)return;
      const enabled=this.share.checked;this.sharingToken=token.id;this.share.disabled=true;
      try{await this.command({type:'token.share',id:token.id,enabled});}
      finally{this.sharingToken=null;this.render();}
    };
    const details=el('details');details.append(el('summary','','Optional bars'));section.append(details);this.barDetails=details;
    const form=el('form');this.barInputs=[];
    for(let index=0;index<2;index++){
      const row=el('fieldset','bar-config');row.append(el('legend','','Bar '+(index+2)));
      const enabled=check(row,'Show beneath token','bar-enabled-'+index);
      const label=field(row,'Label',{id:'bar-label-'+index});label.maxLength=24;
      const resource=selectField(row,'Tracks',Object.entries(RESOURCE_NAMES),'bar-resource-'+index);
      const values=el('div','field-row');
      const current=field(values,'Current value',{type:'number',id:'bar-value-'+index,min:0,max:999999});
      const max=field(values,'Maximum (blank = value only)',{type:'number',id:'bar-max-'+index,min:0,max:999999});
      row.append(values);form.append(row);this.barInputs.push({row,enabled,label,resource,current,max});
      resource.onchange=()=>{
        const token=this.token(),pool=token?.resources[resource.value] || {current:0,max:0};
        const link=token && this.sources.linkFor(token.id),character=link?.kind==='character'?this.sources.characters().find(character=>character.id===link.id):null;
        current.value=pool.current;max.value=pool.max ?? '';max.disabled=resource.value==='armorClass';
        current.disabled=resource.value==='armorClass' && !!character?.build?.enabled;
      };
    }
    const save=el('button','button primary full','Save bars');save.type='submit';form.append(save);details.append(form);
    this.barForm=form;
    form.onsubmit=async event=>{
      event.preventDefault();const token=this.token();if(!token?.canEditStats)return;
      const resources=structuredClone(token.resources),bars=this.barInputs.map(row=>{
        const previous=token.resources[row.resource.value];
        const valueOnly=row.max.value==='' || row.resource.value==='armorClass',current=Number(row.current.value);
        const max=valueOnly?(previous.max===null?null:Math.max(previous.max,current)):Number(row.max.value);
        if(previous.current!==current || previous.max!==max)resources[row.resource.value]={current,max};
        return {enabled:row.enabled.checked,label:row.label.value,resource:row.resource.value,valueOnly};
      });
      await this.saveStats(token.id,{bars,resources});
    };
  }
  mountRuler() {
    const ruler=el('div','measure-options'),label=el('label','','Ruler');
    this.units=el('select');this.units.id='ruler-units';this.units.setAttribute('aria-label','Ruler units');
    this.units.replaceChildren(new Option('Feet','ft'),new Option('Meters','m'),new Option('Squares','squares'));
    try{this.units.value=localStorage.getItem('vara.tabletop.ruler-unit') || 'ft';}catch{}
    this.board.measureUnit=this.units.value || 'ft';
    this.units.onchange=()=>{this.board.measureUnit=this.units.value;this.board.draw();try{localStorage.setItem('vara.tabletop.ruler-unit',this.units.value);}catch{}};
    label.append(this.units);this.scaleLabel=el('span');this.measureResult=el('output');this.measureResult.id='ruler-distance';
    this.measureResult.setAttribute('aria-label','Measured distance');this.measureResult.hidden=true;
    this.board.onMeasure=text=>{this.measureResult.textContent=text;this.measureResult.hidden=!text;};
    ruler.append(label,this.scaleLabel,this.measureResult);this.viewport.append(ruler);
    const gridSection=$('show-grid').closest('details');
    this.contrast=field(gridSection,'Grid contrast',{type:'range',id:'grid-contrast',min:20,max:90});this.contrast.value=60;
    this.contrast.oninput=()=>{const scene=this.getView()?.scene;if(scene){scene.gridOpacity=Number(this.contrast.value)/100;this.board.draw();}};
    this.contrast.onchange=()=>this.command({type:'scene.grid',gridOpacity:Number(this.contrast.value)/100});
    const scale=el('div','field-row');
    this.scale=field(scale,'Distance per square',{type:'number',id:'distance-per-square',min:.01,max:10000});this.scale.step='any';
    this.scaleUnit=selectField(scale,'Map scale unit',[['ft','Feet'],['m','Meters']],'distance-unit');
    gridSection.append(scale,button('Apply map scale',()=>this.command({type:'scene.grid',distancePerSquare:Number(this.scale.value),distanceUnit:this.scaleUnit.value})));
  }
  mountStatblock() {
    const {node,body}=dialog('Token statblock','statblock-dialog');this.dialog=node;this.sheetBody=body;
    this.sheetTitle=el('h3');this.sheetAccess=el('p','field-note');body.append(this.sheetTitle,this.sheetAccess);
    const sources=el('details','source-controls');sources.append(el('summary','','Link a character or monster'));this.sourceControls=sources;
    const sheetRow=el('div','source-row');
    this.characterSelect=selectField(sheetRow,'Character saved in this browser',[],'link-character');
    this.characterSourceRow=sheetRow;
    sheetRow.append(button('Use this character',()=>this.linkCharacter()));
    this.characterEmpty=el('p','field-note');sheetRow.append(this.characterEmpty);
    const openCharacter=el('a','button secondary','Create / open character sheet');
    openCharacter.href='../character.html';openCharacter.target='_blank';openCharacter.rel='noopener';sheetRow.append(openCharacter);
    sources.append(sheetRow);
    const monsterRow=el('div','source-row');
    this.monsterSearch=field(monsterRow,'Search monster / summon statblocks',{id:'link-monster-search'});
    this.monsterSelect=selectField(monsterRow,'Matching statblock',[],'link-monster');
    this.monsterSourceRow=monsterRow;
    monsterRow.append(button('Use this monster',()=>this.linkMonster()));sources.append(monsterRow);
    sources.append(el('p','field-note','Character resource edits sync with the character sheet in this browser. Monster links use a separate encounter instance; damage does not change the compendium template.'));
    this.linkState=el('p','field-note');this.unlinkButton=button('Unlink source',()=>{this.sources.unlink(this.sourceTokenId);this.render();});
    sources.append(this.linkState,this.unlinkButton);body.append(sources);
    sources.addEventListener('toggle',()=>{if(sources.open)this.loadSources();});
    this.monsterSearch.oninput=()=>this.filterMonsters();
    const form=el('form');this.statForm=form;
    this.statHP=el('div','field-row');
    this.statCurrent=field(this.statHP,'Current HP',{type:'number',id:'statblock-hp',min:0,max:999999});
    this.statMax=field(this.statHP,'Maximum HP',{type:'number',id:'statblock-max-hp',min:1,max:999999});
    form.append(this.statHP);this.statResources=new Map();
    const resourceDetails=el('details');resourceDetails.append(el('summary','','Resource values'));form.append(resourceDetails);
    for(const [key,name] of Object.entries(RESOURCE_NAMES)){
      const row=el('div','field-row'),current=field(row,name,{type:'number',id:'stat-'+key,min:0,max:999999});
      const max=field(row,name+' maximum (blank = value only)',{type:'number',min:0,max:999999});resourceDetails.append(row);
      this.statResources.set(key,{current,max});
    }
    const abilities=el('div','ability-fields');this.statAbilities=new Map();
    for(const key of ABILITIES)this.statAbilities.set(key,field(abilities,key.toUpperCase(),{type:'number',id:'stat-'+key,min:0,max:999}));
    form.append(abilities);
    const narrative=(title,id)=>{const label=el('label','field',title),input=el('textarea');input.id=id;input.rows=5;label.append(input);form.append(label);return input;};
    this.statNotes=narrative('Statblock notes','statblock-notes');this.statNotes.maxLength=4000;
    this.statRules=narrative('Features, actions & rules','statblock-rules');this.statRules.maxLength=12000;
    this.statSave=el('button','button primary full','Save statblock');this.statSave.type='submit';form.append(this.statSave);body.append(form);
    form.onsubmit=async event=>{
      event.preventDefault();const token=this.token(this.dialogToken);if(!token?.canEditStats)return;
      const resources={};
      for(const [key,row] of this.statResources)resources[key]={current:Number(row.current.value),max:key==='armorClass' || row.max.value===''?null:Number(row.max.value)};
      const abilities=Object.fromEntries([...this.statAbilities].filter(([,input])=>input.value!=='').map(([key,input])=>[key,Number(input.value)]));
      const patch={hp:Number(this.statCurrent.value),maxHp:Number(this.statMax.value),resources,
        statblock:{...token.statblock,type:token.statblock?.type || 'custom',abilities,notes:this.statNotes.value,rules:this.statRules.value}};
      await this.saveStats(token.id,patch);
    };
    const adjustment=dialog('Adjust hit points','adjust-hp-dialog');this.adjustDialog=adjustment.node;
    const adjustForm=el('form');this.adjustMode=selectField(adjustForm,'Adjustment',[['damage','Damage HP'],['heal','Heal HP']],'hp-adjustment');
    this.adjustAmount=field(adjustForm,'Amount',{type:'number',id:'hp-adjust-amount',min:1,max:999999,value:1});
    const apply=el('button','button primary full','Apply to HP');apply.type='submit';adjustForm.append(apply);
    adjustForm.append(el('p','field-note','This adjusts HP directly. Apply any Block, temporary HP or other reductions before entering the amount.'));
    adjustment.body.append(adjustForm);
    adjustForm.onsubmit=async event=>{
      event.preventDefault();const token=this.token(this.adjustToken);if(!token?.canEditStats)return;
      const direction=this.adjustMode.value==='heal'?1:-1,hp=Math.min(token.maxHp,Math.max(0,token.hp+direction*Number(this.adjustAmount.value)));
      await this.saveStats(token.id,{hp});this.adjustDialog.close();
    };
  }
  mountSidebar() {
    this.sidebar=new QuickSheet({getLink:id=>this.sources.linkFor(id),onLink:kind=>this.openLinker(kind),onEdit:()=>this.openStatblock()});
    this.sidebar.stats.remove();this.dock.append(this.sidebar.abilities);
    document.querySelector('.selected-heading').after(this.sidebar.element);
    this.sidebar.linkerHost.append(this.sourceControls);
    this.sourceControls.open=false;
    this.tokenSettings=el('details','token-settings');this.tokenSettings.id='token-settings';
    this.tokenSettings.append(el('summary','','Token settings'),$('token-form'),this.resourceSection);
    this.sidebar.element.after(this.tokenSettings);
  }
  openLinker(kind,id=this.getSelected()) {
    if(!this.token(id)?.canEditStats)return;
    this.sourceTokenId=id;this.characterSourceRow.hidden=kind!=='character';this.monsterSourceRow.hidden=kind!=='monster';
    this.sourceControls.hidden=false;this.sourceControls.open=true;this.sidebar.reading.open=true;
    document.body.classList.add('panels-open');
    this.loadSources();this.sourceControls.scrollIntoView({block:'nearest'});
  }
  refreshCharacterChoices() {
    if(!this.characterSelect)return;
    const characters=this.sources.characters(),previous=this.characterSelect.value;
    this.characterSelect.replaceChildren(...characters.map(character=>new Option(character.name || 'Unnamed character',character.id)));
    if(characters.some(character=>character.id===previous))this.characterSelect.value=previous;
    this.characterEmpty.textContent=characters.length?'Choose a saved character, then use it for this token.':'No characters saved here yet. Create or import one using the character-sheet page below, then return here to link it.';
    this.sidebar?.render(this.token(),this.connected);
  }
  mountTemplates() {
    const tool=el('button','tool');tool.type='button';tool.dataset.tool='template';tool.title='Spell area (A)';
    tool.setAttribute('aria-label','Spell area');tool.setAttribute('aria-pressed','false');
    tool.innerHTML='<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>';
    document.querySelector('[data-tool="measure"]').after(tool);
    const panel=el('div','spell-options');panel.id='spell-options';panel.hidden=true;
    const fields=el('div','spell-fields');
    this.areaShape=selectField(fields,'Area',[['circle','Circle'],['cone','Cone'],['line','Line'],['square','Square']],'spell-shape');
    this.areaSize=field(fields,'Radius',{type:'number',id:'spell-size',min:.01,max:1000,value:20});this.areaSize.step='any';
    this.areaUnit=selectField(fields,'Units',[['ft','Feet'],['m','Meters'],['squares','Squares']],'spell-unit');
    const extra=el('div','spell-extra');
    this.areaWidth=field(extra,'Line width',{type:'number',id:'spell-width',min:.01,max:1000,value:5});this.areaWidth.step='any';
    this.areaAngle=selectField(extra,'Cone angle',[['60','60°'],['90','90°'],['45','45°'],['120','120°'],['180','180°']],'spell-angle');
    const actions=el('div','button-row');
    this.placeArea=button('Place for table',async()=>{
      if(!this.board.templatePreview)return;
      const view=await this.command({type:'template.add',template:{...this.board.templatePreview,name:templateLabel(this.board.templatePreview)}});
      if(view){this.board.templatePreview=null;this.board.draw();this.updateTemplateControls();}
    },'button primary');
    actions.append(this.placeArea,button('Clear preview',()=>{this.board.templatePreview=null;this.board.draw();this.updateTemplateControls();}));
    this.areaHint=el('p','field-note','Drag on the map to aim. Preview is only visible to you.');
    panel.append(fields,extra,actions,this.areaHint);this.viewport.append(panel);this.spellPanel=panel;
    for(const input of [this.areaShape,this.areaSize,this.areaUnit,this.areaWidth,this.areaAngle])input.onchange=()=>{
      if(!this.areaSize.reportValidity() || !this.areaWidth.reportValidity())return;
      this.board.templateConfig={shape:this.areaShape.value,size:Number(this.areaSize.value),unit:this.areaUnit.value,width:Number(this.areaWidth.value),coneAngle:Number(this.areaAngle.value)};
      if(this.board.templatePreview)Object.assign(this.board.templatePreview,this.board.templateConfig);
      this.updateTemplateControls();this.board.draw();
    };
    this.board.onTemplate=()=>this.updateTemplateControls();
    const placed=el('details','inspector-section placed-areas');placed.append(el('summary','','Spell areas'));
    this.placedAreas=el('div');placed.append(this.placedAreas);$('inspector').append(placed);this.updateTemplateControls();
  }
  onTool(tool) {this.spellPanel.hidden=tool!=='template';this.updateTemplateControls();}
  updateTemplateControls() {
    const shape=this.areaShape.value;
    this.areaSize.closest('label').firstChild.textContent=shape==='circle'?'Radius':shape==='square'?'Side length':'Length';
    this.areaWidth.closest('label').hidden=shape!=='line';this.areaAngle.closest('label').hidden=shape!=='cone';
    this.placeArea.disabled=!this.connected || !this.board.templatePreview;
  }
  async loadSources() {
    const token=this.token(this.sourceTokenId || this.getSelected());if(!token?.canEditStats)return;
    const id=token.id;this.refreshCharacterChoices();
    try{const monsters=await this.sources.monsters();if(this.sourceTokenId!==id)return;this.monsters=monsters;this.filterMonsters();}
    catch(error){this.notify(error.message,true);}
  }
  filterMonsters() {
    const query=this.monsterSearch.value.toLowerCase();
    this.monsterSelect.replaceChildren(...(this.monsters || []).filter(entry=>entry.name.toLowerCase().includes(query)).slice(0,60)
      .map(entry=>new Option(entry.name,entry._monsterEditorKey || (entry.details?.id?'id:'+entry.details.id:JSON.stringify([entry.source || '',entry.group || '',entry.name])))));
  }
  async linkCharacter() {
    if(!this.characterSelect.value)return this.notify('Create or import a character in the character sheet first.',true);
    try{await this.sources.link(this.sourceTokenId,'character',this.characterSelect.value);this.sourceControls.open=false;this.sidebar.reading.open=true;this.render();this.notify('Character linked. Its resource values now sync in this browser.');}
    catch(error){this.notify(error.message,true);}
  }
  async linkMonster() {
    if(!this.monsterSelect.value)return;
    try{await this.sources.link(this.sourceTokenId,'monster',this.monsterSelect.value);this.sourceControls.open=false;this.sidebar.reading.open=true;this.render();this.notify('Monster statblock linked to this encounter token.');}
    catch(error){this.notify(error.message,true);}
  }
  openStatblock(id=this.getSelected()) {
    const token=this.token(id);if(!token)return;
    this.dialogToken=id;this.renderDialog(true);if(!this.dialog.open)this.dialog.showModal();
  }
  renderDialog(force=false) {
    const token=this.token(this.dialogToken);if(!token){if(this.dialog.open)this.dialog.close();return;}
    this.sheetTitle.textContent=token.name;
    this.sheetAccess.textContent=!token.canViewStats?'Private character stats. The owning player can choose to share with the DM.':token.canEditStats?'Your changes update this token and its bars.':'Shared with you for reading. The player controls edits.';
    this.statForm.hidden=!token.canViewStats;
    if(!token.canViewStats){this.statForm.reset();return;}
    if(!force && token.canEditStats && this.statForm.contains(document.activeElement))return;
    const link=this.sources.linkFor(token.id),linkedCharacter=link?.kind==='character';
    const character=linkedCharacter?this.sources.characters().find(character=>character.id===link.id):null;
    this.linkState.textContent=link?'Linked to '+(link.kind==='character'?'a character saved in this browser.':'a monster statblock.'):token.statblock?.type==='character'?'Character snapshot. Link its sheet in this browser to keep syncing.':'No linked source.';
    this.unlinkButton.hidden=!link;
    this.statCurrent.value=token.hp;this.statMax.value=token.maxHp;
    for(const [key,row] of this.statResources){
      row.current.value=token.resources[key]?.current ?? 0;row.max.value=token.resources[key]?.max ?? '';
      row.current.disabled=!this.connected || !token.canEditStats || (key==='armorClass' && !!character?.build?.enabled);
      row.max.disabled=!this.connected || !token.canEditStats || key==='armorClass';
    }
    for(const [key,input] of this.statAbilities){input.value=token.statblock?.abilities?.[key] ?? '';input.disabled=!this.connected || !token.canEditStats || !!link;}
    this.statNotes.value=token.statblock?.notes || '';this.statRules.value=token.statblock?.rules || '';
    for(const input of [this.statCurrent,this.statMax,this.statNotes,this.statRules])input.disabled=!this.connected || !token.canEditStats;
    this.statMax.disabled ||= !!character?.build?.enabled;
    this.statNotes.disabled ||= !!link;this.statRules.disabled ||= !!link;
    this.statSave.hidden=!token.canEditStats;this.statSave.disabled=!this.connected;
  }
  mountMenu() {
    this.menu=el('div','token-menu');this.menu.id='token-context-menu';this.menu.hidden=true;this.menu.setAttribute('role','menu');this.menu.setAttribute('aria-label','Map and token actions');document.body.append(this.menu);
    document.addEventListener('pointerdown',event=>{if(!this.menu.contains(event.target))this.menu.hidden=true;});
    document.addEventListener('keydown',event=>{
      if(this.menu.hidden)return;
      if(event.key==='Escape'){this.menu.hidden=true;this.board.canvas.focus();return;}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();const buttons=[...this.menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
        buttons[next]?.focus();
      }
    });
  }
  showMenu({tokenId,templateIds=[],preview=false,x,y,point}) {
    const view=this.getView();if(!view)return;
    const token=this.token(tokenId),items=[],dm=view.self.role==='dm';
    const action=(text,callback)=>{const node=button(text,()=>{this.menu.hidden=true;callback();},'menu-action');node.setAttribute('role','menuitem');items.push(node);};
    if(preview)action('Clear spell preview',()=>{this.board.templatePreview=null;this.board.draw();this.updateTemplateControls();});
    const areas=templateIds.map(id=>view.scene.templates.find(area=>area.id===id)).filter(Boolean);
    for(const area of areas){
      if(dm || area.ownerId===view.self.id)action(areas.length===1?'Remove spell area':'Remove '+area.name,()=>this.command({type:'template.delete',id:area.id}));
    }
    if(token){
      this.selectToken(token.id);
      action(token.canViewStats?'Open statblock':'Character privacy',()=>this.openStatblock(token.id));
      if(token.canEditStats){
        action('Adjust HP',()=>{this.adjustToken=token.id;this.adjustDialog.showModal();this.adjustAmount.focus();this.adjustAmount.select();});
        action('Configure resource bars',()=>{this.tokenSettings.open=true;this.barDetails.open=true;document.body.classList.add('panels-open');this.resourceSection.scrollIntoView({block:'nearest'});});
        action('Link character',()=>this.openLinker('character',token.id));
        action('Link monster',()=>this.openLinker('monster',token.id));
      }
      if(dm)action(token.hidden?'Show to players':'Hide from players',()=>this.command({type:'token.update',id:token.id,hidden:!token.hidden}));
      action('Center on token',()=>this.board.center(token));
    }else{
      if(dm)action('Add token here',()=>this.onAdd(point));
      action('Center map here',()=>this.board.center(point));
      if(dm){
        const scene=view.scene,cell=Math.floor(point.y/scene.gridSize)*Math.ceil(scene.width/scene.gridSize)+Math.floor(point.x/scene.gridSize);
        if(point.x>=0 && point.x<scene.width && point.y>=0 && point.y<scene.height){
          action('Reveal this square',()=>this.command({type:'fog.paint',cells:[cell],reveal:true}));
          action('Conceal this square',()=>this.command({type:'fog.paint',cells:[cell],reveal:false}));
        }
      }
    }
    action('Measure from here',()=>{
      document.querySelector('[data-tool="measure"]').click();this.board.measureFrom(point);
    });
    action('Spell area from here',()=>{
      document.querySelector('[data-tool="template"]').click();this.board.templateAnchor=point;
    });
    action('Fit map',()=>this.board.fit());
    this.menu.replaceChildren(el('div','menu-heading',token?.name || 'Battle map'),...items);this.menu.hidden=false;
    this.menu.style.left=Math.max(8,Math.min(x,innerWidth-this.menu.offsetWidth-8))+'px';
    this.menu.style.top=Math.max(8,Math.min(y,innerHeight-this.menu.offsetHeight-8))+'px';items[0]?.focus();
  }
  render() {
    const view=this.getView(),token=this.token();this.dock.hidden=!token;
    this.sidebar.render(token,this.connected);this.tokenSettings.hidden=!token;
    this.sidebar.abilities.hidden=!token?.canViewStats || !token.statblock;
    if(token){
      if(this.sourceTokenId!==token.id){this.sourceTokenId=token.id;this.sourceControls.open=false;}
      this.sourceControls.hidden=!token.canEditStats;
      const link=this.sources.linkFor(token.id);
      this.linkState.textContent=link?'This token is linked to '+(link.kind==='character'?'your saved character.':'a monster statblock.'):'Linking fills this token’s stats and keeps its bars up to date.';
      this.unlinkButton.hidden=!link;
    }
    if(!view)return;
    this.scaleLabel.textContent='1 square = '+view.scene.distancePerSquare+' '+view.scene.distanceUnit;
    this.updateTemplateControls();
    this.placedAreas.replaceChildren(...(view.scene.templates || []).map(area=>{
      const row=el('div','placed-area'),owner=view.players.find(player=>player.id===area.ownerId)?.name || 'DM';
      row.append(el('span','',area.name+' · '+owner));
      row.append(button('Find',()=>this.board.center(area),'text-button'));
      if(view.self.role==='dm' || area.ownerId===view.self.id)row.append(button('Remove',()=>this.command({type:'template.delete',id:area.id}),'text-button danger'));
      return row;
    }));
    if(document.activeElement!==this.scale)this.scale.value=view.scene.distancePerSquare;
    if(document.activeElement!==this.scaleUnit)this.scaleUnit.value=view.scene.distanceUnit;
    if(document.activeElement!==this.contrast)this.contrast.value=view.scene.gridOpacity*100;
    this.resourceSection.hidden=!token;
    if(!token)return;
    this.dockName.textContent=token.name;
    this.dockAccess.textContent=!token.canViewStats?'Private stats':token.canEditStats?'Your token':'Shared · read only';
    this.dockNote.textContent=!token.canViewStats?'Character stats belong to the player. They can share access with the DM.':'';
    this.dockNote.hidden=token.canViewStats;
    this.privateNote.textContent=token.ownerId===view.self.id?'Your character stats are private. Sharing lets the DM read your statblock and bars.':!token.canViewStats?'The player has not shared this character’s stats.':token.canEditStats?'Health and enabled bars appear when this token is selected or hovered.':'The player shared this character for reading.';
    this.share.closest('label').hidden=token.ownerId!==view.self.id;
    if(this.sharingToken!==token.id)this.share.checked=token.shareWithDM===true;
    this.share.disabled=!this.connected || this.sharingToken===token.id;
    this.barDetails.hidden=!token.canEditStats;
    const bars=utilityReadings(token),link=this.sources.linkFor(token.id),character=link?.kind==='character'?this.sources.characters().find(character=>character.id===link.id):null;
    const health=healthSummary(token);this.healthOverview.hidden=!health;
    this.healthAC.textContent=health?.armorClass ?? '';this.healthTotal.textContent=health?health.current+' / '+health.max:'';
    this.healthTrack.setAttribute('aria-valuemin','0');this.healthTrack.setAttribute('aria-valuemax',String(health?.max || 1));this.healthTrack.setAttribute('aria-valuenow',String(health?.current || 0));
    this.healthSegments.forEach((node,index)=>{node.style.width=(health?.segments[index].fraction || 0)*100+'%';node.style.background=health?.segments[index].color || '';});
    for(const [key,input] of this.healthExtras){
      if(!health || document.activeElement!==input)input.value=health?token.resources[key].current:'';
      input.disabled=!this.connected || !token.canEditStats;
    }
    this.poolFields.forEach((row,index)=>{
      const bar=bars[index];row.form.hidden=!bar;if(!bar){row.current.value='';row.maximum.value='';return;}
      row.title.textContent=bar.label;row.current.setAttribute('aria-label',bar.label+' current');row.maximum.setAttribute('aria-label',bar.label+' maximum');
      if(document.activeElement!==row.current){row.current.value=bar.current;row.current.setCustomValidity('');}
      if(document.activeElement!==row.maximum){row.maximum.value=bar.max ?? '';row.maximum.setCustomValidity('');}
      row.current.disabled=!this.connected || !token.canEditStats || (bar.key==='armorClass' && !!character?.build?.enabled);
      row.maximum.disabled=!this.connected || !token.canEditStats || (bar.key==='hp' && !!character?.build?.enabled);
      row.maximum.hidden=bar.max===null;row.divider.hidden=bar.max===null;
      row.fill.style.width=(bar.max?Math.min(100,bar.current/bar.max*100):bar.current?100:0)+'%';row.fill.style.background=bar.color;
    });
    const changed=this.renderedToken!==token.id,editing=this.barForm.contains(document.activeElement);
    if(token.canEditStats && (!editing || changed)){
      this.barInputs.forEach((row,index)=>{
        const bar=token.bars[index],pool=token.resources[bar.resource];
        row.enabled.checked=bar.enabled;row.label.value=bar.label;row.resource.value=bar.resource;
        row.current.value=pool.current;row.max.value=bar.valueOnly?'':pool.max ?? '';row.max.disabled=bar.resource==='armorClass';
        row.current.disabled=bar.resource==='armorClass' && !!character?.build?.enabled;
        row.row.disabled=!this.connected;
      });
    }
    this.renderedToken=token.id;
    if(this.dialog.open)this.renderDialog();
  }
}
