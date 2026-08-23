# Surfacing — where the body actually stands

Owen asked whether Alias can see us in their rear-view and chose to race them
on surfacing. This is the record of the first stage of that race: what was
built, what it measures, and what it does not do. Every number below comes out
of a command named against it and is reproducible at this commit.

```
npx tsx scripts/build-p1.ts        the body, with the numbers in the build output
npx tsx scripts/surface-report.ts  the whole body graded in one pass, worst first
npx tsx scripts/g1-probe.ts        before/after over the same joins
npx tsx scripts/curvature-comb.ts  the Class-A diagnostic, as an SVG
```

---

## Where we were

`@car/surface` blends four boundary curves into a bilinear Coons patch. Its
header has always claimed exactly what it delivers — *position-watertight by
construction* — and that is **G0**. A previous gate document claimed the body
was "G1 and not G2" on the evidence of a zebra render, which could not have
shown that: the zebra runs on crease-split render normals, so at the crease
angle every authored smoothing group breaks a stripe by construction and an
intended break is indistinguishable from a defect.

The reason G0 was the ceiling is structural, not a tuning miss. Differentiate
the bilinear blend across its bottom edge:

```
S_v(u,0) = c1(u) - c0(u) + (1-u)[d0'(0) - (P01-P00)] + u[d1'(0) - (P11-P10)]
```

The cross-boundary derivative on one edge is fixed by the **opposite** edge.
Two patches sharing a curve have different opposite edges, so nothing makes
their tangent planes agree, and nothing in the codebase tried to.

Measured, over the P1's 64 smooth joins: **6 G1, median defect 3.16°, worst
61.02°.**

---

## Stage 1 — the tangent field (G1)

Tangent-plane continuity is made a property of the **curve**, exactly as the
weld law already makes position one.

For each shared curve, from both neighbours' natural cross-derivatives:

```
A⊥ = N_A - (N_A·T̂)T̂      transverse parts only — the component along T̂ is
B⊥ = N_B - (N_B·T̂)T̂      reparameterisation, not shape
d̂  = normalise(Â⊥ - B̂⊥)   unit inputs: neither owner outvotes the other
```

A is handed `+d̂`, B is handed `−d̂`, each keeping its own magnitude and its own
tangential component. Both tangent planes are then `span{T, d̂}` — the same
plane, by construction rather than by tolerance.

Unit inputs matter: averaging the raw vectors would let the patch with the
longer parameterisation drag the plane toward itself, and the two sides of a
T-junction have deliberately different parameter spans.

The evaluator carries it as `S + Φ`, built from the two cubic Hermite tangent
bases:

```
Φ(u,v) = g(v)Δ₀(u) + h(u)Δ₁(v) + h(v)Δ₂(1-u) + g(u)Δ₃(1-v)
g(x) = x(1-x)²    h(x) = x²(1-x)
```

Each `Δ_k` vanishes to first order at its own ends, which is what keeps every
term off the other three sides. The consequences are exact, not tolerated:

| | |
|---|---|
| `Φ ≡ 0` on all four edges | the edge is still the shared curve, bit for bit |
| `Φ_u(u,0) = 0` | the along-edge tangent is untouched |
| `Φ_v(u,0) = Δ₀(u)` | the cross derivative is exactly the ask |

So watertightness, `closedMeshCheck` and the replay hash are all indifferent to
this term. Only the tangent plane moves.

**P1, over the same 64 joins: 62 G1, median 0.00°, worst 2.07°.** Where the
correction runs at full strength the join reads **exactly 0.0000°** — the
tangent planes are the same plane, not two close ones.

---

## Stage 1b — cross-curvature (G2)

G1 buys a shared tangent plane. It does not buy a shared curvature, and the
first pass makes the curvature mismatch **worse** — bending a patch near a
seam to fix its tangent changes how it bends. That is why the two orders are
separate steps and why Alias makes you do both.

The useful result: once the normal field along the shared curve is shared, two
of the three second-fundamental-form coefficients are no longer free.

- `II(T,T)` is the **shared curve's own** normal curvature against the
  **shared** normal. Both patches contain that curve and agree on that normal,
  so both get the same number with nobody trying.
