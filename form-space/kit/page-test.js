/* Stage 7 check, for any thing built on the kit: the built page at 390 px.
 *
 *   node kit/page-test.js <thing folder>
 *
 * Opens <thing>/index.html in a headless browser as a phone, uses every
 * control, and fails on any console error, page error, pop-up dialog or
 * sideways scroll. Fonts are answered with an empty stylesheet, so the test
 * also shows the page working without its only outside files.
 * Which axes it presses comes from THING.test in the thing's space.js.
 * Writes <thing>/checks/page-result.json and screenshots in <thing>/checks/page/.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const dir = path.resolve(process.argv[2] || '.');
const S = require(path.join(dir, 'space.js'));
const { AXES, BY, SPACE, THING } = S, T = THING.test;
const shots = path.join(dir, 'checks', 'page');
const url = 'file://' + path.join(dir, 'index.html');

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
    try { const r = await fn(); steps.push({ name, ok: r !== false }); }
    catch (e) { steps.push({ name, ok: false, note: String(e.message || e).split('\n')[0] }); }
  };
  const addr = () => page.$eval('#addr', e => e.value);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const shot = name => page.screenshot({ path: path.join(shots, name + '.png') });
  const wait = ms => page.waitForTimeout(ms);
  // bring an axis row into view, opening its distance first
  const show = async id => {
    await page.click('[data-tab="axes"]');
    const d = BY[id].d;
    if (!(await page.$eval(`details.dist[data-d="${d}"]`, e => e.open))) { await page.click(`details.dist[data-d="${d}"] > summary`); await wait(200); }
    await page.$eval('#ax-' + id, e => e.scrollIntoView()); await wait(260);
  };
  const val = id => page.$eval(`#ax-${id} .val`, e => e.textContent);

  await page.goto(url);
  await page.waitForSelector('#draw svg');
  await step('opens on a drawing', async () => (await page.$$eval('#draw svg *', e => e.length)) > 20);
  await step('no sideways scroll', async () => (await overflow()) <= 0);
  await shot('01-open');

  await step('next and previous change the number', async () => {
    const a = await addr(); await page.click('#next'); await wait(80);
    const b = await addr(); await page.click('#prev'); await wait(80);
    return a !== b && (await addr()) === a;
  });
  await step('go to a typed number', async () => {
    await page.fill('#addr', '123456789012345678901234567890'); await page.click('#go'); await wait(80);
    return (await addr()) === '123456789012345678901234567890';
  });
  await step('a bad number shows a message, no dialog', async () => {
    await page.fill('#addr', 'chair'); await page.click('#go'); await wait(50);
    const shown = await page.$eval('#addr-msg', e => !e.hidden && e.textContent.length > 10);
    await page.click('#reset'); await wait(80);
    return shown && (await addr()) === '0';
  });
  await step('Anywhere jumps', async () => { await page.click('#anywhere'); await wait(120); return (await addr()) !== '0'; });
  await shot('02-anywhere');
  await step('every view draws', async () => {
    let n = 3;
    for (const v of THING.views) { await page.click(`[data-view="${v[0]}"]`); await wait(90); await shot(String(n++).padStart(2, '0') + '-view-' + v[0]); if ((await overflow()) > 0) return false; }
    return true;
  });
  await step('Room shows it in place', async () => { await page.click('[data-dist="room"]'); await wait(90); await shot('08-room'); return (await page.$$eval('#draw svg *', e => e.length)) > 20; });
  await step('Loupe can be dragged', async () => {
    await page.click('#reset'); await page.click(`[data-view="${THING.main}"]`); await page.click('[data-dist="loupe"]'); await wait(140);
    const before = await page.$eval('#loupe svg', e => e.getAttribute('viewBox'));
    const bb = await (await page.$('#loupe')).boundingBox();
    await page.mouse.move(bb.x + 60, bb.y + 60); await page.mouse.down(); await page.mouse.move(bb.x - 40, bb.y + 30, { steps: 5 }); await page.mouse.up();
    await wait(80); await shot('09-loupe');
    return before !== (await page.$eval('#loupe svg', e => e.getAttribute('viewBox')));
  });
  await page.click('[data-dist="arm"]');

  await step('every axis has a row under its distance', async () =>
    (await page.$$eval('.ax', e => e.length)) === AXES.length && (await page.$$eval('details.dist', e => e.length)) === 7);
  await step('arrows step an axis and its strip draws', async () => {
    await page.click('#reset'); await wait(80); await show(T.step);
    const want = SPACE.allowed(BY[T.step], SPACE.normalize({})).length;
    const thumbs = await page.$$eval(`#ax-${T.step} .th svg`, e => e.length);
    const a = await addr(); await page.click(`#ax-${T.step} .st[data-step="1"]`); await wait(140);
    await shot('10-axis-strip');
    return thumbs === want && (await addr()) !== a;
  });
  await step('tapping a strip picture picks that option', async () => {
    await show(T.pick[0]);
    await page.click(`#ax-${T.pick[0]} .th[data-i="${T.pick[1]}"]`); await wait(140);
    return (await val(T.pick[0])).startsWith(T.pick[2]);
  });
  await step('an axis in another view switches the view on, the next one off', async () => {
    await show(T.other);
    await page.click(`#ax-${T.other} .st[data-step="1"]`); await wait(140);
    const on = await page.$eval('#auto-note', e => !e.hidden && / view, for /.test(e.textContent));
    await show(T.back);
    await page.click(`#ax-${T.back} .st[data-step="1"]`); await wait(140);
    return on && (await page.$eval('#auto-note', e => e.hidden));
  });
  await step('Hold keeps an axis through Anywhere', async () => {
    await show(T.hold);
    await page.click(`#ax-${T.hold} .hold`); await wait(60);
    const want = await val(T.hold);
    for (let i = 0; i < 6; i++) { await page.click('#anywhere'); await wait(70); if ((await val(T.hold)) !== want) return false; }
    await page.click(`#ax-${T.hold} .hold`);
    return true;
  });
  await step('Drift walks and stops', async () => {
    const a = await addr(); await page.click('#drift'); await wait(2600); await page.click('#drift');
    const b = await addr(); await wait(1400);
    return a !== b && (await addr()) === b;
  });
  await step('a rule greys an axis and says why', async () => {
    await page.click('#reset'); await wait(80); await show(T.rule[0]);
    await page.click(`#ax-${T.rule[0]} .th[data-i="${T.rule[1]}"]`); await wait(160);
    await show(T.rule[2]); await shot('11-rule');
    return page.$eval('#ax-' + T.rule[2], e => e.classList.contains('na') && !e.querySelector('.why').hidden && e.querySelector('.why').textContent.length > 8);
  });
  await step('Sheet: two axes as a grid, tap to go', async () => {
    await page.click('#reset'); await page.click('[data-tab="sheet"]'); await wait(350);
    const cells = await page.$$eval('#sheet-grid .th', e => e.length);
    await shot('12-sheet');
    const a = await addr(); await page.click('#sheet-grid tbody tr:nth-child(2) td:nth-child(4) .th'); await wait(160);
    return cells > 8 && (await addr()) !== a && (await overflow()) <= 0;
  });
  await step('Language: roll, hold, release', async () => {
    await page.click('[data-tab="lang"]'); await page.click('#lang-roll'); await wait(160);
    const words = await page.$$eval('#lang-words .chip', e => e.length);
    const before = await val(T.lang);
    for (let i = 0; i < 5; i++) { await page.click('#anywhere'); await wait(70); }
    const kept = (await val(T.lang)) === before;
    await shot('13-language');
    await page.click('#lang-free'); await wait(80);
    return words >= 4 && kept && (await page.$eval('#lang-free', e => e.disabled)) && (await page.$$eval('#lang-agree li', e => e.length)) >= 3;
  });
  await step('Keep, the pile, Near my keeps, Remove', async () => {
    await page.click('#keep'); await page.click('#anywhere'); await wait(90); await page.click('#keep');
    await page.click('[data-tab="keeps"]'); await wait(220);
    const n = await page.$$eval('#pile .kept', e => e.length);
    const a = await addr(); await page.click('#near'); await wait(160);
    const moved = (await addr()) !== a;
    await shot('14-keeps');
    await page.click('#pile .rm'); await wait(100);
    return n === 2 && moved && (await page.$$eval('#pile .kept', e => e.length)) === 1;
  });
  await step('state is saved on the device', async () => {
    const a = await addr(); await wait(400);
    await page.goto(url); await page.waitForSelector('#draw svg'); await wait(160);
    return (await addr()) === a && (await page.$$eval('#pile .kept', e => e.length)) === 1;
  });
  await step('About opens in the page', async () => { await page.click('#about-btn'); const ok = await page.$eval('#about', e => !e.hidden && e.textContent.length > 200); await page.click('#about-btn'); return ok; });
  const snd = AXES.find(a => a.sound);
  if (snd) await step('a sound plays without error', async () => { await page.click('#reset'); await wait(80); await show(snd.id); await page.click(`#ax-${snd.id} .sound`); await wait(160); return true; });
  await step('still no sideways scroll', async () => (await overflow()) <= 0);

  // a wide screen, light and dark
  const wide = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  wide.on('console', m => { if (m.type() === 'error') errors.push('wide: ' + m.text()); });
  wide.on('pageerror', e => errors.push('wide pageerror: ' + e.message));
  await wide.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await wide.goto(url); await wide.waitForSelector('#draw svg'); await wide.waitForTimeout(300);
  await wide.screenshot({ path: path.join(shots, '15-wide.png') });
  await wide.emulateMedia({ colorScheme: 'dark' }); await wide.waitForTimeout(100);
  await wide.screenshot({ path: path.join(shots, '16-wide-dark.png') });

  await browser.close();
  const failed = steps.filter(s => !s.ok);
  const result = { when: new Date().toISOString(), width: 390, steps, consoleErrors: errors, pass: failed.length === 0 && errors.length === 0 };
  fs.writeFileSync(path.join(dir, 'checks', 'page-result.json'), JSON.stringify(result, null, 1) + '\n');
  steps.forEach(s => console.log((s.ok ? '  ok   ' : '  FAIL ') + s.name + (s.note ? '  (' + s.note + ')' : '')));
  console.log('console errors:', errors.length, errors.slice(0, 6));
  console.log(result.pass ? 'PAGE PASS' : 'PAGE FAIL');
  process.exit(result.pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
