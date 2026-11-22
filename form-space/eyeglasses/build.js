/* Joins page.html, space.js, draw.js and ui.js into one self-contained file.
 *
 *   node build.js                  writes index.html (open it in any browser)
 *   node build.js --body <file>    also writes the page without its outer
 *                                  document tags, for hosts that add their own
 *
 * The only outside files the page asks for are fonts, and it works without them.
 */
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

// </script> inside a script would end it early
const safe = js => js.replace(/<\/script/gi, '<\\/script');
let page = read('page.html');
for (const [mark, file] of [['/*__SPACE__*/', 'space.js'], ['/*__DRAW__*/', 'draw.js'], ['/*__UI__*/', 'ui.js']]) {
  if (page.split(mark).length !== 2) throw new Error('placeholder ' + mark + ' must appear exactly once');
  page = page.replace(mark, () => safe(read(file)));
}

// A browser's own "use strict" check: each script must at least parse.
for (const f of ['space.js', 'draw.js', 'ui.js']) new Function(read(f));

const head = page.slice(0, page.indexOf('<div class="app"'));
const body = page.slice(page.indexOf('<div class="app"'));
const full = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  head + '</head>\n<body>\n' + body + '</body>\n</html>\n';
fs.writeFileSync(path.join(__dirname, 'index.html'), full);
console.log('index.html', (full.length / 1024).toFixed(0) + ' KB');

const i = process.argv.indexOf('--body');
if (i > 0 && process.argv[i + 1]) {
  fs.writeFileSync(process.argv[i + 1], page);
  console.log(process.argv[i + 1], (page.length / 1024).toFixed(0) + ' KB');
}
