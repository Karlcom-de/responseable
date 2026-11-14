import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const origin = 'http://127.0.0.1:3190';
const browser = await chromium.launch({
  executablePath: process.env.TEST_CHROMIUM,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
try {
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
  assert((await fetch(origin + '/health/ready')).ok);
  console.log('Kubernetes exercise delivered remote camera and microphone.');
} finally { await browser.close(); }
