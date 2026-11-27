import {RoomService} from './room-service.mjs';
import {RoomError,secret} from '../shared/state.mjs';
import {json,failure,readJSON,roomRequest} from './protocol.mjs';

// An ordinary Durable Object class keeps this adapter importable in Node tests.
// SQLite storage is selected by new_sqlite_classes in wrangler.jsonc.
export class TabletopRoom {
  constructor(ctx,env) {
    this.ctx=ctx;this.env=env;
    this.service=new RoomService(ctx.storage);
    this.rates=new Map();
    if (ctx.setWebSocketAutoResponse && typeof WebSocketRequestResponsePair!=='undefined') {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
    }
  }
  async broadcast() {
    const sockets=this.ctx.getWebSockets();
    const online=new Set(sockets.map(ws=>ws.deserializeAttachment()?.actorId).filter(Boolean));
    await Promise.all(sockets.map(async ws=>{
      const attachment=ws.deserializeAttachment();if (!attachment?.key) return;
      try {
        const view=await this.service.view(attachment.key);
        ws.send(JSON.stringify({type:'state',view,online:[...online]}));
      } catch { try {ws.close(1008,'Game access ended.');} catch {} }
    }));
  }
  rate(key,max=30) {
    const now=Date.now(),old=this.rates.get(key);
    const entry=old && now-old.at<1000 ? old : {at:now,count:0};
    entry.count++;this.rates.set(key,entry);
    if (this.rates.size>100) for (const [id,v] of this.rates) if (now-v.at>1000) this.rates.delete(id);
    if (entry.count>max) throw new RoomError('Please slow down and try again.',429);
  }
  async fetch(request) {
    const url=new URL(request.url);
    try {
      if (url.pathname==='/_internal/limit') {
        // A small global creation cap protects the prototype's free allowance.
        return await this.ctx.blockConcurrencyWhile(async()=>{
          const date=new Date().toISOString().slice(0,10);
          const previous=await this.ctx.storage.get('creation-limit');
          const used=previous?.date===date ? previous.used : 0;
          if (used>=40) return json({error:'New-game limit reached today. Existing games still work.'},429);
          await this.ctx.storage.put('creation-limit',{date,used:used+1});return json({ok:true});
        });
      }
      if (url.pathname==='/_internal/create') {
        const input=await readJSON(request,4096);
        return json(await this.service.create(input.id,input.name,input.ownerName),201);
      }
      const match=/^\/api\/rooms\/([a-f0-9]{16})\/(.+)$/.exec(url.pathname);
      if (!match) return json({error:'Game endpoint not found.'},404);
      if (match[2]==='socket') {
        if (request.headers.get('Upgrade')?.toLowerCase()!=='websocket') return json({error:'A WebSocket connection is required.'},426);
        await this.service.read();
        if (this.ctx.getWebSockets().length>=32) return json({error:'This room has too many connections.'},429);
        const pair=new WebSocketPair(),client=pair[0],server=pair[1];
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({});
        return new Response(null,{status:101,webSocket:client});
      }
      const actor=request.headers.get('Authorization') || request.headers.get('CF-Connecting-IP') || 'guest';
      this.rate(actor);
      return await roomRequest(this.service,request,match[2],()=>this.broadcast());
    } catch (error) {return failure(error);}
  }
  async webSocketMessage(ws,message) {
    try {
      if (message==='ping') {ws.send('pong');return;}
      if (typeof message!=='string' || message.length>1024) throw new RoomError('Invalid connection message.');
      const attachment=ws.deserializeAttachment();
      if (attachment?.key) throw new RoomError('This connection is already authenticated.');
      const input=JSON.parse(message);
      if (input.type!=='hello') throw new RoomError('Join the game first.');
      const view=await this.service.view(input.key);
      ws.serializeAttachment({key:input.key,actorId:view.self.id});
      await this.broadcast();
    } catch { try {ws.close(1008,'Invalid game access.');} catch {} }
  }
  async webSocketClose(ws,code) {
    try {ws.close(code===1000 ? 1000 : 1001);} catch {}
    await this.broadcast();
  }
  async webSocketError(ws) {try {ws.close(1011,'Reconnect to the game.');} catch {} }
}

export function originAllowed(origin,env,selfOrigin='') {
  if (!origin) return true;
  if (origin===selfOrigin)return true;
  const allowed=(env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
  return allowed.includes(origin);
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/'))return env.ASSETS ? env.ASSETS.fetch(request) : json({error:'Endpoint not found.'},404);
    const origin=request.headers.get('Origin');
    if (!originAllowed(origin,env,url.origin)) return json({error:'This website is not enabled for the tabletop server.'},403);
    const headers={'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600'};
    if (origin) headers['Access-Control-Allow-Origin']=origin;
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers});
    let response;
    try {
      if (url.pathname==='/api/health') response=json({service:'vara-tabletop',version:1,mode:'cloudflare'});
      else if (url.pathname==='/api/rooms' && request.method==='POST') {
        const limit=await env.ROOMS.getByName('_creation').fetch(new Request('https://internal/_internal/limit',{method:'POST'}));
        if (!limit.ok) response=limit;
        else {
          const input=await readJSON(request,4096),id=secret().slice(0,16);
          response=await env.ROOMS.getByName(id).fetch(new Request('https://internal/_internal/create',{
            method:'POST',body:JSON.stringify({id,name:input.name,ownerName:input.ownerName})}));
        }
      } else {
        const match=/^\/api\/rooms\/([a-f0-9]{16})\//.exec(url.pathname);
        response=match ? await env.ROOMS.getByName(match[1]).fetch(request) : json({error:'Endpoint not found.'},404);
      }
    } catch (error) {response=failure(error);}
    if (response.status===101) return response;
    const outgoing=new Response(response.body,response);
    for (const [key,value] of Object.entries(headers)) outgoing.headers.set(key,value);
    return outgoing;
  }
};
