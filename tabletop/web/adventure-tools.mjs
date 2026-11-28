import {TRAVEL_MODES,TRAVEL_NAMES,feet,travelLabel} from './travel.mjs';
import {loadReferences} from './sources.mjs';
import {ConditionPicker} from './condition-picker.mjs';

const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const button=(name,run,cls='button secondary')=>{const node=el('button',cls,name);node.type='button';node.onclick=run;return node;};
function field(parent,name,id,{type='text',value='',min,max}={}){
  const label=el('label','field',name),input=el('input');input.id=id;input.type=type;input.value=value;
  if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;label.append(input);parent.append(label);return input;
}
function select(parent,name,id,choices){const label=el('label','field',name),input=el('select');input.id=id;input.append(...choices.map(([value,text])=>new Option(text,value)));label.append(input);parent.append(label);return input;}
function check(parent,name,id,value=false){const label=el('label','check-field'),input=el('input');input.id=id;input.type='checkbox';input.checked=value;label.append(input,document.createTextNode(name));parent.append(label);return input;}
function dialog(title,id){const node=el('dialog','adventure-dialog');node.id=id;const head=el('div','dialog-heading'),body=el('div','dialog-body');head.append(el('h2','',title),button('Close',()=>node.close(),'text-button'));node.append(head,body);document.body.append(node);return {node,body};}
const triggerChoices=[['turn-start','Start of this token’s turn'],['turn-end','End of this token’s turn'],['round-start','Start of each round'],['move','After movement'],['damage','After taking damage'],['heal','After gaining HP'],['hp-zero','When HP reaches zero'],['condition-added','When a condition is applied'],['condition-removed','When a condition ends']];

