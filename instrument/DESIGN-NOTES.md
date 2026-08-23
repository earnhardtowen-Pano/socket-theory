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

## First end-to-end integration (night build)

- **Mirror double-emission, found and fixed** — the first verbs→quilt→mesh run
  came back OPEN (512 violations): the per-cell centered test gave the side
  faces of a centerline-straddling box phantom mirror twins, doubling panels.
  Corrected law reading, now in evaluateMirrors: a cell earns a twin only when
  its mirror image is absent from the model (a self-symmetric body already
  contains the mirror of each of its faces). The test that encoded the old
  expectation was corrected; replay goldens unchanged (fixtures are
  off-center). After the fix the same body meshes CLOSED with zero violations.
  This is what the gate exists for: the mesher's closed check caught a frame
  evaluator bug neither package could see alone.

## P2 — packaging contract

- **Translation-only poses in v1** — constructed simplification, stated in
  schema: ports are authored in world-aligned part frames; mates carry fixed
  offsets. Rotated installs (tilted engines) enter through the type's port
  authoring, not solver orientation variables. Honest scope, revisit on need.
- **Blindness layer three** — the rename-fuzz behavioral test: renaming every
  part label yields an identical solve modulo the renaming.

## P3 — findings from authoring a whole car

- **T-junction on an unsplit opposite face meshes open** (reproducible, open).
  Minimal case: one box, then split BOTH flanks with a single vertical tape
  line. The four long fore-aft curves end up with three trims each — the
  top/bottom face keeps `[0,1]` while the two flank children hold `[0,0.5]`
  and `[0.5,1]` — and `closedMeshCheck` reports 12 open edges on the ±Z faces
  and the flank children. The P1's own body carries many T-junctions and
  meshes closed, so this is configuration-specific, not general. Recorded here
  rather than worked around silently; the flow fixture uses a plain box so it
  tests flow and not this.
- **Symmetry is a property you keep on purpose.** Splitting one flank of a
  centred body, crowning a single side edge, or tapering one plan corner all
  make the body asymmetric — and the mirror law immediately says so by
  emitting twins that then mesh open. Three separate authoring bugs announced
  themselves this way. The law is a better proofreader than the eye.
- **Ids come from the model, never from a count.** `curves.size` tracked the
  allocator only while nothing had split. Reading ids back from the state (or
  diffing the key set around a verb) is the only durable way.
- **Flow belongs on the derived mesh, not at curve junctions.** A tape split
  subdivides a curve's trims rather than the curve, so a sectioned body has
  almost no two-curve junctions to fair; the kink lives across the shared
  curve, between patches. Taubin λ|μ relaxation with creases pinned puts the
  solve where the kink actually is, keeps topology (so a closed body stays
  printable), and stays a derivation.

## Shading, and two findings the render forced out

- **Smoothing groups, not a flow solve** — constructed for this build, retrieved
  as a technique (crease-angle normals are how every car render has been shaded
  for thirty years). Two earlier attempts were wrong in opposite directions:
  flat shading drew every tessellation facet, so a flat panel read as
  shattered; 30 Taubin passes fixed the facets by melting the arch mouths,
  splitter and roof break into soap. Neither was a geometry problem.
  `creaseNormals` averages a vertex normal across an edge only below the crease
  angle and splits it above, moving no vertex at all. The boundary is stated in
  the header and matters: a split duplicates a vertex, so the render buffer is
  wider than the print mesh. The printed mesh stays the one `meshQuilt` emits;
  the closed check and the STL run on that. `@car/flow` stays in the tree,
  tested, unused by P1.
- **A cut must go all the way round the ring.** The first round wheel sectioned
  its box's top face alone and meshed OPEN in 60 places. Cutting one face
  leaves its neighbours holding a T-junction they were never told about, and
  the new curve then moves out from under them. Cut top + bottom + both flanks
  in one verb and the same wheel closes with zero violations. This is the
  general rule behind the P3 finding above: the body's station cuts already
  went through top AND both flanks, which is why they always worked.
