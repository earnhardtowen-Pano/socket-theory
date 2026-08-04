import { expect, test, type Page } from '@playwright/test';
import { draft } from './helpers.js';

/**
 * Selection is the interface. If a part cannot be grabbed, nothing else in the
 * tool is reachable — the inspector stays empty and the handles never appear.
 * So this file guards the grab itself, at integer pixels, the way a hand does
 * it, and along the whole length of a curve rather than at one convenient spot.
 */

const HINT_IDLE = 'click a part to shape it';

/** What the status line says is in your hand. */
function held(page: Page) {
  return page.locator('.hint-bar span').nth(1);
}

/** A client point at fraction t along a rendered path. */
async function pointOn(page: Page, testid: string, t: number) {
  return page.evaluate(
    ([id, frac]) => {
      const path = document.querySelector(`[data-testid="${id}"]`) as SVGPathElement | null;
      if (!path) throw new Error(`no path ${id}`);
      const r = path.ownerSVGElement!.getBoundingClientRect();
      const q = path.getPointAtLength(path.getTotalLength() * (frac as number));
      // Rounded on purpose: a cursor lands on whole pixels, and the bug this
      // guards only showed up once the coordinate stopped being exact.
      return { x: Math.round(r.left + q.x), y: Math.round(r.top + q.y) };
    },
    [testid, t] as const,
  );
}

async function press(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

/** Empty sky above the car — a reliable piece of bare canvas. */
async function clearSelection(page: Page) {
  const box = (await page.getByTestId('side-view').locator('svg').boundingBox())!;
  await press(page, Math.round(box.x + box.width * 0.5), Math.round(box.y + 6));
  await expect(held(page)).toHaveText(HINT_IDLE);
}

test.describe('grabbing a part', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await draft(page);
  });

  // The endpoints are the whole point. The drawn curve has round caps; a butt
  // -capped hit target stops short of them, so the thin visible line used to
  // win the hit test at exactly the places parts meet.
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    test(`the wheel opening grabs at ${t * 100}% along its arc`, async ({ page }) => {
      await clearSelection(page);
      const q = await pointOn(page, 'feature-opening-front', t);
      await press(page, q.x, q.y);
      await expect(held(page)).toHaveText('selected: front wheel opening');
    });
  }

  test('a near miss still grabs — the target is bigger than the line', async ({ page }) => {
    await clearSelection(page);
    const q = await pointOn(page, 'feature-opening-front', 0.5);
    await press(page, q.x, q.y - 9);
    await expect(held(page)).toHaveText('selected: front wheel opening');
  });

  test('holding a feature shows its handles and no loose points', async ({ page }) => {
    const q = await pointOn(page, 'feature-opening-front', 0.5);
    await press(page, q.x, q.y);
    await expect(page.locator('.handle').first()).toBeVisible();
    await expect(page.getByTestId('side-view').locator('.ctl-pt')).toHaveCount(0);
  });

  test('a line shows its points only once it is held', async ({ page }) => {
    await clearSelection(page);
    const side = page.getByTestId('side-view');
    await expect(side.locator('.ctl-pt')).toHaveCount(0);
    const q = await pointOn(page, 'line-roof', 0.5);
    await press(page, q.x, q.y);
    await expect(held(page)).toHaveText('selected: roof');
    expect(await side.locator('.ctl-pt').count()).toBeGreaterThan(0);
  });

  test('pressing bare canvas puts it down', async ({ page }) => {
    const q = await pointOn(page, 'feature-opening-front', 0.5);
    await press(page, q.x, q.y);
    await expect(held(page)).toHaveText('selected: front wheel opening');
    await clearSelection(page);
  });
});
