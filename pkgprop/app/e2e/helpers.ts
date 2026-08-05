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

/**
 * The row you scrub to move a value.
 *
 * There is no `input[type=range]` in the tool any more — a slider's resolution
 * is whatever the panel is wide, and you cannot nudge one without hunting for
 * a handle. The scrubber's row carries the ARIA slider role and the live band,
 * so a test reads its walls from the same place a screen reader would.
 */
export function scrub(page: Page, id: string) {
  return page.locator(`[data-testid="scrub-${id}"] .scrub-row`);
}

/** Push a control onto one of its walls, the way Home and End do by hand. */
export async function pushToWall(page: Page, id: string, wall: 'lower' | 'upper'): Promise<void> {
  const row = scrub(page, id);
  await row.focus();
  await row.press(wall === 'lower' ? 'Home' : 'End');
}

/**
 * Put a control at a stated fraction of its live band.
 *
 * The scrubber works in millimetres because nobody thinks in fractions, so the
 * fraction is converted against the band the row is advertising right now —
 * which is the point of storing a pose as a fraction in the first place.
 */
export async function setControl(page: Page, id: string, fraction: number): Promise<void> {
  const row = scrub(page, id);
  const min = Number(await row.getAttribute('aria-valuemin'));
  const max = Number(await row.getAttribute('aria-valuemax'));
  await typeInto(page, `scrub-${id}`, String(Math.round(min + (max - min) * fraction)));
}

/**
 * Click a scrubber without moving and type an exact number into it.
 *
 * A press that never moves is a click, and a click means "let me type it" —
 * so this is the same gesture a person makes, not a test back door.
 */
export async function typeInto(page: Page, testid: string, value: string): Promise<void> {
  const row = page.locator(`[data-testid="${testid}"] .scrub-row`);
  // The rail scrolls, and a bounding box is reported in page coordinates
  // whether or not the row is on screen — so clicking one without scrolling to
  // it first sends the press to whatever happens to be at those coordinates.
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const field = page.locator(`[data-testid="${testid}"] .scrub-input`);
  await field.waitFor();
  await field.fill(value);
  await field.press('Enter');
}
