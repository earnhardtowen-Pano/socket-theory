/* Eyeglasses form space: drawing.
 *
 * draw(v, opts) turns a set of choices into an SVG, in millimetres.
 *   opts.view   'front' (main), 'side', 'top', 'worn'
 *   opts.lod    true for a low-detail thumbnail
 *   opts.idp    id prefix, unique for every SVG on a page
 *   opts.at, opts.w, opts.aspect   crop round a named anchor, w mm wide
 *
 * Geometry is built from the numbers. Named options each have one entry
 * in a table keyed by option (UNDER, TOPLINE, RIVET, TLINE, TIPS, ...), so a
 * new option is one new entry.
 */
(function (root) {
  'use strict';
  const S = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
    ? require('./space.js') : root.FS_SPACE;
  const AXES = S.AXES;

  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const PAPER = '#f6f3ec';
  const r2 = x => Math.round(x * 100) / 100;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ------------------------------------------------------------ colour
  function rgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];   // short codes such as #abc
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const hex = (r, g, b) => '#' + [r, g, b].map(x => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
  function mix(a, b, t) {
    const A = rgb(a), B = rgb(b);
    return hex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
  }
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return hex((t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255);
  }
  const lum = c => { const q = rgb(c); return (0.299 * q[0] + 0.587 * q[1] + 0.114 * q[2]) / 255; };

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // -------------------------------------------------------------- paths
  const pt = p => r2(p[0]) + ',' + r2(p[1]);
  const poly = (pts, close) => 'M' + pts.map(pt).join('L') + (close === false ? '' : 'Z');
  const mirror = pts => pts.map(p => [-p[0], p[1]]);
  const rev = pts => pts.slice().reverse();
  function bbox(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return { x0, y0, x1, y1 };
  }
  function area(pts) {
    let s = 0;
    for (let i = 0, n = pts.length; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
    return s / 2;
  }
  // Outward unit normals of a closed outline, lightly smoothed.
  function normals(pts) {
    const n = pts.length, sg = area(pts) > 0 ? 1 : -1, raw = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      raw[i] = [sg * dy / len, -sg * dx / len];
    }
    const w = n > 100 ? 2 : 1, out = new Array(n);
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0;
      for (let j = -w; j <= w; j++) { const q = raw[(i + j + n) % n]; x += q[0]; y += q[1]; }
      const len = Math.hypot(x, y) || 1;
      out[i] = [x / len, y / len];
    }
    return out;
  }
  function smoothRing(a, passes) {
    let cur = a;
    for (let p = 0; p < passes; p++) {
      const n = cur.length, nx = new Array(n);
      for (let i = 0; i < n; i++) nx[i] = (cur[(i + n - 1) % n] + 2 * cur[i] + cur[(i + 1) % n]) / 4;
      cur = nx;
    }
    return cur;
  }
  // x where a closed outline crosses the level y: the largest or the smallest.
  function xAt(pts, y, mode) {
    let best = null;
    for (let i = 0, n = pts.length; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if (a[1] !== b[1] && (a[1] - y) * (b[1] - y) <= 0) {
        const x = a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]);
        if (best === null || (mode === 'max' ? x > best : x < best)) best = x;
      }
    }
    if (best === null) {
      let k = 0;
      for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][1] - y) < Math.abs(pts[k][1] - y)) k = i;
      best = pts[k][0];
    }
    return best;
  }
  function inside(pts, x, y) {
    let c = false;
    for (let i = 0, n = pts.length, j = n - 1; i < n; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  // Centre and radius of the largest circle that fits inside an outline.
  // Marks inside an odd-shaped lens are placed from this, not from the box.
  function inCircle(pts) {
    const bb = bbox(pts);
    const dist = (x, y) => {
      if (!inside(pts, x, y)) return -1;
      let m = 1e18;
      for (let i = 0; i < pts.length; i += 2) { const d = (pts[i][0] - x) * (pts[i][0] - x) + (pts[i][1] - y) * (pts[i][1] - y); if (d < m) m = d; }
      return Math.sqrt(m);
    };
    let bx = (bb.x0 + bb.x1) / 2, by = (bb.y0 + bb.y1) / 2, bd = dist(bx, by);
    let sx = (bb.x1 - bb.x0) / 8, sy = (bb.y1 - bb.y0) / 8;
    for (let i = 1; i < 8; i++) for (let j = 1; j < 8; j++) {
      const x = bb.x0 + sx * i, y = bb.y0 + sy * j, d = dist(x, y);
      if (d > bd) { bd = d; bx = x; by = y; }
    }
    for (let r = 0; r < 3; r++) {
      sx /= 2; sy /= 2;
      const cx = bx, cy = by;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const x = cx + sx * i, y = cy + sy * j, d = dist(x, y);
        if (d > bd) { bd = d; bx = x; by = y; }
      }
    }
    return { c: [bx, by], r: Math.max(bd, 1) };
  }
  // Index runs of a ring where test(i) holds.
  function runs(n, test) {
    const out = []; let start = -1;
    let off = 0;
    while (off < n && test(off)) off++;
    if (off === n) return [Array.from({ length: n + 1 }, (_, i) => i % n)];
    for (let k = 0; k <= n; k++) {
      const i = (off + k) % n, ok = k < n && test(i);
      if (ok && start < 0) start = k;
      if (!ok && start >= 0) {
        const run = [];
        for (let q = start; q < k; q++) run.push((off + q) % n);
        if (run.length > 1) out.push(run);
        start = -1;
      }
    }
    return out;
  }
  const ell = (c, rx, ry, rot, attrs) =>
    `<ellipse cx="${r2(c[0])}" cy="${r2(c[1])}" rx="${r2(rx)}" ry="${r2(ry)}"` +
    (rot ? ` transform="rotate(${r2(rot)} ${r2(c[0])} ${r2(c[1])})"` : '') + (attrs ? ' ' + attrs : '') + '/>';
  const circ = (c, r, attrs) => `<circle cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(r)}"${attrs ? ' ' + attrs : ''}/>`;
  const line = (pts, stroke, w, extra) =>
    `<path d="${poly(pts, false)}" fill="none" stroke="${stroke}" stroke-width="${r2(w)}"${extra ? ' ' + extra : ''}/>`;

  // ------------------------------------------------------------ choices
  function params(v) {
    const P = {};
    for (const a of AXES) { const i = v[a.id] | 0; P[a.id] = a.n ? a.n[i] : a.k[i]; }
    return P;
  }

  // ------------------------------------------------------- lens outline
  // One outline from numbers: sides, corner softness, then taper, droop,
  // sweep, brow flatness, nose cut and tilt. Worked out once and stored.
  const OUT = new Map();
  function lensOutline(P, N) {
    const key = [P.sides, P.soft, P.taper, P.droop, P.sweep, P.brow, P.ncut, P.tilt, P.lw, P.lh, N].join('|');
    const hit = OUT.get(key);
    if (hit) return hit;
    const k = P.sides, U = new Array(N);
    if (k === 2) {
      const m = (1 - P.soft) * 1.25;                       // pointed ends
      for (let i = 0; i < N; i++) {
        const th = TAU * i / N, s = Math.sin(th);
        U[i] = [Math.cos(th), s * Math.pow(Math.abs(s), m)];
      }
    } else {
      const seg = TAU / k, v0 = Math.PI / 2 + Math.PI / k;  // a flat side on top
      let rr = new Array(N);
      for (let i = 0; i < N; i++) {
        const ph = (((TAU * i / N - v0) % seg) + seg) % seg;
        rr[i] = Math.cos(Math.PI / k) / Math.cos(ph - Math.PI / k);
      }
      const w = Math.round(Math.pow(P.soft, 1.3) * N / (2 * k));
      for (let pass = 0; pass < 2 && w > 0; pass++) {
        const nx = new Array(N);
        for (let i = 0; i < N; i++) {
          let s = 0;
          for (let j = -w; j <= w; j++) s += rr[(i + j + N) % N];
          nx[i] = s / (2 * w + 1);
        }
        rr = nx;
      }
      for (let i = 0; i < N; i++) { const th = TAU * i / N; U[i] = [rr[i] * Math.cos(th), rr[i] * Math.sin(th)]; }
    }
    // to the unit box
    let bb = bbox(U);
    const ux = (bb.x0 + bb.x1) / 2, uy = (bb.y0 + bb.y1) / 2, uw = (bb.x1 - bb.x0) / 2, uh = (bb.y1 - bb.y0) / 2;
    const ta = P.tilt * RAD, ct = Math.cos(ta), st = Math.sin(ta);
    const M = new Array(N);
    for (let i = 0; i < N; i++) {
      let u = (U[i][0] - ux) / uw, w = (U[i][1] - uy) / uh;     // u out toward the temple, w up
      if (w > 0) w = Math.pow(w, P.brow);
      u *= 1 + P.taper * w;
      if (w < 0) w *= 1 + P.droop * (0.55 + 0.45 * u);
      if (P.sweep && u > 0) {
        const kk = Math.pow(u, 2.2), sw = P.sweep * 2;
        const lift = sw * kk * (0.35 + 0.65 * (w + 1) / 2);
        u += 0.25 * sw * kk * Math.max(0, w);
        w += lift;
      }
      if (P.ncut) {
        let da = Math.atan2(w, u) + 135 * RAD;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        const fct = 1 - P.ncut * 1.5 * Math.exp(-(da * da) / (0.62 * 0.62));
        u *= fct; w *= fct;
      }
      const x = u * P.lw / 2, y = w * P.lh / 2;
      M[i] = [x * ct - y * st, x * st + y * ct];
    }
    bb = bbox(M);
    const mx = (bb.x0 + bb.x1) / 2, my = (bb.y0 + bb.y1) / 2, kx = P.lw / (bb.x1 - bb.x0), ky = P.lh / (bb.y1 - bb.y0);
    const pts = M.map(p => [(p[0] - mx) * kx, -(p[1] - my) * ky]);   // y down from here on
    const inc = inCircle(pts);
    const o = { pts, ic: inc.c, ir: inc.r };
    if (OUT.size > 600) OUT.clear();
    OUT.set(key, o);
    return o;
  }

  // ------------------------------------------------------------ colours
  const HW = { silver: '#c5c9cf', gold: '#d2aa4f', rose: '#d59a86', gun: '#62666d', black: '#2a2b2f', copper: '#b76f42' };
  const STRAP = '#2c2e33';
  const GLASS = '#cfdfe8';
  function colours(P) {
    const neutral = P.hue < 0, h0 = neutral ? 30 : P.hue, s0 = neutral ? 0.035 : P.sat;
    const mk = (h, s, l) => hsl(h, s, clamp(l, 0.04, 0.96));
    const C = mk(h0, s0, P.tone);
    const hueStep = d => mk(h0 + d, neutral ? 0.5 : P.sat, neutral ? clamp(P.tone, 0.25, 0.75) : P.tone);
    const COL2 = {
      lighter: () => ({ c: mk(h0, s0, P.tone + 0.3) }),
      darker: () => ({ c: mk(h0, s0, P.tone - 0.25) }),
      h30: () => ({ c: hueStep(30) }),
      h90: () => ({ c: hueStep(90) }),
      h180: () => ({ c: hueStep(180) }),
      black: () => ({ c: '#19191b' }),
      white: () => ({ c: '#f3f0ea' }),
      clear: () => ({ c: '#e4eaec', a: 0.3 })
    };
    const PCOL = {
      lighter: () => ({ c: mix(C, '#fff', 0.55) }),
      darker: () => ({ c: mix(C, '#000', 0.62) }),
      amber: () => ({ c: '#c9872b' }),
      opposite: () => ({ c: mk(h0 + 180, neutral ? 0.5 : P.sat, clamp(1 - P.tone, 0.22, 0.8)) }),
      clear: () => ({ c: '#efeadd', a: 0.85 })
    };
    const hw = HW[P.hw];
    const contrast = mk(h0, s0, P.tone < 0.5 ? P.tone + 0.45 : P.tone - 0.45);
    const TCOL = { same: C, metal: hw, contrast, tips: C };
    const tc = P.tinth < 0 ? '#2e3237' : hsl(P.tinth, 0.6, 0.27);
    return { C, C2: COL2[P.col2](), pc: PCOL[P.pcol](), hw, contrast, Ct: TCOL[P.tcol], tint: tc, edge: mix(C, '#000', 0.5) };
  }

  // ----------------------------------------------------------- geometry
  const EPF = { top: 0.1, upper: 0.27, mid: 0.5, low: 0.74 };   // side attachment height on the lens
  const BHF = { top: 0.1, upper: 0.27, mid: 0.5, low: 0.72 };   // bridge height on the lens

  function geometry(P, lod) {
    const N = lod ? 60 : 144;
    const lo = lensOutline(P, N);
    const cx = P.dbl / 2 + P.lw / 2;
    const shield = P.lenses === 'shield';
    const hasRim = P.rim !== 'none';
    const temples = P.hold === 'temples';
    const hasSide = P.hold !== 'clip';
    const L = lo.pts.map(p => [p[0] + cx, p[1]]);
    const ic = [lo.ic[0] + cx, lo.ic[1]], ir = lo.ir;

    // One shield: the outer halves of both lenses, a top line and a nose arch.
    let SH = null, arch = null;
    if (shield) {
      let iT = 0;
      for (let i = 1; i < N; i++) if (L[i][1] < L[iT][1]) iT = i;
      const iB = Math.round(N * 240 / 360) % N;
      const right = [];
      for (let i = iB, g = 0; g <= N; i = (i + 1) % N, g++) { right.push(L[i]); if (i === iT) break; }
      const top = right[right.length - 1], foot = right[0];
      const peak = Math.min(foot[1] - 2, Math.max(top[1] + 5, foot[1] - (0.35 + 0.4 * P.barch) * P.lh));
      const ctl = 2 * peak - foot[1];
      arch = [];
      for (let k = 1; k < 16; k++) {
        const t = k / 16, q = 1 - t;
        arch.push([q * q * -foot[0] + t * t * foot[0], q * q * foot[1] + 2 * t * q * ctl + t * t * foot[1]]);
      }
      SH = right.concat(rev(mirror(right)), arch);
    }
    const glass = shield ? SH : L;                 // the outline that carries the rim
    const NG = glass.length;

    // Rim thickness round the outline, from the direction each point faces.
    const nr = normals(glass);
    let T = glass.map((p, i) => {
      if (!hasRim) return 0;
      const up = -nr[i][1], sd = p[0] >= 0 ? 1 : -1;
      let m = 1;
      if (P.rim === 'browwire' || P.rim === 'browcord') m = sstep(-0.30, 0.05, up);
      else if (P.rim === 'lower') m = sstep(-0.30, 0.05, -up);
      let t = P.rimt * m;
      if (P.rbrow >= 1) t *= 1 + (P.rbrow - 1) * Math.pow(Math.max(0, up), 1.4);
      else t *= 1 + (1 / P.rbrow - 1) * Math.pow(Math.max(0, -up), 1.4);
      if (P.rcorner) {
        const da = Math.atan2(up, nr[i][0] * sd) - 35 * RAD;
        t *= 1 + P.rcorner * Math.exp(-(da * da) / (0.42 * 0.42));
      }
      return t;
    });
    T = smoothRing(T, 2);
    let O = glass.map((p, i) => [p[0] + nr[i][0] * T[i], p[1] + nr[i][1] * T[i]]);
    if (P.rim === 'full' && P.outer) {
      const b = bbox(O), c0 = (b.x0 + b.x1) / 2, c1 = (b.y0 + b.y1) / 2, hw = (b.x1 - b.x0) / 2, hh = (b.y1 - b.y0) / 2;
      O = O.map(p => {
        const a = Math.atan2((p[1] - c1) / hh, (p[0] - c0) / hw);
        const g = (1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))) - 1) / 0.41421;
        const f = P.outer > 0 ? 1 + 0.2 * P.outer * g : 1 - 0.12 * P.outer * (1 - g);
        return [c0 + (p[0] - c0) * f, c1 + (p[1] - c1) * f];
      });
    }
    const bbO = bbox(O);

    // Depth of the front at any point: wrap round the face plus the lens curve.
    const tw = Math.tan(P.wrap * RAD), bz = P.dbl / 2 + 2, R = P.base > 0 ? 530 / P.base : 0;
    const sag = s2 => (R ? R - Math.sqrt(R * R - Math.min(s2, R * R * 0.9)) : 0);
    const zmin = Math.min(tw * (Math.sqrt(cx * cx + bz * bz) - bz), sag(P.lw * P.lw / 4));
    const zf = (x, y) => {
      const s = Math.min(Math.abs(Math.abs(x) - cx), P.lw / 2);   // the lens curve stops at the lens edge
      return tw * (Math.sqrt(x * x + bz * bz) - bz) + sag(s * s + y * y * 0.6) - zmin;
    };

    // Where the sides attach.
    const ye = -P.lh / 2 + EPF[P.epos] * P.lh;
    const xo = xAt(O, ye, 'max'), xl = xAt(glass, ye, 'max');
    const endr = hasSide ? P.endr : 0;
    const xe = hasRim ? xo + endr : xl + Math.max(endr, 1.5);
    const sideDepth = temples ? P.tdepth : P.hold === 'strap' ? 12 : 5;
    const ho = clamp(sideDepth, 2.4, 13);

    // Bridge.
    const ybr = shield ? 0 : -P.lh / 2 + BHF[P.bh] * P.lh;
    const padY = clamp(ybr + 8, -P.lh * 0.1, P.lh * 0.32);
    const xnPad = shield ? xAt(arch, padY, 'max') : xAt(O, padY, 'min');

    return {
      N, NG, L, glass, SH, arch, O, T, nr, cx, ic, ir, shield, hasRim, temples, hasSide,
      yTop: bbO.y0, yBot: bbO.y1, xMax: bbO.x1, zf, ye, xo, xl, xe, endr, ho, ybr, padY, xnPad,
      col: colours(P)
    };
  }

  // ---------------------------------------------------------- materials
  // A material is painted as a stack over one shape: outline, base colour,
  // mottled pattern, material texture, finish, shading.
  const SHADE = {   // [light at top, dark at bottom]
    gloss: [0.2, 0.22], satin: [0.11, 0.15], matte: [0.04, 0.08], brushed: [0.14, 0.15], hammered: [0.12, 0.15]
  };
  const PDIR = { round: [1, null], along3: [3, 0], along8: [8, 0], diag3: [3, -35], vert3: [3, 90] };
  const TEXTURE = {
    acetate: null,
    metal: null,           // metal is all in the shading bands
    injected: null,
    printed: (id, rnd, lod) => {
      let s = '';
      for (let i = 0; i < (lod ? 8 : 16); i++) s += circ([rnd() * 3, rnd() * 3], 0.12 + rnd() * 0.12, `fill="${i % 3 ? '#000' : '#fff'}" fill-opacity=".22"`);
      return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="3" height="3">${s}</pattern>`;
    },
    wood: (id, rnd) => {
      let s = '';
      for (let i = 0; i < 6; i++) {
        const y = i * 1.1 + rnd() * 0.5, a = 0.25 + rnd() * 0.5;
        s += `<path d="M0,${r2(y)}C12,${r2(y - a)} 24,${r2(y + a)} 36,${r2(y)}" fill="none" stroke="${i % 2 ? '#f2d6ad' : '#2a1608'}" stroke-opacity="${r2(0.16 + rnd() * 0.22)}" stroke-width="${r2(0.12 + rnd() * 0.2)}"/>`;
      }
      return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="36" height="6.6">${s}</pattern>`;
    },
    horn: (id, rnd) => {
      let s = '';
      for (let i = 0; i < 9; i++) s += ell([rnd() * 56, rnd() * 22], 6 + rnd() * 12, 0.5 + rnd() * 1.3, (rnd() - 0.5) * 10, `fill="${i % 2 ? '#fff' : '#000'}" fill-opacity="${r2(0.1 + rnd() * 0.16)}"`);
      return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="56" height="22">${s}</pattern>`;
    },
    carbon: id => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="2.4" height="2.4">` +
      '<path d="M0,0H1.2V1.2H0ZM1.2,1.2H2.4V2.4H1.2Z" fill="#fff" fill-opacity=".13"/>' +
      '<path d="M0,1.2L1.2,0M1.2,2.4L2.4,1.2" stroke="#000" stroke-opacity=".3" stroke-width=".25"/></pattern>'
  };
  const FINISH = {
    gloss: null, satin: null, matte: null,
    brushed: id => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="30" height="2.1">` +
      '<path d="M0,.3H30M3,1H27M0,1.6H30" stroke="#fff" stroke-opacity=".34" stroke-width=".13"/>' +
      '<path d="M0,.65H22M8,1.3H30" stroke="#000" stroke-opacity=".3" stroke-width=".13"/></pattern>',
    hammered: (id, rnd) => {
      let s = '';
      for (let i = 0; i < 7; i++) {
        const c = [0.8 + rnd() * 5.4, 0.8 + rnd() * 5.4], r = 0.55 + rnd() * 0.5;
        s += circ(c, r, 'fill="#000" fill-opacity=".2"') + `<path d="M${r2(c[0] - r)},${r2(c[1])}A${r2(r)},${r2(r)} 0 0 1 ${r2(c[0] + r)},${r2(c[1])}" fill="none" stroke="#fff" stroke-opacity=".42" stroke-width=".16"/>`;
      }
      return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="7" height="7">${s}</pattern>`;
    }
  };

  function material(id, P, G, lod, y0, y1, defs) {
    const col = G.col, rnd = rng(1 + AXES.length * 7 + Math.round(P.blotch * 10) + Math.round(P.pcon * 100));
    const shell = P.pcon > 0;
    if (shell) {
      const sz = P.blotch, sx = PDIR[P.pdir][0], ang = PDIR[P.pdir][1];
      const rxMax = sz * 0.85 * sx;
      const tw = clamp(sz * 11 * Math.pow(sx, 0.75), Math.max(12, rxMax * 2.3), 220), th = clamp(sz * 8, 9, 90);
      const n = lod ? 20 : 46;
      let s = '';
      for (let i = 0; i < n; i++) {
        const c = [rnd() * tw, rnd() * th], rx = sz * (0.35 + 0.5 * rnd()) * sx, ry = sz * (0.3 + 0.45 * rnd());
        const rot = ang === null ? rnd() * 180 : ang + (rnd() - 0.5) * 24;
        const at = `fill="${col.pc.c}" fill-opacity="${r2(P.pcon * (0.45 + 0.5 * rnd()) * (col.pc.a || 1))}"`;
        const reach = Math.max(rx, ry);
        for (const dx of [0, c[0] < reach ? tw : c[0] > tw - reach ? -tw : null]) {
          if (dx === null) continue;
          for (const dy of [0, c[1] < reach ? th : c[1] > th - reach ? -th : null]) {
            if (dy === null) continue;
            s += ell([c[0] + dx, c[1] + dy], rx, ry, rot, at);
          }
        }
      }
      defs.push(`<pattern id="${id}sp" patternUnits="userSpaceOnUse" width="${r2(tw)}" height="${r2(th)}">${s}</pattern>`);
    }
    const tex = TEXTURE[P.mat], fin = FINISH[P.finish];
    if (tex) defs.push(tex(id + 'tx', rnd, lod));
    if (fin) defs.push(fin(id + 'fn', rnd, lod));
    const sh = SHADE[P.finish], metal = P.mat === 'metal';
    const stops = metal
      ? [[0, '#fff', sh[0] + 0.12], [0.3, '#000', 0.1], [0.52, '#fff', sh[0] * 0.8 + 0.05], [0.74, '#000', 0.12], [1, '#000', sh[1] + 0.06]]
      : P.mat === 'injected'
        ? [[0, '#fff', sh[0] * 0.45], [0.5, '#fff', 0], [1, '#000', sh[1] * 0.6]]
        : [[0, '#fff', sh[0]], [0.3, '#fff', 0], [0.6, '#000', 0], [1, '#000', sh[1]]];
    defs.push(`<linearGradient id="${id}sd" gradientUnits="userSpaceOnUse" x1="0" y1="${r2(y0)}" x2="0" y2="${r2(y1)}">` +
      stops.map(q => `<stop offset="${q[0]}" stop-color="${q[1]}" stop-opacity="${r2(q[2])}"/>`).join('') + '</linearGradient>');

    // Paint the shape `ref` (an id in <defs>). t: base, opacity, sw (stroke as body), plain, over.
    return function layers(ref, t) {
      t = t || {};
      const base = t.base || col.C, op = t.opacity == null ? 1 : t.opacity;
      const edge = t.edge || mix(base[0] === '#' ? base : col.C, '#000', 0.5);
      const sw = t.sw || 0;
      const body = paint => (t.strokeOnly ? 'fill="none"' : `fill="${paint}"`) + (sw ? ` stroke="${paint}" stroke-width="${r2(sw)}" stroke-linejoin="round"` : '');
      const use = a => `<use href="#${ref}" ${a}/>`;
      let s = '';
      if (lod && op === 1) {
        s += use(`fill="${t.strokeOnly ? 'none' : edge}" stroke="${edge}" stroke-width="${r2(sw + 0.6)}" stroke-linejoin="round"`);
      } else if (!lod) {
        defs.push(`<mask id="${ref}m" maskUnits="userSpaceOnUse" x="-500" y="-500" width="1000" height="1000">` +
          '<rect x="-500" y="-500" width="1000" height="1000" fill="#fff"/>' +
          use(`fill="${t.strokeOnly ? 'none' : '#000'}"` + (sw ? ` stroke="#000" stroke-width="${r2(sw)}" stroke-linejoin="round"` : '')) + '</mask>');
        s += use(`fill="none" stroke="${edge}" stroke-width="${r2(sw + 0.7)}" stroke-linejoin="round" mask="url(#${ref}m)"` + (op < 1 ? ` opacity="${r2(0.45 + op * 0.55)}"` : ''));
      }
      s += `<g${op < 1 ? ` opacity="${r2(op)}"` : ''}>`;
      s += use(body(base) + (lod && op < 1 ? ` stroke="${edge}" stroke-width=".35"` : ''));
      if (t.over) s += t.over;
      if (!t.plain) {
        if (shell) s += use(body(`url(#${id}sp)`));
        if (tex) s += use(body(`url(#${id}tx)`));
      }
      if (fin) s += use(body(`url(#${id}fn)`));
      s += use(body(`url(#${id}sd)`));
      return s + '</g>';
    };
  }

  // --------------------------------------------------- small part tables
  // Bridge underside, from the right attach point (xb, yb) to the left.
  const UNDER = {
    saddle: (xb, yb, A) => `Q0,${r2(yb - 2.3 * A - 1.2)} ${r2(-xb)},${r2(yb)}`,
    flat: (xb, yb) => `L${r2(-xb)},${r2(yb)}`,
    keyhole: (xb, yb, A, kr) => (kr > 1.2
      ? `L${r2(kr * 0.72)},${r2(yb)}A${r2(kr)},${r2(kr)} 0 1 0 ${r2(-kr * 0.72)},${r2(yb)}L${r2(-xb)},${r2(yb)}`
      : `L${r2(-xb)},${r2(yb)}`)
  };
  // Top edge of a one-line top, from the left shoulder (-xT, yS) to the right.
  const TOPLINE = {
    follow: null,
    flat: (xT, yS, y0) => `L${r2(-xT)},${r2(y0 + 1)}Q${r2(-xT)},${r2(y0)} ${r2(-xT + 1)},${r2(y0)}L${r2(xT - 1)},${r2(y0)}Q${r2(xT)},${r2(y0)} ${r2(xT)},${r2(y0 + 1)}`,
    arc: (xT, yS, y0) => `L${r2(-xT)},${r2(y0 + 2.5)}Q0,${r2(y0 - 7)} ${r2(xT)},${r2(y0 + 2.5)}`,
    dip: (xT, yS, y0, cx) => `L${r2(-xT)},${r2(y0)}L${r2(-cx * 0.85)},${r2(y0 - 0.6)}Q0,${r2(y0 + 9.5)} ${r2(cx * 0.85)},${r2(y0 - 0.6)}L${r2(xT)},${r2(y0)}`
  };
  // Rivet heads, centre c, size r.
  const ngon = (c, r, n, rot) => {
    const p = [];
    for (let i = 0; i < n; i++) p.push([c[0] + r * Math.cos(rot + TAU * i / n), c[1] + r * Math.sin(rot + TAU * i / n)]);
    return p;
  };
  const RIVET = {
    round: (c, r) => circ(c, r),
    diamond: (c, r) => `<path d="${poly(ngon(c, r * 1.25, 4, 0))}"/>`,
    bar: (c, r) => `<rect x="${r2(c[0] - r * 1.35)}" y="${r2(c[1] - r * 0.5)}" width="${r2(r * 2.7)}" height="${r2(r)}" rx="${r2(r * 0.3)}"/>`,
    triangle: (c, r, sd) => `<path d="${poly(ngon(c, r * 1.3, 3, sd > 0 ? 0 : Math.PI))}"/>`,
    star: (c, r) => {
      const p = [];
      for (let i = 0; i < 10; i++) { const q = i % 2 ? r * 0.55 : r * 1.35, a = -Math.PI / 2 + TAU * i / 10; p.push([c[0] + q * Math.cos(a), c[1] + q * Math.sin(a)]); }
      return `<path d="${poly(p)}"/>`;
    }
  };
  // Screw heads, drawn inside a circle of radius r.
  const SCREW = {
    slot: (c, r) => `<path d="M${r2(c[0] - r * 0.8)},${r2(c[1])}H${r2(c[0] + r * 0.8)}" stroke="#000" stroke-opacity=".7" stroke-width="${r2(r * 0.28)}"/>`,
    cross: (c, r) => `<path d="M${r2(c[0] - r * 0.75)},${r2(c[1])}H${r2(c[0] + r * 0.75)}M${r2(c[0])},${r2(c[1] - r * 0.75)}V${r2(c[1] + r * 0.75)}" stroke="#000" stroke-opacity=".7" stroke-width="${r2(r * 0.24)}"/>`,
    star: (c, r) => `<path d="${poly(ngon(c, r * 0.62, 6, 0))}" fill="#000" fill-opacity=".65"/>`,
    none: () => ''
  };
  // Temple line: offset down from the hinge line, s from 0 at the hinge to 1 at the bend.
  const TLINE = {
    straight: () => 0,
    arched: s => -4.5 * Math.sin(Math.PI * s),
    dropped: s => 6.5 * sstep(0.04, 0.5, s),
    stepped: s => 5 * sstep(0.15, 0.24, s)
  };
  // Temple tips: change to depth near the end, and what is added at the end.
  const TIPS = {
    plain: {},
    paddle: { depth: (d, u, L) => (u > L - 32 ? d * (1 + 0.9 * Math.pow(Math.sin(Math.PI * (u - (L - 32)) / 32), 0.9)) : d) },
    ball: { end: (c, d) => circ(c, clamp(d * 0.6, 2, 4.6)) },
    hook: { hook: true }
  };
  // Tip coverings over the last part of a temple.
  const TIPG = {
    bare: null,
    sleeve: { fill: '#2a2c30' },
    ribbed: { fill: '#2a2c30', ribs: 2.1 },
    wrapped: { fill: '#b9a37a', hatch: 1.5 }
  };
  const SIDE = {
    none: null,
    cups: { fill: '#3b2e25', a: 1, stroke: '#211811', stitch: true },
    clear: { fill: '#dbe8ef', a: 0.45, stroke: '#7e94a2' },
    mesh: { mesh: true, a: 1, stroke: '#4a4d52' }
  };
  const PADM = {
    soft: c => ({ fill: '#eef3f6', a: 0.72, stroke: '#9fb0bb' }),
    hard: c => ({ fill: '#fbfdfe', a: 0.4, stroke: '#6f828e', shine: true }),
    metal: c => ({ fill: c.hw, a: 1, stroke: mix(c.hw, '#000', 0.45) }),
    frame: c => ({ fill: c.C, a: 1, stroke: c.edge })
  };
  const COAT = { none: ['#ffffff', 0.44], green: ['#8dffbd', 0.26], blue: ['#9ccfff', 0.26], violet: ['#d3b0ff', 0.26], gold: ['#ffe39a', 0.28] };
  const TGRAD = {
    solid: d => [[0, d], [1, d]],
    down: d => [[0, d], [1, d * 0.22]],
    downclear: d => [[0, d], [0.85, 0]],
    double: d => [[0, d], [0.5, d * 0.15], [1, d * 0.85]]
  };
  const SIT = { bridge: 3, high: -6, low: 15 };
  // Lens zones for near and far, drawn in the right lens (c is the centre of
  // the largest circle that fits, r its radius; the nose is toward -x).
  const SEG = {
    single: () => '',
    dseg: (c, r) => { const w = Math.min(28, r * 1.25), x0 = c[0] - 1.5 - w / 2, y0 = c[1] + r * 0.2; return `<path d="M${r2(x0)},${r2(y0)}H${r2(x0 + w)}A${r2(w / 2)},${r2(w * 0.62)} 0 0 1 ${r2(x0)},${r2(y0)}Z"/>`; },
    round: (c, r) => circ([c[0] - 1.5, c[1] + r * 0.72], Math.min(11, r * 0.55)),
    exec: (c, r) => `<path d="M${r2(c[0] - 80)},${r2(c[1] + r * 0.12)}H${r2(c[0] + 80)}M${r2(c[0] - 80)},${r2(c[1] + r * 0.12 + 0.7)}H${r2(c[0] + 80)}"/>`,
    tri: (c, r) => { const w = Math.min(28, r * 1.25), x0 = c[0] - 1.5 - w / 2, y0 = c[1] + r * 0.2; return `<path d="M${r2(x0)},${r2(y0)}H${r2(x0 + w)}A${r2(w / 2)},${r2(w * 0.62)} 0 0 1 ${r2(x0)},${r2(y0)}ZM${r2(x0)},${r2(y0)}V${r2(y0 - r * 0.28)}H${r2(x0 + w)}V${r2(y0)}"/>`; },
    efocus: (c, r) => circ([c[0], c[1] + r * 0.22], r * 0.62) + circ([c[0], c[1] + r * 0.22], r * 0.62 - 0.7) +
      `<path d="M${r2(c[0] + r * 0.62)},${r2(c[1] + r * 0.22)}L${r2(c[0] + 80)},${r2(c[1] - r * 0.3)}"/>`,
    dial: () => ''   // drawn on the frame, see front view
  };

  // ============================================================== FRONT
  function viewFront(P, G, o) {
    const id = o.idp, lod = o.lod, worn = !!o.worn;
    const defs = [], out = [];
    const { L, glass, O, T, cx, shield, hasRim, ye, xo, xl, xe, col } = G;
    const hw = col.hw, hwEdge = mix(hw, '#000', 0.45);
    const Lm = mirror(L);
    const both = f => f(1) + f(-1);

    // glass outline, clip to glass, clip to everything but glass
    const glassD = shield ? poly(G.SH) : poly(L) + poly(Lm);
    defs.push(`<path id="${id}gl" d="${glassD}"/>`);
    defs.push(`<clipPath id="${id}cl"><use href="#${id}gl"/></clipPath>`);
    defs.push(`<clipPath id="${id}nl"><path clip-rule="evenodd" d="M-500,-500H500V500H-500Z${glassD}"/></clipPath>`);

    const layers = material(id, P, G, lod, G.yTop, G.yBot, defs);

    // ---- behind the front: temples seen end-on, strap stubs, nose pads
    if (!worn && G.temples) {
      const dark = mix(col.Ct, '#000', 0.25);
      out.push(both(s => `<rect x="${r2(s > 0 ? xe - P.tthick : -xe)}" y="${r2(ye - P.tdepth / 2)}" width="${r2(P.tthick)}" height="${r2(P.tdepth)}" rx=".4" fill="${dark}"${P.tcol !== 'metal' && P.clarity < 1 ? ` fill-opacity="${P.clarity}"` : ''}/>`));
    }
    if (!worn && P.hold === 'strap') {
      out.push(both(s => `<path d="M${r2(s * (xe - 1))},${r2(ye - 7)}L${r2(s * (xe + 8))},${r2(ye - 5.5)}V${r2(ye + 5.5)}L${r2(s * (xe - 1))},${r2(ye + 7)}Z" fill="${STRAP}"/>` +
        `<path d="M${r2(s * (xe + 1))},${r2(ye - 3)}H${r2(s * (xe + 8))}M${r2(s * (xe + 1))},${r2(ye)}H${r2(s * (xe + 8))}M${r2(s * (xe + 1))},${r2(ye + 3)}H${r2(s * (xe + 8))}" stroke="#fff" stroke-opacity=".18" stroke-width=".3"/>`));
    }
    // nose pads sit behind the lenses and show through them
    const padY = G.padY;
    if (P.pads === 'arms' || P.pads === 'fixed') {
      const pm = PADM[P.padm](col), len = P.padsz, wid = P.padsz / P.padr;
      const px = P.pads === 'arms' ? Math.max(G.xnPad - 1.2, wid * 0.42 + 0.6) : Math.max(G.xnPad - wid * 0.28, wid * 0.4 + 0.4);
      out.push(both(s => {
        const c = [s * px, padY + 1];
        let m = '';
        if (P.pads === 'arms') m += `<path d="M${r2(s * (G.xnPad + 1.5))},${r2(padY - 5.5)}Q${r2(s * (px - 2.5))},${r2(padY - 6)} ${r2(c[0])},${r2(c[1] - 1)}" fill="none" stroke="${hw}" stroke-width=".55"/>`;
        m += ell(c, wid / 2, len / 2, -s * 16, `fill="${pm.fill}" fill-opacity="${pm.a}" stroke="${pm.stroke}" stroke-width=".3"`);
        if (pm.shine && !lod) m += ell([c[0] - s * wid * 0.12, c[1] - len * 0.12], wid * 0.14, len * 0.26, -s * 16, 'fill="#fff" fill-opacity=".8"');
        if (P.pads === 'arms') m += circ(c, 0.55, `fill="${hw}"`);
        return m;
      }));
    } else if (P.pads === 'strip') {
      const x = Math.max(G.xnPad - 0.6, 3), yA = G.ybr + 2;
      out.push(`<path d="M${r2(-x)},${r2(padY + 6)}C${r2(-x)},${r2(yA)} ${r2(x)},${r2(yA)} ${r2(x)},${r2(padY + 6)}" fill="none" stroke="#8fa3af" stroke-width="2.9" stroke-linecap="round"/>` +
        `<path d="M${r2(-x)},${r2(padY + 6)}C${r2(-x)},${r2(yA)} ${r2(x)},${r2(yA)} ${r2(x)},${r2(padY + 6)}" fill="none" stroke="#eef3f6" stroke-width="2.3" stroke-linecap="round"/>`);
    }

    // ---- the lenses
    const lensUse = a => `<use href="#${id}gl" ${a}/>`;
    out.push(lensUse(`fill="${GLASS}" fill-opacity=".2"`));
    let dens = P.tintd, tcol = col.tint;
    if (dens > 0) {
      defs.push(`<linearGradient id="${id}tg" x1="0" y1="0" x2="0" y2="1">` +
        TGRAD[P.tgrad](dens).map(q => `<stop offset="${q[0]}" stop-color="${tcol}" stop-opacity="${r2(q[1])}"/>`).join('') + '</linearGradient>');
      out.push(lensUse(`fill="url(#${id}tg)"`));
    }
    if (worn && P.adapt !== 'fixed') out.push(lensUse(`fill="${tcol}" fill-opacity=".72"`));   // outdoors
    if (P.mirror > 0) {
      const h = P.mirh, st = h < 0
        ? ['#eef3f7', '#8fa0af', '#dfe7ee', '#5c6a78']
        : [hsl(h + 25, 0.8, 0.78), hsl(h, 0.75, 0.5), hsl(h - 20, 0.8, 0.68), hsl(h - 35, 0.7, 0.32)];
      defs.push(`<linearGradient id="${id}mg" x1="0" y1="0" x2=".25" y2="1">` +
        `<stop offset="0" stop-color="${st[0]}"/><stop offset=".45" stop-color="${st[1]}"/><stop offset=".56" stop-color="${st[2]}"/><stop offset="1" stop-color="${st[3]}"/></linearGradient>`);
      out.push(lensUse(`fill="url(#${id}mg)" fill-opacity="${r2(P.mirror * 0.88)}"`));
    }
    // what lies on or in the glass
    const ic = G.ic, ir = G.ir;
    let inR = '', inBoth = '';
    const segMark = SEG[P.seg](ic, ir);
    if (segMark) inBoth += `<g fill="#ffffff" fill-opacity=".07" stroke="#55616c" stroke-opacity=".6" stroke-width=".3">${segMark}</g>`;
    if (P.seg === 'dial') inBoth += `<path d="${poly(L.map(p => [p[0] + 1.5, p[1]]))}" fill="none" stroke="#55616c" stroke-opacity=".4" stroke-width=".25"/>`;
    if (P.vent === 'slots') {
      inBoth += [-0.5, 0, 0.5].map(k => `<rect x="${r2(ic[0] + k * ir - 2.6)}" y="${r2(ic[1] - ir * 0.84)}" width="5.2" height="1.2" rx=".6" fill="${PAPER}" fill-opacity=".9" stroke="#55616c" stroke-width=".25"/>`).join('');
    } else if (P.vent === 'holes') {
      inBoth += [-0.42, 0, 0.42].map(k => circ([ic[0] + ir * 0.8, ic[1] + k * ir], 0.95, `fill="${PAPER}" fill-opacity=".9" stroke="#55616c" stroke-width=".25"`)).join('');
    }
    if (P.disp !== 'none') {
      const dx = ic[0] + ir * 0.08, dy = ic[1] - ir * 0.3, w = Math.min(15, ir * 1.1), h = w * 0.62;
      const d = `<rect x="${r2(dx - w / 2)}" y="${r2(dy - h / 2)}" width="${r2(w)}" height="${r2(h)}" rx=".8" fill="#7cc7ff" fill-opacity=".14" stroke="#2f7fb8" stroke-opacity=".7" stroke-width=".25"/>` +
        (lod ? '' : `<path d="M${r2(dx - w * 0.25)},${r2(dy - h / 2)}V${r2(dy + h / 2)}M${r2(dx)},${r2(dy - h / 2)}V${r2(dy + h / 2)}M${r2(dx + w * 0.25)},${r2(dy - h / 2)}V${r2(dy + h / 2)}" stroke="#2f7fb8" stroke-opacity=".35" stroke-width=".15"/>`) +
        `<path d="M${r2(dx + w / 2)},${r2(dy - h / 2)}L${r2(dx + 80)},${r2(dy - h * 0.2)}V${r2(dy + h * 0.2)}L${r2(dx + w / 2)},${r2(dy + h / 2)}Z" fill="#7cc7ff" fill-opacity=".1"/>`;
      if (P.disp === 'both') inBoth += d; else inR += d;
    }
    if (P.adapt === 'switch') inBoth += `<path d="M${r2(ic[0] + ir * 0.2)},${r2(ic[1] - ir * 0.95)}L${r2(ic[0] + 80)},${r2(ic[1] - ir * 0.6)}" fill="none" stroke="#8a6a2c" stroke-opacity=".7" stroke-width=".22"/>` + circ([ic[0] + ir * 0.2, ic[1] - ir * 0.95], 0.5, 'fill="#c9a24a"');
    const gl = COAT[P.coat];
    let glints = '';
    for (const s of [1, -1]) {
      const c = [s * cx, 0], r = Math.min(P.lw, P.lh) / 2;
      glints += `<path d="M${r2(c[0] - 0.62 * r)},${r2(c[1] - 1.6 * r)}h${r2(0.34 * r)}L${r2(c[0] - 0.95 * r)},${r2(c[1] + 1.6 * r)}h${r2(-0.34 * r)}Z" fill="${gl[0]}" fill-opacity="${gl[1]}"/>`;
      if (!lod) glints += `<path d="M${r2(c[0] - 0.14 * r)},${r2(c[1] - 1.6 * r)}h${r2(0.1 * r)}L${r2(c[0] - 0.47 * r)},${r2(c[1] + 1.6 * r)}h${r2(-0.1 * r)}Z" fill="${gl[0]}" fill-opacity="${r2(gl[1] * 0.7)}"/>`;
    }
    // bare lens edge, where no rim covers it
    let edgeMarks = '';
    const exposed = runs(G.NG, i => T[i] < 0.2);
    if (exposed.length && P.rim !== 'full' && P.rim !== 'browwire') {
      const w = Math.max(0.9, P.lthick * 0.45);
      const EDGE = {
        matte: d => `<path d="${d}" fill="none" stroke="#8795a0" stroke-opacity=".9" stroke-width="${r2(w * 2)}"/>`,
        polished: d => `<path d="${d}" fill="none" stroke="#ffffff" stroke-opacity=".95" stroke-width="${r2(w * 2)}"/><path d="${d}" fill="none" stroke="#2f3a44" stroke-opacity=".9" stroke-width=".5"/>`,
        faceted: d => `<path d="${d}" fill="none" stroke="#e7eef3" stroke-opacity=".95" stroke-width="${r2(w * 3.6)}"/><path d="${d}" fill="none" stroke="#2f3a44" stroke-opacity=".7" stroke-width="${r2(w * 3.6)}" stroke-dasharray=".35 2.2"/><path d="${d}" fill="none" stroke="#2f3a44" stroke-opacity=".8" stroke-width=".4"/>`
      };
      for (const run of exposed) {
        const pts = run.map(i => glass[i]);
        edgeMarks += EDGE[P.ledge](poly(pts, false));
        if (!shield) edgeMarks += EDGE[P.ledge](poly(mirror(pts), false));
      }
    }
    out.push(`<g clip-path="url(#${id}cl)">${edgeMarks}<g>${inBoth}${inR}</g>` + (inBoth ? `<g transform="scale(-1,1)">${inBoth}</g>` : '') + glints + '</g>');
    out.push(lensUse('fill="none" stroke="#6d8493" stroke-opacity=".75" stroke-width=".3"'));

    // wire or cord under a brow piece
    if (P.rim === 'browwire') {
      const W = glass.map((p, i) => [p[0] + G.nr[i][0] * 0.95, p[1] + G.nr[i][1] * 0.95]);
      const d = poly(W) + poly(rev(glass)) + (shield ? '' : poly(mirror(W)) + poly(rev(Lm)));
      out.push(`<path d="${d}" fill="${hw}" stroke="${hwEdge}" stroke-width=".2"/>`);
    } else if (P.rim === 'browcord') {
      for (const run of exposed) {
        const pts = run.map(i => [glass[i][0] + G.nr[i][0] * 0.2, glass[i][1] + G.nr[i][1] * 0.2]);
        out.push(line(pts, '#aab6bf', 0.4) + (shield ? '' : line(mirror(pts), '#aab6bf', 0.4)));
      }
    }

    // ---- the front itself: rims, bridge, corners, top line, handle
    const F = [], Cp = [];
    if (hasRim) {
      // only where the rim has thickness, so a brow piece leaves the rest of the lens bare
      const rr = runs(G.NG, i => T[i] >= 0.12);
      let d = '';
      if (rr.length === 1 && rr[0].length > G.NG) d = poly(O) + poly(rev(glass));
      else for (const run of rr) d += poly(run.map(i => O[i]).concat(rev(run.map(i => glass[i]))));
      F.push(`<path d="${d}"/>`);
      if (!shield) F.push(`<g transform="scale(-1,1)"><path d="${d}"/></g>`);
    }
    if (!shield) {
      const f0 = BHF[P.bh];
      const D0 = hasRim ? (P.bdepth || clamp(P.rimt * 1.6, 1.2, 7)) : (P.bdepth || 1);
      const bars = [{ f: f0, D: D0, main: true }];
      if (P.bbars >= 2) bars.push({ f: P.rim === 'lower' ? f0 + 0.2 : f0 <= 0.12 ? f0 + 0.2 : 0.03, D: Math.min(D0, 1.8) });
      if (P.bbars >= 3) bars.push({ f: f0 < 0.5 ? f0 + 0.24 : f0 - 0.24, D: Math.min(D0, 1.8) });
      const src = hasRim ? O : L, ext = hasRim ? Math.min(P.rimt * 0.6, 2.5) : 3;
      const A = P.barch * P.dbl * 0.22;
      for (const b of bars) {
        const yc = -P.lh / 2 + b.f * P.lh;
        const under = b.main && hasRim ? P.bunder : b.main ? 'flat' : 'saddle';
        const kr = Math.min(P.dbl * 0.3, Math.max(0, xAt(src, yc, 'min')) * 0.92);
        let D = b.D;
        if (under === 'keyhole' && kr > 1.2) D = Math.max(D, 2 * kr + 1.6);
        const yT = yc - D / 2, yB = yc + D / 2;
        const xa = xAt(src, yT, 'min') + ext, xb = xAt(src, yB, 'min') + ext;
        const und = under === 'flat' && !hasRim ? `Q0,${r2(yB - 2 * A)} ${r2(-xb)},${r2(yB)}` : UNDER[under](xb, yB, A, kr);
        Cp.push(`<path d="M${r2(-xa)},${r2(yT)}Q0,${r2(yT - 2 * A)} ${r2(xa)},${r2(yT)}L${r2(xb)},${r2(yB)}${und}Z"/>`);
      }
    }
    if (G.hasSide) {
      const ho = G.ho, hr = ho * 1.2 + (hasRim ? Math.min(P.rimt, 4) * 0.3 : 0);
      const xr = hasRim ? (xl + xo) / 2 : xl - 3.2, q = Math.min(0.9, ho * 0.3);
      if (!hasRim) {
        Cp.push(both(s => `<path d="M${r2(s * (xl - 6))},${r2(ye - 1.5)}L${r2(s * (xl + 0.3))},${r2(ye - 1.5)}L${r2(s * (xe - q))},${r2(ye - ho / 2)}Q${r2(s * xe)},${r2(ye - ho / 2)} ${r2(s * xe)},${r2(ye - ho / 2 + q)}L${r2(s * xe)},${r2(ye + ho / 2 - q)}Q${r2(s * xe)},${r2(ye + ho / 2)} ${r2(s * (xe - q))},${r2(ye + ho / 2)}L${r2(s * (xl + 0.3))},${r2(ye + 1.5)}L${r2(s * (xl - 6))},${r2(ye + 1.5)}Z"/>`));
      } else Cp.push(both(s => `<path d="M${r2(s * xr)},${r2(ye - hr / 2)}L${r2(s * (xe - q))},${r2(ye - ho / 2)}Q${r2(s * xe)},${r2(ye - ho / 2)} ${r2(s * xe)},${r2(ye - ho / 2 + q)}L${r2(s * xe)},${r2(ye + ho / 2 - q)}Q${r2(s * xe)},${r2(ye + ho / 2)} ${r2(s * (xe - q))},${r2(ye + ho / 2)}L${r2(s * xr)},${r2(ye + hr / 2)}Z"/>`));
    }
    const top = TOPLINE[P.topline];
    if (top && hasRim) {
      let iS = 0;
      for (let i = 1; i < O.length; i++) if (O[i][0] > O[iS][0]) iS = i;
      const xT = O[iS][0], yS = O[iS][1], y0 = G.yTop;
      const bar = clamp(P.rimt * Math.max(1, P.rbrow), 2.5, 9);
      const yU = y0 + bar + (P.topline === 'dip' ? 4.6 : 0), xU = shield ? 0 : xAt(O, y0 + bar, 'min') + 1;
      const under = shield ? `L${r2(cx)},0L0,${r2(yU)}L${r2(-cx)},0`
        : `L${r2(cx)},0L${r2(xU)},${r2(y0 + bar)}Q0,${r2(2 * yU - y0 - bar)} ${r2(-xU)},${r2(y0 + bar)}L${r2(-cx)},0`;
      Cp.push(`<path d="M${r2(-xT)},${r2(yS)}${top(xT, yS, y0, cx)}L${r2(xT)},${r2(yS)}${under}Z"/>`);
    }
    if (P.pads === 'moulded' && hasRim) {
      Cp.push(both(s => ell([s * (G.xnPad - 0.3), padY + 1], 1.7, 4.4, -s * 14)));
    }
    if (P.hold === 'handle') {
      const hx = xe + 2.2, hy = ye, ang = 9 * RAD, len = 82;
      const tip = [hx + Math.sin(ang) * len, hy + Math.cos(ang) * len];
      Cp.push(`<path d="M${r2(xe - 1)},${r2(hy - 2.6)}H${r2(hx + 3.6)}L${r2(tip[0] + 2.8)},${r2(tip[1])}A2.8,2.8 0 0 1 ${r2(tip[0] - 2.8)},${r2(tip[1])}L${r2(hx - 3.2)},${r2(hy + 3)}H${r2(xe - 1)}Z"/>`);
    }
    defs.push(`<g id="${id}F">${F.join('')}<g${hasRim ? ` clip-path="url(#${id}nl)"` : ''}>${Cp.join('')}</g></g>`);

    // colour of the front: fade and layers
    let base = col.C, over = '';
    if (P.fade !== 'none') {
      const FADE = {
        lighter: () => [mix(col.C, '#fff', 0.6), 1],
        clear: () => [col.C, 0.12],
        second: () => [col.C2.c, col.C2.a || 1]
      };
      const e = FADE[P.fade]();
      defs.push(`<linearGradient id="${id}fd" gradientUnits="userSpaceOnUse" x1="0" y1="${r2(G.yTop)}" x2="0" y2="${r2(G.yBot)}">` +
        `<stop offset=".15" stop-color="${col.C}"/><stop offset=".9" stop-color="${e[0]}" stop-opacity="${e[1]}"/></linearGradient>`);
      base = `url(#${id}fd)`;
    }
    if (P.lam === 'brow') {
      defs.push(`<clipPath id="${id}bc"><rect x="-500" y="-500" width="1000" height="${r2(500 - P.lh * 0.14)}"/></clipPath>`);
      over = `<g clip-path="url(#${id}bc)"><use href="#${id}F" fill="${PAPER}"/><use href="#${id}F" fill="${col.C2.c}" fill-opacity="${col.C2.a || 1}"/></g>`;
    }
    if (P.glow === 'phos') {
      out.push(`<use href="#${id}F" fill="none" stroke="#c4ff6e" stroke-opacity=".22" stroke-width="8" stroke-linejoin="round"/>` +
        `<use href="#${id}F" fill="none" stroke="#c4ff6e" stroke-opacity=".4" stroke-width="3.6" stroke-linejoin="round"/>`);
    }
    const opq = P.clarity;
    out.push(layers(id + 'F', { base, over, opacity: opq, edge: col.edge }));

    // ---- lines that sit on the rim: layers, edges, engraving
    const onRim = runs(G.NG, i => T[i] >= 0.35);
    const ringLine = (f, stroke, w, extra) => {
      let s = '';
      for (const run of onRim) {
        const pts = run.map(i => [lerp(glass[i][0], O[i][0], f), lerp(glass[i][1], O[i][1], f)]);
        s += line(pts, stroke, w, extra) + (shield ? '' : line(mirror(pts), stroke, w, extra));
      }
      return s;
    };
    if (hasRim) {
      const c2 = col.C2, a2 = c2.a ? ` stroke-opacity="${Math.min(1, c2.a + 0.4)}"` : '';
      if (P.lam === 'frontback') out.push(ringLine(0.16, c2.c, clamp(P.rimt * 0.26, 0.35, 1.6), a2));
      if (P.lam === 'stripe') out.push(ringLine(0.88, c2.c, clamp(P.rimt * 0.14, 0.3, 0.9), a2));
      const g = { gloss: 1, satin: 0.6, matte: 0.3, brushed: 0.55, hammered: 0.55 }[P.finish];
      const lightOn = lum(col.C) < 0.82 ? '#ffffff' : '#000000';
      const BEVEL = {
        rounded: () => ringLine(0.55, lightOn, clamp(P.rimt * 0.3, 0.25, 1.7), `stroke-opacity="${r2(0.2 * g)}" stroke-linecap="round"`),
        flat: () => ringLine(0.1, '#000000', 0.28, 'stroke-opacity=".4"') + ringLine(0.96, lightOn, 0.2, `stroke-opacity="${r2(0.35 * g)}"`),
        chamfer: () => ringLine(0.8, lightOn, clamp(P.rimt * 0.16, 0.25, 0.9), `stroke-opacity="${r2(0.42 * g)}"`) + ringLine(0.2, '#000000', clamp(P.rimt * 0.16, 0.25, 0.9), 'stroke-opacity=".3"'),
        knife: () => ringLine(0.5, lightOn, 0.26, `stroke-opacity="${r2(0.6 * g)}"`) + ringLine(0.5, '#000000', clamp(P.rimt * 0.45, 0.3, 2.4), 'stroke-opacity=".12"')
      };
      out.push(BEVEL[P.bevel]());
      if (P.engr !== 'none' && !lod) {
        const en = runs(G.NG, i => T[i] >= 0.35 && -G.nr[i][1] > 0.72);
        const dark = lum(col.C) < 0.3 ? mix(col.C, '#fff', 0.45) : mix(col.C, '#000', 0.5);
        for (const run of en) {
          const at = f => run.map((i, k) => {
            const wv = P.engr === 'wave' ? Math.sin(k * 1.1) * 0.12 : 0;
            return [lerp(glass[i][0], O[i][0], f + wv), lerp(glass[i][1], O[i][1], f + wv)];
          });
          const mk = f => (P.engr === 'dots'
            ? line(at(f), dark, 0.45, 'stroke-opacity=".85" stroke-dasharray=".01 .9" stroke-linecap="round"')
            : line(at(f), dark, 0.22, 'stroke-opacity=".85"'));
          const m = P.engr === 'double' ? mk(0.6) + mk(0.82) : mk(0.72);
          out.push(m + (shield ? '' : `<g transform="scale(-1,1)">${m}</g>`));
        }
      }
    }

    // ---- hardware at the corners. Things share this small surface, so they
    // take their places in a fixed order, biggest first: camera, lens mount,
    // lights, rivets. Each moves inward from the one before.
    let cur = hasRim ? xo - 1.4 : xl - 2.2;                 // moves toward the nose
    const hard = [];
    if (P.cam !== 'none') {
      const x = cur - 1.4;
      const one = s => circ([s * x, ye], 2.5, 'fill="#17181b" stroke="#3b3d42" stroke-width=".35"') + circ([s * x, ye], 1.25, 'fill="#2d3a55" stroke="#0c0d10" stroke-width=".3"') +
        circ([s * (x - 0.4), ye - 0.4], 0.32, 'fill="#9bb8e8"') + circ([s * (x + 1.9), ye - 2.2], 0.36, 'fill="#ffffff" stroke="#888" stroke-width=".12"');
      hard.push(one(1) + (P.cam === 'both' ? one(-1) : ''));
      cur -= 5.6;
    }
    if (P.rim === 'none') {
      const MOUNT = {
        two: (s, x, y) => [0, 2.7].map(k => circ([s * (x - k), y], 0.85, `fill="${hw}" stroke="${hwEdge}" stroke-width=".2"`) + SCREW[G.temples && P.hinge === 'barrel' ? P.screw : 'slot']([s * (x - k), y], 0.85)).join(''),
        one: (s, x, y) => circ([s * x, y], 1, `fill="${hw}" stroke="${hwEdge}" stroke-width=".2"`) + SCREW[G.temples && P.hinge === 'barrel' ? P.screw : 'slot']([s * x, y], 1),
        notch: (s, x, y) => `<rect x="${r2(s > 0 ? x - 0.4 : -x - 2.6)}" y="${r2(y - 1.5)}" width="3" height="3" rx=".5" fill="${hw}" stroke="${hwEdge}" stroke-width=".2"/>`
      };
      if (G.hasSide) hard.push(both(s => MOUNT[P.mount](s, cur, ye)));
      if (!shield) {
        const xn = xAt(L, G.ybr, 'min') + 2.2;
        hard.push(both(s => MOUNT[P.mount](s, P.mount === 'two' ? xn + 2.7 : P.mount === 'notch' ? xn - 2.4 : xn, G.ybr)));
      }
      cur -= P.mount === 'two' ? 5.6 : 3;
    }
    if (P.glow === 'leds') {
      const x = G.hasSide && G.endr >= 3 ? xe - 1.5 : (cur -= 2.8, cur + 1.4);
      hard.push(both(s => circ([s * x, ye], 3.4, 'fill="#fff0a0" fill-opacity=".4"') + circ([s * x, ye], 1.15, `fill="#fffbe0" stroke="${hwEdge}" stroke-width=".25"`)));
    }
    if (P.rivn > 0 && hasRim) {
      const r = P.rimt >= 6 ? 1 : 0.85, pos = [], n = O.length;
      let k0 = 0, best = 1e18;
      for (let i = 0; i < n; i++) {
        if (O[i][0] <= 0) continue;
        const d = (O[i][0] - xo) * (O[i][0] - xo) + (O[i][1] - ye) * (O[i][1] - ye);
        if (d < best) { best = d; k0 = i; }
      }
      const down = O[(k0 + 1) % n][1] > O[(k0 + n - 1) % n][1] ? 1 : -1;
      const seg = Math.hypot(O[(k0 + 1) % n][0] - O[k0][0], O[(k0 + 1) % n][1] - O[k0][1]) || 1;
      const onRimAt = mmDown => { const i = (((k0 + down * Math.round(mmDown / seg)) % n) + n) % n; return [lerp(glass[i][0], O[i][0], 0.5), lerp(glass[i][1], O[i][1], 0.5)]; };
      const first = P.cam !== 'none' ? 4.8 : -(P.rivn - 1) * 1.2;
      for (let j = 0; j < P.rivn; j++) pos.push(onRimAt(first + j * 2.4));
      const hi = lod ? '' : both(s => pos.map(p => circ([s * p[0] - 0.22, p[1] - 0.22], 0.2, 'fill="#fff" fill-opacity=".7"')).join(''));
      hard.push(`<g fill="${hw}" stroke="${hwEdge}" stroke-width=".18">` + both(s => pos.map(p => RIVET[P.rivs]([s * p[0], p[1]], r, s)).join('')) + '</g>' + hi);
    }
    if (P.seg === 'dial') {
      let k = 0;
      for (let i = 1; i < L.length; i++) if (O.length === L.length && (O[i][0] - O[i][1]) > (O[k][0] - O[k][1])) k = i;
      const c = shield ? [G.xMax - 5, G.yTop + 4] : [O[k][0] - 1, O[k][1] + 1];
      hard.push(both(s => circ([s * c[0], c[1]], 2.7, `fill="${hw}" stroke="${hwEdge}" stroke-width=".3"`) + circ([s * c[0], c[1]], 1.1, `fill="${hwEdge}"`) +
        (lod ? '' : ngon([s * c[0], c[1]], 2.2, 12, 0).map(p => circ(p, 0.22, `fill="${hwEdge}"`)).join(''))));
    }
    if (P.hold === 'strap') hard.push(both(s => `<rect x="${r2(s > 0 ? xe - 2.2 : -xe + 0.9)}" y="${r2(ye - G.ho * 0.36)}" width="1.3" height="${r2(G.ho * 0.72)}" rx=".5" fill="#111" fill-opacity=".75"/>`));
    if (P.hold === 'handle') hard.push(circ([xe + 1.6, ye], 1.5, `fill="${hw}" stroke="${hwEdge}" stroke-width=".25"`) + circ([xe + 2.2 + Math.sin(9 * RAD) * 79, ye + Math.cos(9 * RAD) * 79], 1.1, `fill="${PAPER}" stroke="${col.edge}" stroke-width=".3"`));
    if (P.hold === 'clip') hard.push(`<circle cx="${r2(G.xMax + 2)}" cy="${r2(-P.lh * 0.12)}" r="2.3" fill="none" stroke="${hw}" stroke-width=".6"/>`);
    out.push(hard.join(''));

    // ---- sun clip over everything
    if (P.clip !== 'none') {
      const dark = '#24272c';
      if (P.clip === 'down') {
        const sc = `<use href="#${id}gl" fill="${dark}" fill-opacity=".64" stroke="#4b5057" stroke-width=".9"/>`;
        const hooks = [];
        for (const a of [58, 122, 238, 302]) {
          const i = Math.round(a / 360 * L.length) % L.length, p = L[i], n = normals(L)[i];
          hooks.push(both(s => `<rect x="${r2(s * (p[0] + n[0] * 0.6) - 0.8)}" y="${r2(p[1] + n[1] * 0.6 - 1.2)}" width="1.6" height="2.4" rx=".4" fill="${hw}" stroke="${hwEdge}" stroke-width=".18"/>`));
        }
        const yb = G.yTop + P.lh * 0.16;
        out.push(sc + hooks.join('') + (shield ? '' : `<path d="M${r2(-P.dbl / 2 - 2)},${r2(yb)}Q0,${r2(yb - 4)} ${r2(P.dbl / 2 + 2)},${r2(yb)}" fill="none" stroke="${hw}" stroke-width=".8"/>`));
      } else {
        const y0 = G.yTop - 1.5;
        const flip = pts => pts.map(p => [p[0], y0 - (p[1] + P.lh / 2) * 0.24]);
        const d = shield ? poly(flip(G.SH)) : poly(flip(L)) + poly(flip(Lm));
        out.push(`<path d="${d}" fill="${dark}" fill-opacity=".86" stroke="#4b5057" stroke-width=".5"/>` +
          `<path d="M${r2(-cx)},${r2(y0 + 0.6)}H${r2(cx)}" stroke="${hw}" stroke-width=".9"/>` + both(s => circ([s * P.dbl / 2, y0 + 0.6], 1.1, `fill="${hw}" stroke="${hwEdge}" stroke-width=".2"`)));
      }
    }

    const W = Math.max(100, xe + 14 + (P.hold === 'handle' ? 16 : 0) + (P.hold === 'strap' ? 6 : 0));
    const y0 = Math.min(-44, G.yTop - 10 - (P.clip === 'up' ? P.lh * 0.26 + 4 : 0));
    const y1 = Math.max(46, G.yBot + 9, P.hold === 'handle' ? ye + 92 : 0, G.temples && P.tbend > 0 ? ye + 38 : 0);
    return {
      defs: defs.join(''), body: out.join(''), box: [-W, y0, 2 * W, y1 - y0],
      anchors: { lensR: [cx, 0], lensLow: [cx, P.lh / 2 - 3], bridge: [0, G.ybr + 3], endR: [xe - 4, ye], face: [0, 0] }
    };
  }

  // ------------------------------------------------------ temple, shared
  // The temple as a centre line with a depth along it, from the hinge at 0,0.
  function temple(P, lod) {
    const L = P.tlen, n = lod ? 44 : 96;
    const curl = P.tbend >= 180, beta = P.tbend * RAD;
    const rb = curl ? 15 : 16, tipLen = P.tbend === 0 ? 0 : curl ? 5 : 34;
    const u1 = L - tipLen, u0 = P.tbend === 0 ? L : Math.max(L * 0.4, u1 - rb * beta);
    const tip = TIPS[P.tipn];
    const pts = [];
    let x = 0, y = 0, pu = 0;
    for (let i = 0; i <= n; i++) {
      const u = L * i / n, um = (u + pu) / 2;
      let phi = um <= u0 ? 0 : um >= u1 ? beta : beta * sstep(0, 1, (um - u0) / (u1 - u0));
      if (tip.hook && um > L - 9) phi += 0.95 * Math.pow((um - (L - 9)) / 9, 2);
      x += Math.cos(phi) * (u - pu); y += Math.sin(phi) * (u - pu); pu = u;
      pts.push([x, y + TLINE[P.tline](Math.min(u, u0) / u0), u]);
    }
    const dAt = u => {
      let d = P.tdepth * (1 + (P.ttaper - 1) * Math.pow(u / L, 1.1));
      if (curl) d = lerp(d, Math.min(d, 1.4), sstep(u0, u0 + 12, u));
      if (tip.depth) d = tip.depth(d, u, L);
      return Math.max(d, 0.9);
    };
    // point at length u, offset `off` toward the top edge
    const at = (u, off) => {
      const f = clamp(u / L, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
      const a = pts[i], b = pts[i + 1], tx = b[0] - a[0], ty = b[1] - a[1], len = Math.hypot(tx, ty) || 1;
      return [lerp(a[0], b[0], t) + (ty / len) * (off || 0), lerp(a[1], b[1], t) - (tx / len) * (off || 0)];
    };
    const ang = u => { const a = at(u - 0.5, 0), b = at(u + 0.5, 0); return Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD; };
    // outline between two lengths, grown by `grow` each side
    const band = (ua, ub, grow, hTop, hBot) => {
      const up = [], dn = [], steps = Math.max(4, Math.round((ub - ua) / (L / n)));
      for (let k = 0; k <= steps; k++) {
        const u = lerp(ua, ub, k / steps), d = dAt(u) / 2 + (grow || 0);
        up.push(at(u, hTop == null ? d : hTop(u, d))); dn.push(at(u, hBot == null ? -d : hBot(u, d)));
      }
      return up.concat(rev(dn));
    };
    let xEnd = 0;
    for (const p of pts) if (p[0] > xEnd) xEnd = p[0];
    return { L, n, pts, u0, u1, dAt, at, ang, band, xEnd, tip };
  }

  // =============================================================== SIDE
  function viewSide(P, G, o) {
    const id = o.idp, lod = o.lod;
    const defs = [], out = [];
    const col = G.col, hw = col.hw, hwEdge = mix(hw, '#000', 0.45);
    const ye = G.ye, ze = G.zf(G.xe, ye), a = P.panto * RAD, ca = Math.cos(a), sa = Math.sin(a), ft = P.fthick;
    const rot = (z, y) => [ze + (z - ze) * ca + (y - ye) * sa, ye + (y - ye) * ca - (z - ze) * sa];
    const proj = p => rot(G.zf(p[0], p[1]), p[1]);
    const layers = material(id, P, G, lod, ye - 22, ye + 30, defs);

    // nose rest, behind the front
    const zN = G.zf(P.dbl / 2, G.padY) + ft, py = G.padY;
    if (P.pads === 'arms' || P.pads === 'fixed') {
      const pm = PADM[P.padm](col), c = rot(zN + (P.pads === 'arms' ? 7.5 : 1.8), py + 1);
      if (P.pads === 'arms') { const s = rot(zN - 0.5, py - 4); out.push(`<path d="M${pt(s)}Q${r2(c[0])},${r2(s[1])} ${pt(c)}" fill="none" stroke="${hw}" stroke-width=".55"/>`); }
      out.push(ell(c, Math.max(1.1, P.padsz / P.padr * 0.16), P.padsz / 2, -P.panto - 8, `fill="${pm.fill}" fill-opacity="${pm.a}" stroke="${pm.stroke}" stroke-width=".3"`));
    } else if (P.pads === 'strip') {
      const p0 = rot(zN - 0.5, py - 6), p1 = rot(zN + 8, py), p2 = rot(zN - 0.5, py + 6);
      out.push(`<path d="M${pt(p0)}Q${pt(p1)} ${pt(p2)}" fill="none" stroke="#8fa3af" stroke-width="2.6" stroke-linecap="round"/><path d="M${pt(p0)}Q${pt(p1)} ${pt(p2)}" fill="none" stroke="#eef3f6" stroke-width="2" stroke-linecap="round"/>`);
    } else if (G.hasRim) {
      const p0 = rot(zN - 1, py - 5), p1 = rot(zN + 6, py + 1), p2 = rot(zN - 1, py + 6);
      out.push(`<path d="M${pt(p0)}Q${pt(p1)} ${pt(p2)}Z" fill="${col.C}" stroke="${col.edge}" stroke-width=".3"/>`);
    }

    // the front, edge-on: its outline carried back by wrap and lens curve
    const half = pts => (G.shield ? pts.filter(p => p[0] >= -0.01) : pts);
    const lensS = half(G.glass).map(proj);
    const tintA = Math.max(0.35, P.tintd);
    out.push(`<path d="${poly(lensS)}" transform="translate(${r2(ft / 2)},0)" fill="${P.tintd ? col.tint : GLASS}" fill-opacity="${r2(tintA)}" stroke="${P.tintd ? col.tint : '#9fb4c2'}" stroke-opacity="${r2(Math.min(1, tintA + 0.3))}" stroke-width="${r2(Math.max(0.8, P.lthick * (G.hasRim ? 0.5 : 1)))}" stroke-linejoin="round"/>`);
    const H = rot(ze + ft + 1.5, ye);
    if (G.hasRim) {
      // only where the rim has thickness, so a bare lens edge stays glass
      const rimRuns = runs(G.NG, i => G.T[i] >= 0.3 && (!G.shield || G.O[i][0] >= -0.01));
      let d = '';
      for (const run of rimRuns) d += poly(run.map(i => proj(G.O[i])), false);
      defs.push(`<path id="${id}sf" d="${d}" transform="translate(${r2(ft / 2)},0)" stroke-linecap="round"/>`);
      out.push(layers(id + 'sf', { sw: ft, opacity: P.clarity, strokeOnly: true }));
    }
    // corner block from the front to the hinge
    if (G.hasSide) {
      const hr = G.ho * 1.15, d0 = G.temples ? Math.max(P.tdepth, 2.2) : G.ho;
      const q0 = rot(ze + ft * 0.3, ye - hr / 2), q1 = rot(ze + ft * 0.3, ye + hr / 2);
      defs.push(`<path id="${id}sl" d="M${pt(q0)}L${r2(H[0])},${r2(H[1] - d0 / 2)}V${r2(H[1] + d0 / 2)}L${pt(q1)}Z"/>`);
      out.push(G.hasRim ? layers(id + 'sl', { opacity: P.clarity }) : `<use href="#${id}sl" fill="${col.C}" stroke="${col.edge}" stroke-width=".3"/>`);
    }
    // sun clip
    if (P.clip === 'down') {
      out.push(`<path d="${poly(lensS)}" transform="translate(-1.6,0)" fill="#24272c" stroke="#24272c" stroke-width="1.1" stroke-linejoin="round"/>`);
    } else if (P.clip === 'up') {
      const t0 = rot(G.zf(G.cx, -P.lh / 2) - 1.5, G.yTop - 1), t1 = [t0[0] - P.lh * 0.36, t0[1] - P.lh * 0.92];
      out.push(`<path d="M${pt(t0)}L${pt(t1)}" stroke="#24272c" stroke-width="1.4" stroke-linecap="round"/>` + circ(t0, 1.1, `fill="${hw}" stroke="${hwEdge}" stroke-width=".2"`));
    }
    if (P.glow === 'phos' && G.hasRim) out.push(`<use href="#${id}sf" fill="none" stroke="#c4ff6e" stroke-opacity=".3" stroke-width="${r2(ft + 5)}" stroke-linejoin="round"/>`);

    let tipPt = [H[0] + 100, H[1]], midPt = [H[0] + 60, H[1]];
    if (P.hold === 'strap') {
      const x0 = H[0] - 0.5, y = H[1], x1 = x0 + 158;
      out.push(`<path d="M${r2(x0)},${r2(y - 6.5)}L${r2(x1)},${r2(y - 9)}l-3,4.5 3,4.5 -3,4.5 3,4.5L${r2(x0)},${r2(y + 6.5)}Z" fill="${STRAP}" stroke="#111" stroke-width=".3"/>` +
        (lod ? '' : [-3.5, 0, 3.5].map(k => `<path d="M${r2(x0 + 2)},${r2(y + k)}L${r2(x1 - 4)},${r2(y + k * 1.25)}" stroke="#fff" stroke-opacity=".16" stroke-width=".35"/>`).join('')) +
        `<rect x="${r2(x0 + 62)}" y="${r2(y - 9.5)}" width="9" height="19" rx="1.2" fill="${hw}" stroke="${hwEdge}" stroke-width=".3"/><rect x="${r2(x0 + 64.4)}" y="${r2(y - 7)}" width="4.2" height="14" rx=".6" fill="${STRAP}"/>`);
      midPt = [x0 + 66, y];
    }
    if (P.hold === 'handle') {
      const p0 = rot(ze + ft * 0.5, ye + 2), p1 = rot(ze + ft * 0.5, ye + 84);
      out.push(`<path d="M${pt(p0)}L${pt(p1)}" stroke="${col.edge}" stroke-width="${r2(Math.max(2.4, ft * 0.8) + 0.6)}" stroke-linecap="round"/><path d="M${pt(p0)}L${pt(p1)}" stroke="${col.C}" stroke-width="${r2(Math.max(2.4, ft * 0.8))}" stroke-linecap="round"/>` + circ(rot(ze + ft * 0.5, ye + 1), 1.6, `fill="${hw}" stroke="${hwEdge}" stroke-width=".25"`));
    }

    // side shield, between front and temple
    const shieldSpec = SIDE[P.side];
    if (shieldSpec && (G.temples || P.hold === 'strap')) {
      const d0 = G.temples ? P.tdepth : 13;
      const A = rot(ze + ft, G.yTop + 1), D = rot(ze + ft, G.yBot - 1);
      const d = `M${pt(A)}Q${r2(H[0] + 22)},${r2(A[1] + 1)} ${r2(H[0] + 36)},${r2(H[1] - d0 / 2)}L${r2(H[0] + 30)},${r2(H[1] + d0 / 2)}Q${r2(H[0] + 14)},${r2(D[1] - 2)} ${pt(D)}Z`;
      if (shieldSpec.mesh) defs.push(`<pattern id="${id}ms" patternUnits="userSpaceOnUse" width="1.5" height="1.5"><rect width="1.5" height="1.5" fill="#2e3136" fill-opacity=".35"/><path d="M0,0L1.5,1.5M1.5,0L0,1.5" stroke="#2e3136" stroke-width=".28"/></pattern>`);
      out.push(`<path d="${d}" fill="${shieldSpec.mesh ? `url(#${id}ms)` : shieldSpec.fill}" fill-opacity="${shieldSpec.a}" stroke="${shieldSpec.stroke}" stroke-width=".4"/>` +
        (shieldSpec.stitch && !lod ? `<path d="${d}" fill="none" stroke="#c9b08a" stroke-width=".25" stroke-dasharray=".9 .7" transform="translate(${r2(H[0] + 8)},${r2(H[1])}) scale(.86) translate(${r2(-H[0] - 8)},${r2(-H[1])})"/>` : ''));
    }

    if (G.temples) {
      const tg = temple(P, lod), TL = tg.L;
      const T2 = p => [p[0] + H[0], p[1] + H[1]];
      const at = (u, off) => T2(tg.at(u, off));
      const band = (ua, ub, grow, hT, hB) => tg.band(ua, ub, grow, hT, hB).map(T2);
      tipPt = at(TL - 18, 0); midPt = at(TL * 0.45, 0);
      const Ct = col.Ct, tEdge = mix(Ct, '#000', 0.5), inkOn = lum(Ct) < 0.45 ? '#ffffff' : '#111111';
      const metalT = P.tcol === 'metal';

      // The temple is one surface shared by many things. They take their
      // places in a fixed order, biggest first, and later ones fall back.
      const hasMod = P.cam !== 'none' || P.disp !== 'none';
      const uMod1 = 18;
      const uAud0 = 0.44 * TL, uAud1 = 0.66 * TL, uTel0 = 0.27 * TL, uTel1 = 0.4 * TL;
      const tele = P.adj === 'telescope';
      const uCut0 = hasMod ? uMod1 + 3 : 0.12 * TL;
      let uCut1 = tele ? uTel0 - 3 : 0.42 * TL;
      if (P.tcut === 'outline' && !tele) uCut1 = Math.min(P.audio === 'bone' ? 0.4 * TL : 0.5 * TL, P.audio === 'open' ? uAud0 - 3 : 1e9, tg.u0 - 6);
      const uPrint = P.tcut === 'outline' && !tele ? uCut1 + 3 : 0.47 * TL;

      // openings cut through the temple
      let holes = '';
      if (P.tcut !== 'solid' && uCut1 - uCut0 > 5) {
        const CUT = {
          slot: () => poly(band(uCut0, uCut1, 0, (u, d) => d * 0.36, (u, d) => -d * 0.36)),
          outline: () => poly(band(uCut0, uCut1, 0, (u, d) => Math.max(d - 1.1, d * 0.55), (u, d) => -Math.max(d - 1.1, d * 0.55))),
          holes: () => {
            let s = '';
            const r = Math.max(0.4, tg.dAt(uCut0) * 0.21);
            for (let u = uCut0 + r; u < uCut1; u += Math.max(r * 2.9, 1.6)) s += poly(ngon(at(u, 0), Math.max(0.35, tg.dAt(u) * 0.21), 14, 0));
            return s;
          }
        };
        holes = CUT[P.tcut]();
      }
      const full = tg.band(0, TL, 0).map(T2);
      const endC = at(TL, 0), dEnd = tg.dAt(TL);
      defs.push(`<path id="${id}st" fill-rule="evenodd" d="${poly(full)}${holes}"/>`);
      out.push(layers(id + 'st', { base: Ct, opacity: metalT ? 1 : P.clarity, plain: metalT, edge: tEdge }));
      out.push(circ(endC, dEnd / 2, `fill="${Ct}" stroke="${tEdge}" stroke-width=".3"${!metalT && P.clarity < 1 ? ` fill-opacity="${P.clarity}"` : ''}`));
      if (tg.tip.end) out.push(tg.tip.end(endC, dEnd).replace('/>', ` fill="${Ct}" stroke="${tEdge}" stroke-width=".3"/>`));
      if (P.tcol === 'tips') {
        const u = Math.max(tg.u0 - 4, TL - 50);
        out.push(`<path d="${poly(band(u, TL, 0.05))}" fill="${col.contrast}" stroke="${mix(col.contrast, '#000', 0.5)}" stroke-width=".3"/>` + circ(endC, dEnd / 2, `fill="${col.contrast}"`));
      }
      if (P.core !== 'hidden') {
        // the metal core, seen through a see-through temple (on a metal temple it shows as a seam)
        const pts = [];
        for (let u = 4; u <= TL - 7; u += 2) pts.push(at(u, 0));
        const wCore = Math.min(1.2, Math.max(0.5, P.tdepth * 0.3));
        out.push(metalT
          ? line(pts, hwEdge, 0.3, P.core === 'engraved' ? 'stroke-dasharray=".5 1.1"' : '')
          : line(pts, hw, wCore, `stroke-linecap="round" stroke-opacity="${r2(1 - P.clarity * 0.55)}"`) +
            (P.core === 'engraved' && !lod ? line(pts, hwEdge, wCore * 0.8, `stroke-dasharray=".45 1.2" stroke-opacity="${r2(1 - P.clarity * 0.5)}"`) : ''));
      }
      if (P.glow === 'phos') out.push(`<use href="#${id}st" fill="none" stroke="#c4ff6e" stroke-opacity=".3" stroke-width="5"/>`);

      // camera or display module at the front of the temple
      if (hasMod) {
        const m = band(2.5, uMod1, 0, (u, d) => Math.max(d, 7) / 2 + 1.2, (u, d) => -(Math.max(d, 7) / 2 + 1.2));
        out.push(`<path d="${poly(m)}" fill="#1f2125" stroke="#0c0d10" stroke-width=".3" stroke-linejoin="round"/>` +
          (P.cam !== 'none' ? circ(at(6, 0), 0.5, 'fill="#fff" fill-opacity=".9"') : '') +
          (P.disp !== 'none' ? `<path d="${poly([at(9, 2.2), at(16, 2.2)], false)}" stroke="#7cc7ff" stroke-width=".5"/>` : ''));
      }
      if (P.adapt === 'switch') out.push(`<path d="${poly(band(22, 28, 0, (u, d) => d + 1, (u, d) => d - 0.2))}" fill="${hw}" stroke="${hwEdge}" stroke-width=".25"/>`);
      if (P.adj === 'ratchet') {
        const c = at(1.5, 0), r = Math.max(3.2, P.tdepth * 0.62);
        out.push(circ(c, r, `fill="${hw}" stroke="${hwEdge}" stroke-width=".3"`) + (lod ? '' : ngon(c, r, 14, 0).map(p => `<path d="M${pt(c)}L${pt(p)}" stroke="${hwEdge}" stroke-width=".22"/>`).join('')) + circ(c, r * 0.3, `fill="${hwEdge}"`));
      }
      if (tele) {
        out.push(`<path d="${poly(band(uTel0, uTel1, 0.8))}" fill="${mix(Ct, lum(Ct) < 0.45 ? '#fff' : '#000', 0.22)}" stroke="${tEdge}" stroke-width=".35" stroke-linejoin="round"/>` +
          [2, 4.5, 7, 9.5, 12].map(k => `<path d="${poly([at(uTel1 + k, tg.dAt(uTel1 + k) * 0.32), at(uTel1 + k, -tg.dAt(uTel1 + k) * 0.32)], false)}" stroke="${inkOn}" stroke-opacity=".6" stroke-width=".25"/>`).join(''));
      }
      // speakers
      if (P.audio === 'open') {
        const pod = band(uAud0, uAud1, 0, (u, d) => d + 0.4, (u, d) => -(d + 5.2 * Math.pow(Math.sin(Math.PI * (u - uAud0) / (uAud1 - uAud0)), 0.45)));
        let m = `<path d="${poly(pod)}" fill="${mix(Ct, '#000', 0.18)}" stroke="${tEdge}" stroke-width=".35" stroke-linejoin="round"/>`;
        if (!lod) for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) m += circ(at(uAud1 - 6 - i * 1.5, -(tg.dAt(uAud1) / 2 + 1.6 + j * 1.5)), 0.42, 'fill="#000" fill-opacity=".6"');
        m += circ(at(uAud0 + 4, -(tg.dAt(uAud0) / 2 + 2)), 0.55, 'fill="#d2aa4f"') + circ(at(uAud0 + 6.2, -(tg.dAt(uAud0) / 2 + 2)), 0.55, 'fill="#d2aa4f"');
        out.push(m);
      } else if (P.audio === 'bone') {
        const ub = tg.u0 - 3;
        out.push(`<path d="${poly(band(ub - 13, ub, 0.9))}" fill="${mix(Ct, '#000', 0.18)}" stroke="${tEdge}" stroke-width=".35" stroke-linejoin="round"/>` +
          `<path d="${poly(band(ub - 11, ub - 2, 0, (u, d) => d * 0.2, (u, d) => -(d + 3.6)))}" fill="none" stroke="${inkOn === '#ffffff' ? '#444' : '#444'}" stroke-width=".3" stroke-dasharray="1 .7"/>`);
      }
      // engraving on the temple
      if (P.engr !== 'none' && !lod) {
        const u0 = hasMod ? uMod1 + 2 : 5, u1 = Math.min(u0 + 0.2 * TL, tele ? uTel0 - 2 : 1e9);
        const off = P.tcut !== 'solid' ? 0.36 : 0;
        const ink = lum(Ct) < 0.3 ? mix(Ct, '#fff', 0.5) : mix(Ct, '#000', 0.5);
        const path = (shift, amp) => {
          const p = [];
          for (let u = u0; u <= u1; u += 0.6) { const d = tg.dAt(u); p.push(at(u, d * (off + shift) + (amp ? Math.sin(u * 1.5) * d * amp : 0))); }
          return p;
        };
        const E = {
          line: () => line(path(0), ink, 0.25),
          double: () => line(path(-0.07), ink, 0.22) + line(path(0.07), ink, 0.22),
          wave: () => line(path(0, 0.09), ink, 0.25),
          dots: () => line(path(0), ink, 0.5, 'stroke-dasharray=".01 1.1" stroke-linecap="round"')
        };
        out.push(E[P.engr]());
      }
      // size print (shown on the outside so it can be seen)
      if (P.print !== 'none' && !lod) {
        const onPod = P.audio === 'open', up = onPod ? uAud0 + 9 : uPrint;
        const d = tg.dAt(up), p = at(up, onPod ? -(d / 2 + 2.3) : 0), fs = clamp((onPod ? 3 : d) * 0.5, 1.1, 2.3);
        const ink = onPod || lum(Ct) < 0.45 ? '#ffffff' : '#111111';
        out.push(`<g transform="translate(${pt(p)}) rotate(${r2(tg.ang(up))})"><text x="0" y="${r2(fs * 0.36)}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="${r2(fs)}" fill="${ink}" fill-opacity=".85">${P.lw}-${P.dbl} ${P.tlen}</text>` +
          (P.print === 'sizeline' ? `<path d="M0,${r2(fs * 0.75)}h${r2(fs * 6.2)}M${r2(fs * 6.6)},${r2(-fs * 0.5)}v${r2(fs * 1.25)}" stroke="${ink}" stroke-opacity=".85" stroke-width="${r2(fs * 0.11)}"/>` : '') + '</g>');
      }
      // rivets on the temple follow the front
      if (P.rivn > 0) {
        const pos = [];
        const LAY = { 1: [[0, 0]], 2: [[0, 0], [1, 0]], 3: [[0, -1], [0, 1], [1, 0]], 4: [[0, -1], [0, 1], [1, -1], [1, 1]] };
        const sp = Math.min(1.45, tg.dAt(3) * 0.26);
        for (const q of LAY[P.rivn]) pos.push(at((hasMod ? uMod1 + 1.5 : 2.6) + q[0] * 2.6, q[1] * sp));
        out.push(`<g fill="${hw}" stroke="${hwEdge}" stroke-width=".18">` + pos.map(p => RIVET[P.rivs](p, 0.85, 1)).join('') + '</g>');
      }
      // tip covering
      const tg2 = TIPG[P.tipg];
      if (tg2) {
        const u = Math.max(tg.u0 - 3, TL - 46);
        let m = `<path d="${poly(band(u, TL, 0.45))}" fill="${tg2.fill}" stroke="#111" stroke-width=".3" stroke-linejoin="round"/>` + circ(endC, dEnd / 2 + 0.45, `fill="${tg2.fill}" stroke="#111" stroke-width=".3"`);
        if (tg.tip.end) m += tg.tip.end(endC, dEnd + 0.6).replace('/>', ` fill="${tg2.fill}" stroke="#111" stroke-width=".3"/>`);
        if (!lod && (tg2.ribs || tg2.hatch)) {
          for (let q = u + 1.5; q < TL - 1; q += tg2.ribs || tg2.hatch) {
            const d = tg.dAt(q) / 2 + 0.3;
            m += `<path d="${poly([at(q, d), at(q + (tg2.hatch ? 1.3 : 0), -d)], false)}" stroke="${tg2.hatch ? '#5d4c2c' : '#000'}" stroke-opacity="${tg2.hatch ? 0.7 : 0.55}" stroke-width=".3"/>`;
          }
        }
        out.push(m);
      }
      // retainer
      if (P.cord !== 'none') {
        const c = at(TL - 5, 0);
        const d = `M${pt(c)}C${r2(c[0] + 16)},${r2(c[1] + 14)} ${r2(c[0] + 22)},${r2(c[1] + 44)} ${r2(c[0] + 8)},${r2(c[1] + 120)}`;
        out.push((P.cord === 'chain'
          ? `<path d="${d}" fill="none" stroke="${hwEdge}" stroke-width="1.5" stroke-dasharray="1.9 1" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${hw}" stroke-width=".9" stroke-dasharray="1.9 1" stroke-linecap="round"/>`
          : `<path d="${d}" fill="none" stroke="#3a3d43" stroke-width="1.1" stroke-linecap="round"/>`) + circ(c, 1.5, `fill="none" stroke="${P.cord === 'chain' ? hw : '#3a3d43'}" stroke-width=".6"`));
      }
      // the hinge, seen in the joint
      const hd = Math.max(P.tdepth, 2.4);
      const HINGE = {
        barrel: () => {
          const h = clamp(P.barrels * 1.15, 2.6, Math.max(3, hd * 0.92));
          let m = `<rect x="${r2(H[0] - 1)}" y="${r2(H[1] - h / 2)}" width="2" height="${r2(h)}" rx=".4" fill="${hw}" stroke="${hwEdge}" stroke-width=".2"/>`;
          for (let k = 1; k < P.barrels; k++) m += `<path d="M${r2(H[0] - 1)},${r2(H[1] - h / 2 + h * k / P.barrels)}h2" stroke="${hwEdge}" stroke-width=".2"/>`;
          return m;
        },
        hidden: () => `<path d="M${r2(H[0])},${r2(H[1] - hd / 2)}v${r2(hd)}" stroke="#000" stroke-opacity=".55" stroke-width=".3"/>`,
        coil: () => { let m = ''; for (let k = -1; k <= 1; k++) m += `<path d="M${r2(H[0] - 1.2)},${r2(H[1] + k * 1.1 + 0.5)}l2.4,-1" stroke="${hw}" stroke-width=".6" stroke-linecap="round"/>`; return m; },
        flex: () => `<rect x="${r2(H[0] - ft - 1)}" y="${r2(H[1] - Math.min(hd, 2.2) / 2)}" width="${r2(ft + 9)}" height="${r2(Math.min(hd, 2.2))}" rx=".6" fill="${hw}" stroke="${hwEdge}" stroke-width=".2"/>`
      };
      out.push(HINGE[P.hinge]());
    }

    const y1 = Math.max(70, P.hold === 'handle' ? ye + 96 : 0, G.temples && P.cord !== 'none' ? 96 : 0);
    return {
      defs: defs.join(''), body: out.join(''), box: [-18, -50, 200, y1 + 50],
      anchors: { front: [8, 0], hinge: [H[0] + 6, H[1]], mid: midPt, tip: tipPt }
    };
  }

  // ================================================================ TOP
  function viewTop(P, G, o) {
    const id = o.idp, lod = o.lod;
    const defs = [], out = [];
    const col = G.col, hw = col.hw, hwEdge = mix(hw, '#000', 0.45);
    const ft = P.fthick, xe = G.xe, cx = G.cx, ye = G.ye;
    const zF = x => G.zf(x, 0);
    const layers = material(id, P, G, lod, -4, ft + 10, defs);
    const both = f => f(1) + f(-1);
    const xb = G.hasSide ? xe : G.xMax;
    const strip = (x0, x1, z0, th, n) => {
      const a = [], b = [];
      for (let k = 0; k <= n; k++) { const x = lerp(x0, x1, k / n); a.push([x, zF(x) + z0]); b.push([x, zF(x) + z0 + th]); }
      return a.concat(rev(b));
    };

    // light thrown forward by reading lights
    if (P.glow === 'leds') {
      defs.push(`<linearGradient id="${id}lb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffe98a" stop-opacity=".75"/><stop offset="1" stop-color="#ffe98a" stop-opacity="0"/></linearGradient>`);
      out.push(both(s => { const x = s * (xb - 1.5), z = zF(xb); return `<path d="M${r2(x - 1)},${r2(z)}L${r2(x - s * 26 - 14)},-34H${r2(x - s * 26 + 14)}L${r2(x + 1)},${r2(z)}Z" fill="url(#${id}lb)"/>`; }));
    }
    // sun clip
    if (P.clip !== 'none') {
      const xa = G.shield ? 0 : P.dbl / 2, xz = cx + P.lw / 2;
      out.push(both(s => (P.clip === 'down'
        ? `<path d="${poly(strip(s * xa, s * xz, -2.2, 1.1, 12))}" fill="#24272c"/>`
        : `<path d="${poly(strip(s * xa, s * xz, -1.5 - P.lh * 0.34, P.lh * 0.34, 12))}" fill="#24272c" fill-opacity=".62" stroke="#24272c" stroke-width=".4"/>`)));
    }
    // nose rest behind the bridge
    const zb = zF(P.dbl / 2) + ft;
    if (P.pads === 'arms' || P.pads === 'fixed') {
      const pm = PADM[P.padm](col), wid = P.padsz / P.padr;
      out.push(both(s => {
        const c = [s * Math.max(G.xnPad - 1.2, 3), zb + (P.pads === 'arms' ? 7.5 : 1.6)];
        return (P.pads === 'arms' ? `<path d="M${r2(s * (G.xnPad + 1.5))},${r2(zb - 0.3)}Q${r2(s * (G.xnPad + 1.5))},${r2(c[1])} ${pt(c)}" fill="none" stroke="${hw}" stroke-width=".55"/>` : '') +
          ell(c, wid * 0.42, 1.25, s * 62, `fill="${pm.fill}" fill-opacity="${pm.a}" stroke="${pm.stroke}" stroke-width=".3"`);
      }));
    } else if (P.pads === 'strip') {
      const x = Math.max(G.xnPad - 0.6, 3);
      out.push(`<path d="M${r2(-x)},${r2(zb - 0.5)}C${r2(-x)},${r2(zb + 11)} ${r2(x)},${r2(zb + 11)} ${r2(x)},${r2(zb - 0.5)}" fill="none" stroke="#8fa3af" stroke-width="2.6"/><path d="M${r2(-x)},${r2(zb - 0.5)}C${r2(-x)},${r2(zb + 11)} ${r2(x)},${r2(zb + 11)} ${r2(x)},${r2(zb - 0.5)}" fill="none" stroke="#eef3f6" stroke-width="2"/>`);
    } else if (G.hasRim) {
      out.push(both(s => `<path d="M${r2(s * (G.xnPad + 2))},${r2(zb - 0.6)}Q${r2(s * (G.xnPad - 1))},${r2(zb + 5.5)} ${r2(s * (G.xnPad - 2.4))},${r2(zb - 0.6)}Z" fill="${col.C}" stroke="${col.edge}" stroke-width=".3"/>`));
    }

    // the front seen from above: a band that follows wrap and lens curve
    const nB = lod ? 24 : 60;
    const lensX0 = G.shield ? -(cx + P.lw / 2) : P.dbl / 2, lensX1 = cx + P.lw / 2;
    const tintF = P.tintd ? col.tint : GLASS, tintA = Math.max(0.5, P.tintd);
    const lensStrip = (solid) => {
      const mk = (x0, x1) => `<path d="${poly(strip(x0, x1, 0.5, P.lthick, 16))}" ` + (solid
        ? `fill="${tintF}" fill-opacity="${r2(tintA)}" stroke="#6d8493" stroke-width=".3"/>`
        : 'fill="none" stroke="#ffffff" stroke-opacity=".8" stroke-width=".28" stroke-dasharray="1.3 1"/>');
      return G.shield ? mk(lensX0, lensX1) : mk(lensX0, lensX1) + mk(-lensX0, -lensX1);
    };
    const bare = P.rim === 'none' || P.rim === 'lower';
    if (!bare) out.push(lensStrip(true));
    if (G.hasRim) {
      defs.push(`<path id="${id}tb" d="${poly(strip(-xb, xb, 0, ft, nB))}"/>`);
      if (P.glow === 'phos') out.push(`<use href="#${id}tb" fill="none" stroke="#c4ff6e" stroke-opacity=".3" stroke-width="5"/>`);
      let over = '';
      const c2 = col.C2;
      if (P.lam === 'frontback') over = `<path d="${poly(strip(-xb, xb, ft * 0.5, ft * 0.5, nB))}" fill="${c2.c}" fill-opacity="${c2.a || 1}"/>`;
      if (P.lam === 'stripe') over = `<path d="${poly(strip(-xb, xb, ft * 0.42, Math.max(0.35, ft * 0.16), nB))}" fill="${c2.c}" fill-opacity="${c2.a ? 0.7 : 1}"/>`;
      if (P.lam === 'brow') over = `<use href="#${id}tb" fill="${c2.c}" fill-opacity="${c2.a || 1}"/>`;
      out.push(layers(id + 'tb', { opacity: P.clarity, over }));
      if (bare) out.push(lensStrip(true)); else out.push(lensStrip(false));
    } else {
      out.push(lensStrip(true));
      const wz = zF(0) + P.lthick / 2 + 0.5, bw = P.bdepth || 1;
      if (!G.shield) out.push(`<path d="M${r2(-P.dbl / 2 - 3)},${r2(wz)}Q0,${r2(wz + 1.5)} ${r2(P.dbl / 2 + 3)},${r2(wz)}" fill="none" stroke="${col.edge}" stroke-width="${r2(Math.min(bw, 2) + 0.5)}" stroke-linecap="round"/><path d="M${r2(-P.dbl / 2 - 3)},${r2(wz)}Q0,${r2(wz + 1.5)} ${r2(P.dbl / 2 + 3)},${r2(wz)}" fill="none" stroke="${col.C}" stroke-width="${r2(Math.min(bw, 2))}" stroke-linecap="round"/>`);
      if (G.hasSide) out.push(both(s => `<path d="M${r2(s * (G.xl - 3.2))},${r2(zF(G.xl - 3) + P.lthick / 2 + 0.5)}L${r2(s * xe)},${r2(zF(xe) + ft * 0.6)}" stroke="${col.C}" stroke-width="1.6" stroke-linecap="round"/>`));
    }
    if (P.cam !== 'none') {
      const one = s => `<rect x="${r2(s > 0 ? xb - 5.2 : -xb + 0.4)}" y="${r2(zF(xb - 3) - 1.3)}" width="4.8" height="1.6" rx=".5" fill="#17181b"/>`;
      out.push(one(1) + (P.cam === 'both' ? one(-1) : ''));
    }

    let hingeR = [xb, zF(xb) + ft], tipR = [xb - 12, 150];
    if (G.temples) {
      const tg = temple(P, true), Ltop = tg.xEnd, th0 = P.tthick;
      const zh = zF(xe) + ft + 1.5;
      const hinge = [xe - th0 / 2, zh];
      hingeR = hinge;
      // centre line of the right temple, curving in toward the head
      const cl = t => [xe - th0 / 2 - 2 * t - 9 * Math.pow(sstep(0.5, 1, t), 1.4), zh + t * Ltop];
      const thAt = t => Math.max(0.8, th0 * (1 - 0.25 * t));
      const shape = (t0, t1, grow, inner) => {
        const a = [], b = [], n = 18;
        for (let k = 0; k <= n; k++) {
          const t = lerp(t0, t1, k / n), c = cl(t), h = thAt(t) / 2 + (grow || 0);
          a.push([c[0] + h, c[1]]); b.push([c[0] - h - (inner ? inner(t) : 0), c[1]]);
        }
        return a.concat(rev(b));
      };
      tipR = cl(0.92);
      const whole = shape(0, 1, 0);
      const Ct = col.Ct, tEdge = mix(Ct, '#000', 0.5), metalT = P.tcol === 'metal';
      defs.push(`<g id="${id}tt"><path d="${poly(whole)}"/><path d="${poly(mirror(whole))}"/>` + both(s => circ([s * cl(1)[0], cl(1)[1]], thAt(1) / 2)) + '</g>');
      if (P.glow === 'phos') out.push(`<use href="#${id}tt" fill="none" stroke="#c4ff6e" stroke-opacity=".3" stroke-width="5"/>`);
      out.push(layers(id + 'tt', { base: Ct, opacity: metalT ? 1 : P.clarity, plain: metalT, edge: tEdge }));
      const piece = (t0, t1, grow, fill, stroke, inner) => both(s => `<path d="${poly(s > 0 ? shape(t0, t1, grow, inner) : mirror(shape(t0, t1, grow, inner)))}" fill="${fill}" stroke="${stroke}" stroke-width=".3" stroke-linejoin="round"/>`);
      if (P.tcol === 'tips') out.push(piece(0.68, 1, 0.05, col.contrast, mix(col.contrast, '#000', 0.5)));
      if (P.cam !== 'none' || P.disp !== 'none') out.push(piece(0.02, 0.13, 0.4, '#1f2125', '#0c0d10', () => 2.2));
      if (P.adj === 'telescope') out.push(piece(0.27, 0.4, 0.55, mix(Ct, lum(Ct) < 0.45 ? '#fff' : '#000', 0.22), tEdge));
      if (P.audio === 'open') out.push(piece(0.44, 0.66, 0.2, mix(Ct, '#000', 0.18), tEdge, t => 2.6 * Math.sin(Math.PI * (t - 0.44) / 0.22)));
      if (P.audio === 'bone') out.push(piece(0.55, 0.64, 0.2, mix(Ct, '#000', 0.18), tEdge, () => 2.6));
      const tgp = TIPG[P.tipg];
      if (tgp) out.push(piece(0.7, 1, 0.45, tgp.fill, '#111') + both(s => circ([s * cl(1)[0], cl(1)[1]], thAt(1) / 2 + 0.45, `fill="${tgp.fill}" stroke="#111" stroke-width=".3"`)));
      const shieldSpec = SIDE[P.side];
      if (shieldSpec) out.push(both(s => `<path d="M${r2(s * (xe - th0 - 0.6))},${r2(zh - 1)}L${r2(s * (cl(0.24)[0] - th0 / 2 - 0.6))},${r2(cl(0.24)[1])}" stroke="${shieldSpec.stroke}" stroke-width="1.2" stroke-opacity="${shieldSpec.mesh ? 0.6 : 0.9}"${shieldSpec.mesh ? ' stroke-dasharray=".8 .6"' : ''}/>`));

      // hinge, seen from above
      const HINGE = {
        barrel: s => { const c = [s * (hinge[0] - th0 * 0.1), zh]; return circ(c, 1.3, `fill="${hw}" stroke="${hwEdge}" stroke-width=".22"`) + SCREW[P.screw](c, 1.3); },
        hidden: s => `<path d="M${r2(s * (hinge[0] - th0 / 2 - 0.2))},${r2(zh)}h${r2(s * (th0 + 0.4))}" stroke="#000" stroke-opacity=".6" stroke-width=".3"/>`,
        coil: s => { const c = [s * hinge[0], zh]; return circ(c, 1.5, `fill="none" stroke="${hw}" stroke-width=".55"`) + circ(c, 0.75, `fill="none" stroke="${hw}" stroke-width=".5"`); },
        flex: s => `<path d="M${r2(s * (xe - 7))},${r2(zF(xe - 7) + ft * 0.75)}Q${r2(s * (xe - 0.3))},${r2(zh - 2.2)} ${r2(s * (hinge[0] + th0 * 0.2))},${r2(zh + 7)}" fill="none" stroke="${hw}" stroke-width="1.1" stroke-linecap="round"/>`
      };
      out.push(both(HINGE[P.hinge]));
      const hinged = P.hinge !== 'flex';
      // the catch that makes the hinge sound
      if (hinged && P.snap !== 'quiet') {
        const CATCH = {
          click: s => `<path d="M${r2(s * (hinge[0] - 1.5))},${r2(zh + 0.2)}l${r2(-s * 1.1)},.7 ${r2(s * 1.1)},.7Z" fill="${hwEdge}"/>`,
          snap: s => `<path d="M${r2(s * (hinge[0] - 1.5))},${r2(zh - 0.3)}l${r2(-s * 1.7)},1.1 ${r2(s * 1.7)},1.1Z" fill="${hwEdge}"/><path d="M${r2(s * (hinge[0] - 2.6))},${r2(zh + 1.4)}v4.2" stroke="${hw}" stroke-width=".45" stroke-linecap="round"/>`
        };
        out.push(both(CATCH[P.snap]));
      }
      const rotAbout = (pts, a, s) => pts.map(p => {
        const dx = p[0] - s * hinge[0], dy = p[1] - zh, c = Math.cos(a), sn = Math.sin(a);
        return [s * hinge[0] + dx * c - dy * sn, zh + dx * sn + dy * c];
      });
      const ghost = (pts, extra) => `<path d="${poly(pts)}" fill="none" stroke="#555b63" stroke-width=".4" stroke-dasharray="1.6 1.1"${extra || ''}/>`;
      // spring: how far the temple opens past straight
      if ((P.hinge === 'barrel' || P.hinge === 'hidden') && P.spring > 0) {
        out.push(ghost(rotAbout(whole, -P.spring * RAD, 1), ' stroke-opacity=".8"') +
          both(s => `<rect x="${r2(s > 0 ? hinge[0] - 0.7 : -hinge[0] - 0.7)}" y="${r2(zh + 1.8)}" width="1.4" height="5.2" rx=".4" fill="${hw}" stroke="${hwEdge}" stroke-width=".2"/>`));
      }
      // folding, drawn as ghosts
      if (hinged) {
        const FOLD = {
          flat: () => ghost(rotAbout(whole, 88 * RAD, 1)),
          crossed: () => ghost(rotAbout(whole, 88 * RAD, 1)) + ghost(rotAbout(mirror(whole), -80 * RAD, -1)),
          half: () => ghost(rotAbout(whole, 88 * RAD, 1)) + `<path d="M0,${r2(zF(0) - 3)}v${r2(ft + 9)}" stroke="#6f757d" stroke-width=".35" stroke-dasharray="1.6 1.1"/>` +
            circ([0, zF(0) + ft + 0.6], 1.2, `fill="${hw}" stroke="${hwEdge}" stroke-width=".22"`) + both(s => circ(cl(0.5).map((q, k) => (k ? q : s * q)), 1.1, `fill="${hw}" stroke="${hwEdge}" stroke-width=".22"`))
        };
        out.push(FOLD[P.fold]());
      }
      if (P.cord !== 'none') {
        const e = cl(0.97);
        const d = `M${pt(e)}C${r2(e[0] - 4)},${r2(e[1] + 44)} ${r2(-e[0] + 4)},${r2(e[1] + 44)} ${r2(-e[0])},${r2(e[1])}`;
        out.push(P.cord === 'chain'
          ? `<path d="${d}" fill="none" stroke="${hwEdge}" stroke-width="1.5" stroke-dasharray="1.9 1" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${hw}" stroke-width=".9" stroke-dasharray="1.9 1" stroke-linecap="round"/>`
          : `<path d="${d}" fill="none" stroke="#3a3d43" stroke-width="1.1"/>`);
      }
    } else if (P.hold === 'strap') {
      const z = zF(xe) + ft * 0.5;
      const d = `M${r2(-xe)},${r2(z)}C${r2(-xe - 16)},${r2(z + 70)} ${r2(-62)},${r2(z + 176)} 0,${r2(z + 176)}C62,${r2(z + 176)} ${r2(xe + 16)},${r2(z + 70)} ${r2(xe)},${r2(z)}`;
      out.push(`<path d="${d}" fill="none" stroke="#111" stroke-width="2.9"/><path d="${d}" fill="none" stroke="${STRAP}" stroke-width="2.3"/>` + (lod ? '' : `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width=".5" stroke-dasharray="1 1.4"/>`) +
        `<rect x="${r2(xe + 3)}" y="${r2(z + 52)}" width="4" height="9" rx="1" fill="${hw}" stroke="${hwEdge}" stroke-width=".3" transform="rotate(-14 ${r2(xe + 5)} ${r2(z + 56)})"/>`);
      const sp = SIDE[P.side];
      if (sp) out.push(both(s => `<path d="M${r2(s * (xe - 1.5))},${r2(z)}L${r2(s * (xe + 2))},${r2(z + 30)}" stroke="${sp.stroke}" stroke-width="1.2"${sp.mesh ? ' stroke-dasharray=".8 .6"' : ''}/>`));
    } else if (P.hold === 'handle') {
      out.push(`<rect x="${r2(xe - 1.5)}" y="${r2(zF(xe) + ft * 0.1)}" width="7.2" height="${r2(Math.max(2.4, ft * 0.8))}" rx=".8" fill="${col.C}" stroke="${col.edge}" stroke-width=".3"/>` + circ([xe + 1.6, zF(xe) + ft * 0.5], 1.1, `fill="${hw}" stroke="${hwEdge}" stroke-width=".2"`));
    }

    const W = Math.max(108, xe + 14);
    return {
      defs: defs.join(''), body: out.join(''), box: [-W, -38, 2 * W, 228],
      anchors: { hingeR, bridge: [0, ft / 2 + 6], lensR: [cx, zF(cx) + ft / 2], tipR }
    };
  }

  // =============================================================== WORN
  // A plain, neutral head, seen from the front, with the glasses in place.
  function viewWorn(P, G, o) {
    const id = o.idp, lod = o.lod;
    const dy = SIT[P.sit], col = G.col;
    const fr = viewFront(P, G, { idp: id + 'w', lod, worn: true });
    const line0 = '#b9ad9f', skin = '#ece5db';
    const ye = G.ye + dy, xe = G.xe;
    let s = '';
    if (G.temples && P.cord !== 'none') {
      s += [1, -1].map(k => `<path d="M${k * 80},8C${k * 88},50 ${k * 66},92 ${k * 46},126" fill="none" stroke="${P.cord === 'chain' ? col.hw : '#3a3d43'}" stroke-width="1.2"${P.cord === 'chain' ? ' stroke-dasharray="1.9 1"' : ''}/>`).join('');
    }
    s += `<path d="M-40,96C-42,112 -44,122 -70,132H70C44,122 42,112 40,96Z" fill="${skin}" stroke="${line0}" stroke-width=".8"/>` +
      [1, -1].map(k => `<ellipse cx="${k * 80}" cy="12" rx="7.5" ry="19" fill="${skin}" stroke="${line0}" stroke-width=".8"/>`).join('') +
      `<path d="M0,-114C48,-114 78,-80 78,-30C78,12 71,52 53,86C39,109 18,120 0,120C-18,120 -39,109 -53,86C-71,52 -78,12 -78,-30C-78,-80 -48,-114 0,-114Z" fill="${skin}" stroke="${line0}" stroke-width=".8"/>`;
    // eyes, brows, nose and mouth as plain marks
    s += [1, -1].map(k => `<path d="M${k * 18.5},0Q${k * 31.5},-7.5 ${k * 44.5},0Q${k * 31.5},6.5 ${k * 18.5},0Z" fill="#fbf9f5" stroke="${line0}" stroke-width=".6"/><circle cx="${k * 31.5}" cy="-.4" r="5.4" fill="#8d8378"/><circle cx="${k * 31.5}" cy="-.4" r="2.2" fill="#3c3732"/>` +
      `<path d="M${k * 15},-15Q${k * 31},-22 ${k * 48},-14" fill="none" stroke="${line0}" stroke-width="2" stroke-linecap="round"/>`).join('') +
      `<path d="M-4,6C-6,24 -11,34 -9,40Q0,46 9,40" fill="none" stroke="${line0}" stroke-width=".8" stroke-linecap="round"/><path d="M-17,70Q0,76 17,70" fill="none" stroke="${line0}" stroke-width="1" stroke-linecap="round"/>`;
    // temples or strap running back to the ears
    let g = '';
    if (G.temples) {
      const d0 = P.tdepth, earY = -3 - dy;
      g += [1, -1].map(k => `<path d="M${r2(k * (xe - 0.5))},${r2(G.ye - d0 / 2)}L${k * 79},${r2(earY - d0 * 0.34)}V${r2(earY + d0 * 0.34)}L${r2(k * (xe - 0.5))},${r2(G.ye + d0 / 2)}Z" fill="${mix(col.Ct, '#000', 0.12)}" stroke="${mix(col.Ct, '#000', 0.5)}" stroke-width=".3"${P.tcol !== 'metal' && P.clarity < 1 ? ` fill-opacity="${P.clarity}"` : ''}/>`).join('');
    } else if (P.hold === 'strap') {
      g += [1, -1].map(k => `<path d="M${r2(k * (xe - 0.5))},${r2(G.ye - 6.5)}L${k * 79.5},${r2(G.ye - 8)}V${r2(G.ye + 8)}L${r2(k * (xe - 0.5))},${r2(G.ye + 6.5)}Z" fill="${STRAP}" stroke="#111" stroke-width=".3"/>`).join('');
    }
    s += `<g transform="translate(0,${dy})">${g}${fr.body}</g>`;
    return { defs: fr.defs, body: s, box: [-108, -128, 216, 264], anchors: { face: [0, 0], lensR: [G.cx, dy], endR: [xe, ye] } };
  }

  // ------------------------------------------------------------- public
  const VIEWS = { front: viewFront, side: viewSide, top: viewTop, worn: viewWorn };
  function parts(v, o) {
    o = o || {};
    const P = params(v), lod = o.lod ? 1 : 0;
    const G = geometry(P, lod);
    const r = VIEWS[o.view || 'front'](P, G, { idp: o.idp || 'g', lod });
    let box = r.box;
    if (o.at && r.anchors[o.at]) {
      const a = r.anchors[o.at], w = o.w || 60, h = w * (o.aspect || 0.66);
      box = [a[0] - w / 2, a[1] - h / 2, w, h];
    }
    r.viewBox = box.map(r2).join(' ');
    r.box = box;
    return r;
  }
  function draw(v, o) {
    const r = parts(v, o);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.viewBox}"${o && o.attrs ? ' ' + o.attrs : ''}><defs>${r.defs}</defs>${r.body}</svg>`;
  }

  const api = { draw, parts, params, PAPER, VIEWS: Object.keys(VIEWS) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FS_DRAW = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
