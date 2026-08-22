# AUTHORING-SPEC.md
Car design tool — authoring statute. Consolidated August 22, 2026. Supersedes the August 21 consolidation.

**For the builder.** This document is the August 21 consolidation put under attack clause by clause and re-issued as statute. Method: every load-bearing ruling was attacked; what held is vouched, what held in intent but not in load path is reframed, what was missing is added as new law. Every Part 1 owner ruling from August 21 survived the attack; nothing here overturns one. The changes land in the engineering layer and in new statute. The disposition of every old clause is recorded in the table at the end; nothing was dropped silently. Where this document conflicts with the August 21 document or anything earlier, this one wins. New law the owner has not yet ratified is flagged in place.

Tags: [VOUCHED] survived attack, possibly tightened. [REFRAMED] same intent, new load path. [NEW] added law. [SETTLED] was open, now closed. Each tag names its August 21 parent where one exists.

Two standing assumptions, stated once:

- **The builder.** This statute assumes a maximally capable builder. That moves what is cheap to write in-house; it does not move what is wise to depend on. The line it draws is Article XI.
- **The stakes.** The tool's outputs end in vehicles people ride in. At authoring scale that obligation lands in one place: provenance. The model must always know which of its dimensions trace to a requirement and which were chosen free (Article II). Everything else here is design software; that clause is an audit trail.

## Article I — Standing and sequence

1. Build the concrete tool first. The first car is what it builds; the tool is not specific to it. A general core gets extracted later, when a second use case forces the question. [VOUCHED, old 1]
2. The general core is not deferred — it is latent. The verb set and the schema are the core; what waits for a second use case is extraction, not existence. [REFRAMED, old 1/19]
3. Owner rulings are the source of law; this consolidation is the interpreter's statute under them. A clause that would change a ruling's substance rather than its load path is marked for ratification. Article VIII is the only such flag outstanding. [NEW]

## Article II — The site

4. The base of every design is the rolling-chassis creator, with the Car as it can exist coded in. The chassis is not a fixed armature pulled from a menu — it is the full site, authorable with the same grammar as everything else: space frame, monocoque, body-on-frame; air channels cut into it; carbon fiber below and a different material above; its color changeable. The body is authored on and around it. [VOUCHED, old 2]
5. "Any engine, any transmission, any seat count — any configuration" is the ambition; the statute's finite mechanism for it: configurations are schema entries (Article III), and the packaging solver runs against the authored chassis, never against a fixed template. Hard points and clearances are published by the chassis as it currently exists; change the chassis and the hard points follow. [REFRAMED, old 2/15 — a solver-architecture commitment]
6. Published hard points and clearances appear in the ortho grids as the snap points. Snapping links a placement to its requirement; going off-grid is recorded as a free authored choice. The model always knows which of its dimensions trace to a requirement and which were chosen. [VOUCHED, old 15]
7. Provenance is monotone: geometry derived from provenanced inputs carries the union of their provenance. The print report (clause 41) includes a provenance summary — which requirements bound the shipped surface, which dimensions were free. [NEW]
8. Exact typed values are legal everywhere a snap is. The grid is a convenience, never a rounding: a hard point at 743.5 lands at 743.5. Units are millimeters. [NEW]

## Article III — One grammar

9. Creating the chassis and interior parts uses the same modeling mechanics as surfacing the body. There is no separate configurator program inside the tool. [VOUCHED, old 3]
10. Construction types, parts, and materials are schema entries — each a starting configuration of the same editable model, not the output of a separate picker. v1 ships a small inventory: the first car's components plus a few deliberate alternates to prove the range. [VOUCHED, old 14]
11. The grammar test: a catalog entry must be expressible as a document of verb applications over the schema. A candidate that cannot be authored with the verbs is not an entry — it is a feature request against the verb set or the schema. [NEW]
12. The honest boundary of "grows by adding entries, never code": entries that compose existing verbs and attribute types are data, always. A genuinely new attribute type is a schema migration, which is code. The law is drawn where it can be enforced. [REFRAMED, old 14]

## Article IV — The model