- `II(T,ê)` is `−⟨ê, ∇_T N⟩` — only how the shared normal rotates as you walk
  the shared curve. Again a property of two shared objects.

What is left is `II(ê,ê)`, the normal curvature **across** the join. **The
whole of G2 on a join is one scalar per station.** Match it by averaging, and
hand each patch the change to its own inward second derivative that lands it
there — purely along the normal, since a second derivative's tangential part
is parameterisation.

That premise is checked, not assumed: `curvatureJoinProbe` reports
`tangentAgreement`, the largest disagreement it found in `II(T,T)`. If that is
not roundoff then everything else is being read in a frame the two patches do
not actually share. On the folded-pair fixture it comes back at 1 × 10⁻¹³.

The correction rides on a second term Ψ, from the quintic Hermite
second-derivative bases, which stacks with Φ rather than fighting it:

```
Ψ(u,v) = q(v)Δ²₀(u) + r(u)Δ²₁(v) + r(v)Δ²₂(1-u) + q(u)Δ²₃(1-v)
q(x) = ½x²(1-x)³    r(x) = ½x³(1-x)²

Ψ ≡ 0 and Ψ_v ≡ 0 on every edge      G0 and G1 untouched
Ψ_vv(u,0) = Δ²₀(u)                   the curvature is exactly the ask
```

Measured on one P1 seam, by curvature comb:

```
                        tangent break      curvature step at the seam
G0 · bilinear Coons          26.25°                2.58e-1 /mm
G1 · tangent field         1.6e-15°                4.52e-4 /mm
G2 · + cross-curvature     1.6e-15°                1.08e-5 /mm
```

Across the whole body, median cross-curvature gap **9.4e-6 → 4.3e-19 /mm** in
bisector form, and **4.4e-7 /mm** in the spline form the body actually ships
(see *The field as a spline* below — G1 stays exact, G2 becomes a fit).

---

## Zero break — and the probe that could not see one

Owen: *"I need the manifolds to have zero break in them. Continuity is the
whole game."* Where that landed:

```
                          before            after
G1, corner to corner      22/62 joins       62/62 joins under 1°
                          median 2.1°       median 1.6e-15°
                          worst 51.5°       worst 7.9e-4°
unmarked breaks           38                0
curve network             92/128 coplanar   124/124, worst 2.9e-3°
overall length            4475 mm           4400 mm (as authored)
G2 along a join           17/62 within 1%   59/62 · median rel 0.0015% · p90 0.106%
```

Four things had to be true at once, and only one of them was surfacing.

**The probe was blind by construction.** It sampled nine evenly spaced
stations per join, the first at a tenth of an edge. The correction fades out
inside a band next to each corner, and that band is the ONLY place a G1 defect
can survive — so the probe was looking everywhere except where the answer was.
It read 2.3e-14° on a body whose real worst was **eight degrees**, one twentieth
of an edge from a corner. The stations now add a decade at a time down to a
hundred-millionth of an edge. A probe that cannot see a defect is worse than no
probe, because it gets quoted.

The distribution and the extremes come from different station sets, on purpose:
two dozen stations crammed into the last thousandth of an edge make a median a
statement about corners rather than about the join. Median and p90 read the
evenly spaced stations; worst reads all of them.

**Thirty-eight breaks were the wheels.** Every one of the "sharper than 48°,
unmarked" joins was a tyre shoulder — a flank meeting the tread at exactly 90°,
authored that way by the `wheel` verb and never marked. The field was correctly
refusing them on the break-angle law; the document simply did not say why. They
are creased now, which moves nothing and admits everything.

**The nose and the tail are panels, and panels have edges.** All eight boundary
curves of the two end cells break by 43–90°. Six were over the law and showed
up as unmarked breaks. The other two are the tail panel's sides into the
quarters, and they were worse: 44° in the middle and 63° at both ends, so a
median reads 44° and they slipped under the 48° law by four degrees — and then
the field, believing them smooth, bent the tail panel **133 mm out of its own
plane** trying to make a 63° corner tangent-continuous. That was the +75 mm on
the overall length. Marking them put the car back at 4400 mm.

