# Gate G3 — skin, flow and print across the six-car battery

Evidence bundle. Charge §13: "**G3** — skin, flow, and print across the
six-car battery." Everything below is checkable at this commit, by running the
command named against it.

## The battery — `npx tsx scripts/battery.ts`

Six real cars re-entered from public specs plus the shoebox V16, every one
through **one** builder (`configFromSpec`) and one solver. There is no branch
on which car it is; the two branches that exist read an architecture field the
author entered, not a name.

```
car                                       wb  closed  viol  clamp  parts    Δmax  within
Mazda MX-5 (ND) 2.0 SkyActiv-G 184      2310   false    36      0     15    0.00     yes
Volkswagen Golf GTI (Mk8)               2626   false    49      0     15    0.00     yes
BMW M3 (G80)                            2857   false    50      0     15    0.00     yes
Toyota RAV4 (2023, XLE)                 2690   false    46      0     15    0.00     yes
Lamborghini Huracán EVO                 2620   false    51      0     15    0.00     yes
Ford F-150 SuperCrew 5.5' box (2023)    3693   false    38      0     15    0.00     yes
Shoebox V16                             1900   false    55      0     15    0.00     yes
```

- **Hard points: 7 of 7 within ±15 mm, at 0.00 mm.** The acceptance rests on
  wheelbase, front and rear track, and tire size; a test enforces that those
  four can never be ASSUMED for a battery car, so the tolerance is measured
  against consulted numbers rather than against the author's own guess.
- **Crashes: 0 of 7.** The shoebox — a 1900 mm wheelbase under a V16 — goes
  down the identical path and packages without a special case.
- **`closed` is `false` on all seven, and that is the honest result**, broken
  out below.

### Citations say what they are

The egress proxy blocked direct page fetches this run — `encycarpedia.com`,
`en.wikipedia.org` and the rest all returned `EGRESS_BLOCKED` — and only the
search index was reachable. So a SOURCED value in `battery.ts` means: the
index returned that figure attributed to that named page, and the citation
records `via search index`. That is weaker than reading the page and it is
written as exactly what it is. Anything the searches did not return is ASSUMED
and says so in its reason.

### What the battery found, in its first minutes

1. **Three cars threw on a missing V bank angle.** The engine type refuses to
   guess. Fixed by a rule applied to all of them (720°/cylinders, rounded).
2. **Four cars threw on a brief carrying SOURCED.** That is a law working: a
   brief value is the *owner's*, so re-entering a real car's curb mass as a
   target is an `override()`, which keeps the chain to the published figure
   and re-licenses the decision as his.
3. **Members reached the solver in the wrong coordinate frame.** The substrate
   authors its members in its own space; the solve reads them in world; nobody
   reconciled the two. Every rail and crossmember sat `railHeight` mm below
   where it actually was, so the anchorage law tested every mount against
   members that were not there. **Thirty-five violations per car, on all
   seven, identically** — not seven cars failing but one missing step. Fixed
   at assembly; the count drops to 22–33.

### What is still open, named rather than papered over

The remaining anchorage violations are a real gap: the type library publishes
an anchorage demand at a mount pad, and there is **no bracket part** to carry
that load down to a member. The law is right; the model is short a part.
Weakening the law to make the report green was the one move not available.

`crossmemberStations` and `fitSubstrate()` were added so a member can go where
a load is rather than on an even grid — assemble once, ask the solver's own
`anchorPointOf` where the loads land, re-emit the chassis under them. Same
measure-then-design pattern as the P1 engine setback.

## The skin — `npx tsx scripts/aero-p1.ts`

The aero lens (charge §9), first-order source panels over the sampled quilt
with a ground-plane image:

```
method     700 panels (196 mm binning of 32,612 triangles), point-source
           influence with an exact σ/2 self term, ground-plane image in z = 0
solve      350 ms
residual   0.0000 of V∞          ← the boundary condition it set, actually met
Cp         −4.080 to 0.990       (2nd–98th percentile: −2.683 to 0.704)
frontal    2.132 m² at 2 mm      (±2.3 × 10⁻³ m² on doubling the cell)
```

- **Cp max 0.990.** Potential flow puts the stagnation point at exactly 1 and
  cannot exceed it; the test asserts `≤ 1`.
- **Drag never comes from the map.** `dragAndPower` is a separate function
  that does not read it and demands a Cd from outside. A panel solve of this
  class cannot produce a Cd, and an integral of Cp would be the most
  convincing wrong number in the tool. A non-SOURCED Cd puts a caveat on the
  result that travels with it instead of being dropped at the call site.
- **Separation is beyond the method**, so the flag is crude, ASSUMED, and says
  so in the lens's own notes.
- **Frontal area is the union of the projected skin**, rasterised — not
  Σ|n_x|·A, which is exact only for a body convex along X, and a car with
  wheels behind a fender is not.
- **The inlet check was wrong twice** and the arithmetic is separated now so
  it can be argued with one number at a time. Reads adequate at 120 km/h,
  short at 50, where a fan is what covers it.

### Curvature and zebra — `?lens=curvature`, `?lens=zebra`

