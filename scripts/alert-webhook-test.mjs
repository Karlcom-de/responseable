import assert from 'node:assert/strict';
import { alertEndpoint, deliverAlert } from '../lib/alert-webhook.mjs';

const secret = 'fixture-token-for-inert-receiver-only';
const url = alertEndpoint('https://receiver.example.invalid/on-call', secret);
assert(url);
for (const candidate of ['http://receiver.example.invalid/', 'https://user:pass@receiver.example.invalid/', 'https://receiver.example.invalid/?token=secret']) {
  assert.equal(alertEndpoint(candidate, secret), undefined);
}
assert.equal(alertEndpoint(url.href, 'short'), undefined);
const event = { type: 'incident.alert.requested', id: 'test-event', timestamp: '2026-01-01T00:00:00.000Z', incidentId: 'incident', roomId: 'room' };
assert.equal(await deliverAlert(url, secret, event, async (target, options) => {
  assert.equal(target, url);
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Authorization, 'Bearer ' + secret);
  assert.equal(options.headers['Idempotency-Key'], event.id);
  assert.deepEqual(JSON.parse(options.body), event);
  return new Response(null, { status: 202 });
}), 'accepted');
assert.equal(await deliverAlert(url, secret, event, async () => new Response(null, { status: 503 })), 'unclear');
assert.equal(await deliverAlert(url, secret, event, async () => { throw Error('connection lost'); }), 'unclear');
console.log('Alert webhook contract and inert outcomes passed');
