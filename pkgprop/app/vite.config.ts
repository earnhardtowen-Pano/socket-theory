import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Ship one file.
 *
 * The instrument is a thing you hand to someone — a designer opens it off a
 * download, not off a server they have to run first. A three-file dist is not
 * that: open `index.html` from disk and the browser refuses to fetch the
 * sibling module, because an ES import over `file://` is a cross-origin
 * request. So the stylesheet and the bundle get inlined into the HTML and the
 * asset files are dropped. An inline module script has nothing to fetch, so it
 * runs from disk.
 */
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function singleFile(): Plugin {
  return {
    name: 'pkgprop-single-file',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find(
        (f) => f.type === 'asset' && f.fileName.endsWith('.html'),
      );
      if (!html || html.type !== 'asset') return;

      let source = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        // Every replacement goes through a function, never a string. In a
        // replacement string `$&`, `` $` `` and `$'` are substitutions — and
        // minified JavaScript is full of `$`, so a string replacement splices
        // pieces of the surrounding HTML into the middle of the bundle. It
        // still parses, still looks about the right size, and is broken.
        if (file.type === 'asset' && name.endsWith('.css')) {
          const css = String(file.source);
          source = source.replace(
            new RegExp(`\\s*<link[^>]*href="[^"]*${escapeRe(name)}"[^>]*>`),
            () => `\n    <style>${css}</style>`,
          );
          delete bundle[name];
        } else if (file.type === 'chunk' && name.endsWith('.js')) {
          // `</script>` inside a string literal would close the tag we are
          // opening. It is the one sequence that turns valid JavaScript into
          // broken HTML, and a bundle this size carries shader source.
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          source = source.replace(
            new RegExp(`\\s*<script[^>]*src="[^"]*${escapeRe(name)}"[^>]*></script>`),
            () => `\n    <script type="module">${code}</script>`,
          );
          delete bundle[name];
        }
      }
      html.source = source;
    },
  };
}

export default defineConfig({
  plugins: [react(), singleFile()],
  server: { port: 5173, strictPort: true },
  build: {
    // One chunk, or there is more than one thing to inline.
    chunkSizeWarningLimit: 2048,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
