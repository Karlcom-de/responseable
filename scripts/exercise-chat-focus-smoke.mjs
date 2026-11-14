import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const origin = process.argv[2] ?? 'http://127.0.0.1:3190';
const browser = await chromium.launch({ executablePath: process.env.TEST_CHROMIUM });
const frame = page => page.frameLocator('iframe[title="Room chat messages"]');
const composer = page => frame(page).locator('textarea').first();
try {
  for (const [width, height] of [[320, 600], [390, 450], [390, 844]]) {
    const operator = await browser.newPage();
    await operator.goto(origin);
    await operator.getByRole('button', { name: 'Run the exercise' }).click();
    await operator.getByRole('button', { name: 'Invite', exact: true }).click();
    await operator.getByRole('button', { name: 'Create invite' }).click();
    const invite = await operator.getByLabel('Guest link', { exact: true }).inputValue();
    await operator.keyboard.press('Escape');
    const guest = await browser.newPage({
      viewport: { width, height },
      hasTouch: true,
    });
    await guest.goto(invite);
    await guest.getByLabel('Display name').fill('Exercise guest');
    await guest.getByRole('button', { name: 'Join room', exact: true }).click();
    const input = composer(guest);
    for (const entry of ['invite', 'reload']) {
      await input.waitFor();
      await guest.evaluate(() => new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const state = await input.evaluate(el => ({
        autofocus: el.hasAttribute('autofocus'),
        focused: el.ownerDocument.activeElement === el,
        scroll: window.parent.scrollY,
      }));
      assert.deepEqual(state, { autofocus: false, focused: false, scroll: 0 },
        `${width}x${height} ${entry}`);
      if (entry === 'invite') await guest.reload();
    }

    const focused = () => input.evaluate(el => el.ownerDocument.activeElement === el);
    for (let step = 0; step < 80 && !(await focused()); step++) {
      await guest.keyboard.press('Tab');
    }
    assert(await focused(), 'Composer is reachable by Tab');
    await input.evaluate(el => el.blur());
    await input.tap();
    assert(await focused(), 'Composer accepts a tap');
    const message = 'Focus smoke ' + crypto.randomUUID();
    await input.fill(message);
    await frame(guest).locator('button.send-button').tap();
    await frame(operator).getByText(message, { exact: true }).waitFor();
    console.log(`${width}x${height} invite, reload, focus and send passed`);
    await guest.close();
    await operator.close();
  }
} finally {
  await browser.close();
}
