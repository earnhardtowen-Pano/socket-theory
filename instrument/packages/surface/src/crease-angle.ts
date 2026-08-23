/**
 * The break angle — the one place the tool decides that a join is a FEATURE
 * rather than a defect.
 *
 * It is used twice and it must be the same number both times:
 *
 *  - `creaseNormals` (@car/mesh) splits shading normals across any mesh edge
 *    sharper than this, so a body line reads as a body line instead of being
 *    smeared away by averaging;
 *  - `tangentField` (@car/surface) refuses to prescribe tangent continuity
 *    across any patch join sharper than this, so the surfacing pass cannot
 *    quietly round off a wheel-box corner in pursuit of a smoothness metric.
 *
 * If the two numbers ever drifted apart the result would be visibly wrong in
 * one direction or the other: a join the field smoothed but the renderer
 * creased looks faceted despite being smooth, and a join the field broke but
 * the renderer smoothed looks smeared despite being sharp. So the constant
 * lives here, once, and both packages read it. A test pins them together.
 *
 * WHAT AN ANGLE THRESHOLD CANNOT DO. It cannot tell an authored break from a
 * gross surfacing defect — a genuinely broken 60° join is left alone for the
 * same reason a right-angled box corner is. That is a real limitation and the
 * answer to it is authored creases: a curve the designer has MARKED is
 * excluded on the designer's say-so, and needs no threshold. The threshold is
 * the backstop for everything nobody got round to marking, and the count of
 * joins it caught is reported so it cannot hide a body full of them.
 *
 * 48° is the angle a fender crown turns over in a hard body line and a shade
 * more than a windscreen-to-roof transition, which is the pair it has to
 * separate. It is ASSUMED and owner-adjustable.
 */

/** Degrees. Sharper than this, at a mesh edge or a patch join, is a feature. */
export const DEFAULT_CREASE_ANGLE = 48;
