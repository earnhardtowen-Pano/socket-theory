# INVENTORY

**Phase 0 of the kernel extraction. Read the verb count in §2, then decide.**

The plan is to split this into a kernel that knows nothing about cars and a car
module loaded into it, with the kernel born by extraction rather than design.
Before anything moves, this is what is actually here.

Everything below was read out of the source, not out of the shipped UI strings.
Where a claim is checkable by a script, a script checks it — see §8. Where the
brief's assumptions turned out to be wrong, §5 says so.

Two guards were armed before this document was written, because both were
needed for Phase 1 to have a real gate and neither existed:
`core/test/license-lint.test.ts` no longer passes while checking nothing, and
`validation/` now freezes every solved case including its attribution.

---

## §0 — How a bound is actually made

Two mechanisms, and the distinction matters for every count that follows.

**A. Scalar contributions.** `ContributionSet.contribute(quantity, kind, meta, f)`
(`core/src/graph.ts:69`) runs `f()` inside a registry read-trace and records
`{quantity, kind, value, constraint, chain}`. `bound()` (`graph.ts:99`) takes
`max` over lowers and `min` over uppers. **The winning contribution IS the
attribution** — no string is stored anywhere. Ties keep the *first registered*
(`graph.ts:105` uses strict `>`), which matters in §4.

**B. Profile segments.** `envelope.ts` and `plan.ts` push `Segment`s carrying
the same `ConstraintMeta` into a `FloorProfile` (max over covering segments) or
`CeilingProfile` (min) — `core/src/profile.ts:63–95`. These bound a *continuum*
(`z` at every `x`), not a scalar, and never appear in `bounds`/`controls`. They
surface only through `clampToEnvelope` and `scanConflicts`. **They have never
been enumerated before; they are enumerated here.**

`ConstraintMeta` is `{id, label, reason, license}` (`graph.ts:14`). There is no
`principal` field. **33 constraint identities** exist in `metas.ts` — 18 DERIVED,
15 ASSUMED, 0 SOURCED — one of which (`occupantRoof`) is a factory producing one
id per seat row.

---

## §1 — Every constraint

### 1a. The 35 scalar contribution sites

Extracted from the AST, so the arithmetic column is the code, not a paraphrase.

