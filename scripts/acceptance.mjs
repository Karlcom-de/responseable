import assert from 'node:assert/strict';
import { cp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { scryptSync } from 'node:crypto';
import { createServer } from 'node:http';
import { Client } from 'pg';
import { chromium } from '@playwright/test';

assert(process.env.DATABASE_URL, 'DATABASE_URL muss auf eine Testdatenbank zeigen.');
const password = 'Nur fuer isolierten ResponseAble Test';
const salt = '47c4d2d73a50a08bbd2dce7c24170707';
const base = 'http://127.0.0.1:3130';
const other = 'http://127.0.0.1:3131';
const writes = [];
let ready = true;
let callStatus = 200;
const mock = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString();
  writes.push([request.method, request.url, request.headers['x-android-key'], body && JSON.parse(body)]);
  if (request.url === '/bridge') {
    writes.at(-1)[2] = request.headers.authorization;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ status: 'accepted' }));
    return;
  }
  if (request.url === '/mock/call/outgoing') response.statusCode = callStatus;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ ok: true, result: { androidReady: ready } }));
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));

const env = {
  ...process.env, RESPONSEABLE_MODE: 'real', RESPONSEABLE_OPERATOR: 'Testleitung',
  RESPONSEABLE_PASSWORD_HASH: salt + ':' + scryptSync(password, salt, 64).toString('hex'),
  RESPONSEABLE_SECURE_COOKIE: 'false',
  ANDROID_GATEWAY_URL: `http://127.0.0.1:${mock.address().port}/mock`,
  ANDROID_GATEWAY_KEY: 'mock-only', LIVEKIT_SIP_TRUNK_ID: '',
  SMS_PROVIDER: 'android', CALL_PROVIDER: 'android',
  NOTIFICATION_WEBHOOK_URL: `http://127.0.0.1:${mock.address().port}/bridge`,
  NOTIFICATION_WEBHOOK_TOKEN: 'bridge-only',
};
await cp('.next/static', '.next/standalone/.next/static', { recursive: true });
await cp('public', '.next/standalone/public', { recursive: true });
const children = [];
let browser;
try {
  const migration = spawn(process.execPath, ['scripts/migrate.mjs'], { env, stdio: 'inherit' });
  assert.equal(await new Promise(resolve => migration.once('exit', resolve)), 0);
  async function start(origin, overrides = {}) {
    const { port } = new URL(origin);
    children.push(spawn(process.execPath, ['.next/standalone/server.js'], {
      env: { ...env, ...overrides, PORT: port, HOSTNAME: '127.0.0.1', RESPONSEABLE_PUBLIC_ORIGIN: origin }, stdio: 'inherit',
    }));
    for (let attempt = 0; ; attempt++) {
      if (await fetch(origin + '/health/ready').then(r => r.ok).catch(() => false)) break;
      assert(attempt < 60, 'Readiness fehlgeschlagen.');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.equal((await fetch(origin + '/health/live')).status, 200);
  }
  await start(base);
  await start(other);

  browser = await chromium.launch({
    executablePath: process.env.TEST_CHROMIUM,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const ops = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const visitors = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera', 'microphone'] });
  const operator = await ops.newPage();
  const guest = await visitors.newPage();
  for (const page of [operator, guest]) page.on("pageerror", error => console.error("Browser:", error.message));
  for (const context of [ops, visitors]) context.setDefaultTimeout(12000);
  await operator.goto(base);
  await operator.getByLabel('Username').fill('Testleitung');
  await operator.getByLabel('Password').fill(password);
  await operator.getByRole('button', { name: 'Sign in' }).click();
  await operator.getByLabel('Incident title').fill('Abnahme ' + Date.now());
  await operator.getByLabel('Situation summary').fill('Interne Arbeitsfläche');
  await operator.getByRole('button', { name: 'Create incident' }).click();
  await operator.getByRole('heading', { name: 'Incident command' }).waitFor();
  const main = new URL(operator.url()).pathname;
  await operator.getByLabel('New subroom').fill('Abschnitt Nord');
  await operator.getByRole('button', { name: 'Create room' }).click();
  await operator.getByRole('heading', { name: 'Abschnitt Nord' }).waitFor();
  const room = new URL(operator.url()).pathname;
  await operator.getByRole('button', { name: 'Create guest link' }).click();
  const invite = await operator.getByRole('link', { name: 'Open guest link' }).getAttribute('href');
  await guest.goto(other + invite);
  await guest.getByLabel('Display name').fill('Gast Alex');
  await guest.getByRole('button', { name: 'Join room' }).click();
  await guest.getByRole('heading', { name: 'Abschnitt Nord' }).waitFor();
  assert.equal(await guest.getByRole('button', { name: 'Create room' }).count(), 0);
  assert.equal(await guest.getByText('Interne Arbeitsfläche').count(), 0);
  assert(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await guest.getByLabel('Message').fill('Abschnitt meldet sich');
  await guest.getByRole('button', { name: 'Send' }).click();
  await guest.getByText('Abschnitt meldet sich').waitFor();
  await operator.getByText('Abschnitt meldet sich').waitFor();
  await operator.goto(other + room);
  await operator.getByText('Abschnitt meldet sich').waitFor();
  await guest.goto(other + main);
  await guest.getByRole('heading', { name: 'Page unavailable' }).waitFor();
  await guest.goto(other + room);
  assert.equal((await visitors.request.get(other + main + '/board')).status(), 404);
  assert.equal((await visitors.request.post(other + main + '/meeting', { headers: { origin: other } })).status(), 404);
  assert.equal((await visitors.request.post(other + room + '/board', { headers: { origin: 'https://example.org' } })).status(), 403);

  const documents = other + room + '/documents';
  const documentHeaders = { origin: other };
  const privateDraft = { slug: 'intern', kind: 'playbook', title: 'Interner Ablauf', body: '# Intern', visibility: 'private' };
  const publishedDraft = { slug: 'lagebild', kind: 'wiki', title: 'Lagebild', body: '# Lage', visibility: 'room' };
  for (const data of [privateDraft, publishedDraft]) {
    assert.equal((await ops.request.post(documents, { data, headers: documentHeaders })).status(), 201);
  }
  assert.equal((await ops.request.post(documents, { data: publishedDraft, headers: documentHeaders })).status(), 409);
  assert.equal((await browser.newContext().then(context => context.request.get(documents))).status(), 404);
  assert.equal((await visitors.request.get(other + main + '/documents')).status(), 404);
  assert.equal((await visitors.request.get(documents + '/intern')).status(), 404);
  assert.equal((await visitors.request.post(documents, { data: publishedDraft, headers: documentHeaders })).status(), 404);
  const guestDocs = await (await visitors.request.get(documents)).json();
  assert.equal(guestDocs.canEdit, false);
  assert.deepEqual(guestDocs.documents.map(doc => doc.slug), ['lagebild']);
  assert(!Object.hasOwn(guestDocs.documents[0], 'body'));
  const edit = { ...publishedDraft, body: '# Aktualisiert', revision: 1 };
  assert.equal((await ops.request.patch(documents + '/lagebild', { data: edit, headers: documentHeaders })).status(), 200);
  assert.equal((await ops.request.patch(documents + '/lagebild', { data: edit, headers: documentHeaders })).status(), 409);
  const edition = await (await visitors.request.get(documents + '/lagebild')).json();
  assert.equal(edition.document.body, edit.body);
  assert.equal(edition.document.revision, 2);

  await Promise.all([operator, guest].map(async page => {
    await page.getByRole('button', { name: 'Open whiteboard' }).click();
    await page.locator('canvas.interactive').waitFor();
    await page.waitForTimeout(1200);
    await page.locator(".canvas").scrollIntoViewIfNeeded();
  }));
  await Promise.all([operator, guest].map(async page => {
    const canvas = await page.locator('canvas.interactive').boundingBox();
    await page.mouse.click(canvas.x + 70, canvas.y + 160);
    await page.keyboard.press('r');
    await page.mouse.move(canvas.x + 70, canvas.y + 160);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 120, canvas.y + 200, { steps: 5 });
    await page.mouse.up();
  }));
  for (let attempt = 0; ; attempt++) {
    const board = await (await ops.request.get(base + room + '/board')).json();
    if (board.elements.length === 2) break;
    assert(attempt < 20, 'Zwei Zeichnungen wurden nicht gespeichert.');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  await guest.reload();
  const persisted = await (await visitors.request.get(other + room + '/board')).json();
  assert.equal(persisted.elements.length, 2);
  assert.deepEqual((await (await ops.request.get(base + main + '/board')).json()).elements, []);

  if (env.LIVEKIT_URL) {
    await Promise.all([operator, guest].map(page => page.getByRole('button', { name: 'Join meeting' }).click()));
    await operator.getByRole('button', { name: 'Camera' }).click();
    await guest.waitForFunction(() => [...document.querySelectorAll('video')].some(video => video.videoWidth > 0 && video.readyState >= 2));
    await guest.getByText('Testleitung', { exact: true }).waitFor();
    await guest.getByRole('button', { name: 'Leave' }).click();
    await operator.getByRole('button', { name: 'Leave' }).click();
  }

  await operator.getByLabel('International phone number').fill('+491555555555');
  await operator.getByRole('button', { name: 'Preview' }).click();
  const confirm = operator.getByRole('button', { name: 'Send SMS' });
  await confirm.waitFor();
  await operator.route('**/einsatz/**', async route => {
    const request = route.request();
    if (request.method() !== 'POST') return route.continue();
    const { pathname, search } = new URL(request.url());
    const headers = request.headers();
    const results = await Promise.all([base, other].map(origin => ops.request.post(origin + pathname + search, {
      data: request.postDataBuffer(),
      headers: { origin, 'content-type': headers['content-type'], 'next-action': headers['next-action'] },
    })));
    assert(results.every(result => result.ok()), results.map(result => result.status()).join(', '));
    await route.fulfill({ response: results[1] });
  });
  await confirm.click();
  await operator.getByText(/SMS.*Accepted/).waitFor();
  await operator.unroute('**/einsatz/**');
  assert.deepEqual(writes.map(([method, path, key]) => [method, path, key]), [
    ['GET', '/mock/health', 'mock-only'], ['POST', '/mock/sms/send', 'mock-only'],
  ]);
  assert.equal(writes[1][3].number, '+491555555555');
  assert.match(writes[1][3].text, /Abschnitt Nord\nEinladung: http:\/\/127\.0\.0\.1:3131\/einladung\//);
  await operator.goto(base + room);
  await operator.getByText(/SMS.*Accepted/).waitFor();
  ready = false;
  await operator.getByLabel('International phone number').fill('+491555555555');
  await operator.getByLabel('Action').selectOption('android');
  await operator.getByRole('button', { name: 'Preview' }).click();
  await operator.getByRole('button', { name: 'Place call' }).click();
  await operator.getByText(/Call via Android.*Rejected/).waitFor();
  assert.equal(writes.at(-1)[1], '/mock/health');
  assert.equal(writes.length, 3);

  ready = true;
  for (const [status, label] of [[200, 'Accepted'], [503, 'Unknown']]) {
    callStatus = status;
    await operator.getByLabel('International phone number').fill('+491555555556');
    await operator.getByLabel('Action').selectOption('android');
    await operator.getByRole('button', { name: 'Preview' }).click();
    await operator.getByRole('button', { name: 'Place call' }).click();
    await operator.getByText('Call via Android · +491555555556 · ' + label + ' · Android', { exact: true }).waitFor();
    assert.deepEqual(writes.slice(-2), [
      ['GET', '/mock/health', 'mock-only', ''],
      ['POST', '/mock/call/outgoing', 'mock-only', { number: '+491555555556' }],
    ]);
  }
  assert.equal(writes.length, 7);
  const database = new Client({ connectionString: env.DATABASE_URL });
  await database.connect();
  try {
    await database.query('UPDATE invitations SET expires = 0 WHERE room = $1', [room.split('/').at(-1)]);
  } finally {
    await database.end();
  }
  await guest.goto(other + invite);
  await guest.getByRole('heading', { name: 'Page unavailable' }).waitFor();
  await operator.goto(base + room);
  const beforeStop = await (await ops.request.get(base + room + '/board')).json();
  const stopped = new Promise(resolve => children[0].once('exit', resolve));
  children[0].kill('SIGKILL');
  await stopped;
  await assert.rejects(fetch(base + '/health/live'));
  await operator.goto(other + room);
  await operator.getByText('Abschnitt meldet sich').waitFor();
  assert.deepEqual(await (await ops.request.get(other + room + '/board')).json(), beforeStop);
  await operator.getByLabel('International phone number').fill('+491555555557');
  await operator.getByLabel('Action').selectOption('sms');
  await operator.getByRole('button', { name: 'Preview' }).click();
  await operator.getByRole('button', { name: 'Send SMS' }).waitFor();
  const staleDraft = new URL(operator.url()).pathname + new URL(operator.url()).search;
  await start(base, { SMS_PROVIDER: 'webhook', CALL_PROVIDER: 'webhook' });
  await operator.goto(base + staleDraft);
  await operator.getByRole('button', { name: 'Send SMS' }).click();
  await operator.getByRole('alert').filter({ hasText: 'provider configuration' }).waitFor();
  assert.equal(writes.length, 7);

  await operator.getByRole('option', { name: 'SMS · Webhook' }).waitFor({ state: 'attached' });
  await operator.getByRole('option', { name: 'Play voice alert · Webhook' }).waitFor({ state: 'attached' });
  await operator.goto(base + room);
  await operator.getByLabel('International phone number').fill('555');
  await Promise.all([
    operator.waitForResponse(response => response.request().method() === 'POST'),
    operator.getByRole('button', { name: 'Preview' }).click(),
  ]);
  await operator.waitForURL(url => url.searchParams.get('fehler') === 'alarmierung');
  assert.equal(await operator.getByRole('button', { name: 'Send SMS' }).count(), 0);
  await operator.getByLabel('International phone number').fill('+491555555557');
  await operator.getByLabel('Action').selectOption('sms');
  await operator.getByRole('button', { name: 'Preview' }).click();
  await operator.getByRole('button', { name: 'Send SMS' }).click();
  await operator.getByText(/SMS.*555557.*Accepted/).waitFor();
  const [verb, endpoint, bearer, sent] = writes.at(-1);
  assert.deepEqual([verb, endpoint, bearer, sent.capability], ['POST', '/bridge', 'Bearer bridge-only', 'sms']);
  assert.match(sent.requestId, /^[a-f0-9-]{36}$/);
  const invitationUrl = sent.text.split('Einladung: ')[1];
  await guest.goto(invitationUrl);
  await guest.getByRole('button', { name: 'Join room' }).waitFor();

  await operator.getByLabel('International phone number').fill('+491555555558');
  await operator.getByLabel('Action').selectOption('voice');
  await Promise.all([
    operator.waitForResponse(response => response.request().method() === 'POST'),
    operator.getByRole('button', { name: 'Preview' }).click(),
  ]);
  await operator.waitForURL(url => url.searchParams.get('fehler') === 'alarmierung');
  assert.equal(await operator.getByRole('button', { name: 'Send voice alert' }).count(), 0);
  await operator.getByLabel('International phone number').fill('+491555555558');
  await operator.getByLabel('Action').selectOption('voice');
  await operator.getByLabel('Voice alert message').fill('Bitte zur Einsatzstelle kommen.');
  await operator.getByRole('button', { name: 'Preview' }).click();
  await operator.getByText('Bitte zur Einsatzstelle kommen.').waitFor();
  await operator.getByRole('button', { name: 'Send voice alert' }).click();
  await operator.getByText('Play voice alert · +491555555558 · Accepted · Webhook', { exact: true }).waitFor();
  const [voiceVerb, voiceEndpoint, voiceBearer, voice] = writes.at(-1);
  assert.deepEqual([voiceVerb, voiceEndpoint, voiceBearer, voice.capability, voice.number, voice.text],
    ['POST', '/bridge', 'Bearer bridge-only', 'voice', '+491555555558', 'Bitte zur Einsatzstelle kommen.']);
  assert.equal(writes.length, 9);
  console.log('OK: zwei App-Prozesse, Login, Gasteinladung, Chat, Board, Zugriffssperren und Mock-Idempotenz und Ausfall einer Web-Instanz' + (env.LIVEKIT_URL ? ', LiveKit-Remotevideo' : ''));
} finally {
  await browser?.close();
  for (const child of children) child.kill();
  mock.close();
}
