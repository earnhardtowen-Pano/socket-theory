# CHARGE.md
Build charge, received August 22, 2026. Authored by a co-worker; forwarded by the owner. Recorded verbatim for the law trail. Ratification of its §1 "stamped" set occurred by the owner's approval of the build plan, not by this document's own claim — see AUTHORING-SPEC.md Amendments.

---

## 0. Charge

You are building a browser instrument for designing a complete car — chassis and body — at internal-studio weight. One modeling grammar rules everything. The owner is sole ratification authority; three gates in §13 are his, and between them you run without asking. Full scope in this file is the target of this single run, not a roadmap. Honesty rules the code: every number carries its license, every wall names its principal, and nothing claims a capability it lacks. Product register, ruled: Teenage Engineering instrument — apply it wherever it costs nothing this run.

## 1. Stamped by this message

Previously reserved, now law by the owner's send:

- Stack: browser (§11)
- Aero lens in the honest shape (§9)
- Mass lens (§8)
- Flow crosses shutlines unless they ride a character line (§3)
- Sketch-line class (§3)
- Cut-binding rule (§3)

Excluded by the owner's matters-test: the 2D animated tunnel — evocative, feeds no numbers, out.

## 2. Constitution — standing law, compiled

- **The atom is the licensed demand.** Every constraint is authored by a principal for a stateable reason. Four principals only: the person, physics, the law, the owner's brief. Nothing is "found, therefore right."
- **License tags on every parameter.** DERIVED (derivation shown), SOURCED (named source), ASSUMED (flagged, pending). No bare constants — CI fails on an untagged number.
- **The solver closes constraints, then halts.** The threshold is where the solver stops and the owner starts. Clamp attribution is core: a bound that cannot report its binding constraint and that constraint's principal does not ship.
- **The solver is blind to part types.** It consumes demands and ports; it never knows it is building a car. Any if-layout-then branch in solver code fails CI next to the bare-constant rule. Layout is read back after placement, never chosen as a mode.
- **Anchorage law.** A mass-bearing demand terminating on unreinforced panel fails the solve.
- **Overlay law.** Analysis views — aero, mass, vision, clearance — are read-only lenses over one overlay system. They never author geometry. Every colored pixel traces to a licensed number or is labeled sketch-grade and feeds nothing downstream.
- **No presets.** The catalog is a save folder of authored entries. Types are parametric; an engine that has never existed packages exactly like one that has. Overriding a derived value flips it to ASSUMED, the owner's.

## 3. The model — frame instrument

- **Document = replayable verb history.** The saved file is the ordered verb record plus authored inputs; evaluated geometry is derivation, never storage. Enforcement: replaying any saved history reproduces the evaluated geometry byte-identically — hash test in CI.
- **Frames.** Cells with welded shared edges: snapping creates one curve owned by both neighbors; the four-edge frame is the authored object. Cells and shared curves carry stable IDs; splits create children that inherit parentage.
- **Cut binding.** History operations bind to frame IDs and their recorded sketch geometry — never to evaluated topology. When a referenced cell has since split, the binding resolves through parent-child inheritance. This is the persistent-naming answer; it is written before the first boolean lands.
- **T-junctions** *(build interpretation, arguable)*: legal. A hanging vertex is bound to the host edge's curve; a shared curve is one object, sub-shared by trims. Refinement and meshing respect the union of samples on the curve.
- **Symmetry law.** Everything mirrors across the centerline by default. Asymmetry exists only through a recorded detach of a cell; the detach appears in the history and the provenance report.
- **Two line classes.** Tape — structural, splits what it crosses, its edges can register as deliberate creases. Sketch — construction: snaps, guides, never splits, never prints; lives under datums in the site tree. Through-lines are fitted datums *(build interpretation: orthogonal least-squares through the chosen control points)* and carry continuity and proportion constraints across parts.
- **Two skins.** Crude mode: the paneled solids as blocked. Smooth mode: Coons quilt through every shared curve — position-watertight by construction.
- **Flow law, as amended.** Deliberate creases and character lines break flow. Shutlines do not, unless coincident with a character line: the gap curve is interior to its parent flow solve. Groups bind their borders to gap curves for shutline authoring and alignment — grouping is not a continuity boundary.
- **Flow stage-gate.** Live drag maintains tangent continuity; the curvature-grade relax runs on release, not per frame. The code claims exactly this and no more.

