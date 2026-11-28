const assert=require('node:assert/strict');
const path=require('node:path');

// Runs inside the existing independent GM/player browser fixture and actual
// RoomService. Builder clicks use the UI; direct commands only arrange the scene.
module.exports=async function eventsQA({dm,player,service,dmKey,playerKey,tokenId,broadcast,output,mapPoint}){
  const roomId=(await service.read()).id;
  const gm=async command=>{const view=await service.command(dmKey,command);await broadcast(roomId);return view;};
  const own=async()=> (await service.read()).scene.tokens.find(token=>token.id===tokenId);
  const selected=async page=>{await page.locator('#campaign-tab-table').click();await page.locator('#tokens-list [data-token-id="'+tokenId+'"]').click();};
  const travel=async page=>{if(!await page.locator('#token-travel').evaluate(node=>node.open))await page.locator('#token-travel>summary').click();};
  const close=async(page,id)=>page.locator('#'+id+' .dialog-heading').getByRole('button',{name:'Close',exact:true}).click();
  await gm({type:'combat.end'});await gm({type:'token.condition',id:tokenId,action:'clear-all'});await gm({type:'fog.all',reveal:true});
  await gm({type:'token.move',id:tokenId,x:212.5,y:512.5,force:true});
  await selected(player);await selected(dm);await travel(player);
  for(const id of ['health-tempHP','health-arcaneHealth']){await player.locator('#'+id).fill('0');await player.locator('#'+id).blur();}
  await player.locator('#save-status').filter({hasText:'All changes saved'}).waitFor();
  const initial=await own(),startHP=initial.hp,afterHeal=Math.min(initial.maxHp,startHP+3);
  const sheet=await player.context().newPage();await sheet.goto('http://127.0.0.1:8787/character.html?character='+encodeURIComponent(initial.statblock.sourceId));
  await sheet.locator('[data-path="resources.hp.current"]').waitFor();

  await player.getByRole('button',{name:'Automatic effects',exact:true}).click();
  await player.locator('#effect-target').selectOption(tokenId);await player.locator('#effect-name').fill('QA regeneration');
  await player.locator('#effect-source').fill('Regeneration source');await player.locator('#effect-trigger').selectOption('turn-start');
  await player.locator('#effect-uses').fill('2');await player.locator('#effect-action').selectOption('heal');await player.locator('#effect-amount').fill('3');
  await player.getByRole('button',{name:'Add automatic effect',exact:true}).click();
  await player.locator('.automatic-effect-row').filter({hasText:'QA regeneration'}).waitFor();await close(player,'automatic-effect-dialog');

  await gm({type:'token.condition',id:tokenId,condition:{id:'snared'}});
  if(!await player.locator('#token-conditions').evaluate(node=>node.open))await player.locator('#condition-summary').click();
  const source=player.locator('.condition-source[data-condition-id="snared"]');await source.locator('summary').click();
  await source.getByRole('button',{name:'Set turn duration',exact:true}).click();await player.locator('#duration-turns').fill('1');
  await player.locator('#duration-timing').selectOption('turn-end');await player.getByRole('button',{name:'Save duration',exact:true}).click();
  await player.locator('#condition-duration-dialog').waitFor({state:'hidden'});
  await gm({type:'combat.set',id:tokenId,value:99});await dm.locator('#campaign-tab-turns').click();await dm.locator('#start-combat').click();
  await player.waitForFunction(hp=>document.querySelector('#dock-current-0').value===String(hp),afterHeal);
  await player.waitForFunction(({id,hp})=>JSON.parse(localStorage.getItem('vara.character-sheets.v1')).characters.find(c=>c.id===id).resources.hp.current===hp,{id:initial.statblock.sourceId,hp:afterHeal});
  await sheet.waitForFunction(hp=>document.querySelector('[data-path="resources.hp.current"]').value===String(hp),afterHeal);
  assert.equal((await service.view(dmKey)).scene.tokens.find(t=>t.id===tokenId).hp,null);
  await dm.locator('#next-turn').click();await player.locator('.condition-badge[data-condition-id="snared"]').waitFor({state:'hidden'});
  assert(!(await own()).conditions.some(row=>row.id==='snared'));
  await sheet.waitForFunction(()=>document.querySelectorAll('.condition-chip').length===0);
  await player.reload();await player.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
  assert.equal(Number(await player.locator('#dock-current-0').inputValue()),afterHeal);
  await gm({type:'combat.end'});await travel(player);

  await player.locator('#movement-grants').click();await player.locator('#grant-fly').fill('30');await player.locator('#grant-burrow').fill('10');
  await player.locator('#grant-hover').check();await player.locator('#grant-source').fill('Granted movement from the character source');
  await player.getByRole('button',{name:'Save granted speeds',exact:true}).click();await player.locator('#movement-grants-dialog').waitFor({state:'hidden'});
  await player.locator('#travel-mode').selectOption('fly');await player.locator('#travel-height').fill('20');await player.locator('#apply-travel').click();
  await player.locator('.map-travel-marker[data-token-id="'+tokenId+'"]').filter({hasText:/Flying.*20 ft.*up/}).waitFor();
  await dm.locator('.map-travel-marker[data-token-id="'+tokenId+'"]').filter({hasText:/Flying/}).waitFor();
  assert.equal((await own()).mobility.spent,20);
  await player.locator('#travel-mode').selectOption('walk');await player.locator('#travel-height').fill('0');await player.locator('#apply-travel').click();
  await player.locator('#save-status').filter({hasText:'All changes saved'}).waitFor();
  await player.locator('#travel-mode').selectOption('burrow');await player.locator('#travel-height').fill('-5');await player.locator('#apply-travel').click();
  await player.locator('.map-travel-marker[data-token-id="'+tokenId+'"]').filter({hasText:/Burrowing.*5 ft.*down/}).waitFor();
  await player.locator('#travel-mode').selectOption('walk');await player.locator('#travel-height').fill('0');await player.locator('#apply-travel').click();
  await player.locator('#movement-reset').click();

  async function draw(page,shape,x,y,size){
    await page.getByRole('button',{name:'Spell area',exact:true}).click();await page.locator('#spell-shape').selectOption(shape);await page.locator('#spell-size').fill(String(size));await page.locator('#spell-size').blur();
    await page.getByRole('button',{name:'Collapse area options',exact:true}).click();
    const origin=await mapPoint(page,x,y),end=await mapPoint(page,x+100,y);await page.mouse.move(origin.x,origin.y);await page.mouse.down();await page.mouse.move(end.x,end.y);await page.mouse.up();
    await page.locator('#make-area-trigger:enabled').click();
  }
  await draw(dm,'circle',375,512.5,2.5);await dm.locator('#trap-name').fill('QA hidden spike trap');await dm.locator('#trap-token').selectOption('');
  await dm.locator('#trap-reveal').uncheck();await dm.locator('#trap-action').selectOption('damage');await dm.locator('#trap-amount').fill('4');
  await dm.getByRole('button',{name:'Place trigger',exact:true}).click();await dm.locator('#trap-dialog').waitFor({state:'hidden'});
  const trap=(await service.read()).scene.traps.find(t=>t.name==='QA hidden spike trap');assert(trap?.armed);
  assert(!(await service.view(playerKey)).scene.traps.some(t=>t.id===trap.id));
  await player.getByRole('button',{name:'Select and move',exact:true}).click();const start=await mapPoint(player,212.5,512.5),end=await mapPoint(player,612.5,512.5);
  await player.mouse.move(start.x,start.y);await player.mouse.down();await player.mouse.move(end.x,end.y,{steps:10});await player.mouse.up();
  await player.locator('.map-travel-marker[data-token-id="'+tokenId+'"]').filter({hasText:'Paused'}).waitFor();
  let stopped=await own();assert.equal(stopped.x,337.5);assert.equal(stopped.hp,afterHeal);assert.equal(stopped.motion.to.x,337.5);
  await dm.locator('.encounter-event').filter({hasText:'QA hidden spike trap'}).waitFor();
  assert(!(await player.locator('.encounter-event-list').textContent()).includes('QA hidden spike trap'));
  await player.screenshot({path:path.join(output,'tabletop-paused-trap.png')});await dm.screenshot({path:path.join(output,'tabletop-event-resolution.png')});
  await dm.locator('.encounter-event').filter({hasText:'QA hidden spike trap'}).getByRole('button',{name:'Resolve effect',exact:true}).click();
  await player.waitForFunction(hp=>document.querySelector('#dock-current-0').value===String(hp),afterHeal-4);
  stopped=await own();assert.equal(stopped.x,612.5);assert.equal(stopped.pendingMove,null);
  await player.waitForFunction(({id,hp})=>JSON.parse(localStorage.getItem('vara.character-sheets.v1')).characters.find(c=>c.id===id).resources.hp.current===hp,{id:initial.statblock.sourceId,hp:afterHeal-4});
  await sheet.waitForFunction(hp=>document.querySelector('[data-path="resources.hp.current"]').value===String(hp),afterHeal-4);

  await draw(player,'line',725,725,10);await player.locator('#trap-name').fill('QA player snare');await player.locator('#trap-source-name').fill('Inventory snare');
  await player.locator('#trap-action').selectOption('condition');await player.locator('#trap-condition').fill('Snared');await player.locator('#trap-turns').fill('1');
  await player.getByRole('button',{name:'Submit trigger',exact:true}).click();await player.locator('#trap-dialog').waitFor({state:'hidden'});
  let proposal=(await service.read()).scene.traps.find(t=>t.name==='QA player snare');assert(proposal?.pending);assert.equal(proposal.armed,false);
  await dm.locator('#campaign-tab-events').click();await dm.getByRole('button',{name:'Approve trigger',exact:true}).click();
  proposal=(await service.read()).scene.traps.find(t=>t.id===proposal.id);assert(proposal.armed);assert.equal(proposal.pending,false);
  const pingPoint=await mapPoint(player,600,700);await player.keyboard.down('Shift');await player.mouse.click(pingPoint.x,pingPoint.y);await player.keyboard.up('Shift');
  await player.locator('.map-ping-marker').waitFor();await dm.locator('.map-ping-marker').waitFor();
  await player.reload();await player.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
  assert.equal(Number(await player.locator('#dock-current-0').inputValue()),afterHeal-4);
  await sheet.close();
  for(const item of (await service.read()).scene.traps)await gm({type:'trap.remove',id:item.id});
  for(const item of (await service.read()).scene.effects)await gm({type:'effect.remove',id:item.id});
  return {automaticEffectBuilder:true,finiteRegeneration:true,turnBasedConditionExpiry:true,automaticPrivateSheetSync:true,
    flightAndDepthControls:true,visibleTravelBadges:true,trapBuilder:true,routeInterruption:true,routeContinuation:true,hiddenTrapPrivacy:true,playerTrapApproval:true,sharedPings:true};
};
