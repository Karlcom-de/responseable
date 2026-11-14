import assert from 'node:assert/strict';
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
    const invite = await (await ctx.post(first + '/invites', { data: {} })).json();
    const guest = await browser.newPage({ permissions: ['microphone', 'camera'] });
    await guest.goto(baseURL + invite.href);
    await guest.getByLabel('Display name').fill('Media fixture');
    await guest.getByRole('button', { name: 'Join room' }).click();
    await guest.waitForURL(baseURL + first);
    await ops.grantPermissions(['camera', 'microphone']);
    await Promise.all([page, guest].map(client => client.getByRole('button', { name: 'Join meeting' }).click()));
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    await page.getByRole('button', { name: 'Microphone', exact: true }).click();
    await guest.waitForFunction(() => [...document.querySelectorAll('video')].some(video => video.videoWidth > 0 && video.readyState >= 2));
    await guest.waitForFunction(() => [...document.querySelectorAll('audio')].some(audio =>
      audio.srcObject instanceof MediaStream && audio.srcObject.getAudioTracks().some(track => track.readyState === 'live' && !track.muted)));
    console.log('Second Chromium context received decoded remote video and a live unmuted remote audio track.');
  } finally { await browser.close(); }
} finally { await ctx.dispose(); }