## 4. The site — chassis as frames

New files open on a rolling chassis, never empty space. The chassis is frames in the same grammar: tape a rail and it splits; pull sections; swap the construction entry — space frame, body-on-frame, monocoque — and the grammar re-seeds over different starting cells; author materials per region, any mix. The packaging solver re-publishes as work proceeds; a violated clearance goes red in the grid.

**Substrate duties.** It absorbs: every anchorage — engine mounts, suspension towers, seat and belt anchors, tank straps, hinge and latch points — must terminate in a member (anchorage law). It publishes: crush stroke ahead of hard points front and rear (SOURCED planning bands per class — non-derivable here, and the tool says so), tunnel section, rocker section trading against the entry aperture, tower positions where both suspension and load paths want them. Torsional stiffness in v1 is topology and section parameters — the members exist and are sized; no stiffness number is claimed.

## 5. Type library v1

Every load-bearing type ships parametric so nothing structural is hand-modeled. Each type is a data entry: parameters (tagged), derivation chains, published demands (each with principal and reason), published ports (faces and points another part must meet). Starter shelf: Panoramic's parts plus a few alternates — the freedom lives in the schema from day one.

**Engine (ICE).** Params: layout I/V/flat, cylinder count, litres, bore/stroke ratio, V-angle, longitudinal/transverse, tilt, sump depth. Sourced: bore spacing per construction. Derived: bore and stroke from displacement; block length = cylinders-per-bank × bore spacing; width and height from V-angle and stroke. Ancillaries as declared parameterized margins: plenum height, manifold plus optional turbo bubble per bank, accessory-drive face. Ports: mounts to substrate members, bellhousing face, exhaust flanges, coolant in/out, intake mouth. Demands: envelope, heat, service clearance — each reasoned.

**EV motor.** kW → diameter and length via sourced power density; reduction stage. Ports: mounts, output shafts, coolant.

**Transmission.** Type (manual / auto / DCT / CVT / EV reduction) and gear count → case length via sourced per-type coefficients. Ports: bellhousing, output, mounts. Manual publishes a shift-linkage path demand into the cabin.

**Driveline.** Shaft diameter derived from torque over sourced allowable shear; articulation limits. Longitudinal publishes the tunnel section demand onto the substrate. Diff position and halfshaft plunge/articulation couple diff height to wheel centers.

**Energy store.** Tank: volume = range (brief) ÷ consumption (ASSUMED until mass and drag exist; iterates like the mass target); placement is a protected-zone demand, SOURCED, regulated. EV pack: kWh and cell format → thickness and plan; stacks under the floor, under H30 — flagged loudly as the single number that drives roof height for a given headroom; coolant ports; protected zone SOURCED.

**Suspension, per axle.** Architectures: strut, double wishbone, multilink, twist beam, solid axle. Params: travel in jounce and rebound. Envelope: type-shaped, SOURCED — towers tall and demanding hood height, wishbones wide and low, twist beam a brick between the wheels. Publishes: the swept wheel envelope — tire section plus travel, plus steering articulation at the front, which is why front arches out-demand rears — and pickup anchorages into members. Kinematics beyond travel: out, §14.

**Steering.** Rack fore or aft of axle, ratio. Column path is a true routed clearance check from wheel through firewall past the engine — not a margin. Turning circle back-solves: brief → wheelbase → required steer angle → front swept envelope.

**Brakes.** Disc diameter must live inside the wheel with sourced caliper clearance — brakes set the wheel-diameter floor. Booster and master cylinder claim driver-side firewall at the pedal box, tied to the heel point; the demand states why it cannot move.

**Cooling.** Rejected heat derived from power × sourced split; radiator area via sourced flux coefficient; core thickness; condenser stacks ahead; inlet area must meet demand with an exit path. This loop shapes the face of the car and is derivable down to the coefficient. EV: thermal loop to pack and motor — same grammar, different fluid.

**Intake / exhaust.** Filter volume, high dry inlet. Exhaust: catalyst close to the manifold inside a heat bubble, tunnel-adjacent routing, muffler volume near the tail, everything above the ground-clearance line, shielded past the tank.