export class AdventureTools {
  constructor({tools,getView,getSelected,command,selectToken,board,notify,showEvents}){
    Object.assign(this,{tools,getView,getSelected,command,selectToken,board,notify,showEvents});this.connected=false;
    this.eventsPane=el('section','encounter-events');this.eventsPane.append(el('h3','','Encounter events'));
    this.eventsHint=el('p','slate-note');this.eventsList=el('div','encounter-event-list');this.eventsPane.append(this.eventsHint,this.eventsList);
    this.mountTravel();this.mountGrants();this.mountEffects();this.mountTraps();this.mountDuration();this.mountScene();
    tools.onConditionDuration=(id,conditionId)=>this.openDuration(id,conditionId);
    tools.onEditTrap=id=>this.openTrap(id);
    tools.onAutomaticEffects=()=>this.openEffects();
    tools.onTravel=()=>{tools.revealUtilities?.();this.travel.open=true;this.travel.scrollIntoView({block:'nearest'});};
    board.onTravel=id=>{this.selectToken(id);tools.onTravel();};
    board.onPing=point=>this.send({type:'map.ping',x:Math.max(0,Math.min(this.getView().scene.width-1,point.x)),y:Math.max(0,Math.min(this.getView().scene.height-1,point.y))});
    tools.onPing=board.onPing;
    const make=button('Make trigger',()=>this.openTrap());make.id='make-area-trigger';tools.spellPanel.querySelector('.button-row').append(make);tools.triggerAreaButton=make;
    $('game-log').addEventListener('click',event=>{const row=event.target.closest('[data-event-id]');if(row)this.showEvents();});
  }
  token(){return this.getView()?.scene.tokens.find(token=>token.id===this.getSelected());}
  async send(command){const result=await this.command(command);if(result)this.render(this.connected);return result;}
  mountTravel(){
    const panel=el('details','travel-controls');panel.id='token-travel';const summary=el('summary');this.travelSummary=el('span');summary.append(el('strong','','Travel'),this.travelSummary);panel.append(summary);
    const content=el('div','travel-content'),row=el('div','travel-fields');
    this.mode=select(row,'Travel mode','travel-mode',TRAVEL_MODES.map(mode=>[mode,TRAVEL_NAMES[mode]]));
    this.height=field(row,'Height / depth (ft; below ground is negative)','travel-height',{type:'number',min:-5000,max:5000,value:0});
    const apply=button('Apply mode / height',()=>this.applyTravel());apply.id='apply-travel';this.travelApply=apply;row.append(apply);content.append(row);
    this.movementReading=el('p','movement-reading');this.movementReading.id='movement-reading';this.travelNote=el('p','field-note');content.append(this.movementReading,this.travelNote);
    const actions=el('div','button-row');this.dash=button('Dash',()=>this.send({type:'movement.dash',id:this.token().id}));this.dash.id='movement-dash';
    this.resetMovement=button('Reset movement',()=>this.send({type:'movement.reset',id:this.token().id}));this.resetMovement.id='movement-reset';
    this.grants=button('Granted speeds',()=>this.openGrants());this.grants.id='movement-grants';
    actions.append(this.dash,this.resetMovement,this.grants,button('Automatic effects',()=>this.openEffects()),button('Events',()=>this.showEvents()));content.append(actions);
    this.force=check(content,'GM reposition: ignore triggers and movement cost','gm-force-movement');this.force.closest('label').setAttribute('data-dm','');this.force.onchange=()=>{this.board.forceMovement=this.force.checked;};
    this.extraRow=el('div','travel-fields');this.extraRow.setAttribute('data-dm','');this.extra=field(this.extraRow,'Extra movement granted this turn (ft)','movement-extra',{type:'number',min:0,max:999999,value:0});
    this.extraRow.append(button('Grant allowance',()=>{if(this.extra.reportValidity())this.send({type:'movement.extra',id:this.token().id,amount:Number(this.extra.value)});}));content.append(this.extraRow);
    panel.append(content);toolsDock(this.tools).insertBefore(panel,this.tools.conditionTray);this.travel=panel;
  }
  applyTravel(){const token=this.token();if(!token || !this.height.reportValidity())return;
    this.send({type:'token.travel',id:token.id,mode:this.mode.value,z:Number(this.height.value),force:this.force.checked && this.getView().self.role==='dm'});
  }
  mountGrants(){
    const {node,body}=dialog('Granted movement speeds','movement-grants-dialog');this.grantsDialog=node;
    body.append(el('p','field-note','Enter speeds actually granted by your character, creature, item or spell. Swimming and climbing without their own speed use walking movement at double cost.'));
    const form=el('form'),grid=el('div','ability-fields');this.speedInputs=new Map();
    for(const mode of ['walk','fly','swim','climb','burrow'])this.speedInputs.set(mode,field(grid,TRAVEL_NAMES[mode]+' speed (ft)','grant-'+mode,{type:'number',min:0,max:999999}));
    this.grantHover=check(form,'This flight can hover','grant-hover');this.grantSource=field(form,'Source / rule','grant-source');this.grantSource.required=true;
    this.grantTurns=field(form,'Expires after this many turns (blank = until cleared)','grant-turns',{type:'number',min:1,max:1000});
    form.prepend(grid);const save=el('button','button primary','Save granted speeds');save.type='submit';form.append(save,button('Clear temporary overrides',async()=>{if(await this.send({type:'token.mobility',id:this.grantsToken,profile:{},sourceName:'Temporary overrides cleared'}))node.close();}));body.append(form);
    form.onsubmit=async event=>{event.preventDefault();const speeds={};for(const [mode,input] of this.speedInputs)if(input.value!=='')speeds[mode]=Number(input.value);
      if(await this.send({type:'token.mobility',id:this.grantsToken,profile:{speeds,hover:this.grantHover.checked?true:null},sourceName:this.grantSource.value,turns:this.grantTurns.value?Number(this.grantTurns.value):null}))node.close();};
  }
  openGrants(){const token=this.token();if(!token?.canEditStats)return;this.grantsToken=token.id;
    for(const [mode,input] of this.speedInputs){input.value=token.movementOverrides?.speeds?.[mode] ?? '';const native=token.movementProfile?.speeds?.[mode] ?? (mode==='walk'?token.speed:null);input.placeholder=native==null?'No separate speed':native+' ft from sheet';}
    this.grantHover.checked=token.movementOverrides?.hover===true;this.grantSource.value='';this.grantTurns.value=token.mobilityGrantTimer?.remaining ?? '';this.grantsDialog.showModal();
  }
  actionFields(parent,prefix){
    const box=el('div','automatic-action-fields'),type=select(box,'Effect',prefix+'-action',[['message','Message / GM decision'],['damage','Damage'],['heal','Healing / regeneration'],['resource','Change a resource'],['condition','Apply a condition'],['remove-condition','Remove a condition']]);
    const amount=field(box,'Amount or dice',prefix+'-amount');amount.placeholder='5 or 2d6+3';
    const resource=select(box,'Resource',prefix+'-resource',[['tempHP','Temp HP'],['arcaneHealth','Arcane health'],['block','Block'],['tempBlock','Temp Block'],['custom1','Custom resource 1'],['custom2','Custom resource 2']]);
    const operation=select(box,'Resource change',prefix+'-operation',[['add','Add / restore'],['set','Set to this amount'],['subtract','Spend / remove']]);
    const damageType=select(box,'Damage type',prefix+'-damage-type',[['','Untyped / already adjusted'],...['bludgeoning','piercing','slashing','fire','cold','acid','lightning','sonic','poison','necrotic','radiant','psychic','force','bleeding'].map(type=>[type,type])]);
    const picker=new ConditionPicker(box,prefix),condition=picker.select;
    const stacks=field(box,'Condition stacks',prefix+'-stacks',{type:'number',min:1,max:99,value:1}),turns=field(box,'Condition duration in turns (blank = no timer)',prefix+'-turns',{type:'number',min:1,max:1000});
    const notes=field(box,'Message / effect rules',prefix+'-text');notes.maxLength=600;
    const save=select(box,'Saving throw before applying',prefix+'-save',[['','No saving throw'],...['str','dex','con','int','wis','cha'].map(key=>[key,key.toUpperCase()])]);
    const dc=field(box,'Save DC',prefix+'-dc',{type:'number',min:1,max:99,value:15}),half=check(box,'Half damage on a successful save',prefix+'-half');
    const update=()=>{amount.closest('label').hidden=!['damage','heal','resource'].includes(type.value);amount.required=['damage','heal','resource'].includes(type.value);
      for(const input of [resource,operation])input.closest('label').hidden=type.value!=='resource';
      damageType.closest('label').hidden=type.value!=='damage';for(const input of [stacks,turns])input.closest('label').hidden=!['condition','remove-condition'].includes(type.value);
      picker.setEnabled(['condition','remove-condition'].includes(type.value));dc.closest('label').hidden=half.closest('label').hidden=!save.value;
      dc.disabled=!save.value;half.disabled=!save.value || type.value!=='damage';};
    picker.onChange=()=>{stacks.max=globalThis.CharacterConditions?.lookup(condition.value)?.maxStacks || 99;stacks.value=Math.min(Number(stacks.value) || 1,Number(stacks.max));};
    type.onchange=save.onchange=update;parent.append(box);update();
    return {type,amount,damageType,condition,stacks,turns,notes,save,dc,half,update,
      value:()=>{let row=null;if(['condition','remove-condition'].includes(type.value))row=picker.value(Number(stacks.value));
        return {type:type.value,amount:amount.value || 0,damageType:damageType.value,resource:resource.value,operation:operation.value,condition:row,turns:turns.value?Number(turns.value):null,text:notes.value,save:save.value?{ability:save.value,dc:Number(dc.value),half:half.checked}:null};},
      load:action=>{type.value=action?.type || 'message';amount.value=action?.amount ?? '';resource.value=action?.resource || 'tempHP';operation.value=action?.operation || 'add';damageType.value=action?.damageType || '';picker.load(action?.condition);stacks.max=globalThis.CharacterConditions?.lookup(action?.condition?.id)?.maxStacks || 99;stacks.value=action?.condition?.stacks || 1;turns.value=action?.turns || '';notes.value=action?.text || '';save.value=action?.save?.ability || '';dc.value=action?.save?.dc || 15;half.checked=!!action?.save?.half;update();}};
  }
  fillTargets(input,empty=false){const view=this.getView(),current=input.value;input.replaceChildren(...(empty?[new Option('Scene / GM source','')]:[]),...view.scene.tokens.filter(token=>view.self.role==='dm' || token.canEditStats).map(token=>new Option(token.name,token.id)));
    if([...input.options].some(option=>option.value===current))input.value=current;else if(this.token() && [...input.options].some(option=>option.value===this.token().id))input.value=this.token().id;
  }
  mountEffects(){
    const {node,body}=dialog('Automatic effects & event triggers','automatic-effect-dialog');this.effectsDialog=node;
    body.append(el('p','field-note','Configure an effect’s actual rule and timing. Start/end-turn effects can expire after a chosen number of applications. Saving throws create events to resolve.'));
    const form=el('form');this.effectTarget=select(form,'Affected token','effect-target',[]);this.effectName=field(form,'Effect name','effect-name');this.effectName.required=true;
    this.effectSource=field(form,'Source / rule','effect-source');this.effectTrigger=select(form,'When','effect-trigger',triggerChoices);
    this.effectFilter=field(form,'Condition filter (optional name or ID)','effect-condition-filter');this.effectUses=field(form,'Applications before expiry (blank = unlimited)','effect-uses',{type:'number',min:1,max:1000});
    this.effectAction=this.actionFields(form,'effect');const save=el('button','button primary','Add automatic effect');save.type='submit';form.append(save);this.effectRows=el('div','automatic-effect-list');body.append(form,el('h3','','Active automatic effects'),this.effectRows);
    form.onsubmit=async event=>{event.preventDefault();try{const filter=this.effectFilter.value.trim(),definition=globalThis.CharacterConditions?.lookup(filter);
      if(await this.send({type:'effect.save',effect:{tokenId:this.effectTarget.value,name:this.effectName.value,sourceName:this.effectSource.value,trigger:this.effectTrigger.value,conditionId:definition?.id || filter,uses:this.effectUses.value?Number(this.effectUses.value):null,action:this.effectAction.value()}})){this.effectName.value='';this.effectAction.load({type:'message'});this.renderEffects();}
    }catch(error){this.notify(error.message,true);}};
  }
  async openEffects(){try{await loadReferences();}catch(error){this.notify(error.message,true);return;}this.fillTargets(this.effectTarget);this.effectName.value='';this.effectAction.load({type:'message'});this.renderEffects();
    this.effectsDialog.showModal();}
  renderEffects(){const view=this.getView();if(!view)return;this.effectRows.replaceChildren(...(view.scene.effects || []).map(effect=>{
    const row=el('article','automatic-effect-row');row.append(el('strong','',effect.name),el('p','',effect.trigger+' · '+effect.action.type+(effect.uses!==null?' · '+effect.uses+' applications left':'')),button('Remove',()=>this.send({type:'effect.remove',id:effect.id}),'text-button danger'));return row;
  }));if(!this.effectRows.children.length)this.effectRows.append(el('p','field-note','No automatic effects configured.'));
  }
  mountTraps(){
    const {node,body}=dialog('Trap or triggered spell area','trap-dialog');this.trapDialog=node;const form=el('form');
    this.trapName=field(form,'Name','trap-name');this.trapName.required=true;this.trapTarget=select(form,'Character / creature placing it','trap-token',[]);
    this.trapSource=select(form,'Inventory, spell or feature source','trap-source',[['','Manual / table-approved source']]);this.trapSourceName=field(form,'Source / rule description','trap-source-name');
    this.trapTarget.onchange=()=>this.fillTrapSources();
    const limits=el('div','field-row');this.trapMin=field(limits,'Minimum elevation (ft)','trap-min-height',{type:'number',min:-5000,max:5000,value:0});this.trapMax=field(limits,'Maximum elevation (ft)','trap-max-height',{type:'number',min:-5000,max:5000,value:5});form.append(limits);
    const filters=el('fieldset','trigger-mode-filters');filters.append(el('legend','','Affected movement modes'));this.trapModes=new Map();for(const mode of TRAVEL_MODES)this.trapModes.set(mode,check(filters,TRAVEL_NAMES[mode],'trap-mode-'+mode,['walk','swim','climb'].includes(mode)));form.append(filters);
    const timing=el('fieldset','trigger-mode-filters');timing.append(el('legend','','Trigger when'));this.trapTimings=new Map();for(const [key,name] of [['enter','Entering / crossing'],['turn-start','Starting a turn inside'],['turn-end','Ending a turn inside']])this.trapTimings.set(key,check(timing,name,'trap-trigger-'+key,key==='enter'));form.append(timing);
    this.trapHidden=check(form,'Hidden from other players','trap-hidden',true);this.trapReveal=check(form,'Reveal when triggered','trap-reveal',true);this.trapOnce=check(form,'One use; disarm after triggering','trap-once',true);this.trapTouch=check(form,'Trigger when the token’s footprint touches the area','trap-touch',true);this.trapIgnoreOwner=check(form,'Ignore the character who placed it','trap-ignore-owner');
    this.trapAction=this.actionFields(form,'trap');this.trapAction.load({type:'message',text:'Resolve this trigger using its source rule.'});
    this.trapApproval=el('p','field-note');this.trapSave=el('button','button primary','Place trigger');this.trapSave.type='submit';form.append(this.trapApproval,this.trapSave);body.append(form);
    form.onsubmit=async event=>{event.preventDefault();try{
      const trap={...this.trapDraft,name:this.trapName.value,tokenId:this.trapTarget.value,sourceId:this.trapSource.value,sourceName:this.trapSourceName.value,
        minHeight:Number(this.trapMin.value),maxHeight:Number(this.trapMax.value),modes:[...this.trapModes].filter(([,node])=>node.checked).map(([key])=>key),triggers:[...this.trapTimings].filter(([,node])=>node.checked).map(([key])=>key),
        hidden:this.trapHidden.checked,revealOnTrigger:this.trapReveal.checked,once:this.trapOnce.checked,touchFootprint:this.trapTouch.checked,ignoreOwner:this.trapIgnoreOwner.checked,action:this.trapAction.value(),pending:false,armed:true};
      if(await this.send({type:'trap.save',trap})){this.trapDialog.close();this.board.templatePreview=null;this.tools.updateTemplateControls();this.board.draw();this.showEvents();}
    }catch(error){this.notify(error.message,true);}};
    this.trapRows=el('div','placed-trigger-list');
  }
  fillTrapSources(){const token=this.getView().scene.tokens.find(token=>token.id===this.trapTarget.value);this.trapSource.replaceChildren(new Option('Manual / table-approved source',''),...(token?.movementProfile?.sources || []).map(source=>new Option(source.name,source.id)));}
  async openTrap(id){const view=this.getView(),existing=(view.scene.traps || []).find(trap=>trap.id===id),draft=existing || this.board.templatePreview;if(!draft)return this.notify('Draw a spell area on the map first.');
    try{await loadReferences();}catch(error){this.notify(error.message,true);return;}this.trapDraft={...draft};if(!existing)delete this.trapDraft.id;
    this.fillTargets(this.trapTarget,view.self.role==='dm');if(existing?.tokenId)this.trapTarget.value=existing.tokenId;this.fillTrapSources();
    this.trapName.value=existing?.name || '';this.trapSource.value=existing?.sourceId || '';this.trapSourceName.value=existing?.sourceName || '';
    this.trapMin.value=existing?.minHeight ?? 0;this.trapMax.value=existing?.maxHeight ?? 5;
    for(const [key,input] of this.trapModes)input.checked=(existing?.modes || ['walk','swim','climb']).includes(key);
    for(const [key,input] of this.trapTimings)input.checked=(existing?.triggers || ['enter']).includes(key);
    this.trapHidden.checked=existing?.hidden ?? true;this.trapReveal.checked=existing?.revealOnTrigger ?? true;this.trapOnce.checked=existing?.once ?? true;this.trapTouch.checked=existing?.touchFootprint ?? true;this.trapIgnoreOwner.checked=existing?.ignoreOwner ?? view.self.role!=='dm';
    this.trapAction.load(existing?.action || {type:'message',text:'Resolve this trigger using its source rule.'});
    this.trapApproval.textContent=view.self.role==='dm'?'Movement pauses at a trigger until its event is resolved.':'Your trap or spell area is proposed to the GM and becomes active after approval. Apply item and spell costs using their source rules.';
    this.trapSave.textContent=view.self.role==='dm'?'Place trigger':'Submit trigger';this.trapDialog.showModal();
  }
  mountDuration(){const {node,body}=dialog('Condition duration','condition-duration-dialog');this.durationDialog=node;const form=el('form');this.durationTitle=el('p');form.append(this.durationTitle);
    this.durationTurns=field(form,'Turns remaining (blank = no timer)','duration-turns',{type:'number',min:1,max:1000});this.durationTiming=select(form,'Tick at','duration-timing',[['turn-end','End of the anchor’s turn'],['turn-start','Start of the anchor’s turn']]);this.durationAnchor=select(form,'Whose turn advances this duration?','duration-anchor',[]);
    form.append(el('p','field-note','The timer ends this entire condition, including its current stacks. Other ending rules still apply.'));const save=el('button','button primary','Save duration');save.type='submit';form.append(save);body.append(form);
    form.onsubmit=async event=>{event.preventDefault();if(await this.send({type:'condition.duration',id:this.durationToken,conditionId:this.durationCondition,turns:this.durationTurns.value?Number(this.durationTurns.value):null,timing:this.durationTiming.value,anchorId:this.durationAnchor.value}))node.close();};
  }
  openDuration(id,conditionId){const token=this.getView().scene.tokens.find(token=>token.id===id);if(!token || !(token.canEditStats || this.getView().self.role==='dm'))return;
    this.durationToken=id;this.durationCondition=conditionId;this.durationTitle.textContent=token.name+' · '+(token.conditions.find(row=>row.id===conditionId)?.name || conditionId);
    const timer=token.conditionTimers?.[conditionId];this.durationTurns.value=timer?.remaining || '';this.durationTiming.value=timer?.timing || 'turn-end';this.durationAnchor.replaceChildren(...this.getView().scene.tokens.map(t=>new Option(t.name,t.id)));this.durationAnchor.value=timer?.anchorId || id;this.durationDialog.showModal();
  }
  mountScene(){const host=$('show-grid').closest('details'),section=el('section','encounter-settings');section.setAttribute('data-dm','');section.append(el('h3','','Events & triggered areas'));
    this.enable=check(section,'Enable encounter triggers and turn effects','enable-events',true);this.printed=check(section,'Automate printed turn-based conditions','automate-conditions',true);
    this.metric=select(section,'Movement distance','movement-metric',[['straight','Straight-line distance'],['grid','Grid: diagonals cost one square']]);
    for(const input of [this.enable,this.printed,this.metric])input.onchange=()=>this.send({type:'scene.adventure',enabled:this.enable.checked,autoConditions:this.printed.checked,metric:this.metric.value});
    section.append(button('Automatic effect builder',()=>this.openEffects()),el('p','field-note','Draw a spell area and choose Make trigger to place a trap, persistent spell or other triggered zone.'));section.append(this.trapRows);host.append(section);
    const rules=el('section','settings-block movement-rules');rules.id='movement-rules';rules.setAttribute('data-dm','');rules.append(el('h3','','Movement rules'));
    this.turnOnly=check(rules,'Only move on your token’s initiative turn','movement-own-turn-only');
    this.distanceLimit=check(rules,'Enforce movement distance during initiative','movement-limit-distance',true);
    rules.append(el('p','field-note','These rules are independent. The GM can move tokens outside their turns and use GM reposition for forced movement or other exceptions. Exploration is unrestricted by initiative.'));
    for(const input of [this.turnOnly,this.distanceLimit])input.onchange=()=>this.send({type:'scene.adventure',ownTurnOnly:this.turnOnly.checked,limitDistance:this.distanceLimit.checked});
    $('settings-dialog').querySelector('.dialog-body').prepend(rules);
    section.append(button('Movement rules',()=>{$('game-settings').click();rules.scrollIntoView({block:'nearest'});}));
  }
  renderEvents(){const view=this.getView(),pending=(view.scene.events || []).filter(event=>event.status==='pending'),signature=JSON.stringify([pending,view.self.id,this.connected]);
    if(signature===this.eventsSignature)return;this.eventsSignature=signature;
    this.eventsHint.textContent=pending.length?pending.length+' events waiting for resolution.':'No events are waiting. Automatic effects also report to Dice & messages.';
    this.eventsList.replaceChildren(...pending.map(event=>{
      const token=view.scene.tokens.find(token=>token.id===event.tokenId),row=el('article','encounter-event');row.dataset.eventId=event.id;
      row.append(el('h4','',event.label),el('p','',token?.name || 'Encounter'),button('View token',()=>{if(token){this.selectToken(token.id);this.board.center(token);}}));
      if(['condition','remove-condition'].includes(event.action?.type))row.append(el('p','event-effect',(event.save?'On a failed save: ':event.action.type==='remove-condition'?'Ends: ':'Applies: ')+event.action.condition.name+(event.action.condition.stacks>1?' ×'+event.action.condition.stacks:'')+(event.action.turns?' · '+event.action.turns+' turns':'')));
      const gm=view.self.role==='dm',owner=token?.ownerId===view.self.id,actions=el('div','button-row');
      const send=(resolution,extra={})=>this.send({type:'event.resolve',id:event.id,resolution,...extra});
      if(event.kind==='approval'){if(gm)actions.append(button('Approve trigger',()=>send('apply')),button('Decline',()=>send('dismiss')));else row.append(el('p','field-note','Waiting for GM approval.'));}
      else if(gm || owner && event.save){
        let continuation=null;if(token?.pendingMove)continuation=check(row,'Continue the remaining route after resolution','continue-'+event.id,token.pendingMove.resume!==false);
        const extras=()=>({continue:continuation?.checked!==false});
        if(event.save){row.append(el('p','event-save-label',event.save.ability.toUpperCase()+' save · DC '+event.save.dc));
          const total=field(row,'Physical saving throw total','save-total-'+event.id,{type:'number',min:-9999,max:9999});
          actions.append(button('Roll saving throw',()=>send('roll',extras())),button('Use physical roll',()=>{if(total.value!=='' && total.reportValidity())send('manual',{...extras(),total:Number(total.value)});}));
          if(gm)actions.append(button('Mark success',()=>send('success',extras())),button('Mark failure',()=>send('failure',extras())));
        }else {let value=null;if(event.kind==='ruling')value=field(row,'Damage after the rule decision','ruling-amount-'+event.id,{type:'number',min:0,max:999999,value:0});
          actions.append(button('Resolve effect',()=>send('apply',{...extras(),...(value?{amount:Number(value.value)}:{})})));}
        if(gm)actions.append(button('Dismiss event',()=>send('dismiss',extras()),'text-button danger'));
      }else row.append(el('p','field-note','Waiting for the GM or affected player.'));
      row.append(actions);return row;
    }));
    const tab=$('campaign-tab-events');if(tab)tab.textContent='Events'+(pending.length?' · '+pending.length:'');
    const blocking=pending.filter(event=>event.blockMovement && (view.self.role==='dm' || view.scene.tokens.some(t=>t.id===event.tokenId && t.ownerId===view.self.id))),ids=new Set(blocking.map(event=>event.id));
    if(this.previousPending && blocking.some(event=>!this.previousPending.has(event.id)))this.showEvents();this.previousPending=ids;
  }
  render(connected){this.connected=connected;const view=this.getView();if(!view)return;
    const identity=view.id+'|'+view.self.id;if(identity!==this.identity){this.identity=identity;this.force.checked=false;this.board.forceMovement=false;this.previousPending=null;}
    const token=this.token(),gm=view.self.role==='dm';this.travel.hidden=!token;
    if(token){const state=token.travelState || {},edit=token.canEditStats || gm,turnLocked=!gm && state.turnLocked,distanceLimited=view.scene.combat.active && view.scene.adventure?.limitDistance!==false;
      this.travelSummary.textContent=' · '+travelLabel(token)+(state.remaining!==null && state.remaining!==undefined?' · '+feet(distanceLimited?state.remaining:state.spent)+(distanceLimited?' left':' moved'):'')+(state.paused?' · Paused':turnLocked?' · Waiting for turn':'');
      if(document.activeElement!==this.mode)this.mode.value=token.mobility?.mode || 'walk';if(document.activeElement!==this.height)this.height.value=token.mobility?.z || 0;
      const speeds={...token.movementProfile?.speeds,...token.movementOverrides?.speeds};for(const option of this.mode.options)option.disabled=!gm && ['fly','hover','burrow'].includes(option.value) && !(speeds[option.value==='hover'?'fly':option.value]>0 && (option.value!=='hover' || (token.movementOverrides?.hover ?? token.movementProfile?.hover)));
      this.travelApply.disabled=!connected || !edit || state.paused || turnLocked;this.mode.disabled=this.height.disabled=!edit || turnLocked;
      this.movementReading.textContent=state.capacity==null?'Movement speed not shared or not set.':view.scene.combat.active && !distanceLimited?feet(state.spent)+' moved · distance limit disabled':feet(state.spent)+' used / '+feet(state.capacity)+' available · '+feet(state.remaining)+' remaining';
      this.travelNote.textContent=state.paused?'Movement is paused until the event is resolved.':turnLocked?'Waiting for this token’s initiative turn. The GM can move it for an exception.':!view.scene.combat.active?'Exploration: movement is counted; initiative rules do not apply.':!distanceLimited?'Movement distance is counted without imposing a cap.':state.multiplier===2?'This movement costs 2 feet per foot because no dedicated speed is granted.':'Vertical movement uses the same movement allowance.';
      this.dash.disabled=!connected || !edit || !!token.mobility?.dashed || state.paused || turnLocked;this.resetMovement.disabled=!connected || !edit || !gm && view.scene.combat.active;this.grants.hidden=!token.canEditStats;this.force.closest('label').hidden=!gm;
      this.extraRow.hidden=!gm;if(document.activeElement!==this.extra)this.extra.value=token.mobility?.extra || 0;
    }
    this.enable.checked=view.scene.adventure?.enabled!==false;this.printed.checked=view.scene.adventure?.autoConditions!==false;this.metric.value=view.scene.adventure?.metric || 'straight';
    this.turnOnly.checked=view.scene.adventure?.ownTurnOnly===true;this.distanceLimit.checked=view.scene.adventure?.limitDistance!==false;
    this.renderEvents();if(this.effectsDialog.open)this.renderEffects();
    const trapSignature=JSON.stringify([view.scene.traps,view.self.id,connected]);if(trapSignature!==this.trapSignature){this.trapSignature=trapSignature;this.trapRows.replaceChildren(...(view.scene.traps || []).map(trap=>{
      const row=el('article','automatic-effect-row');row.append(el('strong','',trap.name),el('p','',trap.pending?'Pending approval':trap.armed?'Armed':'Disarmed'));
      if(gm || trap.ownerId===view.self.id)row.append(button('Edit',()=>this.openTrap(trap.id)),button('Remove',()=>this.send({type:'trap.remove',id:trap.id}),'text-button danger'));
      if(gm)row.append(button(trap.armed?'Disarm':'Arm',()=>this.send({type:'trap.arm',id:trap.id,armed:!trap.armed})));return row;
    }));}
  }
}
function toolsDock(tools){return tools.conditionTray.parentElement;}
