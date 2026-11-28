import Conditions from '../../web/character-conditions.js';
import {snapToken} from '../web/grid.mjs';
import {routePoint,routeDistance,routeCells,trapInterval} from './route-geometry.mjs';

export const TRAVEL_MODES=['walk','fly','hover','swim','climb','burrow'];
export const TRAVEL_NAMES={walk:'Walking',fly:'Flying',hover:'Hovering',swim:'Swimming',climb:'Climbing',burrow:'Burrowing'};
const ABILITIES=['str','dex','con','int','wis','cha'],PHASES=['turn-start','turn-end','round-start','move','damage','heal','hp-zero','condition-added','condition-removed'];
const DAMAGE_TYPES=['bludgeoning','piercing','slashing','fire','cold','acid','lightning','sonic','poison','necrotic','radiant','psychic','force','bleeding'];
const EFFECT_RESOURCES=['tempHP','arcaneHealth','block','tempBlock','custom1','custom2'];
export function movementStatus(token,scene,mode=token.mobility?.mode || 'walk'){
  const profile=token.movementProfile || {},speeds={...profile.speeds,...token.movementOverrides?.speeds};
  let base=mode==='walk'?(speeds.walk ?? token.speed):(mode==='hover'?speeds.fly:speeds[mode]);
  let multiplier=1;
  if(['swim','climb'].includes(mode) && !(base>0)){base=speeds.walk ?? token.speed;multiplier=2;}
  const hover=token.movementOverrides?.hover ?? profile.hover ?? false;
  const capable=['walk','swim','climb'].includes(mode) || (mode==='hover'?hover && speeds.fly>0:base>0);
  const condition=Conditions.status(token.conditions,{speed:base ?? null,abilities:token.statblock?.abilities,size:token.sizeCategory});
  const spent=token.mobility?.spent || 0,extra=token.mobility?.extra || 0,capacity=condition.speed===null?null:Math.min(999999,condition.speed*(token.mobility?.dashed?2:1)+extra);
  const pending=!!token.pendingMove || (scene.events || []).some(event=>event.status==='pending' && event.tokenId===token.id && event.blockMovement);
  const activeId=scene.combat?.activeId ?? scene.combat?.order?.[scene.combat.index ?? 0],turnLocked=!!scene.combat?.active && scene.adventure?.ownTurnOnly===true && activeId!==token.id;
  return {...condition,mode,z:token.mobility?.z || 0,capable,multiplier,spent,capacity,turnLocked,
    remaining:capacity===null?null:Math.max(0,capacity-spent),paused:pending,blocked:condition.blocked || !capable || pending,
    reason:pending?'Resolve the pending event first':!capable?'No '+mode+' speed is granted':condition.reason};
}

