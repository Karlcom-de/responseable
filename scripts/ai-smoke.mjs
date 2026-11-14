import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { request } from '@playwright/test';

const baseURL = process.env.SMOKE_URL || 'http://localhost:3180';
const name = process.env.SMOKE_OPERATOR;
assert(name && process.env.SMOKE_PASSWORD_FILE);
const password = (await readFile(process.env.SMOKE_PASSWORD_FILE, 'utf8')).trimEnd();
const headers = { origin: baseURL };
const ctx = await request.newContext({ baseURL, extraHTTPHeaders: headers });
try {
  const login = await ctx.post('/auth/password', { data: { name, password } });
  assert.equal((await login.json()).next, 'done', 'Use an isolated password-only operator for the AI fixture smoke');
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ executablePath: process.env.TEST_CHROMIUM, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const ops = await browser.newContext({ storageState: await ctx.storageState(), permissions: ['microphone'] });
    const page = await ops.newPage();
    await page.goto(baseURL);
    await page.getByLabel('Incident title').fill('AI smoke ' + Date.now());
    await page.getByRole('button', { name: 'Create incident' }).click();
    await page.getByRole('heading', { name: 'Incident command' }).waitFor();
    const first = new URL(page.url()).pathname;
    await page.getByLabel('New subroom').fill('Other scope');
    await page.getByRole('button', { name: 'Create room' }).click();
    await page.getByRole('heading', { name: 'Other scope' }).waitFor();
    const second = new URL(page.url()).pathname;
    for (const [room, body] of [[first, '# Pump\nThe pump is blue.'], [second, '# Secret\nForbidden separate-room marker.']]) {
      assert.equal((await ctx.post(room + '/documents', { data: { slug: 'check', kind: 'playbook', title: 'Check', body, visibility: 'private' } })).status(), 201);
      assert((await ctx.post(room + '/assistant', { data: { action: 'index', slug: 'check' } })).ok());
    }
    const answer = await (await ctx.post(first + '/assistant', { data: { action: 'ask', question: 'What color is the pump?' } })).json();
    assert.match(answer.answer, /blue/);
    assert.equal(answer.citations[0].href, first + '/wissen/check');
    assert.equal(answer.citations[0].revision, 1);

    const transcript = first + '/transcript';
    assert((await ctx.post(transcript, { data: { action: 'save', notes: 'Manual note before enabling' } })).ok());
    assert((await ctx.post(transcript, { data: { action: 'enable', enabled: true } })).ok());
    const audio = await page.evaluate(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      try {
        return await new Promise(resolve => {
          const recorder = new MediaRecorder(stream);
          recorder.ondataavailable = async event => resolve({ type: event.data.type, bytes: [...new Uint8Array(await event.data.arrayBuffer())] });
          recorder.start();
          setTimeout(() => recorder.stop(), 500);
        });
      } finally { stream.getTracks().forEach(track => track.stop()); }
    });
    const multipart = { id: randomUUID(), consent: 'true', audio: { name: 'segment.webm', mimeType: audio.type, buffer: Buffer.from(audio.bytes) } };
    assert.equal((await ctx.post(transcript + '/segments', { multipart })).status(), 204);
    assert.equal((await ctx.post(transcript + '/segments', { multipart })).status(), 204);
    const captured = await (await ctx.get(transcript)).json();
    assert.equal(captured.segments.length, 1);
    assert.match(captured.segments[0].text, /fixture/i);
    assert.equal(captured.notes, 'Manual note before enabling');
    const { draft } = await (await ctx.post(transcript, { data: { action: 'draft' } })).json();
    assert.match(draft, /fixture/i);
    assert.equal((await (await ctx.get(transcript)).json()).notes, captured.notes);
    assert.equal((await ctx.delete(transcript)).status(), 204);
    assert.deepEqual((await (await ctx.get(transcript)).json()).segments, []);
    console.log('AI scope, citations, fake mic, deduplication, independent manual notes and deletion passed.');
  } finally { await browser.close(); }
} finally { await ctx.dispose(); }
