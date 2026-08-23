/**
 * The aero lens (charge §9) — stamped, and honest about its shape.
 *
 * WHAT THIS IS. A classical first-order source-panel solve over the sampled
 * quilt, with a ground-plane image. It returns a pressure-coefficient map to
 * colour the skin with. Potential flow: no viscosity, no wake, no
 * circulation, therefore no lift and no drag. That is not a limitation to be
 * apologised for later — it is the method, and everything below is arranged
 * so nothing downstream can mistake the map for a force.
 *
 * WHAT IT IS NOT.
 *  - It is not a drag figure. Drag and power come from a SOURCED Cd times the
 *    frontal area this model actually has, in `dragAndPower`, which never
 *    reads the map. A panel solve of this class cannot produce a Cd, and
 *    reporting one off the integral of Cp would be the most convincing wrong
 *    number in the whole tool.
 *  - It is not a separation prediction. Separation is beyond the method
 *    entirely. `separated` is a crude adverse-recovery flag, ASSUMED-tagged,
 *    and the lens says so in its own notes so the flag cannot travel without
 *    its warning.
 *  - It never authors. Nothing here returns geometry and nothing downstream
 *    consumes its output (overlay law, charge §2).
 *
 * SPEED INDEPENDENCE. Cp in potential flow does not depend on freestream
 * speed, so one solve serves every speed the user types; only the force
 * rescale by v² knows about MPH. That is why the solve takes no speed at all.
 *
 * WHERE THE ARITHMETIC LIVES. The solve itself is in @car/skin. This package
 * is licensed — every numeric literal has to be an argument to a licence
 * factory — and a panel solver is made of array strides and a 4π, not design
 * decisions. Keeping the two apart is what lets the four genuine assumptions
 * below stand out instead of being buried in four hundred strides. This file
 * holds the claims; @car/skin holds the maths.
 */

import type { Pt3, Quantity } from "@car/schema";
import { assumed, derived, sourced } from "@car/demand";
import { frontalAreaMm2, panelSolve } from "@car/skin";

export interface AeroMesh {
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
}

export interface AeroOptions {
  /** Panels to aim for. The binning grid is sized to land near this. */
  readonly targetPanels?: number;
  /** Freestream direction; the car travels along −X, so air comes from −X. */
  readonly freestream?: Pt3;
  /** Mirror the body in z = 0 so the road is a streamline. Default true. */
  readonly groundPlane?: boolean;
  /** Raster cell for the frontal-area projection, mm. Default 2. */
  readonly frontalCellMm?: number;
}

export interface AeroResult {
  /** The method, in one line, carried with the result so it cannot be lost. */
  readonly method: string;
  readonly panelCount: number;
  readonly panelGridMm: number;
  /** Cp per panel, and the same value spread back over every triangle. */
  readonly cpPanel: Float64Array;
  readonly cpTriangle: Float64Array;
  readonly cpMin: number;
  readonly cpMax: number;
  /**
   * Robust display bounds: the 2nd and 98th percentile of Cp. Potential flow
   * puts unbounded suction on a sharp convex edge, so the raw minimum is set
   * by one panel on the splitter lip, and colouring to it compresses the
   * whole car into two shades of blue. min and max stay reported — they are
   * the truth about the solve — but a ramp should use these.
   */
  readonly cpP02: number;
  readonly cpP98: number;
  /** ASSUMED adverse-recovery flag per panel. Never a separation prediction. */
  readonly separated: Uint8Array;
  readonly separatedCount: number;
  /** Worst residual normal velocity after the solve, as a fraction of V∞. */
  readonly residual: number;
  readonly frontalArea: Quantity<"m2">;
  readonly frontalAreaCellMm: number;
  /** |area at the cell size − area at twice it|, m². Convergence, shown. */
  readonly frontalAreaConvergence: number;
  readonly notes: readonly string[];
}

// ---------------------------------------------------------------------------
// The numbers in this lens that are actually claims, plus the conversions.
// Everything here is licensed because everything here is a claim.
// ---------------------------------------------------------------------------

