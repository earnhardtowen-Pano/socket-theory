/* Stage 4 check, for any thing built on the kit.
 *
 *   node kit/engine-test.js <thing folder> [--json]
 *
 *   1. kit/engine.js is Appendix A, token for token.
 *   2. Prints the total count and the size of every group.
 *   3. Runs the kit's three tests. Exit code 1 unless all pass.
 */
const fs = require('fs');
const path = require('path');
const dir = path.resolve(process.argv[2] || '.');

const squash = s => s.replace(/\s+/g, '');
const kit = fs.readFileSync(path.join(__dirname, 'appendix-a.js'), 'utf8');
const kitEngine = kit.slice(kit.indexOf('function buildSpace'), kit.indexOf('// A four-axis example.'));
const mine = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');
const myEngine = mine.slice(mine.indexOf('/*ENGINE-BEGIN*/') + 16, mine.indexOf('/*ENGINE-END*/'));
const same = squash(kitEngine) === squash(myEngine);
console.log('engine identical to Appendix A:', same);

const { AXES, SPACE, DIST, testSpace, VERSION } = require(path.join(dir, 'space.js'));
const total = SPACE.total.toString();
console.log('version', VERSION);
console.log('axes', AXES.length, ' options', AXES.reduce((s, a) => s + a.o.length, 0));
DIST.forEach(d => {
  const ax = AXES.filter(a => a.d === d.n);
  console.log('  ' + d.n + ' ' + d.name.padEnd(17), String(ax.length).padStart(3), 'axes',
    String(ax.reduce((s, a) => s + a.o.length, 0)).padStart(4), 'options');
});
console.log('from numbers', AXES.filter(a => a.n).length, ' named', AXES.filter(a => !a.n).length);
console.log('rules', AXES.filter(a => a.when).length);
console.log('total', total);
console.log('digits', total.length);
SPACE.units.filter(u => !u.free).forEach(u => {
  console.log('  group: controls [' + u.ord.map(c => c.id).join(', ') + ']  ' + u.combos.length +
    ' combinations, ' + u.deps.length + ' dependent axes, ' + u.radix.toString().length + ' digits');
});

const t0 = Date.now();
const res = testSpace(AXES, SPACE);
console.log(JSON.stringify(res), (Date.now() - t0) + ' ms');
const pass = same && res.roundTripBad === 0 && res.normalizeBad === 0 && res.edgesOk === true;
console.log(pass ? 'PASS' : 'FAIL');

if (process.argv.includes('--json')) {
  fs.mkdirSync(path.join(dir, 'checks'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'checks', 'engine-result.json'), JSON.stringify({
    version: VERSION, identical: same, axes: AXES.length,
    options: AXES.reduce((s, a) => s + a.o.length, 0), total, digits: total.length, tests: res, pass
  }, null, 2) + '\n');
}
process.exit(pass ? 0 : 1);
