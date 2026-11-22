/* Stage 6: the gate, for any thing built on the kit. Checks the drawing
 * without a person.
 *
 *   node kit/gate.js <thing folder>            everything
 *   node kit/gate.js <thing folder> --quick    random draws and the identical test only
 *
 * 1. Draws 3,000 random addresses in every view, full and low detail.
 *    None may throw or contain "NaN" (or "undefined" or "Infinity").
 *    1,000 of them are also parsed as XML in a browser and checked for
 *    repeated ids.
 * 2. For each axis, a sheet showing every option while the rest stay at
 *    default. Where a rule forbids an option at default, the fewest other
 *    choices are changed to allow it, and the sheet says which. An axis may
 *    also name helper choices (`help`) without which it cannot be judged.
 * 3. For each option, its picture is compared with the first allowed option
 *    in the same setting, at the distance where the axis belongs:
 *      Form    the whole view at 180 px wide (a thumbnail)
 *      others  the axis's own look (often a close crop) at 360 px
 *    An option is flagged when no pixel differs by more than 12 levels.
 *    Options that differ in fewer than 30 pixels are listed as faint.
 * 4. One sheet of 24 random addresses in the main view, and the same 24 in
 *    the other views.
 *
 * Writes <thing>/checks/gate-result.json and <thing>/checks/sheets/*.png.
 */
const fs = require('fs');
const path = require('path');
const dir = path.resolve(process.argv[2] || '.');
const S = require(path.join(dir, 'space.js'));
const D = require(path.join(dir, 'draw.js'));
const { AXES, SPACE, DIST, BY, THING } = S;
const quick = process.argv.includes('--quick');
const checks = path.join(dir, 'checks'), sheetsDir = path.join(checks, 'sheets');
fs.mkdirSync(checks, { recursive: true });

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