const AIR_DENSITY: Quantity<"kg/m3"> = sourced(
  1.225, "kg/m3",
  "ISO 2533 International Standard Atmosphere, sea level, 15 °C",
  "the standard reference density every published Cd is quoted against",
);

/** Adverse recovery steeper than this reads as a dead zone. Crude, and said so. */
const RECOVERY_LIMIT_PER_M: Quantity<"ratio"> = assumed(
  1.6, "ratio",
  "adverse-recovery criterion: dCp/dx above 1.6 per metre flags a dead zone. " +
  "A stand-in for a boundary-layer calculation this method does not do",
);

/**
 * Air a radiator has to swallow per kW of heat: ṁ = Q/(cp·ΔT), with cp for
 * air at 1.005 kJ/kg·K and an ASSUMED 40 K air-side rise.
 */
const FLOW_PER_KW: Quantity<"ratio"> = assumed(
  0.02488, "ratio",
  "air mass flow per kW rejected: 1/(cp·ΔT) with cp 1.005 kJ/kg·K and an assumed 40 K rise",
);

/**
 * Velocity at the INLET PLANE as a fraction of free stream. Two corrections
 * live behind this number and they are not the same:
 *
 *  - at the inlet the flow is still near free stream — capture is high, and
 *    0.8 is the usual figure once spillage is allowed for;
 *  - by the CORE face it has diffused to roughly a third, which is why a
 *    radiator core is two to three times the area of the grille ahead of it.
 *
 * This check is about the inlet (charge §9), so it uses the first. The first
 * version of this constant used the second and got it backwards on top: it
 * was folded into the mass-flow constant and multiplied where it should have
 * divided, so the P1 "needed" 1.39 m² of grille at 50 km/h — most of the
 * front of the car — and the reason string contradicted its own arithmetic.
 * Both numbers are separate and ASSUMED now, so each can be argued with alone.
 */
const CAPTURE_RATIO: Quantity<"ratio"> = assumed(
  0.8, "ratio",
  "velocity at the inlet plane as a fraction of free stream, after spillage",
);

const KPH_TO_MS: Quantity<"ratio"> = derived(3.6, "ratio", "km/h to m/s: 3600 s per hour over 1000 m per km");
const HALF: Quantity<"ratio"> = derived(0.5, "ratio", "the ½ in ½ρv²");
const MM2_PER_M2: Quantity<"ratio"> = derived(1e6, "ratio", "mm² per m²: (1000 mm/m)²");
const MM_PER_M: Quantity<"ratio"> = derived(1000, "ratio", "mm per m");
const TRI_VERTS: Quantity<"count"> = derived(3, "count", "vertices per triangle");
const P02: Quantity<"ratio"> = derived(0.02, "ratio", "2nd percentile, the low end of the robust display range");
const P98: Quantity<"ratio"> = derived(0.98, "ratio", "98th percentile, the high end of the robust display range");
const DEFAULT_PANELS: Quantity<"count"> = assumed(
  700, "count",
  "panels to aim for: enough to resolve a fender and a screen, few enough that " +
  "the dense solve stays well under a second in a browser",
);
/**
 * How many decimals a reported number is given to. This is a claim, not
 * formatting: three decimals on a Cp says the method is worth reading to a
 * thousandth and no further, and four on the residual because that is the
 * number that has to be near zero for any of the rest to mean anything.
 */
const REPORT_DP: Quantity<"count"> = derived(3, "count", "three decimals on a reported Cp or area");
const RESIDUAL_DP: Quantity<"count"> = derived(4, "count", "four decimals on the residual, the number that must be near zero");

const DEFAULT_FRONTAL_CELL: Quantity<"mm"> = assumed(
  2, "mm", "raster cell for the frontal-area projection; the report shows the change on doubling it",
);

/**
 * The solve. Cp on every panel and on every triangle behind it, plus the
 * frontal area this body actually has.
 */
