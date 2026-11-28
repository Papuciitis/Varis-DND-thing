// Headless development test: HTTP and WebSocket routes use the real room service
// in process. This avoids depending on loopback access in restricted sandboxes.
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
let chromium;
try {({chromium}=require('playwright'));}
catch {({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../..'),site=path.join(root,'site'),output=path.join(root,'.qa');

(async()=>{
  const {RoomService,MemoryStore}=await import('../server/room-service.mjs');
  const {roomRequest,json}=await import('../server/protocol.mjs');
  const rooms=new Map(),sockets=new Set(),errors=[];
  let createdCount=0,lastBackup=null,lobbyHealthHold=null;
  async function broadcast(id){
    const clients=[...sockets].filter(s=>s.id===id && s.key),online=[...new Set(clients.map(s=>s.actorId))];
    for(const client of clients){try{client.socket.send(JSON.stringify({type:'state',view:await rooms.get(id).view(client.key),online}));}catch{}}
  }
  async function attach(context){
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.pathname.startsWith('/api/')){
        let response;
        try {
          if(url.pathname==='/api/health'){
            if(lobbyHealthHold)await lobbyHealthHold;
            response=json({service:'vara-tabletop',version:1,mode:'local'});
          }
          else if(url.pathname==='/api/rooms'){
            const body=req.postDataJSON(),id=(++createdCount).toString(16).padStart(16,'0'),service=new RoomService(new MemoryStore());
            rooms.set(id,service);response=json(await service.create(id,body.name,body.ownerName),201);
          }else{
            const match=/^\/api\/rooms\/([a-f0-9]{16})\/(.+)$/.exec(url.pathname);
            if(!match || !rooms.has(match[1]))response=json({error:'Game not found.'},404);
            else response=await roomRequest(rooms.get(match[1]),new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.method()==='GET'?{}:{body:req.postData()})}),match[2],()=>broadcast(match[1]));
          }
          const data=Buffer.from(await response.arrayBuffer());
          if(url.pathname.endsWith('/backup') && response.ok)lastBackup=JSON.parse(data.toString());
          await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:data});
        }catch(error){await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:error.message})});}
        return;
      }
      let filename=path.resolve(site,'.'+decodeURIComponent(url.pathname));
      if(!filename.startsWith(site+path.sep)){await route.abort();return;}
      try {
        if((await fsp.stat(filename)).isDirectory())filename=path.join(filename,'index.html');
        const contentType={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(filename)] || 'application/octet-stream';
        await route.fulfill({status:200,contentType,body:await fsp.readFile(filename)});
      }catch{await route.fulfill({status:404,body:'Not found'});}
    });
    await context.routeWebSocket('**/api/rooms/*/socket',socket=>{
      const id=new URL(socket.url()).pathname.split('/')[3],client={socket,id,key:null,actorId:null};sockets.add(client);
      socket.onMessage(async message=>{
        if(message==='ping'){socket.send('pong');return;}
        try{const input=JSON.parse(message),view=await rooms.get(id).view(input.key);client.key=input.key;client.actorId=view.self.id;await broadcast(id);}
        catch{socket.close({code:1008,reason:'Invalid access'});}
      });
      socket.onClose(()=>{sockets.delete(client);broadcast(id).catch(()=>{});});
    });
    context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  }
  const options={headless:true,downloadsPath:path.join(output,'downloads')};
  if(!fs.existsSync(chromium.executablePath())){
    options.executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
    if(!options.executablePath)throw new Error('Install a Playwright browser with npx playwright install chromium.');
  }
  await fsp.mkdir(output,{recursive:true});
  await fsp.mkdir(options.downloadsPath,{recursive:true});
  const browser=await chromium.launch(options);
  try{
    const dmContext=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});await attach(dmContext);
    const dm=await dmContext.newPage();await dm.goto('http://127.0.0.1:8787/tabletop/');
    await dm.getByRole('button',{name:'Create your table'}).waitFor();
    await dm.screenshot({path:path.join(output,'tabletop-lobby.png')});
    await dm.getByLabel('Your nickname').fill('Nauris');
    await dm.getByRole('button',{name:'Create your table'}).click();
    await dm.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
    // All desktop panels collapse independently. A dragged/keyboard-adjusted
    // reference width and collapsed choices survive reloading this browser.
    const viewportSize=()=>dm.locator('#map-canvas').evaluate(node=>({width:node.clientWidth,height:node.clientHeight}));
    const initialViewport=await viewportSize();
    await dm.getByRole('button',{name:'Collapse campaign panel',exact:true}).click();
    await dm.waitForFunction(width=>document.querySelector('#map-canvas').clientWidth>width+100,initialViewport.width);
    await dm.getByRole('button',{name:'Expand campaign panel',exact:true}).click();
    await dm.getByRole('button',{name:'Collapse reference panel',exact:true}).click();
    await dm.waitForFunction(width=>document.querySelector('#map-canvas').clientWidth>width+100,initialViewport.width);
    await dm.getByRole('button',{name:'Expand reference panel',exact:true}).click();
    await dm.getByRole('button',{name:'Collapse utilities',exact:true}).click();
    await dm.waitForFunction(height=>document.querySelector('#map-canvas').clientHeight>height+20,initialViewport.height);
    await dm.getByRole('button',{name:'Expand utilities',exact:true}).click();
    const referenceBefore=await dm.locator('#inspector').evaluate(node=>node.clientWidth),divider=await dm.locator('#reference-resizer').boundingBox();
    await dm.mouse.move(divider.x+3,divider.y+150);await dm.mouse.down();await dm.mouse.move(divider.x-107,divider.y+150,{steps:6});await dm.mouse.up();
    assert((await dm.locator('#inspector').evaluate(node=>node.clientWidth))>referenceBefore+90);
    await dm.locator('#reference-resizer').focus();await dm.keyboard.press('ArrowRight');
    const savedWidth=await dm.locator('#inspector').evaluate(node=>node.clientWidth);
    const wideToggle=await dm.getByRole('button',{name:'Collapse reference panel',exact:true}).boundingBox();
    assert(wideToggle && wideToggle.x+wideToggle.width<=1440,'The reference collapse control must stay reachable after resizing.');
    await dm.getByRole('button',{name:'Collapse reference panel',exact:true}).click();
    await dm.getByRole('button',{name:'Expand reference panel',exact:true}).click();
    await dm.getByRole('button',{name:'Collapse campaign panel',exact:true}).click();
    await dm.getByRole('button',{name:'Collapse utilities',exact:true}).click();
    await dm.screenshot({path:path.join(output,'tabletop-panels-collapsed.png')});
    await dm.reload();await dm.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
    await dm.getByRole('button',{name:'Expand campaign panel',exact:true}).waitFor();
    await dm.getByRole('button',{name:'Expand utilities',exact:true}).waitFor();
    assert(Math.abs((await dm.locator('#inspector').evaluate(node=>node.clientWidth))-savedWidth)<=1);
    await dm.getByRole('button',{name:'Expand campaign panel',exact:true}).click();await dm.getByRole('button',{name:'Expand utilities',exact:true}).click();
    await dm.locator('#reference-resizer').dblclick();
    // Removal stays available with Token settings collapsed, and both the
    // context menu and focused-map Delete key perform the same confirmed action.
    const deletionService=[...rooms.values()][0];
    const disposable=async name=>{
      await dm.locator('#add-token').click();await dm.locator('#new-token-name').fill(name);
      await dm.getByRole('button',{name:'Place token',exact:true}).click();
      await dm.locator('#selected-name').filter({hasText:name}).waitFor();
      return (await deletionService.read()).scene.tokens.find(t=>t.name===name).id;
    };
    const buttonDelete=await disposable('Remove button test');
    assert.equal(await dm.locator('#token-settings').evaluate(node=>node.open),false);
    assert(await dm.locator('#delete-token').isVisible(),'Remove token must be visible without expanding Token settings.');
    dm.once('dialog',dialog=>dialog.dismiss());await dm.locator('#delete-token').click();
    assert((await deletionService.read()).scene.tokens.some(t=>t.id===buttonDelete));
    dm.once('dialog',dialog=>dialog.accept());await dm.locator('#delete-token').click();
    await dm.locator('#tokens-list [data-token-id="'+buttonDelete+'"]').waitFor({state:'hidden'});
    const contextDelete=await disposable('Context removal test');
    await dm.locator('#zoom-fit').click();
    const removeRect=await dm.locator('#map-canvas').boundingBox(),removeZoom=Math.min((removeRect.width-40)/1600,(removeRect.height-110)/1000);
    await dm.mouse.click(removeRect.x+(removeRect.width-1600*removeZoom)/2+325*removeZoom,removeRect.y+(removeRect.height-1000*removeZoom)/2+10+525*removeZoom,{button:'right'});
    dm.once('dialog',dialog=>dialog.accept());await dm.getByRole('menuitem',{name:'Remove token',exact:true}).click();
    await dm.locator('#tokens-list [data-token-id="'+contextDelete+'"]').waitFor({state:'hidden'});
    const keyboardDelete=await disposable('Keyboard removal test');
    await dm.locator('#map-canvas').focus();dm.once('dialog',dialog=>dialog.accept());await dm.keyboard.press('Delete');
    await dm.locator('#tokens-list [data-token-id="'+keyboardDelete+'"]').waitFor({state:'hidden'});
    assert.equal((await deletionService.read()).scene.tokens.length,3);
    await dm.locator('#invite-open').click();
    const invitation=await dm.locator('#invite-link').inputValue();
    assert(!invitation.includes('key='));
    await dm.getByRole('button',{name:'Close invitation'}).click();
    const playerContext=await browser.newContext({viewport:{width:1440,height:1000}});await attach(playerContext);
    const player=await playerContext.newPage();await player.goto(invitation);
    await player.getByLabel('Your nickname').fill('Daniels');
    await player.getByRole('button',{name:'Join the party'}).click();
    await player.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
    assert.equal(await player.locator('#delete-token').isVisible(),false);
    assert.equal(await player.getByRole('button',{name:'Reveal fog',exact:true}).isVisible(),false);
    assert.equal(await player.locator('#tokens-list').getByText('Watchtower guardian',{exact:true}).count(),0);
    const id=[...rooms.keys()][0],service=rooms.get(id),stored=await service.read();
    const guest=stored.players.find(p=>p.name==='Daniels'),token=stored.scene.tokens.find(t=>t.ownerId===guest.id);
    await dm.locator(`#tokens-list [data-token-id="${token.id}"]`).click();
    await player.locator('#map-canvas').focus();await player.keyboard.press('ArrowRight');
    await dm.locator('#selected-position').filter({hasText:'Column 6'}).waitFor();
    assert.equal((await service.read()).scene.tokens.find(t=>t.id===token.id).x,275);
    await player.locator('#campaign-tab-log').click();await dm.locator('#campaign-tab-log').click();
    await player.locator('[data-dice="1d20"]').click();
    await dm.locator('#game-log').getByText('Daniels · 1d20',{exact:true}).waitFor();
    assert.equal(await dm.locator('#game-log').evaluate(node=>!!node.closest('#campaign-log')),true);
    assert(await dm.locator('.roll-heading strong').first().evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=13));
    await dm.locator('#campaign-tab-table').click();await player.locator('#campaign-tab-table').click();
    // Player resources are private, editable by the owner, and shared read-only.
    assert.equal(await player.locator('#sidebar-link-character').count(),1,'Character linking must be visible in the existing sidebar.');
    assert.equal(await dm.locator('#dock-current-0').isVisible(),false);
    await player.locator('#dock-current-0').fill('11');await player.locator('#dock-current-0').blur();
    await player.locator('#tokens-list .token-hp-reading').filter({hasText:'11 / 20 HP'}).waitFor();
    await player.locator('#token-settings > summary').click();
    await player.locator('.resource-settings summary').click();
    await player.locator('#bar-enabled-0').check();
    await player.locator('#bar-label-0').fill('Arcane Health');
    await player.locator('#bar-resource-0').selectOption('arcaneHealth');
    await player.locator('#bar-value-0').fill('6');
    await player.locator('#bar-max-0').fill('10');
    await player.getByRole('button',{name:'Save bars',exact:true}).click();
    await player.waitForFunction(()=>document.querySelector('#health-arcaneHealth').value==='6');
    await player.locator('#share-token-stats').check();
    await dm.waitForFunction(()=>document.querySelector('#dock-current-0').value==='11');
    assert(await dm.locator('#dock-current-0').isDisabled());
    assert.equal(await dm.locator('#health-arcaneHealth').inputValue(),'6');
    await dm.locator('#token-dock').getByRole('button',{name:'Statblock',exact:true}).click();
    assert.equal(await dm.locator('#statblock-hp').inputValue(),'11');
    assert(await dm.locator('#statblock-hp').isDisabled());
    await player.locator('#share-token-stats').uncheck();
    await dm.locator('#dock-current-0').waitFor({state:'hidden'});
    await dm.locator('#statblock-dialog form').waitFor({state:'hidden'});
    await dm.locator('#statblock-dialog .dialog-heading').getByRole('button',{name:'Close',exact:true}).click();
    await dm.screenshot({path:path.join(output,'tabletop-private-dm.png')});

    // Discover a newly created character without a map refresh or context menu.
    await player.locator('#sidebar-link-character').click();
    assert.equal(await player.locator('#link-character option').count(),0);
    await player.locator('.source-controls').getByText(/No characters saved here yet/).waitFor();
    const sheet=await playerContext.newPage();await sheet.goto('http://127.0.0.1:8787/character.html');
    await sheet.locator('[data-path="resources.hp.current"]').waitFor();
    const characterId=await sheet.evaluate(()=>{
      const saved=JSON.parse(localStorage.getItem('vara.character-sheets.v1')),character=saved.characters.find(c=>c.id===saved.activeId);
      Object.assign(character,{name:'Linked Scout',size:'Small',notes:'PRIVATE CHARACTER NOTE',abilities:{str:12,dex:16,con:14,int:10,wis:10,cha:10},
        combat:{armorClass:15,initiativeBonus:1},features:[{id:'guardian-stance',name:'Guardian stance',notes:'Protect an ally standing beside you.'}],
        attacks:[{id:'bow',name:'Scout longbow',bonus:7,damage:'1d8 + 3 piercing',notes:'Range 150/600 ft.'},
          {id:'blade',name:'Private blade',bonus:6,damage:'1d6 + 3 slashing',notes:'Reach 5 ft.'}],
        resources:{hp:{current:17,max:30},tempHP:{current:5,max:10},arcaneHealth:{current:9,max:18}}});
      localStorage.setItem('vara.character-sheets.v1',JSON.stringify(saved));return character.id;
    });
    await player.locator('#link-character option').filter({hasText:'Linked Scout'}).waitFor({state:'attached'});
    await player.locator('#link-character').selectOption(characterId);
    await player.getByRole('button',{name:'Use this character',exact:true}).click();
    await player.locator('#toast').filter({hasText:'Character linked'}).waitFor();
    await player.locator('#sheet-link-status').filter({hasText:'Character linked'}).waitFor();
    await player.locator('#sheet-attacks').getByText('Scout longbow',{exact:true}).waitFor();
    assert.equal(await player.locator('.sheet-attack').count(),2);
    await player.locator('#sheet-attacks').getByText('+7 to hit',{exact:true}).waitFor();
    assert.equal(await player.locator('#combined-health').getAttribute('aria-valuenow'),'31');
    assert.equal(await player.locator('#combined-health').getAttribute('aria-valuemax'),'44');
    assert.equal(await player.locator('#token-dock .ac-shield strong').textContent(),'15');
    assert.equal(await player.locator('#token-dock .sheet-abilities .sheet-ability').count(),6);
    assert.equal(await player.locator('#data-token .sheet-abilities').count(),0);
    await player.locator('#selected-position').filter({hasText:'Small (1 square)'}).waitFor();
    assert.equal(await player.getByLabel('Initiative bonus for Linked Scout',{exact:true}).inputValue(),'4');
    assert.equal(await dm.getByLabel('Initiative bonus for Linked Scout',{exact:true}).inputValue(),'0');
    await player.locator('#sheet-rules summary').filter({hasText:'Guardian stance'}).click();
    await player.locator('#sheet-rules').getByText('Protect an ally standing beside you.',{exact:true}).waitFor();
    await player.locator('#quick-sheet > summary').click();
    assert.equal(await player.locator('.quick-sheet-body').isVisible(),false);
    assert(await player.locator('#sheet-attacks').getByText('Scout longbow',{exact:true}).isVisible());
    await player.locator('#quick-sheet > summary').click();
    assert(await player.locator('.quick-sheet-body').isVisible());
    await player.locator('#data-token').evaluate(el=>el.scrollTop=0);
    await player.screenshot({path:path.join(output,'tabletop-quick-sheet.png')});
    await player.locator('#token-dock').getByRole('button',{name:'Statblock',exact:true}).click();
    assert.equal(await player.locator('#statblock-hp').inputValue(),'17');
    assert.equal(await player.locator('#stat-str').inputValue(),'12');
    await player.screenshot({path:path.join(output,'tabletop-statblock.png')});
    await player.locator('#statblock-dialog .dialog-heading').getByRole('button',{name:'Close',exact:true}).click();
    await sheet.reload();
    await sheet.locator('[data-path="resources.hp.current"]').waitFor();
    // Opening the linked sheet selects its character even if another is active.
    await sheet.evaluate(()=>{
      const saved=JSON.parse(localStorage.getItem('vara.character-sheets.v1')),other=CharacterState.createCharacter();
      other.name='Other adventurer';saved.characters.push(other);saved.activeId=other.id;
      localStorage.setItem('vara.character-sheets.v1',JSON.stringify(saved));
    });
    const fullPromise=playerContext.waitForEvent('page');await player.locator('#open-linked-character').click();
    const full=await fullPromise;await full.locator('[data-path="resources.hp.current"]').waitFor();
    await full.waitForFunction(()=>document.querySelector('#character-name')?.value==='Linked Scout');
    assert(new URL(full.url()).searchParams.get('character')===characterId);await full.close();
    await player.locator('#dock-current-0').fill('12');await player.locator('#dock-current-0').blur();
    await sheet.waitForFunction(()=>document.querySelector('[data-path="resources.hp.current"]')?.value==='12');
    await sheet.locator('[data-path="resources.hp.current"]').fill('9');
    await sheet.locator('[data-path="resources.hp.current"]').blur();
    await player.waitForFunction(()=>document.querySelector('#dock-current-0').value==='9');
    const dmAccess=[...sockets].find(socket=>socket.actorId==='dm').key;
    assert(!JSON.stringify(await service.view(dmAccess)).includes('PRIVATE CHARACTER NOTE'));
    await player.locator('#share-token-stats').check();
    await dm.locator('#sheet-rules summary').filter({hasText:'Guardian stance'}).waitFor();
    await dm.locator('#sheet-attacks').getByText('Private blade',{exact:true}).waitFor();
    await player.locator('#share-token-stats').uncheck();
    await dm.waitForFunction(()=>!document.querySelector('#sheet-rules').textContent.includes('Guardian stance'));
    assert.equal(await dm.locator('#sheet-attacks').isVisible(),false);
    assert(!(await dm.locator('#sheet-attacks').textContent()).includes('Private blade'));
    // Source edits refresh visible attacks and public token size in both views.
    await sheet.evaluate(()=>{
      const saved=JSON.parse(localStorage.getItem('vara.character-sheets.v1')),character=saved.characters.find(c=>c.name==='Linked Scout');
      character.size='Tiny';character.attacks[0].bonus=9;
      localStorage.setItem('vara.character-sheets.v1',JSON.stringify(saved));
    });
    await player.locator('#sheet-attacks').getByText('+9 to hit',{exact:true}).waitFor();
    await dm.locator('#selected-position').filter({hasText:'Tiny (0.5 squares)'}).waitFor();
    assert.equal((await service.read()).scene.tokens.find(t=>t.id===token.id).size,.5);
    // The GM can apply public conditions without access to a player's private
    // sheet. Stacks sync in both directions and movement is checked by the server.
    const openConditionPicker=async page=>{
      if(!await page.locator('#token-conditions').evaluate(node=>node.open))await page.locator('#condition-summary').click();
      await page.locator('#token-conditions').getByRole('button',{name:'Conditions',exact:true}).click();
    };
    await openConditionPicker(dm);
    const conditionRow=id=>dm.locator('.condition-row[data-condition-id="'+id+'"]');
    await dm.locator('#condition-search').fill('Snared');
    await conditionRow('snared').getByRole('button',{name:'Add one Snared stack',exact:true}).click();
    assert.equal(await player.locator('#token-conditions').evaluate(node=>node.open),false);
    await player.getByRole('button',{name:'Collapse utilities',exact:true}).click();
    const otherToken=(await service.read()).scene.tokens.find(t=>t.id!==token.id && !t.hidden);
    await player.locator('#tokens-list [data-token-id="'+otherToken.id+'"]').click();
    const snaredMarker=player.locator('.map-condition-marker[data-token-id="'+token.id+'"][data-condition-id="snared"]');
    await snaredMarker.waitFor();await snaredMarker.click();
    await player.locator('#token-conditions .condition-badge[data-condition-id="snared"]').waitFor();
    assert.equal(await player.locator('#token-conditions').evaluate(node=>node.open),true);
    assert.equal(await player.getByRole('button',{name:'Collapse utilities',exact:true}).getAttribute('aria-expanded'),'true');
    await player.locator('.condition-source[data-condition-id="snared"] > summary').click();
    await player.locator('.condition-source[data-condition-id="snared"]').getByText('Cannot move.',{exact:true}).waitFor();
    await sheet.locator('.condition-chip').filter({hasText:'Snared'}).waitFor();
    await sheet.locator('[data-combat-value="speed"]').filter({hasText:'0 ft'}).waitFor();
    const snaredPosition=(await service.read()).scene.tokens.find(t=>t.id===token.id);
    await player.locator('#map-canvas').focus();await player.locator('#map-canvas').press('ArrowRight');
    await player.locator('#toast').filter({hasText:/Snared|movement.*blocked/i}).waitFor();
    assert.equal((await service.read()).scene.tokens.find(t=>t.id===token.id).x,snaredPosition.x);
    await dm.locator('#conditions-dialog .dialog-heading').getByRole('button',{name:'Close',exact:true}).click();
    await dm.locator('#map-canvas').focus();await dm.locator('#map-canvas').press('ArrowRight');
    await dm.locator('#save-status').filter({hasText:'All changes saved'}).waitFor();
    assert.equal((await service.read()).scene.tokens.find(t=>t.id===token.id).x,snaredPosition.x+25);
    await openConditionPicker(dm);
    await dm.locator('#condition-search').fill('Bleeding');
    const addBleeding=conditionRow('bleeding').getByRole('button',{name:'Add one Bleeding stack',exact:true});
    await addBleeding.click();await conditionRow('bleeding').getByLabel('Bleeding stacks',{exact:true}).waitFor();
    await dm.waitForFunction(()=>document.querySelector('.condition-row[data-condition-id="bleeding"] input')?.value==='1');
    await addBleeding.click();
    await player.locator('#token-conditions .condition-badge[data-condition-id="bleeding"]').filter({hasText:'×2'}).waitFor();
    await player.locator('.map-condition-marker[data-token-id="'+token.id+'"][data-condition-id="bleeding"]').filter({hasText:'×2'}).waitFor();
    await sheet.locator('.condition-chip').filter({hasText:'Bleeding ×2'}).waitFor();
    assert.equal(await player.locator('#token-conditions .condition-badge[data-condition-id="bleeding"]').count(),1);
    const badgeRects=await player.locator('#token-conditions .condition-badge').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
    for(let i=0;i<badgeRects.length;i++)for(let j=i+1;j<badgeRects.length;j++){
      const a=badgeRects[i],b=badgeRects[j];assert(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.h<=b.y || b.y+b.h<=a.y,'Condition badges must not overlap.');
    }
    await sheet.getByRole('button',{name:'Add one Bleeding stack',exact:true}).click();
    await dm.waitForFunction(()=>document.querySelector('.condition-row[data-condition-id="bleeding"] input')?.value==='3');
    await conditionRow('bleeding').getByRole('button',{name:'Remove one Bleeding stack',exact:true}).click();
    await sheet.locator('.condition-chip').filter({hasText:'Bleeding ×2'}).waitFor();
    await dm.locator('#condition-search').fill('Snared');
    await conditionRow('snared').getByRole('button',{name:'Remove',exact:true}).click();
    await sheet.locator('[data-combat-value="speed"]').filter({hasText:'30 ft'}).waitFor();
    await player.locator('#token-conditions .condition-badge[data-condition-id="snared"]').waitFor({state:'hidden'});
    await dm.locator('#condition-search').fill('Frostbite');
    await conditionRow('frostbite').getByRole('button',{name:'Add one Frostbite stack',exact:true}).click();
    await sheet.locator('.condition-chip').filter({hasText:'Frostbite'}).waitFor();
    assert.equal((await service.view([...sockets].find(s=>s.actorId===token.ownerId).key)).scene.tokens.find(t=>t.id===token.id).conditionState.blocked,false);
    await dm.locator('#condition-search').fill('Stunned');
    await conditionRow('stunned').getByRole('button',{name:'Add one Stunned stack',exact:true}).click();
    await sheet.locator('.condition-chip').filter({hasText:'Stunned'}).waitFor();
    await sheet.getByText('Saving throws',{exact:true}).click();
    await sheet.getByRole('button',{name:'Roll Strength saving throw',exact:true}).click();
    await sheet.getByText('Strength saving throw automatically fails because of the active conditions.',{exact:true}).waitFor();
    await dm.locator('.custom-condition > summary').click();
    await dm.locator('#custom-condition-name').fill('Frozen');
    await dm.locator('#custom-condition-blocked').check();
    await dm.locator('#custom-condition-notes').fill('A custom effect for this test only.');
    await dm.getByRole('button',{name:'Add custom effect',exact:true}).click();
    await sheet.locator('.condition-chip').filter({hasText:'Frozen'}).waitFor();
    await sheet.locator('[data-combat-value="speed"]').filter({hasText:'0 ft'}).waitFor();
    await dm.screenshot({path:path.join(output,'tabletop-conditions.png')});
    await player.setViewportSize({width:390,height:1000});
    await player.getByRole('button',{name:'Close table controls',exact:true}).click();
    await player.locator('#token-conditions').scrollIntoViewIfNeeded();
    const mobileBadges=await player.locator('#token-conditions .condition-badge').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
    for(const rect of mobileBadges)assert(rect.x>=0 && rect.x+rect.w<=390,'Condition badges must fit a narrow screen.');
    for(let i=0;i<mobileBadges.length;i++)for(let j=i+1;j<mobileBadges.length;j++){
      const a=mobileBadges[i],b=mobileBadges[j];assert(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.h<=b.y || b.y+b.h<=a.y,'Wrapped condition badges must not overlap.');
    }
    await player.screenshot({path:path.join(output,'tabletop-conditions-mobile.png')});
    await player.setViewportSize({width:1440,height:1000});
    assert(!JSON.stringify(await service.view(dmAccess)).includes('PRIVATE CHARACTER NOTE'));
    await dm.getByRole('button',{name:'Clear all conditions',exact:true}).click();
    await sheet.waitForFunction(()=>document.querySelectorAll('.condition-chip').length===0 && document.querySelector('[data-combat-value="speed"]')?.textContent==='30 ft');
    await dm.locator('#conditions-dialog .dialog-heading').getByRole('button',{name:'Close',exact:true}).click();
    await sheet.close();

    // Ruler unit options and spell shapes work in the actual Canvas interface.
    for(const unit of ['m','squares','ft'])await player.locator('#ruler-units').selectOption(unit);
    const mapPoint=async(page,x,y)=>{
      await page.locator('#zoom-fit').click();
      const rect=await page.locator('#map-canvas').boundingBox(),z=Math.min((rect.width-40)/1600,(rect.height-110)/1000);
      return {x:rect.x+(rect.width-1600*z)/2+x*z,y:rect.y+(rect.height-1000*z)/2+10+y*z};
    };
    await player.getByRole('button',{name:'Measure distance',exact:true}).click();
    const rulerStart=await mapPoint(player,425,725),rulerEnd=await mapPoint(player,525,725);
    await player.mouse.move(rulerStart.x,rulerStart.y);await player.mouse.down();await player.mouse.move(rulerEnd.x,rulerEnd.y);await player.mouse.up();
    await player.locator('#ruler-distance').filter({hasText:/ft$/}).waitFor();
    await player.locator('#ruler-units').selectOption('m');
    await player.locator('#ruler-distance').filter({hasText:/m$/}).waitFor();
    await player.locator('#ruler-units').selectOption('squares');
    await player.locator('#ruler-distance').filter({hasText:/squares?$/}).waitFor();
    await player.locator('#ruler-units').selectOption('ft');
    await player.getByRole('button',{name:'Spell area',exact:true}).click();
    for(const shape of ['circle','cone','line','square']){
      if(!await player.locator('#spell-shape').isVisible())await player.getByRole('button',{name:'Expand area options',exact:true}).click();
      await player.locator('#spell-shape').selectOption(shape);
      await player.locator('#spell-size').fill('15');await player.locator('#spell-size').blur();
      await player.getByRole('button',{name:'Collapse area options',exact:true}).click();
      const origin=await mapPoint(player,525,725),end=await mapPoint(player,675,725);
      await player.mouse.move(origin.x,origin.y);await player.mouse.down();await player.mouse.move(end.x,end.y);await player.mouse.up();
      await player.getByRole('button',{name:'Place for table',exact:true}).click();
    }
    assert.equal((await service.read()).scene.templates.length,4);
    await dm.locator('#campaign-tab-turns').click();
    await dm.locator('.placed-areas summary').click();
    await dm.locator('.placed-area').filter({hasText:'cone'}).waitFor();
    const removePoint=await mapPoint(player,625,725);
    await player.mouse.click(removePoint.x,removePoint.y,{button:'right'});
    await player.getByRole('menuitem',{name:/^Remove .*cone/}).click();
    await dm.locator('.placed-area').filter({hasText:'cone'}).waitFor({state:'hidden'});
    assert.equal((await service.read()).scene.templates.length,3);
    await player.getByRole('button',{name:'Expand area options',exact:true}).click();await player.locator('#spell-shape').selectOption('cone');await player.getByRole('button',{name:'Collapse area options',exact:true}).click();
    const origin=await mapPoint(player,525,725),end=await mapPoint(player,725,725);
    await player.mouse.move(origin.x,origin.y);await player.mouse.down();await player.mouse.move(end.x,end.y);await player.mouse.up();
    await player.screenshot({path:path.join(output,'tabletop-spell-areas.png')});
    await player.mouse.click(removePoint.x,removePoint.y,{button:'right'});
    await player.getByRole('menuitem',{name:'Clear spell preview',exact:true}).click();
    assert(await player.getByRole('button',{name:'Place for table',exact:true}).isDisabled());
    assert.equal((await service.read()).scene.templates.length,3);
    await player.getByRole('button',{name:'Select and move',exact:true}).click();
    const linkedTiny=(await service.read()).scene.tokens.find(t=>t.id===token.id);
    const tokenPoint=await mapPoint(player,linkedTiny.x,linkedTiny.y);
    await player.mouse.click(tokenPoint.x,tokenPoint.y,{button:'right'});
    await player.getByRole('menuitem',{name:'Adjust HP',exact:true}).waitFor();
    assert.equal(await player.getByRole('menuitem',{name:'Apply damage',exact:true}).count(),0);
    assert.equal(await player.getByRole('menuitem',{name:'Remove token',exact:true}).count(),0);
    await player.screenshot({path:path.join(output,'tabletop-context-menu.png')});
    await player.keyboard.press('Escape');
    const guardian=stored.scene.tokens.find(t=>t.hidden);
    await dm.locator('#campaign-tab-table').click();
    await dm.locator(`#tokens-list [data-token-id="${guardian.id}"]`).click();
    await dm.locator('#token-settings > summary').click();
    await dm.getByLabel('Hidden from players').uncheck();
    await dm.getByRole('button',{name:'Update token',exact:true}).click();
    assert.equal(await player.locator('#tokens-list').getByText('Watchtower guardian',{exact:true}).count(),0);
    await dm.getByRole('button',{name:'Reveal fog',exact:true}).click();
    await dm.locator('#zoom-fit').click();
    const rect=await dm.locator('#map-canvas').boundingBox(),z=Math.min((rect.width-40)/1600,(rect.height-110)/1000);
    await dm.mouse.click(rect.x+(rect.width-1600*z)/2+1175*z,rect.y+(rect.height-1000*z)/2+10+375*z);
    await player.locator('#tokens-list').getByText('Watchtower guardian',{exact:true}).waitFor();
    const playerKey=[...sockets].find(s=>s.actorId===guest.id).key;
    assert.equal((await service.view(playerKey)).scene.tokens.find(t=>t.id===guardian.id).hp,null);
    // DM monster links populate the same encounter statblock and resource bars.
    const manifest=JSON.parse(await fsp.readFile(path.join(site,'data/catalog-manifest.json'),'utf8'));
    const monsterCatalog=JSON.parse(await fsp.readFile(path.join(site,manifest.sections.find(s=>s.key==='monsters').url),'utf8'));
    assert(monsterCatalog.entries.length>=215,'The prototype must include the recovered monsters from main.');
    const sampleMonster=monsterCatalog.entries.find(entry=>/^\s*[1-9]\d*(?:\s*\(|\s*$)/.test(String(entry.details.hp)));
    await dm.locator('#sidebar-link-monster').click();
    await dm.locator('#link-monster-search').fill(sampleMonster.name);
    await dm.locator('#link-monster option').first().waitFor({state:'attached'});
    await dm.getByRole('button',{name:'Use this monster',exact:true}).click();
    await dm.locator('#toast').filter({hasText:'Monster statblock linked'}).waitFor();
    assert.equal(Number(await dm.locator('#dock-current-0').inputValue()),Number(String(sampleMonster.details.hp).match(/\d+/)[0]));
    assert.deepEqual((await service.read()).scene.tokens.find(t=>t.id===guardian.id).bars.map(b=>b.resource),['block','armorClass']);
    await dm.locator('#quick-edit-statblock').click();
    await dm.locator('#statblock-dialog .dialog-heading').getByRole('button',{name:'Close',exact:true}).click();
    // The right compendium supports actual native drag-and-drop, with linked,
    // independent encounter instances for both monsters and saved characters.
    await dm.locator('#data-tab-compendium').click();
    await dm.locator('#compendium-search').fill(sampleMonster.name);
    const monsterCard=dm.locator('.compendium-card').filter({hasText:sampleMonster.name}).first();
    await monsterCard.waitFor();await dm.screenshot({path:path.join(output,'tabletop-compendium.png')});
    const beforeDrop=new Set((await service.read()).scene.tokens.map(t=>t.id)),dropPoint=await mapPoint(dm,925,675);
    const dropRect=await dm.locator('#map-canvas').boundingBox();
    await monsterCard.dragTo(dm.locator('#map-canvas'),{targetPosition:{x:dropPoint.x-dropRect.x,y:dropPoint.y-dropRect.y}});
    await dm.locator('#toast').filter({hasText:'placed and linked'}).waitFor();
    const droppedMonster=(await service.read()).scene.tokens.find(t=>!beforeDrop.has(t.id));
    assert(droppedMonster);assert.equal(droppedMonster.x,925);assert.equal(droppedMonster.y,675);
    assert.equal(droppedMonster.statblock.type,'monster');assert.equal(droppedMonster.hp,droppedMonster.maxHp);
    await dm.locator('#dock-current-0').fill('1');await dm.locator('#dock-current-0').blur();
    await dm.waitForFunction(()=>document.querySelector('#dock-current-0').value==='1' && document.querySelector('#save-status').textContent==='All changes saved');
    assert.equal((await service.read()).scene.tokens.find(t=>t.id===droppedMonster.id).hp,1);
    assert.notEqual((await service.read()).scene.tokens.find(t=>t.id===guardian.id).hp,1);
    await dm.evaluate(()=>{
      const character=CharacterState.createCharacter();character.name='GM ranger';character.size='Large';
      character.resources.hp={current:13,max:22};character.attacks=[{id:'spear',name:'GM spear',bonus:5,damage:'1d6 + 3',notes:'Reach 10 ft.'}];
      localStorage.setItem('vara.character-sheets.v1',JSON.stringify({version:1,activeId:character.id,characters:[character]}));
    });
    await dm.locator('#data-tab-compendium').click();await dm.locator('#compendium-kind').selectOption('character');
    await dm.locator('#compendium-search').fill('GM ranger');
    const characterCard=dm.locator('.compendium-card').filter({hasText:'GM ranger'}),characterDrop=await mapPoint(dm,825,725);
    const charRect=await dm.locator('#map-canvas').boundingBox();
    await characterCard.dragTo(dm.locator('#map-canvas'),{targetPosition:{x:characterDrop.x-charRect.x,y:characterDrop.y-charRect.y}});
    await dm.locator('#toast').filter({hasText:'GM ranger placed and linked'}).waitFor();
    await dm.locator('#sheet-attacks').getByText('GM spear',{exact:true}).waitFor();
    const ranger=(await service.read()).scene.tokens.find(t=>t.name==='GM ranger');
    assert.equal(ranger.size,2);assert.equal(ranger.hp,13);assert.equal(ranger.x,825);
    // The real Skeleton source uses dice-first notation: 2d8+4(13).
    await dm.locator('#data-tab-compendium').click();await dm.locator('#compendium-kind').selectOption('monster');
    await dm.locator('#compendium-search').fill('Skeleton');
    const skeletonCard=dm.locator('.compendium-card').filter({has:dm.getByText('Skeleton',{exact:true})});
    await skeletonCard.getByRole('button',{name:'Place',exact:true}).click();
    await dm.locator('#toast').filter({hasText:'Skeleton placed and linked'}).waitFor();
    assert.equal(await dm.locator('#dock-current-0').inputValue(),'13');
    const skeleton=(await service.read()).scene.tokens.find(t=>t.name==='Skeleton');assert(skeleton);
    await dm.locator('#quick-edit-statblock').click();
    assert.equal(await dm.locator('#stat-str').isDisabled(),false);
    await dm.locator('#statblock-hp').fill('20');await dm.locator('#statblock-max-hp').fill('30');await dm.locator('#stat-str').fill('18');
    await dm.getByText('Resource values',{exact:true}).click();
    await dm.locator('#stat-tempHP').fill('6');await dm.locator('#stat-arcaneHealth').fill('8');
    await dm.getByRole('button',{name:'Save statblock',exact:true}).click();
    await dm.locator('#toast').filter({hasText:'Encounter statblock saved'}).waitFor();
    await dm.locator('#statblock-dialog .dialog-heading').getByRole('button',{name:'Close',exact:true}).click();
    assert.equal(await dm.locator('#health-tempHP').inputValue(),'6');assert.equal(await dm.locator('#health-arcaneHealth').inputValue(),'8');
    await dm.locator('#token-dock').getByRole('button',{name:'Actions',exact:true}).click();
    await dm.getByRole('menuitem',{name:'Apply damage',exact:true}).click();
    await dm.locator('#damage-amount').fill('25');
    assert.equal(await dm.locator('#damage-preview .damage-preview-row').last().locator('strong').textContent(),'9');
    await dm.locator('#damage-dialog').getByRole('button',{name:'Apply damage',exact:true}).click();
    await dm.locator('#damage-dialog').waitFor({state:'hidden'});
    assert.equal(await dm.locator('#dock-current-0').inputValue(),'9');
    assert.equal(await dm.locator('#health-tempHP').inputValue(),'0');assert.equal(await dm.locator('#health-arcaneHealth').inputValue(),'0');
    await dm.reload();await dm.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
    await dm.locator('#tokens-list [data-token-id="'+skeleton.id+'"]').click();
    assert.equal(await dm.locator('#dock-current-0').inputValue(),'9');
    assert.equal((await service.read()).scene.tokens.find(t=>t.id===skeleton.id).maxHp,30);
    assert.equal((await service.read()).scene.tokens.find(t=>t.id===skeleton.id).statblock.abilities.str,18);
    assert.equal(monsterCatalog.entries.find(e=>e.name==='Skeleton').details.hp,'2d8+4(13)');
    // Tiny compendium drops keep four separate positions in a normal cell.
    await dm.locator('#data-tab-compendium').click();await dm.locator('#compendium-kind').selectOption('monster');
    await dm.locator('#compendium-search').fill('Scorpion');
    const tinyGrid=(await service.read()).scene.gridSize,tinyTokens=[];
    const tinyPoints=[{x:22.25*tinyGrid,y:14.25*tinyGrid},{x:22.75*tinyGrid,y:14.25*tinyGrid},
      {x:22.25*tinyGrid,y:14.75*tinyGrid},{x:22.75*tinyGrid,y:14.75*tinyGrid}];
    for(const point of tinyPoints){
      await dm.locator('#data-tab-compendium').click();
      const before=(await service.read()).scene.tokens,ids=new Set(before.map(t=>t.id));
      const target=await mapPoint(dm,point.x,point.y),rect=await dm.locator('#map-canvas').boundingBox();
      const card=dm.locator('.compendium-card').filter({has:dm.getByText('Scorpion',{exact:true})});
      await card.dragTo(dm.locator('#map-canvas'),{targetPosition:{x:target.x-rect.x,y:target.y-rect.y}});
      await dm.waitForFunction(count=>Number(document.querySelector('#token-count').textContent)===count,before.length+1);
      await dm.locator('#save-status').filter({hasText:'All changes saved'}).waitFor();
      const placed=(await service.read()).scene.tokens.find(t=>!ids.has(t.id));
      assert(placed);assert.equal(placed.size,.5);assert.equal(placed.x,point.x);assert.equal(placed.y,point.y);tinyTokens.push(placed);
    }
    for(const token of tinyTokens){
      const point=await mapPoint(dm,token.x,token.y);await dm.mouse.click(point.x,point.y);
      assert.equal(await dm.locator('#tokens-list [data-token-id="'+token.id+'"]').getAttribute('aria-pressed'),'true');
    }
    const keyboardTiny=tinyTokens.at(-1);
    await dm.locator('#map-canvas').press('ArrowLeft');await dm.locator('#save-status').filter({hasText:'All changes saved'}).waitFor();
    assert.equal((await service.read()).scene.tokens.find(t=>t.id===keyboardTiny.id).x,keyboardTiny.x-tinyGrid/2);
    await dm.locator('#map-canvas').press('ArrowRight');await dm.locator('#save-status').filter({hasText:'All changes saved'}).waitFor();
    assert.equal((await service.read()).scene.tokens.find(t=>t.id===keyboardTiny.id).x,keyboardTiny.x);
    await player.locator('#data-tab-compendium').click();
    assert.equal(await player.locator('.compendium-card').count(),1);
    assert(!(await player.locator('#compendium-list').textContent()).includes('GM ranger'));
    await player.locator('.compendium-card').getByRole('button',{name:'Select',exact:true}).click();
    assert.equal(await player.locator('#data-tab-token').getAttribute('aria-selected'),'true');
    // Published GM notes reach the player; drafts and revoked notes do not.
    await dm.locator('#campaign-tab-notes').click();await player.locator('#campaign-tab-notes').click();
    await dm.locator('#note-title').fill('Vault secret');await dm.locator('#note-text').fill('PRIVATE GM NOTE');
    await dm.getByRole('button',{name:'Save note',exact:true}).click();
    await dm.locator('.campaign-note').filter({hasText:'Vault secret'}).waitFor();
    assert(!(await player.locator('#campaign-note-list').textContent()).includes('Vault secret'));
    assert.equal(await player.locator('#note-editor').isVisible(),false);
    await dm.locator('.campaign-note').getByRole('button',{name:'Edit',exact:true}).click();
    await dm.locator('#note-title').fill('Quest briefing');await dm.locator('#note-text').fill('Meet at the old tower.');
    await dm.locator('#note-shared').check();await dm.getByRole('button',{name:'Save note',exact:true}).click();
    await player.locator('#campaign-note-list').getByText('Meet at the old tower.',{exact:true}).waitFor();
    await dm.locator('.campaign-note').getByRole('button',{name:'Edit',exact:true}).click();
    await dm.locator('#note-shared').uncheck();await dm.getByRole('button',{name:'Save note',exact:true}).click();
    await player.locator('#campaign-note-list').getByText('Meet at the old tower.',{exact:true}).waitFor({state:'hidden'});
    await dm.screenshot({path:path.join(output,'tabletop-notes.png')});
    await dm.locator('#campaign-tab-log').click();await player.locator('#campaign-tab-log').click();
    await player.locator('#chat-message').fill('<b>Hello, party!</b>');await player.getByRole('button',{name:'Send',exact:true}).click();
    await dm.locator('.chat-entry').getByText('<b>Hello, party!</b>',{exact:true}).waitFor();
    assert.equal(await dm.locator('.chat-entry b').count(),0);
    await dm.screenshot({path:path.join(output,'tabletop-campaign-log.png')});
    await dm.getByRole('button',{name:'Select and move',exact:true}).click();
    // Initiative uses typed totals or a deliberate browser roll, never Start.
    const initiativeRow=(page,tokenId)=>page.locator('[data-initiative-id="'+tokenId+'"]');
    await player.locator('#campaign-tab-turns').click();await dm.locator('#campaign-tab-turns').click();
    const playerInitiative=initiativeRow(player,token.id),dmInitiative=initiativeRow(dm,guardian.id);
    assert.equal(await playerInitiative.locator('input').first().inputValue(),'');
    await playerInitiative.getByLabel('Initiative total for Linked Scout',{exact:true}).fill('18');
    await playerInitiative.getByLabel('Initiative total for Linked Scout',{exact:true}).blur();
    await dm.waitForFunction(id=>document.querySelector('[data-initiative-id="'+id+'"] input').value==='18',token.id);
    await dmInitiative.locator('input').first().fill('12');await dmInitiative.locator('input').first().blur();
    const logsBeforeStart=(await service.read()).log.length;
    await dm.locator('#start-combat').click();await dm.locator('#round-label').filter({hasText:'Round 1'}).waitFor();
    const startEvents=(await service.read()).log.slice(logsBeforeStart);assert.equal(startEvents.length,2);assert(startEvents.every(entry=>entry.kind==='event'));
    assert.equal((await service.view(dmAccess)).scene.combat.activeId,token.id);
    await playerInitiative.getByLabel('Initiative total for Linked Scout',{exact:true}).fill('7');
    await playerInitiative.getByLabel('Initiative total for Linked Scout',{exact:true}).blur();
    await dm.waitForFunction(id=>document.querySelector('#initiative-list').firstElementChild.dataset.initiativeId===id,guardian.id);
    assert.equal((await service.view(dmAccess)).scene.combat.activeId,token.id);
    await playerInitiative.getByLabel('Initiative bonus for Linked Scout',{exact:true}).fill('3');
    await playerInitiative.getByRole('button',{name:'Roll initiative for Linked Scout',exact:true}).click();
    await dm.locator('#campaign-tab-log').click();
    await dm.locator('#game-log').getByText(/Linked Scout rolled initiative:/).waitFor();
    const initiative=(await service.read()).scene.tokens.find(t=>t.id===token.id).initiative;
    assert(initiative>=4 && initiative<=23);
    assert.equal(await playerInitiative.locator('input').first().inputValue(),String(initiative));
    assert.equal(await initiativeRow(player,guardian.id).locator('button').count(),1);
    assert.equal(await initiativeRow(player,guardian.id).locator('button').isVisible(),false);
    // Removing a linked character removes its turn entry and keeps the source
    // character sheet and the other participants' current turn intact.
    const activeBeforeRemoval=(await service.view(dmAccess)).scene.combat.activeId;
    await dm.locator('#campaign-tab-table').click();
    await dm.locator('#tokens-list [data-token-id="'+ranger.id+'"]').click();
    dm.once('dialog',dialog=>dialog.accept());await dm.locator('#delete-token').click();
    await dm.locator('#tokens-list [data-token-id="'+ranger.id+'"]').waitFor({state:'hidden'});
    const afterRemoval=await service.view(dmAccess);
    assert(!afterRemoval.scene.combat.order.includes(ranger.id));
    assert.equal(afterRemoval.scene.combat.activeId,activeBeforeRemoval);
    assert(await dm.evaluate(id=>JSON.parse(localStorage.getItem('vara.character-sheets.v1')).characters.some(c=>c.id===id),ranger.statblock.sourceId));
    await dm.locator('#campaign-tab-turns').click();
    await dm.locator('.initiative-section').evaluate(el=>el.scrollIntoView({block:'start'}));
    await dm.screenshot({path:path.join(output,'tabletop-initiative.png')});
    const eventChecks=await require('./events-qa.cjs')({dm,player,service,dmKey:dmAccess,playerKey,tokenId:token.id,broadcast,output,mapPoint});
    await dm.locator('#data-token').evaluate(el=>el.scrollTop=0);
    await dm.screenshot({path:path.join(output,'tabletop-dm.png')});
    await player.screenshot({path:path.join(output,'tabletop-player.png')});
    await dm.reload();await dm.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
    assert.equal(createdCount,1);
    await player.reload();await player.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
    await player.setViewportSize({width:390,height:844});
    await player.getByRole('button',{name:'Spell area',exact:true}).click();
    await player.locator('#spell-shape').selectOption('line');
    const mobile=await player.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert(mobile.scroll<=mobile.viewport+1,JSON.stringify(mobile));
    await player.locator('#mobile-tools').click();
    await player.getByRole('button',{name:'Close table controls'}).waitFor();
    await player.screenshot({path:path.join(output,'tabletop-mobile.png'),animations:'disabled'});
    await player.getByRole('button',{name:'Close table controls'}).click();
    await player.locator('#mobile-campaign').click();
    await player.locator('#campaign-tab-log').click();
    assert(await player.locator('#chat-message').isVisible());
    await player.getByRole('button',{name:'Close campaign',exact:true}).click();
    const client=[...sockets].find(s=>s.actorId===guest.id);client.socket.close({code:1012,reason:'Reconnect test'});sockets.delete(client);
    await player.locator('#game-status').filter({hasText:'Reconnecting'}).waitFor();
    await player.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
    assert.equal(createdCount,1);
    // Upload a real browser-generated PNG, then verify that the asset and a
    // downloaded backup survive refreshing the DM view.
    await player.setViewportSize({width:800,height:600});
    const image=await player.screenshot();
    await dm.locator('#data-tab-scene').click();
    await dm.locator('#map-upload').setInputFiles({name:'test-map.png',mimeType:'image/png',buffer:image});
    await dm.locator('#map-dimensions').filter({hasText:'16 × 12'}).waitFor();
    assert.notEqual((await service.read()).scene.mapAsset,'sample');
    await dm.locator('#game-settings').click();
    const downloadPromise=dm.waitForEvent('download');await dm.locator('#export-campaign').click();
    const download=await downloadPromise;const backupPath=path.join(output,'test-campaign.json');
    let downloadStatus='saved';
    try{await download.saveAs(backupPath);}catch(error){
      if(await download.failure()!=='canceled' || process.platform!=='win32' || !/sandbox/i.test(os.tmpdir()))throw error;
      // Windows application sandboxes can cancel native browser downloads. The
      // exact API payload and the application's download event are still tested.
      downloadStatus='native download canceled in Windows sandbox; export payload verified';assert(lastBackup);
      await fsp.writeFile(backupPath,JSON.stringify(lastBackup));
    }
    const backup=JSON.parse(await fsp.readFile(backupPath,'utf8'));assert.equal(backup.format,'vara-tabletop');assert.equal(backup.scene.width,800);assert(backup.mapDataUrl.startsWith('data:image/webp;base64,'));
    assert(!JSON.stringify(backup).includes('ownerHash'));
    assert(!JSON.stringify(backup).includes('PRIVATE CHARACTER NOTE'));
    const privateCopy=await dm.locator('#copy-dm-link').isVisible();assert(privateCopy);
    const privateInputs=dm.locator('#private-link');assert.equal(await privateInputs.count(),0);
    dm.once('dialog',dialog=>dialog.accept());
    await dm.locator('#import-campaign').setInputFiles(backupPath);
    await dm.locator('#toast').filter({hasText:'Campaign restored'}).waitFor();
    assert((await service.read()).scene.tokens.every(t=>!t.ownerId));
    await dm.getByRole('button',{name:'Close game settings'}).click();
    await dm.reload();await dm.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
    await dm.locator('#map-dimensions').filter({hasText:'16 × 12'}).waitFor();
    // The lobby appears before its asynchronous health check finishes. Hold the
    // response to exercise that pending state deterministically on fast machines.
    let releaseLobbyHealth;lobbyHealthHold=new Promise(resolve=>{releaseLobbyHealth=resolve;});
    const healthRequest=dm.waitForRequest(request=>new URL(request.url()).pathname==='/api/health');
    await dm.locator('#game-settings').click();await dm.locator('#leave-game').click();
    await healthRequest;
    const createTable=dm.getByRole('button',{name:'Create your table'});await createTable.waitFor();
    assert(await createTable.isDisabled());assert(await dm.locator('#join-game').isDisabled());
    releaseLobbyHealth();lobbyHealthHold=null;
    await dm.locator('#create-game:enabled').waitFor();
    assert(await createTable.isEnabled());assert(await dm.locator('#join-game').isEnabled());
    assert.deepEqual(errors,[]);
    const result={...eventChecks,roomsCreated:createdCount,independentBrowserContexts:2,guestJoin:true,ownedTokenMovement:true,hiddenTokenFiltering:true,fogBrush:true,sharedDice:true,
      privatePlayerStats:true,optionalBars:true,revocableReadOnlySharing:true,linkedCharacterRoundTrip:true,linkedMonsterStats:true,rightClickMenu:true,
      rulerUnits:['ft','m','squares'],sharedSpellAreas:['circle','cone','line','square'],mapUpload:true,campaignBackup:true,downloadStatus,campaignRestore:true,
      sidebarLinking:true,savedCharacterDiscovery:true,exactCharacterLink:true,compactSheet:true,compactSheetPrivacy:true,
      visibleAttackCards:true,attackSourceRefresh:true,attackPrivacy:true,linkedTokenSizes:true,manualInitiative:true,explicitInitiativeRoll:true,initiativeTurnPreservation:true,
      campaignTabs:true,dataSlateTabs:true,largerLeftLog:true,campaignChat:true,privateAndSharedNotes:true,
      diceAverageMonsterHP:true,editableMonsterInstances:true,zeroCapacityExtraHealth:true,gmAutomaticDamage:true,monsterOverridesSurviveRefresh:true,
      tinyQuarterPlacement:true,tinyKeyboardMovement:true,tinyBodySelection:true,
      conditionStacks:true,conditionBadgeLayout:true,customEffects:true,liveConditionSheets:true,privateSheetConditionAccess:true,conditionSaveFailures:true,zeroSpeedPlayerLock:true,gmForcedMovement:true,
      tokenConditionMarkers:true,collapsibleConditions:true,collapsiblePanels:true,referenceBorderResize:true,persistentPanelLayout:true,
      visibleTokenRemoval:true,contextTokenRemoval:true,keyboardTokenRemoval:true,tokenRemovalKeepsSource:true,
      monsterCompendiumDrag:true,characterCompendiumDrag:true,independentMonsterInstances:true,playerCompendiumPrivacy:true,combinedHealth:true,utilityAbilityScores:true,
      spellContextRemoval:true,previewContextClear:true,refresh:true,reconnect:true,returnToLobby:true,mobile,screenshots:18,pageErrors:errors};
    await fsp.writeFile(path.join(output,'browser-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }catch(error){
    console.error(error);
    for(const [i,page] of browser.contexts().flatMap(c=>c.pages()).entries()){
      await page.screenshot({path:path.join(output,`failure-${i}.png`)}).catch(()=>{});
      console.error(JSON.stringify({page:i,errors,dom:await page.evaluate(()=>({lobbyHidden:document.getElementById('lobby')?.hidden,gameHidden:document.getElementById('game')?.hidden,status:document.getElementById('game-status')?.textContent,toast:document.getElementById('toast')?.textContent,dialogs:document.querySelectorAll('dialog[open]').length})).catch(()=>null)}));
    }
    throw error;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
