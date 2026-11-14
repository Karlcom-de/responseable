import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const origin = 'http://127.0.0.1:3190';
const browser = await chromium.launch({
  executablePath: process.env.TEST_CHROMIUM,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--auto-select-desktop-capture-source=Entire screen', '--enable-usermedia-screen-capturing'],
});
try {
  const marker = crypto.randomUUID();
  const operator = await browser.newPage({ permissions: ['camera', 'microphone'] });
  const guest = await browser.newPage({ permissions: ['camera', 'microphone'] });
  await operator.goto(origin);
  await operator.getByRole('button', { name: 'Run the exercise' }).click();
  await operator.getByRole('button', { name: 'Invite', exact: true }).click();
  await operator.getByRole('button', { name: 'Create invite' }).click();
  await guest.goto(await operator.getByLabel('Guest link', { exact: true }).inputValue());
  await operator.keyboard.press('Escape');
  await guest.getByLabel('Display name').fill('Exercise guest');
  await guest.getByRole('button', { name: 'Join room', exact: true }).click();
  await guest.waitForURL(operator.url());
  await Promise.all([operator, guest].map(page => page.getByRole('button', { name: 'Join meeting' }).click()));
  await guest.getByText('Exercise lead', { exact: true }).last().waitFor();
  await operator.getByRole('button', { name: 'Camera', exact: true }).click();
  await operator.getByRole('button', { name: 'Microphone', exact: true }).click();
  await guest.waitForFunction(() => [...document.querySelectorAll('video')].some(video => video.videoWidth > 0 && video.readyState >= 2), null, { timeout: 20000 });
  await guest.waitForFunction(() => [...document.querySelectorAll('audio')].some(audio =>
    audio.srcObject instanceof MediaStream && audio.srcObject.getAudioTracks().some(track => !track.muted)), null, { timeout: 10000 });
  await operator.getByRole("button", { name: "Share screen", exact: true }).click();
  await guest.waitForFunction(() => [...document.querySelectorAll("[data-lk-source=screen_share] video")].some(video => video.videoWidth > 0 && video.readyState >= 2));
  for (const [sender, recipient, label] of [[operator, guest, "Operator"], [guest, operator, "Guest"]]) {
    const text = label + " in call " + marker;
    await sender.getByLabel("Message", { exact: true }).fill(text);
    await sender.getByRole("button", { name: "Send", exact: true }).click();
    await recipient.getByRole("log").getByText(text, { exact: true }).waitFor();
  }
  const endpoint = operator.url() + "/chat";
  const key = crypto.randomUUID();
  const retry = "Repeated request " + marker;
  const options = { data: retry, headers: { origin, "Idempotency-Key": key } };
  const responses = await Promise.all([operator.request.post(endpoint, options), operator.request.post(endpoint, options)]);
  assert(responses.every(response => response.status() === 204));
  const { messages } = await (await operator.request.get(endpoint)).json();
  for (const text of ["Operator in call " + marker, "Guest in call " + marker, retry]) {
    assert.equal(messages.filter(message => message.body === text).length, 1);
  }
  await operator.getByRole("button", { name: "Whiteboard view" }).click();
  const popup = operator.waitForEvent("popup");
  await operator.getByRole("link", { name: /Full-page whiteboard/ }).click();
  const board = await popup;
  await board.locator("canvas.interactive").waitFor();
  await operator.getByRole("button", { name: "Leave meeting" }).waitFor();
  await guest.waitForFunction(() => [...document.querySelectorAll("[data-lk-source=screen_share] video")].some(video => video.videoWidth > 0 && video.readyState >= 2));
  await board.close();
  await operator.getByRole("button", { name: "People" }).click();
  await operator.getByRole("button", { name: "Share screen", exact: true }).click();
  await guest.waitForFunction(() => !document.querySelector("[data-lk-source=screen_share] video"));
  assert((await fetch(origin + '/health/ready')).ok);
  console.log('Stored chat count: one row per message and repeated delivery key.');
  console.log('Kubernetes exercise delivered remote camera, microphone, native screen sharing, two-way chat and whiteboard continuity.');
} finally { await browser.close(); }
