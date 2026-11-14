import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { affiliate, identity, password } from './admin.mjs';

const secret = 'synthetic';
const user = identity(secret, 'grant', 'room');
assert.equal(identity(secret, 'grant', 'room'), user);
assert.notEqual(identity(secret, 'grant', 'other'), user);
assert.notEqual(identity(secret, 'other', 'room'), user);
const jid = user + '@example.invalid';
const [header, claims, signature] = password(secret, jid, 123456).split('.');
assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url')), { jid, exp: 123 });
assert.equal(signature, createHmac('sha256', secret).update(header + '.' + claims).digest('base64url'));
for (const member of [true, false]) {
  await affiliate('https://example.invalid/api', 'fixture', 'room', 'muc.example.invalid', jid, member, async (url, options) => {
    assert.equal(url, 'https://example.invalid/api/set_room_affiliation');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), {
      room: 'room', service: 'muc.example.invalid', user, host: 'example.invalid', affiliation: member ? 'member' : 'outcast',
    });
    return Response.json(0);
  });
}
console.log('Passed JWT expiry/signature, grant isolation and affiliation commands.');