13. Two layers. The authored model is the network of frames, edges, curves, and attributes. Surfaces, solids, and meshes are always derived from it. The user edits frames; the display follows. The box on screen is a view of a four-edge frame; the frame is the real object. [VOUCHED, old 10]
14. The authored model is a replayable history of verb applications. No verb writes derived geometry directly; every verb writes model data, and evaluation replays the history. This is what keeps clause 13 true through cuts (Article IX): a cut is authored as its profile and its verb, and the boolean is derivation. Undo, parametric edit of features, and serialization fall out of this clause. [NEW — without it, the two-layer law dies at the first boolean]
15. Attributes attach to authored objects only — cells, groups, feature operations — never to derived geometry. This is how paint survives re-evaluation. [NEW]
16. The model serializes as a versioned document. The catalog grows by adding documents. [NEW]

## Article V — Welds and topology

17. Snapping two cells together creates one shared edge object owned by both. Moving it moves both neighbors. Rotation drags welds along, or requires an explicit detach. This single rule is the watertightness mechanism. Non-negotiable. [VOUCHED, old 11]
18. Taping across a cell splits it: the tape line becomes a shared edge and the cell becomes welded cells. This is the refinement verb; it was implicit and is now law. [NEW]
19. Inside a panel group the quilt is conforming: one edge, two cells, no T-junctions. A T-junction is legal only at a group border, where both sides reference the border's gap or crease curve and may subdivide against it differently; the mesher stitches along the shared curve (clause 37). Without this clause, watertightness fails silently at the first refinement. [NEW]

## Article VI — Surfaces

20. Every four-sided cell evaluates as a Coons patch from its four boundary curves. Neighbors sharing curves touch exactly: watertight by construction, controlled by pinching and moving contact points. Smooth mode is a toggle for where flowing surfaces are wanted. [VOUCHED, old 4/12]
21. Candor on Coons: shared boundaries buy position, not tangency, and pure Coons offers no direct control of a patch's interior — fullness between boundaries will sometimes disappoint. Interior control is a legal future extension of the cell's data, not a new patch program; under clause 14 it is a non-breaking upgrade. Not v1. [NEW — the limitation is met as a known cost, not a surprise]
22. Smoothness across seams is a separate solve, scoped by Article VII. [VOUCHED, old 12]

## Article VII — Panel groups and flow

23. Reflection continuity has to be won only inside a panel group. Group borders land on panel gaps and deliberate creases, where a visual break is free or intended. This is not an aesthetic dodge: production cars are surfaced per panel, and gaps are the industry's own topology firebreaks. The ruling matches how real body engineering scopes continuity. [VOUCHED, old 6, strengthened]
24. Panels on either side of a gap reference the same authored gap curve; alignment across the gap is inherited by construction, never checked after the fact. [VOUCHED, old 13]
25. Openings — wheel arches, door aperture lines, closures — are modeled as panel-group borders, not boolean cuts. On a real car they are panel edges. This keeps booleans off the critical path (Article XIV); crude cuts remain first-class for what is genuinely a cut-in. [NEW — build ruling within owner law]

## Article VIII — Symmetry [NEW — awaiting owner ratification]

26. The August 21 document has no symmetry law, and a car is bilaterally symmetric. Proposed: the centerline is a standing through-line datum. Mirrored authoring is a mode — author one side and the other derives by reflection under clause 13. Asymmetry is legal by explicit detach of a cell or group from the mirror, recorded like an off-grid choice. Fits the existing verbs; without it the whole car is authored twice.

## Article IX — Crude mode

27. The same mechanics work bluntly: a constrained rectangle laid on the side and extruded inward; a half circle cut into the body and tapered to a point — a cut-in. Blunt features are first-class, not failures. [VOUCHED, old 5]
28. A cut is authored as profile plus verb (clause 14) and evaluates as a boolean in the borrowed engine. Cut edges count as deliberate creases under Article VII. Cuts that blend smoothly back into the surrounding surface are deferred past v1. [VOUCHED, old 16 in part]
29. Candor on cuts: boolean faces are where watertight-by-construction hands off to watertight-checked. On this path the closed-mesh check (clause 41) is the guarantee, not a formality. [NEW]

## Article X — The loop and the toolset