function randomDraws(count) {
  const rnd = rng(20261122), fails = [];
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

// settings in which each option of an axis can be shown
function settingsFor(a) {
  const v0 = SPACE.normalize({}), out = [], need = new Set(a.all);
  const tryCtx = v => { const al = SPACE.allowed(a, v); return al.length > 1 && al.some(i => need.has(i)) ? al : null; };
  const first = tryCtx(v0);
  if (first) { out.push({ v: v0, changed: {}, al: first }); first.forEach(i => need.delete(i)); }
  if (need.size && a.on) {
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
      const al = tryCtx(v);
      if (!al) continue;
      const changed = {};
      AXES.forEach(x => { if (x.id !== a.id && v[x.id] !== v0[x.id]) changed[x.id] = x.o[v[x.id]]; });
      out.push({ v, changed, al });
      al.forEach(i => need.delete(i));
    }
  }
  return { settings: out, unreachable: [...need] };
}
function withAxis(v, id, i) { const p = Object.assign({}, v); p[id] = i; return SPACE.normalize(p); }
function lookOf(a) {
  const l = a.look || { v: THING.main }, o = { view: l.v };
  if (l.at) { o.at = l.at; o.w = l.w; if (l.aspect) o.aspect = l.aspect; }
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
  for (const f of [path.join(__dirname, 'engine.js'), path.join(__dirname, 'draw-util.js'), path.join(dir, 'space.js'), path.join(dir, 'draw.js')]) {
    await page.addScriptTag({ content: fs.readFileSync(f, 'utf8') });
  }

  result.xml = await page.evaluate(sample => {
    const S = window.FS_SPACE, D = window.FS_DRAW, bad = [];
    let k = 0;
    for (const a of sample) for (const view of D.VIEWS) {
      const svg = D.draw(S.SPACE.unrank(BigInt(a)), { view, idp: 'x' });
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      if (doc.querySelector('parsererror')) bad.push({ address: a, view });
      const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
      if (new Set(ids).size !== ids.length) bad.push({ address: a, view, problem: 'repeated id' });
      k++;
    }
    return { parsed: k, bad };
  }, (() => { const rnd = rng(7); return Array.from({ length: 1000 }, () => randomAddress(rnd).toString()); })());
  console.log('xml parse:', result.xml.parsed, 'drawings,', result.xml.bad.length, 'bad');
  result.xml.bad.slice(0, 5).forEach(b => console.log('  ', JSON.stringify(b)));

  // identical-picture test
  const jobs = [], sheetPlan = [];
  for (const a of AXES) {
    const { settings, unreachable } = settingsFor(a);
    const look = lookOf(a), form = a.d === 1;
    const view = form ? { view: look.view } : look, px = form ? 180 : 360;
    const plan = { id: a.id, settings: [], unreachable };
    for (const st of settings) {
      let base = st.v;
      const helped = {};
      if (a.help) {
        const p = Object.assign({}, base);
        Object.keys(a.help).forEach(k => { p[k] = a.help[k]; });
        const q = SPACE.normalize(p);
        if (SPACE.allowed(a, q).length === st.al.length) { base = q; Object.keys(a.help).forEach(k => { helped[k] = BY[k].o[q[k]]; }); }
      }
      const ref = st.al[0];
      plan.settings.push({ changed: Object.assign({}, st.changed, helped), al: st.al, v: base });
      for (const i of st.al) jobs.push({ axis: a.id, opt: i, ref, px, view, v: withAxis(base, a.id, i), vr: withAxis(base, a.id, ref) });
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
    const out = [], cache = new Map();
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
    if (d.pixels === 0) identical.push(row); else if (d.pixels < 30) faint.push(row);
  }
  const unreachable = sheetPlan.filter(p => p.unreachable.length).map(p => ({ axis: p.id, options: p.unreachable.map(i => BY[p.id].o[i]) }));
  const helped = AXES.filter(a => a.help).map(a => ({ axis: a.id, name: a.name, with: Object.keys(a.help).map(k => BY[k].name + ' = ' + BY[k].o[a.help[k]]).join(', ') }));
  result.identical = { compared: options.length, flagged: identical, faint: faint.sort((p, q) => p.pixels - q.pixels), errors, unreachable, helped };
  console.log('identical test:', options.length, 'options compared,', identical.length, 'identical,', faint.length, 'faint,', errors.length, 'errors,', unreachable.length, 'axes with options no setting allows');
  identical.forEach(r => console.log('   IDENTICAL', r.axis, '/', r.option));
  faint.forEach(r => console.log('   faint', r.axis, '/', r.option, r.pixels + ' px'));
  errors.slice(0, 5).forEach(r => console.log('   error', r.axis, r.error));
  result.options = options;

  if (!quick) {
    fs.rmSync(sheetsDir, { recursive: true, force: true });
    fs.mkdirSync(sheetsDir, { recursive: true });
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const aspectOf = view => { const r = D.parts(SPACE.normalize({}), view); return r.box[2] / r.box[3]; };
    const css = `body{margin:0;background:#fff;font:11px/1.25 system-ui,sans-serif;color:#222}
      h2{font-size:13px;margin:10px 8px 2px} .note{margin:0 8px 4px;color:#666}
      .row{display:flex;flex-wrap:wrap;gap:4px;padding:0 8px 6px}
      .c{background:${D.PAPER};border:1px solid #d9d4c8} .c.ref{border-color:#333}
      .c b{display:block;background:#fff;padding:1px 4px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .c.bad b{background:#ffd0d0} .c svg{display:block;width:100%;height:auto}`;
    let uid = 0;
    const cell = (v, view, label, cls, w) => `<div class="c ${cls || ''}" style="width:${w}px"><b>${esc(label)}</b>${D.draw(v, Object.assign({ idp: 's' + (uid++) + '_' }, view))}</div>`;
    const flaggedSet = new Set(identical.map(r => r.axis + '|' + r.option));
    const sheets = [];
    for (const dist of DIST) {
      const axes = AXES.filter(a => a.d === dist.n);
      for (let k = 0, part = 1; k < axes.length; k += 5, part++) {
        let html = `<style>${css}</style>`;
        const ids = [];
        for (const a of axes.slice(k, k + 5)) {
          const plan = sheetPlan.find(p => p.id === a.id), look = lookOf(a), asp = aspectOf(look);
          const w = asp > 1.9 ? 240 : asp > 1.2 ? 196 : 150;
          ids.push(a.id);
          html += `<h2>${dist.n} ${esc(dist.name)} · ${esc(a.name)} <span style="font-weight:400;color:#666">(${a.id}, ${a.o.length} options, ${a.n ? 'numbers' : 'names'}, look: ${look.view}${look.at ? ' at ' + look.at : ''})</span></h2>`;
          for (const st of plan.settings) {
            const ch = Object.keys(st.changed);
            if (ch.length) html += `<div class="note">with ${ch.map(c => esc(BY[c].name) + ' = ' + esc(st.changed[c])).join(', ')}</div>`;
            html += '<div class="row">' + st.al.map((i, n) => cell(withAxis(st.v, a.id, i), look, a.o[i], (n === 0 ? 'ref ' : '') + (flaggedSet.has(a.id + '|' + a.o[i]) ? 'bad' : ''), w)).join('') + '</div>';
          }
        }
        sheets.push({ file: `axis-${dist.n}-${String(part).padStart(2, '0')}.png`, html, axes: ids });
      }
    }
    const rnd = rng(24);
    const picks = Array.from({ length: 24 }, () => randomAddress(rnd));
    for (const view of [THING.main].concat(D.VIEWS.filter(v => v !== THING.main && v !== THING.room))) {
      const asp = aspectOf({ view }), w = asp > 1.9 ? 292 : asp > 1.2 ? 240 : 190;
      sheets.push({ file: `random-24-${view}.png`, html: `<style>${css}</style><h2>24 random addresses · ${view}</h2><div class="row">` + picks.map((n, i) => cell(SPACE.unrank(n), { view }, (i + 1) + ' · ' + n.toString().slice(0, 12) + '…', '', w)).join('') + '</div>', random: true });
    }
    result.random24 = picks.map(n => n.toString());
    for (const sh of sheets) {
      await page.setViewportSize({ width: sh.random ? 1210 : 1250, height: 600 });
      await page.setContent(sh.html);
      await page.screenshot({ path: path.join(sheetsDir, sh.file), fullPage: true });
    }
    result.sheets = sheets.map(s => ({ file: s.file, axes: s.axes }));
    console.log('sheets:', sheets.length, 'written to', path.relative(process.cwd(), sheetsDir));
  }
  await browser.close();
  result.consoleErrors = consoleErrors;
  if (consoleErrors.length) console.log('console errors:', consoleErrors.slice(0, 5));

  result.pass = result.random.failures.length === 0 && result.xml.bad.length === 0 && identical.length === 0 &&
    errors.length === 0 && unreachable.length === 0 && consoleErrors.length === 0;
  fs.writeFileSync(path.join(checks, 'gate-result.json'), JSON.stringify(result, null, 1) + '\n');
  console.log(result.pass ? 'GATE PASS' : 'GATE FAIL');
  process.exit(result.pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
