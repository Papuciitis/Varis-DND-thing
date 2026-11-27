export function apiAddress(value) {
  if (!value) return '';
  const url=new URL(value);
  if (url.username || url.password || (url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) {
    throw new Error('Use an HTTPS game server, or localhost for the local preview.');
  }
  return url.origin;
}
export function randomKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
}
export function invitation(text) {
  let params;
  if (/^[a-f0-9]{16}$/.test(text.trim())) return {id:text.trim()};
  try {params=new URLSearchParams(new URL(text).hash.slice(1));} catch {throw new Error('Paste a complete invitation link or the 16-character game code.');}
  const id=params.get('room'),key=params.get('key'),server=params.get('server');
  if (!id || !/^[a-f0-9]{16}$/.test(id) || (key && !/^[a-f0-9]{64}$/.test(key))) throw new Error('This game invitation is invalid.');
  return {id,key,server:server ? apiAddress(server) : ''};
}
export class GameClient {
  constructor({onState,onStatus}) {this.onState=onState;this.onStatus=onStatus;this.api='';this.generation=0;}
  setServer(value) {this.api=apiAddress(value);}
  async request(route,{key,body,raw=false}={}) {
    if (!this.api) throw new Error('Connect a game server in Connection settings, or start the local preview.');
    let response;
    try {
      response=await fetch(this.api+route,{method:body===undefined?'GET':'POST',
        headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(key?{Authorization:'Bearer '+key}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
    } catch {throw new Error('Could not reach the game server. Reconnect to check whether your last change saved.');}
    if (!response.ok) {let problem;try {problem=await response.json();} catch {}throw new Error(problem?.error || 'The game server could not complete that action.');}
    return raw ? response : response.json();
  }
  disconnect() {
    this.generation++;clearTimeout(this.retry);clearInterval(this.heartbeat);
    if (this.socket) this.socket.close();this.socket=null;this.ready=false;
  }
  connect(id,key) {
    this.disconnect();this.id=id;this.key=key;this.attempt=0;
    const generation=this.generation;
    const open=()=>{
      if (generation!==this.generation) return;
      this.onStatus('connecting');
      const socket=new WebSocket(this.api.replace(/^http/,'ws')+`/api/rooms/${id}/socket`);
      this.socket=socket;let lastMessage=Date.now();
      socket.onopen=()=>{
        socket.send(JSON.stringify({type:'hello',key}));
        clearInterval(this.heartbeat);
        this.heartbeat=setInterval(()=>{
          if (Date.now()-lastMessage>65000) {socket.close();return;}
          if(socket.readyState===WebSocket.OPEN) socket.send('ping');
        },25000);
      };
      socket.onmessage=event=>{
        if(generation!==this.generation || socket!==this.socket)return;
        lastMessage=Date.now();if(event.data==='pong')return;
        try {
          const message=JSON.parse(event.data);
          if(message.type==='state' && message.view.id===id){
            this.ready=true;this.attempt=0;this.onStatus('ready');this.onState(message.view,message.online || []);
          }
        } catch {socket.close();}
      };
      socket.onerror=()=>{};
      socket.onclose=event=>{
        if(generation!==this.generation || socket!==this.socket)return;
        this.ready=false;clearInterval(this.heartbeat);
        if(event.code===1008){this.onStatus('blocked');return;}
        this.onStatus('offline');
        this.retry=setTimeout(open,Math.min(10000,1000*2**this.attempt++)+Math.random()*200);
      };
    };
    open();
  }
  room(route,options={}) {return this.request(`/api/rooms/${this.id}/${route}`,{key:this.key,...options});}
}
