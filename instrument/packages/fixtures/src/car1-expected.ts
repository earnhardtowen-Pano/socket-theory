/**
 * Expected hard points for car one, DERIVED from the public inputs with the
 * chains shown. Station origin (X=0) is the FRONT AXLE center; X runs aft,
 * Y across (centerline 0), Z up from the ground plane.
 *
 * Tolerance: ±15 mm on derived hard points, exact on inputs — the charge's
 * §12 calibration, ASSUMED and owner-adjustable.
 */

import type { Pt3, Quantity } from "@car/schema";
import { assumed, derived, qDiv, qMul, qAdd } from "@car/demand";
import { car1 } from "./car1-spec.js";

export const acceptanceTolerance: Quantity<"mm"> = assumed(
  15, "mm", "acceptance calibration per charge §12 — owner-adjustable",
);

/** Tire radius from the sidewall math: rim×25.4/2 + width×aspect/100. */
export const tireRadius: Quantity<"mm"> = qAdd(
  qDiv(qMul(car1.tire.rimIn, derived(25.4, "mm", "inch (exact definition)"), "mm"),
       derived(2, "ratio", "diameter to radius"), "mm"),
  qDiv(qMul(car1.tire.widthMm, car1.tire.aspectPct, "mm"),
       derived(100, "ratio", "aspect is a percentage"), "mm"),
);

const halfFrontTrack = car1.frontTrack.value / 2;
const halfRearTrack = car1.rearTrack.value / 2;
const wb = car1.wheelbase.value;
const r = tireRadius.value;

export interface ExpectedHardPoint {
  readonly label: string;
  readonly at: Pt3;
  readonly tolerance: Quantity<"mm">;
}

export const expectedHardPoints: readonly ExpectedHardPoint[] = [
  { label: "wheel-center-FL", at: [0, -halfFrontTrack, r], tolerance: acceptanceTolerance },
  { label: "wheel-center-FR", at: [0, halfFrontTrack, r], tolerance: acceptanceTolerance },
  { label: "wheel-center-RL", at: [wb, -halfRearTrack, r], tolerance: acceptanceTolerance },
  { label: "wheel-center-RR", at: [wb, halfRearTrack, r], tolerance: acceptanceTolerance },
  { label: "front-axle-mid", at: [0, 0, r], tolerance: acceptanceTolerance },
  { label: "rear-axle-mid", at: [wb, 0, r], tolerance: acceptanceTolerance },
  { label: "ground-plane", at: [wb / 2, 0, 0], tolerance: acceptanceTolerance },
];