**The fade band is the defect, so it is sized per corner.** It used to be one
width for every corner of every side. But a side's two corners are different
corners — one may be a vertex the network turns cleanly and the other one it
cannot — and inside the band the correction is only partly applied, so the band
IS the break. Each end is now scaled by how far its own corner is from closing,
against the same 48° that decides whether a join is a feature at all, with a
floor of a ten-thousandth. On a faired network that is twelve microns of a
metre-long edge, and the worst break on the body is **7.9e-4°** — twenty times
inside the tightest Class-A G1 tolerance, measured at a station a hundred
million times narrower.

`fair-corners` had shipped as capability in Stage A and nobody had driven it.
The P1 build runs it now: 92/128 corners → 124/124, converged in two passes and
unchanged by five more.

### What is still not G2, and why it never will be here

At a corner the curvature correction is **required** to vanish — Ψ has to, or
it leaks onto the neighbouring side, exactly as Φ does. So every corner on every
body is G1 and not G2, whatever the network does, and the worst cross-curvature
gap on the P1 (1.4e-2 /mm) is at a vertex rather than on a join. Closing it
would need the curve network to be curvature-continuous at the vertex, which is
a strictly stronger condition than the coplanarity `fair-corners` delivers, and
there is no verb for it.

---

## What the correction costs in shape

Every number above is about agreement at a seam. **None of them says where the
surface went.** A correction can drive every join to machine zero and move a
panel by a hand's width, and until `fieldDisplacement` was written there was
nothing here that could see it.

On the P1, measured against the bare bilinear blend:

```
                        median      p90       worst      cells >1mm   >10mm
tangent plane (Φ)       2.6 mm    18.4 mm    133 mm          63/80      15
curvature (Ψ), further  0.46 mm    4.1 mm     85 mm          28/80       1
```

Two things follow, and both are worth saying plainly.

**The surfacing pass is not a touch-up.** It reshapes the body by centimetres.
That is the mechanism working as designed — the boundaries are pinned bit for
bit, so the only place a tangent-plane correction can go is the interior — but
it means the corrected body is a different body from the blend, and everything
downstream (frontal area, the Cp map, the print) has been reading the corrected
one since the field landed.

**`cell#1` is an outlier by a factor of thirteen.** The curvature term moves it
85 mm; the next worst cell moves 6.6 mm. Δ² goes as the transverse length
SQUARED times the curvature disagreement, so a join the network cannot close
buys a correction of thousands. `cell#1` is the tail panel carrying the four
72–74° corners of the previous section — the same four exceptions, showing up a
third time.

And it is not an interior detail. A Coons patch is pinned at its boundary and
free in its interior, so a correction has nowhere to go BUT the interior, and
where the network breaks hard at all four of a cell's corners the middle of
that cell balloons outward:

```
overall L·W·H   bare blend  4400 × 2003 × 1289 mm
                as built    4475 × 2004 × 1302 mm     +75 × +1 × +13
```

**The surfacing pass has been making the car 75 mm longer than it is authored**,
and nothing measured it until the displacement report existed. That number is
now on every build line. The cause is a design question, not a tool one: the
quarters meet the tail panel at 72–74°, which on a real car is a crease and not
a blend. Creasing `curve#10` and `curve#11` would stop the correction on those
two joins and put the tail back at 4400 — at the cost of a hard edge along the
whole quarter-to-tail seam, which is authoring, and belongs to whoever owns the
car.

### And the print was not getting Ψ at all

Found while drawing the picture above: `meshQuilt` read `cross.defect` and never
`cross.secondDefect`. It carried Φ into the print and left the curvature term
behind — so from the day the G2 layer landed until this commit, every G2 number
in this document was measured on the ANALYTIC surface while the STL, the aero
map and the curvature lens described a body that differed from it by up to
85 mm at the tail.

`coons-agreement.test.ts` exists to catch exactly this, and says so in its own
header. It could not: every one of its cases called `tangentField(quilt, …)`,
which defaults to **order 1**, so the term that was missing was never asked for.
It now runs at both orders.

