/* Drawing helpers shared by every thing built on the kit.
 * Colour, a fixed random stream, path strings, outlines built from numbers.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const PAPER = '#f3f4f1';
  const r1 = x => Math.round(x * 10) / 10;
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
  // Points are [x, y]. fmt sets the rounding: r1 for millimetres at car
  // scale, r2 for small things.
  const makePath = fmt => {
    const pt = p => fmt(p[0]) + ',' + fmt(p[1]);
    const poly = (pts, close) => (pts.length ? 'M' + pts.map(pt).join('L') + (close === false ? '' : 'Z') : '');
    return { pt, poly };
  };
  const mirrorX = pts => pts.map(p => [-p[0], p[1]]);
  const rev = pts => pts.slice().reverse();
  function bbox(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return { x0, y0, x1, y1 };
  }
  const ngon = (c, r, n, rot) => {
    const p = [];
    for (let i = 0; i < n; i++) p.push([c[0] + r * Math.cos((rot || 0) + TAU * i / n), c[1] + r * Math.sin((rot || 0) + TAU * i / n)]);
    return p;
  };

  // A line through corner points, each corner cut back by its own length and
  // rounded. verts: [x, y, cut]. Returns sampled points.
  function roundCorners(verts, closed, steps) {
    const n = verts.length, out = [], k = steps || 6;
    for (let i = 0; i < n; i++) {
      const b = verts[i], cut = b[2] || 0;
      const hasPrev = closed || i > 0, hasNext = closed || i < n - 1;
      if (!cut || !hasPrev || !hasNext) { out.push([b[0], b[1]]); continue; }
      const a = verts[(i + n - 1) % n], c = verts[(i + 1) % n];
      const d1 = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, d2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
      const t = Math.min(cut, d1 * 0.46, d2 * 0.46);
      const p1 = [b[0] + (a[0] - b[0]) / d1 * t, b[1] + (a[1] - b[1]) / d1 * t];
      const p2 = [b[0] + (c[0] - b[0]) / d2 * t, b[1] + (c[1] - b[1]) / d2 * t];
      for (let j = 0; j <= k; j++) {
        const u = j / k, q = 1 - u;
        out.push([q * q * p1[0] + 2 * q * u * b[0] + u * u * p2[0], q * q * p1[1] + 2 * q * u * b[1] + u * u * p2[1]]);
      }
    }
    return out;
  }

  // An outline from numbers: a number of sides, then corner softness from
  // 0 (sharp) to 1 (round). Returns N points in the unit box, y up, with a
  // flat side on top. Two sides gives a pointed oval.
  const OUT = new Map();
  function softOutline(sides, soft, N) {
    const key = sides + '|' + soft + '|' + N;
    const hit = OUT.get(key);
    if (hit) return hit;
    const U = new Array(N);
    if (sides === 2) {
      const m = (1 - soft) * 1.25;
      for (let i = 0; i < N; i++) { const th = TAU * i / N, s = Math.sin(th); U[i] = [Math.cos(th), s * Math.pow(Math.abs(s), m)]; }
    } else {
      const seg = TAU / sides, v0 = Math.PI / 2 + Math.PI / sides;
      let rr = new Array(N);
      for (let i = 0; i < N; i++) {
        const ph = (((TAU * i / N - v0) % seg) + seg) % seg;
        rr[i] = Math.cos(Math.PI / sides) / Math.cos(ph - Math.PI / sides);
      }
      const w = Math.round(Math.pow(soft, 1.3) * N / (2 * sides));
      for (let pass = 0; pass < 2 && w > 0; pass++) {
        const nx = new Array(N);
        for (let i = 0; i < N; i++) { let s = 0; for (let j = -w; j <= w; j++) s += rr[(i + j + N) % N]; nx[i] = s / (2 * w + 1); }
        rr = nx;
      }
      for (let i = 0; i < N; i++) { const th = TAU * i / N; U[i] = [rr[i] * Math.cos(th), rr[i] * Math.sin(th)]; }
    }
    const b = bbox(U), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, hw = (b.x1 - b.x0) / 2, hh = (b.y1 - b.y0) / 2;
    const pts = U.map(p => [(p[0] - cx) / hw, (p[1] - cy) / hh]);
    if (OUT.size > 400) OUT.clear();
    OUT.set(key, pts);
    return pts;
  }

  const api = { TAU, RAD, PAPER, r1, r2, clamp, lerp, sstep, rgb, hex, mix, hsl, lum, rng, makePath, mirrorX, rev, bbox, ngon, roundCorners, softOutline };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FS_KIT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
