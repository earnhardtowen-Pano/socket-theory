/**
 * Anchorage law — every demand that bears mass must terminate inside a
 * reinforced substrate member. Failure is a typed violation naming the
 * demand, its principal, and the nearest member — never a crash.
 */

import type { MemberRecord, SolveViolation } from "@car/schema";
import { containsPoint, idCompare, pointBoxDistance, worldBox } from "./geometry.js";
import { anchorPointOf, sortedDemands, type PackState } from "./state.js";

export function auditAnchorage(
  state: PackState,
  members: readonly MemberRecord[],
): SolveViolation[] {
  const out: SolveViolation[] = [];
  const membersSorted = [...members].sort((a, b) => idCompare(a.id, b.id));
  for (const pid of state.placedIds) {
    const part = state.parts.get(pid);
    const origin = state.origins.get(pid);
    if (part === undefined || origin === undefined) continue;
    for (const d of sortedDemands(part)) {
      if (d.massBearing !== true) continue;
      const anchor = anchorPointOf(part, d, origin);
      let held = false;
      for (const m of membersSorted) {
        if (m.reinforced && containsPoint(worldBox(m.box, m.at), anchor)) {
          held = true;
          break;
        }
      }
      if (held) continue;
      let nearest: MemberRecord | undefined;
      let nearestDist = Number.POSITIVE_INFINITY;
      for (const m of membersSorted) {
        const dist = pointBoxDistance(worldBox(m.box, m.at), anchor);
        if (dist < nearestDist) {
          nearest = m;
          nearestDist = dist;
        }
      }
      const where =
        nearest !== undefined
          ? `nearest member is ${nearest.id} at ${nearestDist} mm` +
            (nearest.reinforced ? "" : " (that member is not reinforced)")
          : "no members exist in this input";
      out.push({
        kind: "anchorage",
        demandId: d.id,
        partIds: [pid],
        detail:
          `anchorage law: demand ${d.id} (principal: ${d.principal} — ${d.reason}) on part ${pid} ` +
          `bears mass but its anchor point [${anchor.join(", ")}] mm terminates inside no ` +
          `reinforced member; ${where}`,
      });
    }
  }
  return out;
}
