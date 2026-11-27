import test from 'node:test';
import assert from 'node:assert/strict';
import {apiAddress,invitation,randomKey} from '../tabletop/web/client.mjs';

test('guest invitations and private recovery links parse separately',()=>{
  const id='0123456789abcdef',key=randomKey();
  assert.equal(key.length,64);
  assert.deepEqual(invitation(`https://example.test/tabletop/#room=${id}&server=https%3A%2F%2Fworker.test`),{id,key:null,server:'https://worker.test'});
  assert.equal(invitation(`https://example.test/tabletop/#room=${id}&key=${key}`).key,key);
  assert.deepEqual(invitation(id),{id});
  assert.throws(()=>invitation('bad invitation'));
});
test('server addresses reject credentials and unencrypted remote endpoints',()=>{
  assert.equal(apiAddress('http://127.0.0.1:8787/'),'http://127.0.0.1:8787');
  assert.equal(apiAddress('https://vara.workers.dev/'),'https://vara.workers.dev');
  assert.throws(()=>apiAddress('https://secret@example.test'));
  assert.throws(()=>apiAddress('http://remote.test'));
  assert.throws(()=>apiAddress('javascript:alert(1)'));
});
