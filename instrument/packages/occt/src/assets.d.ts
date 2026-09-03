/**
 * Vite `?url` asset imports (worker.ts loads the wasm glue and binary as
 * URLs). Vite resolves these at build time; under plain tsc they only need a
 * module shape.
 */
declare module "*?url" {
  const url: string;
  export default url;
}
