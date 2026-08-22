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

## Run conduct — the max protocol (owner-ratified, mid-run)

1. Stretch prompts injected at gates, never mid-seam: G1 — attempt T-junction
   meshing with grooves in all parameter regions, report exactly where it
   fails; G2 — add three more real cars from public specs, report deltas, do
   not block on tolerance; G3 — panel method on all six cars, zebra and
   curvature maps, attempt STEP export for one cut.
2. Speculative branches on the hardest problems (flow solve, cut path): three
   or four parallel attempts, CI filters, the gate summary promotes the
   survivor by measured score, not style.
3. The six-car battery is a feedback loop started early in P3, its own lane —
   deltas are capability visibility, not failure.
4. The deterministic core is sacred: no agent is ever told to skip the hash,
   ignore the clock bans, or bypass the closed-mesh check. Widening evidence,
   never weakening invariants.
5. Compute goes to parallelism — more branches, more SOURCED research, more
   adversarial verifiers — never to shortcuts past law.

Consequence taken immediately: P2's lanes (type library, blind packaging
solver, mass ledger, regulatory/brief sets, real-car fixture) run in parallel
with P1 — their seams (demand/port/quantity, and the packaging SolveInput/
SolveResult contract added to @car/schema) are frozen and pushed.

## P2 — packaging contract

- **Translation-only poses in v1** — constructed simplification, stated in
  schema: ports are authored in world-aligned part frames; mates carry fixed
  offsets. Rotated installs (tilted engines) enter through the type's port
  authoring, not solver orientation variables. Honest scope, revisit on need.
- **Blindness layer three** — the rename-fuzz behavioral test: renaming every
  part label yields an identical solve modulo the renaming.
