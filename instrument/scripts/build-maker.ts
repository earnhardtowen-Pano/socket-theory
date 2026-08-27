/**
 * Fold the maker's vite build into ONE file.
 *
 * The app has to travel as a single page — no CDN, no sibling assets, nothing
 * fetched at run time — so this reads what vite emitted and inlines it, then
 * strips the document wrapper so the result can be dropped into a host page
 * that supplies its own.
 *
 *   npx vite build --config apps/maker/vite.config.ts
 *   npx tsx scripts/build-maker.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const dist = new URL("../apps/maker/dist/", import.meta.url);
let html = readFileSync(new URL("index.html", dist), "utf8");

const assets = readdirSync(new URL("assets/", dist));
for (const f of assets) {
  const body = readFileSync(new URL(`assets/${f}`, dist), "utf8");
  if (f.endsWith(".js")) {
    const tag = new RegExp(`<script[^>]*src="[^"]*${f}"[^>]*></script>`);
    if (!tag.test(html)) throw new Error(`no script tag for ${f}`);
    html = html.replace(tag, `<script type="module">\n${body}\n</script>`);
  } else if (f.endsWith(".css")) {
    const tag = new RegExp(`<link[^>]*href="[^"]*${f}"[^>]*>`);
    if (!tag.test(html)) throw new Error(`no link tag for ${f}`);
    html = html.replace(tag, `<style>\n${body}\n</style>`);
  }
}
if (/(src|href)="\.\/assets/.test(html)) throw new Error("an asset reference survived inlining");

// The page is published inside a host document, which supplies the doctype and
// the html/head/body wrapper. Keep everything between them and nothing else.
const head = /<head>([\s\S]*?)<\/head>/.exec(html);
const body = /<body>([\s\S]*?)<\/body>/.exec(html);
if (!head || !body) throw new Error("could not find head/body in the built page");
const inner = head[1]!.replace(/<meta[^>]*charset[^>]*>\s*/i, "").trim() + "\n" + body[1]!.trim() + "\n";

const out = new URL("../apps/maker/maker.html", import.meta.url);
writeFileSync(out, inner);
console.log(`  ${assets.length} assets inlined · ${(inner.length / 1024 / 1024).toFixed(2)} MB`);
console.log("  wrote apps/maker/maker.html\n");
