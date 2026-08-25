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

## Mirror symmetry — the lens nothing had, and what it found

A car authored down both sides ought to BUILD down both sides. Nothing in the
package asked. G1 reads a seam, G2 reads a curvature, the closed-mesh check
reads a topology, and not one of them compares a car to its own reflection —
so a left-right disagreement was invisible to every probe and glaring to a
person. `mirrorSymmetry` (in `@car/mesh`) is a distance in millimetres from
every vertex to the nearest vertex of the mirrored body, grid-hashed, and both
build reports print it now.

It found three things, in order of how badly they wanted finding.

**One: the mirror law duplicates half a car over a hair.** A cell on
`mirror: "auto"` gets a twin generated whenever its reflection is not already
present *to the quantiser's precision*. The MX-5's body is authored on both
sides and never needed the law; the moment anything made the two flanks differ
by a micron, 53 body cells acquired phantom twins laid over the real ones and
the print mesh opened 784 edges. That is the "768 edges" the beltline was
blamed for and never caused. The body is `mirror-detach`ed before any cut now,
by descent through the six box faces; the wheels, which genuinely are authored
one side only, stay on the law.

**Two: `fair-corners` was restyling cars and diverging.** Three defects, all
in the same place, all measured on the MX-5 and none visible on the P1 (whose
network is gentler and converges in one pass):

  · *No ceiling on a swing.* A11 promises "coplanarity needs about 1.6° and is
    invisible". The plane gap bounds a swing at gap/2 — a theorem, now a test —
    and at a wheel-arch mouth breaking 26° that bound is 13°. The pass asked
    for 12°, moved the flank out 66 mm, and cost sixteen G1 joins: it made the
    network look better and the SURFACE worse. `maxSwingDeg` defaults to 6°;
    wider moves are dropped, counted and reported.
  · *An unstable iteration.* Two passes left the flanks 0.70 mm apart and three
    passes 7.8 mm. The second pass now rotates only ends the first did not, at
    a shrinking ceiling and a widening tolerance — a later pass exists to fix
    what a NEIGHBOUR's move disturbed, not to re-litigate its own.
  · *A corner read a hair off the corner.* Conditioned like 1/ε, so 2 × 10⁻¹²
    mm of rounding between two mirrored flanks came back as 0.15° of plan and
    flipped a 1° tolerance on one side of the car only. It reads AT the corner
    now, and falls back to ε only where the corner itself is degenerate.

With all three the MX-5's curve network builds mirror-exact: **0.0000 mm.**

**Three, and unfixed: the tangent field is not equivariant under reflection.**
This is the finding that matters and it is on BOTH cars.

```
                    bare Coons blend      after the field
P1                  0.0000 mm             0.9418 mm   ·   82 of 13,816 vertices
MX-5                0.0000 mm             7.0425 mm   · 3,434 of 25,904 vertices
```

The curve network is symmetric to the last bit and the G0 blend over it is
symmetric to the last bit. Apply `tangentField` and the two flanks disagree by
up to 7 mm. G1 still reads 1.6 × 10⁻¹⁵° and the mesh is still closed — the
continuity is not what broke. The SHAPE is.

What it is not, each ruled out by measurement rather than argument:

| suspect | test | result |
|---|---|---|
| the polynomial fit | `polynomial: false` — raw bisector, no fit at all | 1.54 mm, unchanged |
| the span ladder | `maxSpans` 1 … 32 | 7.09 … 7.04 mm, flat |
| the corner window | `cornerFadeFloor: 1` | 7.06 mm, unchanged |
| the fold guard | `minSeparation` 10⁻⁹ … 3 × 10⁻² | 7.04 mm across the sweep |
| break-angle classification | 20° … 50° | 3.9 … 7.0 mm, never zero |
| the G2 layer alone | order 1 vs order 2 | 1.54 → 7.04; both orders carry it |

So it is in the core construction, not in any fit, threshold or tolerance —
and the most likely remaining candidate is the one thing that is NOT
reflection-invariant about a Coons patch: its side indexing. Φ attached to
side `k` decays across the opposite parameter, and `u` and `v` are not
interchangeable once a decay profile is attached to each edge. Two mirrored
cells whose shared edge lands on a different `k` would then blend the same
correction differently. That is a hypothesis with a clear test and it is not
tested yet.

Until it is, the honest statement is: **the surface's shape is not a function
of the curve network alone.** Its continuity is, exactly and by construction,
and that is the guarantee this project rests on. But two networks identical up
to reflection produce bodies that differ by millimetres, and a Class-A body
cannot be left- and right-hand different.

---

## The third car — a Jaguar E-Type coupe, and what a ROOF cost

