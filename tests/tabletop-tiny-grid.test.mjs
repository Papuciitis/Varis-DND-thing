import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomService,MemoryStore} from '../tabletop/server/room-service.mjs';
import {monsterStats} from '../tabletop/web/resources.mjs';
import {MapBoard} from '../tabletop/web/board.mjs';
import {Slates} from '../tabletop/web/slates.mjs';

const tiny=()=>monsterStats({name:'Scorpion',details:{hp:3,size:'Tiny',ac:11}});
const quarters=[{x:312.5,y:512.5},{x:337.5,y:512.5},{x:312.5,y:537.5},{x:337.5,y:537.5}];
async function fixture(){
  const storage=new MemoryStore(),service=new RoomService(storage);
  const dm=await service.create('0123456789abcdef','Tiny grid','DM'),key='a'.repeat(64);
  const player=await service.join(key,'Scout');
  return {storage,service,dm,key,player};
}

test('four Tiny tokens occupy distinct quarters on placement and movement, including after reload and backup',async()=>{
  const {storage,service,dm}=await fixture();
  const ids=[];
  for(const point of quarters){
    const id=crypto.randomUUID();ids.push(id);
    const view=await service.command(dm.key,{type:'token.add',token:{...tiny(),id,kind:'monster',x:point.x-1,y:point.y-1}});
    const token=view.scene.tokens.find(t=>t.id===id);
    assert.equal(token.x,point.x);assert.equal(token.y,point.y);
    await service.command(dm.key,{type:'token.move',id,x:point.x+1,y:point.y+1});
  }
  for(const view of [await new RoomService(storage).view(dm.key),await service.importCampaign(dm.key,await service.exportCampaign(dm.key))]){
    const tokens=ids.map(id=>view.scene.tokens.find(t=>t.id===id));
    assert.deepEqual(tokens.map(({x,y})=>({x,y})),quarters);
    assert.equal(new Set(tokens.map(t=>t.x+','+t.y)).size,4);
    assert(tokens.every(t=>t.size===.5 && t.sizeCategory==='Tiny'));
  }
});

test('linking Tiny creatures and reopening older Tiny tokens aligns them inside their original grid cell',async()=>{
  const {storage,service,dm}=await fixture(),id=dm.view.scene.tokens[0].id;
  let view=await service.command(dm.key,{type:'token.update',id,...tiny()});
  assert.equal(view.scene.tokens.find(t=>t.id===id).x,337.5);
  assert.equal(view.scene.tokens.find(t=>t.id===id).y,537.5);
  const room=await service.read(),legacy=room.scene.tokens.find(t=>t.id===id);
  legacy.x=325;legacy.y=525;await storage.put('room',room);
  view=await new RoomService(storage).view(dm.key);
  assert.equal(view.scene.tokens.find(t=>t.id===id).x,337.5);
  assert.equal(view.scene.tokens.find(t=>t.id===id).y,537.5);
});

test('Tiny quarter movement still enforces player ownership and full-cell fog',async()=>{
  const {service,dm,key,player}=await fixture(),own=player.scene.tokens.find(t=>t.ownerId===player.self.id);
  await service.command(key,{type:'token.update',id:own.id,...tiny()});
  await assert.rejects(service.command(key,{type:'token.move',id:dm.view.scene.tokens[0].id,x:312.5,y:512.5}),/own/);
  await assert.rejects(service.command(key,{type:'token.move',id:own.id,x:1201,y:101}),/revealed/);
  await service.command(dm.key,{type:'fog.paint',cells:[88],reveal:true});
  await service.command(dm.key,{type:'token.move',id:own.id,x:1212.5,y:112.5});
  for(const point of [{x:1212.5,y:112.5},{x:1237.5,y:137.5}]){
    const view=await service.command(key,{type:'token.move',id:own.id,...point});
    const token=view.scene.tokens.find(t=>t.id===own.id);
    assert.equal(token.x,point.x);assert.equal(token.y,point.y);
  }
});

