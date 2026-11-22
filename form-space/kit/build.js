/* Joins the kit's page with one thing's space and drawing into a single
 * self-contained file.
 *
 *   node kit/build.js <thing folder>                 writes <thing>/index.html
 *   node kit/build.js <thing folder> --body <file>   also writes the page without
 *                                                    its outer document tags, for
 *                                                    hosts that add their own
 *
 * The only outside files the page asks for are fonts, and it works without them.
 */
const fs = require('fs');
const path = require('path');
const dir = path.resolve(process.argv[2] || '.');
const kit = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const thing = f => fs.readFileSync(path.join(dir, f), 'utf8');
const { THING } = require(path.join(dir, 'space.js'));

// </script> inside a script would end it early
const safe = js => js.replace(/<\/script/gi, '<\\/script');
const parts = [['/*__ENGINE__*/', kit('engine.js')], ['/*__KIT__*/', kit('draw-util.js')], ['/*__SPACE__*/', thing('space.js')],
  ['/*__DRAW__*/', thing('draw.js')], ['/*__UI__*/', kit('ui.js')]];
let page = kit('page.html');
if (page.split('/*__TITLE__*/').length !== 2) throw new Error('title placeholder must appear exactly once');
page = page.replace('/*__TITLE__*/', () => THING.title);
for (const [mark, js] of parts) {
  if (page.split(mark).length !== 2) throw new Error('placeholder ' + mark + ' must appear exactly once');
  new Function(js);                       // each script must at least parse
  page = page.replace(mark, () => safe(js));
}

const cut = page.indexOf('<div class="app"');
const full = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  page.slice(0, cut) + '</head>\n<body>\n' + page.slice(cut) + '</body>\n</html>\n';
fs.writeFileSync(path.join(dir, 'index.html'), full);
console.log(path.relative(process.cwd(), path.join(dir, 'index.html')), (full.length / 1024).toFixed(0) + ' KB');

const i = process.argv.indexOf('--body');
if (i > 0 && process.argv[i + 1]) {
  fs.writeFileSync(process.argv[i + 1], page);
  console.log(process.argv[i + 1], (page.length / 1024).toFixed(0) + ' KB');
}
