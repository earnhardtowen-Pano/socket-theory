import { expect, test } from '@playwright/test';
import { draft, openFold } from './helpers.js';

/**
 * The ten-minute test (brief §4): blank to a package-true authored side view
 * you would show someone. Every step is something a person does with a mouse
 * and one keyboard key; the script only proves the path has no holes.
 */

test('blank → a rendered, package-true car worth showing', async ({ page }) => {
  const started = Date.now();
  await page.goto('/');
  await expect(page.getByTestId('marker-render')).toBeVisible();

  // 1 — say what the car is.
  await page.click('button:has-text("MR")');
  await page.getByRole('button', { name: '2', exact: true }).click();
  await expect(page.locator('.header')).toContainText('0 conflicts');

  // 2 — set the package.
  const set = async (fold: string, control: string, thousandths: string) => {
    await openFold(page, fold);
    const slider = page.locator(`[data-testid="control-${control}"] input`);
    await slider.focus();
    await slider.fill(thousandths);
    await slider.press('ArrowRight');
  };
  await set('cabin', 'h30', '150');
  await set('cabin', 'roof_z', '100');
  await set('front', 'cowl_z', '800');
  await set('stance', 'wheelbase', '400');

  // 3 — author: pull the drawn lines around.
  await draft(page);
  const drag = async (testid: string, dx: number, dy: number) => {
    const box = (await page.getByTestId(testid).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 });
    await page.mouse.up();
  };
  await drag('pt-roof-1', 30, -12);
  await drag('pt-belt-1', 0, -10);
  await drag('pt-hood-1', 0, 8);

  // 4 — nothing the hand did broke the package.
  await expect(page.locator('.header')).toContainText('0 conflicts');

  // 5 — paint it and light it.
  await page.getByTestId('mode-RENDER').click();
  await openFold(page, 'render');
  await page.click('button:has-text("steel blue")');
  const sun = (await page.getByTestId('sun-grab').boundingBox())!;
  await page.mouse.move(sun.x + sun.width / 2, sun.y + sun.height / 2);
  await page.mouse.down();
  await page.mouse.move(sun.x + sun.width / 2 - 200, sun.y + sun.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('marker-render')).toBeVisible();

  // 6 — the ledger stands, and the project saves.
  await page.keyboard.press('l');
  await expect(page.getByTestId('ledger')).toBeVisible();
  await page.keyboard.press('Escape');
  const download = page.waitForEvent('download');
  await page.getByTestId('save-project').click();
  expect((await download).suggestedFilename()).toBe('car.pkgprop.json');

  expect(Date.now() - started).toBeLessThan(10 * 60 * 1000);
});