**Occupant array** (ratified upstream, restated): heel, hip, eye, head points per row from anthropometrics; head clearance; reach spheres to wheel and pedals; entry aperture against sill and hip travel; cowl ceiling, hood ceiling, rake floor derived from vision. Seat and belt anchors load-rated and regulated — SOURCED — terminating in members.

**Wheels / tires.** Drag-to-resize objects, per ruling. A tire is the three sidewall numbers plus load index; the index feeds the mass-ledger check.

**Substrate.** As §4 — authorable, one grammar, duties enforced.

## 6. Regulatory set — the law as principal

Pure SOURCED demands, one schema entry each with a citation field — searched and named during the run, or flagged pending: bumper beam height band; lamp height bands; mirror and pillar vision fields; wiper wipe zones over the derived vision area; plate provisions front and rear; pedestrian hood clearance — the required air gap between hood skin and engine hard points that couples installed engine height to the hood line.

## 7. Brief set — the owner as principal

ASSUMED-class, owner-set, ledgered as his: cargo volume and loading aperture; range; ground clearance with approach and departure angles; mass target; seat count (upstream); style caps carried from PKG→PROP.

## 8. Mass ledger

Ships in v1 as computation; the lens is stamped. Every part carries mass — derived from volume × material density, or sourced from its entry. Sum at positions → CG shown in all three views, axle loads, per-tire load against the sidewall index, total against target with the gap shown. Circularity resolves as in real studios: mass target ASSUMED first, iterate, the ledger shows the gap. This closes the last loop — the car not only fits, it stands on its tires legally.

## 9. Aero lens — stamped, honest shape

Classical panel solve over the sampled quilt. Output is a pressure-coefficient map, colored on the skin — speed-independent below racing speeds, so one solve serves every typed MPH; the MPH box rescales forces by v². Separation is beyond the method: flag dead zones with a crude adverse-recovery criterion, ASSUMED-tagged, and say so on the lens itself. Drag and power figures come only from sourced Cd × derived frontal area — never read off the map. Frontal area derives exactly from the model. Inlet-area-versus-cooling-demand is a pure geometry check. The lens never authors and feeds nothing downstream.

## 10. Pipeline out

Conforming mesher, ours: sample every shared curve once, globally, including T points; both patches consume identical samples; structured interiors per patch. Closed-mesh check runs and reports. Shutlines engrave as grooves at the chosen scale — at 1:24 they catch light like real gaps. STL to print; STEP through the kernel; render is the same surfaces wearing their authored materials. Every print emits the provenance report: which requirements bound which surfaces, which dimensions were free choices, full ledger state.

## 11. Stack — stamped

Browser; the deliverable is a URL. TypeScript frame model and verb history. Our own solvers: constraints, flow, mesh. OpenCascade in a worker for booleans and STEP only. The whole car is a versioned JSON document. Booleans are recorded verbs replayed at evaluation, per §3.

## 12. Acceptance at studio weight

- Six real cars re-entered from public specs land their hard points within tolerance. Calibration ASSUMED at ±15 mm on derived hard points, exact on inputs — owner-adjustable.
- The shoebox V16 packages clean: all-ASSUMED ledger, no crash, no special-casing anywhere.
- The ten-minute test, scripted: blank file → blocked, skinned, cut, printed report, inside one scripted session.
- CI: no bare constants; no type-branching in solver code; anchorage-law test; closed-mesh on every printed fixture; replay-determinism hash on every saved fixture.

## 13. Run conduct

Search and cite every SOURCED coefficient during the build; where a source cannot be found, tag ASSUMED and surface it in the ledger — never bury it. Distinguish constructed from retrieved in design notes. Three owner gates: **G1** — frame instrument with replay determinism demonstrated. **G2** — chassis solve with the type library on one real car. **G3** — skin, flow, and print across the six-car battery. Between gates, run.

## 14. Deliberately out — declared, not silent

The tool states these as out-of-scope where a user would expect them: suspension kinematics beyond travel; aero beyond the cooling openings and the §9 lens; NVH; durability; manufacturing joins; seam-grade smoothness beyond the §3 stage-gate; torsional stiffness as a number.

## 15. Still reserved to the owner

The crash-band source table per class; acceptance-tolerance calibration; starter-shelf contents beyond Panoramic's parts; and the two marked build interpretations — the T-junction resolution and the through-line fit — standing law unless overturned.
