import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {RoomService} from './room-service.mjs';
import {secret} from '../shared/state.mjs';
import {json,failure,readJSON,roomRequest} from './protocol.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
export class FileStore {
  constructor(folder) {this.folder=folder;}
  filename(key) {return path.join(this.folder,encodeURIComponent(key)+'.json');}
  async get(key) {
    try {return JSON.parse(await fs.readFile(this.filename(key),'utf8'));}
    catch (error) {if (error.code==='ENOENT') return undefined;throw error;}
  }
  async put(key,value) {
    await fs.mkdir(this.folder,{recursive:true});
    const target=this.filename(key),temp=target+'.'+crypto.randomUUID()+'.tmp';
    await fs.writeFile(temp,JSON.stringify(value),{mode:0o600});
    await fs.rename(temp,target);
  }
  async delete(key) {await fs.unlink(this.filename(key)).catch(error=>{if(error.code!=='ENOENT') throw error;});}
}
export async function loadWebSocketServer() {
  try {return (await import('ws')).WebSocketServer;}
  catch {
    // The project's Windows launcher can also use the preinstalled preview runtime.
    if (process.env.VARA_TABLETOP_WS_MODULE) {
      const loaded=await import(pathToFileURL(process.env.VARA_TABLETOP_WS_MODULE).href);
      return loaded.WebSocketServer || loaded.wsServer || loaded.default?.wsServer;
    }
    throw new Error('Install the prototype dependencies first: cd tabletop && npm install');
  }
}
export async function createLocalServer({port=8787,host='127.0.0.1',dataDir=path.join(root,'.tabletop-data'),
  siteRoot=path.join(root,'site'),WebSocketServer}={}) {
  WebSocketServer ||= await loadWebSocketServer();
  const services=new Map(),clients=new Map();
  function room(id) {
    if (!services.has(id)) services.set(id,new RoomService(new FileStore(path.join(dataDir,id))));
    return services.get(id);
  }
  async function broadcast(id) {
    const sockets=[...(clients.get(id) || [])].filter(c=>c.key);
    const online=[...new Set(sockets.map(c=>c.actorId))];
    await Promise.all(sockets.map(async c=>{
      try {c.ws.send(JSON.stringify({type:'state',view:await room(id).view(c.key),online}));}
      catch {c.ws.close(1008,'Game access ended.');}
    }));
  }
  let serverOrigin='';
  function allowedOrigin(origin) {return !origin || origin===serverOrigin;}
  async function serve(request) {
    const url=new URL(request.url);
    if (!allowedOrigin(request.headers.get('Origin'))) return json({error:'Use the local preview address.'},403);
    if (url.pathname==='/api/health') return json({service:'vara-tabletop',version:1,mode:'local'});
    if (url.pathname==='/api/rooms' && request.method==='POST') {
      const input=await readJSON(request,4096),id=secret().slice(0,16);
      return json(await room(id).create(id,input.name,input.ownerName),201);
    }
    const match=/^\/api\/rooms\/([a-f0-9]{16})\/(.+)$/.exec(url.pathname);
    if (match) return roomRequest(room(match[1]),request,match[2],()=>broadcast(match[1]));
    if (request.method!=='GET' && request.method!=='HEAD') return json({error:'Endpoint not found.'},404);
    let filename;
    try {filename=path.resolve(siteRoot,'.'+decodeURIComponent(url.pathname));} catch {return json({error:'Invalid path.'},400);}
    if (!filename.startsWith(path.resolve(siteRoot)+path.sep) && filename!==path.resolve(siteRoot)) return json({error:'Not found.'},404);
    try {
      if ((await fs.stat(filename)).isDirectory()) filename=path.join(filename,'index.html');
      const data=await fs.readFile(filename);
      const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8',
        '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'}[path.extname(filename)] || 'application/octet-stream';
      return new Response(data,{headers:{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    } catch {return json({error:'Preview page not built. Run python build.py first.'},404);}
  }
  const server=http.createServer(async(req,res)=>{
    try {
      const request=new Request(new URL(req.url,serverOrigin),{method:req.method,headers:req.headers,
        ...(req.method!=='GET' && req.method!=='HEAD' ? {body:Readable.toWeb(req),duplex:'half'} : {})});
      const response=await serve(request);
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      const response=failure(error);res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());
    }
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:2048});
  server.on('upgrade',async(req,socket,head)=>{
    const match=/^\/api\/rooms\/([a-f0-9]{16})\/socket$/.exec(new URL(req.url,serverOrigin).pathname);
    if (!match || !allowedOrigin(req.headers.origin)) {socket.destroy();return;}
    try {await room(match[1]).read();} catch {socket.destroy();return;}
    if ((clients.get(match[1])?.size || 0)>=32) {socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>{
      const id=match[1],client={ws,key:null,actorId:null};
      if (!clients.has(id)) clients.set(id,new Set());clients.get(id).add(client);
      ws.on('message',async raw=>{
        try {
          const text=raw.toString();if (text==='ping') {ws.send('pong');return;}
          if (client.key) throw new Error('Already joined.');
          const input=JSON.parse(text);
          if (input.type!=='hello') throw new Error('Join first.');
          const view=await room(id).view(input.key);
          client.key=input.key;client.actorId=view.self.id;await broadcast(id);
        } catch {ws.close(1008,'Invalid game access.');}
      });
      ws.on('error',()=>{});
      ws.on('close',()=>{clients.get(id).delete(client);broadcast(id).catch(()=>{});});
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  serverOrigin=`http://${host}:${server.address().port}`;
  return {url:serverOrigin,server,services,async close(){
    for(const set of clients.values()) for(const c of set)c.ws.terminate();
    await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));
  }};
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const app=await createLocalServer({port:Number(process.env.PORT || 8787)});
  console.log(`Tabletop prototype: ${app.url}/tabletop/`);
  console.log('Local preview only. Saved games stay in .tabletop-data/. Press Ctrl+C to stop.');
}