30. Work happens in orthographic views on a grid, like grid paper, with snap points — snap to them or go off-grid freely. Constrain a rectangle in 2D in side view; switch to top view; drag it flush with chassis and cabin; push or pull it to create the space the patch lives in. Rectangles and boxes live in 3D space and rotate any which way. The whole car is authored this way. [VOUCHED, old 7]
31. The verb set, closed: constrain, tape (which splits, clause 18), weld, detach, push-pull, rotate, cut, taper, place point, fit through-line, group, assign material — and mirror-detach if Article VIII is ratified. Template tools — compass, ruler, freeform — drive them. Control points can be added anywhere. New capability arrives by composing verbs or adding schema entries, never by adding bespoke tools. Everything the owner wants to do must be reachable with these. [VOUCHED, old 8/19, extended]
32. The v1 constraint set, closed like the verbs: coincident, distance, angle, parallel, perpendicular, symmetric about a datum, on-grid. Constraint solving is a tarpit; the fence is the feature. [NEW]
33. Through-line fitting, settled: the line is fit to the explicitly chosen control points by unweighted least squares — straight when asked for straight, otherwise the lowest degree that fits. It serves as a sketch datum: line up parts across the car, carry continuity, set proportions. Weighting arrives only when a real car shows the need. [SETTLED, was open 22; parent old 8]
34. A perspective inspection view — orbit, zebra stripes — is legal early and is never an authoring surface. Authoring stays orthographic; judging flow needs the check. [NEW]
35. Kept for the record, superseded along the way: drawing on a generic constrained cube or sphere was absorbed into the loop — the constrained box is itself the drawing surface and the chassis is the reference; the pre-wired patch template was demoted to optional starter content, since rectangles are four-sided by construction and authoring topology live is safe. [VOUCHED, old 9]

## Article XI — The engine boundary

36. Borrowed, from the OpenCascade family: B-rep booleans, offsets, surface–surface intersection, STEP export. We never write that math. The ruling survives the maximally capable builder: kernels encode decades of tolerance lore, and rewriting them is misallocated capability even where feasible. [VOUCHED, old 16]
37. In-house — and this is where the builder assumption moved the line: the frame model, the constraint solve, Coons evaluation, the flow solve, through-line fitting, and the quilt mesher. The mesher samples each shared curve once and hands the same samples to both neighboring patches, so the mesh inherits watertightness from the weld topology instead of relying on tolerance sewing after the fact. A borrowed mesher cannot know our topology; ours must. [REFRAMED, old 16/18]
38. The engine sits behind a narrow interface in a worker. If the stack moves (clause 44), the engine swaps without the model noticing. [NEW]

## Article XII — Appearance

39. Materials and color are attributes painted onto regions of the model, attaching per clause 15. They carry no geometry and feed the render path directly. [VOUCHED, old 17]

## Article XIII — Outputs

40. One dataset, two outputs. [VOUCHED, old 18]
41. Print path: sample the quilt and solids into a single closed mesh; engrave gap lines as shallow grooves at the chosen print scale; export STL; run the closed-mesh check and report. The check reports and never mutates — silent repair would break provenance. The report carries the mesh verdict and the provenance summary (clause 7). [REFRAMED, old 18]
42. Render path: the same surfaces carrying their region materials and colors. [VOUCHED, old 18]

## Article XIV — Critical path

43. Quilt to closed mesh to printable STL is the milestone spine. Crude mode, library breadth, and render polish ride behind it and must not delay it. Clause 25 exists to keep booleans off the spine. [VOUCHED, old 20]

## Article XV — Open at kickoff

44. Stack: owner decision, still open. The interpreter's recommendation, recorded: browser — TypeScript, WebGL or WebGPU, the geometry engine arriving as a WASM build in a worker. Reasons: the prototype lineage; zero-install iteration with the owner in the loop is worth more at v1 scale than kernel speed; the in-house spine of clause 37 is pure math and ports anywhere; the WASM engine's weight is a load-time cost, not an authoring-loop cost. Desktop is the escape hatch if boolean performance or memory bites. [was open 21]
45. Seam-grade smoothness — reflection-quality flow at the few seams that survive inside panel groups — is a later milestone, not v1. Prints do not need it. The zebra view (clause 34) lands first and tells us when it is due. [VOUCHED, old 23]

## Disposition of the August 21 clauses

Every old clause accounted for; nothing dropped silently.

