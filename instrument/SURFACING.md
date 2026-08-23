# Surfacing — where the body actually stands

Owen asked whether Alias can see us in their rear-view and chose to race them
on surfacing. This is the record of the first stage of that race: what was
built, what it measures, and what it does not do. Every number below comes out
of a command named against it and is reproducible at this commit.

```
npx tsx scripts/build-p1.ts        the body, with the numbers in the build output
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

Across the whole body, median cross-curvature gap **9.4e-6 → 4.3e-19 /mm**.

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

**A10 (extends the verb set — the gap mark).** The statute already
distinguishes a panel gap from a deliberate crease and depends on the
distinction: clause 24 has panels either side of a gap referencing *the same
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

**A11 (extends the verb set — corner fairing).** Not proposed as strongly as
A10; put here because the measurement now says exactly what it would buy and
what it would cost, which it did not before.

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