test('Tiny snapping scales with the map grid and stays in bounds while Small tokens keep whole-cell movement',async()=>{
  const {service,dm}=await fixture(),id=dm.view.scene.tokens[0].id;
  await service.command(dm.key,{type:'token.update',id,...tiny()});
  for(const [point,expected] of [[{x:0,y:0},{x:12.5,y:12.5}],[{x:1599,y:999},{x:1587.5,y:987.5}]]){
    const view=await service.command(dm.key,{type:'token.move',id,...point}),token=view.scene.tokens.find(t=>t.id===id);
    assert.equal(token.x,expected.x);assert.equal(token.y,expected.y);
  }
  await service.command(dm.key,{type:'scene.grid',gridSize:80});
  let view=await service.command(dm.key,{type:'token.move',id,x:81,y:81});
  assert.equal(view.scene.tokens.find(t=>t.id===id).x,100);
  await service.command(dm.key,{type:'token.update',id,size:1,sizeCategory:'Small'});
  view=await service.command(dm.key,{type:'token.move',id,x:81,y:81});
  assert.equal(view.scene.tokens.find(t=>t.id===id).x,120);
});

test('Tiny tokens stay aligned immediately when the grid changes or a smaller map replaces it',async()=>{
  const {service,dm}=await fixture(),id=dm.view.scene.tokens[0].id;
  await service.command(dm.key,{type:'token.update',id,...tiny()});
  const view=await service.command(dm.key,{type:'scene.grid',gridSize:80});
  assert.equal(view.scene.tokens.find(t=>t.id===id).x,340);
  assert.equal(view.scene.tokens.find(t=>t.id===id).y,540);
  const uploaded=await service.uploadMap(dm.key,{dataUrl:'data:image/png;base64,iVBORw0KGgo=',width:100,height:100});
  assert.equal(uploaded.scene.tokens.find(t=>t.id===id).x,60);
  assert.equal(uploaded.scene.tokens.find(t=>t.id===id).y,60);
  const edge=await service.command(dm.key,{type:'token.move',id,x:99,y:99});
  assert.equal(edge.scene.tokens.find(t=>t.id===id).x,60);
  assert.equal(edge.scene.tokens.find(t=>t.id===id).y,60);
});

test('arrow keys move Tiny tokens by half a square and Small tokens by a full square',()=>{
  const previous=globalThis.ResizeObserver,listeners=new Map(),moves=[];
  globalThis.ResizeObserver=class {observe(){}};
  try{
    const canvas={getContext:()=>({}),addEventListener:(name,callback)=>listeners.set(name,callback)};
    const board=new MapBoard(canvas,{onMove:(id,x,y)=>moves.push({id,x,y})});
    board.view={self:{role:'dm'},scene:{gridSize:50,width:1600,height:1000,tokens:[{...tiny(),id:'tiny',x:312.5,y:512.5}]}};
    board.enabled=true;board.selected='tiny';
    listeners.get('keydown')({key:'ArrowRight',preventDefault(){}});
    assert.deepEqual(moves.pop(),{id:'tiny',x:337.5,y:512.5});
    Object.assign(board.view.scene.tokens[0],{size:1,sizeCategory:'Small',x:325,y:525});
    listeners.get('keydown')({key:'ArrowDown',preventDefault(){}});
    assert.deepEqual(moves.pop(),{id:'tiny',x:325,y:575});
  }finally{if(previous===undefined)delete globalThis.ResizeObserver;else globalThis.ResizeObserver=previous;}
});

test('Tiny drag previews use quarter centres and body selection takes priority over nearby health bars',()=>{
  const tokens=quarters.map((point,index)=>({...tiny(),...point,id:'tiny-'+index,canViewStats:true,bars:[]}));
  const selected=tokens.shift();tokens.push(selected);
  const board=Object.assign(Object.create(MapBoard.prototype),{view:{scene:{gridSize:50,width:1600,height:1000,tokens}},camera:{z:1},
    selected:selected.id,point:event=>event.position,draw(){},drag:{kind:'token',id:selected.id,offsetX:0,offsetY:0}});
  board.move({position:{x:338,y:538}});
  assert.equal(board.drag.x,337.5);assert.equal(board.drag.y,537.5);
  for(const token of tokens)assert.equal(board.hit(token)?.id,token.id);
  assert.equal(board.hit({x:380,y:530})?.id,selected.id);
});

test('dragging a controllable Tiny token from the compendium preserves its requested quarter',async()=>{
  const token={...tiny(),id:'tiny-token',...quarters[0]},commands=[],errors=[];
  const view={self:{role:'player'},scene:{gridSize:50,width:1600,height:1000,tokens:[token]}};
  const slates={connected:true,getView:()=>view,command:async command=>{commands.push(command);return view;},selectToken(){},notify:message=>errors.push(message)};
  await Slates.prototype.place.call(slates,{kind:'token',id:token.id},quarters[3]);
  assert.deepEqual(errors,[]);
  assert.deepEqual(commands,[{type:'token.move',id:token.id,...quarters[3]}]);
});