The P1 is the demonstrator the surfacing grew up against and the MX-5 is the
control that proved it general. Both are open. So in two cars nothing had ever
put bodywork over an occupant's head, and `cabinLens` had carried a headroom
branch, a fault string for a head through a roof, and a `headAboveBody` sign
convention that no body could make it exercise. Every number it had ever
published about a head was **"+464 mm, in the open air, which a roadster
means."**

A Series 1 fixed-head coupe was chosen to make it say something else. It also
disagrees with both predecessors on proportion in the way that matters: the
wheel is 674 mm against the MX-5's 592, the track is 1270 under a body 1657
wide — so the flank stands 96 mm outboard of the tyre where the MX-5 has 35 —
and 1240 mm of the car sits ahead of the front axle.

| | P1 | MX-5 | E-Type |
|---|---|---|---|
| G1 worst | 2.07° | 16.42° | **3.11°** |
| G1 joins | 62/64 | 71/79 | 97/101 |
| G2 median rel. | 0.154 % | 0.0035 % | **0.0002 %** |
| network worst | 72° | 16.41° | **3.11°** |
| profile vs the real car | — | 0/15 outside 40 mm | 0/16 outside 40 mm |

### Six master lines, not four

A body described as a rocker, a beltline and one surface over the top between
them is enough for a roadster, whose roof is a separate assembly. It is not
enough for a coupe: with one band from beltline to beltline the windscreen
cannot be told from the roof above the driver's shoulder, because they are the
same cell. Every closed car has a third longitudinal seam.

Two plan cuts across the deck — before a control point has moved, because
cutting after shaping is what opens a print mesh — give the body a centre band
and two side bands. On this car in particular they land on real panel edges:
ahead of the scuttle they are the wing crowns and what they enclose is the
bonnet's centre panel; behind it they are the roof rails and what they enclose
is screen, roof and backlight in one band, while the side glass and the
quarters stay with the flank. So the glazing is not built at all, it is
ASSIGNED, to cells the body already has.

It also means the E-Type's bonnet — one forward-hinged clamshell carrying the
nose, both wings and a quarter of the car — is described by a single ring of
gap marks at the scuttle. The MX-5 needed six cuts and a split to describe a
bonnet. The difference is the car, not the tool.

### Four things the car found, three of them in the instrument

**The interpolator was flat at every knot.** Every plan and height profile was
a per-span smoothstep, which is flat at BOTH ends of every span by
construction. Put a knot at a wheel-arch mouth and the sill leaves it
horizontally — while the arch arrives at 79 degrees, because a quarter circle
at its mouth is nearly vertical. Eight corners at 87° out of plane, one at
every mouth of every arch, and a 57 mm bulge where the field tried to blend
across them. Nothing in the station table was wrong. Replacing it with a
monotone cubic (Fritsch–Carlson: through every knot, no overshoot, and a
secant slope THROUGH a knot) plus knots 90 mm either side of each mouth, and
marking the mouths as the folds they are, took the worst network corner from
**87° to 3.11°**.

**The flank bow overshot its own target.** `d` is a control-point offset and a
cubic does not reach its control points, so asking for a bulge and dividing by
0.75 left the car 19 mm wide at every station from the front axle back:
authored 1657, built 1695, and the report said both numbers without either
being wrong. The caller now names the PEAK and the code bisects for the offset
that delivers it. Built width 1658.

**The cabin lens was reading the wrong mesh, and had been for two cars.** It
was handed the whole print — chassis, wheels and glazing — so it read a
beltline off a wheel. Worse, once that was fixed by handing it skin-and-trim,
it found a HOLE where the rear window is: on a fastback the panel over the
driver's head IS the backlight. The lens needs the envelope — skin, trim and
glass — and the profile check needs the body without glass, and those are two
different meshes.

**`beltZ` climbs into the side glass on a car with real tumblehome.** It is
read off the outer QUARTER of the half-width, which is the beltline on an open
car and is a long way up the glass on a coupe. An E-Type's beltline came back
at 1044 mm against a true 958, so the gap to the roof read as 87 mm rather
than 173 — and a head 192 mm THROUGH the roof was reported as a head in the
open air. The fix was to stop using a body feature as the datum: **there is a
roof over an occupant when there is bodywork in the occupant's own column
above the occupant's own shoulder.** No threshold on a body dimension, and the
right answer on a roadster whose shoulders are in the wind by construction.
The tumblehome reading is left as the lens computes it and relabelled
*greenhouse rake* on this car, because on a coupe that is what it measures.

### And then it said something true about the car

    head under the roof   NONE — the head is 192 mm THROUGH the roof

Which the real coupe is famous for. Part of it is the occupant model, which
sits at SAE J4004's 25 degree back angle where an E-Type's seat reclines a
long way past that — but not 192 mm of it.

### A monocoque has no body mounts, and that IS the reading

