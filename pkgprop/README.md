# PKG→PROP

A package-first car design instrument. The solver closes constraints and
draws the buildable space; the human draws the car on top of it. The solver
never draws the car.

## What stands at Gate 1

- **/core** — pure TypeScript solver. A parameter registry where every number
  carries a license (`DERIVED` / `SOURCED` / `ASSUMED`), a constraint graph
  where every bound is a computed attribution (the winning contribution IS
  the wall's name, license, and reason), conflicts that name both sides and
  the ASSUMED knobs that can resolve them.
- **/data** — the spine. Five architectures (FR, front-transverse, MR, RR,
  EV skateboard), five seat counts (1, 2, 2+2, 4-5, three rows), tire specs
  parsed from their designations, anthropometrics as flagged ASSUMED values
  pending real sources.
- **/app** — the instrument. PACKAGE controls as fractions of live bounds;
  SIDE and PLAN views with the envelope dashed behind the authored lines;
  control points clamped live, walls naming themselves on contact; the
  LEDGER one keystroke away with ASSUMED values editable in place; conflict
  chips; undo; save/load of one human-readable project JSON.

## What does not exist yet

SECTIONS, BODY (loft + zebra), the two verbs (shutline, inset), and BOUNCE
(watertight check, print report, 3MF/STL/glTF) arrive at gates 2 and 3.
**Class-A surfacing is explicitly out of scope for V1.** The loft will target
G1 continuity and honest fairness under a zebra shader, nothing more.

## Run it

```bash
cd pkgprop
pnpm install
pnpm dev        # the instrument, on :5173
pnpm test       # core + data suites, including the license lint
pnpm --filter @pkgprop/app e2e   # Playwright, including the ten-minute test
```

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
