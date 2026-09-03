import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@car/schema": p("./packages/schema/src/index.ts"),
      "@car/num": p("./packages/num/src/index.ts"),
      "@car/history": p("./packages/history/src/index.ts"),
      "@car/frame": p("./packages/frame/src/index.ts"),
      "@car/constrain": p("./packages/constrain/src/index.ts"),
      "@car/surface": p("./packages/surface/src/index.ts"),
      "@car/mesh": p("./packages/mesh/src/index.ts"),
      "@car/skin": p("./packages/skin/src/index.ts"),
      "@car/flow": p("./packages/flow/src/index.ts"),
      "@car/demand": p("./packages/demand/src/index.ts"),
      "@car/types": p("./packages/types/src/index.ts"),
      "@car/pack": p("./packages/pack/src/index.ts"),
      "@car/lens": p("./packages/lens/src/index.ts"),
      "@car/occt": p("./packages/occt/src/index.ts"),
      "@car/render": p("./packages/render/src/index.ts"),
      "@car/fixtures": p("./packages/fixtures/src/index.ts"),
      "@car/ci-tools": p("./packages/ci-tools/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts", "scripts/lib/**/*.test.ts"],
    testTimeout: 30000,
  },
});