- **The wheel arches never existed.** Instrumenting the arch-mouth search
  showed it finding zero curves, on every run, since the flanks were first
  sectioned — the openings in every render before this one were imaginary. Root
  cause is structural, not a typo: a tape split subdivides a curve's TRIMS, not
  the curve, so the flank's bottom edge stays ONE curve running the whole length
  of the car however many times it is cut, and no curve ever spans just an arch.
  A search that quietly matches nothing is worse than a crash; it shipped four
  photo sets. Removed. The wheel openings are now made from what the frame does
  carry — cross-car station curves, flared at the shoulder over each axle and
  pulled inboard at the rocker, which is an arch by section instead of by
  outline. A real opening wants a verb that splits a curve into children. That
  is a spec question for G3, and clause 25 still stands: it is authored, not
  cut. This frame simply cannot author THIS opening yet, and saying so is the
  point.

## The body, rebuilt around master lines

- **A car body is two master lines and a family of sections** — constructed
  here, retrieved as practice (it is how a body has been drawn since the
  loft floor). The rocker at the sill and the shoulder at the beltline run the
  length of the car; every station only says what its section does BETWEEN
  them. A taped box already IS that, once read right: its four long edges are
  the two rockers and the two shoulders, its top face is the deck between the
  shoulders, its flanks run rocker to shoulder, its bottom is the underbody.
  Nothing needed inventing. The earlier body ignored the reading — it left the
  long edges near the centreline and pushed each station's flank curve 480 mm
  outboard of its own two endpoints, so every "section" was a bulge hung off a
  line that was nowhere near the side of the car. It read as a car in
  silhouette and was incoherent as a surface.
- **The trim rule and the craft agree.** A long edge stays one curve for the
  life of the body (tape splits subdivide trims, not curves), and a rocker and
  a beltline ARE single sweeping curves on a real car. What looked like the
  frame's limitation is the frame telling you which lines are master lines.
  The four-point cubic fit makes them exact at t = 0, 1/3, 2/3, 1, and because
  the tables are read at those same params, x(t) comes out linear and station
  x maps to curve parameter x/LEN. Every section hangs off that.
- **Say it in absolutes, not offsets.** The section's width started as a
  "flare" over the master line and the tires came through the bodywork twice,
  because a bulge over a line nobody could see could not be checked against
  anything. Restated as `hip` — the widest half-width the section reaches —
  it reads directly against the numbers that decide it: tire faces at 932 and
  957 from the solve. `hipAt` then says how far UP the flank that widest point
  sits, which is not a nicety: a fender's widest point is level with the crown
  of the tire, and with the fullness fixed low the section had already
  narrowed by the time it reached the wheel. The build prints the tire crown
  against the fender every run, because that number was guessed wrong three
  times in a row and is free to measure.
- **The wheels were authored against invented hardpoints.** Track and tire
  width were typed in by hand — 32 mm inboard of where the solve had actually
  placed the wheel, and 9 mm narrow. They now come from the placement and the
  chassis fixture. A body authored against invented hardpoints is a drawing.
- **A cubic is a wheel.** Third construction and the first that is round. The
  silhouette of a wheel lives on the four long edges of its flanks, so cutting
  the faces finer never touched it — the projected curves just stood proud of
  a rectangle and threw shards. Fitting those eight edges to their quarter-arcs
  instead gives a true circle (a cubic fits 90 degrees to ~0.1 mm at this
  radius), needs no cuts at all, and drops the car from 101,524 triangles to
  32,612, because the tread bands fall out as exact cylindrical strips: a
  Coons patch spanned between two identical arcs IS the band between them.
- **A tie-break decided whether two panels existed** (fixed, `@car/frame`).
  Two deck cells out of thirteen on the windshield were handed phantom mirror
  twins that double-covered them and opened the mesh in 100 places. The cells
  were symmetric to the bit; the SIGNATURE was not. 553.9453125 is dyadic, so
  it lands exactly on a half-step of the 1e-6 quantization grid, the same
  coordinate came back one ULP lower on the other flank, and `Math.round`
  breaks ties toward +Infinity — so the two sides of the car quantized a whole
  step apart. Magnitudes are now snapped to 12 significant digits before the
  grid round (bit-equal by the time ties are broken) and the tie is broken on
  the magnitude with the sign restored after (so the sign cannot change the
  answer). Regression test in `mirror-quilt.test.ts`, verified to fail against
  the old quantizer. Rare, geometry-dependent, and nothing to do with the
  cells that failed — which is exactly how a tie-break bug presents.
- **`MESHDEBUG=1`.** An open mesh was a count, and a count cannot be debugged.
  The build now reports violation kinds, open-vertex count, and a histogram of
  open vertices by station. It located the windshield in one run.
