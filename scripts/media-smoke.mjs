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
  assert.equal((await login.json()).next, 'done', 'Use an isolated password-only operator for the media smoke');
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ executablePath: process.env.TEST_CHROMIUM, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--auto-select-desktop-capture-source=Entire screen', '--enable-usermedia-screen-capturing'] });
  try {
    const ops = await browser.newContext({ storageState: await ctx.storageState(), permissions: ['microphone'] });
    const page = await ops.newPage();
    if (process.env.SMOKE_CANVAS_SCREEN === '1') {
      await page.addInitScript(() => {
        navigator.mediaDevices.getDisplayMedia = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 800;
          canvas.height = 450;
          const paint = () => canvas.getContext('2d').fillRect(0, 0, 800, 450);
          paint();
          const timer = setInterval(paint, 50);
          const stream = canvas.captureStream(20);
          stream.getVideoTracks()[0].addEventListener('ended', () => clearInterval(timer), { once: true });
          return stream;
        };
      });
    }
    await page.goto(baseURL);
    await page.getByLabel('Incident title').fill('Media smoke ' + Date.now());
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
    await page.getByRole('button', { name: 'Share screen', exact: true }).click();
    await guest.waitForFunction(() => [...document.querySelectorAll('video')].some(video =>
      video.closest('[data-lk-source="screen_share"]') && video.videoWidth > 0 && video.readyState >= 2));
    const message = 'Operator ' + Date.now();
    const reply = 'Guest ' + Date.now();
    for (const [sender, receiver, text] of [[page, guest, message], [guest, page, reply]]) {
      await sender.getByLabel('Message', { exact: true }).fill(text);
      await sender.getByRole('button', { name: 'Send', exact: true }).click();
      await receiver.getByRole('log').getByText(text, { exact: true }).waitFor();
    }
    await page.getByLabel('Message', { exact: true }).fill('Draft through refresh');
    await page.getByRole('button', { name: 'Refresh chat' }).click();
    assert.equal(await page.getByLabel('Message', { exact: true }).inputValue(), 'Draft through refresh');
    await guest.locator('video').filter({ visible: true }).first().waitFor();
    await page.getByRole('button', { name: 'Share screen', exact: true }).click();
    await guest.waitForFunction(() => !document.querySelector('[data-lk-source="screen_share"] video'));
    await page.getByRole('button', { name: 'Microphone', exact: true }).click();
    await guest.waitForFunction(() => ![...document.querySelectorAll('audio')].some(audio =>
      audio.srcObject instanceof MediaStream && audio.srcObject.getAudioTracks().some(track => track.readyState === 'live' && !track.muted)));
    await page.getByRole('button', { name: 'Leave meeting' }).click();
    await page.getByRole('button', { name: 'Join meeting' }).waitFor();
    await guest.reload();
    for (const text of [message, reply]) await guest.getByRole('log').getByText(text, { exact: true }).waitFor();
    console.log('Bidirectional chat, draft refresh, mute, stop sharing, leave and revisit passed.');
    console.log('Second Chromium context received remote camera, microphone and screen-share tracks.');
  } finally { await browser.close(); }
} finally { await ctx.dispose(); }