---

## The honest limit: the curve network, not the surfaces

A patch that interpolates its four boundary curves has **no freedom at a
corner**. Its `S_u` there is one curve's tangent and its `S_v` is the other's,
so its tangent plane at the vertex is spanned by the two curves meeting there
and nothing can be done about it. Two patches across a shared curve therefore
agree at that vertex only if the curves turning the corner on their two sides
are coplanar with the shared curve — a condition on the **network**, not on
the surfaces. This is the vertex enclosure problem, and it is not going to be
argued away.

The response is a window, not a fudge. Each `Δ` is multiplied by a smootherstep
that is zero with zero first and second derivative at both ends and exactly one
across the interior, so the correction runs at **full strength across the body
of every edge** and fades only inside `cornerFade` of a vertex.

The obstruction is measured and reported rather than absorbed:
`networkObstruction` reads the tangent-plane disagreement at the seam's
endpoints, on the uncorrected patches — which is not an approximation, since
every correction vanishes at the corners by construction.

**P1: 92 of 128 corners are already coplanar to 1°, median 0.001°.** The 36
that are not are the entire remaining residual, and their worst is 74.4° at
`[4400, −520, 250]`, low at the tail — a genuine feature the crease set does
not know about.

Narrowing the window to 0.04 makes the P1 read **64 of 64 joins G2, worst gap
2 × 10⁻¹⁵ /mm**. That is not the number to quote: it does not remove the
incompatibility, it squeezes it into a narrower band with a steeper gradient.
It is quoted here only because it is the measurement that says the machinery
is exact and the default fade width is a **shape** decision rather than a
limit.

---

## The field as a spline — what makes it exportable

`d̂ = normalise(Â⊥ − B̂⊥)` is three square roots deep. The patch could be
sampled, rendered and printed; it could not be **written down**. Everything
else in `S₀ + Φ + Ψ` is polynomial already, so that one normalisation was the
whole of what stood between the body and a file somebody else can open.

The fix is not to approximate d̂ and accept the error. It is to notice what the
requirement on d̂ ever was. Patch A's tangent plane on the edge is
span{C′, E_A}, where C′ is the curve's own derivative — bit-identical for both
owners, because the edge IS the curve. So the join is G1 iff

```
span{C′, E_A} = span{C′, E_B}
```

which holds for ANY pair of the form

```
E_A(τ) = a_A(τ)·C′(t) + λ_A(τ)·D*(τ)
E_B(τ) = a_B(τ)·C′(t) + λ_B(τ)·D*(τ)        λ_A, λ_B ≠ 0
```

with `D*` **any** field both owners read. Its exact value decides *which* plane
they share, never *whether* they share one. So `D*` is free to be a spline, and
then `Δ = E − N` is a spline, because the natural Coons cross-derivative `N`
always was.

**The tangential slot has to hold C′ itself**, and the reason is not obvious:
fit the unit tangent too and `det(C′, E_A, E_B) = (a_Aλ_B − a_Bλ_A)·C′·(T*×D*)`,
which vanishes only if C′ lies in span{T*, D*}. Approximate the one vector that
has to be exact and the two planes part by an angle proportional to the fit
error.

### A spline, not a polynomial, and why that was forced

The first version fitted single Béziers and was not good enough. On
`cell#19 | cell#27` — a join on `curve#18`, whose speed swings from 1972 to 502
mm per unit parameter while the bisector rotates 52° across the middle of the
edge — **a degree-3 Bézier left 23 % of the cross-derivative and degree 11 still
left 3 %.** That is 19 mm of body. The trouble is local; global degree is the
wrong instrument for it. Two interior knots at degree 3 beat degree 11 outright.

So the fields are cubic B-splines, and the piece count is chosen per edge by
doubling until the residual is under tolerance. Two mistakes were made and are
recorded because both look exactly like an approximation limit and neither is:

