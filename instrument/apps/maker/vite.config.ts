import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const pkg = (name: string): string =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  resolve: {
    alias: {
      "@car/schema": pkg("schema"),
      "@car/num": pkg("num"),
      "@car/history": pkg("history"),
      "@car/frame": pkg("frame"),
      "@car/constrain": pkg("constrain"),
      "@car/surface": pkg("surface"),
      "@car/mesh": pkg("mesh"),
      "@car/demand": pkg("demand"),
      "@car/skin": pkg("skin"),
      "@car/types": pkg("types"),
      "@car/occt": pkg("occt"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { output: { inlineDynamicImports: true, manualChunks: undefined } },
  },
});
