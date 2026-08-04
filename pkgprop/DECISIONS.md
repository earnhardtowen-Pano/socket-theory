# DECISIONS

Running log of decisions made without asking, per brief §5.7. Newest last.

1. **Project lives in `pkgprop/` at repo root.** The repo already carries the
   owner's Socket Theory portfolio (README, demonstrator, vehicles). The brief
   assumes a dedicated repo; rather than overwrite the portfolio README or mix
   trees, the whole monorepo (including its own README) sits under `pkgprop/`.
   Everything in the brief's `/core`-style paths maps to `pkgprop/core` etc.

2. **Seed reconstructed from brief.** `seed/pkgprop-v0.jsx` was not in the repo.
   The four seed contracts (fraction-of-bounds sliders, wall attribution on
   contact, license ledger, envelope-as-threshold drawing) are implemented from
   their descriptions in brief §1. Logged as OPEN_QUESTIONS #1 for the owner.

3. **pnpm workspaces, TypeScript strict, ESM, Vitest.** Node 22 environment.
   All internal units millimeters; angles stored in degrees at the registry
   surface (human-readable) and converted to radians only inside math.

4. **License lint is a Vitest test using the TypeScript AST.** It walks every
   file in `core/src/constraints/` and fails on any numeric literal outside a
   tiny structural allowlist (0, 1, 2, 0.5 — array indices, halving,
   sign flips). Every real-world number must arrive via the parameter registry.
   Registered in CI as part of the standard test run, so the build is red the
   moment an unlicensed constant appears.
   *(Corrected in Phase 0: this entry used to list `-1` in the allowlist. It
   never was. `-1` parses as a unary minus applied to the literal `1`, so the
   AST never sees a `-1` literal and it passes by accident rather than by
   permission. See INVENTORY.md §4.7.)*

5. **Bounds are computed as contribution sets.** Each solved quantity collects
   lower-bound and upper-bound contributions from named constraints; the bound
   is max(lowers)/min(uppers) and the argmax/argmin IS the attribution. There is
   no stored string naming a wall anywhere — attribution falls out of the solve,
   live, per Law 3.

6. **Chains re-read the registry inside every trace.** Passing a precomputed
   number into a contribution severs its attribution chain (an EV roof
   conflict must point at battery thickness). `chains.ts` holds the shared
   derivations as functions over the registry, called inside traces only.

7. **The rake-floor monotonicity that is guaranteed is in the clearance
   radius.** Tangency angle rises strictly as demanded clearance grows, and
   the farthest legal header pulls forward — that is the property test.
   Monotonicity in cowl or head position alone is not globally true
   (two competing terms) and is not claimed.

8. **The rear-vision ceiling starts at the backlight, not the eye.** The
   glass transmits the view; only the opaque deck ducks under the sight
   line. Backlight base is an ASSUMED station aft of the last hip. Without
   this the ceiling clipped the driver's own head sphere, which was wrong.

9. **An inverted band pins the control to its lower wall.** Demands
   (occupants, structure) outrank targets (style caps) when a band inverts;
   the geometry stays physical and the conflict chip reports the broken
   target. Nothing silently clamps — the chip is the report.

10. **A `backlight` line was added to the characteristic set.** The brief's
    eight side-view lines leave the silhouette open between roof and deck;
    the backlight closes it under the same clamp contract.

11. **Ten-minute defaults.** Default control fractions and the default style
    ceilings were tuned so FR·2 (and MR·2) open with zero conflicts. Configs
    that genuinely do not fit under the default targets (EV three-row under a
    2950 wheelbase cap) open with honest conflicts naming the knobs.

12. **Playwright pins the environment's Chromium** via launchOptions when
    `/opt/pw-browsers/chromium` exists, since the registry-installed browser
    version differs from the runner image.

13. **Render parameters are authored, not solved.** Paint, tint, and sun live
    in the project snapshot beside the drawn lines — undoable, saved, and
    outside the constraint layer entirely. Law 2 cuts between the solver and
    everything the human decides, and light is a human decision.

14. **The shake had a named cause.** The wall chip and the conflict bar
    inserted into document flow the moment a control touched a wall. That
    moved the canvas under the cursor, which changed the clamp, which removed
    the chip, which moved the canvas back — an oscillation at pointer-move
    frequency. Both are absolute overlays now, and an e2e test asserts the
    canvas bounding box holds one value across a ten-frame drag.

15. **The wheel openings are the human's arches.** The marker render builds
    the body's lower edge from the authored front and rear arch curves, so the
    openings are drawn, not generated. A circular well left a sliver of
    daylight at the crown; the well is now shaped by the same curve.

