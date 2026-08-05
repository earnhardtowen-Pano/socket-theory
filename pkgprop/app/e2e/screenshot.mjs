import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const dist = '/home/user/socket-theory/pkgprop/app/dist';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  let p = join(dist, req.url === '/' ? 'index.html' : req.url);
  if (!existsSync(p)) p = join(dist, 'index.html');
  res.setHeader('content-type', types[extname(p)] ?? 'application/octet-stream');
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4173, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:4173/');
await page.waitForTimeout(600);

const out = process.argv[2] ?? '/tmp/claude-0/-home-user-socket-theory/887fe607-ca28-5c9f-8ba8-143323969ea6/scratchpad/app.png';
await page.screenshot({ path: out, fullPage: false });
console.log('saved', out);

// Extra states driven by CLI flag
const mode = process.argv[3];
if (mode === 'ledger') {
  await page.keyboard.press('l');
  await page.waitForTimeout(300);
  await page.screenshot({ path: out.replace('.png', '-ledger.png') });
  console.log('saved ledger');
} else if (mode === 'mr') {
  await page.click('button:has-text("MR")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: out.replace('.png', '-mr.png') });
  console.log('saved mr');
} else if (mode === 'wall') {
  // Slam the roof slider to its floor to show wall attribution.
  const slider = page.locator('[data-testid="control-roof_z"] input');
  await slider.focus();
  await slider.fill('0');
  await slider.press('Home');
  await page.waitForTimeout(400);
  await page.screenshot({ path: out.replace('.png', '-wall.png') });
  console.log('saved wall');
}
if (mode === 'ev3') {
  const b2 = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p2 = await b2.newPage({ viewport: { width: 1600, height: 1000 } });
  await p2.goto('http://localhost:4173/');
  await p2.click('button:has-text("EV skateboard")');
  await p2.click('button:has-text("2+3row")');
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: out.replace('.png', '-ev3.png') });
  console.log('saved ev3');
  await b2.close();
}
await browser.close();
server.close();