The E-Type is a monocoque tub from the scuttle back and a bolted tubular frame
ahead of it. Both are authored. The chassis lens runs the SAME rule it runs on
the MX-5 — a pad is a shim from the member's top face up to the body's
underside, and it exists only where there is daylight to shim — and gets the
opposite answer:

| | MX-5 (body-on-frame) | E-Type (monocoque) |
|---|---|---|
| structure showing | 0 | 0 |
| slung under the floor | 2,415 points | 461 |
| body mounts | 4 of 4 at 3 mm | **none, at any station** |
| wrapped, not mounted | x 620, 3320 | x 2700, 3180, 3660 |

On a body-on-frame car the pan sits above the rail and every pad is real. On a
tub the floor pan is BELOW the longeron — the member is inside the body,
welded to it — so there is nothing for a pad to span, at any station. If the
same rule had given the same answer on both cars, one of the two would be
wrong.

### What it could not do

A cabin is a VOID and the mesher hands back a closed solid. An open car's
cockpit exists — it is a well cut into the top of the solid and the lens reads
its walls — and a coupe's does not. So `shoulderRoom`, `hipRoom` and
`hipAboveWell` all come back null on this body, and worse, before the guard
went in, `hipRoom` found the WHEELHOUSE and reported the gap between the two
rear arches as 1,227 mm of cabin. Reported as the limit it is. The instrument
can measure the cabin of an open car and not a closed one, and that asymmetry
is the largest single gap this car exposed.

## The structure lens — is it one structure, and does it reach the wheels?

`chassisFit` asks where the structure sits relative to the SKIN. It answers
containment, clearance and registration, and it is silent about the two
questions that decide whether a chassis is a chassis at all: whether the
members TOUCH, and whether anything reaches what the car carries.

Nothing had ever asked. Three cars in, every wheel on every one of them was a
solid placed at the track and the axle station with **no member within a third
of a metre of it.** They rendered correctly, sectioned correctly, and passed
the containment, clearance and registration readings — because none of those
asks. `structureFit` asks, and the first run said so in one line:

    wheel-FL is 395 mm from the nearest member — the wheel is drawn, not carried

### What it found immediately

**The MX-5's sills were not attached to anything.** Authored 275 mm outboard
of the rails with nothing between them, so what the report called a chassis
was three separate bodies: a frame, and two sills floating beside it. Every
unibody on earth has outriggers; this one did not, and no probe could see it.

**The E-Type's engine was placed through its own bonnet.** The moment the
front frame started reading its dimensions off the engine's placed envelope
instead of being typed, the frame followed the engine out through the skin —
317 structure points outside the body where it shows. The engine's crown was
865 mm up under a bonnet 800 mm tall, its front face was 457 mm from the nose,
and the radiator was placed at 820 — *inside the engine*. The packing solve
had been publishing all three since the first car.

**Nothing was mounted to the pedal box.** 30 kg of it, 161 mm from the nearest
member, on a car with a bulkhead 362 mm behind it.

### What it needed to be able to say that

`strut` — a member between two arbitrary points. Until this week there was no
way to author one, which is why three cars had frames made entirely of ladders
and no car had a wishbone. A box of the right length is taped along x and then
rigidly MOVED onto the axis; every curve is straight, so an affine map of its
control points is exact rather than a fit. Every target is computed before any
point moves, because the twelve curves share eight corners and mapping a
corner twice folds the box.

A member REGISTER, so a lens can read the structure without re-deriving it
from a triangle soup. The register and the mesh are two descriptions of the
same thing computed two different ways — and the first time they were compared
they disagreed: a front frame mirrored in the register and authored on one
side only, because a single detach loop after the build had taken every tube
out of the mirror law. Mirroring is per member now.

### Both cars, same rule

| | MX-5 | E-Type |
|---|---|---|
| members | 46 | 52 |
| bodies | **1** (was 3) | **1** |
| parts carried | 10 of 10 | 10 of 10 |
| wheel to nearest member | 26 mm | 30 mm |
| structure showing | 0 | 0 |

### And the shape now comes from what it carries

The frame's nose is the radiator's front face less a tube's clearance. Its
tube spacing is the engine's width plus the same. Its upper tube SLOPES,
because running level at the engine's crown leaves the bonnet three hundred
millimetres before the nose — so its front end comes off `crownZ` at the
frame's own nose and its back off the engine, and neither end is typed. The
tunnel runs from the gearbox's front face to the differential and its section
is the larger of the two envelopes plus clearance; it had been typed to start
800 mm behind the bellhousing it covers. The rear cage is sized off the rear
suspension's own envelope.

None of that is new information. The solve has been placing every one of those
parts since the first car and publishing an envelope for each. Nothing had
ever read them.

## The chassis lens — the half of the car nothing was measuring

