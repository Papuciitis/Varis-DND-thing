import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLocalServer} from '../tabletop/server/local.mjs';
import {socketServer} from './helpers/tabletop-runtime.mjs';
import worker,{TabletopRoom} from '../tabletop/server/worker.mjs';
import {MemoryStore} from '../tabletop/server/room-service.mjs';

const root=fileURLToPath(new URL('../.test-temp/',import.meta.url));
async function api(base,route,{key,body}={}) {
  return fetch(base+route,{method:body===undefined ? 'GET':'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function connect(base,id,key) {
  const ws=new WebSocket(base.replace(/^http/,'ws')+`/api/rooms/${id}/socket`),messages=[],waiters=[];
  ws.addEventListener('message',event=>{
    const message=JSON.parse(event.data);messages.push(message);
    for(const wake of waiters.splice(0))wake();
  });
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.send(JSON.stringify({type:'hello',key}));
  async function until(predicate) {
    for(let i=0;i<30;i++) {
      const found=messages.find(predicate);if(found)return found;
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Game update was not received.')),5000);
        waiters.push(()=>{clearTimeout(timer);resolve();});
      });
    }
    throw new Error('Missing game update.');
  }
  await until(m=>m.type==='state');
  return {ws,messages,until};
}

test('two real WebSocket clients receive authorized moves and persisted games reopen', {timeout:20000}, async(t)=>{
  await fs.mkdir(root,{recursive:true});const directory=await fs.mkdtemp(path.join(root,'tabletop-'));
  let app;
  try {
    app=await createLocalServer({port:0,dataDir:directory,WebSocketServer:socketServer()});
    const created=await (await api(app.url,'/api/rooms',{body:{name:'Transport test',ownerName:'DM'}})).json();
    const id=created.view.id,key=created.key,guestKey='b'.repeat(64);
    const guest=await (await api(app.url,`/api/rooms/${id}/join`,{body:{key:guestKey,name:'Player'}})).json();
    const dmSocket=await connect(app.url,id,key),guestSocket=await connect(app.url,id,guestKey);
    const own=guest.scene.tokens.find(t=>t.ownerId===guest.self.id);
    const moved=await api(app.url,`/api/rooms/${id}/command`,{key:guestKey,body:{type:'token.move',id:own.id,x:425,y:575}});
    assert.equal(moved.status,200);
    const updated=await guestSocket.until(m=>m.view.scene.tokens.some(t=>t.id===own.id && t.x===425));
    await dmSocket.until(m=>m.view.revision>=updated.view.revision);
    assert(!JSON.stringify(guestSocket.messages).includes(key));
    const forbidden=await api(app.url,`/api/rooms/${id}/backup`,{key:guestKey});
    assert.equal(forbidden.status,403);
    const secretToken=created.view.scene.tokens.find(t=>t.hidden);
    assert(!JSON.stringify(guestSocket.messages).includes(secretToken.id));
    await app.close();app=null;
    app=await createLocalServer({port:0,dataDir:directory,WebSocketServer:socketServer()});
    const restored=await (await api(app.url,`/api/rooms/${id}/view`,{key})).json();
    assert.equal(restored.scene.tokens.find(t=>t.id===own.id).x,425);
    assert.equal(restored.name,'Transport test');
  } catch (error) {
    if (error.cause?.code==='EACCES') t.skip('This host blocks loopback networking; run this transport test on an unrestricted host.');
    else throw error;
  } finally {
    if(app) await app.close();
    assert(directory.startsWith(root));await fs.rm(directory,{recursive:true,force:true});
  }
});

test('Cloudflare adapter restores stored state in a fresh object and enforces allowed origins', async()=>{
  const stores=new Map();
  const env={ALLOWED_ORIGINS:'https://example.test',ROOMS:{getByName(id){
    if(!stores.has(id))stores.set(id,new MemoryStore());
    const ctx={storage:stores.get(id),getWebSockets:()=>[],blockConcurrencyWhile:fn=>fn()};
    return new TabletopRoom(ctx,env);
  }}};
  const make=(url,method='GET',body,key,origin='https://example.test')=>new Request('https://worker.test'+url,{
    method,headers:{Origin:origin,...(key?{Authorization:'Bearer '+key}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const createResponse=await worker.fetch(make('/api/rooms','POST',{name:'Sleeping game',ownerName:'DM'}),env);
  assert.equal(createResponse.status,201);
  const created=await createResponse.json();
  assert.equal(createResponse.headers.get('Access-Control-Allow-Origin'),'https://example.test');
  const reopened=await worker.fetch(make(`/api/rooms/${created.view.id}/view`,'GET',null,created.key),env);
  assert.equal((await reopened.json()).name,'Sleeping game');
  assert.equal((await worker.fetch(make('/api/health','GET',null,null,'https://other.test'),env)).status,403);
  assert.equal((await worker.fetch(make('/_internal/create','POST',{id:'anything'}),env)).status,404);
  const noKey=await worker.fetch(make(`/api/rooms/${created.view.id}/view`),env);
  assert.equal(noKey.status,401);
  assert.equal((await worker.fetch(make('/api/health','GET',null,null,'https://worker.test'),env)).status,200);
});

test('Cloudflare hibernation restores authenticated per-player views from socket attachments',async()=>{
  const storage=new MemoryStore(),service=(await import('../tabletop/server/room-service.mjs')).RoomService;
  const initial=new service(storage),created=await initial.create('0123456789abcdef','Dormant table','DM'),guestKey='e'.repeat(64);
  const guest=await initial.join(guestKey,'Player'),messages=[];
  const ws={deserializeAttachment:()=>({key:guestKey,actorId:guest.self.id}),send:text=>messages.push(JSON.parse(text)),close:()=>{}};
  const fresh=new TabletopRoom({storage,getWebSockets:()=>[ws]},{});
  await fresh.broadcast();
  assert.equal(messages[0].view.self.role,'player');
  assert(messages[0].view.scene.tokens.every(t=>!t.hidden));
  assert(!JSON.stringify(messages).includes(created.key));
});

test('Cloudflare preview serves browser assets without exposing server endpoints',async()=>{
  const seen=[];
  const response=await worker.fetch(new Request('https://prototype.test/tabletop/'),{ASSETS:{fetch:request=>{seen.push(new URL(request.url).pathname);return new Response('preview html');}}});
  assert.equal(await response.text(),'preview html');assert.deepEqual(seen,['/tabletop/']);
});