| # | id | license | quantity · side | arithmetic | at |
|---|---|---|---|---|---|
| 1 | `front_crush` | ASSUMED | `front_overhang` ↓ | `arch_crush_front`, plus `arch_powertrain_length / 2` when the drive unit straddles the axle | structure.ts:31 |
| 2 | `style_front_overhang` | ASSUMED | `front_overhang` ↑ | `style_front_overhang_max` | structure.ts:24 |
| 3 | `seat_band_low` | ASSUMED | `h30` ↓ | `arch_h30_min` | structure.ts:87 |
| 4 | `seat_band_high` | ASSUMED | `h30` ↑ | `arch_h30_max` | structure.ts:88 |
| 5 | `dash_over_powertrain` | DERIVED | `heel_x` ↓ | `-frontOverhang.value + arch_crush_front + arch_powertrain_length + structure_dash_offset` | structure.ts:80 |
| 6 | `footwell` | ASSUMED | `heel_x` ↓ | `arch_footwell_aft_of_axle` | structure.ts:91 |
| 7 | `wheelbase_budget` | DERIVED | `heel_x` ↑ | `style_wheelbase_max - legroomOf(h30) - coupleSumOf() - rearDemandOf()` | structure.ts:94 |
| 8 | `occupant_roof_row{N}` | DERIVED | `roof_z` ↓ | `rowRoofMinOf(...)` = `floorOf + h30 + seatedHeightOf + anthro_headroom_clearance + body_roof_stack` | occupants.ts:28 |
| 9 | `style_height` | ASSUMED | `roof_z` ↑ | `style_overall_height_max` | occupants.ts:32 |
| 10 | `dash_stack` | DERIVED | `cowl_z` ↓ | `floorOf() + structure_dash_stack` | vision.ts:23 |
| 11 | `sight_over_cowl` | DERIVED | `cowl_z` ↑ | `groundX = eye.x - vision_ground_sight; sightLineZ(eye, groundX, cowlX)` | vision.ts:26 |
| 12 | `tire_clearance` | DERIVED | `hood_z` ↓ | `2 * tireRadiusOf() + body_tire_jounce` | vision.ts:65 |
| 13 | `hood_over_powertrain` | DERIVED | `hood_z` ↓ | `powertrainTopOf() + body_hood_clearance` | vision.ts:69 |
| 14 | `sight_over_hood` | DERIVED | `hood_z` ↑ | `groundX = eye.x - eye.z*(eye.x-cowl.x)/dz; sightLineZ(eye, groundX, stationX)` | vision.ts:73 |
| 15 | `upright_glass` | ASSUMED | `header_x` ↓ | `cowl.x + glass_min_run` | windshield.ts:41 |
| 16 | `head_tangency` | DERIVED | `header_x` ↑ | `cowl.x + rise/tan(θ)`, `θ = atan2(dz,dx) + asin((anthro_head_radius + glass_head_clearance)/dist)` | windshield.ts:44 |
| 17 | `longest_glass` | ASSUMED | `header_x` ↑ | `cowl.x + glass_max_run` | windshield.ts:54 |
| 18 | `door_stack` | ASSUMED | `belt_z` ↓ | `row1HipZ + door_belt_stack` | vision.ts:88 |
| 19 | `sight_beside_driver` | DERIVED | `belt_z` ↑ | `eye.z - vision_side_drop` | vision.ts:91 |
| 20 | `rear_seat_structure` | ASSUMED | `wheelbase` ↓ | `rowHipXOf(last) + structure_hip_to_rear_axle` | chassis.ts:19 |
| 21 | `mid_engine_bay` | DERIVED | `wheelbase` ↓ | `rowHipXOf(last) + arch_bulkhead_clearance + arch_powertrain_length` | chassis.ts:24 |
| 22 | `battery_fit` | DERIVED | `wheelbase` ↓ | `arch_battery_length + 2 * arch_battery_axle_clearance` | chassis.ts:31 |
| 23 | `style_wheelbase` | ASSUMED | `wheelbase` ↑ | `style_wheelbase_max` | chassis.ts:35 |
| 24 | `wheelbase_budget` | DERIVED | `wheelbase` ↓ | `heelX + legroomOf() + coupleSumOf() + rearDemandOf()` | chassis.ts:40 |
| 25 | `rear_crush` | ASSUMED | `rear_overhang` ↓ | `arch_crush_rear` | chassis.ts:49 |
| 26 | `engine_behind_axle` | DERIVED | `rear_overhang` ↓ | `arch_powertrain_length + arch_crush_rear` | chassis.ts:53 |
| 27 | `style_rear_overhang` | ASSUMED | `rear_overhang` ↑ | `style_rear_overhang_max` | chassis.ts:57 |
| 28 | `engine_under_deck` | DERIVED | `deck_z` ↓ | `powertrainTopOf() + body_hood_clearance` | vision.ts:106 |
| 29 | `cargo_under_deck` | ASSUMED | `deck_z` ↓ | `floorOf() + cargo_deck_height` — now contributed alongside the engine floor, not instead of it | vision.ts:118 |
| 30 | `sight_over_deck` | DERIVED | `deck_z` ↑ | `groundX = eye.x + vision_rear_ground_sight; sightLineZ(eye, groundX, tailX)` | vision.ts:114 |
| 31 | `wheels_on_track` | DERIVED | `overall_width` ↓ | `chassis_track + tire_section_width + 2 * body_tire_lateral_clearance` | plan.ts:19 |
| 32 | `shoulder_room` | DERIVED | `overall_width` ↓ | `widest * anthro_shoulder_width + 2 * door_side_stack` | plan.ts:25 |
| 33 | `style_width` | ASSUMED | `overall_width` ↑ | `style_overall_width_max` | plan.ts:28 |
| 34 | `ground_clearance` | ASSUMED | `rocker_z` ↓ | `structure_ground_clearance` | structure.ts:60 |
| 35 | `cabin_floor` | DERIVED | `rocker_z` ↑ | `floorOf()` — a clearance with gap **zero** | structure.ts:63 |

Reason strings, verbatim, in `core/src/constraints/metas.ts`. They are the
module's value and are quoted rather than rewritten wherever this document
touches them.

### 1b. The 13 profile-segment sites

These bound `z(x)` over an interval. They reuse the same metas and are invisible
to `bounds`.

| meta | side | interval | form | at |
|---|---|---|---|---|
| `tire_clearance` | floor (outboard) | front axle | arc `c(0, tireR) r=tireR+jounce` | envelope.ts:56 |
| `tire_clearance` | floor (outboard) | rear axle | same at `cx = wheelbase` | envelope.ts:60 |
| `hood_over_powertrain` | floor | `frontBox.x0..x1` | `frontBox.z1 + hoodGap`, flat | envelope.ts:68 |
| `engine_under_deck` | floor | `rearBox.x0..x1` | `rearBox.z1 + hoodGap`, flat | envelope.ts:75 |
| `occupant_roof_row{N}` | floor | head arc per row | arc `r = head_radius + headroom + roof_stack` | envelope.ts:86 |
| `head_tangency` | floor | `cowl.x..headerX` | line at `tan(θ)` from the cowl | envelope.ts:100 |
| `cargo_under_deck` | floor | `wheelbase..tailX` | `floorOf() + cargo_deck_height` | envelope.ts:163 |
| `sight_over_hood` | ceiling | `bumperX..cowl.x` | sight line to the cowl | envelope.ts:118 |
| `style_height` | ceiling | `bumperX..tailX` | flat | envelope.ts:129 |
| `sight_over_deck` | ceiling | `backlightX..tailX` | sight line from the backlight | envelope.ts:143 |
| `wheels_on_track` | floor (plan) | both axles | `(track + section)/2 + lateral_clearance` | plan.ts:58 |
| `shoulder_room` | floor (plan) | heel..last hip | `(widest * shoulder_width)/2 + door_side_stack` | plan.ts:73 |
| `style_width` | ceiling (plan) | `bumperX..tailX` | `style_overall_width_max / 2` | plan.ts:81 |