Cotangent Laplace–Beltrami for mean curvature, angle deficit for Gaussian,
verified against the two shapes with analytic answers: 1/r and 1/r² on a
sphere, flat on a plane.

**The curvature lens found something about its own reading first.** Five per
cent of the P1's vertices sit at a collapsed Coons-patch corner, with a mixed
area of 1e-10 mm² against a median face of 485. The operator reported 3.5 ×
10¹⁴ per mm there — a radius of 10⁻¹⁴ mm. Flooring the area only moved it to
59 per mm, because the Laplacian at such a vertex is as meaningless as the
area, and percentiles could not save it either: the bad vertices *are* the top
of the distribution. Those vertices are marked unmeasurable now, read zero,
and are left out of the display range — and the count is on the render, since
a lens that quietly drops five per cent of a mesh is worse than one that
reports nonsense.

**CORRECTED.** An earlier version of this section read the zebra and claimed
the body was "G1 and not G2 — the Coons patches meet with matching position
and tangent but not curvature". Both halves were wrong, and one of them
flatteringly.

The zebra could not have measured it. It runs on the crease-split render
normals, so at 48° every deliberate smoothing-group split breaks a stripe *by
construction* and an authored break is indistinguishable from a defect.

`continuityProbe` (`packages/surface/src/continuity.ts`) asks the surfaces
instead: two patches sharing a curve are G1 when they share a tangent plane
along it, so the measurement is the angle between their outward normals at the
same point on that curve. On the P1:

```
joins 102   creased 104 (excluded — an authored break is not a defect)
worst 90.00°   p90 90.00°   median 10.21°
G1 joins (<1°): 6 of 102
```

**The body is G0** — position-watertight by construction, which is exactly
what `@car/surface` has always claimed, and tangent-continuous only where the
neighbouring geometry happens to agree. A Coons patch's cross-boundary
derivative is fixed by its *opposite* edge; nothing makes two neighbours
agree, and nothing in the codebase tried to. That is a representation
property, not a tuning miss, and closing it is Stage 1 of the surfacing road.

## The print — `npx tsx scripts/build-p1.ts`, `npx tsx scripts/ten-minute.ts`

```
triangles          32,612        closed mesh   true (0 violations)
shutline grooves   342 vertices sunk
                   19.2 × 5.8 mm on the car → 0.80 × 0.24 mm at 1:24
replay round-trip  true
provenance         68 assumed · 0 sourced · 0 derived
```

- **Grooves run the arithmetic the other way round.** A 4 mm door gap at 1:24
  is 0.17 mm and comes off a 0.4 mm nozzle as nothing. So the groove is sized
  from the printer and back-scaled. It looks wrong in CAD and is the only
  thing that reads in the hand; the result carries both dimensions.
- **Topology is never touched**, so the closed check is still checking the
  object that gets printed.
- **The provenance report ships beside the STL**, not in a menu. What was
  forced, what was free, what it weighs. No wall clock anywhere: regenerate it
  from the same document and it is byte-identical, which is what makes two of
  them comparable.

### The ten-minute test — `npx tsx scripts/ten-minute.ts`

```
1. blank file         0 ms      session open, 0 verbs
2. blocked            15 ms     10 verbs, 22 cells, 28 curves
3. skinned            98 ms     4788 triangles, closed true, 1024 split at 48°
4. cut                1917 ms   2 recorded booleans replayed, STEP 172,772 bytes,
                                byte-identical on re-export
5. printed report     95 ms     239,484 STL bytes, 39 groove vertices, replay true
total                 2124 ms
```

Every stage **asserts** the thing it claims rather than merely finishing, and
the script exits non-zero on any failure, so it is a CI gate and not a demo.
It writes an STL, a STEP file, a provenance report and a car document, none of
which existed when it started.

## The honesty police, and what they changed

Two CI lints failed on the first aero commit and both were right.

`@car/lens` is a **licensed** package: every numeric literal has to be an
argument to `derived`/`sourced`/`assumed`. A panel solver is not made of
design decisions — it is made of array strides, cotangent weights and a 4π —
and licensing those would have said nothing true while burying the four
constants that genuinely *are* assumptions. So the numerics moved to a new
package, **`@car/skin`**, and what stayed in `@car/lens` is what makes claims.
Everything in it now carries a licence, including the ones worth arguing with:
the conversions, the percentile bounds, the panel target, and the reporting
precision — three decimals on a Cp is a claim about how far the method is
worth reading.

The determinism lint caught a raw `Math.acos`. `@car/num` takes `nacos` and
`nasin` now, and `@car/skin` joins the cone the lint scans.

## Standing invariants, unchanged

- `npx vitest run` — **531 tests green**, 47 files.
- No bare constants in the licensed packages: **0**.
- No wall clock, randomness or raw transcendentals in the model cone: **0**.
- `@car/pack` imports only schema/num/demand; rename-fuzz passes.
- Closed mesh on every printed fixture; replay-determinism hash on every saved
  fixture; P1 replays byte-identically at 202 verbs.

## Reserved to the owner, still

The crash-band source table, the acceptance-tolerance calibration (±15 mm is
ASSUMED and owner-adjustable), the starter-shelf contents, and the marked
build interpretations. None of these were decided here.
