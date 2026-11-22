/* Car form space: drawing.
 *
 * draw(v, opts) turns a set of choices into an SVG, in millimetres.
 *   opts.view   'side' (main), 'front', 'rear', 'top', 'street'
 *   opts.lod    true for a low-detail thumbnail
 *   opts.idp    id prefix, unique for every SVG on a page
 *   opts.at, opts.w, opts.aspect   crop round a named anchor, w mm wide
 *
 * The body is held as fixed points: lengths along the car (x), heights (y,
 * up from the ground) and half-widths (z). The side view uses x and y, the
 * front and rear views z and y, the top view x and z, so the views agree.
 * Named options each have one entry in a table keyed by option.
 */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const S = node ? require('./space.js') : root.FS_SPACE;
  const K = node ? require('../kit/draw-util.js') : root.FS_KIT;
  const { TAU, RAD, PAPER, r2, clamp, lerp, sstep, mix, hsl, lum, rng, roundCorners, softOutline, ngon, rev } = K;
  const AXES = S.AXES;

  // Geometry is worked out with y up; these turn it into SVG, y down.
  const f = x => Math.round(x);
  const pt = p => f(p[0]) + ',' + f(-p[1]);
  const poly = (pts, close) => (pts.length ? 'M' + pts.map(pt).join('L') + (close === false ? '' : 'Z') : '');
  const circ = (c, r, attrs) => `<circle cx="${f(c[0])}" cy="${f(-c[1])}" r="${r2(r)}"${attrs ? ' ' + attrs : ''}/>`;
  // rect from its lower-left corner (x, y), w wide and h tall
  const rect = (x, y, w, h, attrs, rx) => `<rect x="${f(x)}" y="${f(-(y + h))}" width="${f(w)}" height="${f(h)}"${rx ? ` rx="${f(rx)}"` : ''}${attrs ? ' ' + attrs : ''}/>`;
  const line = (pts, stroke, w, extra) => `<path d="${poly(pts, false)}" fill="none" stroke="${stroke}" stroke-width="${r2(w)}"${extra ? ' ' + extra : ''}/>`;
  const path = (d, attrs) => `<path d="${d}"${attrs ? ' ' + attrs : ''}/>`;
  const GHOST = 'fill="none" stroke="#3f454c" stroke-width="9" stroke-dasharray="46 30"';

  function params(v) {
    const P = {};
    for (const a of AXES) { const i = v[a.id] | 0; P[a.id] = a.n ? a.n[i] : a.k[i]; }
    return P;
  }

  // ------------------------------------------------------------ colours
  const FIN = { solid: [1, 1], metallic: [1.35, 1.1], pearl: [1.2, 1], matte: [0.2, 0.55], satin: [0.6, 0.8] };
  function colours(P) {
    const neutral = P.hue < 0, h0 = neutral ? 215 : P.hue, s0 = neutral ? 0.035 : P.sat * (P.finish === 'matte' ? 0.8 : 1);
    let C = hsl(h0, s0, clamp(P.tone, 0.06, 0.95));
    if (P.finish === 'metallic') C = mix(C, '#ffffff', 0.07);
    const ROOF = { body: C, black: '#17181a', white: '#f1f0ec', silver: '#b9bdc2', contrast: hsl(h0, s0, P.tone < 0.5 ? P.tone + 0.42 : P.tone - 0.42) };
    const TRIM = { dark: '#1b1c1f', bright: '#d5d8dc', body: C, satin: '#9ea3a9' };
    const WHEEL = { silver: '#c3c7cc', dark: '#565a5f', black: '#202124', body: C, cut: '#e1e4e7', bronze: '#9a6f45' };
    const roofIsCloth = P.roofop === 'soft';
    return {
      C, edge: mix(C, '#000', 0.55), roof: roofIsCloth ? '#2b2d31' : ROOF[P.roofc], twoTone: roofIsCloth || P.roofc !== 'body',
      trim: TRIM[P.trim], wheel: WHEEL[P.wfin], plastic: '#26272a',
      stripe: lum(C) > 0.55 ? '#1b1c1f' : '#f1f0ec',
      glass: mix('#a9bcc7', '#0c1015', P.tint), lower: hsl(h0, s0, P.tone < 0.5 ? P.tone + 0.3 : P.tone - 0.3),
      fin: FIN[P.finish]
    };
  }

  // ----------------------------------------------------------- geometry
  // The fixed points of the body, in three dimensions.
  function geometry(P) {
    const L = P.fo + P.wb + P.ro, H = P.height, W = P.width, hw = W / 2;
    const Rw = P.wheel / 2, xa = P.fo, xb = P.fo + P.wb, Ra = Rw + P.archgap, archTop = Rw + Ra, clear = P.clear;
    const beltF = clamp(P.belt * H, archTop + 70, H - 250);
    const beltR = clamp(beltF + P.brise, archTop + 70, H - 200);
    const yC = beltF + 10, yb1 = clear + 50, yb2 = clear + 90;
    const yN = clamp(P.nose * yC, yb1 + 200, yC - 12);
    const yLow = yb1 + 0.3 * (yN - yb1);
    const run = (yN - yLow) * Math.tan(P.nrake * RAD), xl = run >= 0 ? 0 : -run, xu = run >= 0 ? run : 0;
    const xC = clamp(xa + P.cowl, xu + 300, xa + 0.3 * P.wb);
    const sA = P.screen * RAD;
    const yHd = H - P.crown * (0.35 + P.peak * 0.8);
    const xHd = Math.min(xC + (yHd - yC) / Math.tan(sA), xC + 0.45 * (L - xC));
    const yRh = clamp(H - P.rdrop - P.crown * (1 - P.peak) * 0.5, beltR + 190, H);
    const xRh = Math.max(xHd + 260, xHd + P.roofend * (L - 60 - xHd));
    const tF = P.fall >= 89.5 ? 1e6 : Math.tan(P.fall * RAD), tT = Math.tan(P.trake * RAD);
    const yD = clamp(beltR + P.tailh, archTop + 50, yRh - 110);     // top of the tail
    const yTb = yb2 + 0.32 * (yD - yb2);
    const xBot = tT >= 0 ? L : L + (yD - yTb) * tT;
    const xFace = y => xBot - (y - yTb) * tT;                        // the tail face at height y
    const xAtD = xRh + (yRh - yD) / tF;                              // where the falling back reaches tail height
    const deck = xAtD < xFace(yD) - 150;
    let tailTop;
    if (deck) tailTop = [xFace(yD), yD - Math.min(40, (xFace(yD) - xAtD) * 0.03)];
    else {
      const xi = (xBot - (yRh - yTb) * tT - xRh * tF * tT) / (1 - tF * tT), yi = yRh - (xi - xRh) * tF;
      tailTop = isFinite(xi) && yi > yD + 5 && xi > xRh + 1 && xi <= L + 1 ? [xi, yi] : [xFace(yD), yD];
    }
    const roofY = t => (t <= P.peak
      ? H - (H - yHd) * Math.pow((P.peak - t) / P.peak, 2)
      : H - (H - yRh) * Math.pow((t - P.peak) / (1 - P.peak), 2));

    // the side profile, front to back over the top: corner points, each with its rounding
    const V = [[xl + 130, yb1, 50], [xl, yLow, 150]];
    const bow = P.bonnet * 0.1 * (xC - xu);
    const bon = t => [lerp(xu, xC, t), lerp(yN, yC, t) + bow * 4 * t * (1 - t)];
    const faceLen = Math.hypot(xu - xl, yN - yLow), bonLen = Math.hypot(xC - xu, yC - yN);
    const cutN = 25 + P.nround * Math.min(0.72 * faceLen, 0.5 * bonLen, 520), tb = cutN / bonLen;
    const pf = [xu - (xu - xl) / faceLen * cutN, yN - (yN - yLow) / faceLen * cutN], pb = bon(tb);
    for (let k = 0; k <= 8; k++) { const u = k / 8, q = 1 - u; V.push([q * q * pf[0] + 2 * q * u * xu + u * u * pb[0], q * q * pf[1] + 2 * q * u * yN + u * u * pb[1], 0]); }
    for (let k = 1; k <= 5; k++) { const t = lerp(tb, 1, k / 6); const p = bon(t); V.push([p[0], p[1], 0]); }
    V.push([xC, yC, 60], [xHd, yHd, 170]);
    for (let k = 1; k <= 7; k++) { const t = k / 8; V.push([lerp(xHd, xRh, t), roofY(t), 0]); }
    V.push([xRh, yRh, 190]);
    if (deck) V.push([xAtD, yD, 110]);
    // the top corner of the tail, filleted by its own roundness
    const prevT = deck ? [xAtD, yD] : [xRh, yRh], lowC = [xFace(yTb), yTb];
    const faceT = Math.hypot(lowC[0] - tailTop[0], lowC[1] - tailTop[1]) || 1, backT = Math.hypot(tailTop[0] - prevT[0], tailTop[1] - prevT[1]) || 1;
    const cutT = 25 + P.tround * Math.min(0.7 * faceT, 0.5 * backT, 560);
    const pA = [tailTop[0] + (prevT[0] - tailTop[0]) / backT * cutT, tailTop[1] + (prevT[1] - tailTop[1]) / backT * cutT];
    const pB = [tailTop[0] + (lowC[0] - tailTop[0]) / faceT * cutT, tailTop[1] + (lowC[1] - tailTop[1]) / faceT * cutT];
    for (let k = 0; k <= 8; k++) { const u = k / 8, q = 1 - u; V.push([q * q * pA[0] + 2 * q * u * tailTop[0] + u * u * pB[0], q * q * pA[1] + 2 * q * u * tailTop[1] + u * u * pB[1], 0]); }
    V.push([lowC[0], lowC[1], Math.min(150, faceT * 0.22)], [lowC[0] - 130, yb2, 50]);
    const prof = roundCorners(V, false, 6);
    // height of the top of the body at x
    const topY = x => {
      let best = -1;
      for (let i = 0; i < prof.length - 1; i++) {
        const a = prof[i], b = prof[i + 1];
        if (b[0] > a[0] && x >= a[0] && x <= b[0]) { const y = a[1] + (x - a[0]) / (b[0] - a[0]) * (b[1] - a[1]); if (y > best) best = y; }
      }
      return best < 0 ? (x < xu ? yN : tailTop[1]) : best;
    };

    // wheel arches: round to square
    const nA = 2 + 2.8 * P.arch;
    const archPts = (cx, yRear, yFront) => {
      const pts = [[cx + Ra, Math.min(yRear, Rw)]], N = 36;
      for (let i = 0; i <= N; i++) {
        const t = Math.PI * i / N, c = Math.cos(t), s = Math.sin(t);
        const r = Ra / Math.pow(Math.pow(Math.abs(c), nA) + Math.pow(Math.abs(s), nA), 1 / nA);
        const p = [cx + r * c, Rw + r * s], base = c > 0 ? yRear : yFront;
        pts.push(p[1] >= base ? p : [p[0], base]);
      }
      pts.push([cx - Ra, Math.min(yFront, Rw)]);
      return pts;
    };
    const archR = archPts(xb, yb2, clear), archF = archPts(xa, clear, yb1);
    const body = prof.concat(archR, archF);

    // glass: the daylight opening between belt and roof
    const dA = clamp(150 / Math.sin(sA), 150, 330);
    const xf0 = xC + (beltF - yC) / Math.tan(sA) + dA;                // front of the side glass at the belt
    let xSB;                                                         // where the back crosses the belt
    if (deck) xSB = beltR <= yD ? xAtD : xRh + (yRh - beltR) / tF;
    else if (tailTop[1] >= beltR) xSB = xFace(beltR) - 20;
    else xSB = xRh + (tailTop[0] - xRh) * (yRh - beltR) / Math.max(1, yRh - tailTop[1]);
    const sF = Math.min(1, Math.max(0.3, Math.sin(Math.min(P.fall, 90) * RAD)));
    const cpH = clamp((P.pillars === 4 ? 110 : 150) / sF, 110, 420);
    let xr0 = Math.max(xSB - cpH, xf0 + 420);                         // back of the side glass at the belt
    if (P.roofop === 'soft') xr0 = lerp(xf0, xr0, 0.8);
    const kickAt = t => P.kick * sstep(0.8, 1, t);
    const belt = x => { const t = clamp((x - xf0) / (xr0 - xf0), 0, 1); return beltF + (beltR - beltF) * t + kickAt(t); };
    const phi = lerp(90, Math.min(P.fall, 90), P.prake) * RAD, tPhi = phi > 1.553 ? 1e6 : Math.tan(phi);
    const frontLine = x => beltF + (x - xf0) * Math.tan(sA);
    const rearLine = x => belt(xr0) + (xr0 - x) * tPhi;
    const gTop = x => Math.min(topY(x) - P.rail, frontLine(x), rearLine(x));
    const step = 30, up = [], dn = [];
    for (let x = xf0; x <= xr0 + 0.5; x += step) { const t = gTop(x), b = belt(x); if (t > b + 25) { up.push([x, t]); dn.push([x, b]); } }
    if (up.length < 2) { up.push([xf0, beltF + 30], [xf0 + 60, beltF + 30]); dn.push([xf0, beltF], [xf0 + 60, beltF]); }
    const dlo = up.concat(rev(dn));
    const xg0 = dn[0][0], xg1 = dn[dn.length - 1][0];

    // doors
    const two = P.doors === 2;
    const xD0 = Math.max(xa + Ra * 1.05 + 80, Math.min(xC - 40, xf0 - 200));
    const xDend = Math.min(xb - Ra * 0.5, xg1 + 60);
    const xD1 = two ? lerp(xD0, xDend, 0.52) : Math.min(xD0 + 1350, xb - Ra - 60, xDend);
    const xD2 = two ? xDend : xD1;
    const xPB = two ? xD1 : lerp(xg0, xg1, 0.62);                      // centre pillar
    const xPC = lerp(xg0, xg1, 0.82);
    const ySill = x => {
      const t = clamp((x - xa) / (xb - xa), 0, 1), b = clear + 150;
      return { straight: b, rising: b + 120 * t, scoop: b + 85 * Math.sin(Math.PI * t), step: b - 20 }[P.sill];
    };

    // half-widths
    const hwS = hw - 25, hwR = Math.max(hw - P.tumble - 40, 330);
    const rcF = (0.14 + 0.5 * P.plan) * hw, rcR = (0.1 + 0.42 * P.plan) * hw;
    const planW = x => {
      let w = hw;
      if (x < rcF) w = hw - rcF + Math.sqrt(Math.max(0, rcF * rcF - (rcF - x) * (rcF - x)));
      if (x > L - rcR) w = hw - rcR + Math.sqrt(Math.max(0, rcR * rcR - (x - (L - rcR)) * (x - (L - rcR))));
      if (x > xa && x < xb) w -= P.waist * Math.pow(Math.sin(Math.PI * (x - xa) / (xb - xa)), 2);
      return w + P.flare * 0.6 * (Math.exp(-Math.pow((x - xa) / Ra, 2)) + Math.exp(-Math.pow((x - xb) / Ra, 2)));
    };
    const tw = clamp(P.wheel * 0.36 - 10, 165, 345);                  // tyre width

    return {
      L, H, W, hw, Rw, Ra, xa, xb, archTop, clear, beltF, beltR, yC, yb1, yb2, yN, yLow, xl, xu, xC, sA, yHd, xHd, yRh, xRh,
      yD, yTb, xFace, xAtD, deck, tailTop, prof, topY, body, archR, archF, xf0, xr0, xSB, belt, gTop, dlo, xg0, xg1, frontLine, rearLine,
      two, xD0, xD1, xD2, xPB, xPC, ySill, hwS, hwR, planW, tw, tF, bed: P.bed === 'open' && deck,
      col: colours(P)
    };
  }

  // ------------------------------------------------------------ shading
  function paintDefs(id, P, G, defs, y0, y1) {
    const fin = G.col.fin;
    defs.push(`<linearGradient id="${id}sh" gradientUnits="userSpaceOnUse" x1="0" y1="${f(-y1)}" x2="0" y2="${f(-y0)}">` +
      `<stop offset="0" stop-color="#fff" stop-opacity="${r2(0.2 * fin[0])}"/><stop offset=".34" stop-color="#fff" stop-opacity="0"/>` +
      `<stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${r2(0.3 * fin[1])}"/></linearGradient>`);
    if (P.finish === 'metallic') {
      const rnd = rng(77);
      let s = '';
      for (let i = 0; i < 16; i++) s += `<circle cx="${f(rnd() * 70)}" cy="${f(rnd() * 70)}" r="${r2(2 + rnd() * 3)}" fill="#fff" fill-opacity="${r2(0.14 + rnd() * 0.2)}"/>`;
      defs.push(`<pattern id="${id}mt" patternUnits="userSpaceOnUse" width="70" height="70">${s}</pattern>`);
    }
    if (P.finish === 'pearl') {
      const h = P.hue < 0 ? 200 : P.hue;
      defs.push(`<linearGradient id="${id}pl" gradientUnits="userSpaceOnUse" x1="0" y1="${f(-y1)}" x2="900" y2="${f(-y0)}">` +
        `<stop offset="0" stop-color="${hsl(h + 50, 0.7, 0.75)}" stop-opacity=".28"/><stop offset=".5" stop-color="${hsl(h - 40, 0.7, 0.7)}" stop-opacity=".08"/><stop offset="1" stop-color="${hsl(h + 90, 0.6, 0.6)}" stop-opacity=".22"/></linearGradient>`);
    }
    // paint over a shape already in <defs>
    return (ref, base) => {
      const use = a => `<use href="#${ref}" ${a}/>`;
      return use(`fill="${base || G.col.C}" stroke="${G.col.edge}" stroke-width="12" stroke-linejoin="round"`) +
        (P.finish === 'metallic' ? use(`fill="url(#${id}mt)"`) : '') + (P.finish === 'pearl' ? use(`fill="url(#${id}pl)"`) : '') + use(`fill="url(#${id}sh)"`);
    };
  }

  // ------------------------------------------------------------- wheels
  // Spokes, from the hub to the inside of the rim. Each returns a path.
  const spokeEach = (c, n, fn) => { let d = ''; for (let i = 0; i < n; i++) d += fn(Math.PI / 2 + TAU * i / n); return d; };
  const pol = (c, r, a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  const side = (p, a, w) => [p[0] - Math.sin(a) * w, p[1] + Math.cos(a) * w];
  const SPOKE = {
    straight: (c, n, hub, rs, w) => spokeEach(c, n, a => poly([side(pol(c, hub, a), a, w), side(pol(c, rs, a), a, w), side(pol(c, rs, a), a, -w), side(pol(c, hub, a), a, -w)])),
    taper: (c, n, hub, rs, w) => spokeEach(c, n, a => poly([side(pol(c, hub, a), a, w * 1.7), side(pol(c, rs, a), a, w * 0.4), side(pol(c, rs, a), a, -w * 0.4), side(pol(c, hub, a), a, -w * 1.7)])),
    split: (c, n, hub, rs, w) => spokeEach(c, n, a => [-1, 1].map(s => { const b = a + s * Math.PI / n * 0.44; return poly([side(pol(c, hub, a), a, w * 0.5), side(pol(c, rs, b), b, w * 0.5), side(pol(c, rs, b), b, -w * 0.5), side(pol(c, hub, a), a, -w * 0.5)]); }).join('')),
    turbine: (c, n, hub, rs, w) => spokeEach(c, n, a => { const b = a + 0.55, m = a + 0.2; return poly([side(pol(c, hub, a), a, w), side(pol(c, (hub + rs) / 2, m), m, w), side(pol(c, rs, b), b, w * 0.7), side(pol(c, rs, b), b, -w * 0.7), side(pol(c, (hub + rs) / 2, m), m, -w), side(pol(c, hub, a), a, -w)]); }),
    disc: (c, n, hub, rs) => poly(ngon(c, rs, 40, 0)) + spokeEach(c, n, a => poly(ngon(pol(c, rs * 0.74, a), clamp(Math.PI * rs * 0.74 / n * 0.5, 9, rs * 0.17), 12, 0)))
  };
  const CALIPER = { grey: '#8b8f94', red: '#c8281f', yellow: '#e4b21b', blue: '#2458c6' };
  function wheel(cx, P, G, id, lod) {
    const Rw = G.Rw, rimR = Rw * P.rim, c = [cx, Rw], face = G.col.wheel;
    let s = circ(c, Rw, 'fill="#191a1c"') + circ(c, Rw - 14, 'fill="none" stroke="#2e2f33" stroke-width="12"');
    if (P.tyre === 'white') s += circ(c, (Rw + rimR) / 2 + 4, `fill="none" stroke="#e9e7e0" stroke-width="${f((Rw - rimR) * 0.4)}"`);
    if (P.tyre === 'line') s += circ(c, rimR + (Rw - rimR) * 0.32, 'fill="none" stroke="#d2362b" stroke-width="11"');
    s += circ(c, rimR, 'fill="#0f1012"');
    if (!lod) {
      s += circ(c, rimR * 0.64, 'fill="#74787d"') + circ(c, rimR * 0.3, 'fill="#101113"');
      const cal = [];
      for (let k = 0; k <= 8; k++) cal.push(pol(c, rimR * 0.7, 2.6 + k * 0.1));
      for (let k = 8; k >= 0; k--) cal.push(pol(c, rimR * 0.4, 2.6 + k * 0.1));
      s += path(poly(cal), `fill="${CALIPER[P.caliper]}"`);
    }
    const lip = rimR * (0.05 + 0.1 * P.dish), rs = rimR - lip, hub = rimR * (0.21 - 0.07 * P.dish), n = P.spokes;
    const w = clamp(Math.PI * rs / n * 0.4, 12, rimR * 0.2);
    s += path(SPOKE[P.spoke](c, n, hub, rs, w), `fill="${face}" fill-rule="evenodd" stroke="${mix(face, '#000', 0.5)}" stroke-width="${P.wfin === 'cut' ? 9 : 5}" stroke-linejoin="round"`);
    if (P.dish > 0) s += circ(c, rs, `fill="url(#${id}dg)" fill-opacity="${r2(P.dish)}"`);
    s += circ(c, rimR - lip / 2, `fill="none" stroke="${mix(face, '#fff', 0.3)}" stroke-width="${f(lip)}"`) + circ(c, rimR, 'fill="none" stroke="#000" stroke-opacity=".5" stroke-width="5"');
    s += circ(c, hub, `fill="${mix(face, '#000', 0.2)}" stroke="#000" stroke-opacity=".4" stroke-width="4"`) + (lod ? '' : circ(c, hub * 0.5, 'fill="#cfd2d6"'));
    return s;
  }
  const dishDef = id => `<radialGradient id="${id}dg"><stop offset="0" stop-color="#000" stop-opacity=".62"/><stop offset=".7" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;

  // =============================================================== SIDE
  const SHLINE = {   // shoulder line: offset from its base height, t from nose to tail, x along the car
    straight: () => 0,
    rising: t => lerp(-70, 60, t),
    arched: t => 60 * Math.sin(Math.PI * t) - 25,
    dropping: t => lerp(50, -95, t),
    haunch: (t, x, G) => 75 * Math.exp(-Math.pow((x - G.xb) / 430, 2))
  };
  const HANDLE = {   // door handles: x is the centre, y the centre height
    pull: (x, y, c) => rect(x - 80, y - 16, 160, 32, `fill="${c.trim}" stroke="#000" stroke-opacity=".5" stroke-width="5"`, 15) + rect(x - 70, y - 30, 140, 12, 'fill="#000" fill-opacity=".28"', 6),
    flush: (x, y, c) => rect(x - 80, y - 14, 160, 28, `fill="${c.C}" stroke="#000" stroke-opacity=".55" stroke-width="5"`, 13),
    flap: (x, y, c) => rect(x - 60, y - 24, 120, 48, 'fill="#101113"', 9) + rect(x - 52, y - 4, 104, 22, `fill="${c.C}" stroke="#000" stroke-opacity=".4" stroke-width="4"`, 7),
    none: (x, y) => circ([x, y], 11, 'fill="#101113"')
  };
  const MIRROR = {   // side view: p is the base point at the front of the side glass
    door: (p, c) => path(`M${f(p[0] + 60)},${f(-(p[1] - 30))}l-30,-45 l-130,-20 q-60,10 -50,70 l20,45 l150,0Z`, `fill="${c.C}" stroke="${c.edge}" stroke-width="9" stroke-linejoin="round"`),
    pillar: (p, c) => path(`M${f(p[0] - 20)},${f(-(p[1] + 20))}l-60,-10 l-140,-40 q-55,25 -40,85 l40,45 l130,-10Z`, `fill="${c.C}" stroke="${c.edge}" stroke-width="9" stroke-linejoin="round"`),
    camera: (p, c) => path(`M${f(p[0] + 20)},${f(-(p[1] - 10))}l-150,-35`, 'stroke="#1b1c1f" stroke-width="16" stroke-linecap="round"') + rect(p[0] - 215, p[1] + 5, 100, 46, 'fill="#1b1c1f"', 20) + circ([p[0] - 195, p[1] + 28], 9, 'fill="#5d7fb3"'),
    none: () => ''
  };

  function viewSide(P, G, o) {
    const id = o.idp, lod = o.lod, c = G.col, defs = [], out = [];
    const { L, H, Rw, Ra, xa, xb, clear, beltF, yD } = G;
    const paint = paintDefs(id, P, G, defs, clear, H);
    defs.push(dishDef(id));
    defs.push(`<path id="${id}b" d="${poly(G.body)}"/>`, `<clipPath id="${id}bc"><use href="#${id}b"/></clipPath>`);
    defs.push(`<path id="${id}g" d="${poly(G.dlo)}"/>`, `<clipPath id="${id}gc"><use href="#${id}g"/></clipPath>`);
    const inBody = s => `<g clip-path="url(#${id}bc)">${s}</g>`;
    const fa = c.fin[0];

    // ground shadow, wheel wells, wheels
    out.push(`<ellipse cx="${f(L / 2)}" cy="6" rx="${f(L * 0.52)}" ry="34" fill="#000" fill-opacity=".13"/>`);
    out.push(path(poly(G.archR) + poly(G.archF), 'fill="#101113"'));
    if (P.spare === 'tail') {
      const y0 = Math.max(yD - Rw * 2 - 40, G.yb2 + 60);
      out.push(rect(G.xFace(y0 + Rw) + 10, y0, G.tw * 0.92, Rw * 2, 'fill="#191a1c" stroke="#000" stroke-width="6"', 60) + rect(G.xFace(y0 + Rw) - 10, y0 + Rw - 60, 40, 120, `fill="${c.plastic}"`));
    }
    if (P.tow === 'bar') out.push(path(`M${f(G.xFace(G.yTb) - 60)},${f(-(G.yb2 + 10))}l150,0 l0,-50`, 'fill="none" stroke="#1b1c1f" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"') + circ([G.xFace(G.yTb) + 90, G.yb2 + 75], 24, 'fill="#8b8f94"'));
    out.push(wheel(xa, P, G, id, lod), wheel(xb, P, G, id, lod));

    // body
    out.push(paint(id + 'b'));

    // second colour on roof and pillars
    const xWb = G.xC + (beltF - G.yC) / Math.tan(G.sA);
    if (c.twoTone) {
      const reg = [[xWb - 4, beltF]];
      for (let x = G.xf0; x <= G.xr0; x += 60) reg.push([x, G.belt(x)]);
      reg.push([G.xr0, G.belt(G.xr0)], [G.xSB, G.belt(G.xr0)], [G.xRh, G.yRh], [G.xRh, H + 400], [G.xHd, H + 400], [G.xHd, G.yHd], [G.xC, G.yC]);
      out.push(inBody(path(poly(reg), `fill="${c.roof}"`) + path(poly(reg), `fill="url(#${id}sh)"`)));
      if (P.roofop === 'soft' && !lod) {
        const seams = [];
        for (let k = 1; k <= 3; k++) { const x = lerp(G.xHd, G.xRh, k / 4); seams.push(line([[x, G.topY(x)], [x - 30, G.topY(x) - 150]], '#000', 6, 'stroke-opacity=".4"')); }
        out.push(inBody(seams.join('')));
      }
    }
    // dark pillars
    const dark = '#141518';
    if (P.float === 'visor' || P.float === 'wrap') {
      const yTop = G.yHd - P.rail;
      out.push(inBody(path(poly([[xWb, beltF], [G.xHd, G.yHd], [G.xf0 + (yTop - beltF) / Math.tan(G.sA), yTop], [G.xf0, beltF]]), `fill="${dark}"`)));
    }
    if (P.float === 'float' || P.float === 'wrap') {
      const a = [], b = [];
      for (let x = G.xg1 - 500; x <= G.xSB + 40; x += 30) {
        const lo = Math.max(G.belt(Math.min(x, G.xr0)), x <= G.xr0 ? G.rearLine(x) : -1e9), hi = G.topY(x) - P.rail * 0.9;
        if (hi > lo + 10) { a.push([x, hi]); b.push([x, lo]); }
      }
      if (a.length > 1) out.push(inBody(path(poly(a.concat(rev(b))), `fill="${dark}"`)));
    }

    // glass, seats behind it, pillars across it
    let seats = '';
    if (!lod) {
      const rows = { 1: [0.62], 2: [0.36, 0.8], 3: [0.27, 0.56, 0.86] }[P.seats];
      for (const t of rows) { const x = lerp(G.xg0, G.xg1, t), y = G.belt(x); seats += rect(x - 85, y + 40, 170, 230, 'fill="#0b0c0e" fill-opacity=".75"', 60) + rect(x - 130, y - 200, 260, 290, 'fill="#0b0c0e" fill-opacity=".6"', 70); }
    }
    let pil = '';
    const pc = P.float === 'wrap' ? dark : c.twoTone ? c.roof : c.C;
    if (P.pillars >= 3 && P.roofop !== 'soft') pil += rect(G.xPB - 38, beltF - 200, 76, H, `fill="${pc}"`);
    if (P.pillars === 4 && P.roofop !== 'soft') pil += rect(G.xPC - 42, beltF - 200, 84, H, `fill="${pc}"`);
    else if (P.pillars === 2 || P.roofop === 'soft') pil += rect(G.xPB - 5, beltF - 200, 10, H, 'fill="#000" fill-opacity=".5"');
    out.push(`<use href="#${id}g" fill="${c.glass}"/><g clip-path="url(#${id}gc)">${seats}<use href="#${id}g" fill="${c.glass}" fill-opacity="${r2(0.35 + P.tint * 0.6)}"/>` +
      path(poly([[G.xg0 - 100, H + 300], [G.xg0 + 500, H + 300], [G.xg0 + 150, beltF - 100], [G.xg0 - 450, beltF - 100]]), 'fill="#fff" fill-opacity=".1"') + pil + '</g>');
    if (P.frame === 'framed') out.push(`<use href="#${id}g" fill="none" stroke="${c.trim}" stroke-width="16" stroke-linejoin="round"/><use href="#${id}g" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="4"/>`);
    else out.push(`<use href="#${id}g" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="5"/>`);
    // windscreen and rear screen, seen edge-on as slivers
    const yS = G.yHd - 30, sl = 60 / Math.sin(G.sA);
    out.push(inBody(path(poly([[xWb + 8, beltF + 12], [G.xHd - 10, yS + 20], [G.xHd - 10 + sl, yS], [xWb + 8 + sl, beltF]]), `fill="${c.glass}" fill-opacity=".85"`)));
    if (!G.bed && G.xSB - G.xRh > 120) {
      const yb = Math.max(G.beltR, G.deck ? yD : G.tailTop[1]) + 20, xb0 = G.xRh + (G.yRh - yb) / Math.max(0.2, G.tF > 100 ? 100 : G.tF);
      out.push(inBody(path(poly([[G.xRh + 30, G.yRh - 45], [Math.min(xb0, G.xSB + 60), yb], [Math.min(xb0, G.xSB + 60) - 75, yb], [G.xRh - 40, G.yRh - 55]]), `fill="${c.glass}" fill-opacity=".85"`)));
    }

    // lower body: cladding, contrast, sill, stripes, glow
    const sillPts = [];
    for (let x = xa - Ra; x <= xb + Ra; x += 50) sillPts.push([x, G.ySill(x)]);
    const below = pts => pts.concat([[pts[pts.length - 1][0], -50], [pts[0][0], -50]]);
    let low = '';
    if (P.clad === 'contrast') {
      const cl = [];
      for (let x = -100; x <= L + 100; x += 80) cl.push([x, G.ySill(x) + (beltF - clear) * 0.28]);
      low += path(poly(below(cl)), `fill="${c.lower}"`);
    }
    if (P.clad === 'sill' || P.clad === 'arches') {
      low += path(poly(below(sillPts)), `fill="${c.plastic}"`) + rect(-200, 0, G.xl + 420, G.yb1 + 110, `fill="${c.plastic}"`) + rect(G.xFace(G.yTb) - 330, 0, 600, G.yb2 + 100, `fill="${c.plastic}"`);
    }
    if (P.sill === 'step') low += rect(xa + Ra + 30, clear + 20, xb - xa - 2 * Ra - 60, 75, `fill="${c.plastic}" stroke="#000" stroke-width="5"`, 20) + rect(xa + Ra + 60, clear + 78, xb - xa - 2 * Ra - 120, 10, 'fill="#fff" fill-opacity=".3"');
    if (P.sidestripe === 'low') low += rect(xa + Ra + 40, clear + 190, xb - xa - 2 * Ra - 80, 70, `fill="${c.stripe}"`) + rect(xa + Ra + 40, clear + 285, xb - xa - 2 * Ra - 80, 16, `fill="${c.stripe}"`);
    if (P.glowp === 'sills') low += line(sillPts.filter(p => p[0] > xa + Ra && p[0] < xb - Ra).map(p => [p[0], clear + 40]), '#8ff1ff', 60, 'stroke-opacity=".3"') + line(sillPts.filter(p => p[0] > xa + Ra && p[0] < xb - Ra).map(p => [p[0], clear + 40]), '#e9feff', 18);
    out.push(inBody(low));

    // surfaces: reflections along the side
    const shBase = x => G.belt(clamp(x, G.xf0, G.xr0)) - P.shoulder;
    const xs0 = G.xu + 260, xs1 = G.tailTop[0] - 200;
    const shY = x => shBase(x) + SHLINE[P.shline]((x - xs0) / (xs1 - xs0), x, G);
    const curve = fn => { const p = []; for (let x = xs0; x <= xs1; x += 70) p.push([x, fn(x)]); return p; };
    const bandBetween = (f1, f2) => { const a = curve(f1), b = curve(f2); return poly(a.concat(rev(b))); };
    const SCULPT = {
      taut: () => path(bandBetween(x => shY(x) - 20, x => shY(x) - 105), `fill="#fff" fill-opacity="${r2(0.17 * fa)}"`) + path(bandBetween(x => clear + 330, x => clear + 150), `fill="#000" fill-opacity="${r2(0.1 * c.fin[1])}"`),
      soft: () => path(bandBetween(x => shY(x) - 40, x => shY(x) - 230 - 60 * Math.sin(Math.PI * (x - xs0) / (xs1 - xs0))), `fill="#fff" fill-opacity="${r2(0.1 * fa)}"`),
      hollow: () => path(bandBetween(x => shY(x) - 15, x => shY(x) - 80), `fill="#fff" fill-opacity="${r2(0.18 * fa)}"`) +
        path(bandBetween(x => clear + 420 + 130 * Math.sin(Math.PI * clamp((x - xa) / (xb - xa), 0, 1)), x => clear + 200), `fill="#000" fill-opacity="${r2(0.17 * c.fin[1])}"`) +
        path(bandBetween(x => clear + 215, x => clear + 165), `fill="#fff" fill-opacity="${r2(0.14 * fa)}"`),
      flat: () => ''
    };
    let surf = SCULPT[P.sculpt]();
    const clearOfArch = p => Math.hypot(p[0] - xa, p[1] - Rw) > Ra + 40 && Math.hypot(p[0] - xb, p[1] - Rw) > Ra + 40;
    const crease = fn => {
      const pts = curve(fn);
      let s = '', run = [];
      const flush = () => { if (run.length > 1) s += line(run, '#000', 7, 'stroke-opacity=".38"') + line(run.map(p => [p[0], p[1] + 9]), '#fff', 7, `stroke-opacity="${r2(0.3 * fa + 0.08)}"`); run = []; };
      for (const p of pts) { if (clearOfArch(p)) run.push(p); else flush(); }
      flush();
      return s;
    };
    if (P.lines >= 1) surf += crease(shY);
    if (P.lines >= 2) surf += crease(x => G.ySill(x) + (shBase(x) - G.ySill(x)) * 0.3 + 40 * (x - xs0) / (xs1 - xs0));
    if (P.shade === 'panels') {
      const cutsX = [-200, G.xD0, G.xD1, G.xD2, L + 300], al = [0.2, 0, 0.26, 0.08];
      surf += cutsX.slice(0, -1).map((x, i) => (cutsX[i + 1] - x > 5 ? rect(x, 0, cutsX[i + 1] - x, beltF + 400, `fill="${i % 2 ? '#fff' : '#000'}" fill-opacity="${al[i]}"`) : '')).join('');
    }
    if (P.sidestripe === 'pin') surf += line(curve(x => shBase(x) + P.shoulder - 45), c.stripe, 14);
    out.push(inBody(surf));

    // open bed
    if (G.bed) {
      const x0 = G.xAtD + 60, x1 = G.tailTop[0];
      out.push(inBody(rect(x0 - 30, clear, 22, yD, 'fill="#000" fill-opacity=".7"') + rect(x0, yD - 36, x1 - x0 + 50, 60, `fill="${c.plastic}"`) + rect(x1 - 150, G.yb2, 8, yD, 'fill="#000" fill-opacity=".5"') +
        (lod ? '' : [0.25, 0.5, 0.75].map(t => rect(lerp(x0, x1, t) - 4, yD - 120, 8, 40, 'fill="#000" fill-opacity=".45"')).join(''))));
    }

    // arch lips and flares
    const lipCol = P.clad === 'arches' ? c.plastic : mix(c.C, '#000', 0.18);
    if (P.flare > 0 || P.clad === 'arches') {
      const wLip = 26 + P.flare * 0.9;
      out.push(inBody([G.archF, G.archR].map(a => line(a, lipCol, wLip * 2, 'stroke-linejoin="round"') + (P.flare > 0 ? line(a.map(p => { const cx = p[0] < (xa + xb) / 2 ? xa : xb, d = Math.hypot(p[0] - cx, p[1] - Rw) || 1; return [p[0] + (p[0] - cx) / d * wLip, p[1] + (p[1] - Rw) / d * wLip]; }), '#fff', 7, `stroke-opacity="${r2(0.22 * fa + 0.1)}"`) : '')).join('')));
    }
    out.push(line(G.archF, '#000', 7, 'stroke-opacity=".5"') + line(G.archR, '#000', 7, 'stroke-opacity=".5"'));

    // doors: cut lines, handles
    const cutLine = (x, k, rear) => {
      const y0 = G.ySill(x) - 40, y1 = G.belt(clamp(x, G.xf0, G.xr0));
      const CUT = {
        vert: () => [[x, y0], [x, y1]],
        lean: () => [[x - 50, y0], [x + 40, y1]],
        arch: () => (rear ? [[x - 190, y0], [x - 150, y0 + 190], [x - 20, lerp(y0, y1, 0.62)], [x, y1]] : [[x, y0], [x, y1]])
      };
      return line(CUT[P.cuts](), '#000', 6, 'stroke-opacity=".62" stroke-linejoin="round"');
    };
    let doors = cutLine(G.xD0, 0, false);
    if (G.two) doors += cutLine(G.xD1, 1, false);
    doors += cutLine(G.xD2, 2, true);
    doors += line([[G.xD0, G.ySill(G.xD0) - 40], [G.xD2 - (P.cuts === 'arch' ? 190 : 0), G.ySill(G.xD2) - 40]], '#000', 6, 'stroke-opacity=".5"');
    const hy = x => ({ shoulder: shY(x) - 20, belt: G.belt(clamp(x, G.xf0, G.xr0)) - 70, mid: (G.belt(clamp(x, G.xf0, G.xr0)) + G.ySill(x)) / 2 + 40 })[P.hpos];
    const hx = [G.xD1 - 190];
    if (G.two) hx.push(P.dooropen === 'coach' ? G.xD1 + 190 : G.xD2 - 200);
    doors += hx.map(x => HANDLE[P.handle](x, hy(x), c)).join('');
    if (P.dooropen === 'slide') doors += rect(G.xD2 - 30, hy(G.xD2) - 130, 520, 18, 'fill="#000" fill-opacity=".55"', 9);
    out.push(doors);

    // filler door, mirror
    const FILLER = { rear: [Math.min(xb + Ra * 0.75, L - 260), G.archTop + (G.beltR - G.archTop) * 0.55], front: [Math.max(xa - Ra * 0.2, G.xu + 300), G.archTop + (beltF - G.archTop) * 0.6], none: null };
    if (FILLER[P.filler]) out.push(circ(FILLER[P.filler], 78, 'fill="none" stroke="#000" stroke-opacity=".6" stroke-width="6"'));
    const mBase = P.mirror === 'pillar' ? [G.xf0 - 30, beltF + 40] : [G.xf0 + 150, beltF];
    out.push(MIRROR[P.mirror](mBase, c));

    // lamps wrapping round the corners
    const hlY = G.yN - 25 - P.hlpos * Math.max(0, G.yN - G.yb1 - P.hlh - 110), hlLen = clamp(P.hlw * 0.4 + 50, 90, 340);
    const noseX = y => G.xl + (G.xu - G.xl) * clamp((y - G.yLow) / Math.max(1, G.yN - G.yLow), 0, 1);
    const hh = P.hlsplit === 'split' ? Math.max(24, P.hlh * 0.24) : P.hlh;
    let lamps = rect(noseX(hlY - hh / 2) + 14, hlY - hh, hlLen, hh, 'fill="#e6eef5" stroke="#000" stroke-opacity=".6" stroke-width="5"', Math.min(hh, hlLen) * 0.5 * P.hlsoft) +
      (P.drl !== 'none' ? rect(noseX(hlY - hh / 2) + 22, hlY - Math.min(hh, 22) - 4, hlLen - 16, Math.min(hh * 0.5, 18), 'fill="#ffffff"', 8) : '');
    if (P.hlsplit === 'split') lamps += rect(noseX(G.yLow + 60) + 14, G.yb1 + 0.42 * (G.yN - G.yb1), hlLen * 0.6, 70, 'fill="#cfdbe6" stroke="#000" stroke-opacity=".6" stroke-width="5"', 22);
    if (P.bar !== 'none') lamps += rect(noseX(hlY) + 6, hlY - 20, 70, 16, 'fill="#ffffff"', 6);
    if (P.glowp === 'face') lamps += rect(G.xl - 60, G.yLow + 20, 190, Math.max(70, G.yN - G.yLow - 90), 'fill="#8ff1ff" fill-opacity=".3"', 40) + rect(G.xl - 6, G.yLow + 40, 70, Math.max(50, G.yN - G.yLow - 130), 'fill="#e9feff" fill-opacity=".9"', 24);
    const tlY = yD - 20 - P.tlpos * Math.max(0, yD - G.yb2 - P.tlh - 120), tlLen = clamp(P.tlw * 0.4 + 40, 80, 300);
    lamps += rect(G.xFace(tlY - P.tlh / 2) - tlLen - 12, tlY - P.tlh, tlLen, P.tlh, 'fill="#8a1418" stroke="#000" stroke-opacity=".6" stroke-width="5"', Math.min(P.tlh, tlLen) * 0.5 * P.tlsoft) +
      rect(G.xFace(tlY - P.tlh / 2) - tlLen - 2, tlY - P.tlh * 0.62, tlLen - 20, Math.max(10, P.tlh * 0.22), 'fill="#ff4a3d"', 6);
    if (P.tbar !== 'none') lamps += rect(G.xFace(tlY) - 80, tlY - 22, 70, 16, 'fill="#ff4a3d"', 6);
    out.push(inBody(lamps));

    // roof furniture, spoilers, moving aero
    const top = [];
    if (P.rails !== 'none') {
      const a = G.xHd + 160, b = G.xRh - 120, lift = P.rails === 'flush' ? 14 : 52;
      const rl = [];
      for (let x = a; x <= b; x += 80) rl.push([x, G.topY(x) + lift]);
      if (rl.length > 1) {
        top.push(line(rl, '#1b1c1f', 20, 'stroke-linecap="round"'));
        if (P.rails !== 'flush') top.push([0, 0.5, 1].map(t => { const x = lerp(a, b, t); return line([[x, G.topY(x)], [x, G.topY(x) + lift]], '#1b1c1f', 22); }).join(''));
        if (P.rails === 'bars') top.push([0.22, 0.78].map(t => { const x = lerp(a, b, t); return rect(x - 45, G.topY(x) + lift + 6, 90, 34, 'fill="#3a3c40" stroke="#000" stroke-width="4"', 14); }).join(''));
      }
    }
    const xAnt = Math.max(G.xRh - 260, G.xHd + 200);
    const ANT = { fin: () => path(poly([[xAnt - 90, G.topY(xAnt - 90) - 4], [xAnt + 50, G.topY(xAnt + 50) + 48], [xAnt + 80, G.topY(xAnt + 80) - 4]]), `fill="${c.twoTone ? c.roof : c.C}" stroke="${c.edge}" stroke-width="7" stroke-linejoin="round"`), none: () => '', mast: () => line([[xAnt, G.topY(xAnt)], [xAnt + 190, G.topY(xAnt) + 380]], '#1b1c1f', 9, 'stroke-linecap="round"') };
    top.push(ANT[P.antenna]());
    if (P.sensor === 'roof') top.push(rect(G.xHd + 60, G.topY(G.xHd + 180) - 6, 260, 78, 'fill="#1b1c1f" stroke="#000" stroke-width="5"', 34));
    if (P.solar === 'cells' || P.roofop === 'glass' || P.roofop === 'sunroof') {
      const a = G.xHd + 120, b = P.roofop === 'sunroof' ? lerp(G.xHd, G.xRh, 0.5) : G.xRh - 140, rl = [];
      for (let x = a; x <= b; x += 60) rl.push([x, G.topY(x) + 3]);
      if (rl.length > 1) top.push(line(rl, P.solar === 'cells' ? '#1c2f5e' : '#0d1116', 16));
    }
    const tt = G.tailTop;
    const SPOILER = {
      none: () => '',
      lip: () => path(poly([[tt[0] - 190, G.topY(tt[0] - 190)], [tt[0] + 10, tt[1] + 42], [tt[0] + 14, tt[1] - 6]]), `fill="${c.C}" stroke="${c.edge}" stroke-width="8" stroke-linejoin="round"`),
      duck: () => path(poly([[tt[0] - 330, G.topY(tt[0] - 330)], [tt[0] - 60, tt[1] + 70], [tt[0] + 50, tt[1] + 125], [tt[0] + 30, tt[1] - 10]]), `fill="${c.C}" stroke="${c.edge}" stroke-width="8" stroke-linejoin="round"`),
      wing: () => { const x = tt[0] - 180, y = Math.max(tt[1], G.topY(x)); return line([[x - 60, y - 10], [x - 20, y + 190]], '#1b1c1f', 26) + path(poly([[x - 190, y + 195], [x + 150, y + 215], [x + 160, y + 250], [x - 170, y + 235]]), `fill="${c.C}" stroke="${c.edge}" stroke-width="8" stroke-linejoin="round"`); },
      roof: () => path(poly([[G.xRh - 120, G.topY(G.xRh - 120)], [G.xRh + 210, G.yRh + 14], [G.xRh + 215, G.yRh - 26], [G.xRh + 20, G.yRh - 40]]), `fill="${c.twoTone ? c.roof : c.C}" stroke="${c.edge}" stroke-width="8" stroke-linejoin="round"`)
    };
    top.push(SPOILER[P.spoiler]());
    const AERO = {
      none: () => '',
      wing: () => { const x = tt[0] - 170, y = Math.max(tt[1], G.topY(x)); return path(poly([[x - 200, y + 300], [x + 150, y + 330], [x + 160, y + 370], [x - 180, y + 345]]) + poly([[x - 40, y], [x - 10, y + 300]], false), GHOST); },
      brake: () => { const x = tt[0] - 260, y = Math.max(tt[1], G.topY(x)); return path(poly([[x, y], [x + 250, y + 330], [x + 290, y + 300], [x + 60, y]]), GHOST); }
    };
    top.push(AERO[P.aero]());
    if (P.tow === 'hooks') top.push(circ([G.xl + 40, G.yb1 + 40], 30, 'fill="none" stroke="#c8281f" stroke-width="16"'));
    if (P.dooropen === 'slide') top.push(path(poly([[G.xD1 + 620, G.ySill(G.xD1) - 20], [G.xD2 + 620, G.ySill(G.xD2) - 20], [G.xD2 + 620, G.belt(G.xr0)], [G.xD1 + 620, G.belt(G.xD1)]]), GHOST));
    out.push(top.join(''));

    // street: a figure 1.75 m tall for scale
    let x1 = Math.max(5950, L + 500 + (P.spare === 'tail' ? 250 : 0));
    if (o.street) {
      const fx = L + 760, sk = '#b9b3a8';
      out.push(`<line x1="-350" y1="0" x2="${f(fx + 600)}" y2="0" stroke="#8d8f8c" stroke-width="8"/>` +
        circ([fx, 1640], 110, `fill="${sk}"`) + path(`M${f(fx - 190)},-1480 q190,-90 380,0 l40,640 l-80,0 l-30,-420 l-10,520 l30,740 l-110,0 l-50,-700 l-50,700 l-110,0 l30,-740 l-10,-520 l-30,420 l-80,0Z`, `fill="${sk}"`));
      x1 = fx + 620;
    }
    const y1 = Math.max(2230, H + 420);
    return {
      defs: defs.join(''), body: out.join(''), box: [-350, -y1, x1 + 350, y1 + 300],
      anchors: {
        wheelF: [xa, -Rw], wheelR: [xb, -Rw], door: [(G.xD0 + G.xD2) / 2, -(beltF + clear) / 2 - 80], nose: [G.xu + 300, -G.yN + 150],
        tail: [L - 420, -yD - 60], glass: [(G.xg0 + G.xg1) / 2, -(beltF + H) / 2], mirror: [G.xf0 - 20, -beltF - 10], roofR: [G.xRh - 250, -G.yRh - 120]
      }
    };
  }

  // ------------------------------------------------- lamps, front and rear
  // One lamp opening on the right-hand side, centre (cz, cy). The opening is
  // the socket; the lit element sits inside it, set back and under a brow.
  function outlineAt(cz, cy, w, h, sides, soft, slant, taper, N) {
    const tS = Math.tan((slant || 0) * RAD);
    return softOutline(sides, soft, N).map(p => { const z = p[0] * w / 2 * (1 + (taper || 0) * p[1]); return [cz + z, cy + p[1] * h / 2 + tS * z]; });
  }
  const SIGNAL = {   // lit shapes drawn along an outline E (points from the outer end, over the top, to the inner end and back)
    top: (E, w, col) => line(E.slice(0, Math.floor(E.length / 2) + 1), col, w, 'stroke-linecap="round" stroke-linejoin="round"'),
    ring: (E, w, col) => path(poly(E), `fill="none" stroke="${col}" stroke-width="${r2(w)}" stroke-linejoin="round"`),
    outline: (E, w, col) => path(poly(E), `fill="none" stroke="${col}" stroke-width="${r2(w)}" stroke-linejoin="round"`),
    hook: (E, w, col) => line(E.slice(Math.floor(E.length * 0.82)).concat(E.slice(0, Math.floor(E.length / 2) + 1)), col, w, 'stroke-linecap="round" stroke-linejoin="round"'),
    dots: (E, w, col, c, sw, sh) => [-0.36, -0.18, 0, 0.18, 0.36].map(t => circ([c[0] + t * sw, c[1]], Math.max(w * 0.55, Math.min(sh * 0.16, sw * 0.06)), `fill="${col}"`)).join(''),
    line: (E, w, col, c, sw) => line([[c[0] - sw * 0.42, c[1]], [c[0] + sw * 0.42, c[1]]], col, w * 1.2, 'stroke-linecap="round"'),
    blades: (E, w, col, c, sw, sh) => [-0.3, -0.1, 0.1, 0.3].map(t => line([[c[0] + t * sw, c[1] - sh * 0.34], [c[0] + t * sw, c[1] + sh * 0.34]], col, w, 'stroke-linecap="round"')).join(''),
    fill: (E, w, col) => path(poly(E), `fill="${col}"`),
    none: () => ''
  };
  // a projector lens: glass in a ring, with one glint
  const LENS = (c, r) => circ(c, r, 'fill="#8fa3b3" stroke="#51616d" stroke-width="7"') + circ(c, r * 0.62, 'fill="#b9c9d6" stroke="#f4f8fb" stroke-width="4"') + circ([c[0] - r * 0.25, c[1] + r * 0.25], r * 0.2, 'fill="#fff" fill-opacity=".85"');
  const HLIN = {   // inside a headlamp: c centre, w and h of the lit element
    proj: (c, w, h) => LENS(c, Math.min(h * 0.34, w * 0.2)),
    twin: (c, w, h) => [-0.22, 0.22].map(t => LENS([c[0] + t * w, c[1]], Math.min(h * 0.3, w * 0.15))).join(''),
    bowl: (c, w, h) => `<ellipse cx="${f(c[0])}" cy="${f(-c[1])}" rx="${f(w * 0.36)}" ry="${f(h * 0.36)}" fill="#f7fafc" stroke="#9fb0bd" stroke-width="5"/>` + ngon(c, Math.min(w, h) * 0.3, 10, 0).map(p => line([c, p], '#9fb0bd', 3)).join('') + circ(c, Math.min(w, h) * 0.07, 'fill="#fde9a8"'),
    matrix: (c, w, h) => { let s = ''; const nx = Math.max(3, Math.round(w / 46)), ny = Math.max(1, Math.round(h / 46)); for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) s += rect(c[0] - w * 0.4 + i * w * 0.8 / nx + 3, c[1] - h * 0.36 + j * h * 0.72 / ny + 3, w * 0.8 / nx - 6, h * 0.72 / ny - 6, 'fill="#31404d" stroke="#f4f8fb" stroke-width="3"', 3); return s; },
    strip: (c, w, h) => rect(c[0] - w * 0.4, c[1] - Math.min(h * 0.12, 10), w * 0.8, Math.min(h * 0.24, 20), 'fill="#31404d"', 6)
  };
  const TLIN = {
    blade: (c, w, h) => rect(c[0] - w * 0.38, c[1] - h * 0.3, w * 0.76, h * 0.12, 'fill="#ff7a6e" fill-opacity=".7"', 4),
    dots: (c, w, h) => { let s = ''; const nx = Math.max(3, Math.round(w / 50)), ny = Math.max(1, Math.round(h / 50)); for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) s += circ([c[0] - w * 0.36 + (i + 0.5) * w * 0.72 / nx, c[1] - h * 0.32 + (j + 0.5) * h * 0.64 / ny], 7, 'fill="#ff7a6e"'); return s; },
    blocks: (c, w, h) => [-0.26, 0, 0.26].map(t => rect(c[0] + t * w - w * 0.1, c[1] - h * 0.3, w * 0.2, h * 0.6, 'fill="#b01e1e" stroke="#3b0709" stroke-width="4"', 4)).join(''),
    panel: (c, w, h) => rect(c[0] - w * 0.4, c[1] - h * 0.34, w * 0.8, h * 0.68, 'fill="#ff5a4d" fill-opacity=".55"', Math.min(w, h) * 0.12)
  };
  function lampUnit(id, n, P, G, defs, cz, cy, w, h, kind, lod) {
    const head = kind === 'head', N = lod ? 28 : 56;
    const sides = head ? P.hlsides : 4, soft = head ? P.hlsoft : P.tlsoft, slant = head ? P.hlslant : 0;
    const O = outlineAt(cz, cy, w, h, sides, soft, slant, 0, N);
    const ap = P.aper, drop = Math.min(P.brow * 0.4 + P.socket * 0.08, h * 0.2);
    const E = outlineAt(cz, cy - drop * (1 - ap + 0.2), w * (0.25 + 0.75 * ap), h * (0.3 + 0.7 * ap), sides, soft, slant, 0, N);
    const ec = [cz, cy - drop * (1 - ap + 0.2)], ew = w * (0.25 + 0.75 * ap), eh = h * (0.3 + 0.7 * ap);
    const cl = id + 'k' + n;
    defs.push(`<clipPath id="${cl}"><path d="${poly(O)}"/></clipPath>`);
    const lens = head ? '#c6d3de' : '#4a0d10', lit = head ? '#ffffff' : '#ff4336', halo = head ? '#bfe3ff' : '#ff7a6e';
    let s = path(poly(O), 'fill="#0b0c0e"') + `<g clip-path="url(#${cl})">` + path(poly(E), `fill="${lens}"`);
    if (!lod) s += (head ? HLIN[P.hlin] : TLIN[P.tlin])(ec, ew, eh);
    const sw = clamp(eh * 0.15, 7, 26), sig = head ? P.drl : P.tsig;
    s += `<g stroke-opacity=".3" fill-opacity=".3">${SIGNAL[sig](E, sw * 2.6, halo, ec, ew, eh)}</g>` + SIGNAL[sig](E, sw, lit, ec, ew, eh);
    // the socket: shade from above, deeper with depth; then the brow
    const top = cy + h / 2 + Math.abs(Math.tan(slant * RAD)) * w / 2;
    if (P.socket > 0) s += rect(cz - w, top - h * (0.3 + P.socket / 240) - 10, 2 * w, h * (0.3 + P.socket / 240) + 10, `fill="url(#${id}sg)" fill-opacity="${r2(Math.min(0.8, 0.25 + P.socket / 180))}"`);
    if (P.brow > 0) {
      const bh = Math.min(P.brow * 1.5, h * 0.38), Ob = O.map(p => [p[0], p[1] - bh]);
      defs.push(`<mask id="${cl}m" maskUnits="userSpaceOnUse" x="${f(cz - w)}" y="${f(-(top + 40))}" width="${f(2 * w)}" height="${f(h * 2 + 80)}"><rect x="${f(cz - w)}" y="${f(-(top + 40))}" width="${f(2 * w)}" height="${f(h * 2 + 80)}" fill="#fff"/><path d="${poly(Ob)}" fill="#000"/></mask>`);
      s += `<g mask="url(#${cl}m)">` + path(poly(O), `fill="${G.col.C}"`) + path(poly(O), 'fill="#000" fill-opacity=".12"') + '</g>' +
        line(Ob.slice(0, Math.floor(N / 2) + 1), '#000', Math.min(22, 8 + P.brow * 0.25), 'stroke-opacity=".5"');
    }
    return s + '</g>' + path(poly(O), 'fill="none" stroke="#000" stroke-opacity=".7" stroke-width="6" stroke-linejoin="round"');
  }
  const socketDef = id => `<linearGradient id="${id}sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`;

  // The body seen from either end: lower body, shoulders, tumblehome, roof.
  function endSilhouette(G, yLowEdge, yShoulder, yRoofSide, yRoofTop, cornerR) {
    const hw = G.hw, q = cornerR;
    return `M${f(-hw + q)},${f(-yLowEdge)}Q${f(-hw)},${f(-yLowEdge)} ${f(-hw)},${f(-(yLowEdge + q))}L${f(-hw)},${f(-(yShoulder - 60))}Q${f(-hw)},${f(-yShoulder)} ${f(-G.hwS)},${f(-yShoulder)}` +
      `L${f(-G.hwR - 30)},${f(-(yRoofSide - 60))}Q${f(-G.hwR)},${f(-yRoofSide)} ${f(-G.hwR + 90)},${f(-(yRoofSide + (yRoofTop - yRoofSide) * 0.7))}Q0,${f(-(yRoofTop + (yRoofTop - yRoofSide) * 0.3))} ${f(G.hwR - 90)},${f(-(yRoofSide + (yRoofTop - yRoofSide) * 0.7))}` +
      `Q${f(G.hwR)},${f(-yRoofSide)} ${f(G.hwR + 30)},${f(-(yRoofSide - 60))}L${f(G.hwS)},${f(-yShoulder)}Q${f(hw)},${f(-yShoulder)} ${f(hw)},${f(-(yShoulder - 60))}L${f(hw)},${f(-(yLowEdge + q))}Q${f(hw)},${f(-yLowEdge)} ${f(hw - q)},${f(-yLowEdge)}Z`;
  }
  function endCommon(P, G, o, defs, out, yLowEdge, rear) {
    const c = G.col, hw = G.hw, Rw = G.Rw;
    out.push(`<ellipse cx="0" cy="6" rx="${f(hw * 1.02)}" ry="30" fill="#000" fill-opacity=".13"/>`);
    // tyres, with the wheel inset from the body side
    const zo = hw - P.track + (P.flare > 0 ? P.flare * 0.4 : 0);
    out.push([1, -1].map(s => rect(s > 0 ? zo - G.tw : -zo, 0, G.tw, Rw * 1.9, 'fill="#191a1c"', 46) +
      (o.lod ? '' : [0.25, 0.5, 0.75].map(t => rect((s > 0 ? zo - G.tw : -zo) + G.tw * t - 4, 20, 8, Rw * 1.1, 'fill="#000" fill-opacity=".5"')).join(''))).join(''));
    if (P.flare > 0) out.push([1, -1].map(s => path(`M${f(s * (hw - 30))},${f(-(G.archTop + 60))}Q${f(s * (hw + P.flare * 1.1))},${f(-(G.archTop + 20))} ${f(s * (hw + P.flare * 0.9))},${f(-(Rw * 1.2))}L${f(s * (hw - 40))},${f(-(Rw * 1.1))}Z`, `fill="${P.clad === 'arches' ? c.plastic : c.C}" stroke="${c.edge}" stroke-width="9" stroke-linejoin="round"`)).join(''));
  }
  const MIRRORF = {   // front or rear view: s is the side, base at the shoulder
    door: (s, z, y, c) => path(`M${f(s * z)},${f(-(y - 20))}l${f(s * 60)},-30 l${f(s * 150)},-10 q${f(s * 40)},20 ${f(s * 30)},80 l${f(-s * 170)},40Z`, `fill="${c.C}" stroke="${c.edge}" stroke-width="9" stroke-linejoin="round"`),
    pillar: (s, z, y, c) => path(`M${f(s * (z - 20))},${f(-(y + 40))}l${f(s * 70)},-40 l${f(s * 150)},-10 q${f(s * 40)},20 ${f(s * 30)},80 l${f(-s * 170)},40Z`, `fill="${c.C}" stroke="${c.edge}" stroke-width="9" stroke-linejoin="round"`),
    camera: (s, z, y) => path(`M${f(s * z)},${f(-(y - 10))}l${f(s * 150)},-30`, 'stroke="#1b1c1f" stroke-width="16" stroke-linecap="round"') + circ([s * (z + 165), y + 22], 26, 'fill="#1b1c1f"'),
    none: () => ''
  };
  function roofFurniture(P, G, yTop, hwR) {
    const s = [];
    if (P.rails !== 'none') s.push([1, -1].map(k => rect(k * (hwR - 90) - 22, yTop - 40, 44, P.rails === 'flush' ? 30 : 70, 'fill="#1b1c1f"', 12)).join('') + (P.rails === 'bars' ? rect(-hwR + 60, yTop + 10, 2 * hwR - 120, 26, 'fill="#3a3c40" stroke="#000" stroke-width="4"', 10) : ''));
    if (P.antenna === 'fin') s.push(path(poly([[-18, yTop - 4], [0, yTop + 66], [18, yTop - 4]]), `fill="${G.col.twoTone ? G.col.roof : G.col.C}" stroke="${G.col.edge}" stroke-width="7" stroke-linejoin="round"`));
    if (P.antenna === 'mast') s.push(line([[hwR * 0.5, yTop - 20], [hwR * 0.5, yTop + 330]], '#1b1c1f', 9, 'stroke-linecap="round"'));
    if (P.sensor === 'roof') s.push(rect(-150, yTop - 6, 300, 76, 'fill="#1b1c1f" stroke="#000" stroke-width="5"', 34));
    return s.join('');
  }
  const PLATE = (z, y) => rect(z - 260, y - 56, 520, 112, 'fill="#e9e9e3" stroke="#3a3c40" stroke-width="6"', 10);
  const BADGE = {   // blank shapes only
    round: (z, y, c) => circ([z, y], 40, `fill="${mix(c.C, '#000', 0.25)}" stroke="${c.trim === c.C ? '#d5d8dc' : c.trim}" stroke-width="8"`),
    none: () => '',
    shield: (z, y, c) => path(`M${f(z - 34)},${f(-(y + 40))}h68v44q0,36 -34,46q-34,-10 -34,-46Z`, `fill="${mix(c.C, '#000', 0.25)}" stroke="${c.trim === c.C ? '#d5d8dc' : c.trim}" stroke-width="8" stroke-linejoin="round"`),
    bar: (z, y, c) => rect(z - 90, y - 15, 180, 30, `fill="${mix(c.C, '#000', 0.25)}" stroke="${c.trim === c.C ? '#d5d8dc' : c.trim}" stroke-width="7"`, 8)
  };

  // ============================================================== FRONT
  const GRILLE = {   // pattern inside the grille, over its box [z0, y0, w, h]; d is the pitch
    hbars: (z0, y0, w, h, d, col) => { let s = ''; for (let y = y0 + d / 2; y < y0 + h; y += d) s += rect(z0, y - d * 0.16, w, d * 0.32, `fill="${col}"`); return s; },
    vbars: (z0, y0, w, h, d, col) => { let s = ''; for (let z = z0 + d / 2; z < z0 + w; z += d) s += rect(z - d * 0.16, y0, d * 0.32, h, `fill="${col}"`); return s; },
    mesh: (z0, y0, w, h, d, col) => { let s = ''; for (let k = -h; k < w + h; k += d) s += line([[z0 + k, y0], [z0 + k + h, y0 + h]], col, d * 0.14) + line([[z0 + k + h, y0], [z0 + k, y0 + h]], col, d * 0.14); return s; },
    dots: (z0, y0, w, h, d, col) => { let s = '', j = 0; for (let y = y0 + d / 2; y < y0 + h; y += d * 0.8, j++) for (let z = z0 + (j % 2 ? d : d / 2); z < z0 + w; z += d) s += circ([z, y], d * 0.2, `fill="${col}"`); return s; },
    blank: () => '',
    none: () => ''
  };
  const LOWER = {   // openings low in the bumper: returns boxes [z centre, y centre, w, h]
    slot: (W, yb, hF) => [[0, yb + 105, W * 0.6, 80]],
    none: () => [],
    centre: (W, yb, hF) => [[0, yb + 140, W * 0.42, Math.min(210, hF * 0.4)]],
    three: (W, yb, hF) => [[0, yb + 125, W * 0.32, Math.min(150, hF * 0.3)], [W * 0.34, yb + 135, W * 0.14, Math.min(170, hF * 0.34)], [-W * 0.34, yb + 135, W * 0.14, Math.min(170, hF * 0.34)]],
    mouth: (W, yb, hF) => [[0, yb + 60 + hF * 0.17, W * 0.82, hF * 0.34]]
  };
  function viewFront(P, G, o) {
    const id = o.idp, lod = o.lod, c = G.col, defs = [socketDef(id)], out = [];
    const { hw, W, yb1, yN, yC, yHd, H, beltF } = G;
    const paint = paintDefs(id, P, G, defs, yb1, H);
    endCommon(P, G, o, defs, out, yb1, false);
    const corner = 60 + P.plan * 170;
    defs.push(`<path id="${id}s" d="${endSilhouette(G, yb1, beltF, yHd - 40, H, corner)}"/>`, `<clipPath id="${id}sc"><use href="#${id}s"/></clipPath>`);
    // door ghosts behind the body
    const GH = {
      scissor: () => path(poly([[hw - 20, beltF - 500], [hw + 250, beltF + 250], [hw + 330, beltF + 1150], [hw + 120, beltF + 1250], [hw - 60, beltF + 300]]), GHOST),
      gull: () => path(poly([[G.hwR - 200, H - 10], [hw + 520, H + 520], [hw + 760, H + 300], [hw + 560, H - 260], [hw + 200, H + 60]]), GHOST)
    };
    if (GH[P.dooropen]) out.push(GH[P.dooropen]());
    out.push([1, -1].map(s => MIRRORF[P.mirror](s, G.hwS + 10, beltF, c)).join(''));
    out.push(roofFurniture(P, G, H, G.hwR));
    out.push(paint(id + 's'));
    // roof and pillars, windscreen
    const inS = s => `<g clip-path="url(#${id}sc)">${s}</g>`;
    if (c.twoTone) out.push(inS(rect(-hw - 50, yC + 4, 2 * hw + 100, H, `fill="${c.roof}"`) + rect(-hw - 50, yC + 4, 2 * hw + 100, H, `fill="url(#${id}sh)"`)));
    const gz0 = G.hwS - 95, gz1 = G.hwR - 70, gy1 = yHd - 45;
    const scr = [[-gz0, yC + 14], [gz0, yC + 14], [gz1, gy1], [-gz1, gy1]];
    out.push(path(poly(scr), `fill="${c.glass}" stroke="${P.float === 'visor' || P.float === 'wrap' ? '#141518' : '#000'}" stroke-width="${P.float === 'visor' || P.float === 'wrap' ? 60 : 6}" stroke-linejoin="round"`));
    if (!lod) out.push([-0.45, 0.45].map(t => rect(t * gz0 - 95, yC + 60, 190, Math.min(260, gy1 - yC - 90), 'fill="#07080a" fill-opacity=".45"', 60)).join(''));
    out.push(path(poly([[-gz0 * 0.9, yC + 14], [-gz0 * 0.5, yC + 14], [-gz1 * 0.2, gy1], [-gz1 * 0.6, gy1]]), 'fill="#fff" fill-opacity=".1"'));
    if (P.sensor === 'screen') out.push(path(poly([[-120, gy1], [120, gy1], [80, gy1 - 120], [-80, gy1 - 120]]), 'fill="#0b0c0e"') + circ([0, gy1 - 60], 22, 'fill="#31404d"'));
    // bonnet, seen rising to the windscreen
    const hwN = hw - 50 - P.plan * 110;
    out.push(inS(path(poly([[-hwN, yN], [hwN, yN], [G.hwS, yC + 6], [-G.hwS, yC + 6]]), `fill="#fff" fill-opacity="${r2(0.1 * c.fin[0] + 0.03)}"`) + line([[-hwN, yN], [hwN, yN]], '#000', 7, 'stroke-opacity=".45"')));
    const BON = {
      two: () => [1, -1].map(s => line([[s * hwN * 0.5, yN], [s * G.hwS * 0.62, yC]], '#000', 6, 'stroke-opacity=".35"')).join(''),
      none: () => '',
      centre: () => line([[0, yN], [0, yC]], '#000', 7, 'stroke-opacity=".45"') + line([[9, yN], [9, yC]], '#fff', 6, 'stroke-opacity=".3"'),
      bulge: () => path(poly([[-hwN * 0.3, yN], [hwN * 0.3, yN], [G.hwS * 0.42, yC], [-G.hwS * 0.42, yC]]), 'fill="#fff" fill-opacity=".14" stroke="#000" stroke-opacity=".35" stroke-width="6"'),
      vents: () => [1, -1].map(s => path(poly([[s * hwN * 0.3, yN + (yC - yN) * 0.45], [s * hwN * 0.62, yN + (yC - yN) * 0.5], [s * hwN * 0.6, yN + (yC - yN) * 0.72], [s * hwN * 0.3, yN + (yC - yN) * 0.66]]), 'fill="#0b0c0e"')).join('')
    };
    out.push(BON[P.bcrease]());
    if (P.stripes === 'twin') out.push(inS([-1, 1].map(s => path(poly([[s * 45, yb1], [s * 45, yN], [s * 55, yC], [s * 200, yC], [s * 175, yN], [s * 175, yb1]]), `fill="${c.stripe}"`)).join('') + rect(-190, yHd - 20, 150, H, `fill="${c.stripe}"`) + rect(40, yHd - 20, 150, H, `fill="${c.stripe}"`)));
    if (P.stripes === 'offset') out.push(inS(path(poly([[-hw * 0.5, yb1], [-hw * 0.5, yN], [-hw * 0.52, yC], [-hw * 0.32, yC], [-hw * 0.3, yN], [-hw * 0.3, yb1]]), `fill="${c.stripe}"`)));
    // lower body colour
    const hF = yN - yb1;
    if (P.clad !== 'body') out.push(inS(rect(-hw - 20, yb1 - 20, 2 * hw + 40, P.clad === 'contrast' ? hF * 0.34 : 150, `fill="${P.clad === 'contrast' ? c.lower : c.plastic}"`)));

    // grille
    const face = [];
    const gy = [0, 0, 0, 0];
    if (P.grille !== 'none') {
      // the grille keeps to the space above the lower opening
      const lowTop = LOWER[P.lower](W, yb1, hF).reduce((m, b) => (Math.abs(b[0]) < 1 ? Math.max(m, b[1] + b[3] / 2 - yb1 + 26) : m), 60);
      const gw = Math.min(P.grw * W, 2 * hw - 160), gh = Math.max(30, Math.min(P.grh, hF - lowTop - 40));
      const gTop = yN - 34 - P.grpos * Math.max(0, hF - gh - lowTop - 34), gc = [0, gTop - gh / 2];
      const O = outlineAt(0, gc[1], gw, gh, 4, P.grsoft, 0, P.grtaper, lod ? 32 : 64);
      gy[0] = gc[1];
      defs.push(`<clipPath id="${id}gr"><path d="${poly(O)}"/></clipPath>`);
      const blank = P.grille === 'blank';
      let g = path(poly(O), `fill="${blank ? mix(c.C, '#000', 0.12) : '#0b0c0e'}"`);
      const bar = c.trim === c.C ? '#3a3c40' : mix(c.trim, '#000', P.trim === 'dark' ? 0 : 0.25);
      if (!lod || P.grden <= 1) g += `<g clip-path="url(#${id}gr)">` + GRILLE[P.grille](-gw / 2, gc[1] - gh / 2, gw, gh, clamp(46 / P.grden, 16, 110), P.trim === 'dark' ? '#3d4046' : bar) +
        (P.socket > 0 ? rect(-gw / 2, gc[1] + gh / 2 - gh * (0.25 + P.socket / 300), gw, gh * (0.25 + P.socket / 300), `fill="url(#${id}sg)" fill-opacity="${r2(Math.min(0.9, 0.2 + P.socket / 170))}"`) : '') + '</g>';
      const gaps = { 1: [], 2: [0], 3: [-0.17, 0.17] }[P.grsplit];
      g += gaps.map(t => rect(t * gw - Math.max(22, gw * 0.035), gc[1] - gh / 2 - 6, Math.max(44, gw * 0.07), gh + 12, `fill="${c.C}" stroke="#000" stroke-opacity=".5" stroke-width="5"`)).join('');
      const SUR = { none: '', bright: `stroke="#d5d8dc" stroke-width="16"`, dark: 'stroke="#141518" stroke-width="16"', body: `stroke="${mix(c.C, '#fff', 0.12)}" stroke-width="40"` };
      g += path(poly(O), 'fill="none" ' + (SUR[P.grsur] || '') + ' stroke-linejoin="round"') + path(poly(O), 'fill="none" stroke="#000" stroke-opacity=".6" stroke-width="5" stroke-linejoin="round"');
      face.push(g);
    }
    // lower openings
    const lows = LOWER[P.lower](W, yb1, hF);
    face.push(lows.map(b => rect(b[0] - b[2] / 2, b[1] - b[3] / 2, b[2], b[3], 'fill="#0b0c0e" stroke="#000" stroke-width="5"', Math.min(b[3] * 0.3, 40)) + (lod ? '' : rect(b[0] - b[2] / 2 + 20, b[1] - 5, b[2] - 40, 10, 'fill="#3d4046"'))).join(''));
    if (P.glowp === 'face') face.push(rect(-hw * 0.44, yN - 150, hw * 0.88, 70, 'fill="#8ff1ff" fill-opacity=".3"', 35) + rect(-hw * 0.4, yN - 130, hw * 0.8, 30, 'fill="#e9feff" fill-opacity=".9"', 15));
    out.push(inS(face.join('')));

    // lamps: one side is drawn, the other mirrors it
    const lw = Math.min(P.hlw, hw - 170), zc = hw - 85 - P.plan * 50 - lw / 2;
    const yT = yN - 28 - P.hlpos * Math.max(0, hF - P.hlh - 130), lh = Math.min(P.hlh, hF - 60);
    const UNITS = {
      single: () => lampUnit(id, 'a', P, G, defs, zc, yT - lh / 2, lw, lh, 'head', lod),
      split: () => lampUnit(id, 'a', P, G, defs, zc, yT - Math.max(13, lh * 0.13), lw, Math.max(26, lh * 0.26), 'head', lod) +
        rect(zc - lw * 0.3, yb1 + hF * 0.36, lw * 0.6, Math.min(110, hF * 0.24), 'fill="#0b0c0e" stroke="#000" stroke-width="5"', 26) + circ([zc, yb1 + hF * 0.36 + Math.min(55, hF * 0.12)], Math.min(42, hF * 0.09), 'fill="#31404d" stroke="#dbe6ef" stroke-width="6"'),
      stack: () => lampUnit(id, 'a', P, G, defs, zc, yT - lh * 0.24, lw, lh * 0.46, 'head', lod) + lampUnit(id, 'b', P, G, defs, zc, yT - lh * 0.76, lw, lh * 0.46, 'head', lod),
      twin: () => lampUnit(id, 'a', P, G, defs, zc + lw * 0.26, yT - lh / 2, lw * 0.48, lh, 'head', lod) + lampUnit(id, 'b', P, G, defs, zc - lw * 0.26, yT - lh / 2, lw * 0.48, lh, 'head', lod)
    };
    defs.push(`<g id="${id}L">${UNITS[P.hlsplit]()}</g>`);
    out.push(`<use href="#${id}L"/><use href="#${id}L" transform="scale(-1,1)"/>`);
    const BAR = { none: () => '', between: () => rect(-(zc - lw / 2), yT - 36, 2 * (zc - lw / 2), 30, 'fill="#ffffff" stroke="#bfe3ff" stroke-opacity=".5" stroke-width="14"', 10), full: () => rect(-(hw - 60), yT - 36, 2 * (hw - 60), 30, 'fill="#ffffff" stroke="#bfe3ff" stroke-opacity=".5" stroke-width="14"', 10) };
    out.push(BAR[P.bar]());
    // plate, badge, hooks
    const PL = { low: [0, yb1 + 150], none: null, high: [0, yb1 + hF * 0.55], offset: [-hw * 0.5, yb1 + 150] };
    if (PL[P.platef]) out.push(PLATE(PL[P.platef][0], PL[P.platef][1]));
    out.push(BADGE[P.badge](0, P.grille !== 'none' && P.platef !== 'high' ? gy[0] : yN - 60, c));
    if (P.tow === 'hooks') out.push([1, -1].map(s => circ([s * hw * 0.62, yb1 + 60], 30, 'fill="none" stroke="#c8281f" stroke-width="16"')).join(''));
    out.push(`<use href="#${id}s" fill="none" stroke="${c.edge}" stroke-width="12" stroke-linejoin="round"/>`);
    const y1 = Math.max(2230, H + 420);
    return {
      defs: defs.join(''), body: out.join(''), box: [-1300, -y1, 2600, y1 + 300],
      anchors: { face: [0, -(yN + yb1) / 2], lamp: [zc, -(yT - lh / 2)], grille: [0, -(yb1 + hF * 0.55)], bumper: [0, -yb1 - 150] }
    };
  }

  // =============================================================== REAR
  const OUTLET = {
    round: (z, y) => circ([z, y], 44, 'fill="#0b0c0e" stroke="#b9bdc2" stroke-width="12"'),
    oval: (z, y) => `<ellipse cx="${f(z)}" cy="${f(-y)}" rx="66" ry="38" fill="#0b0c0e" stroke="#b9bdc2" stroke-width="12"/>`,
    rect: (z, y) => rect(z - 68, y - 34, 136, 68, 'fill="#0b0c0e" stroke="#b9bdc2" stroke-width="12"', 12),
    trap: (z, y) => path(poly([[z - 76, y - 36], [z + 76, y - 36], [z + 52, y + 36], [z - 52, y + 36]]), 'fill="#0b0c0e" stroke="#b9bdc2" stroke-width="12" stroke-linejoin="round"')
  };
  function viewRear(P, G, o) {
    const id = o.idp, lod = o.lod, c = G.col, defs = [socketDef(id)], out = [];
    const { hw, W, yb2, yD, H, beltR } = G;
    const paint = paintDefs(id, P, G, defs, yb2, H);
    endCommon(P, G, o, defs, out, yb2, true);
    const corner = 60 + P.plan * 150, yTop = G.bed ? yD : G.tailTop[1];
    defs.push(`<path id="${id}s" d="${endSilhouette(G, yb2, Math.max(beltR, G.archTop + 80), G.yRh - 30, Math.max(H - P.rdrop * 0.4, G.yRh + 20), corner)}"/>`, `<clipPath id="${id}sc"><use href="#${id}s"/></clipPath>`);
    const inS = s => `<g clip-path="url(#${id}sc)">${s}</g>`;
    out.push([1, -1].map(s => MIRRORF[P.mirror](s, G.hwS + 10, G.beltF, c)).join(''));
    out.push(roofFurniture(P, G, Math.max(H - P.rdrop * 0.4, G.yRh + 20), G.hwR));
    if (P.aero !== 'none') out.push(path(poly([[-hw * 0.8, yTop + 300], [hw * 0.8, yTop + 300], [hw * 0.8, yTop + (P.aero === 'brake' ? 560 : 350)], [-hw * 0.8, yTop + (P.aero === 'brake' ? 560 : 350)]]), GHOST));
    if (P.spoiler === 'wing') out.push([1, -1].map(s => rect(s * hw * 0.5 - 14, yTop - 10, 28, 210, 'fill="#1b1c1f"')).join('') + rect(-hw * 0.86, yTop + 195, hw * 1.72, 46, `fill="${c.C}" stroke="${c.edge}" stroke-width="9"`, 16));
    out.push(paint(id + 's'));
    const yGlass0 = Math.max(G.deck ? yD : Math.min(G.tailTop[1], beltR + 400), beltR) + 26;
    if (c.twoTone) out.push(inS(rect(-hw - 50, yGlass0 - 20, 2 * hw + 100, H, `fill="${c.roof}"`) + rect(-hw - 50, yGlass0 - 20, 2 * hw + 100, H, `fill="url(#${id}sh)"`)));
    // rear screen, or the back of a cabin over an open bed
    const gz0 = G.hwS - 110, gz1 = G.hwR - 75, gy1 = G.yRh - 50;
    if (gy1 - yGlass0 > 50) {
      const dk = P.float === 'float' || P.float === 'wrap';
      out.push(path(poly([[-gz0, yGlass0], [gz0, yGlass0], [gz1, gy1], [-gz1, gy1]]), `fill="${c.glass}" stroke="${dk ? '#141518' : '#000'}" stroke-width="${dk ? 60 : 6}" stroke-linejoin="round"`) +
        path(poly([[gz0 * 0.3, yGlass0], [gz0 * 0.7, yGlass0], [gz1 * 0.5, gy1], [gz1 * 0.1, gy1]]), 'fill="#fff" fill-opacity=".1"'));
    }
    if (P.spoiler === 'roof') out.push(rect(-G.hwR + 60, G.yRh - 62, 2 * G.hwR - 120, 46, `fill="${c.twoTone ? c.roof : c.C}" stroke="${c.edge}" stroke-width="8"`, 16));
    if (P.stripes === 'twin') out.push(inS(rect(-190, yb2, 150, H + 200, `fill="${c.stripe}"`) + rect(40, yb2, 150, H + 200, `fill="${c.stripe}"`)));
    if (P.stripes === 'offset') out.push(inS(rect(hw * 0.3, yb2, hw * 0.2, H + 200, `fill="${c.stripe}"`)));
    // the tail panel below the tail top
    const hT = yD - yb2;
    if (G.bed) out.push(inS(rect(-hw + 70, yD - 10, 2 * hw - 140, Math.max(60, yGlass0 - yD - 30), 'fill="#101113"') + rect(-hw + 50, yD - 46, 2 * hw - 100, 46, `fill="${c.plastic}"`) + rect(-hw + 120, yb2 + 150, 2 * hw - 240, 8, 'fill="#000" fill-opacity=".5"')));
    else out.push(inS(line([[-hw, yTop], [hw, yTop]], '#000', 7, 'stroke-opacity=".4"')));
    if (P.spoiler === 'lip' || P.spoiler === 'duck') out.push(rect(-hw * 0.8, yTop - 6, hw * 1.6, P.spoiler === 'lip' ? 34 : 96, `fill="${c.C}" stroke="${c.edge}" stroke-width="8"`, 14));
    if (P.clad !== 'body') out.push(inS(rect(-hw - 20, yb2 - 20, 2 * hw + 40, P.clad === 'contrast' ? hT * 0.34 : 170, `fill="${P.clad === 'contrast' ? c.lower : c.plastic}"`)));
    const DIFF = {
      plain: () => '',
      fins: () => rect(-hw * 0.5, yb2 - 10, hw, 120, 'fill="#101113"', 14) + [-0.3, -0.15, 0, 0.15, 0.3].map(t => rect(t * hw - 7, yb2 - 10, 14, 120, 'fill="#3d4046"')).join(''),
      skid: () => path(poly([[-hw * 0.45, yb2 - 10], [hw * 0.45, yb2 - 10], [hw * 0.36, yb2 + 110], [-hw * 0.36, yb2 + 110]]), 'fill="#aeb2b7" stroke="#000" stroke-opacity=".5" stroke-width="5"')
    };
    out.push(inS(DIFF[P.diffuser]()));
    const oy = yb2 + 62, OP = { 0: [], 1: [0.56], 2: [-0.56, 0.56], 4: [-0.66, -0.48, 0.48, 0.66] }[P.outlets];
    out.push(OP.map(t => OUTLET[P.outshape](t * hw, oy)).join(''));
    // tail lamps
    const lw = Math.min(P.tlw, hw - 150), zc = hw - 75 - P.plan * 40 - lw / 2, lh = Math.min(P.tlh, hT - 70);
    const yT = yD - 24 - P.tlpos * Math.max(0, hT - lh - 150);
    defs.push(`<g id="${id}L">${lampUnit(id, 'a', P, G, defs, zc, yT - lh / 2, lw, lh, 'tail', lod)}</g>`);
    out.push(`<use href="#${id}L"/><use href="#${id}L" transform="scale(-1,1)"/>`);
    const BAR = { none: () => '', between: () => rect(-(zc - lw / 2), yT - 38, 2 * (zc - lw / 2), 30, 'fill="#ff4336" stroke="#ff7a6e" stroke-opacity=".45" stroke-width="14"', 10), full: () => rect(-(hw - 50), yT - 38, 2 * (hw - 50), 30, 'fill="#ff4336" stroke="#ff7a6e" stroke-opacity=".45" stroke-width="14"', 10) };
    out.push(BAR[P.tbar]());
    const spare = P.spare === 'tail';
    const PL = { tail: [0, Math.max(yT - lh - 90, yb2 + 260)], bumper: [0, yb2 + 190], offset: [-hw * 0.42, Math.max(yT - lh - 90, yb2 + 260)] };
    let pl = PL[P.plater];
    if (spare) {
      const sy = Math.max(yD - G.Rw - 40, yb2 + G.Rw + 60);
      out.push(circ([0, sy], G.Rw, 'fill="#191a1c" stroke="#000" stroke-width="6"') + circ([0, sy], G.Rw * 0.62, `fill="${c.plastic}" stroke="#000" stroke-width="5"`));
      pl = [-hw * 0.55, yb2 + 200];
    }
    out.push(PLATE(pl[0], pl[1]));
    if (!spare) out.push(BADGE[P.badge](0, Math.min(pl[1] + 150, yD - 60), c));
    if (P.tow === 'bar') out.push(rect(-16, yb2 - 70, 32, 90, 'fill="#1b1c1f"') + circ([0, yb2 - 80], 26, 'fill="#8b8f94"'));
    out.push(`<use href="#${id}s" fill="none" stroke="${c.edge}" stroke-width="12" stroke-linejoin="round"/>`);
    const y1 = Math.max(2230, H + 420);
    return {
      defs: defs.join(''), body: out.join(''), box: [-1300, -y1, 2600, y1 + 300],
      anchors: { tailf: [0, -(yD + yb2) / 2], lamp: [zc, -(yT - lh / 2)], bumper: [0, -yb2 - 180] }
    };
  }

  // ================================================================ TOP
  // Hidden parts are dashed, as on a technical drawing.
  const HID = 'fill="none" stroke="#2f343a" stroke-opacity=".8" stroke-width="8" stroke-dasharray="34 26"';
  const POWER = {
    front: G => rect(Math.max(G.xa - 380, 160), -300, Math.max(260, Math.min(700, G.xC - G.xa + 380 - 120)), 600, HID, 40),
    mid: G => rect(G.xb - 950, -310, 680, 620, HID, 40),
    rear: G => rect(G.xb - 60, -300, Math.min(620, G.L - G.xb - 60), 600, HID, 40),
    electric: G => rect(G.xa + G.Ra + 60, -G.hw + 260, G.xb - G.xa - 2 * G.Ra - 120, 2 * G.hw - 520, HID, 50) + circ([G.xb, 0], 150, HID) + [0.25, 0.5, 0.75].map(t => line([[lerp(G.xa + G.Ra + 60, G.xb - G.Ra - 60, t), -G.hw + 260], [lerp(G.xa + G.Ra + 60, G.xb - G.Ra - 60, t), G.hw - 260]], '#2f343a', 6, 'stroke-opacity=".5" stroke-dasharray="20 22"')).join('')
  };
  function viewTop(P, G, o) {
    const id = o.idp, lod = o.lod, c = G.col, defs = [], out = [];
    const { L, hw, xa, xb, Rw } = G;
    const paint = paintDefs(id, P, G, defs, -hw, hw);
    // in this view the second coordinate is z (across the car)
    const a = [], b = [];
    for (let x = 0; x <= L; x += lod ? 90 : 40) { a.push([x, G.planW(x)]); b.push([x, -G.planW(x)]); }
    a.push([L, G.planW(L)]); b.push([L, -G.planW(L)]);
    defs.push(`<path id="${id}p" d="${poly(a.concat(rev(b)))}"/>`, `<clipPath id="${id}pc"><use href="#${id}p"/></clipPath>`);
    const inP = s => `<g clip-path="url(#${id}pc)">${s}</g>`;
    out.push(`<ellipse cx="${f(L / 2)}" cy="0" rx="${f(L * 0.53)}" ry="${f(hw * 1.1)}" fill="#000" fill-opacity=".07"/>`);
    // tyres show only where they stand out from the body
    const zo = hw - P.track;
    out.push([xa, xb].map(x => [1, -1].map(s => rect(x - Rw * 0.92, s > 0 ? zo - G.tw : -zo, Rw * 1.84, G.tw, 'fill="#191a1c"', 40)).join('')).join(''));
    const MIRT = {   // seen from above, s is the side
      door: s => path(poly([[G.xf0 + 60, s * (G.hwS - 10)], [G.xf0 + 20, s * (G.hwS + 190)], [G.xf0 + 150, s * (G.hwS + 210)], [G.xf0 + 190, s * (G.hwS - 10)]]), `fill="${c.C}" stroke="${c.edge}" stroke-width="8" stroke-linejoin="round"`),
      pillar: s => path(poly([[G.xf0 - 120, s * (G.hwS - 10)], [G.xf0 - 150, s * (G.hwS + 190)], [G.xf0 - 20, s * (G.hwS + 210)], [G.xf0 + 10, s * (G.hwS - 10)]]), `fill="${c.C}" stroke="${c.edge}" stroke-width="8" stroke-linejoin="round"`),
      camera: s => line([[G.xf0 + 40, s * (G.hwS - 10)], [G.xf0 + 10, s * (G.hwS + 150)]], '#1b1c1f', 18, 'stroke-linecap="round"') + rect(G.xf0 - 40, s * (G.hwS + 150) - 26, 100, 52, 'fill="#1b1c1f"', 22),
      none: () => ''
    };
    out.push([1, -1].map(MIRT[P.mirror]).join(''));
    out.push(paint(id + 'p'));
    // lower body colours, stripes
    let over = '';
    if (P.stripes === 'twin') over += rect(-50, 40, L + 100, 150, `fill="${c.stripe}"`) + rect(-50, -190, L + 100, 150, `fill="${c.stripe}"`);
    if (P.stripes === 'offset') over += rect(-50, hw * 0.3, L + 100, hw * 0.2, `fill="${c.stripe}"`);
    out.push(inP(over));
    // bonnet: shut lines and pressed lines
    const xN = G.xu + 40, zB = G.hwS - 130;
    out.push(line([[G.xC - 40, zB], [xN + 80, zB - 90], [xN, zB - 260]], '#000', 6, 'stroke-opacity=".4"') + line([[G.xC - 40, -zB], [xN + 80, -zB + 90], [xN, -zB + 260]], '#000', 6, 'stroke-opacity=".4"'));
    const BON = {
      two: () => [1, -1].map(s => line([[xN + 60, s * zB * 0.5], [G.xC - 60, s * zB * 0.66]], '#000', 6, 'stroke-opacity=".3"')).join(''),
      none: () => '',
      centre: () => line([[xN, 0], [G.xC - 40, 0]], '#000', 7, 'stroke-opacity=".45"') + line([[xN, 9], [G.xC - 40, 9]], '#fff', 6, 'stroke-opacity=".3"'),
      bulge: () => path(poly([[xN + 40, zB * 0.3], [G.xC - 60, zB * 0.42], [G.xC - 60, -zB * 0.42], [xN + 40, -zB * 0.3]]), 'fill="#fff" fill-opacity=".14" stroke="#000" stroke-opacity=".35" stroke-width="6"'),
      vents: () => [1, -1].map(s => rect(lerp(xN, G.xC, 0.5), s * zB * 0.45 - 45, (G.xC - xN) * 0.28, 90, 'fill="#0b0c0e"', 16)).join('')
    };
    out.push(BON[P.bcrease]());
    // windscreen, roof, side glass, rear screen
    const zR = G.hwR - 25, zS = G.hwS - 70;
    const scr = `M${f(G.xC + 20)},${f(-zS)}Q${f(G.xC - 130)},0 ${f(G.xC + 20)},${f(zS)}L${f(G.xHd + 20)},${f(zR)}Q${f(G.xHd - 60)},0 ${f(G.xHd + 20)},${f(-zR)}Z`;
    const xS1 = G.bed ? G.xAtD : G.xSB, xr1 = Math.max(G.xRh, G.xHd + 300);
    out.push(path(poly([[G.xg0, zS + 40], [G.xg1, zS + 40], [Math.min(xr1, G.xg1), zR], [G.xHd + 40, zR]]) + poly([[G.xg0, -zS - 40], [G.xg1, -zS - 40], [Math.min(xr1, G.xg1), -zR], [G.xHd + 40, -zR]]), `fill="${c.glass}" stroke="#000" stroke-opacity=".5" stroke-width="5"`));
    if (P.pillars >= 3 && P.roofop !== 'soft') out.push([1, -1].map(s => line([[G.xPB, s * (zS + 44)], [G.xPB, s * zR]], P.float === 'wrap' ? '#141518' : c.twoTone ? c.roof : c.C, 76)).join(''));
    if (P.pillars === 4 && P.roofop !== 'soft') out.push([1, -1].map(s => line([[G.xPC, s * (zS + 44)], [G.xPC, s * zR]], P.float === 'wrap' ? '#141518' : c.twoTone ? c.roof : c.C, 84)).join(''));
    out.push(path(scr, `fill="${c.glass}" stroke="#000" stroke-opacity=".6" stroke-width="6"`));
    if (xS1 - xr1 > 60) out.push(path(`M${f(xr1)},${f(-zR)}L${f(xS1)},${f(-(G.hwS - 120))}Q${f(xS1 + 70)},0 ${f(xS1)},${f(G.hwS - 120)}L${f(xr1)},${f(zR)}Z`, `fill="${c.glass}" stroke="#000" stroke-opacity=".6" stroke-width="6"`));
    const roof = `M${f(G.xHd + 30)},${f(-zR)}Q${f(G.xHd - 40)},0 ${f(G.xHd + 30)},${f(zR)}L${f(xr1)},${f(zR)}Q${f(xr1 + 50)},0 ${f(xr1)},${f(-zR)}Z`;
    defs.push(`<path id="${id}r" d="${roof}"/>`, `<clipPath id="${id}rc"><use href="#${id}r"/></clipPath>`);
    out.push(`<use href="#${id}r" fill="${c.twoTone ? c.roof : c.C}" stroke="${c.edge}" stroke-width="8"/><use href="#${id}r" fill="url(#${id}sh)"/>`);
    let onRoof = '';
    const rl = xr1 - G.xHd;
    if (P.stripes === 'twin' && P.roofop !== 'soft') onRoof += rect(G.xHd - 100, 40, rl + 300, 150, `fill="${c.stripe}"`) + rect(G.xHd - 100, -190, rl + 300, 150, `fill="${c.stripe}"`);
    if (P.stripes === 'offset' && P.roofop !== 'soft') onRoof += rect(G.xHd - 100, hw * 0.3, rl + 300, hw * 0.2, `fill="${c.stripe}"`);
    const ROOFOP = {
      fixed: () => '',
      sunroof: () => rect(G.xHd + rl * 0.12, -zR * 0.62, Math.min(rl * 0.42, 900), zR * 1.24, 'fill="#0d1116" stroke="#000" stroke-width="6"', 50),
      glass: () => rect(G.xHd + rl * 0.08, -zR * 0.8, rl * 0.84, zR * 1.6, 'fill="#0d1116" stroke="#000" stroke-width="6"', 60) + rect(G.xHd + rl * 0.5 - 12, -zR * 0.8, 24, zR * 1.6, `fill="${c.twoTone ? c.roof : c.C}"`),
      soft: () => [0.25, 0.5, 0.75].map(t => line([[G.xHd + rl * t, -zR], [G.xHd + rl * t, zR]], '#000', 7, 'stroke-opacity=".45"')).join('')
    };
    onRoof += ROOFOP[P.roofop]();
    if (P.solar === 'cells') {
      onRoof += rect(G.xHd + rl * 0.08, -zR * 0.82, rl * 0.84, zR * 1.64, 'fill="#16264f"', 40);
      if (!lod) { for (let x = G.xHd + rl * 0.08 + 130; x < G.xHd + rl * 0.92; x += 130) onRoof += line([[x, -zR * 0.82], [x, zR * 0.82]], '#6f8fd6', 5); for (let z = -zR * 0.82 + 130; z < zR * 0.82; z += 130) onRoof += line([[G.xHd + rl * 0.08, z], [G.xHd + rl * 0.92, z]], '#6f8fd6', 5); }
    }
    out.push(`<g clip-path="url(#${id}rc)">${onRoof}</g>`);
    if (P.rails !== 'none') out.push([1, -1].map(s => line([[G.xHd + 150, s * (zR - 60)], [xr1 - 100, s * (zR - 60)]], '#1b1c1f', P.rails === 'flush' ? 22 : 34, 'stroke-linecap="round"')).join('') + (P.rails === 'bars' ? [0.22, 0.78].map(t => line([[G.xHd + rl * t, -zR + 30], [G.xHd + rl * t, zR - 30]], '#3a3c40', 46, 'stroke-linecap="round"')).join('') : ''));
    if (P.antenna === 'fin') out.push(path(poly([[xr1 - 300, 0], [xr1 - 150, 26], [xr1 - 110, 0], [xr1 - 150, -26]]), `fill="${mix(c.twoTone ? c.roof : c.C, '#000', 0.2)}" stroke="${c.edge}" stroke-width="6"`));
    if (P.antenna === 'mast') out.push(circ([xr1 - 200, zR * 0.5], 18, 'fill="#1b1c1f"'));
    if (P.sensor === 'roof') out.push(rect(G.xHd + 60, -150, 260, 300, 'fill="#1b1c1f" stroke="#000" stroke-width="5"', 60));
    // deck, or an open bed
    if (G.bed) {
      const x0 = G.xAtD + 90, x1 = G.tailTop[0] - 70, zb = G.hwS - 110;
      out.push(rect(x0, -zb, x1 - x0, 2 * zb, 'fill="#17181b" stroke="#000" stroke-width="8"', 30) + (lod ? '' : [1, -1].map(s => rect(G.xb - Rw * 0.9, s > 0 ? zb - 150 : -zb, Rw * 1.8, 150, 'fill="#26272a"', 30)).join('') +
        [0.2, 0.4, 0.6, 0.8].map(t => line([[x0 + 20, lerp(-zb, zb, t)], [x1 - 20, lerp(-zb, zb, t)]], '#000', 5, 'stroke-opacity=".5"')).join('')));
    } else if (G.deck) out.push(line([[G.xAtD + 50, G.hwS - 130], [G.tailTop[0] - 40, G.hwS - 150], [G.tailTop[0] - 40, -(G.hwS - 150)], [G.xAtD + 50, -(G.hwS - 130)]], '#000', 6, 'stroke-opacity=".45" stroke-linejoin="round"'));
    if (P.spoiler === 'wing') out.push(rect(G.tailTop[0] - 330, -hw * 0.86, 240, hw * 1.72, `fill="${c.C}" stroke="${c.edge}" stroke-width="8"`, 30));
    if (P.spoiler === 'lip' || P.spoiler === 'duck') out.push(rect(G.tailTop[0] - (P.spoiler === 'lip' ? 90 : 190), -hw * 0.8, P.spoiler === 'lip' ? 80 : 180, hw * 1.6, `fill="${mix(c.C, '#fff', 0.1)}" stroke="${c.edge}" stroke-width="7"`, 30));
    if (P.spare === 'tail') out.push(rect(L + 10, -Rw, G.tw * 0.92, 2 * Rw, 'fill="#191a1c" stroke="#000" stroke-width="6"', 60));
    // lamps at the corners
    const hlw = Math.min(P.hlw, hw - 170), tlw = Math.min(P.tlw, hw - 150);
    out.push(inP([1, -1].map(s => rect(-20, s > 0 ? hw - 85 - hlw : -(hw - 85), 120 + P.plan * 120, hlw, 'fill="#e6eef5" stroke="#000" stroke-opacity=".5" stroke-width="5"', 30) +
      rect(L - 100 - P.plan * 100, s > 0 ? hw - 75 - tlw : -(hw - 75), 130 + P.plan * 100, tlw, 'fill="#b01e1e" stroke="#000" stroke-opacity=".5" stroke-width="5"', 30)).join('') +
      (P.bar !== 'none' ? rect(-10, -(hw - 85 - hlw), 50, 2 * (hw - 85 - hlw), 'fill="#ffffff"') : '') + (P.tbar !== 'none' ? rect(L - 40, -(hw - 75 - tlw), 50, 2 * (hw - 75 - tlw), 'fill="#ff4336"') : '') +
      (P.glowp === 'sills' ? [1, -1].map(s => rect(xa + G.Ra, s > 0 ? hw - 40 : -hw - 20, xb - xa - 2 * G.Ra, 60, 'fill="#8ff1ff" fill-opacity=".7"')).join('') : '') +
      (P.glowp === 'face' ? rect(-20, -hw * 0.44, 60, hw * 0.88, 'fill="#8ff1ff" fill-opacity=".8"') : '')));
    // what drives it, hidden under the skin
    out.push(POWER[P.power](G));
    if (P.outlets > 0) out.push({ 1: [0.56], 2: [-0.56, 0.56], 4: [-0.66, -0.48, 0.48, 0.66] }[P.outlets].map(t => rect(L - 10, t * hw - 30, 50, 60, 'fill="#8b8f94" stroke="#000" stroke-width="5"', 12)).join(''));
    // doors: cut lines, and one door open, dashed
    const zd = G.hwS + 2;
    out.push([G.xD0, G.xD1, G.xD2].map(x => [1, -1].map(s => line([[x, s * (G.planW(x) - 4)], [x, s * (zS + 40)]], '#000', 6, 'stroke-opacity=".55"')).join('')).join(''));
    const th = P.doorth, dl = G.xD1 - G.xD0, dl2 = G.xD2 - G.xD1;
    const slab = (hx, len, ang) => {   // a door slab hinged at (hx, zd), len long, swung out by ang
      const ca = Math.cos(ang), sa = Math.sin(ang), q = (u, v) => [hx + u * ca - v * sa, zd + u * sa + v * ca];
      let s = path(poly([q(0, 0), q(len, 0), q(len, -th), q(0, -th)]), GHOST + ' fill-opacity=".001"') ;
      for (let k = 1; k <= P.seals; k++) s += line([q(len * 0.04, -th * k / (P.seals + 1)), q(len * 0.96, -th * k / (P.seals + 1))], '#2f343a', 5, 'stroke-opacity=".8"');
      return s;
    };
    const DOOR = {
      swing: () => slab(G.xD0, dl, 0.95),
      coach: () => slab(G.xD0, dl, 0.95) + (G.two ? slab(G.xD2, -dl2, -0.95) : ''),
      slide: () => slab(G.xD0, dl, 0.95) + (G.two ? path(poly([[G.xD1 + dl2 * 0.7, zd + 150], [G.xD2 + dl2 * 0.7, zd + 150], [G.xD2 + dl2 * 0.7, zd + 150 - th], [G.xD1 + dl2 * 0.7, zd + 150 - th]]), GHOST) : ''),
      scissor: () => slab(G.xD0, dl * 0.34, 0.2),
      gull: () => path(poly([[G.xD0 + 120, zd], [G.xD1, zd], [G.xD1, zd - th], [G.xD0 + 120, zd - th]]) + poly([[G.xD0 + 160, 60], [G.xD1 - 40, 60], [G.xD1 - 40, G.hwR + 80], [G.xD0 + 160, G.hwR + 80]]), GHOST)
    };
    out.push(DOOR[P.dooropen]());
    return {
      defs: defs.join(''), body: out.join(''), box: [-350, -1560, Math.max(6300, L + 850), 3120],
      anchors: { roof: [(G.xHd + xr1) / 2, 0], door: [G.xD0 + dl * 0.6, -(zd + 420)] }
    };
  }

  // ------------------------------------------------------------- public
  const VIEWS = {
    side: viewSide, front: viewFront, rear: viewRear, top: viewTop,
    street: (P, G, o) => viewSide(P, G, Object.assign({}, o, { street: true }))
  };
  function parts(v, o) {
    o = o || {};
    const P = params(v), lod = o.lod ? 1 : 0;
    const G = geometry(P);
    const r = VIEWS[o.view || 'side'](P, G, { idp: o.idp || 'g', lod: lod && !o.at ? 1 : 0, thin: lod });
    let box = r.box;
    if (o.at && r.anchors[o.at]) {
      const a = r.anchors[o.at], w = o.w || 1200, h = w * (o.aspect || 0.66);
      box = [a[0] - w / 2, a[1] - h / 2, w, h];
    }
    r.viewBox = box.map(f).join(' ');
    r.box = box;
    return r;
  }
  function draw(v, o) {
    const r = parts(v, o);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.viewBox}"${o && o.attrs ? ' ' + o.attrs : ''}><defs>${r.defs}</defs>${r.body}</svg>`;
  }
  // length, width and height, as a car's size is usually written
  function stamp(v) { const P = params(v); return (P.fo + P.wb + P.ro) + ' × ' + P.width + ' × ' + P.height + ' mm'; }

  // The page can play these. ctx is an AudioContext.
  function burst(ctx, t, freq, q, gain, dur, type) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur)), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; fl.type = type || 'bandpass'; fl.frequency.value = freq; fl.Q.value = q; g.gain.value = gain;
    src.connect(fl); fl.connect(g); g.connect(ctx.destination); src.start(t);
  }
  function tone(ctx, t, freq, gain, dur, type, wobble) {
    const osc = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    osc.type = type; osc.frequency.value = freq; fl.type = 'lowpass'; fl.frequency.value = freq * 6;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.08); g.gain.linearRampToValueAtTime(0, t + dur);
    if (wobble) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = wobble; lg.gain.value = gain * 0.6; l.connect(lg); lg.connect(g.gain); l.start(t); l.stop(t + dur); }
    osc.connect(fl); fl.connect(g); g.connect(ctx.destination); osc.start(t); osc.stop(t + dur);
  }
  const SOUND = {
    power: (ctx, key) => {
      const t = ctx.currentTime + 0.02;
      if (key === 'electric') { tone(ctx, t, 420, 0.05, 1.1, 'sine'); tone(ctx, t, 840, 0.02, 1.1, 'sine'); }
      else { tone(ctx, t, key === 'rear' ? 62 : key === 'mid' ? 74 : 52, 0.22, 1.2, 'sawtooth', key === 'mid' ? 37 : 26); burst(ctx, t, 300, 0.6, 0.05, 1.1, 'lowpass'); }
    },
    seals: (ctx, key) => {
      const t = ctx.currentTime + 0.02;
      ({ 1: () => { burst(ctx, t, 2400, 3, 0.5, 0.05); burst(ctx, t, 500, 1, 0.3, 0.08); }, 2: () => { burst(ctx, t, 170, 1.2, 1, 0.16, 'lowpass'); burst(ctx, t, 1200, 2, 0.12, 0.04); }, 3: () => burst(ctx, t, 95, 1, 1, 0.24, 'lowpass') })[key]();
    }
  };
  function sound(axisId, v, ctx) { const P = params(v); if (SOUND[axisId]) SOUND[axisId](ctx, P[axisId]); }

  const api = { draw, parts, params, stamp, sound, PAPER, VIEWS: Object.keys(VIEWS) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FS_DRAW = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
