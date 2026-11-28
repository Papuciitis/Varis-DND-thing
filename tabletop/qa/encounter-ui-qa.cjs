const assert=require('node:assert/strict');
const path=require('node:path');

module.exports=async function encounterUI({dm,service,broadcast,output}){
  // This runs before opening any sheet/effect builder: the trap list must work
  // on its first use, independently of whether another dialog loaded it.
  const dmKey=await dm.evaluate(()=>JSON.parse(localStorage.getItem('vara.tabletop.sessions.v1'))[0].key),roomId=(await service.read()).id;
  const gm=async command=>{const view=await service.command(dmKey,command);await broadcast(roomId);return view;};
  await dm.getByRole('button',{name:'Spell area',exact:true}).click();await dm.locator('#spell-size').fill('5');await dm.locator('#spell-size').blur();
  await dm.getByRole('button',{name:'Collapse area options',exact:true}).click();await dm.locator('#zoom-fit').click();
  const rect=await dm.locator('#map-canvas').boundingBox(),z=Math.min((rect.width-40)/1600,(rect.height-110)/1000);
  await dm.mouse.click(rect.x+(rect.width-1600*z)/2+400*z,rect.y+(rect.height-1000*z)/2+10+725*z);
  await dm.locator('#make-area-trigger:enabled').click();await dm.locator('#trap-name').fill('UI condition trap');await dm.locator('#trap-action').selectOption('condition');
  assert.equal(await dm.locator('#trap-condition option').count(),49);assert(await dm.locator('#trap-condition').isVisible());
  await dm.locator('#trap-condition-search').fill('snar');assert.equal(await dm.locator('#trap-condition option').count(),3);
  await dm.locator('#trap-condition').selectOption({label:'Snared'});await dm.locator('#trap-condition-search').fill('');
  await dm.locator('#trap-turns').fill('2');await dm.locator('#trap-save').selectOption('dex');await dm.locator('#trap-dc').fill('15');
  await dm.screenshot({path:path.join(output,'tabletop-condition-picker.png')});
  await dm.getByRole('button',{name:'Place trigger',exact:true}).click();await dm.locator('#trap-dialog').waitFor({state:'hidden'});
  const trap=(await service.read()).scene.traps.find(trap=>trap.name==='UI condition trap');assert.equal(trap.action.condition.id,'snared');assert.equal(trap.action.turns,2);
  await dm.locator('#data-tab-scene').click();const scene=dm.locator('#show-grid').locator('xpath=ancestor::details[1]');if(!await scene.evaluate(node=>node.open))await scene.locator(':scope>summary').click();
  await dm.locator('.placed-trigger-list article').filter({hasText:'UI condition trap'}).getByRole('button',{name:'Edit',exact:true}).click();
  assert.equal(await dm.locator('#trap-condition').inputValue(),'snared');assert.equal(await dm.locator('#trap-condition option').count(),49);
  await dm.locator('#trap-condition').selectOption('__custom__');await dm.locator('#trap-custom-condition').fill('Custom snare reminder');
  await dm.getByRole('button',{name:'Place trigger',exact:true}).click();await dm.locator('#trap-dialog').waitFor({state:'hidden'});
  const custom=(await service.read()).scene.traps.find(row=>row.id===trap.id);assert.equal(custom.action.condition.name,'Custom snare reminder');assert(custom.action.condition.id.startsWith('custom:'));
  await gm({type:'trap.save',trap});
  const token=(await service.read()).scene.tokens[0];await gm({type:'token.move',id:token.id,x:425,y:725});
  const event=dm.locator('.encounter-event').filter({hasText:'UI condition trap'});await event.waitFor();await event.getByText(/On a failed save: Snared/).waitFor();
  await dm.setViewportSize({width:1200,height:900});
  const buttons=await event.locator('.button-row>button').evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,overflow:node.scrollWidth>node.clientWidth+1})));
  assert.equal(buttons.length,5);assert(buttons.every(button=>button.width>=118 && button.height<=70 && !button.overflow),JSON.stringify(buttons));
  await dm.screenshot({path:path.join(output,'tabletop-readable-condition-event.png')});
  await event.getByRole('button',{name:'Mark success',exact:true}).click();await event.waitFor({state:'hidden'});
  await gm({type:'trap.remove',id:trap.id});await gm({type:'token.move',id:token.id,x:325,y:525,force:true});
  await dm.setViewportSize({width:1440,height:1000});await dm.getByRole('button',{name:'Select and move',exact:true}).click();
  await dm.locator('#campaign-tab-table').click();await dm.locator('#data-tab-token').click();
};
