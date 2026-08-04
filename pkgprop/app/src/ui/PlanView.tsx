import type { SolveResult } from '@pkgprop/core';
import { stationsOf } from '../model/stations.js';
import {
  clampLinePoint,
  denorm,
  frameOf,
  LINE_DEFS,
  linePoints,
  norm,
  paramValue,
  smoothPath,
  type DrawingState,
} from '../state/lines.js';
import type { Action } from '../state/store.js';
import { ViewportSvg, type Mapper } from './viewport/ViewportSvg.js';

/**
 * PLAN — the same car from above, on the same station axis as SIDE.
 * The right half is authored; the left half is its mirror. Wheels, cabin,
 * occupants, and hard masses render at their licensed widths.
 */
export function PlanView({
  result,
  drawing,
  dispatch,
}: {
  result: SolveResult;
  drawing: DrawingState;
  dispatch: React.Dispatch<Action>;
}) {
  const g = result.geometry;
  const frame = frameOf(result);
  const halfMax = (result.bounds.overall_width.upper?.value ?? g.overallWidth) / 2;
  const def = LINE_DEFS.find((d) => d.id === 'plan_side')!;
  const planFrame = { ...frame, zMax: halfMax };

  const tireHalfSection = paramValue(result, 'tire_section_width', 245) / 2;
  const shoulder = paramValue(result, 'anthro_shoulder_width', 500);
  const ptHalfWidth = paramValue(result, 'arch_powertrain_width', 600) / 2;

  const rawPts = linePoints('plan_side', drawing, result);
  const pts = rawPts.map((p) => {
    const { x, z } = denorm(planFrame, p);
    return clampLinePoint(def, result, x, z);
  });

  const beginDrag = (m: Mapper, index: number) => (down: React.PointerEvent) => {
    down.preventDefault();
    down.stopPropagation();
    const basePts = [...rawPts];
    const apply = (e: PointerEvent, commit: boolean) => {
      const w = m.toWorld(e.clientX, e.clientY);
      const c = clampLinePoint(def, result, w.x, Math.abs(w.y));
      const next = [...basePts];
      next[index] = norm(planFrame, c.x, c.z);
      dispatch({ type: 'set-line', line: 'plan_side', pts: next, commit });
    };
    const move = (e: PointerEvent) => apply(e, false);
    const up = (e: PointerEvent) => {
      apply(e, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const boxes = [g.frontBox, g.rearBox, g.battery].filter(Boolean) as {
    x0: number;
    x1: number;
  }[];

  return (
    <div className="view-block" data-testid="plan-view">
      <div className="view-title">
        <span>PLAN</span>
        <span className="view-note">right half is authored; the left is its mirror</span>
      </div>
      <ViewportSvg
        view="plan"
        yUp
        fitBox={{ x0: frame.xMin - 140, x1: frame.xMax + 140, y0: -halfMax - 130, y1: halfMax + 130 }}
        rulerEdge="bottom"
        stations={stationsOf(result)}
        minHeightPx={260}
        maxHeightPx={520}
      >
        {(m) => (
          <>
            {/* centerline */}
            <line x1={0} y1={m.sy(0)} x2={m.pxW} y2={m.sy(0)} className="centerline" />

            {/* wheels at the real track and section width */}
            {[0, g.wheelbase].map((ax) =>
              [1, -1].map((side) => (
                <rect
                  key={`${ax}:${side}`}
                  x={m.sx(ax - g.tireRadius)}
                  y={m.sy((g.track / 2) * side + tireHalfSection)}
                  width={(g.tireRadius * 2) / m.mmPerPx}
                  height={(tireHalfSection * 2) / m.mmPerPx}
                  className="hard-mass wheel-plan"
                >
                  <title>tire on the track line</title>
                </rect>
              )),
            )}

            {/* hard masses at their stated widths */}
            {boxes.map((b, i) => (
              <rect
                key={i}
                x={m.sx(b.x0)}
                y={m.sy(ptHalfWidth)}
                width={(b.x1 - b.x0) / m.mmPerPx}
                height={(ptHalfWidth * 2) / m.mmPerPx}
                className="hard-mass"
              >
                <title>hard mass</title>
              </rect>
            ))}

            {/* occupants: one seat ellipse per position, at the hip station */}
            {g.occupants.map((o) =>
              Array.from({ length: o.seats }, (_, i) => {
                const yC = (i - (o.seats - 1) / 2) * shoulder;
                return (
                  <ellipse
                    key={`${o.row}:${i}`}
                    cx={m.sx(o.hpoint.x)}
                    cy={m.sy(yC)}
                    rx={230 / m.mmPerPx}
                    ry={shoulder / 2.3 / m.mmPerPx}
                    className="occupant-plan"
                  >
                    <title>{`row ${o.row}, seat ${i + 1}`}</title>
                  </ellipse>
                );
              }),
            )}

            {/* thresholds, both halves */}
            {([1, -1] as const).map((side) => (
              <g key={side}>
                {result.plan.floor.segments.map((s, i) => (
                  <path key={`f${i}`} d={mirrorSeg(m, s, side)} className="threshold-floor">
                    {side > 0 && <title>{`must stay outside — ${s.constraint.label}`}</title>}
                  </path>
                ))}
                {result.plan.ceiling.segments.map((s, i) => (
                  <path key={`c${i}`} d={mirrorSeg(m, s, side)} className="threshold-ceiling">
                    {side > 0 && <title>{`must stay inside — ${s.constraint.label}`}</title>}
                  </path>
                ))}
              </g>
            ))}

            {/* the authored body side and its mirror */}
            <path
              d={smoothPath(pts.map((p) => ({ x: m.sx(p.x), y: m.sy(p.z) })))}
              className="line-silhouette"
            />
            <path
              d={smoothPath(pts.map((p) => ({ x: m.sx(p.x), y: m.sy(-p.z) })))}
              className="line-silhouette mirror"
            />
            {pts.map((p, i) => (
              <circle
                key={i}
                data-testid={`pt-plan_side-${i}`}
                cx={m.sx(p.x)}
                cy={m.sy(p.z)}
                r={4.5}
                className={`ctl-pt ${p.touching ? 'touching' : ''}`}
                onPointerDown={beginDrag(m, i)}
              >
                <title>
                  {p.touching ? `body side — on ${p.touching.constraint.label}` : 'body side'}
                </title>
              </circle>
            ))}
          </>
        )}
      </ViewportSvg>
    </div>
  );
}

function mirrorSeg(m: Mapper, s: import('@pkgprop/core').Segment, side: 1 | -1): string {
  if (s.kind === 'line') {
    return `M ${m.sx(s.x0)} ${m.sy(s.z0 * side)} L ${m.sx(s.x1)} ${m.sy(s.z1 * side)}`;
  }
  return '';
}
