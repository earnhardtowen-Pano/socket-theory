/* Form space page, shared by every thing built on the kit.
 * Needs FS_SPACE (the thing's space.js) and FS_DRAW (its draw.js) loaded first.
 * What differs between things comes from FS_SPACE.THING and FS_SPACE.LANGUAGE.
 * State lives in the page and is saved on the device. No pop-up dialogs.
 */
(function () {
  'use strict';
  const S = window.FS_SPACE, D = window.FS_DRAW;
  const AXES = S.AXES, BY = S.BY, SPACE = S.SPACE, DIST = S.DIST, VERSION = S.VERSION, T = S.THING, LANGUAGE = S.LANGUAGE;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const KEY = 'formspace:' + VERSION;
  const SVGNS = 'xmlns="http://www.w3.org/2000/svg"';
  const VIEW_IDS = T.views.map(v => v[0]);
  const viewName = id => { const v = T.views.find(q => q[0] === id); return v ? v[1] : id.charAt(0).toUpperCase() + id.slice(1); };

  // Order for stepping and strips: quantities ascend, names keep their order.
  const ORDER = {};
  AXES.forEach(a => { ORDER[a.id] = a.n ? a.all.slice().sort((p, q) => a.n[p] - a.n[q]) : a.all.slice(); });
  const LANG = AXES.filter(a => a.lang).map(a => a.id);

  const st = {
    v: SPACE.normalize({}), holds: {}, lang: null, keeps: [],
    view: T.main, dist: 'arm', tab: 'axes', open: { 1: true }, sheet: T.sheet.slice(), loupe: [0.7, 0.42],
    auto: null
  };
  let driftTimer = null, cur = null, editing = false;

  // ------------------------------------------------------------ storage
  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && typeof saved === 'object') {
      ['view', 'dist', 'tab'].forEach(k => { if (typeof saved[k] === 'string') st[k] = saved[k]; });
      if (saved.open && typeof saved.open === 'object') st.open = saved.open;
      if (Array.isArray(saved.sheet) && BY[saved.sheet[0]] && BY[saved.sheet[1]]) st.sheet = saved.sheet;
      if (Array.isArray(saved.loupe)) st.loupe = saved.loupe;
      if (Array.isArray(saved.holds)) saved.holds.forEach(id => { if (BY[id]) st.holds[id] = true; });
      if (saved.lang && Array.isArray(saved.lang.ids)) st.lang = { ids: saved.lang.ids.filter(id => BY[id]) };
      if (Array.isArray(saved.keeps)) st.keeps = saved.keeps.filter(k => k && /^\d+$/.test(k.a) && BigInt(k.a) < SPACE.total);
      if (typeof saved.a === 'string' && /^\d+$/.test(saved.a) && BigInt(saved.a) < SPACE.total) st.v = SPACE.unrank(BigInt(saved.a));
    }
    if (VIEW_IDS.indexOf(st.view) < 0) st.view = T.main;
    if (!['room', 'arm', 'loupe'].includes(st.dist)) st.dist = 'arm';
    if (!['axes', 'sheet', 'lang', 'keeps'].includes(st.tab)) st.tab = 'axes';
    const m = /^#n(\d+)$/.exec(location.hash || '');
    if (m && BigInt(m[1]) < SPACE.total) st.v = SPACE.unrank(BigInt(m[1]));
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const data = {
        a: SPACE.rank(st.v).toString(), ver: VERSION, holds: Object.keys(st.holds), lang: st.lang, keeps: st.keeps,
        view: st.view, dist: st.dist, tab: st.tab, open: st.open, sheet: st.sheet, loupe: st.loupe
      };
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* saving is a convenience */ }
      try { history.replaceState(null, '', '#n' + data.a); } catch (e) { /* the frame may not allow it */ }
    }, 250);
  }

  // ------------------------------------------------------------ helpers
  const held = id => !!st.holds[id] || !!(st.lang && st.lang.ids.indexOf(id) >= 0);
  const allowed = a => SPACE.allowed(a, st.v);
  const notApplicable = (a, al) => !!a.when && al.length === 1;
  const sortedAllowed = (a, al) => ORDER[a.id].filter(i => al.indexOf(i) >= 0);
  function withAxis(v, id, i) { const p = Object.assign({}, v); p[id] = i; return SPACE.normalize(p); }
  function randomAddress() {
    const w = new Uint32Array(10);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(w); else for (let i = 0; i < 10; i++) w[i] = Math.floor(Math.random() * 4294967296);
    let n = 0n;
    for (let i = 0; i < 10; i++) n = (n << 32n) + BigInt(w[i]);
    return n % SPACE.total;
  }
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  function optionTags(a, i) {
    return (a.nw && a.nw.indexOf(i) >= 0 ? ' <span class="tag new">new</span>' : '') + (a.ex && a.ex.indexOf(i) >= 0 ? ' <span class="tag ex">extreme</span>' : '');
  }
  // the small drawing for an axis: a close crop where it names one, else the whole view
  function thumbSpec(a) {
    const l = a.look || { v: T.main };
    if (l.at) { const asp = l.aspect || 0.66; return { o: { view: l.v, at: l.at, w: l.w, aspect: asp }, w: asp < 0.55 ? 110 : 84, h: Math.round((asp < 0.55 ? 110 : 84) * asp) }; }
    return T.thumbs[l.v] || T.thumbs[T.main];
  }
  let uid = 0;
  function thumb(v, spec, label, cls, data) {
    const svg = D.draw(v, Object.assign({ lod: true, idp: 'u' + (uid++) + '_', attrs: `width="${spec.w}" height="${spec.h}" aria-hidden="true"` }, spec.o));
    return `<button class="th ${cls || ''}" ${data || ''} title="${esc(label)}" aria-label="${esc(label)}" style="width:${spec.w + 2}px">${svg}<span>${esc(label)}</span></button>`;
  }

  // ------------------------------------------------------------- moves
  function setChoices(v, keepAuto) {
    st.v = SPACE.normalize(v);
    if (!keepAuto) st.auto = null;
    render();
  }
  function setAxis(id, i) {
    const a = BY[id];
    const lv = (a.look && a.look.v) || T.main, base = st.dist === 'room' ? T.room : st.view;
    // a view that switches itself on for one axis is switched off by the next
    st.auto = lv !== base && !(st.dist === 'room' && lv === T.main) ? { id, view: lv, name: a.name } : null;
    st.v = withAxis(st.v, id, i);
    render();
  }
  function stepAxis(id, dir) {
    const a = BY[id], list = sortedAllowed(a, allowed(a)), k = list.indexOf(st.v[id]) + dir;
    if (k >= 0 && k < list.length) setAxis(id, list[k]);
  }
  function anywhere() {
    const p = SPACE.unrank(randomAddress());
    for (const a of AXES) if (held(a.id)) p[a.id] = st.v[a.id];
    setChoices(p);
  }
  function driftStep() {
    const free = AXES.filter(a => !held(a.id) && allowed(a).length > 1);
    if (!free.length) return;
    const a = pick(free), list = sortedAllowed(a, allowed(a)), k = list.indexOf(st.v[a.id]);
    let d = Math.random() < 0.5 ? -1 : 1;
    if (k + d < 0 || k + d >= list.length) d = -d;
    st.v = withAxis(st.v, a.id, list[k + d]);
    render();
  }
  function setDrift(on) {
    clearInterval(driftTimer); driftTimer = null;
    if (on) driftTimer = setInterval(driftStep, 1100);
    $('drift').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('drift').textContent = on ? 'Drifting' : 'Drift';
  }
  function keepThis() {
    const a = SPACE.rank(st.v).toString();
    if (!st.keeps.some(k => k.a === a)) st.keeps.unshift({ a, ver: VERSION });
    render(); drawPile();
  }
  function nearKeeps() {
    if (!st.keeps.length) return;
    let v = SPACE.unrank(BigInt(pick(st.keeps).a));
    const count = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < count; k++) {
      const free = AXES.filter(a => !held(a.id) && SPACE.allowed(a, v).length > 1);
      if (!free.length) break;
      const a = pick(free), others = SPACE.allowed(a, v).filter(i => i !== v[a.id]);
      v = withAxis(v, a.id, pick(others));
    }
    setChoices(v);
  }

  // ---------------------------------------------------------- language
  function rollLanguage() {
    st.v = SPACE.normalize(Object.assign({}, st.v, LANGUAGE.roll(pick, st.v)));
    st.lang = { ids: LANG.slice() };
    st.auto = null;
    render();
  }
  function holdLanguage() { st.lang = { ids: LANG.slice() }; render(); }
  function drawLanguage() {
    const on = !!st.lang;
    $('lang-free').disabled = !on;
    $('lang-words').innerHTML = on ? LANGUAGE.describe(st.v).map(w => `<span class="chip word">${esc(w)}</span>`).join('') : '';
    $('lang-held').innerHTML = on
      ? st.lang.ids.map(id => { const a = BY[id], al = allowed(a); return notApplicable(a, al) ? '' : `<span class="chip">${esc(a.name)}: ${esc(a.o[st.v[id]])}</span>`; }).join('')
      : '<span class="chip">No language held</span>';
  }

  // -------------------------------------------------------------- stage
  const stageView = () => (st.auto ? st.auto.view : st.dist === 'room' ? T.room : st.view);
  function drawStage() {
    const view = stageView();
    const r = D.parts(st.v, { view, idp: 'm' });
    $('draw').innerHTML = `<svg ${SVGNS} viewBox="${r.viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(T.name)}, ${esc(viewName(view))} view"><defs>${r.defs}</defs>${r.body}</svg>`;
    cur = { box: r.box, view };
    const note = $('auto-note');
    note.hidden = !st.auto;
    if (st.auto) note.textContent = viewName(view) + ' view, for ' + st.auto.name;
    $('stamp').textContent = D.stamp ? D.stamp(st.v) : '';
    const lp = $('loupe');
    lp.hidden = st.dist !== 'loupe';
    if (!lp.hidden) {
      const z = D.parts(st.v, { view, idp: 'z' });
      lp.innerHTML = `<svg ${SVGNS} viewBox="0 0 10 10"><defs>${z.defs}</defs>${z.body}</svg>`;
    } else lp.innerHTML = '';
    layoutStage();
  }
  function stageGeom() {
    // the drawing sits above a strip kept for the scale bar and the size stamp
    const rc = $('stage').getBoundingClientRect(), dr = $('draw').getBoundingClientRect(), b = cur.box;
    const k = Math.min(dr.width / b[2], dr.height / b[3]) || 1;
    return { k, ox: (dr.width - b[2] * k) / 2, oy: (dr.height - b[3] * k) / 2, w: rc.width, h: rc.height };
  }
  function layoutStage() {
    if (!cur) return;
    // the stage takes the shape of the view, within limits
    const stage = $('stage'), w0 = stage.getBoundingClientRect().width || 358;
    const maxH = Math.max(160, Math.min(window.innerHeight * 0.42, 460));
    stage.style.height = Math.round(Math.max(140, Math.min(maxH, w0 * cur.box[3] / cur.box[2])) + 20) + 'px';
    const g = stageGeom();
    const steps = [5, 10, 20, 50, 100, 200, 500, 1000, 2000];
    let mm = steps[0];
    for (const s of steps) if (s * g.k <= 90) mm = s;
    const sc = $('scale');
    sc.firstElementChild.style.width = Math.round(mm * g.k) + 'px';
    sc.lastElementChild.textContent = mm >= 1000 ? (mm / 1000) + ' m' : mm + ' mm';
    const lp = $('loupe');
    if (lp.hidden) return;
    const R = 66, Z = 4;
    const x = Math.max(0, Math.min(1, st.loupe[0])) * g.w, y = Math.max(0, Math.min(1, st.loupe[1])) * g.h;
    lp.style.left = Math.round(x - R) + 'px';
    lp.style.top = Math.round(y - R) + 'px';
    const mx = cur.box[0] + (x - g.ox) / g.k, my = cur.box[1] + (y - g.oy) / g.k, half = R / g.k / Z;
    const svg = lp.firstElementChild;
    if (svg) svg.setAttribute('viewBox', [mx - half, my - half, 2 * half, 2 * half].map(q => Math.round(q * 100) / 100).join(' '));
  }
  function moveLoupe(e) {
    const rc = $('stage').getBoundingClientRect();
    st.loupe = [(e.clientX - rc.left) / rc.width, (e.clientY - rc.top) / rc.height];
    layoutStage();
  }

  // --------------------------------------------------------------- axes
  const visible = new Set();
  let io = null;
  function buildAxes() {
    let html = '';
    for (const d of DIST) {
      const ax = AXES.filter(a => a.d === d.n);
      html += `<details class="dist" data-d="${d.n}"${st.open[d.n] ? ' open' : ''}><summary><span class="n">${d.n}</span><span class="name">${esc(d.name)}</span>` +
        `<span class="at">${esc(d.at)}</span><span class="count">${ax.length} ${ax.length === 1 ? 'axis' : 'axes'}</span></summary>` +
        `<div class="dist-tools"><button data-holdall="${d.n}">Hold all</button><button data-freeall="${d.n}">Release all</button></div>`;
      for (const a of ax) {
        html += `<div class="ax" id="ax-${a.id}" data-id="${a.id}"><div class="ax-head"><div class="ax-name">${esc(a.name)}</div>` +
          '<div class="stepper"><button class="st" data-step="-1" aria-label="Previous option">&#8249;</button><output class="val"></output><button class="st" data-step="1" aria-label="Next option">&#8250;</button></div>' +
          '<button class="hold" aria-pressed="false">Hold</button></div>' +
          `<div class="ax-say">${esc(a.say)}</div>` +
          '<div class="strip"></div><p class="why" hidden></p>' +
          (a.sound && D.sound ? '<button class="sound">Hear it</button>' : '') + '</div>';
      }
      html += '</details>';
    }
    const host = $('tab-axes');
    host.innerHTML = html;
    host.addEventListener('click', e => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.holdall || t.dataset.freeall) {
        const d = +(t.dataset.holdall || t.dataset.freeall), on = !!t.dataset.holdall;
        AXES.filter(a => a.d === d).forEach(a => {
          if (on) st.holds[a.id] = true;
          else { delete st.holds[a.id]; if (st.lang) st.lang.ids = st.lang.ids.filter(id => id !== a.id); }
        });
        return render();
      }
      const row = t.closest('.ax');
      if (!row) return;
      const id = row.dataset.id;
      if (t.classList.contains('st')) return stepAxis(id, +t.dataset.step);
      if (t.classList.contains('th')) return setAxis(id, +t.dataset.i);
      if (t.classList.contains('sound')) return playSound(id);
      if (t.classList.contains('hold')) {
        if (held(id)) { delete st.holds[id]; if (st.lang) st.lang.ids = st.lang.ids.filter(q => q !== id); } else st.holds[id] = true;
        return render();
      }
    });
    host.querySelectorAll('details.dist').forEach(d => d.addEventListener('toggle', () => { st.open[d.dataset.d] = d.open; save(); updateStrips(); }));
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(entries => {
        for (const en of entries) { if (en.isIntersecting) visible.add(en.target.dataset.id); else visible.delete(en.target.dataset.id); }
        updateStrips();
      }, { rootMargin: '200px 0px' });
      host.querySelectorAll('.ax').forEach(r => io.observe(r));
    } else AXES.forEach(a => visible.add(a.id));
  }
  function updateRows() {
    for (const a of AXES) {
      const row = $('ax-' + a.id);
      if (!row) continue;
      const al = allowed(a), na = notApplicable(a, al), list = sortedAllowed(a, al), k = list.indexOf(st.v[a.id]);
      row.classList.toggle('na', na);
      row.querySelector('.val').innerHTML = na ? 'Not here' : esc(a.o[st.v[a.id]]) + optionTags(a, st.v[a.id]);
      const sb = row.querySelectorAll('.st');
      sb[0].disabled = na || k <= 0;
      sb[1].disabled = na || k >= list.length - 1;
      const hb = row.querySelector('.hold'), h = held(a.id);
      hb.setAttribute('aria-pressed', h ? 'true' : 'false');
      hb.textContent = h ? 'Held' : 'Hold';
      hb.disabled = na;
      const why = row.querySelector('.why');
      why.hidden = !na;
      if (na) why.textContent = a.why || '';
      row.querySelector('.strip').hidden = na;
      const snd = row.querySelector('.sound');
      if (snd) snd.hidden = na;
    }
  }
  // Strips are drawn only when they are on screen, in low detail.
  function updateStrips() {
    for (const id of visible) {
      const a = BY[id], row = $('ax-' + id);
      if (!row || !row.offsetParent) continue;
      const al = allowed(a);
      if (notApplicable(a, al)) continue;
      const strip = row.querySelector('.strip');
      const key = AXES.map(x => (x.id === id ? '' : st.v[x.id])).join(',');
      if (strip.dataset.key !== key) {
        const spec = thumbSpec(a), list = sortedAllowed(a, al);
        let html = '';
        for (const i of list) {
          html += thumb(withAxis(st.v, id, i), spec, a.o[i],
            (a.nw && a.nw.indexOf(i) >= 0 ? 'new ' : '') + (a.ex && a.ex.indexOf(i) >= 0 ? 'ex ' : ''), `data-i="${i}"`);
        }
        if (list.length < a.o.length) {
          html += `<span class="more">${a.o.length - list.length} more with another ${esc(a.on.map(c => BY[c].name).join(' or '))}</span>`;
        }
        strip.innerHTML = html;
        strip.dataset.key = key;
      }
      let onEl = null;
      strip.querySelectorAll('.th').forEach(b => { const on = +b.dataset.i === st.v[id]; b.classList.toggle('on', on); if (on) onEl = b; });
      if (onEl && (onEl.offsetLeft < strip.scrollLeft || onEl.offsetLeft + onEl.offsetWidth > strip.scrollLeft + strip.clientWidth)) {
        strip.scrollLeft = onEl.offsetLeft - (strip.clientWidth - onEl.offsetWidth) / 2;
      }
    }
  }

  // -------------------------------------------------------------- sheet
  function buildSheetPickers() {
    const opts = DIST.map(d => `<optgroup label="${d.n} ${esc(d.name)}">` + AXES.filter(a => a.d === d.n).map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('') + '</optgroup>').join('');
    ['sheet-a', 'sheet-b'].forEach((id, k) => {
      const s = $(id);
      s.innerHTML = opts; s.value = st.sheet[k];
      s.addEventListener('change', () => { st.sheet[k] = s.value; $('sheet-grid').dataset.key = ''; render(); });
    });
    $('sheet-grid').addEventListener('click', e => {
      const t = e.target.closest('.th');
      if (!t) return;
      const p = Object.assign({}, st.v);
      p[st.sheet[0]] = +t.dataset.i; p[st.sheet[1]] = +t.dataset.j;
      setChoices(p);
    });
  }
  function drawSheet() {
    const host = $('sheet-grid'), A = BY[st.sheet[0]], B = BY[st.sheet[1]];
    if (A.id === B.id) { host.innerHTML = '<p class="empty" style="margin:8px">Pick two different axes.</p>'; host.dataset.key = ''; return; }
    const key = AXES.map(x => (x.id === A.id || x.id === B.id ? '' : st.v[x.id])).join(',') + '|' + A.id + '|' + B.id;
    if (host.dataset.key !== key) {
      const la = A.look || { v: T.main }, lb = B.look || { v: T.main };
      const spec = la.v === lb.v && la.at === lb.at ? thumbSpec(A) : thumbSpec({ look: { v: la.v } });
      const cell = { o: spec.o, w: Math.round(spec.w * 0.8), h: Math.round(spec.h * 0.8) };
      let html = '<table class="grid"><thead><tr><th></th>' + ORDER[B.id].map(j => `<th>${esc(B.o[j])}</th>`).join('') + '</tr></thead><tbody>';
      for (const i of ORDER[A.id]) {
        html += `<tr><th>${esc(A.o[i])}</th>`;
        for (const j of ORDER[B.id]) {
          const p = Object.assign({}, st.v);
          p[A.id] = i; p[B.id] = j;
          const q = SPACE.normalize(p);
          html += '<td>' + (q[A.id] === i && q[B.id] === j ? thumb(q, cell, A.o[i] + ', ' + B.o[j], '', `data-i="${i}" data-j="${j}"`) : '') + '</td>';
        }
        html += '</tr>';
      }
      host.innerHTML = html + '</tbody></table>';
      host.dataset.key = key;
    }
    host.querySelectorAll('.th').forEach(b => b.classList.toggle('on', +b.dataset.i === st.v[A.id] && +b.dataset.j === st.v[B.id]));
  }

  // -------------------------------------------------------------- keeps
  function drawPile() {
    const host = $('pile'), base = T.thumbs[T.main], spec = { o: base.o, w: 104, h: Math.round(104 * base.h / base.w) };
    $('keep-count').textContent = st.keeps.length ? '(' + st.keeps.length + ')' : '';
    $('near').disabled = !st.keeps.length;
    if (!st.keeps.length) { host.innerHTML = '<p class="empty">Nothing kept yet. Keep one and it lands here.</p>'; host.className = ''; return; }
    host.className = 'pile';
    const now = SPACE.rank(st.v).toString();
    host.innerHTML = st.keeps.map((k, n) => '<div class="kept">' +
      thumb(SPACE.unrank(BigInt(k.a)), spec, 'Go to kept number ' + (n + 1), k.a === now ? 'on' : '', `data-go="${k.a}"`).replace(/<span>.*?<\/span>/, '') +
      `<small>${k.a.length > 14 ? k.a.slice(0, 7) + '…' + k.a.slice(-5) : k.a}</small><button class="rm" data-rm="${k.a}">Remove</button></div>`).join('');
  }

  // -------------------------------------------------------------- sound
  let actx = null;
  function playSound(id) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !D.sound) return;
    try {
      actx = actx || new AC();
      if (actx.state === 'suspended') actx.resume();
      D.sound(id, st.v, actx);
    } catch (e) { /* sound is optional */ }
  }

  // ------------------------------------------------------------- render
  let pending = false;
  function render() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; paint(); });
  }
  function paint() {
    drawStage();
    if (!editing) { $('addr').value = SPACE.rank(st.v).toString(); $('go').hidden = true; $('addr-msg').hidden = true; }
    document.querySelectorAll('[data-dist]').forEach(b => b.setAttribute('aria-pressed', b.dataset.dist === st.dist ? 'true' : 'false'));
    document.querySelectorAll('[data-view]').forEach(b => { b.setAttribute('aria-pressed', !st.auto && st.dist !== 'room' && b.dataset.view === st.view ? 'true' : 'false'); });
    updateRows();
    updateStrips();
    if (st.tab === 'sheet') drawSheet();
    if (st.tab === 'lang') drawLanguage();
    if (st.tab === 'keeps') drawPile(); else { $('keep-count').textContent = st.keeps.length ? '(' + st.keeps.length + ')' : ''; }
    save();
  }
  function showTab(tab) {
    st.tab = tab;
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'));
    ['axes', 'sheet', 'lang', 'keeps'].forEach(t => { $('tab-' + t).hidden = t !== tab; });
    render();
  }
  function goTyped() {
    const raw = $('addr').value.replace(/[\s,._]/g, ''), msg = $('addr-msg');
    if (!/^\d+$/.test(raw) || BigInt(raw) >= SPACE.total) {
      msg.textContent = 'Type a whole number from 0 to ' + (SPACE.total - 1n).toString() + '.';
      msg.hidden = false;
      return;
    }
    editing = false;
    $('addr').blur();
    setChoices(SPACE.unrank(BigInt(raw)));
  }

  // --------------------------------------------------------------- boot
  function start() {
    load();
    const total = SPACE.total.toString();
    $('thing-name').textContent = T.name;
    $('total-short').innerHTML = total[0] + '.' + total[1] + ' × 10<sup>' + (total.length - 1) + '</sup>';
    $('total-full').textContent = total;
    $('ver').textContent = VERSION;
    $('about-what').textContent = 'Every possible ' + T.one + ' this page can say, written as ' + AXES.length + ' choices and the rules about which choices fit together. Every valid set of choices has a whole number. Nothing is stored: a ' + T.one + ' is drawn when you land on its number.';
    $('about-odd').textContent = 'Nothing here is ranked or filtered. Odd ' + T.many + ' are part of the space. Whether one can be made, what it costs and whether it is good are left to you.';
    $('about-notes').innerHTML = ['Choices are sorted by the distance at which you notice them, from the silhouette down to the sound.',
      '<span class="tag new">new</span> marks an option not in current practice. <span class="tag ex">extreme</span> marks one outside the ordinary range. Both are from memory, unverified.']
      .concat(T.notes.map(esc), ['Kept ' + esc(T.many) + ' and holds are saved on this device only.']).map(t => '<li>' + t + '</li>').join('');
    $('keeps-what').textContent = 'A pile of ' + T.many + ' you kept, saved on this device. Near my keeps starts from one of them and changes two to five choices.';
    $('lang-agree').innerHTML = LANGUAGE.agreements.map(t => '<li>' + esc(t) + '</li>').join('');
    $('views').innerHTML = T.views.map(v => `<button data-view="${v[0]}" aria-pressed="false">${esc(v[1])}</button>`).join('');
    buildAxes();
    buildSheetPickers();

    $('about-btn').addEventListener('click', () => { const a = $('about'); a.hidden = !a.hidden; $('about-btn').setAttribute('aria-expanded', a.hidden ? 'false' : 'true'); });
    document.querySelectorAll('[data-dist]').forEach(b => b.addEventListener('click', () => { st.dist = b.dataset.dist; st.auto = null; render(); }));
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { st.view = b.dataset.view; st.auto = null; if (st.dist === 'room') st.dist = 'arm'; render(); }));
    document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
    const stepAddr = d => { const t = SPACE.total; editing = false; setChoices(SPACE.unrank(((SPACE.rank(st.v) + d) % t + t) % t)); };
    $('prev').addEventListener('click', () => stepAddr(-1n));
    $('next').addEventListener('click', () => stepAddr(1n));
    $('anywhere').addEventListener('click', () => { editing = false; anywhere(); });
    $('drift').addEventListener('click', () => setDrift(!driftTimer));
    $('keep').addEventListener('click', keepThis);
    $('keep2').addEventListener('click', keepThis);
    $('near').addEventListener('click', nearKeeps);
    $('reset').addEventListener('click', () => { editing = false; setChoices(SPACE.unrank(0n)); });
    $('reset').title = 'Number 0, the most ordinary one';
    $('lang-roll').addEventListener('click', rollLanguage);
    $('lang-keep').addEventListener('click', holdLanguage);
    $('lang-free').addEventListener('click', () => { st.lang = null; render(); });
    $('pile').addEventListener('click', e => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.go) setChoices(SPACE.unrank(BigInt(t.dataset.go)));
      if (t.dataset.rm) { st.keeps = st.keeps.filter(k => k.a !== t.dataset.rm); render(); drawPile(); }
    });
    const addr = $('addr');
    addr.addEventListener('focus', () => { addr.select(); });
    addr.addEventListener('input', () => { editing = true; $('go').hidden = false; $('addr-msg').hidden = true; });
    addr.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); goTyped(); }
      if (e.key === 'Escape') { editing = false; addr.blur(); render(); }
    });
    $('go').addEventListener('click', goTyped);

    const lp = $('loupe'), stage = $('stage');
    let dragging = false;
    const down = e => { if (st.dist !== 'loupe') return; dragging = true; try { lp.setPointerCapture(e.pointerId); } catch (x) { /* fine */ } moveLoupe(e); e.preventDefault(); };
    lp.addEventListener('pointerdown', down);
    stage.addEventListener('pointerdown', e => { if (st.dist === 'loupe' && e.target !== lp) { moveLoupe(e); save(); } });
    lp.addEventListener('pointermove', e => { if (dragging) moveLoupe(e); });
    const up = () => { if (dragging) { dragging = false; save(); } };
    lp.addEventListener('pointerup', up);
    lp.addEventListener('pointercancel', up);
    window.addEventListener('resize', layoutStage);
    document.addEventListener('visibilitychange', () => { if (document.hidden && driftTimer) setDrift(false); });
    window.addEventListener('hashchange', () => {
      const m = /^#n(\d+)$/.exec(location.hash || '');
      if (m && BigInt(m[1]) < SPACE.total && m[1] !== SPACE.rank(st.v).toString()) setChoices(SPACE.unrank(BigInt(m[1])));
    });
    showTab(st.tab);
  }
  window.FS_UI = { state: st, render, setChoices };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
