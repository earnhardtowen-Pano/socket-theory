import type { SolveResult } from '@pkgprop/core';
import { useCallback, useRef } from 'react';
import {
  clampLinePoint,
  denorm,
  frameOf,
  LINE_DEFS,
  linePoints,
  norm,
  smoothPath,
} from '../state/lines.js';
import type { DrawingState } from '../state/lines.js';
import type { Action } from '../state/store.js';
import { segmentPath, makeView, type ViewMap } from './viewutil.js';

/**
 * PLAN — same contract as SIDE; symmetry is enforced by construction:
 * the right half is authored, the left half is its mirror.
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
  const margin = 200;

  // Symmetric canvas: y ∈ [-halfMax-margin, +halfMax+margin], y up on top half.
  const x0 = frame.xMin - margin;
  const w = frame.xMax - frame.xMin + margin * 2;
  const h = (halfMax + margin) * 2;
  const sx = (x: number) => x - x0;
  const sy = (y: number) => halfMax + margin - y;
  // The profile helpers expect a ViewMap; give them the top half.
  const vTop: ViewMap = { x0, z1: halfMax + margin, w, h, sx, sy };

  const svgRef = useRef<SVGSVGElement | null>(null);
  const def = LINE_DEFS.find((d) => d.id === 'plan_side')!;
  const planFrame = { ...frame, zMax: halfMax };

  const toMm = useCallback(
    (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
      const el = svgRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: x0 + ((e.clientX - r.left) / r.width) * w,
        y: halfMax + margin - ((e.clientY - r.top) / r.height) * h,
      };
    },
    [x0, w, h, halfMax],
  );

  const rawPts = linePoints('plan_side', drawing, result);
  const pts = rawPts.map((p) => {
    const { x, z } = denorm(planFrame, p);
    return clampLinePoint(def, result, x, z);
  });

  const beginDrag = (index: number) => (down: React.PointerEvent) => {
    down.preventDefault();
    const basePts = [...rawPts];
    const apply = (e: PointerEvent, commit: boolean) => {
      const mm = toMm(e);
      if (!mm) return;
      const c = clampLinePoint(def, result, mm.x, Math.abs(mm.y));
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

  const wheelHalfSection = 120;

  const thresholds = (mirror: boolean) => {
    const flip = (d: string) => d;
    const transform = mirror ? `translate(0 ${2 * sy(0)}) scale(1 -1)` : undefined;
    return (
      <g transform={transform}>
        {result.plan.floor.segments.map((s, i) => (
          <path key={`f${i}`} d={flip(segmentPath(vTop, s))} fill="none" stroke="var(--ink)" strokeWidth={1.4} strokeDasharray="7 5">
            {!mirror && <title>{`must stay outside — ${s.constraint.label}`}</title>}
          </path>
        ))}
        {result.plan.ceiling.segments.map((s, i) => (
          <path key={`c${i}`} d={flip(segmentPath(vTop, s))} fill="none" stroke="var(--ink-soft)" strokeWidth={1.2} strokeDasharray="2 5">
            {!mirror && <title>{`must stay inside — ${s.constraint.label}`}</title>}
          </path>
        ))}
      </g>
    );
  };

  return (
    <div className="view-block" data-testid="plan-view">
      <div className="view-title">PLAN — right half is authored; the left is its mirror</div>
      <svg ref={svgRef} className="view-svg" viewBox={`0 0 ${w} ${h}`} style={{ aspectRatio: `${w} / ${h}` }}>
        <line x1={0} y1={sy(0)} x2={w} y2={sy(0)} stroke="var(--ghost)" strokeWidth={1} strokeDasharray="14 4 3 4" />
        {[0, g.wheelbase].map((ax) =>
          [1, -1].map((side) => (
            <rect
              key={`${ax}:${side}`}
              x={sx(ax - g.tireRadius)}
              y={sy((g.track / 2) * side + wheelHalfSection)}
              width={g.tireRadius * 2}
              height={wheelHalfSection * 2}
              fill="rgba(0,0,0,0.06)"
              stroke="var(--ghost)"
            />
          )),
        )}
        {thresholds(false)}
        {thresholds(true)}
        <path
          d={smoothPath(pts.map((p) => ({ x: sx(p.x), y: sy(p.z) })))}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <path
          d={smoothPath(pts.map((p) => ({ x: sx(p.x), y: sy(-p.z) })))}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.55}
        />
        {pts.map((p, i) => (
          <circle
            key={i}
            data-testid={`pt-plan_side-${i}`}
            cx={sx(p.x)}
            cy={sy(p.z)}
            r={7}
            fill={p.touching ? 'var(--accent)' : 'var(--panel)'}
            stroke="var(--ink)"
            strokeWidth={2}
            style={{ cursor: 'grab' }}
            onPointerDown={beginDrag(i)}
          >
            <title>{p.touching ? `body side — on ${p.touching.constraint.label}` : 'body side'}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
