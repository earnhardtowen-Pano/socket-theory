import { expect, test } from '@playwright/test';
import { openFold } from './helpers.js';

/**
 * The blockers, driven the way a hand drives them.
 *
 * The reducer tests in app/test/blockers.test.ts cover the state; these cover
 * the two things only a real browser can show — that typing a four-digit
 * number into a field puts that number in, and that undo does not take the
 * layout with it.
 */

test('you can type an exact value', async ({ page }) => {
  await page.goto('/');
  await openFold(page, 'stance');
  const row = page.locator('[data-testid="scrub-wheelbase"] .scrub-row');
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;

  // Press and release without moving: that is a click, and a click means
  // "let me type it".
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const field = page.locator('[data-testid="scrub-wheelbase"] .scrub-input');
  await field.waitFor();

  // One character at a time, slowly, because the defect was a re-render
  // between keystrokes re-selecting the whole field so only the last one
  // survived. Typing 2800 used to commit 0 and clamp to the lower wall.
  await page.keyboard.press('ControlOrMeta+a');
  for (const ch of '2800') {
    await page.keyboard.type(ch);
    await page.waitForTimeout(60);
  }
  await expect(field).toHaveValue('2800');
  await field.press('Enter');
  await expect(page.locator('[data-testid="scrub-wheelbase"] .scrub-value')).toContainText('2800');
});

test('clearing the field cancels the edit rather than committing zero', async ({ page }) => {
  await page.goto('/');
  await openFold(page, 'stance');
  const row = page.locator('[data-testid="scrub-wheelbase"] .scrub-row');
  await row.scrollIntoViewIfNeeded();
  const before = await page.locator('[data-testid="scrub-wheelbase"] .scrub-value').innerText();
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const field = page.locator('[data-testid="scrub-wheelbase"] .scrub-input');
  await field.waitFor();
  await field.fill('');
  await field.press('Enter');
  await expect(page.locator('[data-testid="scrub-wheelbase"] .scrub-value')).toHaveText(before);
});

test('undo while a part is held keeps the rail on screen', async ({ page }) => {
  await page.goto('/');
  await openFold(page, 'parts');
  await page.getByTestId('add-wing').click();
  // Adding a part selects it, so the rail is showing the inspector.
  await expect(page.getByTestId('inspector')).toBeVisible();
  const wide = (await page.getByTestId('side-view').boundingBox())!.width;

  await page.getByTestId('toolbar-undo').click();

  // The rail must still exist and the stage must not have collapsed. Before
  // the fix the whole left column left the DOM and the app crushed into a
  // ~300px strip with no error.
  await expect(page.getByTestId('inspector')).toBeVisible();
  await expect(page.getByTestId('package-rail')).toBeVisible();
  const after = (await page.getByTestId('side-view').boundingBox())!.width;
  expect(after).toBeGreaterThan(wide * 0.8);
});
