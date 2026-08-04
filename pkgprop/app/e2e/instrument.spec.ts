import { expect, test } from '@playwright/test';
import { draft, machinery, openFold } from './helpers.js';

/**
 * The interaction contract (brief §4), scripted against the built instrument.
 */

test('opens on the car, painted, with every readout tagged', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('side-view')).toBeVisible();
  await expect(page.getByTestId('marker-render')).toBeVisible();
  await expect(page.getByTestId('license-counts')).toContainText('assumed');
  await expect(page.getByTestId('readouts')).toContainText('overall length');
  await expect(page.locator('.header')).toContainText('0 conflicts');
});

test('DRAFT shows the machinery: thresholds, occupants, plan view', async ({ page }) => {
  await page.goto('/');
  await draft(page);
  await expect(page.getByTestId('plan-view')).toBeVisible();
  await expect(page.getByTestId('station-ruler').first()).toBeVisible();
  await expect(page.getByTestId('marker-render')).toHaveCount(0);
});

test('pick MR, 2 seats — the envelope re-solves', async ({ page }) => {
  await page.goto('/');
  await machinery(page, 'stance');
  const before = await page.locator('.readout', { hasText: 'overall length' }).innerText();
  await page.click('button:has-text("MR")');
  await page.getByRole('button', { name: '2', exact: true }).click();
  await page.waitForTimeout(200);
  const after = await page.locator('.readout', { hasText: 'overall length' }).innerText();
  expect(after).not.toEqual(before);
  await expect(page.getByTestId('control-wheelbase')).toContainText('rear seat to axle');
});

test('drag the cowl into its wall — the wall names itself with license and reason', async ({ page }) => {
  await page.goto('/');
  await machinery(page, 'front');
  const slider = page.locator('[data-testid="control-cowl_z"] input');
  await slider.focus();
  await slider.press('End');
  const chip = page.locator('[data-testid="control-cowl_z"] .wall-chip');
  await expect(chip).toContainText('driver sight line over the cowl');
  await expect(chip.locator('.tag')).toHaveText('DERIVED');
  await expect(chip).toContainText('must see the road');
});

test('roof slammed down touches the occupant roof minimum', async ({ page }) => {
  await page.goto('/');
  await machinery(page, 'cabin');
  const slider = page.locator('[data-testid="control-roof_z"] input');
  await slider.focus();
  await slider.press('Home');
  const chip = page.locator('[data-testid="control-roof_z"] .wall-chip');
  await expect(chip).toContainText('occupant roof minimum');
  await expect(chip).toContainText('head room');
});

test('the canvas never moves while a point is being dragged', async ({ page }) => {
  await page.goto('/');
  await draft(page);
  const svg = page.locator('[data-testid="side-view"] svg').first();
  const pt = page.getByTestId('pt-roof-1');
  const box = (await pt.boundingBox())!;
  const start = (await svg.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const seen = new Set<number>();
  for (let i = 0; i < 10; i += 1) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - i * 40);
    seen.add(Math.round((await svg.boundingBox())!.y));
  }
  await page.mouse.up();
  // One value only: the wall chip is an overlay, so nothing reflows mid-drag.
  expect([...seen]).toEqual([Math.round(start.y)]);
});

test('drawn control points clamp to the envelope and the wall speaks during drag', async ({ page }) => {
  await page.goto('/');
  await draft(page);
  const pt = page.getByTestId('pt-roof-1');
  const box = (await pt.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 600, { steps: 8 });
  await expect(page.getByTestId('drawing-wall-chip')).toBeVisible();
  await expect(page.getByTestId('drawing-wall-chip')).toContainText('overall height target');
  await page.mouse.up();
});

