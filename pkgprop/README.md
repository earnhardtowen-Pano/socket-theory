# PKG→PROP

A package-first car design instrument. The solver closes constraints and
draws the buildable space; the human draws the car on top of it. The solver
never draws the car.

## What stands

- **/core** — pure TypeScript solver. A parameter registry where every number
  carries a license (`DERIVED` / `SOURCED` / `ASSUMED`), a constraint graph
  where every bound is a computed attribution (the winning contribution IS
  the wall's name, license, and reason), conflicts that name both sides and
  the ASSUMED knobs that can resolve them.
- **/data** — the spine. Five architectures (FR, front-transverse, MR, RR,
  EV skateboard), five seat counts (1, 2, 2+2, 4-5, three rows), tire specs
  parsed from their designations, three body styles measured against real
  bands, anthropometrics as flagged ASSUMED values pending real sources.
- **/geometry** — cubic B-splines, the section, and the two-volume loft. The
  body runs rocker to belt and the greenhouse belt to roof; both are
  watertight. A wheel opening is the body's lower edge riding up over the
  wheel, so an arch is cut without CSG and the well has a floor.
- **/validation** — the golden net. Every architecture × seating × tire
  combination freezes its full solved output *including the winning
  constraint id*, so a refactor that preserves every number but changes which
  constraint wins still fails. Plus a CI check that INVENTORY.md's file:line
  references and verbatim quotes still resolve.
- **/app** — the instrument. PACKAGE, SIDE, SECTIONS and BODY. Every value is
  scrubbed, not slid: drag anywhere on the row, shift for fine, alt for
  coarse, click to type an exact number, arrows nudge, Home and End land on
  the walls. Parts — character lines, body cuts, wings, splitters — are added
  and removed and reach the surface as a displacement field. BODY renders in
  a procedural stripe-light studio with clay, paint, zebra and curvature.

## What does not exist yet

BOUNCE — watertight check, print report, 3MF/STL/glTF. **Class-A surfacing is
explicitly out of scope for V1.** The loft targets G1 continuity and honest
fairness under a zebra shader, nothing more. The greenhouse is still a single
lofted volume: it has no A-pillar, no DLO, no C-pillar.

## Run it

```bash
cd pkgprop
pnpm install
pnpm dev        # the instrument, on :5173
pnpm ci         # typecheck + 299 unit tests, including the license lint
pnpm --filter @pkgprop/app e2e   # Playwright, including the ten-minute test
```

## Hand it to someone

```bash
pnpm build      # -> app/dist/index.html
```

One file, no assets directory, nothing to serve. The stylesheet and the
bundle are inlined, so it opens straight off a download over `file://` —
which is the point, because a designer should not have to run a server to
look at a car. An ES module fetched from disk is a cross-origin request and
would be blocked; an inline module script has nothing to fetch.

## The law this code lives under

1. Licensed demands only — the solver closes constraints and halts.
2. The solver never draws the car; the human draws the car on the solver.
3. Every bound can report the constraint binding it — computed, never narrated.
4. Every number carries a license tag; the license lint fails the build on
   bare constants in constraint code.
5. The H-point stays; inheritance goes. Published packaging tables are
   validation targets, never the data spine.
6. Exports are handoffs; the bounce is part of the instrument.
7. Plain words everywhere.
