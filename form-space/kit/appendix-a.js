// AXES is an array, in the order the address should read
// (big shape first). Each axis is an object:
//        id, name
//        o       - option labels, default first
//        on      - ids of the axes it depends on (optional)
//        when - function(v) returning allowed option indexes (optional)
// v maps axis id to option index. Inside 'when', read only the
// axes named in 'on'.
function buildSpace(AX) {

  AX.forEach(a => { a.all = a.o.map((_, i) => i); });

  // which axes control others
  const ctrl = new Set();
  AX.forEach(a => (a.on || []).forEach(c => ctrl.add(c)));

  // join axes linked by rules into groups
  const par = {};
  AX.forEach(a => { par[a.id] = a.id; });
  const find = x => (par[x] === x ? x : (par[x] = find(par[x])));
  AX.forEach(a => (a.on || []).forEach(c => {
        par[find(c)] = find(a.id);
  }));

  const allowed = (a, v) => {
    if (!a.when) return a.all;
    const r = a.when(v);
    return (r && r.length) ? r : a.all;
  };

  const units = [];
  const seen = new Set();
  AX.forEach(a => {
      if (!a.on && !ctrl.has(a.id)) {
        units.push({ free: a, radix: BigInt(a.o.length) });
        return;
      }
      const r = find(a.id);
      if (seen.has(r)) return;
      seen.add(r);
      const mem = AX.filter(
        m => (m.on || ctrl.has(m.id)) && find(m.id) === r
      );
      const cs = mem.filter(m => ctrl.has(m.id));
      const ord = [];
      const done = new Set();
      while (ord.length < cs.length) {
        let progressed = false;
        for (const c of cs) {
          if (done.has(c.id)) continue;
          if ((c.on || []).every(d => done.has(d))) {
            ord.push(c);
            done.add(c.id);
            progressed = true;
          }
        }
        if (!progressed) throw new Error('rules form a loop');
      }
      const deps = mem.filter(m => !ctrl.has(m.id));
      const combos = [];
      const offs = [];
      const key = {};
      const v = {};
      let tot = 0n;
      (function rec(i) {
          if (i === ord.length) {
            let b = 1n;
            for (const d of deps) b *= BigInt(allowed(d, v).length);
            key[ord.map(c => v[c.id]).join(',')] = combos.length;
            combos.push(ord.map(c => v[c.id]));
            offs.push(tot);
            tot += b;
            return;
          }
          const c = ord[i];
          for (const o of allowed(c, v)) {
            v[c.id] = o;
            rec(i + 1);
          }
          delete v[c.id];
      })(0);
      units.push({ ord, deps, combos, offs, key, radix: tot });
  });

  let total = 1n;
  units.forEach(u => { total *= u.radix; });

  // any set of picks -> the nearest valid set
  function normalize(p) {
    const v = {};
    for (const u of units) {
      if (u.free) {
        const n = u.free.o.length;
        const x = p[u.free.id] | 0;
        v[u.free.id] = (x >= 0 && x < n) ? x : 0;
        continue;

      }
      for (const c of u.ord.concat(u.deps)) {
        const al = allowed(c, v);
        v[c.id] = al.includes(p[c.id]) ? p[c.id] : al[0];
      }
    }
    return v;
  }

  // valid picks -> address
  function rank(v) {
    let n = 0n;
    for (const u of units) {
      let d;
      if (u.free) {
        d = BigInt(v[u.free.id]);
      } else {
        const ci = u.key[u.ord.map(c => v[c.id]).join(',')];
        let inner = 0n;
        for (const x of u.deps) {
          const al = allowed(x, v);
          inner = inner * BigInt(al.length);
          inner += BigInt(al.indexOf(v[x.id]));
        }
        d = u.offs[ci] + inner;
      }
      n = n * u.radix + d;
    }
    return n;
  }

  // address -> picks
  function unrank(n) {
    const v = {};
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      const d = n % u.radix;
      n /= u.radix;
      if (u.free) {
        v[u.free.id] = Number(d);
        continue;
      }
      let lo = 0;

      let hi = u.offs.length - 1;
      while (lo < hi) {
        const m = (lo + hi + 1) >> 1;
        if (u.offs[m] <= d) lo = m;
        else hi = m - 1;
      }
      u.ord.forEach((c, j) => { v[c.id] = u.combos[lo][j]; });
      let inner = d - u.offs[lo];
      for (let j = u.deps.length - 1; j >= 0; j--) {
        const x = u.deps[j];
        const al = allowed(x, v);
        const r = BigInt(al.length);
        v[x.id] = al[Number(inner % r)];
        inner /= r;
      }
    }
    return v;
  }

  return { total, units, allowed, normalize, rank, unrank };
}

// The three tests.
// Expect roundTripBad 0, normalizeBad 0, edgesOk true.
function testSpace(AX, S, N = 20000) {
  const rnd = () => {
    let n = 0n;
    for (let i = 0; i < 12; i++) {
      n = (n << 32n) + BigInt(Math.floor(Math.random() * 2 ** 32));
    }
    return n % S.total;
  };
  let a = 0;
  let b = 0;
  for (let i = 0; i < N; i++) {
    const n = rnd();
    const v = S.unrank(n);
    if (S.rank(v) !== n) a++;
    const w = S.normalize(v);
    for (const x of AX) if (w[x.id] !== v[x.id]) a++;
  }
  for (let i = 0; i < N; i++) {
    const p = {};

    for (const x of AX) {
      p[x.id] = Math.floor(Math.random() * x.o.length);
    }
    const v = S.normalize(p);
    const u = S.unrank(S.rank(v));
    for (const x of AX) if (u[x.id] !== v[x.id]) b++;
  }
  const last = S.total - 1n;
  const edges = S.rank(S.unrank(0n)) === 0n &&
  S.rank(S.unrank(last)) === last;
  return { roundTripBad: a, normalizeBad: b, edgesOk: edges };
}

// A four-axis example.
// Piping only exists on a padded seat.
const AXES = [
  { id: 'legs', name: 'Legs', o: ['Four', 'Three', 'Sled'] },
  { id: 'seat', name: 'Seat', o: ['Padded', 'Wood', 'Woven'] },
  {
    id: 'piping', name: 'Piping',
    o: ['None', 'Matching', 'Contrast'],
    on: ['seat'],
    when: v => (v.seat === 0 ? [0, 1, 2] : [0])
  },
  { id: 'hue', name: 'Colour', o: ['Black', 'White', 'Blue', 'Red'] }
];
const SPACE = buildSpace(AXES);
console.log('total', SPACE.total.toString()); // 60
console.log(JSON.stringify(testSpace(AXES, SPACE)));