test('double-click adds a point; alt-click removes it', async ({ page }) => {
  await page.goto('/');
  await draft(page);
  const countPts = async () => page.locator('[data-testid^="pt-belt-"]').count();
  const before = await countPts();
  const a = (await page.getByTestId('pt-belt-0').boundingBox())!;
  const b = (await page.getByTestId('pt-belt-1').boundingBox())!;
  await page.mouse.dblclick((a.x + b.x) / 2 + 4, (a.y + b.y) / 2 + 2);
  await page.waitForTimeout(150);
  expect(await countPts()).toBe(before + 1);

  const mid = (await page.getByTestId('pt-belt-1').boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.click(mid.x + mid.width / 2, mid.y + mid.height / 2);
  await page.keyboard.up('Alt');
  await page.waitForTimeout(150);
  expect(await countPts()).toBe(before);
});

test('curve tension straightens a line', async ({ page }) => {
  await page.goto('/');
  await machinery(page, 'lines');
  const row = page.getByTestId('line-row-roof');
  await expect(row).toContainText('roof');
  const slider = row.locator('input');
  await slider.fill('0');
  await slider.dispatchEvent('pointerup');
  await expect(row).toContainText('straight');
});

test('the sun moves and the render follows', async ({ page }) => {
  await page.goto('/');
  const sun = page.getByTestId('sun-grab');
  const box = (await sun.boundingBox())!;
  const bodyBefore = await page.locator('#mr-body stop').first().getAttribute('stop-color');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 260, box.y + box.height / 2 + 170, { steps: 6 });
  await page.mouse.up();
  const bodyAfter = await page.locator('#mr-body stop').first().getAttribute('stop-color');
  expect(bodyAfter).not.toEqual(bodyBefore);
});

test('paint chips repaint the car', async ({ page }) => {
  await page.goto('/');
  await openFold(page, 'render');
  const before = await page.locator('#mr-body stop').first().getAttribute('stop-color');
  await page.click('button:has-text("oxide red")');
  await page.waitForTimeout(120);
  const after = await page.locator('#mr-body stop').first().getAttribute('stop-color');
  expect(after).not.toEqual(before);
});

test('seat count 2 → 2+2: the envelope updates and the drawing re-clips', async ({ page }) => {
  await page.goto('/');
  await draft(page);
  const pt = page.getByTestId('pt-roof-1');
  const box = (await pt.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 30, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('button', { name: '2+2', exact: true }).click();
  await page.waitForTimeout(200);
  await expect(page.getByTestId('side-view')).toBeVisible();
  await expect(page.locator('.header')).toContainText(/conflict/i);
});

test('the ledger is one keystroke away; ASSUMED edits propagate live', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('side-view')).toBeVisible();
  await page.keyboard.press('l');
  await expect(page.getByTestId('ledger')).toBeVisible();
  const before = await page.locator('.readout', { hasText: 'cabin floor height' }).innerText();
  const gc = page.locator('[data-testid="ledger-structure_ground_clearance"] input');
  await gc.fill('200');
  await gc.press('Enter');
  await page.waitForTimeout(200);
  const after = await page.locator('.readout', { hasText: 'cabin floor height' }).innerText();
  expect(after).not.toEqual(before);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ledger')).not.toBeVisible();
});

test('undo restores the previous package state', async ({ page }) => {
  await page.goto('/');
  await machinery(page, 'stance');
  const value = () => page.locator('[data-testid="control-wheelbase"] .control-value').innerText();
  const before = await value();
  const slider = page.locator('[data-testid="control-wheelbase"] input');
  await slider.focus();
  await slider.press('End');
  expect(await value()).not.toEqual(before);
  await page.getByTestId('toolbar-undo').click();
  await expect(page.locator('[data-testid="control-wheelbase"] .control-value')).toHaveText(before);
});

test('conflicts name both sides and the knobs — EV three-row under a short cap', async ({ page }) => {
  await page.goto('/');
  await page.click('button:has-text("EV skateboard")');
  await page.getByRole('button', { name: '2+3row', exact: true }).click();
  const bar = page.getByTestId('conflict-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('CONFLICT');
  await expect(bar).toContainText('needs');
  await expect(bar).toContainText('allows');
  await expect(bar).toContainText('give ground with');
});
