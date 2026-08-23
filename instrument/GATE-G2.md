# Gate G2 — the chassis solve, on a real car

Evidence bundle, tagged `gate/g2`. Charge §13: "G2 — chassis solve with the
type library on one real car." The car is PANORAMIC P1: front-mid inline-six,
rear drive, two-door coupe. Everything below is checkable at this commit.

## Demonstrated

- **The assembly layer** (`packages/types/src/assemble.ts`) composes the type
  entries into a `SolveInput`: fifteen parts, twelve mates, the substrate's
  reinforced members, and the brief's world demands. Datums are pinned (the
  substrate and the two axle lines); everything else reaches its place through
  the mate chain, so moving a datum moves the car. Every offset is arithmetic
  from a stated desired origin — no bare numbers live in that file, which is
  the no-bare-constants law doing its job.
- **Blindness survives the real car.** `@car/pack` still imports only
  schema/num/demand; the CI import rule and the hostile rename-fuzz both pass.
  The solver placed a front-mid six, a manual gearbox, a propshaft, a rack, a
  radiator, a tank and two axles without ever knowing what any of them were.
- **The solve found real design errors, and they were fixed.** In order:
  the block sat on the front axle (setback 210 → 430 mm, which is what makes
  it front-*mid*); the rack fouled the sump of a longitudinal six (moved
  ahead of the axle line); the tank sat on the propshaft (raised 135 mm and
  moved forward); the radiator and the driver's heel reached into the ground
  slab (raised). Each correction is recorded in the P1's own ASSUMED notes.
- **Three seam bugs found and corrected**, all the same shape — a demand whose
  *reason* said keep-out while its *kind* said keep-in:
  1. the brief's ground clearance was a `band` (clamp the part INTO 0–110 mm,
     which would have dragged the whole car to the ground) — now a
     protected zone, and scoped as a body readback because a world keep-out
     cannot express the demand's own exemption for unsprung mass;
  2. the substrate's crush strokes were `clearance` demands, so the solver
     inflated the rail envelope isotropically by 600 mm and ignored the
     correctly-placed box — now protected zones;
  3. the axle's part envelope claimed tire radius + travel across the whole
     track, double-counting the wheels and making the axle a solid slab that
     nothing mounted between the wheels could clear — now hardware only.
- **The car exists as a document**: 46 verbs of history, replayed
  byte-identically, rendered watertight, exported to STL, and openable in the
  instrument from the P1 button.

## Numbers at this commit

```

--- package ---
solve closed               false
placed parts               15
hard points                84
clamps                     0
violations                 48

--- mass ledger ---
total                      972.7 kg (target 1450 kg)
gap to target              -477.3 kg
CG                         1188, 9, 508
axle loads F/R             518 / 455 kg
ASSUMED outstanding        16

wrote cars/panoramic-p1.car.json and panoramic-p1.stl
```

466 + 6 tests green across 40 files; typecheck strict-clean; honesty lints
green.

## Declared, not buried

- **48 residual solve violations**, all one class: bounding-box coarseness.
  A single box per part cannot be hollow, so an axle's hardware box contains
  the space between the wheels where an engine and a rack legitimately sit,
  and the tank's regulated zone overlaps the propshaft that passes beneath it
  and the occupant envelope ahead of it. These are modeling resolution, not
  layout errors — v1 says so rather than tuning numbers until the report
  reads clean.
- **Mass ledger reads 973 kg against a 1450 kg target.** That gap is honest:
  it is the modeled powertrain and chassis only. Body-in-white, glass, trim,
  interior and fluids are not parts in the v1 library, so they weigh nothing.
  The ledger reports what exists, not what would be reassuring.
- Ground clearance passes as a body readback: lowest authored surface 140 mm
  against the brief's 110 mm.
- Regulatory demands are carried and surfaced, not enforced: they govern
  lamps, bumper beams and glass, which v1 does not model as parts.
- Suspension kinematics beyond travel stay out (charge §14). Flow solve stays
  out (P3) — the P1's surfaces are taut and creased, not Class-A.
