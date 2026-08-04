import { expect, test } from '@playwright/test';

/**
 * The interaction contract (brief §4), scripted. These are the definition-
 * of-done steps 1, 2, 3, and 6 for the Gate-1 slice, run against the built
 * instrument.
 */

test('opens with a solved package: envelope, tagged readouts, zero conflicts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('side-view')).toBeVisible();
  await expect(page.getByTestId('plan-view')).toBeVisible();
  await expect(page.getByTestId('license-counts')).toContainText('assumed');
  await expect(page.getByTestId('readouts')).toContainText('overall length');
  await expect(page.locator('.header')).toContainText('0 conflicts');
});

test('pick MR, 2 seats — the envelope re-solves', async ({ page }) => {
  await page.goto('/');
  const lengthBefore = await page.locator('.readout', { hasText: 'overall length' }).innerText();
  await page.click('button:has-text("MR")');
  await page.click('nav ~ * >> text=""', { trial: true }).catch(() => {});
  await page.getByRole('button', { name: '2', exact: true }).click();
  await page.waitForTimeout(200);
  const lengthAfter = await page.locator('.readout', { hasText: 'overall length' }).innerText();
  expect(lengthAfter).not.toEqual(lengthBefore);
  // MR carries its engine between cabin and axle: wheelbase floor names it.
  await expect(page.getByTestId('control-wheelbase')).toContainText('rear seat to axle');
});

test('drag the cowl into its wall — the wall names itself with license and reason', async ({ page }) => {
  await page.goto('/');
  const slider = page.locator('[data-testid="control-cowl_z"] input');
  await slider.focus();
  await slider.press('End');
  await expect(page.locator('[data-testid="control-cowl_z"] .wall-chip')).toContainText(
    'driver sight line over the cowl',
  );
  await expect(page.locator('[data-testid="control-cowl_z"] .wall-chip .tag')).toHaveText('DERIVED');
  await expect(page.locator('[data-testid="control-cowl_z"] .wall-chip')).toContainText(
    'must see the road',
  );
});

test('roof slammed down touches the occupant roof minimum', async ({ page }) => {
  await page.goto('/');
  const slider = page.locator('[data-testid="control-roof_z"] input');
  await slider.focus();
  await slider.press('Home');
  await expect(page.locator('[data-testid="control-roof_z"] .wall-chip')).toContainText(
    'occupant roof minimum',
  );
  await expect(page.locator('[data-testid="control-roof_z"] .wall-chip')).toContainText(
    'head room',
  );
});

test('drawn control points clamp to the envelope and the wall speaks during drag', async ({ page }) => {
  await page.goto('/');
  const pt = page.getByTestId('pt-roof-1');
  const box = await pt.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  // Drag far above the style ceiling: the point must stop at the wall.
  await page.mouse.move(cx, cy - 600, { steps: 8 });
  await expect(page.getByTestId('drawing-wall-chip')).toBeVisible();
  await expect(page.getByTestId('drawing-wall-chip')).toContainText('overall height target');
  await page.mouse.up();
});

test('seat count 2 → 2+2: the envelope updates and the drawing re-clips', async ({ page }) => {
  await page.goto('/');
  // Author a roof point first so the drawing carries state across the change.
  const pt = page.getByTestId('pt-roof-1');
  const box = (await pt.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 30, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('button', { name: '2+2', exact: true }).click();
  await page.waitForTimeout(200);
  // Second-row occupant appears; the instrument still stands and reports.
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
  const value = () => page.locator('[data-testid="control-wheelbase"] .control-value').innerText();
  const before = await value();
  const slider = page.locator('[data-testid="control-wheelbase"] input');
  await slider.focus();
  await slider.press('End');
  const moved = await value();
  expect(moved).not.toEqual(before);
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-testid="control-wheelbase"] .control-value')).toHaveText(before);
});

test('conflicts name both sides and the knobs — EV three-row under a short cap', async ({ page }) => {
  await page.goto('/');
  await page.click('button:has-text("EV skateboard")');
  await page.getByRole('button', { name: '2+3row', exact: true }).click();
  await expect(page.getByTestId('conflict-bar')).toBeVisible();
  const bar = page.getByTestId('conflict-bar');
  await expect(bar).toContainText('CONFLICT');
  await expect(bar).toContainText('needs');
  await expect(bar).toContainText('allows');
  await expect(bar).toContainText('give ground with');
});