- **Overfitting reads as convergence stalling.** At sixteen pieces over
  forty-nine fit stations a cubic span holds three points, interpolates them,
  and does as it pleases in between — where the CHECK stations are. The
  residual on the worst join sat at 1.8 mm from four pieces to sixteen. The fix
  is more data per piece, not more pieces: the sampler now works at the density
  the piece count needs, and the residual falls 24 → 1.8 → 0.047 → 0.002 mm.
- **Fitting the wrong target reads as the model being wrong.** Fitting `E` to
  the patch's NATURAL cross-derivative asks the spline to move the surface as
  little as possible, and the smallest move into the shared plane is the
  orthogonal projection — which shortens the cross-derivative by cos θ and
  flattens the patch against its own boundary. The target is a ROTATION,
  `(N·T̂)T̂ + |X⊥|d̂`, which is what the bisector field always computed.

Fit stations and check stations are different sets: the fit reads every other
station and the check reads all of them, so the reported residual is measured
half on data the least squares never saw.

### What it costs, measured

```
P1, 64 corrected edges, cubic, pieces per edge: 1×18  4×2  8×11  16×19  32×14

G1   exact in both forms. The spline body sits within 0.0065 mm of the
     bisector body — the fit tolerance carried through Φ's Hermite basis and
     nothing else.
G2   was exact, is now a fit. Median relative curvature gap 0.000 % → 0.154 %;
     joins within 1 % 23/64 → 19/64. Class-A grades G2 at 0.5–5 % relative, so
     the median is an order inside the tight end of that.
```

**G1 is exact and G2 is a tolerance, and the asymmetry is structural rather
than a matter of effort.** G1 is a statement about a plane, and the
construction puts both owners in one plane by making them read the same two
spanning vectors. G2 is a statement about a scalar — `II(ê,ê)` — and no choice
of polynomial coefficients makes two rational functions equal identically. The
miss concentrates in the corner fade, where the two patches have not yet
converged on the normal Δ² is supposed to lie along, so the model is
approximating something outside itself.

A narrower window for Δ² was tried, on the argument that the correction should
not act where its own premise is false. It was reverted: it damps hardest at
exactly the stations the probe reads, where the tangent correction is already
90 % applied and the curvature match is real, and it costs seven G2 joins to
buy a theoretical improvement in a band the probe never samples and the window
already damps twenty-fold.

---

## The 6 % that was not what it looked like

The Class-A audit had a row reading **"980 of 16,316 print vertices (6.0 %)
sit on a collapsed patch corner — fail."** It came from the curvature lens,
which marks a vertex unmeasurable when its ring of triangles is under one per
cent of a median face, and from a comment in that lens attributing the slivers
to collapsed Coons corners.

That attribution was never measured. It was wrong.

