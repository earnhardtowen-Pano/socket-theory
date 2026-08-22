# Design notes — constructed vs retrieved, per charge §13

Running log. Each entry marks whether the design move was retrieved (well-worn
pattern, named) or constructed (reasoned here, worth adversarial review).

## P0 — seams

- **Single root package.json instead of pnpm workspaces** — constructed
  executor's simplification. Package boundaries are directories under
  `packages/`; the boundary and blindness rules the workspace manifests would
  have carried are enforced instead by `@car/ci-tools` lints (import allowlist
  for `@car/pack`, determinism bans in the model cone). Every law the structure
  served survives; the moving parts don't.
- **Branded Quantity as primary no-bare-constants enforcement, lint as
  backstop** — retrieved (nominal typing via phantom field is a standard TS
  pattern); the licensed-package scope of the lint is constructed.
- **Blind solver made structural** — constructed: the demand/port records carry
  no part-type field at all, so there is nothing to branch on; import allowlist
  and (P2) a rename-fuzz behavioral test are the second and third layers.
- **Hash canonicalization** — retrieved rules (LE Float64 bit patterns, -0
  normalization, NaN rejection, ID-sorted traversal, per-object sub-hashes).
  Determinism claim is scoped to a pinned engine: Math transcendentals are
  implementation-defined, so they route through @car/num and CI pins one Node.
- **Verb set mapping** — constructed: `tape` is the creation verb (tape lines
  *and boxes*, per the ratified toolset) and the splitting verb (a tape line
  across a cell splits it); `push-pull` carries all drags (faces, edges,
  contact points); `apply-entry` splices a catalog entry's own verb document —
  the grammar test made executable.
- **Coons patch with cubic boundaries = exact bicubic** — constructed claim,
  standard math (bilinear blend of cubics is degree (3,3)); it underwrites
  amendment A8's smooth-skin cut path.
