/* Stage 7 check: the built page at 390 px wide.
 *
 *   node checks/page-test.js
 *
 * Opens index.html in a headless browser as a phone, uses every control,
 * and fails on any console error, page error or sideways scroll.
 * Fonts are answered with an empty stylesheet, so the test also shows the
 * page working without its only outside files.
 * Writes checks/page-result.json and screenshots in checks/page/.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const dir = path.join(__dirname, '..');
const shots = path.join(__dirname, 'page');

(async () => {
  fs.rmSync(shots, { recursive: true, force: true });
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [], steps = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => { errors.push('dialog opened: ' + d.message()); d.dismiss(); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));

  const step = async (name, fn) => {
    try { const r = await fn(); steps.push({ name, ok: r !== false, note: typeof r === 'string' ? r : undefined }); }
    catch (e) { steps.push({ name, ok: false, note: String(e.message || e).split('\n')[0] }); }
  };
  const addr = () => page.$eval('#addr', e => e.value);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const shot = name => page.screenshot({ path: path.join(shots, name + '.png') });

  await page.goto('file://' + path.join(dir, 'index.html'));
  await page.waitForSelector('#draw svg');
  await step('opens on a drawing', async () => (await page.$$eval('#draw svg *', e => e.length)) > 20);
  await step('no sideways scroll', async () => (await overflow()) <= 0);
  await shot('01-open');

  await step('next and previous change the number', async () => {
    const a = await addr(); await page.click('#next'); await page.waitForTimeout(80);
    const b = await addr(); await page.click('#prev'); await page.waitForTimeout(80);
    return a !== b && (await addr()) === a;
  });
  await step('go to a typed number', async () => {
    await page.fill('#addr', '123456789012345678901234567890');
    await page.click('#go'); await page.waitForTimeout(80);
    return (await addr()) === '123456789012345678901234567890';
  });
  await step('a bad number shows a message, no dialog', async () => {
    await page.fill('#addr', 'chair'); await page.click('#go'); await page.waitForTimeout(50);
    const shown = await page.$eval('#addr-msg', e => !e.hidden && e.textContent.length > 10);
    await page.click('#reset'); await page.waitForTimeout(80);
    return shown && (await addr()) === '0';
  });
  await step('Anywhere jumps', async () => { await page.click('#anywhere'); await page.waitForTimeout(120); return (await addr()) !== '0'; });
  await shot('02-anywhere');
  await step('views: side, top', async () => {
    await page.click('[data-view="side"]'); await page.waitForTimeout(80); await shot('03-side');
    await page.click('[data-view="top"]'); await page.waitForTimeout(80); await shot('04-top');
    return (await overflow()) <= 0;
  });
  await step('distance: room shows it worn', async () => { await page.click('[data-dist="room"]'); await page.waitForTimeout(80); await shot('05-room'); return true; });
  await step('distance: loupe can be dragged', async () => {
    await page.click('#reset'); await page.click('[data-view="front"]'); await page.click('[data-dist="loupe"]'); await page.waitForTimeout(120);
    const before = await page.$eval('#loupe svg', e => e.getAttribute('viewBox'));
    const bb = await (await page.$('#loupe')).boundingBox();
    await page.mouse.move(bb.x + 60, bb.y + 60); await page.mouse.down(); await page.mouse.move(bb.x - 40, bb.y + 30, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(80);
    await shot('06-loupe');
    return before !== (await page.$eval('#loupe svg', e => e.getAttribute('viewBox')));
  });
  await page.click('[data-dist="arm"]');

  await step('every axis has a row under its distance', async () => {
    const n = await page.$$eval('.ax', e => e.length), d = await page.$$eval('details.dist', e => e.length);
    return n === 91 && d === 7 ? true : false;
  });
  await step('arrows step an axis and its strip draws', async () => {
    await page.click('#reset'); await page.waitForTimeout(80);
    await page.$eval('#ax-lw', e => e.scrollIntoView()); await page.waitForTimeout(250);
    const thumbs = await page.$$eval('#ax-lw .th svg', e => e.length);
    const a = await addr(); await page.click('#ax-lw .st[data-step="1"]'); await page.waitForTimeout(120);
    await shot('07-axis-strip');
    return thumbs === 10 && (await addr()) !== a;
  });
  await step('tapping a strip picture picks that option', async () => {
    await page.$eval('#ax-sides', e => e.scrollIntoView()); await page.waitForTimeout(250);
    await page.click('#ax-sides .th[data-i="4"]'); await page.waitForTimeout(120);
    return (await page.$eval('#ax-sides .val', e => e.textContent)).startsWith('Six');
  });
  await step('an axis in another view switches the view on, the next one off', async () => {
    await page.$eval('#ax-wrap', e => e.scrollIntoView()); await page.waitForTimeout(250);
    await page.click('#ax-wrap .st[data-step="1"]'); await page.waitForTimeout(120);
    const on = await page.$eval('#auto-note', e => !e.hidden && /Top view/.test(e.textContent));
    await page.$eval('#ax-dbl', e => e.scrollIntoView()); await page.waitForTimeout(250);
    await page.click('#ax-dbl .st[data-step="1"]'); await page.waitForTimeout(120);
    return on && (await page.$eval('#auto-note', e => e.hidden));
  });
  await step('Hold keeps an axis through Anywhere', async () => {
    await page.$eval('#ax-lw', e => e.scrollIntoView()); await page.waitForTimeout(200);
    await page.click('#ax-lw .hold'); await page.waitForTimeout(60);
    const want = await page.$eval('#ax-lw .val', e => e.textContent);
    for (let i = 0; i < 6; i++) { await page.click('#anywhere'); await page.waitForTimeout(60); if ((await page.$eval('#ax-lw .val', e => e.textContent)) !== want) return false; }
    await page.click('#ax-lw .hold');
    return true;
  });
  await step('Drift walks and stops', async () => {
    const a = await addr(); await page.click('#drift'); await page.waitForTimeout(2600); await page.click('#drift');
    const b = await addr(); await page.waitForTimeout(1400);
    return a !== b && (await addr()) === b;
  });
  await step('a closed distance opens', async () => {
    await page.click('details.dist[data-d="3"] > summary'); await page.waitForTimeout(250);
    await page.$eval('#ax-rivs', e => e.scrollIntoView()); await page.waitForTimeout(250);
    await shot('08-detail');
    return (await page.$$eval('#ax-rivs .th svg', e => e.length)) > 0 && (await overflow()) <= 0;
  });
  await step('a rule greys an axis and says why', async () => {
    await page.click('#reset'); await page.waitForTimeout(80);
    await page.click('details.dist[data-d="2"] > summary'); await page.waitForTimeout(200);
    await page.$eval('#ax-rim', e => e.scrollIntoView()); await page.waitForTimeout(250);
    await page.click('#ax-rim .th[data-i="4"]'); await page.waitForTimeout(150);
    return page.$eval('#ax-rimt', e => e.classList.contains('na') && !e.querySelector('.why').hidden);
  });
  await step('Sheet: two axes as a grid, tap to go', async () => {
    await page.click('#reset'); await page.click('[data-tab="sheet"]'); await page.waitForTimeout(300);
    const cells = await page.$$eval('#sheet-grid .th', e => e.length);
    await shot('09-sheet');
    const a = await addr(); await page.click('#sheet-grid tbody tr:nth-child(2) td:nth-child(4) .th'); await page.waitForTimeout(150);
    return cells === 48 && (await addr()) !== a && (await overflow()) <= 0;
  });
  await step('Language: roll, hold, release', async () => {
    await page.click('[data-tab="lang"]'); await page.click('#lang-roll'); await page.waitForTimeout(150);
    const words = await page.$$eval('#lang-words .chip', e => e.length);
    const heldBefore = await page.$eval('#ax-soft .val', e => e.textContent);
    for (let i = 0; i < 5; i++) { await page.click('#anywhere'); await page.waitForTimeout(60); }
    const kept = (await page.$eval('#ax-soft .val', e => e.textContent)) === heldBefore;
    await shot('10-language');
    await page.click('#lang-free'); await page.waitForTimeout(80);
    return words === 6 && kept && (await page.$eval('#lang-free', e => e.disabled));
  });
  await step('Keep, the pile, Near my keeps, Remove', async () => {
    await page.click('#keep'); await page.click('#anywhere'); await page.waitForTimeout(80); await page.click('#keep');
    await page.click('[data-tab="keeps"]'); await page.waitForTimeout(200);
    const n = await page.$$eval('#pile .kept', e => e.length);
    const a = await addr(); await page.click('#near'); await page.waitForTimeout(150);
    const moved = (await addr()) !== a;
    await shot('11-keeps');
    await page.click('#pile .rm'); await page.waitForTimeout(100);
    return n === 2 && moved && (await page.$$eval('#pile .kept', e => e.length)) === 1;
  });
  await step('state is saved on the device', async () => {
    const a = await addr();
    await page.waitForTimeout(400);
    await page.goto('file://' + path.join(dir, 'index.html')); await page.waitForSelector('#draw svg'); await page.waitForTimeout(150);
    return (await addr()) === a && (await page.$$eval('#pile .kept', e => e.length)) === 1;
  });
  await step('About opens in the page', async () => { await page.click('#about-btn'); return page.$eval('#about', e => !e.hidden); });
  await step('the hinge sound plays without error', async () => {
    await page.click('#about-btn'); await page.click('[data-tab="axes"]');
    await page.click('details.dist[data-d="7"] > summary'); await page.waitForTimeout(200);
    await page.$eval('#ax-snap', e => e.scrollIntoView()); await page.waitForTimeout(200);
    await page.click('#ax-snap .sound'); await page.waitForTimeout(150);
    return true;
  });
  await step('still no sideways scroll', async () => (await overflow()) <= 0);

  // a wide screen, to see the two-column layout
  const wide = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  wide.on('console', m => { if (m.type() === 'error') errors.push('wide: ' + m.text()); });
  wide.on('pageerror', e => errors.push('wide pageerror: ' + e.message));
  await wide.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await wide.goto('file://' + path.join(dir, 'index.html')); await wide.waitForSelector('#draw svg'); await wide.waitForTimeout(300);
  await wide.screenshot({ path: path.join(shots, '12-wide.png') });
  await wide.emulateMedia({ colorScheme: 'dark' }); await wide.waitForTimeout(100);
  await wide.screenshot({ path: path.join(shots, '13-wide-dark.png') });

  await browser.close();
  const failed = steps.filter(s => !s.ok);
  const result = { when: new Date().toISOString(), width: 390, steps, consoleErrors: errors, pass: failed.length === 0 && errors.length === 0 };
  fs.writeFileSync(path.join(__dirname, 'page-result.json'), JSON.stringify(result, null, 1) + '\n');
  steps.forEach(s => console.log((s.ok ? '  ok   ' : '  FAIL ') + s.name + (s.note ? '  (' + s.note + ')' : '')));
  console.log('console errors:', errors.length, errors.slice(0, 6));
  console.log(result.pass ? 'PAGE PASS' : 'PAGE FAIL');
  process.exit(result.pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