`degeneratePatches` — which asks the mesher's own question, `lo === hi ||
samePos(...)`, of the same numbers rather than inventing a second definition —
finds **zero** collapsed sides on the P1, and `buildSampleTable` agrees exactly.
Row 5 is a **pass**.

The real cause was in the mesher. A curve's sample parameters are its base
lattice union its trim endpoints, so a trim endpoint landing an ulp off a
lattice point gives the curve two samples 1e-16 apart — and any cell spanning
them gets two grid columns that far apart, with a column of zero-area quads
between. On the P1: **214 such columns, smallest gap 2.8 × 10⁻¹⁷, 6,692 sliver
triangles of 32,612.**

The two populations do not overlap — 214 gaps below 1e-9, **none at all**
between 1e-9 and 1e-2, 2,248 above — so the threshold is not a tuning choice.

The obvious fix is wrong and worth recording. Dropping the near-duplicate from
the union **opened 612 edges** on the P1: the seam has to stay exactly the
table polyline, and the cell across it builds its own union from its own sides,
so a column dropped here and kept there is a T-gap. Every one of 585 tests
stayed green through that, because no fixture had a near-duplicate to find.

What works: keep the column, so the boundary rows still snap to their own table
vertices, and reuse the neighbour's vertex only in the **interior**. The quads
between then have two equal corners and are dropped by the degenerate-triangle
filter that was already there.

```
triangles              32,612 → 27,612      (5,000 of them were zero-area)
unmeasurable vertices     980 → 45          (6.0 % → 0.33 %)
sliver triangles        6,692 → 1,695       what the seam genuinely forces
closed mesh              true → true        0 violations either way
```

`nearDuplicateSplitQuilt` is the fixture that was missing: a split-top box with
its split one ulp off a lattice point. It fails at 16 violations against the
dropped-column version and passes against this one.

**The lesson is the lens's, not the mesher's.** The reading was right and the
reason was invented, and an invented reason gets quoted onward as fact — this
one put a defect on the geometry that belonged to the mesher, and I repeated it
in an audit. A lens may report what it cannot measure. It may not name a cause
it did not look for.

## Three things this found on the way

**The field must not round off a break.** 38 P1 joins turn about 90° at
wheel-box corners nobody marked as creases. A surfacing pass that smoothed
them would be pursuing a metric at the cost of the design. The break angle is
now one constant shared with `creaseNormals` — the smoothing-group angle and
the surfacing break angle are one decision, and two numbers meant to be one
had no business being written down twice. An angle threshold cannot tell an
authored break from a gross defect; the real answer is authored creases, the
threshold is the backstop, and the count it catches is reported so a body full
of them cannot read as a body with nothing wrong.

**`acos(a·b)` has a resolution floor near zero** of about 1.2 × 10⁻⁶ degrees:
for a perfect join the dot product lands one ulp below 1 and `acos` turns that
into `sqrt(2ε)`. Invisible while the defect was ten degrees. It would have been
reported as the surface's residual the moment the defect was gone. The probes
read `atan2(|a×b|, a·b)` now, which has no such floor.

**There were two Coons evaluators and nothing checked they agreed.** The
analytic one feeds the render, the lenses and the probes; the discrete one,
over the shared sample table, feeds the print. Raising the surface quality in
one would have made the probe report a body that is not the body being
printed — exactly the mistake the correction to the record exists to prevent.
Both carry Φ and Ψ now, and `coons-agreement.test.ts` samples interiors
through both: exact on straight-edged cells, converging where a side must be
interpolated. Writing it needed the mesher to publish the patch parameter of
every interior vertex, which nothing could ask for before.

---

## What is still open

- **The 36 network corners.** Some are genuine features that should be
  authored creases; some are places the curve network ought to be faired and
  is not. Both are curve work, not surface work.
- **`crease` means two things.** It marks a tangent break for shading and
  surfacing, *and* it drives shutline engraving. So the P1 cannot mark its
  wheel-box edges as breaks without also engraving grooves along them. The two
  should be separate marks.
- **No interior second derivatives.** `boundaryCoonsEdgeJet` is exact on an
  edge and refuses to be asked about the interior. An analytic curvature lens
  would need the terms it drops, and should not silently inherit a formula
  that only holds on a boundary.
- **Stage 2 (NURBS curves) and Stage 3 (trimmed topology)** are untouched. The
  curve type is still a uniform chain of cubics; there is still no way to
  author a hole.

## Put to the owner — one proposed amendment

**A10 — RATIFIED and shipped.** (Owner approval of the Class-A road plan, on
the same basis as A1–A9; recorded in `AUTHORING-SPEC.md`.) `VerbName` gains
`gap`; groove engraving reads `quilt.gaps`. On the P1 the shutline pass went
from **342 vertices sunk on 8 crease curves** to **164 on 4 gap curves** — the
beltline and the sill stopped being engraved as though a door opened along
them. Closed mesh true, replay true, 573 tests green.

The reasoning it was ratified on, kept for the record: the statute already
distinguishes a panel gap from a deliberate crease and depends on the
distinction — clause 24 has panels either side of a gap referencing *the same
authored gap curve*, and amendment A2 rules that shutlines do **not** break
flow unless coincident with a character line, the gap curve being interior to
its parent flow solve. `FrameState.markGap` exists and `QuiltSpec` carries a
`gaps` set for exactly this.

What does not exist is a way to reach it. `VerbName` is the closed ratified
set; it has `crease` and no `gap`. So **no curve in any document can be a gap
today**, `quilt.gaps` is empty on every car, and the groove pass — which the
charge scopes as shutline engraving — falls back to the crease set.

The consequence is visible in the hand. The P1 engraves a 0.80 mm groove down
its beltline and its sill, which are character lines, not places a door opens.
Its actual door cut is engraved too, correctly, but only because it happens to
be creased as well.

The proposal is one verb, exactly parallel to `crease`:

```
| "gap"   // mark a curve as a panel gap — a shutline, not a tangent break
```

with `state.markGap(curveId)`, and two consequences downstream: grooves
engrave `quilt.gaps` rather than `quilt.creases`, and the tangent field keeps
correcting across a gap (A2 says a shutline does not break flow) while
continuing to leave creases alone. Adding a verb amends a ratified closed set,
so it is not taken here.

**A11 — RATIFIED and shipped as capability.** (Owner approval of the Class-A
road plan; recorded in `AUTHORING-SPEC.md`.) `VerbName` gains `fair-corners`,
`FrameState.setEndTangent` moves one control point, `cornerFairing` plans the
moves, and the instrument has a FAIR tool. On the `welded-push` fixture the
worst corner obstruction goes **10.285° → 0.000°** and the joins through it go
**0 of 2 → 2 of 2 G1, worst 0.000°**.

**Not run on the P1.** Whether this car's 32 fairable corners get faired is one
verb the owner drives, in his own history, where he can see it and undo it.

The measurement it was ratified on, kept for the record:

The 36 open corners are the entire remaining defect, and they split cleanly
in two:

```
  worst open corners          plane gap   swing A   swing B   at
  cell#1 | cell#100              74.43°    37.12°    37.01°   [4400, -520, 250]
  cell#1 | cell#98               74.43°    37.12°    37.01°   [4400,  520, 250]
  cell#1 | cell#100              72.41°    36.12°    36.16°   [4400, -560, 870]
  cell#1 | cell#98               72.41°    36.12°    36.16°   [4400,  560, 870]
  cell#107 | cell#110             3.16°     1.58°     1.58°   [1140,  932,  99]
  ...
  median over all 36 open corners:  1.58° swing
