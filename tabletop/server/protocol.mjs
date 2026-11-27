import {LIMITS,RoomError} from '../shared/state.mjs';

export function json(value,status=200,headers={}) {
  return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
}
export function failure(error) {
  return json({error:error instanceof RoomError ? error.message : 'The game server could not complete that action.'},
    error instanceof RoomError ? error.status : 500);
}
export function accessKey(request) {
  const header=request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) throw new RoomError('A game access key is required.',401);
  return header.slice(7);
}
export async function readJSON(request,limit=8192) {
  const reader=request.body?.getReader();
  if (!reader) throw new RoomError('A request body is required.');
  const chunks=[];let size=0;
  while (true) {
    const {done,value}=await reader.read();if (done) break;
    size+=value.byteLength;
    if (size>limit) {await reader.cancel();throw new RoomError('This request is too large.',413);}
    chunks.push(value);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new RoomError('Choose valid JSON data.'); }
}
export function assetResponse(dataUrl) {
  const [header,data]=dataUrl.split(',');
  const mime=header.slice(5,-7);
  const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
  return new Response(bytes,{headers:{'Content-Type':mime,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
}
export async function roomRequest(service,request,action,onChange=()=>{}) {
  try {
    const method=request.method;
    if (method==='POST' && action==='join') {
      const input=await readJSON(request);
      const view=await service.join(input.key,input.name);await onChange();return json(view);
    }
    const key=accessKey(request);
    if (method==='GET' && action==='view') return json(await service.view(key));
    if (method==='GET' && action==='backup') return json(await service.exportCampaign(key));
    if (method==='GET' && /^assets\/[a-f0-9-]{36}$/.test(action)) return assetResponse(await service.mapAsset(key,action.slice(7)));
    if (method==='POST') {
      let view;
      if (action==='command') view=await service.command(key,await readJSON(request));
      else if (action==='map') view=await service.uploadMap(key,await readJSON(request,LIMITS.image+4096));
      else if (action==='import') view=await service.importCampaign(key,await readJSON(request,LIMITS.backup));
      else return json({error:'Game endpoint not found.'},404);
      await onChange();return json(view);
    }
    return json({error:'Game endpoint not found.'},404);
  } catch (error) { return failure(error); }
}
