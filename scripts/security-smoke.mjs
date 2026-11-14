import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { TOTP, Secret } from 'otpauth';

const base = process.env.SMOKE_URL || 'http://127.0.0.1:3180';
const name = process.env.SMOKE_OPERATOR;
assert(name && process.env.SMOKE_PASSWORD_FILE);
const password = (await readFile(process.env.SMOKE_PASSWORD_FILE, 'utf8')).trimEnd();
const browser = await chromium.launch({ executablePath: process.env.TEST_CHROMIUM });
try {
  const ops = await browser.newContext();
  const page = await ops.newPage();
  const post = (context, path, data = {}, origin = base) => context.request.post(base + path, { data, headers: { origin } });
  assert.equal((await post(ops, '/auth/password', { name, password }, 'https://invalid.example')).status(), 403);
  const initial = await post(ops, '/auth/password', { name, password });
  assert(initial.ok());
  assert(['done', 'enroll'].includes((await initial.json()).next), 'Use an isolated account with no factors.');
  const setup = await post(ops, '/auth/factors/totp/options');
  assert(setup.ok());
  const { secret } = await setup.json();
  const otp = new TOTP({ secret: Secret.fromBase32(secret) });
  assert.equal((await post(ops, '/auth/factors/totp/verify', { code: 'bad' })).status(), 401);
  const activationCode = otp.generate();
  const activation = await post(ops, '/auth/factors/totp/verify', { code: activationCode });
  assert(activation.ok());
  const { codes } = await activation.json();
  assert.equal(codes.length, 8);
  const partial = await browser.newContext();
  assert.equal((await (await post(partial, '/auth/password', { name, password })).json()).next, 'totp');
  assert.equal((await post(partial, '/auth/totp', { code: activationCode })).status(), 401);
  assert.equal((await post(partial, '/auth/totp', { code: 'bad' })).status(), 401);
  const nextCode = otp.generate({ timestamp: Date.now() + 30_000 });
  assert((await post(partial, '/auth/totp', { code: nextCode })).ok());
  assert.equal((await post(partial, '/auth/totp', { code: nextCode })).status(), 401);

  const cdp = await ops.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    transport: 'internal', protocol: 'ctap2', hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  } });
  await page.goto(base + '/security');
  await page.getByRole('button', { name: 'Add passkey' }).click();
  await page.getByText('Passkey added.').waitFor();
  await page.getByRole('button', { name: 'Sign out' }).click();
  const registered = page.waitForRequest(request => request.url().endsWith('/auth/passkey/verify'));
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  const signedAssertion = (await registered).postDataJSON();
  await page.getByRole('heading', { name: 'Incident overview' }).waitFor();
  assert.equal((await post(ops, '/auth/passkey/verify', signedAssertion)).status(), 401);

  await page.getByLabel('Incident title').fill('Security smoke ' + Date.now());
  await page.getByRole('button', { name: 'Create incident' }).click();
  await page.getByRole('heading', { name: 'Incident command' }).waitFor();
  const room = new URL(page.url()).pathname;
  const invites = room + '/invites';
  const created = await post(ops, invites);
  assert.equal(created.status(), 201);
  const { invite, href } = await created.json();
  const token = href.split('#')[1];
  const guest1 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest2 = await browser.newContext();
  assert((await post(guest1, '/j/preview', { token })).ok());
  assert.equal((await post(ops, '/j/redeem', { token, name: 'Operator' })).status(), 409);
  const claims = await Promise.all([guest1, guest2].map(context => post(context, '/j/redeem', { token, name: 'Guest' })));
  assert.deepEqual(claims.map(response => response.status()).sort(), [200, 404]);
  const active = claims[0].ok() ? guest1 : guest2;
  assert((await active.request.get(base + room + '/board')).ok());
  assert.equal((await ops.request.delete(base + invites + '/' + invite.id, { headers: { origin: base } })).status(), 204);
  for (const path of ['board', 'documents']) assert.equal((await active.request.get(base + room + '/' + path)).status(), 404);
  assert.equal((await post(active, room + '/meeting')).status(), 404);

  const recovery = await browser.newContext();
  assert((await post(recovery, '/auth/password', { name, password })).ok());
  assert((await post(recovery, '/auth/recovery', { code: codes[0] })).ok());
  assert.equal((await ops.request.get(base + invites)).status(), 404);
  assert((await post(partial, '/auth/password', { name, password })).ok());
  assert.equal((await post(partial, '/auth/recovery', { code: codes[0] })).status(), 401);
  console.log('Security smoke passed: TOTP, passkey, recovery, atomic invitation and revocation.');
} finally {
  await browser.close();
}