16. **DEFAULT MODE IS RENDER.** The instrument opens on the painted car, not
    the wireframe. The machinery is one chip away in DRAFT. A tool that opens
    on its own scaffolding teaches you to see scaffolding.

17. **Line schema carries tension.** `DrawingState.lines` moved from a bare
    point array to `{ pts, tension }`. Older project files load through
    `migrateDrawing`, which accepts both shapes.

18. **Phase 0 arms the guards before it reports.** The kernel extraction's
    gate was "the 12-car validation set stays green," and there is no such
    set — `validation/` held a package.json and nothing else. Rather than
    extract with no net, Phase 0 froze every architecture × seating × tire
    case as `validation/test/golden.json`. It records the **winning constraint
    id per wall**, not only the value: a refactor that preserves every number
    but changes who authored a bound has broken the product. Proven both ways
    before being trusted — a 1 mm parameter change fails 84 assertions, and
    hoisting one `contribute()` call above another with identical numbers
    fails 40.

19. **A golden snapshot is not validation against reality.** It means
    "unchanged," never "correct." Nothing in this repository has ever been
    checked against a measured vehicle. The 12-car benchmark is still owed and
    is tracked as its own task, not as a side effect of this one.

20. **The license lint could pass while checking almost nothing.** It read one
    hardcoded directory non-recursively, guarded by `files.length > 5` — a
    number that happened to match the eleven files then present. A total move
    would have been caught; a **partial** move (leave six of eleven) or a move
    into subdirectories would not. Scan roots are now a list, the walk is
    recursive, and a manifest is checked both ways, so adding a constraint file
    means admitting it to the manifest.

21. **The severance invariant is now tested, and it was already broken.**
    `DECISIONS.md` #6 requires chain values to be read inside the trace.
    `solve()` hands computed values between stages as plain numbers, so
    attribution truncates at every stage boundary; `sight_over_hood` reads the
    registry zero times and reports no resolvers at all when the hood
    conflicts. Not fixed in Phase 0 — this phase reports and changes no
    behavior — but pinned as a characterization list so it cannot spread, and
    named in INVENTORY.md §4.1 as the finding that most needs a decision.

22. **INVENTORY.md is a checked artifact, not prose.** Its ~92 `file:line`
    claims and its verbatim quotes are verified in CI
    (`validation/test/inventory.test.ts`). The moment Phase 1 moves a
    constraint, the inventory's references go stale and the build says so. A
    document that lies about where things are is worse than no document.

23. **Attribution carries across stage boundaries.** `Registry.publish` /
    `Registry.inherit`: a placed control or derived readout publishes the
    params behind it, and a constraint consuming one inherits that chain
    inside its own trace. This is what DECISIONS #6 asked for and never had.
    `inherit` throws on an unsolved quantity, so a stage-order mistake fails
    loudly rather than quietly producing a short chain.

24. **Ties break on specificity, not on call order.** Two constraints can be
    numerically identical for a given car; preferring the earlier call site
    made the reported author an artefact of source layout. The longer
    read-chain is the more specific claim and wins; the id breaks a dead heat
    so the answer stays stable.

25. **The kernel holds no opinion about what a car looks like.** The opening
    pose is spine data (`data/src/pose.ts`). A control the project does not
    name sits at the middle of its band — the one fraction that asserts
    nothing about vehicles.

26. **`geometry/` owns its curves.** Cubic B-splines with a clamped knot
    vector, de Boor evaluation, and an interpolation that passes through its
    points. NURBS libraries carry rational weights, trimming and surface
    intersection; none of it is used here and all of it would be ours to
    debug. Degree is fixed at three — lower is visibly faceted on a body,
    higher buys nothing you can see.

27. **A section is four numbers a designer already says out loud.** Crown,
    shoulder height, tumblehome, and glass inset. The last of those is the
    greenhouse break, and it is the difference between a car and a blister:
    without it the loft runs one smooth volume from rocker to roof.

28. **The surface honours the plan wall by scaling, not clamping.** A cubic
    through the section's four points overshoots past the widest — 999mm on a
    950mm section — and the plan half-width is a solved wall. Scaling the
    section back keeps the shape; clamping would leave a flat spot along the
    widest point.

29. **A body style is a whole car, not an architecture flag.** Architecture,
    pose, section, and the ASSUMED values the style disagrees with. The GT's
    first attempt inverted its own heel band and the conflict machinery named
    both walls and the knobs; raising the owner's wheelbase target is the
    honest resolution and the preset states it as a visible override.

30. **Features ask the kernel for their walls.** The wheel opening used to
    recompute the tire clearance and then borrow `tire_clearance`'s meta to
    narrate the result. It calls `clampToEnvelope` now, which returns both the
    corrected height and the segment that corrected it, so the wall names
    itself. All nine Phase 0 defects are closed.
