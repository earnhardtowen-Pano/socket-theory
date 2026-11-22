/* Stage 8, for any thing built on the kit: writes <thing>/REPORT.md from the
 * space itself and from the check results, so the numbers in the report are
 * the numbers the checks produced.
 *
 *   node kit/report.js <thing folder>
 *
 * Run engine-test --json, gate, build and page-test first.
 * What a script cannot know is kept by hand in <thing>/checks/looked-at.json:
 * what was looked at by eye, what was not, what the gate and the sheets
 * caught, and the known weak spots.
 */
const fs = require('fs');
const path = require('path');
const dir = path.resolve(process.argv[2] || '.');
const S = require(path.join(dir, 'space.js'));
const { AXES, DIST, BY, SPACE, THING, LANGUAGE } = S;
const J = f => JSON.parse(fs.readFileSync(path.join(dir, 'checks', f), 'utf8'));
const eng = J('engine-result.json'), gate = J('gate-result.json'), pg = J('page-result.json'), notes = J('looked-at.json');

const items = fs.readFileSync(path.join(dir, 'items.md'), 'utf8').split('\n').filter(l => /^\d+\. `\[/.test(l));
const tagOf = l => /`\[([^\]]+)\]`/.exec(l)[1];
const kind = l => { const t = tagOf(l); return t === 'gap' ? 'gap' : t === 'out' ? 'out' : t === 'derived' ? 'derived' : t.startsWith('part') ? 'part' : 'said'; };
const tally = { said: 0, part: 0, derived: 0, gap: 0, out: 0 };
items.forEach(l => { tally[kind(l)]++; });
const text = l => l.replace(/^\d+\. `\[[^\]]+\]` /, '');
const pct = (a, b) => (100 * a / b).toFixed(0) + '%';
const list = (arr, w) => (arr && arr.length ? arr.forEach(x => w('- ' + x)) : w('- None.'));

let md = '';
const w = s => { md += s + '\n'; };
w(`# ${THING.name}: form space report`);
w('');
w(`Spec 1 of the Form Space Build Kit, first pass. Space version \`${S.VERSION}\`. Written ${new Date().toISOString().slice(0, 10)}.`);
w('');
w('The page is `index.html`. Everything in this report is either read from the space or from a check that was run. Where something was not checked, it says so.');
w('');
w('## The count');
w('');
w(`- **${AXES.length} axes, ${eng.options} options.**`);
w(`- **Total versions: ${eng.total}** (${eng.digits} digits).`);
w(`- ${AXES.filter(a => a.n).length} axes are steps of a number, ${AXES.filter(a => !a.n).length} are lists of names. That is ${pct(AXES.filter(a => a.n).length, AXES.length)} from numbers.`);
w(`- ${AXES.filter(a => a.when).length} axes carry a rule.`);
w('');
w('| Distance | Axes | Options | From numbers |');
w('|---|---:|---:|---:|');
for (const d of DIST) {
  const ax = AXES.filter(a => a.d === d.n);
  w(`| ${d.n}. ${d.name}, ${d.at} | ${ax.length} | ${ax.reduce((s, a) => s + a.o.length, 0)} | ${ax.filter(a => a.n).length} |`);
}
w('');
const thin = DIST.filter(d => AXES.filter(a => a.d === d.n).length < 8).map(d => d.name + ' (' + AXES.filter(a => a.d === d.n).length + ')');
if (thin.length) { w(`Distances with fewer than eight axes: ${thin.join(', ')}. That is a stated result of this pass, and the first job for a depth pass (Spec 6).`); w(''); }
w('## Engine');
w('');
w(`The engine is \`kit/engine.js\`, Appendix A of the kit. \`kit/engine-test.js\` compares it with the kit's text token for token: **${eng.identical ? 'identical' : 'DIFFERENT'}**.`);
w(`The kit's three tests on the full space: roundTripBad ${eng.tests.roundTripBad}, normalizeBad ${eng.tests.normalizeBad}, edgesOk ${eng.tests.edgesOk}.`);
w('');
w('Groups of axes tied together by rules:');
w('');
SPACE.units.filter(u => !u.free).forEach(u => w(`- controlled by ${u.ord.map(c => '`' + c.id + '`').join(', ')}: ${u.combos.length} valid combinations, ${u.deps.length} dependent ${u.deps.length === 1 ? 'axis' : 'axes'}`));
w('');
w('## Axes at each distance');
w('');
for (const d of DIST) {
  w(`### ${d.n}. ${d.name}`);
  w('');
  w('| Axis | id | Options | Built from |');
  w('|---|---|---|---|');
  for (const a of AXES.filter(x => x.d === d.n)) {
    const mark = (o, i) => o + (a.nw && a.nw.includes(i) ? ' *(new)*' : '') + (a.ex && a.ex.includes(i) ? ' *(extreme)*' : '');
    w(`| ${a.name} | \`${a.id}\` | ${a.o.map(mark).join(' · ')} | ${a.n ? 'numbers' : 'names'} |`);
  }
  w('');
}
w('## Rules');
w('');
w('Each rule reads "the options allowed on this axis depend on those axes". Taste is never a rule.');
w('');
w('| Axis | Depends on | Reason |');
w('|---|---|---|');
for (const a of AXES.filter(x => x.when)) w(`| ${a.name} (\`${a.id}\`) | ${a.on.map(c => '`' + c + '`').join(', ')} | ${a.why} |`);
w('');
w('## What is new');
w('');
w('Options marked as not in current practice, as far as memory serves (unverified, no web was used):');
w('');
list(AXES.filter(x => x.nw).map(a => `${a.name}: ${a.nw.map(i => a.o[i]).join(', ')}`), w);
w('');
w('Options kept outside the ordinary range and marked extreme:');
w('');
list(AXES.filter(x => x.ex).map(a => `${a.name}: ${a.ex.map(i => a.o[i]).join(', ')}`), w);
w('');
(notes.fromNumbers || []).forEach(p => { w(p); w(''); });
w('## What the gate found');
w('');
w('`kit/gate.js`, final run:');
w('');
w(`- **Random addresses:** ${gate.random.addresses} addresses, ${gate.random.drawings} drawings (every view, full and low detail). Failures (threw, or contained "NaN", "undefined" or "Infinity"): **${gate.random.failures.length}**.`);
w(`- **XML:** ${gate.xml.parsed} drawings parsed in a browser and checked for repeated ids. Bad: **${gate.xml.bad.length}**.`);
w(`- **Identical pictures:** ${gate.identical.compared} options compared with the first allowed option in the same setting. Identical: **${gate.identical.flagged.length}**. Fewer than 30 differing pixels: ${gate.identical.faint.length}${gate.identical.faint.length ? ' (' + gate.identical.faint.map(r => BY[r.axis].name + ' / ' + r.option + ', ' + r.pixels + ' px').join('; ') + ')' : ''}. Options no setting allows: ${gate.identical.unreachable.length}.`);
w(`- **Result: ${gate.pass ? 'pass' : 'FAIL'}.**`);
w('');
w('How "identical" was judged. Each option is drawn and turned into pixels, then compared with its default at the distance its axis belongs to. Form axes are compared on the whole view at 180 px wide, so a Form axis has to show in a thumbnail. Other axes are compared at 360 px on the view or close crop named in the axis\'s `look`. A pixel counts as different above 12 levels out of 255.');
w('');
if (gate.identical.helped && gate.identical.helped.length) {
  w(`${gate.identical.helped.length} axes are compared with extra choices changed, because they cannot be judged at default. This is a departure from "the rest stay at default" and is stated here:`);
  w('');
  gate.identical.helped.forEach(h => w(`- ${h.name}: with ${h.with}`));
  w('');
}
w('The ten options that differ least from their default (share of pixels changed):');
w('');
w('| Axis | Option | Pixels changed | Share |');
w('|---|---|---:|---:|');
gate.options.slice().sort((a, b) => a.share - b.share).slice(0, 10).forEach(r => w(`| ${BY[r.axis].name} | ${r.option} | ${r.pixels} | ${r.share}% |`));
w('');
w('What earlier runs of the gate caught, all fixed:');
w('');
list(notes.gateCaught, w);
w('');
w('What looking at the sheets caught, all fixed:');
w('');
list(notes.sheetCaught, w);
w('');
w('## The page');
w('');
w(`\`kit/page-test.js\` opens \`index.html\` at ${pg.width} px wide in a headless browser and uses every control. ${pg.steps.length} steps, ${pg.steps.filter(s => !s.ok).length} failed, ${pg.consoleErrors.length} console errors. **${pg.pass ? 'Pass' : 'FAIL'}.**`);
w('');
pg.steps.forEach(s => w(`- ${s.ok ? 'ok' : 'FAILED'}: ${s.name}`));
w('');
w(`Views: ${THING.views.map(v => v[1]).join(', ')}. Room shows it in place for scale. The loupe drags and magnifies four times. State is saved on the device. No pop-up dialogs. The only outside files are two font families, and the test ran with them blocked.`);
w('');
w('The Language agreements:');
w('');
LANGUAGE.agreements.forEach((t, i) => w(`${i + 1}. ${t}`));
w('');
w(`The ${AXES.filter(a => a.lang).length} axes a language holds: ${AXES.filter(a => a.lang).map(a => a.name).join(', ')}.`);
w('');
w('## What was looked at, and what was not');
w('');
w('Looked at, by turning sheets into images and reading them:');
w('');
list(notes.looked, w);
w('');
w('Not looked at:');
w('');
list(notes.notLooked, w);
w('');
w('Not checked at all:');
w('');
list(notes.notChecked, w);
w('');
w('## Known weak spots');
w('');
list(notes.weak, w);
w('');
w(`## What ${THING.many} can be that this space still cannot say`);
w('');
w(`\`items.md\` lists ${items.length} things a person can see, hear, feel or do. ${tally.said} are said by an axis (${pct(tally.said, items.length)}), ${tally.part} are partly said, ${tally.derived} follow from other choices, ${tally.out} ${tally.out === 1 ? 'is' : 'are'} left out by the kit's rules, and **${tally.gap} cannot be said at all**:`);
w('');
items.filter(l => kind(l) === 'gap').forEach(l => w('- ' + text(l)));
w('');
w('Partly said:');
w('');
items.filter(l => kind(l) === 'part').forEach(l => w('- ' + text(l) + ' (partly: ' + tagOf(l).replace('part: ', '') + ')'));
w('');
w('Left out by the kit\'s rules:');
w('');
items.filter(l => kind(l) === 'out').forEach(l => w('- ' + text(l)));
w('');
w('Beyond the list: nothing here has been checked against real examples. There is no census, so there is no coverage score. That is Spec 2.');

fs.writeFileSync(path.join(dir, 'REPORT.md'), md);
console.log('REPORT.md', md.split('\n').length, 'lines;', 'items', items.length, JSON.stringify(tally));
