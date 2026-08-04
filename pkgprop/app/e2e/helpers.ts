import type { Page } from '@playwright/test';

/**
 * A screen point that is genuinely on a drawn curve.
 *
 * Aiming between two control points does not work: a curve bows away from the
 * chord, so the midpoint can land on bare canvas. Ask the path where it is.
 */
export async function pointOnPath(
  page: Page,
  testid: string,
  t = 0.5,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([id, frac]) => {
      const path = document.querySelector(`[data-testid="${id}"]`) as SVGPathElement | null;
      if (!path) throw new Error(`no path ${id} on the canvas`);
      const r = path.ownerSVGElement!.getBoundingClientRect();
      const p = path.getPointAtLength(path.getTotalLength() * (frac as number));
      return { x: Math.round(r.left + p.x), y: Math.round(r.top + p.y) };
    },
    [testid, t] as const,
  );
}

/**
 * Pick up a line so its control points exist.
 *
 * Points belong to the thing in your hand — an unselected line is a clean
 * curve with nothing to grab. Any test that drags a point has to take hold of
 * its line first, exactly as a hand would.
 */
export async function grabLine(page: Page, line: string): Promise<void> {
  const q = await pointOnPath(page, `line-${line}`);
  await page.mouse.move(q.x, q.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.getByTestId(`pt-${line}-0`).waitFor();
}

/**
 * Put down whatever is held, so the rail goes back to the package.
 *
 * The inspector shows one thing at a time; while a part is in your hand the
 * architecture and seating controls are not on screen.
 */
export async function putDown(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.getByTestId('fold-stance').waitFor();
}

/** The instrument opens in RENDER; the machinery lives in DRAFT. */
export async function draft(page: Page): Promise<void> {
  await page.getByTestId('mode-DRAFT').click();
}

/** Open a folded rail group if it is closed. */
export async function openFold(page: Page, id: string): Promise<void> {
  const fold = page.getByTestId(`fold-${id}`);
  const classes = (await fold.getAttribute('class')) ?? '';
  if (!classes.includes('open')) await fold.locator('.fold-head').click();
}

/** Everything a machinery test needs: DRAFT plus the groups it touches. */
export async function machinery(page: Page, ...folds: string[]): Promise<void> {
  await draft(page);
  for (const f of folds) await openFold(page, f);
}