export function aeroLens(mesh: AeroMesh, opts: AeroOptions = {}): AeroResult {
  const ground = opts.groundPlane ?? true;
  const cell = opts.frontalCellMm ?? DEFAULT_FRONTAL_CELL.value;
  const sol = panelSolve(mesh, {
    targetPanels: opts.targetPanels ?? DEFAULT_PANELS.value,
    ...(opts.freestream ? { freestream: opts.freestream } : {}),
    groundPlane: ground,
  });
  const n = sol.panelCount;

  // Crude adverse-recovery flag. Walk to the nearest panel downstream of each
  // one and ask how fast the pressure is climbing back. This is NOT a
  // separation prediction, and the notes below say so.
  const separated = new Uint8Array(n);
  const limitPerMm = RECOVERY_LIMIT_PER_M.value / MM_PER_M.value;
  for (let i = 0; i < n; i++) {
    const ix = sol.centroids[i * 3]!;
    const iy = sol.centroids[i * 3 + 1]!;
    const iz = sol.centroids[i * 3 + 2]!;
    let bestJ = -1;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = sol.centroids[j * 3]! - ix;
      if (dx <= 0) continue;                       // downstream only
      const dy = sol.centroids[j * 3 + 1]! - iy;
      const dz = sol.centroids[j * 3 + 2]! - iz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < bestD) { bestD = d; bestJ = j; }
    }
    if (bestJ < 0 || bestD === 0) continue;
    if ((sol.cpPanel[bestJ]! - sol.cpPanel[i]!) / bestD > limitPerMm) separated[i] = 1;
  }
  let separatedCount = 0;
  for (let i = 0; i < n; i++) separatedCount += separated[i]!;

  let cpMin = Infinity;
  let cpMax = -Infinity;
  for (let i = 0; i < n; i++) {
    cpMin = Math.min(cpMin, sol.cpPanel[i]!);
    cpMax = Math.max(cpMax, sol.cpPanel[i]!);
  }
  const sortedCp = Array.from(sol.cpPanel).sort((a, b) => a - b);
  const pct = (f: number): number =>
    sortedCp.length === 0 ? 0 : sortedCp[Math.min(sortedCp.length - 1, Math.floor(f * sortedCp.length))]!;

  const fineMm2 = frontalAreaMm2(mesh, cell);
  const coarseMm2 = frontalAreaMm2(mesh, cell * 2);

  const notes = [
    "Potential flow. No viscosity, no wake, no circulation — therefore no lift and no drag.",
    "Cp is speed-independent below racing speeds: one solve serves every speed the box is set to.",
    `Separation is beyond this method. ${separatedCount} panels carry the ASSUMED adverse-recovery ` +
    `flag (dCp/dx > ${RECOVERY_LIMIT_PER_M.value} per metre); that is a stand-in for a ` +
    "boundary-layer calculation, not a prediction.",
    "Drag and power never come from this map. Ask dragAndPower(), which needs a SOURCED Cd.",
    sol.solved
      ? `Residual normal velocity ${sol.residual.toFixed(RESIDUAL_DP.value)} of V∞ after the solve.`
      : "SINGULAR MATRIX — the solve did not converge and this map means nothing.",
  ];

  return {
    method:
      `first-order source panels on ${n} panels (${sol.gridMm.toFixed(0 as number)} mm binning of ` +
      `${Math.floor(mesh.indices.length / TRI_VERTS.value)} triangles), point-source influence with an exact ` +
      `σ/2 self term${ground ? ", ground-plane image in z = 0" : ", no ground plane"}`,
    panelCount: n,
    panelGridMm: sol.gridMm,
    cpPanel: sol.cpPanel,
    cpTriangle: sol.cpTriangle,
    cpMin: sol.solved ? cpMin : NaN,
    cpMax: sol.solved ? cpMax : NaN,
    cpP02: sol.solved ? pct(P02.value) : NaN,
    cpP98: sol.solved ? pct(P98.value) : NaN,
    separated,
    separatedCount,
    residual: sol.residual,
    frontalArea: derived(fineMm2 / MM2_PER_M2.value, "m2",
      `union of the skin projected on YZ, rasterised at ${cell} mm`),
    frontalAreaCellMm: cell,
    frontalAreaConvergence: Math.abs(fineMm2 - coarseMm2) / MM2_PER_M2.value,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Forces — the only place a drag number is allowed to come from
// ---------------------------------------------------------------------------

export interface DragEstimate {
  readonly drag: Quantity<"N">;
  readonly power: Quantity<"W">;
  readonly speed: Quantity<"km/h">;
  readonly density: Quantity<"kg/m3">;
  /** Empty when the Cd is SOURCED. Otherwise says the number is a guess. */
  readonly caveat: string;
}

/**
 * D = ½ρv²·Cd·A, P = D·v. The Cd must come from outside — a panel solve of
 * this class cannot produce one and this function will not pretend it can.
 * If the Cd handed in is not SOURCED, the caveat says so and travels with the
 * result rather than being dropped at the call site.
 */
export function dragAndPower(
  speedKph: Quantity<"km/h">,
  cd: Quantity<"ratio">,
  frontalArea: Quantity<"m2">,
  density: Quantity<"kg/m3"> = AIR_DENSITY,
): DragEstimate {
  const v = speedKph.value / KPH_TO_MS.value;
  const d = HALF.value * density.value * v * v * cd.value * frontalArea.value;
  const chain =
    `½ρv²·Cd·A: ρ ${density.value} kg/m³ [${density.license.tag}], v ${speedKph.value} km/h, ` +
    `Cd ${cd.value} [${cd.license.tag}], A ${frontalArea.value.toFixed(REPORT_DP.value)} m² [${frontalArea.license.tag}]`;
  return {
    drag: derived(d, "N", chain),
    power: derived(d * v, "W", `drag × speed — ${chain}`),
    speed: speedKph,
    density,
    caveat: cd.license.tag === "SOURCED" ? "" :
      `the Cd is ${cd.license.tag}, so this force is only as good as that guess`,
  };
}

// ---------------------------------------------------------------------------
// Inlet versus cooling demand — a pure geometry check (charge §9)
// ---------------------------------------------------------------------------

export interface InletCheck {
  readonly required: Quantity<"mm2">;
  readonly available: Quantity<"mm2">;
  readonly ratio: number;
  readonly adequate: boolean;
  readonly chain: string;
}

/**
 * Geometry only: the inlet a cooling load needs at a given speed, against the
 * inlet the body actually has. No heat transfer, no core model — this asks
 * whether enough air can physically get in, which is a question about area.
 */
export function inletAdequacy(
  availableMm2: Quantity<"mm2">,
  coolingPower: Quantity<"kW">,
  speedKph: Quantity<"km/h">,
  density: Quantity<"kg/m3"> = AIR_DENSITY,
): InletCheck {
  const v = Math.max(speedKph.value / KPH_TO_MS.value, Number.EPSILON);
  const mdot = FLOW_PER_KW.value * coolingPower.value;      // kg/s
  const requiredMm2 = (mdot / (density.value * v * CAPTURE_RATIO.value)) * MM2_PER_M2.value;
  const chain =
    `ṁ = ${FLOW_PER_KW.value} kg/s·kW [${FLOW_PER_KW.license.tag}] × ${coolingPower.value} kW ` +
    `[${coolingPower.license.tag}] = ${mdot.toFixed(2 as number)} kg/s; A = ṁ/(ρ·v·${CAPTURE_RATIO.value.toFixed(REPORT_DP.value)}) ` +
    `[capture ${CAPTURE_RATIO.license.tag}] at ${speedKph.value} km/h. Sustained PEAK rejection: at low ` +
    "speed this is the number a fan exists to cover, not a body failure";
  return {
    required: derived(requiredMm2, "mm2", chain),
    available: availableMm2,
    ratio: availableMm2.value / requiredMm2,
    adequate: availableMm2.value >= requiredMm2,
    chain,
  };
}

export { AIR_DENSITY, RECOVERY_LIMIT_PER_M, FLOW_PER_KW, CAPTURE_RATIO };
