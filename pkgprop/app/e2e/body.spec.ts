import { expect, test, type Page } from '@playwright/test';

/**
 * The three surfaces added in the remaster: body styles, sections, and the
 * lofted body under light.
 *
 * WebGL runs on SwiftShader here, so these check that the view stands up,
 * re-lofts on a package change, and does not throw — not that the pixels are
 * pretty. What the car looks like is judged by eye on a screenshot; what a
 * test can hold is that every style closes and every panel survives them.
 */

const STYLES = ['mid-sports', 'front-gt', 'ev-crossover'] as const;

async function noErrors(page: Page): Promise<string[]> {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text());
  });
  return errs;
}

test.describe('body styles', () => {
  for (const style of STYLES) {
    test(`${style} opens a car that closes, with no conflicts`, async ({ page }) => {
      const errs = await noErrors(page);
      await page.goto('/');
      await page.getByTestId(`style-${style}`).click();
      // A preset that cannot meet its own demands is a preset that does not
      // mean anything. Every one of these is expected to solve cleanly.
      await expect(page.locator('.header')).toContainText('0 conflicts');
      await expect(page.getByTestId('readouts')).toContainText('overall length');
      expect(errs).toEqual([]);
    });
  }

  test('the three styles are actually different cars, not one car relabelled', async ({ page }) => {
    await page.goto('/');
    const lengths: number[] = [];
    const rakes: number[] = [];
    for (const style of STYLES) {
      await page.getByTestId(`style-${style}`).click();
      await page.waitForTimeout(200);
      const text = await page.getByTestId('readouts').innerText();
      lengths.push(Number(/overall length\s*\n?\s*([\d.]+)/.exec(text)?.[1] ?? 0));
      rakes.push(Number(/windshield rake as placed\s*\n?\s*([\d.]+)/.exec(text)?.[1] ?? 0));
    }
    expect(new Set(lengths).size).toBe(STYLES.length);
    expect(new Set(rakes).size).toBe(STYLES.length);
    // The mid-engine car must lay its glass back further than the crossover.
    expect(rakes[0]!).toBeLessThan(rakes[2]!);
  });
});

test.describe('sections', () => {
  test('draws a cut at every station and hands the section to the inspector', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'SECTIONS', exact: true }).click();
    await expect(page.getByTestId('sections-view')).toBeVisible();
    for (const id of ['fa', 'cwl', 'h1', 'ra']) {
      await expect(page.getByTestId(`section-${id}`)).toBeAttached();
    }
    // Aim at the outline itself: the shape has no fill, so the centre of its
    // bounding box is empty canvas.
    const at = await page.evaluate(() => {
      const path = document.querySelector('[data-testid="section-ra"]') as SVGPathElement;
      const r = path.ownerSVGElement!.getBoundingClientRect();
      const q = path.getPointAtLength(path.getTotalLength() * 0.5);
      return { x: Math.round(r.left + q.x), y: Math.round(r.top + q.y) };
    });
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator('.rail')).toContainText('tumblehome');
    await expect(page.locator('.rail')).toContainText('glass inset');
  });
});

test.describe('the lofted body', () => {
  test('stands up, re-lofts on a package change, and throws nothing', async ({ page }) => {
    const errs = await noErrors(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'BODY', exact: true }).click();
    await expect(page.locator('.body-host canvas')).toBeVisible();

    // A package change has to reach the surface, or the two are describing
    // different cars.
    await page.getByTestId('style-front-gt').click();
    await page.waitForTimeout(600);
    await expect(page.locator('.body-host canvas')).toBeVisible();

    await page.getByTestId('zebra-toggle').click();
    await page.waitForTimeout(300);
    await page.getByTestId('view-rear34').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.body-host canvas')).toBeVisible();
    expect(errs).toEqual([]);
  });
});
