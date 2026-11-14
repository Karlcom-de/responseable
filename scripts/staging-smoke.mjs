import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.SMOKE_URL || 'http://127.0.0.1:3180';
assert(process.env.SMOKE_OPERATOR && process.env.SMOKE_PASSWORD_FILE);
const password = (await readFile(process.env.SMOKE_PASSWORD_FILE, 'utf8')).trimEnd();
for (const probe of ['live', 'ready']) assert((await fetch(base + '/health/' + probe)).ok);
const browser = await chromium.launch({
    executablePath: process.env.TEST_CHROMIUM,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
try {
  const ops = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const visitors = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera', 'microphone'] });
  const operator = await ops.newPage();
  const guest = await visitors.newPage();
  for (const page of [operator, guest]) page.on("pageerror", error => console.error("Browser:", error.message));
  for (const context of [ops, visitors]) context.setDefaultTimeout(12000);
  await operator.goto(base);
  await operator.getByLabel('Kennung').fill(process.env.SMOKE_OPERATOR);
  await operator.getByLabel('Passwort').fill(password);
  await operator.getByRole('button', { name: 'Anmelden' }).click();
  await operator.getByLabel('Einsatzbezeichnung').fill('Staging ' + Date.now());
  await operator.getByLabel('Lagebeschreibung').fill('Interne Arbeitsfläche');
  await operator.getByRole('button', { name: 'Einsatz anlegen' }).click();
  await operator.getByRole('heading', { name: 'Einsatzleitung' }).waitFor();
  const main = new URL(operator.url()).pathname;
  await operator.getByLabel('Neuer Unterraum').fill('Abschnitt Nord');
  await operator.getByRole('button', { name: 'Raum anlegen' }).click();
  await operator.getByRole('heading', { name: 'Abschnitt Nord' }).waitFor();
  const room = new URL(operator.url()).pathname;
  await operator.getByRole('button', { name: 'Gästelink erstellen' }).click();
  const invite = await operator.getByRole('link', { name: 'Gästelink öffnen' }).getAttribute('href');
  await guest.goto(base + invite);
  await guest.getByLabel('Anzeigename').fill('Gast Alex');
  await guest.getByRole('button', { name: 'Raum beitreten' }).click();
  await guest.getByRole('heading', { name: 'Abschnitt Nord' }).waitFor();
  assert.equal(await guest.getByRole('button', { name: 'Raum anlegen' }).count(), 0);
  assert.equal(await guest.getByText('Interne Arbeitsfläche').count(), 0);
  assert(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await guest.getByLabel('Nachricht').fill('Abschnitt meldet sich');
  await guest.getByRole('button', { name: 'Senden' }).click();
  await guest.getByText('Abschnitt meldet sich').waitFor();
  await operator.getByText('Abschnitt meldet sich').waitFor();

  assert.equal((await visitors.request.get(base + main + '/board')).status(), 404);
  await operator.getByRole('button', { name: 'Lagebild öffnen' }).click();
  const canvas = operator.locator('canvas.interactive');
  await canvas.scrollIntoViewIfNeeded();
  await operator.waitForTimeout(1200);
  const { x, y } = await canvas.boundingBox();
  await operator.mouse.click(x + 90, y + 160);
  await operator.keyboard.press('r');
  await operator.mouse.move(x + 90, y + 160);
  await operator.mouse.down();
  await operator.mouse.move(x + 135, y + 200, { steps: 5 });
  await operator.mouse.up();
  for (let attempt = 0; ; attempt++) {
    const { elements } = await (await visitors.request.get(base + room + '/board')).json();
    if (elements.length) break;
    assert(attempt < 20, 'Drawing failed to persist');
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  if (process.env.SMOKE_SYNTHETIC_PROVIDERS === '1') {
    for (const [method, suffix, status, provider] of [
      ['sms', '97', 'Angenommen', 'Android'],
      ['voice', '96', 'Angenommen', 'Webhook'],
      ['voice', '98', 'Unklar', 'Webhook'],
    ]) {
      const number = '+120255501' + suffix;
      await operator.getByLabel('Internationale Rufnummer').fill(number);
      await operator.getByLabel('Aktion').selectOption(method);
      if (method === 'voice') await operator.getByLabel('Ansage für den Sprachalarm').fill('Synthetischer Staging-Test');
      await operator.getByRole('button', { name: 'Vorschau anzeigen' }).click();
      await operator.getByRole('button', { name: method === 'sms' ? 'SMS senden' : 'Sprachalarm auslösen' }).click();
      const label = method === 'sms' ? 'SMS' : 'Sprachalarm abspielen';
      await operator.getByText(`${label} · ${number} · ${status} · ${provider}`, { exact: true }).waitFor();
    }
  }
  console.log('Staging application and configured fixtures passed.');
  await Promise.all([operator, guest].map(page => page.getByRole('button', { name: 'Meeting beitreten' }).click()));
  await operator.getByRole('button', { name: 'Kamera' }).click();
  await guest.waitForFunction(() => [...document.querySelectorAll('video')].some(video => video.videoWidth > 0 && video.readyState >= 2));
  console.log('Staging smoke passed.');
} finally {
  await browser.close();
}