---

## §2 — The verb collapse: the answer is **4**, and the number is the least of it

The hypothesis was seven verbs — `clear, contain, exclude, see, offset, band,
cap` — inferred from UI strings. Tested against the arithmetic, four distinct
operations survive.

| Verb | Arithmetic | Sites |
|---|---|---|
| **`stack`** | `Σ sign·term`, compared against a quantity with a direction | **28** |
| **`project`** | a line through two points evaluated at a third station — `(eye.z·(x−groundX))/(eye.x−groundX)`; a ratio of differences, nonlinear | **4** |
| **`tangent`** | the extreme line from a point to a disk — `atan2 + asin`; produces a *direction*, not a length | **1** |
| **`sweep`** | a floor that is a curve — `cz + √(r²−dx²)`; profile-only, no scalar form | **3+N** |

### Why five of the seven dissolve

**`offset` is `clear` with a sign.** Compare `door_stack` (`row1HipZ +
door_belt_stack`, lower) with `sight_beside_driver` (`eye.z - vision_side_drop`,
upper). Both are `datum ± scalar`. The only difference is the `kind` argument,
and `graph.ts:104` is where that becomes an inequality direction. The
`'lower' | 'upper'` field already *is* the sign. `cabin_floor` is the degenerate
proof: a clearance with gap zero.

**`contain` is `stack` where you decline to call one term a datum.** `battery_fit`
is `Σ` of a slab and two clearances; `wheels_on_track` adds a track width and a
tire width with the same `+`.

**`band` is two bounds, and the code writes it out both ways.** One meta for two
walls at `structure.ts:69–70`; two metas for the identical shape at
`structure.ts:59–65`. There is no band primitive — `bound()` just collects and
min/maxes. *(The shared-meta version is also a live UI defect: touching either
end of the h30 band prints the same label and the same reason, so you cannot
tell which wall you hit.)*

**`see` is `project`, and nothing is ever swept, cast, or intersected.**
`sightLineZ` (`vision.ts:13`) is three arithmetic ops evaluating a line at one
x. There is no occlusion test anywhere in the repository. Each sight constraint
samples that line at exactly one station. And one of the four "sight"
constraints is not a sight line at all: `sight_beside_driver` computes `eye.z -
vision_side_drop` — no ray, no ground target, no glass. It was filed under
vision by topic, not by math.

Worth noting that the constructor is used two incompatible ways: `cowl_z` uses
the **target** ground point (`eye.x - vision_ground_sight`), while `hood_z` uses
the **actual** line through the already-placed cowl. One is a demand, the other
is a consequence of a placement. Same verb, different principal.

