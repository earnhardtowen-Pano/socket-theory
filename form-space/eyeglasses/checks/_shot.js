/* Scratch helper: render a list of {v, view, ...} cells to one PNG. */
const path = require('path');
const { chromium } = require('playwright');
const D = require(path.join(__dirname, '..', 'draw.js'));
const S = require(path.join(__dirname, '..', 'space.js'));
module.exports = async function shot(cells, file, o = {}) {
  const cw = o.cw || 420, cols = o.cols || 2;
  let html = `<body style="margin:0;background:#fff;font:11px system-ui"><div style="display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:6px;padding:6px">`;
  cells.forEach((c, i) => {
    const svg = D.draw(c.v, Object.assign({ idp: 'c' + i + '_' }, c.o || {}));
    html += `<div style="background:${D.PAPER};border:1px solid #ddd"><div style="padding:2px 4px;color:#444;background:#fff">${c.label || ''}</div>${svg}</div>`;
  });
  html += '</div></body>';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: cols * (cw + 6) + 12, height: 400 }, deviceScaleFactor: o.dpr || 1 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.setContent(html);
  await p.screenshot({ path: file, fullPage: true });
  await b.close();
  if (errs.length) console.log('console errors', errs.slice(0, 5));
};
module.exports.S = S; module.exports.D = D;
