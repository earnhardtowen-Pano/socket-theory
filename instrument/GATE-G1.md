# Gate G1 — the frame instrument, with replay determinism demonstrated

Evidence bundle, tagged `gate/g1`. Charge §13: "G1 — frame instrument with
replay determinism demonstrated." Everything below is checkable against this
commit; nothing is claimed beyond what a test or a committed artifact shows.

## Demonstrated

- **Replay determinism.** Four fixture documents (single-box, welded-push,
  split-pinch, cut-detach-group) replay from empty state byte-identically:
  canonical Float64 hashing over ID-sorted evaluated buffers matches committed
  goldens; allocator-counter integrity asserted on every load
  (`packages/history/test/replay.test.ts`).
- **The frame law.** Welded shared curves (one object, both owners follow),
  tape splits with true T-junctions (neighbors never split; trims subdivide),
  clause-17 rotation (throws, naming the curve, when a weld crosses the
  boundary), persistent naming through splits and welds, evaluation-side
  symmetry with recorded mirror-detach. 96 model-core tests.
- **Watertight by construction.** The conforming mesher samples every shared
  curve once, globally, including T points; both patches consume identical
  vertex indices. Closed-mesh check (edge-use-two, opposite orientation,
  closed fans) passes on box quilts, T-split quilts, curved shared chains, and
  tapered cells. The mirror law's double-emission bug was caught by this exact
  check at first end-to-end integration and fixed (DESIGN-NOTES).
- **One evaluator.** Coons through the four boundaries with edge
  short-circuits: the patch edge IS the shared curve, bit for bit; a flat
  frame's patch is the flat panel (crude and smooth are one evaluator);
  outward analytic normals; deterministic render feed.
- **The borrowed engine.** OpenCascade behind the narrow interface: box, fuse,
  prism cut, meshing of its own results with vertex dedup (closed for valid
  solids), deterministic STEP export (pinned timestamp, stripped counter).
  Recorded wheel-arch cut verbs evaluated as real booleans in the showcase.
- **The shell.** The browser instrument builds and runs on the REAL session —
  no stub: view tabs (side/plan/front/section/inspect), the verb strip
  (select, tape box, tape line, push-pull, crease), snapping with
  vertex > intersection > curve > grid priority, typed exact AT/DEPTH values,
  site tree, provenance ledger strip, zebra inspect. New files open on a
  rolling chassis seeded through apply-entry — the catalog grammar exercised
  from the first frame; one rail authored, its twin rendered by the mirror
  law.
- **Honesty police green.** No-bare-constants, blind-solver import rule,
  determinism bans (no wall clock, no randomness, no raw transcendentals
  below the render seam) — all enforced in CI from P0 and passing.

## Tally at this commit

459 tests green across 38 files; typecheck clean under strict; app builds.

## Carried forward (declared, not buried)

- Groove engraving and the "grooves in all parameter regions" stretch ride
  with the P3 mesh work, staged visual-first per the honesty ledger.
- The cut-path speculative branches (A8 exact-bicubic vs alternatives) run at
  P3 where the smooth-skin cut lands; G1's cuts are the crude-path booleans
  shown in the showcase.
- Flow solve (tangent live, curvature on release) is P3 scope by the charge's
  own stage-gate; G1 surfaces are taut, not fair.
