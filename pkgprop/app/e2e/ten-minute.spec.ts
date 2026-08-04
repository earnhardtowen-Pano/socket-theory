import { expect, test } from '@playwright/test';

/**
 * The ten-minute test (brief §4), scripted as the Gate-1 acceptance run:
 * a first-time user goes from blank to a recognizable, package-true
 * authored side view. Every step here is something a person does with a
 * mouse and one keyboard key; the script just proves the path has no holes.
 */

test('blank → recognizable authored side view, package-true throughout', async ({ page }) => {
  const started = Date.now();
  await page.goto('/');
  await expect(page.getByTestId('side-view')).toBeVisible();

  // 1 — choose what the car is.
  await page.click('button:has-text("MR")');
  await page.getByRole('button', { name: '2', exact: true }).click();
  await expect(page.locator('.header')).toContainText('0 conflicts');

  // 2 — set the package with the sliders.
  const set = async (control: string, thousandths: string) => {
    const slider = page.locator(`[data-testid="control-${control}"] input`);
    await slider.focus();
    await slider.fill(thousandths);
    await slider.press('ArrowRight');
  };
  await set('h30', '150');
  await set('roof_z', '100');
  await set('cowl_z', '800');
  await set('wheelbase', '400');
  await set('overall_width', '550');

  // 3 — author: pull three characteristic points.
  const drag = async (testid: string, dx: number, dy: number) => {
    const pt = page.getByTestId(testid);
    const box = (await pt.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 });
    await page.mouse.up();
  };
  await drag('pt-roof-1', 30, -12);
  await drag('pt-belt-1', 0, -10);
  await drag('pt-hood-1', 0, 8);

  // 4 — the drawn car is package-true: no conflicts were created by drawing,
  // and the instrument still reports a closed solve.
  await expect(page.locator('.header')).toContainText('0 conflicts');
  await expect(page.getByTestId('side-view')).toBeVisible();
  await expect(page.getByTestId('plan-view')).toBeVisible();

  // 5 — the ledger opens, the counts stand, and the project saves.
  await page.keyboard.press('l');
  await expect(page.getByTestId('ledger')).toBeVisible();
  await page.keyboard.press('Escape');
  const download = page.waitForEvent('download');
  await page.getByTestId('save-project').click();
  expect((await download).suggestedFilename()).toBe('car.pkgprop.json');

  expect(Date.now() - started).toBeLessThan(10 * 60 * 1000);
});