export function createAdventure(api){
  const {RoomError,numeric:n,whole:w,label,flag,uid,addLog,canEditStats,tokenById,roll,damagePlan}=api;
  const fail=(message,status=400)=>{throw new RoomError(message,status);};
  const obj=(value,name)=>{if(!value || typeof value!=='object' || Array.isArray(value))fail(name+' must be an object.');return value;};
  const text=(value,max=600)=>label(value,'',max);
  const modes=value=>{if(!Array.isArray(value) || !value.length || value.some(mode=>!TRAVEL_MODES.includes(mode)))fail('Choose the affected travel modes.');return [...new Set(value)];};
  const amount=value=>{if(typeof value==='number')return w(value,0,999999,'Amount');if(typeof value!=='string' || !/^(?:\d{1,6}|(?:[1-9]\d?|100)d(?:2|3|4|6|8|10|12|20|100)(?:[+-]\d{1,4})?)$/.test(value.replace(/\s/g,'')))fail('Use a nonnegative amount or dice such as 2d6+3.');return value.replace(/\s/g,'');};
  const rollAmount=value=>typeof value==='number'?{total:value,formula:String(value),rolls:[],modifier:0}:/^\d+$/.test(value)?{total:Number(value),formula:value,rolls:[],modifier:0}:roll(value,100);
  const privateLog=(room,token,message)=>addLog(room,{kind:'event',tokenId:token.id,privateTo:token.ownerId || 'dm',text:message});
  const publicLog=(room,token,message,eventId)=>addLog(room,{kind:'event',tokenId:token?.id,text:message,...(eventId?{eventId}:{})});
  function profileFrom(raw={}){
    obj(raw,'Movement profile');const speeds={};
    if(raw.speeds!==undefined)obj(raw.speeds,'Movement speeds');if(raw.traits!==undefined)obj(raw.traits,'Movement rule details');
    for(const mode of ['walk','fly','swim','climb','burrow'])if(raw.speeds?.[mode]!==undefined)speeds[mode]=raw.speeds[mode]===null?null:n(raw.speeds[mode],0,999999,mode+' speed');
    if(raw.sources!==undefined && (!Array.isArray(raw.sources) || raw.sources.length>48))fail('Use up to 48 effect sources.');
    const sources=(raw.sources || []).map(source=>{obj(source,'Effect source');return {id:text(source.id,160),name:label(source.name,'Custom source',100),kind:['spell','item','feature'].includes(source.kind)?source.kind:'feature'};});
    const input=raw.traits || {},traits={saveBonuses:{},saveProficiencies:{},reductions:{},resistances:[],immunities:[],creatureType:text(input.creatureType,80)};
    for(const key of ABILITIES)if(input.saveBonuses?.[key]!==undefined)traits.saveBonuses[key]=n(input.saveBonuses[key],-999,999,'Saving throw bonus');
    for(const key of ABILITIES)if(input.saveProficiencies?.[key]!==undefined)traits.saveProficiencies[key]=n(input.saveProficiencies[key],0,999,'Save proficiency');
    for(const key of [...DAMAGE_TYPES,'physical','all'])if(input.reductions?.[key]!==undefined)traits.reductions[key]=n(input.reductions[key],0,999999,'Damage reduction');
    for(const key of ['resistances','immunities']){if(input[key]!==undefined && !Array.isArray(input[key]))fail('Defenses must be lists.');traits[key]=[...new Set((input[key] || []).filter(type=>[...DAMAGE_TYPES,'physical','all'].includes(type)))];}
    return {speeds,hover:raw.hover==null?null:flag(raw.hover),sources,traits};
  }
  function tokenFields(raw){
    const m=raw.mobility || {},timers={};obj(m,'Travel state');
    if(m.mode!==undefined && !TRAVEL_MODES.includes(m.mode))fail('Choose a travel mode.');
    for(const [id,row] of Object.entries(obj(raw.conditionTimers || {},'Condition timers'))){
      if(!(raw.conditions || []).some(condition=>(typeof condition==='string'?Conditions.lookup(condition)?.id:condition.id)===id))continue;
      if(Object.keys(timers).length>=64)fail('Too many condition timers.');
      obj(row,'Condition timer');timers[id]={remaining:w(row.remaining,1,1000,'Turns remaining'),timing:row.timing==='turn-start'?'turn-start':'turn-end',anchorId:text(row.anchorId || raw.id,80)};
    }
    const pending=raw.pendingMove;
    if(pending){obj(pending,'Pending route');if(pending.ignored!==undefined && !Array.isArray(pending.ignored))fail('Ignored triggers must be a list.');}
    const point=p=>{obj(p,'Route point');return {x:n(p.x,0,4096,'Route X'),y:n(p.y,0,4096,'Route Y'),z:n(p.z ?? 0,-5000,5000,'Route height')};};
    return {positionFree:raw.positionFree===true,resourceRevision:w(raw.resourceRevision ?? 0,0,999999999,'Resource revision'),
      mobility:{mode:m.mode || 'walk',z:n(m.z ?? 0,-5000,5000,'Height'),spent:n(m.spent ?? 0,0,999999,'Movement spent'),extra:n(m.extra ?? 0,0,999999,'Extra movement'),dashed:m.dashed===true},
      movementProfile:profileFrom(raw.movementProfile || {}),movementOverrides:profileFrom(raw.movementOverrides || {}),conditionTimers:timers,
      mobilityGrantTimer:raw.mobilityGrantTimer?{remaining:w(raw.mobilityGrantTimer.remaining,1,1000,'Grant duration'),anchorId:text(raw.mobilityGrantTimer.anchorId || raw.id,80)}:null,
      pendingMove:pending?{eventId:text(pending.eventId,80),destination:point(pending.destination),mode:TRAVEL_MODES.includes(pending.mode)?pending.mode:'walk',ignored:(pending.ignored || []).slice(0,32).map(id=>text(id,80)),resume:pending.resume!==false}:null,
      motion:raw.motion?{id:text(raw.motion.id,80),from:point(raw.motion.from),to:point(raw.motion.to),cost:n(raw.motion.cost ?? 0,0,999999,'Move cost'),duration:n(raw.motion.duration ?? 300,0,1500,'Animation duration')}:null};
  }
  function actionFrom(raw={}){
    obj(raw,'Effect');const type=raw.type || 'message';if(!['message','damage','heal','resource','condition','remove-condition'].includes(type))fail('Choose an effect action.');
    if(type==='resource' && (!EFFECT_RESOURCES.includes(raw.resource) || !['add','set','subtract'].includes(raw.operation || 'add')))fail('Choose a resource and how it changes.');
    let condition=null;if(['condition','remove-condition'].includes(type)){
      try{condition=Conditions.normalize([raw.condition],{strict:true})[0];}catch(error){fail(error.message);}if(!condition)fail('Choose a condition.');
    }
    const save=raw.save;if(save && (!ABILITIES.includes(save.ability)))fail('Choose a saving throw ability.');
    return {type,amount:amount(raw.amount ?? 0),damageType:DAMAGE_TYPES.includes(raw.damageType)?raw.damageType:'',condition,resource:type==='resource'?raw.resource:null,operation:raw.operation || 'add',
      turns:raw.turns==null?null:w(raw.turns,1,1000,'Condition duration'),text:text(raw.text),
      save:save?{ability:save.ability,dc:w(save.dc,1,99,'Save DC'),half:save.half===true}:null};
  }
  function trapFrom(raw,scene,ownerId){
    obj(raw,'Triggered area');
    const shape=api.templateFrom(raw,scene,ownerId),triggers=raw.triggers || ['enter'];
    if(!Array.isArray(triggers) || !triggers.length || triggers.some(t=>!['enter','turn-start','turn-end'].includes(t)))fail('Choose a trap trigger.');
    const minHeight=n(raw.minHeight ?? 0,-5000,5000,'Minimum trigger height'),maxHeight=n(raw.maxHeight ?? 5,-5000,5000,'Maximum trigger height');if(minHeight>maxHeight)fail('Minimum height must not exceed maximum height.');
    return {...shape,id:typeof raw.id==='string' && /^[a-z0-9-]{6,80}$/i.test(raw.id)?raw.id:shape.id,name:label(raw.name,'Triggered area',80),ownerId,tokenId:text(raw.tokenId,80),sourceId:text(raw.sourceId,160),sourceName:text(raw.sourceName,100),
      modes:modes(raw.modes || ['walk','swim','climb']),triggers:[...new Set(triggers)],minHeight,maxHeight,
      touchFootprint:raw.touchFootprint===undefined?true:flag(raw.touchFootprint),once:raw.once===undefined?true:flag(raw.once),
      hidden:raw.hidden===undefined?true:flag(raw.hidden),revealOnTrigger:raw.revealOnTrigger===undefined?true:flag(raw.revealOnTrigger),
      armed:raw.armed===undefined?true:flag(raw.armed),pending:raw.pending===true,ignoreOwner:raw.ignoreOwner===true,action:actionFrom(raw.action)};
  }
  function effectFrom(raw,ownerId){
    obj(raw,'Automatic effect');
    if(!PHASES.includes(raw.trigger))fail('Choose an event trigger.');
    return {id:typeof raw.id==='string'?text(raw.id,80):uid(),ownerId,tokenId:text(raw.tokenId,80),name:label(raw.name,'Automatic effect',80),sourceName:text(raw.sourceName,100),trigger:raw.trigger,
      enabled:raw.enabled!==false,conditionId:text(raw.conditionId,80),uses:raw.uses==null?null:w(raw.uses,1,1000,'Applications remaining'),action:actionFrom(raw.action)};
  }
  function sceneDefaults(scene){
    scene.traps ??= [];scene.effects ??= [];scene.events ??= [];scene.pings ??= [];scene.adventure ??= {enabled:true,autoConditions:true,metric:'straight'};
    scene.adventure.ownTurnOnly ??= false;scene.adventure.limitDistance ??= true;
    scene.combat.turnSerial ??= 0;scene.combat.phase ??= 'active';
    return scene;
  }
  const mayEdit=(token,actor)=>actor.role==='dm' || canEditStats(token,actor);
  const checkEdit=(token,actor)=>{if(!mayEdit(token,actor))fail('Control this token to change its effects.',403);};
  function event(room,input){
    if(room.scene.events.filter(e=>e.status==='pending').length>=256)fail('Resolve some pending events before adding more.',409);
    const record={id:uid(),at:new Date().toISOString(),status:'pending',blockMovement:true,...input};room.scene.events.push(record);
    room.scene.events=room.scene.events.filter(e=>e.status==='pending').concat(room.scene.events.filter(e=>e.status!=='pending').slice(-40));
    publicLog(room,room.scene.tokens.find(t=>t.id===record.tokenId),record.publicText || 'An event needs resolution.',record.id);return record;
  }
  function changeCondition(room,token,condition,remove=false,one=false,context){
    const rows=token.conditions || [],index=rows.findIndex(row=>row.id===condition.id),before=index>=0?rows[index]:null;
    if(remove){if(!before)return;if(one && before.stacks>1)before.stacks--;else rows.splice(index,1);}
    else {if(['charmed','hypnotized','enraged'].includes(condition.id) && Conditions.has(rows,'clarity'))return;
      if(before)before.stacks=Math.min(Conditions.lookup(condition.id)?.maxStacks || 99,before.stacks+condition.stacks);else rows.push({...condition});}
    token.conditions=Conditions.normalize(rows);token.conditionsRevision++;
    if(!remove && !before && condition.id==='melting' && room.scene.adventure.autoConditions)token.conditionTimers.melting={remaining:1,timing:'turn-start',anchorId:token.id};
    api.orderCombat(room.scene);
    if(!token.conditions.some(row=>row.id===condition.id))delete token.conditionTimers[condition.id];
    publicLog(room,token,token.name+': '+condition.name+(remove?' ended.':' applied.'));
    hooks(room,remove?'condition-removed':'condition-added',token,{conditionId:condition.id},context);
  }
  function adjustHealth(room,token,input,healing=false,source='Effect',context){
    let value=Math.max(0,Math.floor(input.amount)),before=token.hp;const type=input.damageType || '',traits=token.movementProfile.traits;
    const originalPools=[token.hp,token.resources.tempHP.current,token.resources.arcaneHealth.current];
    if(healing){if(Conditions.has(token.conditions,'diseased'))value=Math.floor(value/2);value=Math.min(value,token.maxHp-token.hp);token.hp+=value;}
    else {
      const physical=['bludgeoning','piercing','slashing'].includes(type);
      if(type){value=Math.max(0,value-Math.max(traits.reductions.all || 0,traits.reductions[type] || 0,physical?traits.reductions.physical || 0:0));
        if(traits.immunities.includes(type) || traits.immunities.includes('all') || physical && (traits.immunities.includes('physical') || Conditions.has(token.conditions,'ethereal')))value=0;}
      const resisted=!!type && (traits.resistances.includes(type) || traits.resistances.includes('all') || physical && traits.resistances.includes('physical') || type==='fire' && value<=10 && Conditions.has(token.conditions,'soaked'));
      if(input.half)value=Math.floor(value/2);
      if(resisted)value=Math.floor(value/2);
      const plan=damagePlan(token,value);for(const pool of plan.pools)if(pool.key==='hp')token.hp=pool.after;else token.resources[pool.key].current=pool.after;
    }
    if(originalPools.some((value,index)=>value!==[token.hp,token.resources.tempHP.current,token.resources.arcaneHealth.current][index]))token.resourceRevision++;
    privateLog(room,token,token.name+': '+source+' '+(healing?'heals ':'deals ')+value+(type?' '+type:'')+'. HP '+token.hp+' / '+token.maxHp+'.');
    publicLog(room,token,source+' resolved for '+token.name+'.');
    if(value>0){hooks(room,healing?'heal':'damage',token,{amount:value,damageType:type},context);
      if(!healing)for(const id of ['exposed','tricked','hypnotized','fascinated']){const row=token.conditions.find(r=>r.id===id);if(row)changeCondition(room,token,row,true,false,context);}}
    if(before>0 && token.hp===0)hooks(room,'hp-zero',token,{},context);
  }
  function runAction(room,token,action,source,context,success){
    if(action.save && success===undefined){event(room,{kind:'effect-save',tokenId:token.id,label:source,sourceName:source,action:structuredClone(action),save:action.save,chain:[...(context?.seen || [])],publicText:source+' requires a saving throw for '+token.name+'.'});return;}
    if(action.type==='message'){publicLog(room,token,action.text || source);return;}
    if(success && !(action.type==='damage' && action.save?.half))return;
    if(action.type==='resource'){
      const pool=token.resources[action.resource],value=Math.max(0,rollAmount(action.amount).total),before=pool.current;
      let next=action.operation==='set'?value:action.operation==='subtract'?before-value:before+value;
      if(['tempHP','arcaneHealth','tempBlock'].includes(action.resource) && pool.max!==null)pool.max=Math.max(pool.max,Math.min(999999,next));
      pool.current=Math.max(0,Math.min(pool.max ?? 999999,next));if(before!==pool.current)token.resourceRevision++;
      privateLog(room,token,source+': '+action.resource+' '+before+' → '+pool.current+'.');publicLog(room,token,source+' resolved for '+token.name+'.');return;
    }
    if(action.type==='damage' || action.type==='heal'){
      const result=rollAmount(action.amount),rolled=result.total*(action.multiplier || 1),value=Math.max(0,rolled);
      privateLog(room,token,source+': '+result.formula+(result.rolls.length?' ['+result.rolls.join(', ')+']':'')+' = '+result.total+'.');
      adjustHealth(room,token,{amount:value,damageType:action.damageType,half:success===true},action.type==='heal',source,context);
    }else {
      changeCondition(room,token,action.condition,action.type==='remove-condition',false,context);
      if(action.type==='condition' && action.turns)token.conditionTimers[action.condition.id]={remaining:action.turns,timing:'turn-end',anchorId:token.id};
    }
  }
  function hooks(room,trigger,token,details={},context={seen:new Set()}){
    if(!room.scene.adventure.enabled)return;
    context ??= {seen:new Set()};
    for(const effect of [...room.scene.effects]){
      if(!effect.enabled || effect.tokenId!==token.id || effect.trigger!==trigger || effect.conditionId && effect.conditionId!==details.conditionId || context.seen.has(effect.id))continue;
      context.seen.add(effect.id);runAction(room,token,effect.action,effect.name,context);
      if(effect.uses!==null){effect.uses--;if(effect.uses<=0){room.scene.effects=room.scene.effects.filter(e=>e.id!==effect.id);publicLog(room,token,effect.name+' expired.');}}
    }
  }
  function trapMatches(trap,token,mode){return trap.armed && !trap.pending && trap.modes.includes(mode) && !(trap.ignoreOwner && trap.tokenId===token.id);}
  function triggerTrap(room,trap,token,destination,mode,ignored,resume=true){
    if(trap.once)trap.armed=false;if(trap.revealOnTrigger)trap.hidden=false;
    const e=event(room,{kind:'trap',tokenId:token.id,trapId:trap.id,label:trap.hidden?'Triggered hazard':trap.name,action:structuredClone(trap.action),sourceName:trap.hidden?'Triggered hazard':trap.name,save:trap.action.save,
      publicText:token.name+' triggered '+(trap.hidden?'a hidden hazard':trap.name)+'. Movement paused.'});
    token.pendingMove={eventId:e.id,destination,mode,ignored:[...new Set([...ignored,trap.id])],resume};return e;
  }
  function move(room,actor,command,continuing=false){
    const scene=room.scene,token=tokenById(room,command.id);if(actor.role!=='dm' && token.ownerId!==actor.id)fail('You can only move your own tokens.',403);
    if(token.pendingMove && !continuing && !(actor.role==='dm' && command.force===true))fail('Resolve the pending event before moving again.',409);
    const mode=command.mode || token.mobility.mode;if(!TRAVEL_MODES.includes(mode))fail('Choose a travel mode.');
    const z=n(command.z ?? (mode==='walk'?0:token.mobility.z),-5000,5000,'Height');
    if(mode==='walk' && Math.abs(z)>1e-8)fail('Walking is at ground level. Choose another travel mode.');
    if(['fly','hover'].includes(mode) && z<0)fail('Use a nonnegative flying height.');if(mode==='burrow' && z>0)fail('Burrowing depth must be zero or below.');
    const force=command.force===true;if(force && actor.role!=='dm')fail('Only the GM can reposition without triggers.',403);
    if(!force && mode==='burrow' && token.mobility.z>0)fail('Land at ground level before burrowing.');
    if(!force && ['fly','hover'].includes(mode) && token.mobility.z<0)fail('Return to ground level before taking flight.');
    const pathMode=mode==='walk' && token.mobility.z!==0?token.mobility.mode:mode,status=movementStatus(token,scene,pathMode);
    if(actor.role!=='dm' && status.turnLocked)fail('Movement is limited to this token’s initiative turn. The GM can move it for an exception.',403);
    if(status.paused && !force && !continuing)fail('Cannot move: '+status.reason+'.',409);
    if(actor.role!=='dm' && (status.blocked && !continuing || !status.capable))fail('Cannot move: '+status.reason+'.',403);
    const target={x:n(command.x,0,scene.width-1,'Token X'),y:n(command.y,0,scene.height-1,'Token Y')},sameXY=target.x===token.x && target.y===token.y;
    const destination={...(sameXY?target:snapToken(scene,token,target)),z};
    const from={x:token.x,y:token.y,z:token.mobility.z};
    if(actor.role!=='dm' && (token.hidden || scene.fog.enabled && routeCells(from,destination,scene).some(cell=>!scene.fog.revealed.includes(cell))))fail('Keep the whole route within the revealed map.',403);
    const distance=routeDistance(from,destination,scene,scene.adventure.metric),cost=distance*status.multiplier;
    let fraction=scene.adventure.limitDistance && scene.combat.active && !force && status.remaining!==null && cost>0?Math.min(1,status.remaining/cost):1;
    if(fraction<=1e-8 && cost>0 && !force)fail('No movement remains for this turn.',409);
    let hit=null;const ignored=[...(command.ignored || [])];
    if(scene.adventure.enabled && !force)for(const trap of scene.traps){
      if(!trapMatches(trap,token,pathMode) || !trap.triggers.includes('enter') || ignored.includes(trap.id))continue;
      const interval=trapInterval(trap,from,destination,scene,token),inside=trapInterval(trap,from,from,scene,token);
      if(!interval)continue;if(inside && !continuing){ignored.push(trap.id);continue;}
      if(interval[0]<=fraction+1e-8 && (!hit || interval[0]<hit.at)){hit={trap,at:interval[0]};}
    }
    if(hit)fraction=Math.max(0,hit.at);const to=routePoint(from,destination,fraction);
    token.x=to.x;token.y=to.y;token.mobility.z=to.z;token.mobility.mode=pathMode;
    const keepFree=token.positionFree && sameXY;
    token.positionFree=fraction<1 || keepFree;token.mobility.spent=Math.min(999999,token.mobility.spent+(force?0:cost*fraction));token.pendingMove=null;
    token.motion={id:uid(),from,to,cost:force?0:Math.min(999999,cost*fraction),duration:force?0:Math.min(1200,Math.max(150,distance*fraction*22))};
    if(!force && distance*fraction>1e-8){hooks(room,'move',token,{distance:distance*fraction});for(const id of ['exposed','tricked']){const row=token.conditions.find(r=>r.id===id);if(row)changeCondition(room,token,row,true);}}
    if(hit)triggerTrap(room,hit.trap,token,destination,mode,ignored);
    else if(fraction>=1){token.mobility.mode=mode;token.positionFree=keepFree;
      if(pathMode!==mode && !force && scene.adventure.enabled)for(const trap of scene.traps)if(trapMatches(trap,token,mode) && trap.triggers.includes('enter') && !ignored.includes(trap.id) && trapInterval(trap,to,to,scene,token)){triggerTrap(room,trap,token,destination,mode,ignored);break;}}
    if(force)publicLog(room,token,'The GM repositioned '+token.name+'.');
  }
  function pendingFor(room,id){return room.scene.events.some(e=>e.status==='pending' && e.tokenId===id && e.blockMovement);}
  function turnPhase(room,token,phase){
    if(!room.scene.adventure.enabled)return;
    const context={seen:new Set()},rows=[...token.conditions],timers=room.scene.tokens.flatMap(target=>Object.entries(target.conditionTimers).map(([id,timer])=>({target,id,timer})));
    if(room.scene.adventure.autoConditions)for(const row of rows){
      if(phase==='turn-end' && row.id==='bleeding')runAction(room,token,{type:'damage',amount:row.stacks+'d'+(/^(Tiny|Small)$/.test(token.sizeCategory)?4:/^(Large|Huge|Gargantuan|Colossal)$/.test(token.sizeCategory)?8:6),damageType:'bleeding'},'Bleeding',context);
      if(phase==='turn-start' && row.id==='acid-exposure'){runAction(room,token,{type:'damage',amount:row.stacks+'d6',damageType:'acid'},'Acid exposure',context);changeCondition(room,token,row,true,true,context);}
      if(phase==='turn-start' && row.id==='melting'){
        const creatureType=token.movementProfile.traits.creatureType;
        if(creatureType)runAction(room,token,{type:'damage',amount:'1d10',multiplier:/construct/i.test(creatureType)?2:1,damageType:'acid'},'Melting',context);
        else event(room,{kind:'ruling',tokenId:token.id,label:'Melting: confirm construct damage',publicText:'Resolve Melting for '+token.name+' (1d10 acid; double for constructs).',action:{type:'damage',amount:0,damageType:'acid'}});
      }
      if(phase==='turn-start' && row.id==='on-fire-burning'){
        const sides={Tiny:4,Small:4,Medium:6,Large:8}[token.sizeCategory];
        if(sides)runAction(room,token,{type:'damage',amount:'1d'+sides,damageType:'fire'},'Burning',context);
        else event(room,{kind:'ruling',tokenId:token.id,label:'Burning size requires a ruling',publicText:'Resolve burning for '+token.name+'.',action:{type:'damage',amount:0,damageType:'fire'}});
      }
    }
    hooks(room,phase,token,{},context);
    for(const {target,id,timer} of timers)if(target.conditionTimers[id]===timer && timer.anchorId===token.id && timer.timing===phase){
      timer.remaining--;if(timer.remaining<=0){const row=target.conditions.find(r=>r.id===id);if(row)changeCondition(room,target,row,true,false,context);delete target.conditionTimers[id];}
    }
    if(phase==='turn-end')for(const target of room.scene.tokens)if(target.mobilityGrantTimer?.anchorId===token.id){
      target.mobilityGrantTimer.remaining--;if(target.mobilityGrantTimer.remaining<=0){target.mobilityGrantTimer=null;target.movementOverrides=profileFrom({});privateLog(room,target,'Temporary movement grants expired.');
        if(['fly','hover','burrow'].includes(target.mobility.mode) && !movementStatus(target,room.scene).capable)event(room,{kind:'movement-review',tokenId:target.id,label:'Movement grant expired',publicText:target.name+' needs a movement ruling after its temporary speed expired.'});}
    }
    if(phase==='turn-start' && room.scene.adventure.autoConditions && Conditions.has(token.conditions,'bleeding')){
      event(room,{kind:'condition-save',tokenId:token.id,label:'Bleeding: Constitution save',save:{ability:'con',dc:15,half:false},removeOnSuccess:'bleeding',publicText:token.name+' can make the Bleeding save (DC 15 Constitution).'});
    }
    for(const trap of room.scene.traps)if(trapMatches(trap,token,token.mobility.mode) && trap.triggers.includes(phase) && trapInterval(trap,{...token,z:token.mobility.z},{...token,z:token.mobility.z},room.scene,token))triggerTrap(room,trap,token,{x:token.x,y:token.y,z:token.mobility.z},token.mobility.mode,[],false);
  }
  function startTurn(room){const scene=room.scene,id=scene.combat.order[scene.combat.index],token=scene.tokens.find(t=>t.id===id);if(!token)return;
    token.mobility.spent=0;token.mobility.extra=0;token.mobility.dashed=false;scene.combat.turnSerial++;scene.combat.phase='active';
    publicLog(room,token,token.name+' starts its turn (round '+scene.combat.round+').');turnPhase(room,token,'turn-start');}
  function nextTurn(room){const scene=room.scene,current=scene.tokens.find(t=>t.id===scene.combat.order[scene.combat.index]);
    if(!scene.combat.active || !current)fail('Start initiative first.');if(pendingFor(room,current.id))fail('Resolve the active token’s pending events first.',409);
    if(scene.combat.phase!=='ending'){scene.combat.phase='ending';turnPhase(room,current,'turn-end');if(pendingFor(room,current.id))return;}
    scene.combat.index++;if(scene.combat.index>=scene.combat.order.length){scene.combat.index=0;scene.combat.round++;publicLog(room,null,'Round '+scene.combat.round+' begins.');for(const token of scene.tokens)hooks(room,'round-start',token);}
    startTurn(room);
  }
  function resolveEvent(room,actor,command){
    const e=room.scene.events.find(event=>event.id===command.id);if(!e || e.status!=='pending')fail('This event has already been resolved.',409);
    const token=tokenById(room,e.tokenId),owner=token.ownerId===actor.id;
    if(actor.role!=='dm' && (!owner || !e.save))fail('The GM resolves this event.',403);
    const resolution=command.resolution || 'apply';let success=false;
    if(e.kind==='approval'){
      if(actor.role!=='dm')fail('The GM approves player-owned triggers.',403);
      const trap=room.scene.traps.find(t=>t.id===e.trapId);if(!trap)fail('That proposed trap was removed.');
      trap.pending=false;trap.armed=resolution!=='dismiss';e.status='resolved';publicLog(room,token,trap.armed?'The GM approved a triggered area.':'The GM declined the triggered area.');return;
    }
    if(!['apply','roll','success','failure','dismiss','manual'].includes(resolution))fail('Choose how to resolve the event.');
    if(resolution==='dismiss' && actor.role!=='dm')fail('Only the GM can dismiss this event.',403);
    if(e.save && resolution!=='dismiss'){
      if(resolution==='roll'){
        const plan=Conditions.rollPolicy(token.conditions,{kind:'save',ability:e.save.ability,damageType:e.action?.damageType},token.statblock?.abilities);
        if(plan.unresolvedFatigue)fail('Fatigue level 6/7 needs a table ruling. Enter a physical roll total instead.');
        if(token.movementProfile.traits.saveBonuses[e.save.ability]==null && token.statblock?.abilities?.[e.save.ability]==null)fail('Link a sheet, enter this saving-throw ability score, or use a physical roll total.');
        const bonus=(token.movementProfile.traits.saveBonuses[e.save.ability] ?? Math.floor(((token.statblock?.abilities?.[e.save.ability] ?? 10)-10)/2))-(Conditions.has(token.conditions,'madness')?(token.movementProfile.traits.saveProficiencies[e.save.ability] || 0):0);
        const dice=roll('1d20'),second=plan.mode==='normal'?null:roll('1d20');let face=second?(plan.mode==='advantage'?Math.max(dice.total,second.total):Math.min(dice.total,second.total)):dice.total;
        const penalties=plan.penalties.reduce((sum,p)=>sum+(p.flat || rollAmount('1d'+p.sides).total),0),total=face+bonus-penalties;
        success=!plan.automaticFailure && !plan.blocked && total>=e.save.dc;
        privateLog(room,token,e.label+': '+(plan.automaticFailure?'automatic failure':total+' vs DC '+e.save.dc)+(success?' — success.':' — failure.'));
      }else if(resolution==='manual')success=w(command.total,-9999,9999,'Saving throw total')>=e.save.dc;
      else if(['success','failure'].includes(resolution)){if(actor.role!=='dm')fail('Enter the physical roll total or roll in the browser.',403);success=resolution==='success';}
      else fail('Roll or enter a saving throw total.');
    }
    if(e.kind==='condition-save' && success){const row=token.conditions.find(r=>r.id===e.removeOnSuccess);if(row)changeCondition(room,token,row,true,true);}
    if(e.save && resolution!=='dismiss'){const row=token.conditions.find(r=>r.id==='tricked');if(row)changeCondition(room,token,row,true);}
    if(e.action && resolution!=='dismiss'){
      const action=structuredClone(e.action);if(e.kind==='ruling')action.amount=w(command.amount,0,999999,'Damage amount');runAction(room,token,action,e.sourceName || e.label,{seen:new Set(e.chain || [])},success);
    }
    e.status='resolved';e.resolvedBy=actor.id;if(e.save)e.outcome=success?'success':'failure';publicLog(room,token,e.label+(e.save?(success?' — save succeeded.':' — save failed.'):' resolved.'));
    const pending=token.pendingMove;
    if(pending?.eventId===e.id){
      const followup=room.scene.events.find(row=>row.tokenId===token.id && row.status==='pending' && row.blockMovement);
      if(followup){pending.eventId=followup.id;pending.resume=pending.resume && command.continue!==false;}
      else{token.pendingMove=null;const status=movementStatus(token,room.scene,pending.mode),fogBlocks=token.ownerId && room.scene.fog.enabled && routeCells(token,pending.destination,room.scene).some(cell=>!room.scene.fog.revealed.includes(cell));
        if(pending.resume && command.continue!==false && !status.blocked && !(token.ownerId && status.turnLocked) && !fogBlocks && (!room.scene.adventure.limitDistance || !room.scene.combat.active || status.remaining===null || status.remaining>1e-8))move(room,token.ownerId?{id:token.ownerId,role:'player'}:{id:'dm',role:'dm'},{id:token.id,...pending.destination,mode:pending.mode,ignored:pending.ignored},true);
      }
    }
    if(room.scene.combat.active && room.scene.combat.phase==='ending' && !pendingFor(room,room.scene.combat.order[room.scene.combat.index]))nextTurn(room);
  }
  function handle(room,actor,command){
    sceneDefaults(room.scene);const scene=room.scene,type=command.type;
    if(type==='map.ping'){
      const x=n(command.x,0,scene.width-1,'Ping X'),y=n(command.y,0,scene.height-1,'Ping Y'),now=Date.now();
      if(actor.role!=='dm' && !api.isRevealed(scene,x,y))fail('Ping within the revealed map.',403);
      scene.pings=scene.pings.filter(ping=>ping.expires>now);
      if(scene.pings.some(ping=>ping.actorId===actor.id && now-ping.at<800))fail('Wait a moment before pinging again.',429);
      scene.pings.push({id:uid(),actorId:actor.id,name:actor.name || (actor.role==='dm'?'GM':'Player'),x,y,at:now,expires:now+6000});scene.pings=scene.pings.slice(-8);return true;
    }
    if(type==='token.travel'){move(room,actor,{...command,x:tokenById(room,command.id).x,y:tokenById(room,command.id).y});return true;}
    if(type==='token.mobility'){
      const token=tokenById(room,command.id);if(!canEditStats(token,actor))fail('Only the token owner can edit granted movement speeds.',403);
      token.movementOverrides=profileFrom(command.profile);token.mobilityGrantTimer=command.turns==null?null:{remaining:w(command.turns,1,1000,'Grant duration'),anchorId:token.id};privateLog(room,token,'Movement grants updated: '+text(command.sourceName || 'Manual table entry',100)+'.');return true;
    }
    if(type==='movement.reset' || type==='movement.dash' || type==='movement.extra'){
      const token=tokenById(room,command.id);checkEdit(token,actor);
      if(type==='movement.dash' && actor.role!=='dm' && movementStatus(token,scene).turnLocked)fail('Use Dash during this token’s initiative turn.',403);
      if(type==='movement.reset'){if(actor.role!=='dm' && scene.combat.active)fail('Movement resets at the start of your turn.',403);token.mobility.spent=0;token.mobility.dashed=false;token.mobility.extra=0;}
      if(type==='movement.dash'){if(token.mobility.dashed)fail('Dash is already included. Ask the GM for any additional movement.');token.mobility.dashed=true;publicLog(room,token,token.name+' uses Dash.');}
      if(type==='movement.extra'){if(actor.role!=='dm')fail('The GM grants additional movement.',403);token.mobility.extra=w(command.amount,0,999999,'Additional movement');}
      return true;
    }
    if(type==='condition.duration'){
      const token=tokenById(room,command.id);checkEdit(token,actor);const row=token.conditions.find(r=>r.id===command.conditionId);if(!row)fail('Apply the condition first.');
      if(command.turns==null)delete token.conditionTimers[row.id];else{const anchor=tokenById(room,command.anchorId || token.id);token.conditionTimers[row.id]={remaining:w(command.turns,1,1000,'Duration'),timing:command.timing==='turn-start'?'turn-start':'turn-end',anchorId:anchor.id};}return true;
    }
    if(type==='effect.save'){
      const token=tokenById(room,command.effect?.tokenId);checkEdit(token,actor);const existing=scene.effects.find(e=>e.id===command.effect?.id);
      if(existing)checkEdit(tokenById(room,existing.tokenId),actor);
      const effect=effectFrom(command.effect,actor.id);if(existing)scene.effects[scene.effects.indexOf(existing)]=effect;else{if(scene.effects.length>=64)fail('Use at most 64 automatic effects.');scene.effects.push(effect);}return true;
    }
    if(type==='effect.remove'){
      const effect=scene.effects.find(e=>e.id===command.id);if(!effect)fail('Effect already removed.');checkEdit(tokenById(room,effect.tokenId),actor);scene.effects=scene.effects.filter(e=>e.id!==command.id);return true;
    }
    if(type==='trap.save'){
      const raw=command.trap,existing=scene.traps.find(t=>t.id===raw?.id);if(existing && actor.role!=='dm' && existing.ownerId!==actor.id)fail('You can only edit your own traps.',403);
      const token=raw?.tokenId?tokenById(room,raw.tokenId):null;if(actor.role!=='dm' && (!token || token.ownerId!==actor.id))fail('Choose your own character as the trap source.',403);
      const trap=trapFrom(raw,scene,existing?.ownerId || actor.id);
      if(actor.role!=='dm' && !api.isRevealed(scene,trap.x,trap.y))fail('Place your trigger within the revealed map.',403);
      if(actor.role!=='dm'){
        const source=token.movementProfile.sources.find(s=>s.id===trap.sourceId);if(!source && !trap.sourceName)fail('Choose an inventory item, spell, feature or table-approved source.');
        trap.sourceName=source?.name || trap.sourceName;trap.pending=true;trap.armed=false;
      }
      if(existing){scene.traps[scene.traps.indexOf(existing)]=trap;for(const e of scene.events)if(e.trapId===trap.id && e.kind==='approval' && e.status==='pending')e.status='superseded';}
      else{if(scene.traps.length>=32)fail('Use at most 32 traps or triggered areas.');scene.traps.push(trap);}
      if(trap.pending)event(room,{kind:'approval',tokenId:token.id,trapId:trap.id,label:'Approve '+trap.name,blockMovement:false,publicText:'A player proposed a triggered area for GM approval.'});return true;
    }
    if(type==='trap.remove' || type==='trap.arm'){
      const trap=scene.traps.find(t=>t.id===command.id);if(!trap)fail('That trap was removed.');if(actor.role!=='dm' && (trap.ownerId!==actor.id || type==='trap.arm'))fail('The GM arms triggered areas.',403);
      if(type==='trap.remove'){scene.traps=scene.traps.filter(t=>t.id!==trap.id);for(const e of scene.events)if(e.trapId===trap.id && e.status==='pending'){e.status='dismissed';for(const token of scene.tokens)if(token.pendingMove?.eventId===e.id)token.pendingMove=null;}}
      else{trap.armed=flag(command.armed);trap.pending=false;}return true;
    }
    if(type==='event.resolve'){resolveEvent(room,actor,command);return true;}
    if(type==='event.cancel-route'){const token=tokenById(room,command.id);checkEdit(token,actor);if(token.pendingMove)token.pendingMove.resume=false;return true;}
    if(type==='scene.adventure'){
      if(actor.role!=='dm')fail('Only the GM changes encounter automation.',403);
      for(const key of ['enabled','autoConditions','ownTurnOnly','limitDistance'])if(command[key]!==undefined)scene.adventure[key]=flag(command[key]);
      if(command.metric!==undefined){if(!['straight','grid'].includes(command.metric))fail('Choose straight-line or grid movement.');scene.adventure.metric=command.metric;}return true;
    }
    return false;
  }
  function projectToken(token,actor,visible,scene){
    const status=movementStatus(token,scene);token.travelState=status;
    if(!visible){token.movementProfile=null;token.movementOverrides=null;token.mobilityGrantTimer=null;token.travelState={mode:status.mode,z:status.z,paused:status.paused,blocked:status.blocked,reason:status.reason,turnLocked:status.turnLocked,spent:status.spent,remaining:null,capacity:null,speed:null};}
    if(actor.role!=='dm' && token.ownerId!==actor.id){if(token.pendingMove)token.pendingMove={eventId:token.pendingMove.eventId,paused:true};
      if(token.motion && scene.fog.enabled && routeCells(token.motion.from,token.motion.to,scene).some(cell=>!scene.fog.revealed.includes(cell)))token.motion=null;
    }
    token.conditionState.blocked=status.blocked;token.conditionState.reason=status.reason;token.conditionState.speed=visible?status.speed:null;
  }
  function afterConditions(room,token,before){
    const previous=new Map(before.map(row=>[row.id,row.stacks])),current=new Map(token.conditions.map(row=>[row.id,row.stacks]));
    for(const row of token.conditions)if((previous.get(row.id) || 0)<row.stacks)hooks(room,'condition-added',token,{conditionId:row.id});
    if(!previous.has('melting') && current.has('melting') && room.scene.adventure.autoConditions)token.conditionTimers.melting={remaining:1,timing:'turn-start',anchorId:token.id};
    for(const row of before)if((current.get(row.id) || 0)<row.stacks)hooks(room,'condition-removed',token,{conditionId:row.id});
    for(const id of Object.keys(token.conditionTimers))if(!current.has(id))delete token.conditionTimers[id];
  }
  function afterStats(room,token,before){
    if(token.maxHp!==before.maxHp || token.statblock?.sourceId!==before.statblock?.sourceId || token.statblock?.type!==before.statblock?.type)return;
    const old=before.hp+before.resources.tempHP.current+before.resources.arcaneHealth.current,newTotal=token.hp+token.resources.tempHP.current+token.resources.arcaneHealth.current;
    if(newTotal<old){hooks(room,'damage',token,{amount:old-newTotal});for(const id of ['exposed','tricked','hypnotized','fascinated']){const row=token.conditions.find(r=>r.id===id);if(row)changeCondition(room,token,row,true);}}
    if(token.hp>before.hp)hooks(room,'heal',token,{amount:token.hp-before.hp});
    if(before.hp>0 && token.hp===0)hooks(room,'hp-zero',token);
  }
  function projectScene(scene,actor,visibleIds){
    const dm=actor.role==='dm';scene.traps=scene.traps.filter(trap=>dm || trap.ownerId===actor.id || !trap.hidden && !trap.pending && api.isRevealed(scene,trap.x,trap.y));
    scene.pings=scene.pings.filter(ping=>ping.expires>Date.now() && (dm || api.isRevealed(scene,ping.x,ping.y)));
    scene.effects=scene.effects.filter(effect=>dm || scene.tokens.some(t=>t.id===effect.tokenId && t.ownerId===actor.id));
    scene.events=scene.events.filter(e=>dm || visibleIds.has(e.tokenId)).map(e=>{
      const token=scene.tokens.find(t=>t.id===e.tokenId),owner=token?.ownerId===actor.id;
      const source=scene.traps.find(trap=>trap.id===e.trapId);if(e.kind==='trap' && source){e.label=source.name;e.sourceName=source.name;}
      if(dm)return e;if(owner){if(e.trapId && !source){delete e.sourceName;delete e.trapId;delete e.action;}delete e.chain;return e;}return {id:e.id,kind:e.kind,tokenId:e.tokenId,status:e.status,label:'Encounter event',blockMovement:e.blockMovement,at:e.at};
    });
  }
  function importScene(scene,raw){
    for(const key of ['traps','effects'])if(raw[key]!==undefined && !Array.isArray(raw[key]))fail('Campaign '+key+' must be a list.');
    sceneDefaults(scene);if((raw.traps?.length || 0)>32 || (raw.effects?.length || 0)>64)fail('This backup has too many triggers.');
    scene.traps=(raw.traps || []).map(trap=>trapFrom({...trap,tokenId:trap.tokenId},scene,'dm'));
    scene.effects=(raw.effects || []).map(effect=>effectFrom(effect,'dm'));scene.events=[];
    scene.pings=[];
    for(const trap of scene.traps)if(trap.tokenId && !scene.tokens.some(token=>token.id===trap.tokenId))fail('A trigger source token is missing.');
    for(const effect of scene.effects)if(!scene.tokens.some(token=>token.id===effect.tokenId))fail('An automatic effect target is missing.');
    if(new Set(scene.traps.map(row=>row.id)).size!==scene.traps.length || new Set(scene.effects.map(row=>row.id)).size!==scene.effects.length)fail('Duplicate trigger IDs in the backup.');
    if(raw.events!==undefined && (!Array.isArray(raw.events) || raw.events.length>296))fail('Invalid campaign event list.');
    for(const original of (raw.events || []).filter(e=>e && e.status==='pending')){
      if(!scene.tokens.some(t=>t.id===original.tokenId) || !['trap','approval','condition-save','effect-save','ruling','movement-review'].includes(original.kind))continue;
      const save=original.save?{ability:original.save.ability,dc:w(original.save.dc,1,99,'Save DC'),half:original.save.half===true}:null;
      if(save && !ABILITIES.includes(save.ability))fail('Invalid event saving throw.');
      if(original.chain!==undefined && !Array.isArray(original.chain))fail('Invalid event chain.');
      scene.events.push({id:text(original.id,80),kind:original.kind,tokenId:original.tokenId,trapId:text(original.trapId,80),label:label(original.label,'Encounter event',80),sourceName:text(original.sourceName,100),status:'pending',blockMovement:original.blockMovement!==false,
        save,removeOnSuccess:text(original.removeOnSuccess,80),action:original.action?actionFrom(original.action):null,chain:(original.chain || []).slice(0,64).map(id=>text(id,80)),at:text(original.at,80)});
    }
    scene.adventure={enabled:raw.adventure?.enabled!==false,autoConditions:raw.adventure?.autoConditions!==false,metric:raw.adventure?.metric==='grid'?'grid':'straight',ownTurnOnly:raw.adventure?.ownTurnOnly===true,limitDistance:raw.adventure?.limitDistance!==false};
    if(raw.combat){
      obj(raw.combat,'Initiative');const order=raw.combat.order || [];
      if(!Array.isArray(order) || order.some(id=>!scene.tokens.some(token=>token.id===id)) || new Set(order).size!==order.length)fail('Invalid initiative order.');
      scene.combat={active:raw.combat.active===true && order.length>0,order,index:w(raw.combat.index ?? 0,0,Math.max(0,order.length-1),'Active turn'),round:w(raw.combat.round ?? 1,1,999999999,'Round'),turnSerial:w(raw.combat.turnSerial ?? 0,0,999999999,'Turn counter'),phase:raw.combat.phase==='ending'?'ending':'active'};
    }
    for(const token of scene.tokens)if(token.pendingMove && !scene.events.some(e=>e.id===token.pendingMove.eventId))token.pendingMove=null;
  }
  return {tokenFields,sceneDefaults,profileFrom,move,handle,startTurn,nextTurn,turnPhase,hooks,projectToken,projectScene,importScene,afterConditions,afterStats};
}
