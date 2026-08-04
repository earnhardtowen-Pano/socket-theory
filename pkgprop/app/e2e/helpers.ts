import type { Page } from '@playwright/test';

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