**`cap` is not a verb — it is a missing field.** These five call shapes are
identical bare registry reads: `style_wheelbase_max`, `arch_h30_max`,
`arch_footwell_aft_of_axle`, `arch_crush_front`, `structure_ground_clearance`.
Three upper, two lower; two owner-authored, three not. What makes a cap feel
like a cap is entirely *who authored it*, and that exists nowhere in the code
except as prose inside `reason`. And even within the owner's own demands the
arithmetic splits — `longest_glass` is unmistakably a cap (*"the longest
windshield run the owner will accept"*) but its math is `cowl.x + glass_max_run`,
a datum plus a gap. `cap` does not carve the space. `principal` does.

**`exclude` has exactly one true instance, and it is not where the reasons say.**
`head_tangency` is the only constraint computing an extremal contact with a
region — tangent from a point to a circle, transcendental, yielding a direction.
The arcs are a close second and are genuinely "stay outside a disk," but note
`tire_clearance` appears in **two incompatible encodings**: an arc in the
envelope, and the scalar `2·tireRadius + jounce` on `hood_z`, which is that
arc's apex. Two forms, one identity.

### The part that matters more than the count

The collapse only holds if you also admit four things that are **not verbs** and
cannot be deleted:

- **A clamped response curve.** `legroomOf` (`chains.ts:38`) interpolates
  between two anchors with a saturating clamp. Feeds four constraints.
- **A trigonometric rotation.** `seatedHeightOf` (`chains.ts:22`) is
  `rise·cos(back) + head`. So `occupant_roof_row{N}` is not a linear stack — it
  has a cosine in it, and its reason string does not mention this. Its own
  comment calls it *"the difference between a car that can be a sports car and
  one that is always a crossover."*
- **An anonymous `Math.max`.** `rearDemandOf` (`chains.ts:110`) hides a *second
  constraint with no id, no label, no license and no reason* inside a licensed
  one, and it rides into two walls' attribution.
- **Row aggregation done two contradictory ways.** `roofBound` emits N
  contributions and lets the kernel pick, so the winning row is named;
  `widthBound` reduces *inside* the contribution, so the winning row is
  invisible.

…plus **12 architecture guards** (`if arch.powertrain === …` and friends), each
of which has to become a separately declared conditional demand:

| guard | at | effect |
|---|---|---|
| `powertrain === 'front'` | structure.ts:79 | `dash_over_powertrain` exists or not |
| `powertrain === 'mid-rear'` | chassis.ts:23 | `mid_engine_bay` exists or not |
| `powertrain === 'under-floor'` | chassis.ts:30 | `battery_fit` exists or not |
| `powertrain === 'rear'` | chassis.ts:52 | `engine_behind_axle` exists or not |
| `mid-rear \|\| rear` | vision.ts:104 | deck floor is engine **or** cargo |
| `frontBox.x0 ≤ stationX ≤ frontBox.x1` | vision.ts:68 | a *spatial* guard, different in kind |
| `!rearBox \|\| under-floor` | envelope.ts:109 | restates the deck guard a second, different way |
| `powertrain === 'mid-rear'` | chains.ts:112 | anonymous second copy of the bay guard |
| `t.impossible` / `rise ≤ 0` / `slope ≤ 0` | windshield.ts:46,48,51 | three degenerate exits, all silently collapsing `header_x` |
| `dz ≤ 0` | vision.ts:74, envelope.ts:115 | returns a value instead of reporting impossibility |
| `row1 && headerX > cowl.x` + angle checks | envelope.ts:96,98 | the tangency floor silently vanishes |
| 3-way / 2-way box branches | chassis.ts:70,75,81; structure.ts:43,49 | changes what every downstream constraint sees |

### The conclusion for the kernel

**4 verbs + 4 non-verb primitives + 12 guards.** "Seven verbs" simultaneously
*overstates* the arithmetic diversity and *understates* the guard problem.

More importantly: **the kernel atom already exists and is more general than the
proposed one.** `contribute(quantity, kind, meta, closure)` is exactly "a bound
on a named scalar, with attribution." A `Demand{verb}` enum would be a *less*
general re-encoding of what is already there. What actually varies between
constraints is the reference expression, the side, and the amount.

So the recommendation is: **do not build a verb enum into the kernel.** Keep the
contribution atom, add `principal`, and let the verbs live where they are
useful — as an authoring and reading convention in the module and the UI.

---

## §3 — The parameter split

**59 distinct parameters.** 40 global, 12 architecture, 4 seating, 3 tire.

| | count |
|---|---|
| **CAR** | **58** |
| **KERNEL** | **0** |
| **AMBIGUOUS** | **1** (`unit_in_to_mm`) |

By license: **4 SOURCED**, **55 ASSUMED**, **0 DERIVED**. 16 ASSUMED are flagged
pending, nine of which name a specific standard to settle against. Every ASSUMED
param carries a note and a range, and no default falls outside its own range —
convention holds, though nothing enforces it.

**The headline: there is no kernel parameter table.** The registry is a
car-parameter registry in practice, and the kernel owes it nothing. `data/`
moves wholesale into the car module with one id to negotiate. That is a much
cleaner split than the file layout suggests.

The four SOURCED params are `unit_in_to_mm` and the three tire params. Which
means **every constraint tagged DERIVED derives from numbers that are guesses.**
That is honest at the parameter level, where the ledger shows it, and invisible
at the wall level, where the UI prints "DERIVED."

### Genuinely ambiguous — not called here

**`unit_in_to_mm`.** It is the only param with a real external citation
(*"International yard and pound agreement (1959): 1 inch = 25.4 mm exactly"*),
and the citation is about measurement, not cars. But both its consumers use it
for exactly one thing: converting a tire rim diameter out of the inch-based part
of the ISO tire code. Kernel-side, it becomes a unit-conversion table with one
entry. Car-side, a second module needing inches must redeclare it — and
`Registry.define()` throws on duplicate ids, so **loading both modules would
crash.** That last argument is the only one that bites at runtime, and it points
to kernel.

**The `style_*` family (5).** The values are unarguably car; 1700mm of height
means nothing to a spoon. But the *mechanism* is the most reusable idea in the
file: an owner-declared ceiling on a derived quantity, tagged ASSUMED so it stays
movable, whose whole purpose is to make the solver report a conflict naming what
pushed back. Kernel concept, car instances.

**`anthro_h30_anchor_low` / `_high`.** Not measurements of a human being. They are
the two x-coordinates of an interpolation whose y-coordinates are two other
params. Their notes give them away — both say "used to interpolate," a statement
about the solver, not about a person.

**`seat_h30_step`.** "Theater step per row" is a general facility-layout idea —
cinemas, lecture halls, stadiums. Car only because "H30" is the SAE name and
25mm is car-scaled.

### Misfilings, verified rather than assumed from prefix

- **`seat_back_angle_deg` is misfiled.** It carries the `seat_*` prefix but sits
  in the anthropometrics block, and every other `seat_*` param lives in
  `seating.ts` and is about row layout. It is consumed by `seatedHeightOf`
  alongside two `anthro_*` values. The prefix currently means two unrelated
  things.
- **`body_roof_stack`** is the last entry under "occupant chain" but is pure body
  structure.
- **`glass_backlight_aft_of_last_hip`** sits under "vision" while the glass block
  starts 18 lines later.
- **`tire_rim_in` is declared `unit: 'ratio'` but holds inches.** The `Unit` enum
  has no inch member, so `'ratio'` was used as a dumping ground. Corroborating
  leak: `Readout.unit` is typed bare `string`, which is why `solve.ts:205` can
  emit `'in'` at all.
- **The presumed `sight_*` prefix has zero parameters.** It exists only as
  constraint ids. Do not carry it into the taxonomy.
- **Prefixes not in the presumed list:** `door_*` (2), `body_*` (4), `cargo_*`
  (1), `chassis_*` (1), `unit_*` (1).
- **`Unit` members `'count'` and `'mm/s'` are declared and never used.** A speed
  unit with no consumer — dead kernel surface with a domain flavour.

### Resolver knobs — ASSUMED values that exist to close the solver, not to describe the world

Ranked by how explicit the code is:

1. **`glass_max_run`** — its note states the purpose outright: *"a cap when head
   tangency alone would allow near-flat glass."* A pure degeneracy guard; there
   is no physical maximum windshield length in the world.
2. **`glass_min_run`** — *"most upright glass the studio will accept"*
3. **All five `style_*`** — self-declared: *"a stance target, not physics"*
4. **`vision_ground_sight` / `vision_rear_ground_sight`** — *"Smaller is stricter
   and pushes the cowl down"* describes a dial, not a regulation. Real
   forward-vision rules exist (FMVSS 111, UNECE R125) and are not cited.
5. **`arch_h30_min` / `_max`** — these *are* the band; they define the search
   space rather than describe hardware.
6. **`anthro_h30_anchor_low` / `_high`** — interpolation scaffolding.
7. **`anthro_headroom_clearance`** — "living room above the head," no standard
   named.
8. **`cargo_deck_height`** — "usable trunk depth *demanded*." A want.

### Non-parameter data

**Architecture presets.** The header comment claims *"Powertrain placement is
data, not machinery."* It overclaims: `powertrain` is a discriminated tag that
machinery switches on in five files, and `arch_battery_thickness` /
`arch_bulkhead_clearance` exist only on some presets — so the tag and the param
set are two encodings of the same fact, and a disagreement between them would
throw `Unlicensed read`. As module data this becomes an explicit list of named
**masses**, each with extent params, an anchor relation, and clearance params.
Then `chains.ts` stops asking "is this an EV?" and starts asking "does this
variant declare a mass anchored under the occupant datum?"

**Seating layouts.** The most nearly-generic data in the package: strip "seat,"
"H-point," and "H30" and what remains is *an ordered chain of repeated elements,
each declaring a multiplicity and two axis offsets by param id.* Two choices here
are already kernel-grade and must survive the split: rows reference params **by
id string, not by value** (which is what keeps reads inside the trace), and each
config carries its own `params` array. Note the current shape hardcodes exactly
two axes; a generic version needs a keyed record.

**The tire table** is the most car-specific thing here and contains the sharpest
kernel idea in the codebase, stated in its own header: *"The designation string
is itself the source… Parsing the string is reading the source, so the parsed
values are SOURCED to the designation."* That is a generic notion of a
**self-certifying catalog entry** — a standardized identifier where parsing
constitutes citation. Any module with a part-number grammar (lumber, screw
threads, wire gauge, pipe schedules) gets legitimate SOURCED params for free.
The companion rule is equally kernel: *the catalog states only what the code
literally states; everything else is DERIVED downstream* — which is why overall
diameter is not in the table. *(Minor hazard, independent of the split: that
diameter arithmetic is duplicated at `constraints/tires.ts:16` and
`chains.ts:99`.)*

---

## §4 — Defects found, and what happened to them

Phase 0 found nine and fixed none — reporting was the job, and the golden
snapshot existed to prove that phase changed no behaviour. The remaster then
closed eight of them. Each entry below states what was wrong and, where it has
been dealt with, what closed it. The golden file was regenerated deliberately
at that point, so the behaviour changes below are recorded rather than silent.

### 1. Attribution truncated at every stage boundary — **FIXED**

**This is the most serious finding in the document**, and the severance canary
in `validation/test/golden.test.ts` found it on its first run.

`DECISIONS.md#6` states the invariant: chains must re-read the registry *inside*
the contribution trace, because passing a precomputed number in severs the chain
and "the wall forgets why it stands where it does." But `solve()` is a pipeline
that hands computed values (`eye`, `cowl`, `frontBox`, placed controls) between
stages as plain numbers. So the chain captures only *direct* registry reads and
loses everything upstream.

Measured, for the default FR car:

| wall | winning constraint | chain |
|---|---|---|
| `hood_z` ↑ | `sight_over_hood` | **(empty)** |
| `cowl_z` ↑ | `sight_over_cowl` | `vision_ground_sight` — and nothing about the eye that defines the sight line |
| `deck_z` ↑ | `sight_over_deck` | `vision_rear_ground_sight` only |
| `belt_z` ↑ | `sight_beside_driver` | `vision_side_drop` only |
| `header_x` ↑ | `head_tangency` | `anthro_head_radius`, `glass_head_clearance` — nothing about where the cowl or head actually are |

`sight_over_hood` computes entirely from `eye` and `cowl` and reads the registry
**zero times**, in all 25 configurations. Empty chain → empty `assumedKnobs` →
**a hood conflict reports no resolvers at all.** The user is told two walls
collide and offered nothing to move. The others are not empty but are
incomplete: a cowl conflict says "loosen `vision_ground_sight`" and never
mentions that raising the seat would work too.

Since `assumedKnobs` is exactly "the things you are permitted to move" — a
mechanical consequence of the license taxonomy, and the best idea in the design
— this quietly hollowed out the product's core promise.

**Closed by `Registry.publish` / `Registry.inherit`.** A placed control or a
derived readout now publishes the params behind it, and a constraint that
consumes one calls `inherit` inside its own trace, so the provenance carries
forward instead of being dropped at the handoff. `hood_z`'s ceiling went from
naming **zero** knobs to naming **24**; `cowl_z` from 1 to 23; `header_x` from
2 to 28. A hood conflict can now tell you that raising the seat is an option.
`inherit` throws on a quantity that has not been solved yet, so a stage-order
mistake fails loudly rather than producing a short chain.

### 2. Attribution decided by source-line order — **FIXED**

`wheelbase_budget` is mathematically ≥ `rear_seat_structure` **always**: expand
`rowHipXOf(last)` and both are `heelX + legroom + coupleSum + …`, where
`rearDemandOf` starts at `structure_hip_to_rear_axle` and only ever maxes upward.
They are exactly **equal** for every non-mid-rear car. `graph.ts:105` uses strict
`>`, so ties keep the earliest registration — and the wheelbase floor is
attributed to whichever function happens to be called first.

Law 3 says attribution is computed, never narrated. Here it is neither: it is
incidental. Verified directly — hoisting one `contribute()` call above another,
with every number identical, changes the reported author on 40 assertions.

The comment at `chassis.ts:38` calls the budget a safety net; it is in fact a
strict superset, and `mid_engine_bay` can never strictly win either.

### 3. A licensed demand that was not enforced — **FIXED**

`front_crush`'s reason: *"crush length has to fit between the bumper and the
first hard mass"* Its math is `front_overhang ≥ arch_crush_front` — **no hard
mass appears.** For a front-engine car the box is *constructed* at that offset
(`structure.ts:46`), so the constraint is tautological. For the EV the box sits
centred on the axle, unrelated to the crush zone: with EV defaults the real
bumper-to-drive-unit gap at minimum overhang is **340mm against a stated 520mm.**

**Closed by making the floor account for where the mass actually sits.** For a
front layout the box is built at bumper-plus-crush, so the gap is true by
construction; for the skateboard the crush floor now adds the half drive-unit
that straddles the axle. The reason and the arithmetic finally agree.

### 4. A license leak — **FIXED**

`wheelbase_budget` is tagged `DERIVED` while its `heel_x` form reads
`style_wheelbase_max` — an ASSUMED owner preference. A wall printing "DERIVED"
whose position is set by taste. Its reason was also the vaguest in the file —
it said only that "everything" aft of the heel had to fit, and "everything" is
exactly where the anonymous `Math.max` of §2 hides.

**Closed by giving the heel ceiling its own identity.** It is now
`heel_under_wheelbase_cap`, tagged ASSUMED because it stands on the owner's cap,
with a reason that says so. `wheelbase_budget` keeps the DERIVED tag for the
chassis use, which is pure geometry, and its reason now names the three things
it sums instead of saying "everything".

### 5. The scalar bound and the drawn envelope disagreed — **FIXED**

For `under-floor`, `deckBound` takes the cargo branch and ignores the rear drive
unit, while `buildEnvelope` pushes an `engine_under_deck` floor segment for that
same box *and* a cargo segment over an overlapping span. The slider and the
drawing enforced different things for the same architecture.

**Closed by contributing both demands rather than choosing between them.** The
engine floor and the cargo floor are independent and both real — the deck clears
whichever is higher — so `deckBound` now emits each under exactly the conditions
the envelope uses.

### 6. Thirteen unlicensed constants determined the car you see on load — **FIXED**

`DEFAULT_CONTROLS` (`solve.ts:42–56`) is thirteen bare fractions. They escape the
license lint entirely, because it walks only `core/src/constraints/` and
`solve.ts` sits one directory above its scan root. `eps = span * 1e-3`
(`graph.ts:175`), the wall-touch tolerance, is the same category — and is
squarely the "generic tolerance = kernel" case.

### 7. The Law 4 guard could pass while checking almost nothing — **fixed**

The lint hardcoded one directory, read it non-recursively, and guarded only with
`expect(files.length).toBeGreaterThan(5)`. A **total** move would have been
caught (0 > 5 fails). The real holes were **partial** moves — leave six of eleven
files and it stays green while five go unchecked — and **subdirectories**, which
the non-recursive read never saw at all.

Now: scan roots are a list, the walk is recursive, and a manifest is checked both
ways. Verified by planting a literal, adding an unlisted file, and moving the
directory away.

Related: **`DECISIONS.md#4` and the code disagree.** The decision log claims the
allowlist contains `-1`; it does not. `-1` passes because it parses as a unary
minus on the literal `1`. The code is right by accident.

### 8. The feature built to prove the model violates Law 3 — **the one still open**

`app/src/model/features/wheelOpening.ts:105–115` recomputes the tire wall with
its own bare constants — `jounce * 0.15`, and a `ctx.value('body_tire_jounce', 70)`
fallback that bypasses the registry's unlicensed-read guard — then looks up
`tire_clearance` **by hardcoded string id** and borrows its `ConstraintMeta` to
narrate the clamp. It never calls `clampToEnvelope`. If the kernel's rule
changed, this would clamp at the old value while still printing the kernel's name
and reason. Its `defaults` block is bare unlicensed constants too. Same pattern
at `lines.ts:224` and `lines.ts:234`.

That is precisely the narrated attribution the whole design exists to prevent,
in the one place the model was supposed to prove itself — and it is the
strongest available argument that a module API must make *asking* the kernel
easier than reimplementing it.

### 9. `pending` meant two different things — **FIXED**

`{license: 'SOURCED', pending: true}` with no source passes `define()` cleanly —
the error message advertises the escape hatch. On ASSUMED, `pending` means "we
intend to source this eventually." One flag, two contracts, one documented.
Currently unexploited, but it is the gap that could hollow out the SOURCED tag
over time, and it is a two-word fix.

**On what the license system does and does not guarantee.** It rigorously
enforces that every number reaching constraint code came through the registry,
that every entry carries a license, that only ASSUMED is editable, and that
SOURCED entries have a non-empty source string. It cannot enforce that a source
is real, that a source supports its value, or that any value respects its own
range. `source: 'trust me'` passes. That is a fair boundary for a provenance
ledger — but it is a ledger, not a verifier, and the README should say so.

---

## §5 — Honest holes

**There is no 12-car validation set.** Zero named vehicles, zero measured
dimensions, zero round-trip harness anywhere in this repository. It exists only
as unchecked TODO boxes in `PLAN.md` Phase G. `data/test/solve.test.ts:6` says it
plainly: *"These are behavior tests of the machine, not of any one car."*
**Nothing here has ever been checked against a real vehicle.** Any brief that
assumes otherwise is wrong, and this is the most consequential correction in the
document.

The golden snapshot added in this phase is **not** that validation. It freezes
today's behaviour so a refactor cannot change it silently. A green snapshot means
"unchanged," never "correct." The benchmark against sourced real-world dimensions
remains a separate task and is still owed.

**`geometry/` is an empty scaffold** — package.json and tsconfig, no source.
`validation/` was too, until this phase.

**`principal` does not exist.** Seven of 33 constraints name their author, in
prose inside `reason` — the five `style_*` and the two glass runs. That is the
entire principal system and it is not machine-readable. Every anthropometric
demand and both safety demands have no principal at all; the standards that
would author them (SAE J833, J941, J1052, J1100, J1516/J1517, FMVSS/NCAP) appear
only in `note:` fields of ASSUMED params, all pending.

Filling those principals with citations that have not been verified would be
fabrication — the exact failure this system exists to prevent. They will be
filled as pending, and `OPEN_QUESTIONS.md#2` already stands.

---

## §6 — What the kernel would be, named from the extraction

Roughly **530 lines of kernel** against **~1,290 lines of car**. Of the kernel,
the four files carrying the actual contract — `graph.ts`, `profile.ts`,
`registry.ts`, `derived.ts`, 444 lines — have **zero** car-specific identifiers.
`profile.ts`, `license.ts` and `derived.ts` contain no car noun at all;
`graph.ts`, `units.ts` and `registry.ts` have four hits between them, all in
comments.

**Kernel:** `registry.ts` (verified clean — no `/data` import, no id-pattern
matching, no numeric literals, every error string domain-neutral), `graph.ts`,
`profile.ts`, `derived.ts`, `license.ts`, `units.ts`.

**Car module:** `constraints/` (11 files, 100% car — relocation, not triage),
`solve.ts`, `inputs.ts`, `SideGeometry`, and all of `data/`.

Two pieces of positive evidence the abstraction really is neutral: `plan.ts`
already reuses `FloorProfile` with `z` meaning half-width `y`, unmodified; and
`core/test/graph.test.ts` already runs the whole contribution and conflict
machinery on fixtures named `knob_a` and `wall_b`.

Also confirmed: **the solver never optimizes.** No `while` loop exists anywhere
in `core/src`; all 17 loops enumerate fixed collections. No bisection, no
convergence check, no objective function. It closes bounds and halts, as
specified.

### The three seams

1. **`ControlId`** (`inputs.ts:32`) — a closed 13-member union of car words,
   baked into `SolveResult` as `Record<ControlId, Bound>` and threaded out to
   the UI sliders. The hardest cut.
2. **`SideGeometry`** (`solve.ts:58`) — 18 car fields inside the supposedly
   generic result type. Nothing in the kernel depends on it, so it moves cheaply
   now and expensively later. Move it first.
3. **`Ctx`** (`constraints/ctx.ts:11`) hands every constraint `arch` and
   `seating` directly, so all 14 `powertrain` branches have ambient access to
   car-shaped config. Needs an opaque module-config slot.

### Two assumptions that are arithmetic, not naming

- **`z = 0` is the ground.** The similar-triangles form at `vision.ts:14` is
  only correct if it is. Renaming will not move it.
- **`x = 0` is the front axle centreline**, relied on in four files and leaking
  into the app.
- *(And a smaller one: `Segment`'s arc is upper-half only — `profile.ts:56`
  returns `cz + √…`. A downward bulge is inexpressible.)*

### On `FeatureDef` as a prototype for module registration

`app/src/model/feature.ts` gets the **shape** right and should be the starting
point: self-describing `ParamSpec` params so the UI builds itself,
generate-with-context so a module reads the solve without writing to it, a narrow
read port, and structured `binding` feedback that reuses `ConstraintMeta`
unchanged.

What must change: `FeatureKind` is a **closed union**, so a module cannot add a
kind without editing core — the same disease as `ControlId`, and fatal for a
plugin API. `ParamSpec` and `ParamDef` are two parallel, incompatible parameter
vocabularies, which is why feature defaults are unlicensed constants; they must
be unified so features inherit licensing. And it has exactly one implementation,
registered through an `as unknown as FeatureDef` double cast — the generic
parameter does not survive the registry, so the type-safety story already broke
at n = 1.

---

## §7 — The hard problem: `solve.ts` is an ordered script, and the order is car knowledge

Constraints are **not registered**. `solve.ts:118–183` is a literal sequence of
imperative statements against 12 named imports, annotated `// 1 —` through
`// 10 —`. There is no list, no dependency declaration, no ordering metadata. The
dependency order exists *only as the order the lines are written in*.

The parameter layer already has the architecture the constraint layer lacks:
`defineAll(input.architecture.params)` ingests `ParamDef[]` from `/data` with no
compiled-in knowledge. And the asymmetry inside `contribute` is encouraging —
three of its four arguments are already plain data, and `metas.ts` is 209 lines
of pure declaration with zero behaviour. **Only the thunk is code.**

**Why the obvious fix is forbidden.** Constraints cannot become data that carries
precomputed numbers, because `DECISIONS.md#6` requires every read to happen
inside the trace. §4.1 shows what happens when that slips: the wall stops being
able to say why it stands there. So any scheme must guarantee lazy, in-trace
evaluation.

That leaves two options:

**(a) An expression AST the kernel evaluates in-trace.** Fully declarative. But
sufficient coverage for the existing chains needs arithmetic, `cos`/`sin`/
`atan2`/`hypot`/`asin`/`tan`, `min`/`max`/`clamp`, conditionals on a
discriminant, iteration over a config-supplied collection, and indirect param
lookup by string. At that point you have written a small interpreter.

**(b) Registered thunks — data-shaped registration, code-shaped bodies.**
`{quantity, kind, meta, reads: [...], when: guard, compute: thunk}`.

**Recommendation: (b).** The kernel never needs to *inspect* a constraint's body,
only to run it inside a trace and know what it depends on. Thunks buy ~90% of the
benefit at ~10% of the cost, and they keep the trigonometry and the response
curve expressible without inventing a language for them.

**And ordering comes free.** `registry.beginTrace()` already records which
*parameters* a contribution reads. Extended to record which *placed quantities*
it reads, the dependency graph falls out of the same mechanism, and the kernel
can topologically sort instead of being handed an order. That would also fix
§4.1 — if a placed quantity is read through the trace rather than captured as a
number, the chain stops truncating. **The severance bug and the ordering problem
are the same problem, and one mechanism closes both.**

Two things a constraint list does not cover and which still need a home: readouts
(`out.derive`), and the **intermediate solved objects** — `frontPowertrainBox`,
`batterySlab`, `placeOccupants` return `Box`/`OccupantRow[]`, which are neither
bounds nor readouts, are threaded by hand between stages, and end up in
`SideGeometry`. There is no kernel concept for a module-supplied intermediate
today, and there needs to be.

---

## §8 — How the claims here were checked

- The 35 contribution sites were extracted from the TypeScript AST, so the
  arithmetic column is the code, not a transcription.
- The parameter counts come from loading the real data package and tallying:
  59 distinct, 4 SOURCED, 55 ASSUMED, 0 DERIVED, 16 pending, 0 derivations, and
  no default outside its declared range.
- The 33 metas were counted in `metas.ts` and cross-checked against the sites.
- The attribution chains in §4.1 are read out of the generated `golden.json`,
  not inferred.
- The tie-order defect (§4.2) was reproduced by hoisting one `contribute()` call
  and observing 40 assertions change author with every number identical.
- The lint's three failure modes (§4.7) were each triggered deliberately.
- `pnpm run typecheck` and `pnpm test` are green: **269 tests**.

Nothing in this phase changed a constraint, a parameter, or any solver
behaviour — which the golden snapshot proves, and which is the point.
