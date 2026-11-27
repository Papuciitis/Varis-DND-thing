import {GameClient,apiAddress,randomKey,invitation} from './client.mjs';
import {MapBoard} from './board.mjs';

const $=id=>document.getElementById(id);
const element=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const SESSION_KEY='vara.tabletop.sessions.v1';
let view=null,selected=null,online=[],connected=false,pending=0,serverMode='',loadedAsset='',mapUrl=null,toastTimer,inspectorToken=null;
function read(key,fallback) {try{return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}}
function write(key,value) {try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
function sessions() {return read(SESSION_KEY,[]).filter(s=>s && /^[a-f0-9]{16}$/.test(s.id) && /^[a-f0-9]{64}$/.test(s.key) && typeof s.server==='string');}
function notify(text,error=false) {clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
function remember() {
  if(!view)return;
  const list=sessions().filter(s=>!(s.id===view.id && s.server===client.api));
  list.unshift({id:view.id,key:client.key,server:client.api,name:view.name,role:view.self.role,updatedAt:view.savedAt});
  if(!write(SESSION_KEY,list.slice(0,20)))notify('This browser cannot remember game access. Keep your private access link before leaving.',true);
}
function lobbyError(error) {$('lobby-error').textContent=error.message || String(error);$('lobby-error').hidden=false;}
function setTab(join) {
  $('create-form').hidden=join;$('join-form').hidden=!join;
  $('create-tab').setAttribute('aria-selected',String(!join));$('join-tab').setAttribute('aria-selected',String(join));
}
function saveStatus() {$('save-status').textContent=pending?'Saving changes…':connected?'All changes saved':'Changes paused until connected';}
function status(state) {
  connected=state==='ready';board.enabled=connected;
  $('game-status').textContent=connected?(serverMode==='local'?'Local preview connected':'Connected to the table'):state==='blocked'?'Access not verified. Rejoin the game.':state==='offline'?'Reconnecting…':'Connecting…';
  $('game-status-dot').className='status-dot '+(connected?'ready':'offline');
  $('connection-overlay').hidden=connected;
  $('connection-overlay').textContent=state==='blocked'?'Access could not be verified. Return to your tables and rejoin.':state==='connecting'?'Connecting to the table…':'Connection lost. Reconnecting…';
  for(const id of ['add-token','mobile-add-token','apply-grid','reveal-all','conceal-all','start-combat','next-turn','end-combat','delete-token'])$(id).disabled=!connected;
  $('token-fields').disabled=!connected || view?.self.role!=='dm';
  saveStatus();
}
const client=new GameClient({onState:receive,onStatus:status});
const board=new MapBoard($('map-canvas'),{
  onSelect:id=>selectToken(id),
  onMove:(id,x,y)=>command({type:'token.move',id,x,y}),
  onFog:(cells,reveal)=>command({type:'fog.paint',cells,reveal}),
  onError:text=>notify(text,true)
});

async function checkServer() {
  $('create-game').disabled=true;$('join-game').disabled=true;$('server-dot').className='status-dot';
  $('server-address').value=client.api;
  if(!client.api) {$('server-status').textContent='Start the local preview, or connect a game server.';$('connection-settings').open=true;return false;}
  try {
    const health=await client.request('/api/health');
    if(health.service!=='vara-tabletop')throw new Error('This address is not a Vara tabletop server.');
    serverMode=health.mode;$('server-dot').className='status-dot ready';
    $('server-status').textContent=serverMode==='local'?'Local preview · games save on this computer':'Game server connected';
    $('create-game').disabled=false;$('join-game').disabled=false;return true;
  } catch(error) {$('server-dot').className='status-dot offline';$('server-status').textContent=error.message;$('connection-settings').open=true;return false;}
}
function receive(next,presence) {
  // Ignore an old HTTP response after leaving or switching to a different room.
  if(!client.id || next.id!==client.id)return;
  if(view && next.id===view.id && next.revision<view.revision)return;
  view=next;if(presence)online=presence;
  if(!next.scene.tokens.some(t=>t.id===selected))selected=next.scene.tokens.find(t=>t.ownerId===next.self.id)?.id || next.scene.tokens[0]?.id || null;
  board.selected=selected;board.setView(next);
  $('session-title').textContent=next.name;$('session-role').textContent=next.self.role==='dm'?'DUNGEON MASTER':'PLAYER · '+next.self.name;
  $('view-label').textContent=next.self.role==='dm'?'DM view · concealed areas dimmed':'Player view';
  $('map-name').textContent=next.scene.name;
  $('map-dimensions').textContent=`${Math.ceil(next.scene.width/next.scene.gridSize)} × ${Math.ceil(next.scene.height/next.scene.gridSize)} squares`;
  $('token-count').textContent=next.scene.tokens.length;
  for(const el of document.querySelectorAll('[data-dm]'))el.hidden=next.self.role!=='dm';
  $('invite-open').hidden=next.self.role!=='dm';
  $('party-tip').textContent=next.self.role==='dm'?'Drag any token. Use the eye brushes to reveal or conceal areas.':'Drag your own tokens inside revealed areas. Your DM controls the scene.';
  $('board-hint').textContent=next.self.role==='dm'?'Select · drag · discover':'Drag your character to explore';
  if(document.activeElement!==$('grid-size'))$('grid-size').value=next.scene.gridSize;
  $('show-grid').checked=next.scene.showGrid;$('fog-enabled').checked=next.scene.fog.enabled;
  renderTokens();renderPlayers();renderInspector();renderCombat();renderLog();loadMap();
  if(client.key)remember();
}
async function enter(next,key) {
  client.disconnect();client.id=next.id;client.key=key;view=null;selected=null;loadedAsset='';
  $('lobby').hidden=true;$('game').hidden=false;
  for(const id of ['session-heading','game-settings','mobile-tools'])$(id).hidden=false;
  receive(next);board.resize();
  history.replaceState(null,'',location.pathname+location.search+'#'+new URLSearchParams({room:next.id,server:client.api}));
  $('session-storage-note').textContent=serverMode==='local'?'Local preview: games are saved on this computer. Keep the preview server running while testing.':'Game state saves on the game server. Guest access is remembered in this browser.';
  client.connect(next.id,key);
}
async function command(action) {
  if(!client.ready){notify('Wait for the table to reconnect before making changes.',true);return null;}
  pending++;saveStatus();
  try {const next=await client.room('command',{body:{...action,requestId:crypto.randomUUID()}});receive(next);return next;}
  catch(error) {notify(error.message,true);return null;}
  finally {pending--;saveStatus();}
}
function avatar(token) {const el=element('span','token-avatar '+token.kind,token.name.slice(0,1).toUpperCase());el.style.backgroundColor=token.color;return el;}
function selectToken(id) {selected=id;board.selected=id;board.draw();renderTokens();renderInspector();}
function renderTokens() {
  for(const id of ['tokens-list','mobile-tokens']){
    const rows=view.scene.tokens.map(t=>{
      const row=element('button','token-row'+(t.id===selected?' selected':'')+(t.hidden?' token-hidden':''));row.type='button';row.dataset.tokenId=t.id;
      row.setAttribute('aria-pressed',String(t.id===selected));row.append(avatar(t));
      const text=element('span','token-info');text.append(element('strong','',t.name));
      const owner=view.players.find(p=>p.id===t.ownerId)?.name;
      text.append(element('small','',t.hidden?'Hidden from players':owner?'Controlled by '+owner:t.kind==='monster'?'Creature':'DM / unassigned'));
      if(t.hp!==null){const bar=element('span','hp-mini'),fill=element('i');fill.style.width=100*t.hp/t.maxHp+'%';bar.append(fill);text.append(bar);}
      row.append(text);row.onclick=()=>selectToken(t.id);return row;
    });$(id).replaceChildren(...rows);
  }
}
function renderPlayers() {
  const all=[{id:'dm',name:'Dungeon master'},...view.players];
  $('online-count').textContent=online.length+' online';
  $('players-list').replaceChildren(...all.map(p=>{
    const row=element('div','player-row');row.append(element('i','status-dot'+(online.includes(p.id)?' ready':'')),element('span','',p.name),element('span','player-status',p.id===view.self.id?'You':online.includes(p.id)?'Here':'Away'));
    if(view.self.role==='dm' && p.id!=='dm'){
      const remove=element('button','remove-guest','×');remove.setAttribute('aria-label','Remove guest '+p.name);remove.title='Remove guest; keep their tokens';
      remove.onclick=()=>{if(confirm(`Remove ${p.name} from the guest list? Their tokens remain on the map for reassignment.`))command({type:'player.remove',id:p.id});};row.append(remove);
    }
    return row;
  }));
}
function renderInspector() {
  if(!view)return;
  const token=view.scene.tokens.find(t=>t.id===selected),dm=view.self.role==='dm';
  $('selected-name').textContent=token?.name || 'Choose a token';
  $('selected-position').textContent=token?`Column ${Math.floor(token.x/view.scene.gridSize)+1} · Row ${Math.floor(token.y/view.scene.gridSize)+1}`:'Select one on the map or in the list.';
  $('selected-avatar').textContent=token?.name.slice(0,1).toUpperCase() || 'V';$('selected-avatar').style.backgroundColor=token?.color || '#355d48';
  $('token-form').hidden=!token || !dm;
  $('player-token-note').hidden=dm || !token;
  $('player-token-note').textContent=token?(token.ownerId===view.self.id?`Your token · ${token.hp ?? '?'} / ${token.maxHp ?? '?'} HP. Drag it on the map, or focus the map and use arrow keys.`:'This token is controlled by the DM or another player.'):'';
  if(!token)return;
  const focusInside=$('token-form').contains(document.activeElement);
  if(!focusInside || inspectorToken!==token.id){
    for(const [id,value] of [['token-name',token.name],['token-hp',token.hp],['token-max-hp',token.maxHp],['token-kind',token.kind],['token-color',token.color]])$(id).value=value;
    $('token-hidden').checked=token.hidden;
  }
  const signature=view.players.map(p=>p.id+':'+p.name).join('|');
  if($('token-owner').dataset.players!==signature){
    const old=$('token-owner').value;$('token-owner').replaceChildren(new Option('DM / unassigned',''),...view.players.map(p=>new Option(p.name,p.id)));
    $('token-owner').dataset.players=signature;if(focusInside)$('token-owner').value=old;
  }
  if(!focusInside || inspectorToken!==token.id)$('token-owner').value=token.ownerId || '';
  inspectorToken=token.id;$('token-fields').disabled=!connected || !dm;
}
function renderCombat() {
  const combat=view.scene.combat;
  $('round-label').textContent=combat.active?'Round '+combat.round:'Exploring';
  $('start-combat').hidden=combat.active;$('next-turn').hidden=!combat.active;$('end-combat').hidden=!combat.active;
  const entries=combat.active?combat.order.map(id=>view.scene.tokens.find(t=>t.id===id)).filter(Boolean):[];
  $('initiative-list').replaceChildren(...(entries.length?entries.map(t=>{const el=element('div','initiative-token'+(t.id===combat.activeId?' active':''));el.append(avatar(t),element('span','',t.name));if(t.id===combat.activeId)el.append(element('span','','Current'));return el;}):[element('p','empty-note','Track turns here when an encounter begins.')]));
}
function renderLog() {
  const signature=view.log.at(-1)?.id || '';if($('game-log').dataset.last===signature)return;$('game-log').dataset.last=signature;
  $('game-log').replaceChildren(...view.log.slice(-15).reverse().map(entry=>{
    const el=element('div','log-entry');
    if(entry.kind==='roll'){const heading=element('div','roll-heading');heading.append(element('strong','',entry.name+' · '+entry.formula),element('span','roll-total',entry.total));el.append(heading,element('div','roll-detail','['+entry.rolls.join(', ')+']'+(entry.modifier?' '+(entry.modifier>0?'+':'')+entry.modifier:'')));}
    else el.textContent=entry.text;return el;
  }));
}
async function loadMap() {
  const asset=view.scene.mapAsset;if(asset===loadedAsset)return;loadedAsset=asset;
  try {
    let url='watchtower.svg';
    if(asset!=='sample'){const response=await client.room('assets/'+asset,{raw:true});url=URL.createObjectURL(await response.blob());}
    if(loadedAsset!==asset){if(url.startsWith('blob:'))URL.revokeObjectURL(url);return;}
    if(mapUrl)URL.revokeObjectURL(mapUrl);mapUrl=url.startsWith('blob:')?url:null;board.setImage(url);
  } catch(error) {loadedAsset='';notify(error.message,true);}
}
function gameLink(privateAccess=false) {
  const url=new URL(location.href);url.hash=new URLSearchParams({room:view.id,server:client.api,...(privateAccess?{key:client.key}:{})});return url.href;
}
async function copyLink(text,input) {
  try {await navigator.clipboard.writeText(text);notify('Link copied.');}
  catch {input.value=text;input.hidden=false;input.focus();input.select();notify('Select and copy the link from the field.');}
}
function savedTables() {
  const records=sessions();$('saved-section').hidden=!records.length;
  $('saved-games').replaceChildren(...records.map(record=>{
    const button=element('button','saved-table'),text=element('span');text.append(element('strong','',record.name || 'Saved game'),element('small','',record.role==='dm'?'Dungeon master · Resume your game':'Player · Rejoin the party'));button.append(text);
    button.onclick=async()=>{try {client.setServer(record.server);if(await checkServer())await enter(await client.request(`/api/rooms/${record.id}/view`,{key:record.key}),record.key);}catch(error){lobbyError(error);}};return button;
  }));
}
async function lobbyAction(callback) {
  $('lobby-error').hidden=true;const name=$('nickname').value.trim();
  if(!name){$('nickname').reportValidity();return;}
  $('create-game').disabled=true;$('join-game').disabled=true;write('vara.tabletop.nickname',name);
  try {await callback(name);}catch(error){lobbyError(error);}
  finally {if(!view){$('create-game').disabled=false;$('join-game').disabled=false;}}
}
$('create-tab').onclick=()=>setTab(false);$('join-tab').onclick=()=>setTab(true);
$('connect-server').onclick=async()=>{try{client.setServer($('server-address').value);if(await checkServer())write('vara.tabletop.server',client.api);}catch(error){lobbyError(error);}};
$('create-form').onsubmit=event=>{event.preventDefault();lobbyAction(async name=>{const created=await client.request('/api/rooms',{body:{name:$('new-game-name').value,ownerName:name}});await enter(created.view,created.key);});};
$('join-form').onsubmit=event=>{event.preventDefault();lobbyAction(async name=>{
  const link=invitation($('join-code').value);if(link.server && link.server!==client.api){client.setServer(link.server);if(!await checkServer())return;}
  const saved=sessions().find(s=>s.id===link.id && s.server===client.api),key=link.key || saved?.key || randomKey();
  const next=link.key?await client.request(`/api/rooms/${link.id}/view`,{key}):await client.request(`/api/rooms/${link.id}/join`,{body:{key,name}});
  await enter(next,key);
});};
$('token-form').onsubmit=async event=>{event.preventDefault();await command({type:'token.update',id:selected,name:$('token-name').value,hp:Number($('token-hp').value),maxHp:Number($('token-max-hp').value),kind:$('token-kind').value,color:$('token-color').value,ownerId:$('token-owner').value || null,hidden:$('token-hidden').checked});};
$('delete-token').onclick=async()=>{if(selected && confirm('Remove this token from the scene?'))await command({type:'token.delete',id:selected});};
for(const id of ['add-token','mobile-add-token'])$(id).onclick=()=>$('add-dialog').showModal();
$('new-token-form').onsubmit=async event=>{event.preventDefault();const id=crypto.randomUUID(),kind=$('new-token-kind').value,hp=Number($('new-token-hp').value),s=view.scene;
  const token={id,name:$('new-token-name').value,kind,maxHp:hp,hp,color:kind==='monster'?'#a35450':'#337c89',x:Math.min(325,s.width-25),y:Math.min(525,s.height-25)};
  if(await command({type:'token.add',token})){$('add-dialog').close();selectToken(id);}
};
for(const button of document.querySelectorAll('[data-tool]'))button.onclick=()=>{
  board.tool=button.dataset.tool;board.measure=null;
  for(const el of document.querySelectorAll('[data-tool]')){el.classList.toggle('active',el===button);el.setAttribute('aria-pressed',String(el===button));}board.draw();
};
$('brush-size').onchange=()=>board.brush=Number($('brush-size').value);
$('zoom-in').onclick=()=>board.zoom(1.25);$('zoom-out').onclick=()=>board.zoom(.8);$('zoom-fit').onclick=()=>board.fit();
$('apply-grid').onclick=()=>command({type:'scene.grid',gridSize:Number($('grid-size').value)});
$('show-grid').onchange=()=>command({type:'scene.grid',showGrid:$('show-grid').checked});
$('fog-enabled').onchange=()=>command({type:'fog.set',enabled:$('fog-enabled').checked});
$('reveal-all').onclick=()=>command({type:'fog.all',reveal:true});$('conceal-all').onclick=()=>command({type:'fog.all',reveal:false});
$('start-combat').onclick=()=>command({type:'combat.start'});$('next-turn').onclick=()=>command({type:'combat.next'});$('end-combat').onclick=()=>command({type:'combat.end'});
$('dice-form').onsubmit=event=>{event.preventDefault();command({type:'dice.roll',formula:$('dice-formula').value});};
for(const button of document.querySelectorAll('[data-dice]'))button.onclick=()=>{ $('dice-formula').value=button.dataset.dice;command({type:'dice.roll',formula:button.dataset.dice});};
$('mobile-tools').onclick=()=>{document.body.classList.toggle('panels-open');$('mobile-tools').setAttribute('aria-expanded',String(document.body.classList.contains('panels-open')));};
$('drawer-close').onclick=()=>document.body.classList.remove('panels-open');
$('invite-open').onclick=()=>{$('invite-link').value=gameLink();$('invite-note').textContent=serverMode==='local'?'Local preview: use another browser window on this computer. Online invitations work after the game server is deployed.':'Players can reopen this invitation whenever your group meets.';$('invite-dialog').showModal();};
$('copy-invite').onclick=()=>copyLink(gameLink(),$('invite-link'));
$('game-settings').onclick=()=>{$('rename-game').value=view.name;$('settings-dialog').showModal();};
$('copy-dm-link').onclick=()=>{let input=$('private-link');if(!input){input=element('input');input.id='private-link';input.readOnly=true;input.hidden=true;input.setAttribute('aria-label','Private DM access link');$('copy-dm-link').after(input);}copyLink(gameLink(true),input);};
$('rename-form').onsubmit=async event=>{event.preventDefault();if(await command({type:'room.rename',name:$('rename-game').value}))notify('Game renamed.');};
$('leave-game').onclick=()=>{
  client.disconnect();client.id=null;client.key=null;view=null;selected=null;board.view=null;document.body.classList.remove('panels-open');
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  $('game').hidden=true;$('lobby').hidden=false;for(const id of ['session-heading','game-settings','invite-open','mobile-tools'])$(id).hidden=true;
  history.replaceState(null,'',location.pathname+location.search);setTab(false);$('lobby-error').hidden=true;savedTables();
  checkServer();
};
$('map-upload').onchange=async()=>{
  const file=$('map-upload').files[0];if(!file)return;
  const roomId=client.id,roomKey=client.key;
  pending++;saveStatus();
  try {
    if(file.size>25000000)throw new Error('Choose an image smaller than 25 MB.');
    const image=await createImageBitmap(file),factor=Math.min(1,2048/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*factor);canvas.height=Math.round(image.height*factor);
    if(canvas.width<100 || canvas.height<100){image.close();throw new Error('Choose a map at least 100 pixels wide and tall.');}
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();
    let dataUrl;for(const quality of [.85,.65,.45]){dataUrl=canvas.toDataURL('image/webp',quality);if(dataUrl.length<1500000)break;}
    if(dataUrl.length>=1500000)throw new Error('This image is too detailed for the prototype. Try a smaller copy.');
    receive(await client.request(`/api/rooms/${roomId}/map`,{key:roomKey,body:{dataUrl,width:canvas.width,height:canvas.height}}));notify('Map uploaded. Use the reveal brush to uncover areas.');
  }catch(error){notify(error.message,true);}finally{$('map-upload').value='';pending--;saveStatus();}
};
$('export-campaign').onclick=async()=>{
  try {
    const backup=await client.room('backup'),url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
    const a=element('a');a.href=url;a.download=(backup.name.replace(/[^\p{L}\p{N}-]+/gu,'_') || 'Vara')+'-campaign.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);notify('Campaign backup download started.');
  }catch(error){notify(error.message,true);}
};
$('import-campaign').onchange=async()=>{
  const file=$('import-campaign').files[0];if(!file)return;
  const roomId=client.id,roomKey=client.key;
  try {
    if(file.size>2000000)throw new Error('This backup is too large for the prototype.');
    const backup=JSON.parse(await file.text());if(!confirm('Restore this campaign? It replaces the current scene. Token ownership can be reassigned afterwards.'))return;
    receive(await client.request(`/api/rooms/${roomId}/import`,{key:roomKey,body:backup}));notify('Campaign restored. Reassign tokens to your current players.');
  }catch(error){notify(error.message,true);}finally{$('import-campaign').value='';}
};
document.addEventListener('keydown',event=>{
  if(/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || document.querySelector('dialog[open]'))return;
  const tools={v:'select',h:'pan',m:'measure',r:'reveal',c:'conceal'},tool=tools[event.key.toLowerCase()];
  const button=tool && document.querySelector(`[data-tool="${tool}"]`);if(view && button && !button.hidden)button.click();
});
window.addEventListener('online',()=>{if(view && !client.ready)client.connect(view.id,client.key);});
window.addEventListener('beforeunload',()=>client.disconnect());

async function start() {
  $('nickname').value=read('vara.tabletop.nickname','');savedTables();
  let link;try{if(location.hash.includes('room='))link=invitation(location.href);}catch(error){lobbyError(error);}
  const sameOrigin=/^https?:$/.test(location.protocol)?location.origin:'';
  client.setServer(link?.server || globalThis.VARA_TABLETOP_CONFIG?.apiBase || read('vara.tabletop.server','') || sameOrigin);
  const ready=await checkServer();
  if(link){
    setTab(true);$('join-code').value=link.id;
    const saved=sessions().find(s=>s.id===link.id && s.server===client.api),key=link.key || saved?.key;
    if(key && ready){try{await enter(await client.request(`/api/rooms/${link.id}/view`,{key}),key);}catch(error){lobbyError(error);}}
  }
}
start().catch(lobbyError);
