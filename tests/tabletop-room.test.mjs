import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomService, MemoryStore} from '../tabletop/server/room-service.mjs';

async function fixture() {
  const storage = new MemoryStore();
  const service = new RoomService(storage);
  const created = await service.create('0123456789abcdef', 'The old watchtower', 'Nauris');
  const guestKey = 'a'.repeat(64);
  const guest = await service.join(guestKey, 'Scout');
  return {storage, service, created, guestKey, guest};
}

test('guest joining returns no secrets and receives an owned token', async () => {
  const {service, created, guestKey, guest} = await fixture();
  assert.equal(guest.self.role, 'player');
  assert(guest.scene.tokens.some(token => token.ownerId === guest.self.id));
  const serialized = JSON.stringify(guest);
  assert(!serialized.includes(created.key));
  assert(!serialized.includes(guestKey));
  assert(!serialized.includes('ownerHash'));
  assert.equal((await service.view(created.key)).self.role, 'dm');
});

test('a player cannot move somebody else’s token or edit the shared scene', async () => {
  const {service, created, guestKey} = await fixture();
  const dm = await service.view(created.key);
  const otherToken = dm.scene.tokens.find(token => !token.ownerId);
  await assert.rejects(service.command(guestKey, {type:'token.move', id:otherToken.id, x:325, y:525}), /own/i);
  await assert.rejects(service.command(guestKey, {type:'fog.set', enabled:false}), /DM/i);
  await assert.rejects(service.command(guestKey, {type:'token.add', name:'Cheat'}), /DM/i);
});

test('hidden monsters never reach player snapshots, including after movement', async () => {
  const {service, created, guestKey} = await fixture();
  let dm = await service.view(created.key);
  const secret = dm.scene.tokens.find(token => token.hidden);
  assert(secret);
  assert(!(await service.view(guestKey)).scene.tokens.some(token => token.id === secret.id));
  await service.command(created.key, {type:'token.move', id:secret.id, x:325, y:525});
  assert(!(await service.view(guestKey)).scene.tokens.some(token => token.id === secret.id));
  await service.command(created.key, {type:'token.update', id:secret.id, hidden:false});
  assert((await service.view(guestKey)).scene.tokens.some(token => token.id === secret.id));
});

test('players cannot enter concealed cells; DM reveal allows the move', async () => {
  const {service, created, guestKey, guest} = await fixture();
  const own = guest.scene.tokens.find(token => token.ownerId === guest.self.id);
  await assert.rejects(service.command(guestKey, {type:'token.move', id:own.id, x:1225, y:125}), /revealed/i);
  await service.command(created.key, {type:'fog.paint', cells:[88], reveal:true});
  await service.command(guestKey, {type:'token.move', id:own.id, x:1225, y:125});
  assert.equal((await service.view(guestKey)).scene.tokens.find(token => token.id === own.id).x, 1225);
});

test('saved games survive a new service instance and simultaneous moves are preserved', async () => {
  const {storage, service, created, guestKey, guest} = await fixture();
  const own = guest.scene.tokens.find(token => token.ownerId === guest.self.id);
  const other = (await service.view(created.key)).scene.tokens.find(token => !token.ownerId);
  await Promise.all([
    service.command(guestKey, {type:'token.move', id:own.id, x:325, y:525}),
    service.command(created.key, {type:'token.move', id:other.id, x:425, y:525})
  ]);
  const reopened = await new RoomService(storage).view(created.key);
  assert.equal(reopened.scene.tokens.find(token => token.id === own.id).x,325);
  assert.equal(reopened.scene.tokens.find(token => token.id === other.id).x,425);
});

test('invalid commands and imports leave the saved campaign intact', async () => {
  const {service, created, guestKey} = await fixture();
  const before = await service.view(created.key);
  const token = before.scene.tokens[0];
  await assert.rejects(service.command(created.key, {type:'token.move',id:token.id,x:NaN,y:50}), /number/i);
  await assert.rejects(service.command(created.key, {type:'fog.paint',cells:[-1,999999],reveal:true}));
  await assert.rejects(service.importCampaign(created.key, {format:'wrong',scene:{}}));
  await assert.rejects(service.exportCampaign(guestKey), /DM/i);
  assert.deepEqual(await service.view(created.key), before);
});

test('exports omit credentials and restore without replacing the current DM access', async () => {
  const {service, created, guestKey} = await fixture();
  const backup = await service.exportCampaign(created.key);
  assert.equal(backup.format,'vara-tabletop');
  assert(!JSON.stringify(backup).includes(created.key));
  assert(!JSON.stringify(backup).includes(guestKey));
  await service.importCampaign(created.key, backup);
  assert.equal((await service.view(created.key)).self.role,'dm');
  assert((await service.view(created.key)).scene.tokens.every(token => !token.ownerId));
});

test('map images are validated and inaccessible without room access', async () => {
  const {service, created, guestKey} = await fixture();
  await assert.rejects(service.uploadMap(guestKey,{dataUrl:'data:image/png;base64,YQ==',width:800,height:600}),/DM/i);
  await assert.rejects(service.uploadMap(created.key,{dataUrl:'data:image/svg+xml;base64,YQ==',width:800,height:600}),/image/i);
  const uploaded = await service.uploadMap(created.key,{dataUrl:'data:image/png;base64,iVBORw0KGgo=',width:800,height:600});
  assert(uploaded.scene.mapAsset);
  await assert.rejects(service.mapAsset('z'.repeat(64),uploaded.scene.mapAsset),/access/i);
  assert.match(await service.mapAsset(guestKey,uploaded.scene.mapAsset),/^data:image\/png/);
});

test('dice are rolled by the server and malformed expressions are rejected', async () => {
  const {service, guestKey} = await fixture();
  await service.command(guestKey,{type:'dice.roll',formula:'2d6+3'});
  const view = await service.view(guestKey);
  const roll = view.log.at(-1);
  assert.equal(roll.kind,'roll');
  assert(roll.total>=5 && roll.total<=15);
  await assert.rejects(service.command(guestKey,{type:'dice.roll',formula:'100000d20'}));
});

test('the DM can free an old guest slot without deleting their character token',async()=>{
  const {service,created,guestKey,guest}=await fixture();
  const own=guest.scene.tokens.find(t=>t.ownerId===guest.self.id);
  await assert.rejects(service.command(guestKey,{type:'player.remove',id:guest.self.id}),/DM/i);
  await service.command(created.key,{type:'player.remove',id:guest.self.id});
  const next=await service.view(created.key);
  assert(!next.players.some(p=>p.id===guest.self.id));
  assert.equal(next.scene.tokens.find(t=>t.id===own.id).ownerId,null);
  await assert.rejects(service.view(guestKey),/access/i);
});
