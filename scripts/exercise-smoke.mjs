import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const origin = 'http://127.0.0.1:3190';
assert((await fetch(origin + '/health/ready')).ok);
const browser = await chromium.launch({ executablePath: process.env.TEST_CHROMIUM });
try {
  const page = await browser.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Run the exercise' }).click();
  await page.getByRole('heading', { name: 'Incident command' }).waitFor();
  const message = 'Exercise smoke ' + Date.now();
  await page.getByLabel('Message').fill(message);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByText(message, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open whiteboard' }).click();
  const canvas = page.locator('canvas.interactive');
  await canvas.scrollIntoViewIfNeeded();
  const boardUrl = page.url() + '/board';
  await page.waitForTimeout(1200);
  const { x, y } = await canvas.boundingBox();
  await page.mouse.click(x + 90, y + 160);
  await page.keyboard.press('r');
  await page.mouse.move(x + 90, y + 160);
  await page.mouse.down();
  await page.mouse.move(x + 135, y + 200, { steps: 5 });
  await page.mouse.up();
  let board;
  for (let attempt = 0; ; attempt++) {
    board = await (await page.request.get(boardUrl)).json();
    if (board.elements.length) break;
    assert(attempt < 20, 'Drawing failed to persist');
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  await page.reload();
  await page.getByText(message, { exact: true }).waitFor();
  const afterReload = await (await page.request.get(boardUrl)).json();
  assert(afterReload.elements.some(element => element.id === board.elements[0].id));
  console.log('Exercise readiness, chat and persisted drawing passed.');
} finally {
  await browser.close();
}
