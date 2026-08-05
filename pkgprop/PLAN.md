# PKG→PROP · V1 PLAN

This file is the working memory of the build. Kept current at every commit.
Target: the full first generation per the kickoff brief. Owner reviews at the
three ★ gates; everything else is decided here and recorded in DECISIONS.md.

## Status line

**Post-Gate-1 · the instrument now opens on a painted car.** Marker render
with a movable sun, point add/delete with per-line curve tension, folded
rail, wall-flash feedback, contact tick, real car vocabulary. The drag-shake
bug is fixed and regression-tested. 70 unit + 16 e2e green.

**★ GATE 1 REACHED.** Phases A, B, C built and tested: 70 unit tests
(including the license lint, verified to bite) + 10 Playwright e2e tests
(including the scripted ten-minute run). Awaiting owner review before
phase D (sections + loft).
Seed file `seed/pkgprop-v0.jsx` was absent from the repo at kickoff; its four
contract behaviors are reconstructed from the brief (see OPEN_QUESTIONS.md #1).

---

## Phase A — Foundations

- [x] PLAN.md / DECISIONS.md / OPEN_QUESTIONS.md
- [x] Monorepo scaffold: pnpm workspaces, TS strict, Vitest, all units mm
- [x] `/core` parameter registry: value + license tag (DERIVED/SOURCED/ASSUMED)
      + source + derivation string, typed, tested
- [x] License lint (CI rule): build fails if a numeric literal appears in
      constraint code without a registry entry — Vitest test using TS AST
      (verified to bite on an injected constant)
- [x] `/core` constraint graph: named constraints with license + reason,
      dependency propagation, `solve(state)` → geometry, bounds (each with
      binding constraint), conflicts (naming both sides)

## Phase B — Solver generalized (§3.1)

- [x] Architecture presets as data: FR longitudinal, front-transverse, MR, RR,
      EV skateboard — engine/motor box, structure boxes, tire spec, H-point band
- [x] Occupant array: rows at ASSUMED couple distances; seat counts
      1 / 2 / 2+2 / 4-5 / 2+3-row; roof envelope = max over all occupants;
      vision from row one
- [x] Occupant chain → roof minimum (per row), derived from anthro data
- [x] Vision ceilings: cowl and hood; ground-sight distance
- [x] Head-tangency rake floor + property test for monotonicity
- [x] Hood scan over obstacles (generalized: floor/ceiling profile crossing scan)
- [x] Rear-row headroom vs roof taper (occupant head arcs in the floor profile)
- [x] MR rear deck over engine box
- [x] Belt/DLO lower bound from ASSUMED door-structure stack
- [x] Conflict detection: infeasible bound pairs name both constraints and the
      ASSUMED knobs that could resolve them
- [ ] Plan-view lateral constraints: overall width control, track, shoulder
      room, wheel zones (needed for §3.2 plan view)
- [ ] Open-wheel flag (stretch — mark deferred if not reached)

## Phase C — Drawing layer, side view (§3.2)

- [x] `/app` scaffold: Vite + React; panels PACKAGE · SIDE · SECTIONS ·
      BODY · BOUNCE · LEDGER; TE register (flat, mono, one accent)
      (Three.js arrives with BODY at gate 2)
- [x] Envelope rendering: dashed threshold lines, labeled as buildable space
- [x] Package controls as fraction-of-live-bounds sliders with wall
      attribution on contact (seed contract)
- [x] LEDGER panel: every number listed + tagged; ASSUMED editable in place,
      edits propagate live; counts in header; one keystroke away (L)
- [x] Characteristic-line set as editable splines: rocker, arches, hood,
      cowl-to-header glass, roof, backlight, deck, beltline (ground is the
      solver's reference line; backlight added so the silhouette closes)
- [x] Control points clamped to envelope; wall names itself on contact
- [x] Plan view with same contract; symmetry enforced by construction
- [x] Undo everything (drag-safe history); keyboard: L ledger, ctrl+Z/⇧Z,
      arrows nudge selected point
- [x] Playwright screenshot loop after every UI task; e2e suite (10 specs)
      including the scripted ten-minute run and save/load

**★ GATE 1 — stop, push, owner plays with it.**

## Phase D — Sections + loft (§3.3)

- [ ] `/geometry` package: Curve/Surface interfaces; verb-nurbs vendored and
      wrapped OR own B-spline impl behind same interface
- [ ] Half-sections at stations, mirrored, clipped live to envelope
- [ ] Loft side + plan + sections → body surface; G1 target; zebra shader
- [ ] Re-loft under 100 ms on package change
- [ ] README states plainly: Class-A out of scope for V1

## Phase E — The two verbs (§3.4)

- [ ] Shutline: curve on surface (authored 2D, evaluated UV) → panel split →
      gap render at ASSUMED gap width
- [ ] Inset: closed curve → region offset inward along normal, depth param
- [ ] Op stack: ordered, re-applied on re-loft, reorderable, deletable

**★ GATE 2 — stop, push, owner judges surface feel.**

## Phase F — The bounce (§3.5)

- [ ] manifold-3d wrapped in scope helper (no manual .delete() at call sites)
- [ ] Watertight verification; failures explain where the leak is
- [ ] Scale presets 1:24 / 1:10 / 1:5 + print-readiness report (thinnest wall,
      smallest feature vs nozzle, plain-word warnings)
- [ ] Exports: 3MF, STL (welded + verified), glTF — one click each
- [ ] Project file: one human-readable JSON = the entire car

## Phase G — Data spine + validation (§3.6, §6)

- [ ] 12+ real vehicles as validation rows; every value sourced or
      SOURCED-PENDING with a note — never fabricated
- [ ] Round-trip harness: benchmark cars land inside their own thresholds or
      failures triaged in OPEN_QUESTIONS.md
- [ ] Ten-minute test scripted in Playwright as final gate
- [ ] Definition-of-done script (§6) passes 1–10
- [ ] Tag v1.0, write WHATS-REAL.md

**★ GATE 3 — owner prints and rules on V1 complete.**