| Old | Verdict | Now |
|---|---|---|
| 1 | Vouched; core reframed as latent, not deferred | 1, 2 |
| 2 | Vouched; mechanism made finite | 4, 5 |
| 3 | Vouched | 9 |
| 4 | Vouched; interior-control cost recorded | 20, 21 |
| 5 | Vouched | 27 |
| 6 | Vouched, strengthened | 23 |
| 7 | Vouched | 30 |
| 8 | Vouched; toolset extended, constraint set fenced | 31, 32, 33 |
| 9 | Vouched, record kept | 35 |
| 10 | Vouched; history law added to keep it true | 13, 14 |
| 11 | Vouched, non-negotiable; T-junction law added | 17, 18, 19 |
| 12 | Vouched | 20, 22 |
| 13 | Vouched | 24 |
| 14 | Vouched; honest data/code boundary drawn | 10, 11, 12 |
| 15 | Vouched; provenance made monotone | 5, 6, 7, 8 |
| 16 | Vouched for the kernel; line moved for the mesher | 28, 36, 37, 38 |
| 17 | Vouched; attachment rule added | 15, 39 |
| 18 | Reframed: in-house mesher; check reports, never mutates | 37, 40, 41, 42 |
| 19 | Vouched | 2, 31 |
| 20 | Vouched | 43 |
| 21 | Open; recommendation recorded | 44 |
| 22 | Settled | 33 |
| 23 | Vouched as deferred | 45 |

New law with no August 21 parent: 3, 7, 8, 11, 14, 15, 16, 18, 19, 21, 25, 26 (Article VIII, awaiting ratification), 29, 32, 34, 38.

---

## Amendments — August 22, second consolidation

Ratified by the owner's approval of the build plan under the co-worker charge (recorded verbatim as CHARGE.md). The charge's §1 claimed ratification "by the owner's send"; a document cannot ratify itself — these amendments took force at the owner's plan approval, from his authority. Where an amendment conflicts with a clause above, the amendment wins.

- **A1 (amends clause 19 — T-junctions).** T-junctions are legal everywhere, not only at group borders. A hanging vertex binds to the host edge's curve; a shared curve is one object, sub-shared by trims. Refinement and meshing respect the union of samples on the curve. Watertightness remains by construction via the global once-per-curve sample table.
- **A2 (amends clause 23 — flow law).** Deliberate creases and character lines break flow. Shutlines do not, unless coincident with a character line: the gap curve is interior to its parent flow solve. Groups bind their borders to gap curves for shutline authoring and alignment — grouping is not a continuity boundary. Clause 24's shared-gap-curve mechanism is unchanged and is what makes the gap interior to the flow region at zero model cost.
- **A3 (amends clause 33 — through-line fit).** The fit is orthogonal least squares through the explicitly chosen control points — orthogonal distance is the right residual for a spatial datum. Straight when asked; otherwise lowest degree that fits; weighting still waits for a demonstrated need.
- **A4 (closes clause 44 — stack).** Browser, ratified. TypeScript frame model and verb history; our own solvers for constraints, flow, and mesh; OpenCascade in a worker for booleans and STEP only; the whole car a versioned JSON document; the deliverable is a URL.
- **A5 (ratifies Article VIII — symmetry).** The charge's §3 symmetry law restates clause 26; the ratification flag is lifted. Everything mirrors across the centerline by default; asymmetry only through a recorded detach, appearing in history and the provenance report.
- **A6 (amends clause 45 — flow stage-gate in scope).** The flow solve ships in v1 under the charge's stage gate: live drag maintains tangent continuity; the curvature-grade relax runs on release, not per frame; the code claims exactly this and no more. Seam-grade smoothness beyond the stage gate remains out per the charge's §14.
- **A7 (build interpretation — live-drag tangent scope).** During drag, tangent continuity is maintained live on the dragged curve's immediate neighborhood; the full network settles tangent at release, before the curvature-grade relax. Standing unless the owner overturns.
- **A8 (build interpretation — cuts through the smooth skin).** A Coons patch with cubic boundaries is exactly a bicubic patch, so smooth-skin cuts convert affected patches exactly to B-spline surfaces, run the boolean in the engine, and mesh cut faces engine-side, stitched to quilt samples at the seam — the watertight-checked path of clause 29. Fallback if it misbehaves: cuts land on the crude skin at G1 and the ruling is re-put at G2. Standing unless the owner overturns.
- **A9 (extends Article II — the licensed-demand constitution).** The charge's §2 becomes standing law: every constraint is authored by one of four principals (person, physics, law, owner's brief) with a stateable reason; every parameter carries DERIVED/SOURCED/ASSUMED license; the packaging solver is blind to part types and halts at closure with clamp attribution; anchorage law; overlay law (lenses are read-only and never author); no presets — overriding a derived value flips it to ASSUMED, the owner's.