```

**Four of them are features, not faults.** They are the rear face meeting the
flanks, at both ends of the same two joins — a 72–74° break at the corner on a
join that runs smooth along its length. That is a designed edge, and the
answer there is to crease the curve, not to fair it.

**The other 32 need a curve to swing 1.6° at a vertex.** That is below what
anyone would see and it would close the last of the residual.

A fairing verb would take a vertex and a maximum swing, rotate each
participating curve's end tangent into the common plane by moving one control
point (the endpoint never moves, so nothing is unwelded), and leave anything
sharper than the break angle alone. It is the standard curve-network tangent
match, and it is authoring: it moves the model, so it belongs in the history
where it can be seen and undone.

**What is deliberately NOT done instead.** It would be technically easy to
derive a faired network at evaluation time — the way the tangent field is
derived — and never touch the document. That is the wrong trade and worth
saying out loud: the tangent field is safe precisely because Φ vanishes on
every edge and moves no authored curve, whereas a derived fairing would put
the surface somewhere other than through the curve the designer drew. Clause
20 says a cell evaluates from *its* four boundary curves. Quietly substituting
different ones would make the document stop being the model.

A third thing worth the owner's eye, not an amendment: **clause 21's candor
on Coons has been partly overtaken.** It reads "shared boundaries buy
position, not tangency", and anticipates interior control as "a legal future
extension of the cell's data, not a new patch program". Shared boundaries now
buy tangency and curvature — and the extension turned out to need no cell data
at all, because the field is derived from the quilt rather than stored in it.
What clause 21 says about *fullness* still stands unchanged: this gives the
continuity solver interior control, not the designer. Nobody can yet author
how full a panel is between its boundaries.

## What is not claimed

Parity with Alias. This is one stage of a road whose fourth stage is thirty
years wide. What can be said is narrower and checkable: the quilt is
watertight by construction, its joins are tangent- and curvature-continuous
wherever the curve network permits, the limit is measured and named, and the
same field reaches the render, the lenses, the probe and the printed STL from
one call.
