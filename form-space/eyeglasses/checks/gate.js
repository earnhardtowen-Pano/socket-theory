/* Stage 6: the gate. Checks the drawing without a person.
 *
 *   node checks/gate.js            everything
 *   node checks/gate.js --quick    random draws and the identical test only (no sheets)
 *
 * 1. Draws 3,000 random addresses in all four views, full and low detail.
 *    None may throw or contain "NaN" (or "undefined" or "Infinity").
 *    A sample is also parsed as XML in a browser.
 * 2. For each axis, a sheet showing every option while the rest stay at
 *    default. Where a rule forbids an option at default, the fewest other
 *    choices are changed to allow it, and the sheet says which.
 * 3. For each option, its picture is compared with the first allowed option
 *    in the same setting, at the distance where the axis belongs:
 *      Form    the whole view at 180 px wide (a thumbnail, across the room)
 *      Face    the axis's own look at 360 px
 *      others  the axis's own look (usually a close crop) at 360 px
 *    An option is flagged when no pixel differs by more than 12 levels.
 *    Options that differ in very few pixels are listed as faint.
 * 4. One sheet of 24 random addresses, and the same 24 in the other views.
 *
 * Writes checks/gate-result.json and checks/sheets/*.png.
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..');
const S = require(path.join(dir, 'space.js'));
const D = require(path.join(dir, 'draw.js'));
const { AXES, SPACE, DIST, BY } = S;
const quick = process.argv.includes('--quick');
const sheetsDir = path.join(__dirname, 'sheets');

// A fixed random stream, so a failing address can be found again.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomAddress(rnd) {
  let n = 0n;
  for (let i = 0; i < 12; i++) n = (n << 32n) + BigInt(Math.floor(rnd() * 2 ** 32));
  return n % SPACE.total;
}
const BAD = /NaN|undefined|Infinity/;

// ---- 1. random draws
function randomDraws(count) {
  const rnd = rng(20261122);
  const fails = [];
  let drawn = 0;
  const t0 = Date.now();
  for (let i = 0; i < count; i++) {
    const n = randomAddress(rnd), v = SPACE.unrank(n);
    for (const view of D.VIEWS) for (const lod of [false, true]) {
      try {
        const svg = D.draw(v, { view, lod, idp: 'r' });
        drawn++;
        const m = BAD.exec(svg);
        if (m) fails.push({ address: n.toString(), view, lod, problem: m[0], near: svg.slice(Math.max(0, m.index - 90), m.index + 20) });
      } catch (e) {
        fails.push({ address: n.toString(), view, lod, problem: 'threw', near: String(e && e.stack || e).split('\n').slice(0, 3).join(' | ') });
      }
    }
  }
  return { addresses: count, drawings: drawn, failures: fails, ms: Date.now() - t0 };
}

// ---- settings in which each option of an axis can be shown
function settingsFor(a) {
  const v0 = SPACE.normalize({});
  const out = [];           // { v, changed: {id: label}, options: [i...] }
  const need = new Set(a.all);
  const tryCtx = v => {
    const al = SPACE.allowed(a, v);
    const got = al.filter(i => need.has(i));
    if (al.length > 1 && got.length) return { al, got };
    return null;
  };
  const first = tryCtx(v0);
  if (first) { out.push({ v: v0, changed: {}, al: first.al }); first.al.forEach(i => need.delete(i)); }
  if (need.size && a.on) {
    // every combination of the axes this one depends on, fewest changes first
    const ctl = a.on.map(id => BY[id]);
    let combos = [[]];
    for (const c of ctl) { const nx = []; for (const q of combos) for (const i of c.all) nx.push(q.concat(i)); combos = nx; }
    combos.sort((p, q) => p.filter(Boolean).length - q.filter(Boolean).length);
    for (const q of combos) {
      if (!need.size) break;
      const p = Object.assign({}, v0);
      ctl.forEach((c, k) => { p[c.id] = q[k]; });
      const v = SPACE.normalize(p);
      if (ctl.some((c, k) => v[c.id] !== q[k])) continue;
      const r = tryCtx(v);
      if (!r) continue;
      const changed = {};
      AXES.forEach(x => { if (x.id !== a.id && v[x.id] !== v0[x.id]) changed[x.id] = x.o[v[x.id]]; });
      out.push({ v, changed, al: r.al });
      r.al.forEach(i => need.delete(i));
    }
  }
  return { settings: out, unreachable: [...need] };
}
// extra choices that make a faint axis readable; named in the report
const HELP = {
  sat: { tone: 2 },             // colour strength cannot be seen on a deep tone
  pcol: { tone: 2, hue: 2, pcon: 2 },    // pattern colours read against a mid orange-brown
  col2: { tone: 2, hue: 9 },
  tinth: { tintd: 3 },          // a tint hue or gradient cannot be judged at 10% density
  tgrad: { tintd: 3 },
  blotch: { pcon: 2 },          // blotches are judged at medium contrast
  pdir: { pcon: 2 }
};
function withAxis(v, id, i) { const p = Object.assign({}, v); p[id] = i; return SPACE.normalize(p); }
function lookOf(a) {
  const l = a.look || { v: 'front' };
  const o = { view: l.v };
  if (l.at) { o.at = l.at; o.w = l.w; }
  return o;
}

(async () => {
  const result = { version: S.VERSION, when: new Date().toISOString() };
  result.random = randomDraws(3000);
  console.log('random draws:', result.random.addresses, 'addresses,', result.random.drawings, 'drawings,',
    result.random.failures.length, 'failures,', result.random.ms + ' ms');
  result.random.failures.slice(0, 8).forEach(f => console.log('  ', JSON.stringify(f)));

  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(String(e)));
  await page.setContent('<body></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(dir, 'space.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(dir, 'draw.js'), 'utf8') });

  // a sample of the random drawings must parse as XML
  result.xml = await page.evaluate(sample => {
    const S = window.FS_SPACE, D = window.FS_DRAW, bad = [];
    let k = 0;
    for (const a of sample) for (const view of D.VIEWS) {
      const svg = D.draw(S.SPACE.unrank(BigInt(a)), { view, idp: 'x' });
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      if (doc.querySelector('parsererror')) bad.push({ address: a, view });
      // ids must be unique inside one drawing
      const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
      if (new Set(ids).size !== ids.length) bad.push({ address: a, view, problem: 'repeated id' });
      k++;
    }
    return { parsed: k, bad };
  }, (() => { const rnd = rng(7); return Array.from({ length: 1000 }, () => randomAddress(rnd).toString()); })());
  console.log('xml parse:', result.xml.parsed, 'drawings,', result.xml.bad.length, 'bad');

  // ---- 3. identical-picture test
  const jobs = [];
  const sheetPlan = [];
  for (const a of AXES) {
    const { settings, unreachable } = settingsFor(a);
    const look = lookOf(a);
    const form = a.d === 1;
    const view = form ? { view: look.view } : look;          // Form is judged on the whole view
    const px = form ? 180 : 360;
    const plan = { id: a.id, settings: [], unreachable };
    for (const st of settings) {
      let base = st.v;
      const help = HELP[a.id];
      const helped = {};
      if (help) {
        const p = Object.assign({}, base);
        Object.keys(help).forEach(k => { p[k] = help[k]; helped[k] = BY[k].o[help[k]]; });
        const q = SPACE.normalize(p);
        if (SPACE.allowed(a, q).length === st.al.length) base = q;
      }
      const ref = st.al[0];
      plan.settings.push({ changed: Object.assign({}, st.changed, helped), al: st.al, v: base });
      for (const i of st.al) {
        jobs.push({ axis: a.id, opt: i, ref, px, view, v: withAxis(base, a.id, i), vr: withAxis(base, a.id, ref) });
      }
    }
    sheetPlan.push(plan);
  }
  const diffs = await page.evaluate(async jobs => {
    const D = window.FS_DRAW;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const raster = async (v, view, px) => {
      const r = D.parts(v, Object.assign({ idp: 'q' }, view));
      const h = Math.round(px * r.box[3] / r.box[2]);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${h}" viewBox="${r.viewBox}"><defs>${r.defs}</defs>${r.body}</svg>`;
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('image failed')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
      cv.width = px; cv.height = h;
      ctx.fillStyle = D.PAPER; ctx.fillRect(0, 0, px, h);
      ctx.drawImage(img, 0, 0, px, h);
      return { d: ctx.getImageData(0, 0, px, h).data, h };
    };
    const out = [];
    const cache = new Map();
    for (const j of jobs) {
      try {
        const key = j.axis + '|' + JSON.stringify(j.vr);
        let A = cache.get(key);
        if (!A) { A = await raster(j.vr, j.view, j.px); cache.clear(); cache.set(key, A); }
        const B = j.opt === j.ref ? A : await raster(j.v, j.view, j.px);
        let n = 0, mx = 0;
        if (A.h !== B.h) { n = j.px * Math.max(A.h, B.h); mx = 255; }
        else for (let k = 0; k < A.d.length; k += 4) {
          const d = Math.max(Math.abs(A.d[k] - B.d[k]), Math.abs(A.d[k + 1] - B.d[k + 1]), Math.abs(A.d[k + 2] - B.d[k + 2]));
          if (d > mx) mx = d;
          if (d > 12) n++;
        }
        out.push({ axis: j.axis, opt: j.opt, ref: j.ref, pixels: n, of: j.px * A.h, max: mx });
      } catch (e) { out.push({ axis: j.axis, opt: j.opt, ref: j.ref, error: String(e) }); }
    }
    return out;
  }, jobs);

  const options = [], identical = [], faint = [], errors = [];
  for (const d of diffs) {
    const a = BY[d.axis];
    if (d.error) { errors.push(d); continue; }
    if (d.opt === d.ref) continue;
    const row = { axis: d.axis, option: a.o[d.opt], against: a.o[d.ref], pixels: d.pixels, share: +(100 * d.pixels / d.of).toFixed(3), max: d.max };
    options.push(row);
    if (d.pixels === 0) identical.push(row);
    else if (d.pixels < 30) faint.push(row);
  }
  const unreachable = sheetPlan.filter(p => p.unreachable.length).map(p => ({ axis: p.id, options: p.unreachable.map(i => BY[p.id].o[i]) }));
  result.identical = { compared: options.length, flagged: identical, faint: faint.sort((p, q) => p.pixels - q.pixels), errors, unreachable };
  console.log('identical test:', options.length, 'options compared,', identical.length, 'identical,', faint.length, 'faint,', errors.length, 'errors,', unreachable.length, 'axes with options no setting allows');
  identical.forEach(r => console.log('   IDENTICAL', r.axis, '/', r.option));
  faint.forEach(r => console.log('   faint', r.axis, '/', r.option, r.pixels + ' px'));
  result.options = options;

  // ---- 2 and 4. sheets
  if (!quick) {
    fs.rmSync(sheetsDir, { recursive: true, force: true });
    fs.mkdirSync(sheetsDir, { recursive: true });
    const CW = 172;
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const css = `body{margin:0;background:#fff;font:11px/1.25 system-ui,sans-serif;color:#222}
      h2{font-size:13px;margin:10px 8px 2px} .note{margin:0 8px 4px;color:#666}
      .row{display:flex;flex-wrap:wrap;gap:4px;padding:0 8px 6px}
      .c{width:${CW}px;background:${D.PAPER};border:1px solid #d9d4c8} .c.ref{border-color:#333}
      .c b{display:block;background:#fff;padding:1px 4px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .c.bad b{background:#ffd0d0} .c svg{display:block;width:100%;height:auto}`;
    let uid = 0;
    const cell = (v, view, label, cls) => `<div class="c ${cls || ''}"><b>${esc(label)}</b>${D.draw(v, Object.assign({ idp: 's' + (uid++) + '_' }, view))}</div>`;
    const flaggedSet = new Set(identical.map(r => r.axis + '|' + r.option));
    const sheets = [];
    for (const dist of DIST) {
      const axes = AXES.filter(a => a.d === dist.n);
      for (let k = 0, part = 1; k < axes.length; k += 4, part++) {
        let html = `<style>${css}</style>`;
        const ids = [];
        for (const a of axes.slice(k, k + 4)) {
          const plan = sheetPlan.find(p => p.id === a.id), look = lookOf(a);
          ids.push(a.id);
          html += `<h2>${dist.n} ${esc(dist.name)} · ${esc(a.name)} <span style="font-weight:400;color:#666">(${a.id}, ${a.o.length} options, ${a.n ? 'numbers' : 'names'}, look: ${look.view}${look.at ? ' at ' + look.at : ''})</span></h2>`;
          for (const st of plan.settings) {
            const ch = Object.keys(st.changed);
            if (ch.length) html += `<div class="note">with ${ch.map(c => esc(BY[c].name) + ' = ' + esc(st.changed[c])).join(', ')}</div>`;
            html += '<div class="row">' + st.al.map((i, n) => cell(withAxis(st.v, a.id, i), look, a.o[i], (n === 0 ? 'ref ' : '') + (flaggedSet.has(a.id + '|' + a.o[i]) ? 'bad' : ''))).join('') + '</div>';
          }
        }
        sheets.push({ file: `axis-${dist.n}-${String(part).padStart(2, '0')}.png`, html, axes: ids });
      }
    }
    // 24 random addresses
    const rnd = rng(24);
    const picks = Array.from({ length: 24 }, () => randomAddress(rnd));
    const rcss = css.replace(`width:${CW}px`, 'width:286px');
    sheets.push({ file: 'random-24-front.png', html: `<style>${rcss}</style><h2>24 random addresses · front</h2><div class="row">` + picks.map((n, i) => cell(SPACE.unrank(n), { view: 'front' }, (i + 1) + ' · ' + n.toString().slice(0, 14) + '…')).join('') + '</div>', random: true });
    for (const view of ['side', 'top', 'worn']) {
      sheets.push({ file: `random-24-${view}.png`, html: `<style>${rcss.replace('width:286px', 'width:' + (view === 'side' ? 286 : 190) + 'px')}</style><h2>the same 24 · ${view}</h2><div class="row">` + picks.map((n, i) => cell(SPACE.unrank(n), { view }, String(i + 1))).join('') + '</div>', random: true });
    }
    result.random24 = picks.map(n => n.toString());
    for (const sh of sheets) {
      await page.setViewportSize({ width: sh.random ? 1190 : 1250, height: 600 });
      await page.setContent(sh.html);
      await page.screenshot({ path: path.join(sheetsDir, sh.file), fullPage: true });
    }
    result.sheets = sheets.map(s => ({ file: s.file, axes: s.axes }));
    console.log('sheets:', sheets.length, 'written to checks/sheets');
  }
  await browser.close();
  result.consoleErrors = consoleErrors;
  if (consoleErrors.length) console.log('console errors:', consoleErrors.slice(0, 5));

  result.pass = result.random.failures.length === 0 && result.xml.bad.length === 0 && identical.length === 0 &&
    errors.length === 0 && unreachable.length === 0 && consoleErrors.length === 0;
  // keep the eyes-on record across runs
  const outFile = path.join(__dirname, 'gate-result.json');
  fs.writeFileSync(outFile, JSON.stringify(result, null, 1) + '\n');
  console.log(result.pass ? 'GATE PASS' : 'GATE FAIL');
  process.exit(result.pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
