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
  let createdCount=0,lastBackup=null;
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
          if(url.pathname==='/api/health')response=json({service:'vara-tabletop',version:1,mode:'local'});
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
    await dm.locator('#invite-open').click();
    const invitation=await dm.locator('#invite-link').inputValue();
    assert(!invitation.includes('key='));
    await dm.getByRole('button',{name:'Close invitation'}).click();
    const playerContext=await browser.newContext({viewport:{width:1440,height:1000}});await attach(playerContext);
    const player=await playerContext.newPage();await player.goto(invitation);
    await player.getByLabel('Your nickname').fill('Daniels');
    await player.getByRole('button',{name:'Join the party'}).click();
    await player.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
    assert.equal(await player.getByRole('button',{name:'Reveal fog',exact:true}).isVisible(),false);
    assert.equal(await player.locator('#tokens-list').getByText('Watchtower guardian',{exact:true}).count(),0);
    const id=[...rooms.keys()][0],service=rooms.get(id),stored=await service.read();
    const guest=stored.players.find(p=>p.name==='Daniels'),token=stored.scene.tokens.find(t=>t.ownerId===guest.id);
    await dm.locator(`#tokens-list [data-token-id="${token.id}"]`).click();
    await player.locator('#map-canvas').focus();await player.keyboard.press('ArrowRight');
    await dm.locator('#selected-position').filter({hasText:'Column 6'}).waitFor();
    assert.equal((await service.read()).scene.tokens.find(t=>t.id===token.id).x,275);
    await player.locator('[data-dice="1d20"]').click();
    await dm.locator('#game-log').getByText('Daniels · 1d20',{exact:true}).waitFor();
    const guardian=stored.scene.tokens.find(t=>t.hidden);
    await dm.locator(`#tokens-list [data-token-id="${guardian.id}"]`).click();
    await dm.getByLabel('Hidden from players').uncheck();
    await dm.getByRole('button',{name:'Update token',exact:true}).click();
    assert.equal(await player.locator('#tokens-list').getByText('Watchtower guardian',{exact:true}).count(),0);
    await dm.getByRole('button',{name:'Reveal fog',exact:true}).click();
    const rect=await dm.locator('#map-canvas').boundingBox(),z=Math.min((rect.width-40)/1600,(rect.height-110)/1000);
    await dm.mouse.click(rect.x+(rect.width-1600*z)/2+1175*z,rect.y+(rect.height-1000*z)/2+10+375*z);
    await player.locator('#tokens-list').getByText('Watchtower guardian',{exact:true}).waitFor();
    const playerKey=[...sockets].find(s=>s.actorId===guest.id).key;
    assert.equal((await service.view(playerKey)).scene.tokens.find(t=>t.id===guardian.id).hp,null);
    await dm.getByRole('button',{name:'Select and move',exact:true}).click();
    await dm.locator('#start-combat').click();await dm.locator('#round-label').filter({hasText:'Round 1'}).waitFor();
    await dm.locator('#inspector').evaluate(el=>el.scrollTop=0);
    await dm.screenshot({path:path.join(output,'tabletop-dm.png')});
    await player.screenshot({path:path.join(output,'tabletop-player.png')});
    await dm.reload();await dm.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
    assert.equal(createdCount,1);
    await player.reload();await player.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
    await player.setViewportSize({width:390,height:844});
    const mobile=await player.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert(mobile.scroll<=mobile.viewport+1,JSON.stringify(mobile));
    await player.locator('#mobile-tools').click();
    await player.getByRole('button',{name:'Close table controls'}).waitFor();
    await player.screenshot({path:path.join(output,'tabletop-mobile.png')});
    await player.getByRole('button',{name:'Close table controls'}).click();
    const client=[...sockets].find(s=>s.actorId===guest.id);client.socket.close({code:1012,reason:'Reconnect test'});sockets.delete(client);
    await player.locator('#game-status').filter({hasText:'Reconnecting'}).waitFor();
    await player.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
    assert.equal(createdCount,1);
    // Upload a real browser-generated PNG, then verify that the asset and a
    // downloaded backup survive refreshing the DM view.
    await player.setViewportSize({width:800,height:600});
    const image=await player.screenshot();
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
    const privateCopy=await dm.locator('#copy-dm-link').isVisible();assert(privateCopy);
    const privateInputs=dm.locator('#private-link');assert.equal(await privateInputs.count(),0);
    dm.once('dialog',dialog=>dialog.accept());
    await dm.locator('#import-campaign').setInputFiles(backupPath);
    await dm.locator('#toast').filter({hasText:'Campaign restored'}).waitFor();
    assert((await service.read()).scene.tokens.every(t=>!t.ownerId));
    await dm.getByRole('button',{name:'Close game settings'}).click();
    await dm.reload();await dm.locator('#game-status').filter({hasText:'Local preview connected'}).waitFor();
    await dm.locator('#map-dimensions').filter({hasText:'16 × 12'}).waitFor();
    await dm.locator('#game-settings').click();await dm.locator('#leave-game').click();
    await dm.getByRole('button',{name:'Create your table'}).waitFor();assert(await dm.getByRole('button',{name:'Create your table'}).isEnabled());
    assert.deepEqual(errors,[]);
    const result={roomsCreated:createdCount,independentBrowserContexts:2,guestJoin:true,ownedTokenMovement:true,hiddenTokenFiltering:true,fogBrush:true,sharedDice:true,mapUpload:true,campaignBackup:true,downloadStatus,campaignRestore:true,refresh:true,reconnect:true,returnToLobby:true,mobile,screenshots:4,pageErrors:errors};
    await fsp.writeFile(path.join(output,'browser-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }catch(error){
    for(const [i,page] of browser.contexts().flatMap(c=>c.pages()).entries()){
      await page.screenshot({path:path.join(output,`failure-${i}.png`)}).catch(()=>{});
      console.error(JSON.stringify({page:i,errors,dom:await page.evaluate(()=>({lobbyHidden:document.getElementById('lobby')?.hidden,gameHidden:document.getElementById('game')?.hidden,status:document.getElementById('game-status')?.textContent,toast:document.getElementById('toast')?.textContent,dialogs:document.querySelectorAll('dialog[open]').length})).catch(()=>null)}));
    }
    throw error;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
