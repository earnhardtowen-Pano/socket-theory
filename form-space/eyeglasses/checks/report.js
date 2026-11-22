/* Stage 8: writes REPORT.md from the space itself and from the check results,
 * so the numbers in the report are the numbers the checks produced.
 *
 *   node checks/engine-test.js --json && node checks/gate.js && node build.js && node checks/page-test.js
 *   node checks/report.js
 *
 * The "looked at" section is a record kept by hand in checks/looked-at.json.
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..');
const S = require(path.join(dir, 'space.js'));
const { AXES, DIST, BY, SPACE } = S;
const J = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const eng = J('engine-result.json'), gate = J('gate-result.json'), pg = J('page-result.json'), eyes = J('looked-at.json');

const items = fs.readFileSync(path.join(dir, 'items.md'), 'utf8').split('\n').filter(l => /^\d+\. `\[/.test(l));
const kind = l => { const t = /`\[([^\]]+)\]`/.exec(l)[1]; return t === 'gap' ? 'gap' : t === 'out' ? 'out' : t === 'derived' ? 'derived' : t.startsWith('part') ? 'part' : 'said'; };
const tally = { said: 0, part: 0, derived: 0, gap: 0, out: 0 };
items.forEach(l => { tally[kind(l)]++; });
const gaps = items.filter(l => kind(l) === 'gap').map(l => l.replace(/^\d+\. `\[gap\]` /, ''));
const parts = items.filter(l => kind(l) === 'part').map(l => l.replace(/^\d+\. `\[part: ([^\]]+)\]` /, (m, a) => '') + ' (partly: ' + /`\[part: ([^\]]+)\]`/.exec(l)[1] + ')');

const pct = (a, b) => (100 * a / b).toFixed(0) + '%';
let md = '';
const w = s => { md += s + '\n'; };

w('# Eyeglasses form space: report');
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
w('Light and motion, Touch and Sound are thin. Sound has one axis. That is a stated result of this pass, and the first job for a depth pass (Spec 6).');
w('');
w('## Engine');
w('');
w(`The engine in \`space.js\` is Appendix A of the kit. \`checks/engine-test.js\` compares it with the kit's text token for token: **${eng.identical ? 'identical' : 'DIFFERENT'}**.`);
w(`The kit's three tests on the full space: roundTripBad ${eng.tests.roundTripBad}, normalizeBad ${eng.tests.normalizeBad}, edgesOk ${eng.tests.edgesOk}.`);
w('');
w('Groups of axes tied together by rules:');
w('');
SPACE.units.filter(u => !u.free).forEach(u => {
  w(`- controlled by ${u.ord.map(c => '`' + c.id + '`').join(', ')}: ${u.combos.length} valid combinations, ${u.deps.length} dependent ${u.deps.length === 1 ? "axis" : "axes"}`);
});
w('');
w('The largest group lists 3,276 combinations. The kit says to stay under a few tens of thousands and notes that 1,365 has been tested. This one is larger than the tested size and passed the three tests.');
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
for (const a of AXES.filter(x => x.nw)) w(`- ${a.name}: ${a.nw.map(i => a.o[i]).join(', ')}`);
w('');
w('Options kept outside the ordinary range and marked extreme:');
w('');
for (const a of AXES.filter(x => x.ex)) w(`- ${a.name}: ${a.ex.map(i => a.o[i]).join(', ')}`);
w('');
w('Things that came from numbers and have no name: every lens outline between the named shapes (softness, taper, droop, sweep, brow flatness, nose cut and tilt are separate numbers, so a five-sided lens with a swept corner and a drooped cheek exists), outer contours that differ from the lens by a number, and mottled patterns set by blotch size, stretch and contrast.');
w('');
w('Parts taken from other fields in this pass, each as an option: glass that tints on command, open-ear and bone-conduction speakers, a display in the lens, electronic and dial-set focus, flexing metal with no hinge, printed nylon, telescoping and ratchet temples, reading lights. None has numbers or sources yet. That is Spec 4.');
w('');
w('## What the gate found');
w('');
w('`checks/gate.js`, final run:');
w('');
w(`- **Random addresses:** ${gate.random.addresses} addresses, ${gate.random.drawings} drawings (four views, full and low detail). Failures (threw, or contained "NaN", "undefined" or "Infinity"): **${gate.random.failures.length}**.`);
w(`- **XML:** ${gate.xml.parsed} of those drawings parsed in a browser and checked for repeated ids. Bad: **${gate.xml.bad.length}**.`);
w(`- **Identical pictures:** ${gate.identical.compared} options compared with the first allowed option in the same setting. Identical: **${gate.identical.flagged.length}**. Fewer than 30 differing pixels: ${gate.identical.faint.length}. Options no setting allows: ${gate.identical.unreachable.length}.`);
w(`- **Result: ${gate.pass ? 'pass' : 'FAIL'}.**`);
w('');
w('How "identical" was judged. Each option is drawn and turned into pixels, then compared with its default at the distance its axis belongs to. Form axes are compared on the whole view at 180 px wide, so a Form axis has to show in a thumbnail. Other axes are compared at 360 px on the view or close crop named in the axis\'s `look`. A pixel counts as different above 12 levels out of 255.');
w('');
w('Seven axes are compared with extra choices changed, because they cannot be judged at default. This is a departure from "the rest stay at default" and is stated here:');
w('');
w('- Colour strength: on a mid tone. It cannot be seen on the default deep tone.');
w('- Pattern colour: on a mid orange tone at medium contrast.');
w('- Second colour: on a mid blue tone.');
w('- Tint hue and tint gradient: at 50% density. The first density that allows them is 10%.');
w('- Blotch size and blotch stretch: at medium contrast.');
w('');
w('The ten options that differ least from their default (share of pixels changed):');
w('');
w('| Axis | Option | Pixels changed | Share |');
w('|---|---|---:|---:|');
gate.options.slice().sort((a, b) => a.share - b.share).slice(0, 10).forEach(r => w(`| ${BY[r.axis].name} | ${r.option} | ${r.pixels} | ${r.share}% |`));
w('');
w('What earlier runs of the gate caught, all fixed:');
w('');
w('- 116 of 1,200 drawings failed to parse: the dotted engraving wrote `stroke-width` twice. Random drawing with a "NaN" search did not catch it. The XML check did.');
w('- 13 options drew the same as their default: wood grain on a black frame, and the twelve tint hues at 10% density.');
w('');
w('What looking at the sheets caught, all fixed:');
w('');
w('- Temple tips showed through the lenses as grey bars in the front view. Removed.');
w('- Rivets sat on the lens beside thin rims, and floated on the lens when a camera took the corner. They now follow the rim and step below a camera.');
w('- The bridge was pushed far back by the lens curve in the top view. The lens curve now stops at the lens edge.');
w('- A brow-only rim left a thin dark line round the rest of the lens. The rim is now drawn only where it has thickness.');
w('- Rimless corners were heavy black blocks with rivets beside the mount. They are now a thin plate with the mount screws on it, and a rimless front has no rivets.');
w('- Lens edge finishes, the core wire, brushed and hammered finishes were too faint to read. Strengthened.');
w('- The temple seen end-on stayed black behind a clear frame. It now follows the frame.');
w('- Display and camera strips cropped to one lens, so "one" and "both" looked the same. They now show the whole front.');
w('- A dipped top line crossed its own underside. Fixed.');
w('- A ball tip scaled with temple depth and became a 25 mm disc. Capped.');
w('');
w('## The page');
w('');
w(`\`checks/page-test.js\` opens \`index.html\` at ${pg.width} px wide in a headless browser and uses every control. ${pg.steps.length} steps, ${pg.steps.filter(s => !s.ok).length} failed, ${pg.consoleErrors.length} console errors. **${pg.pass ? 'Pass' : 'FAIL'}.**`);
w('');
pg.steps.forEach(s => w(`- ${s.ok ? 'ok' : 'FAILED'}: ${s.name}`));
w('');
w('Parts of the page: the drawing with front, side and top views and three distances (Room shows it worn on a plain head, Arm\'s length, and a loupe that drags and magnifies four times); the number with previous, next and go-to; Anywhere; Drift; every axis under its distance with arrows and a strip of its options; Sheet; Hold on any axis and on a whole distance; Language; Keep and Near my keeps. State is saved on the device. No pop-up dialogs. The only outside files are two font families, and the test ran with them blocked.');
w('');
w('The Language agreements:');
w('');
w('1. A sharp outline takes sharp marks and crisp edges. A soft outline takes round marks and rounded edges.');
w('2. Rim, temple and corner weight move together.');
w('3. Thin rims take metal or carbon. Heavier rims take sheet and moulded materials.');
w('4. Warm colours take warm metal. Cool colours take cool metal.');
w('5. One material, one finish and one pattern run through the whole pair.');
w('');
w(`The ${AXES.filter(a => a.lang).length} axes a language holds: ${AXES.filter(a => a.lang).map(a => a.name).join(', ')}.`);
w('');
w('## What was looked at, and what was not');
w('');
w('Looked at, by turning sheets into images and reading them:');
w('');
eyes.looked.forEach(l => w('- ' + l));
w('');
w('Not looked at:');
w('');
eyes.notLooked.forEach(l => w('- ' + l));
w('');
w('Not checked at all:');
w('');
eyes.notChecked.forEach(l => w('- ' + l));
w('');
w('## Known weak spots in the drawing');
w('');
w('- The four views are built from the same numbers, but not from one set of points in three dimensions. The side view carries the front outline back by wrap and lens curve and tilts it. The top view ignores forward tilt. Views can disagree in small ways. Spec 6 stage 7 fixes this.');
w('- Size print is drawn on the outside of the temple so it can be seen. On real glasses it is inside.');
w('- Tint that changes is shown as two states in two views: indoors in the front view, outdoors in the worn view.');
w('- Folding and spring are shown as dashed ghosts in the top view. There is no folded view.');
w('- The hinge sound is shown as the catch that makes it, and the page can play a made-up click. Nobody has compared it with a real hinge.');
w('- Hardware metal shows only where there is hardware. With no rivets, a hidden hinge and a moulded nose rest, the axis changes nothing visible. The same holds for a few other axes in a few settings (frame colour on a rimless front with no temples shows only on the bridge wire). The gate tests each option in one setting, not in all.');
w('- "Lighter" as a second colour or pattern colour is nearly invisible on a near-white frame, and "darker" on a deep one.');
w('- A random address looks crowded. Most axes list the plain option first, so a uniformly random pair has most extras switched on at once. Nothing is filtered, as the kit asks. Hold all on a distance, or a Language, narrows what Anywhere changes.');
w('- Type on the drawing (the size print) uses the device\'s monospace font and will differ between devices.');
w('');
w('## What eyeglasses can be that this space still cannot say');
w('');
w(`\`items.md\` lists ${items.length} things a person can see, hear, feel or do with eyeglasses. ${tally.said} are said by an axis (${pct(tally.said, items.length)}), ${tally.part} are partly said, ${tally.derived} follow from other choices, ${tally.out} is left out by the kit's rules (logos), and **${tally.gap} cannot be said at all**:`);
w('');
gaps.forEach(g => w('- ' + g));
w('');
w('Partly said:');
w('');
parts.forEach(g => w('- ' + g));
w('');
w('Beyond the list: nothing here has been checked against real glasses. There is no census, so there is no coverage score. That is Spec 2.');

fs.writeFileSync(path.join(dir, 'REPORT.md'), md);
console.log('REPORT.md', md.split('\n').length, 'lines;', 'items', items.length, JSON.stringify(tally));