The MX-5 had a frame from the day it was built, and until this lens existed
the frame and the body were two sets of boxes that happened to occupy the same
space. Move the rails 200 mm and nothing complained; no number changed. Two
things that cannot disagree are not related, they are merely adjacent.

`chassisFit` asks three questions the geometry can answer — containment,
clearance, registration — and every one of them found something on the first
run:

| | first reading | after |
|---|---|---|
| structure outside the skin where it shows | 5 points, worst 27 mm | **0** |
| body mounts carrying the body | 0 of 8 | **4 of 4** |
| mount standoff | 448 / 448 / 520 / 520 / 124 / 124 / 498 / 498 mm | **3 / 3 / 3 / 3** |
| structure tight against a covering panel | 229 of 3,112 | 21 of 3,616 |

Four of the readings were defects in the lens, not the car, and each one is
worth more than the number it produced:

**It walked `positions`, not the vertices its own indices reference.** The
structure and the body share one buffer, so the "frame" it measured was the
whole car and it reported the windscreen header as an 885 mm frame protrusion.
`usedVertices` and `xRange` exist because of this.

**It had one number for two opposite things.** A frame is *meant* to be
visible from underneath — that is what body-on-frame means — and calling that
a protrusion called a chassis doing its job a defect. Now `exposedBelow` is
reported and `outsideVisible` is the fault.

**It read the mount column bottom-up.** A pad in the sky above the deck came
back as buried 850 mm inside a car it was nowhere near. The surface a pad
would touch is the first one ABOVE it when the pad is in the air and the first
one BELOW it when the pad is in bodywork, and those are different questions.

**It faulted its own welds.** A car whose structure is welded to its floor
touches its own skin on purpose — at the mount pads, along the rail flanges,
over the tunnel — and every one of those reads zero millimetres. Faulting the
closest single point called three welds a defect and said nothing about the
defect the reading exists for, which is a REGION of panel drawn tight over
structure. Two changes fixed it: `coverClearance`, which only counts skin
BETWEEN the eye and the structure and is told where the floor pan is so it can
skip it; and a fault raised on how MANY points are tight rather than on the
worst one.

### And what it found in the car

**The floor did not know where the rails were.** `floor: PAD_TOP` in the
station table sets the CROWN of an arch whose ends are the rockers, so over
the rail the floor came out 12 to 27 mm below the number that was typed —
enough for the outer skin to pass straight through the cowl crossmember. The
fix is a measurement, not a bigger constant: `undersideAt(x, y)` reads the
body's underside off the section curves the surfacing pass just placed, and
`clearTheRails` lifts the crown by exactly what the arch eats, blended over
700 mm either side. Lifting the mount's own station and leaving its neighbours
put a 40 mm step into the underbody and took the network from 16° out of plane
to 55°. A floor is a surface, so a correction to it has to be one too.

**A pad is a shim, and its height is read rather than typed.** All four were
the same 12 mm and the two end pairs came back 167 and 115 mm from bodywork
they were supposed to be carrying — because at the nose and the tail the body
does not sit on the frame at all, it WRAPS it. A crossmember inside a front
valance is a crash structure; calling it a body mount was a claim the geometry
never supported. Those two stations are now reported as wrapped and are not
mounts.

**The tunnel was pressing into the cabin floor down its whole length.** The
cockpit floor was typed at 410 with a tunnel topping out at 402. It is now
`max(typed, tunnelTop + MIN_SKIN_CLEARANCE)` — and that threshold is imported
from the lens, so the body clears the structure by exactly the figure the lens
will hold it to.

The residual 3 mm on all four mounts is the surfacing field: the curve says
`PAD_TOP` and the built mesh reads 3 mm under it. Inside the 15 mm the mount
tolerance allows, and reported rather than rounded away.

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
- **The field's reflection asymmetry**, above. Measured, bounded, and the six
  cheapest explanations ruled out; the cause is not yet found.
- **A closed body has no interior to measure.** Every cabin reading that needs
  a void returns null on a coupe. Authoring a hollow shell needs the ability
  to author a hole, which is Stage 3 (trimmed topology) and untouched.
- **`makeSubstrate` knows one construction style.** `body-on-frame` is what
  the E-Type's config has to declare for a car that is a monocoque with a
  bolted front frame; the real structure is authored in the build script and
  the gap is recorded rather than papered over. A monocoque style is the
  amendment this car asks for.
- **The control net disagrees with the evaluator on the MX-5** — 6.9 × 10¹ mm
  worst against a gate of 10⁻⁹, where the P1 reads 3 × 10⁻¹². The MX-5 is the
  first car whose cell sides span several chain segments, which is the obvious
  place to look. The build report prints it against its gate rather than
  hiding it, and the export claim does not hold on this car until it is fixed.

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
