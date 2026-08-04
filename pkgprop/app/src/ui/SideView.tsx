import type { ConstraintMeta, SolveResult } from '@pkgprop/core';
import { useCallback, useRef, useState } from 'react';
import {
  clampLinePoint,
  denorm,
  frameOf,
  LINE_DEFS,
  linePoints,
  norm,
  smoothPath,
  type DrawingState,
  type LineId,
} from '../state/lines.js';
import type { Action } from '../state/store.js';
import { profilePaths, makeView } from './viewutil.js';

/**
 * SIDE — the envelope ghosts behind at all times (dashed, labeled as the
 * buildable space); the authored car is solid on top. Drag a control point
 * into a wall and the wall names itself. Law 2, rendered literally.
 */

interface Touch {
  line: LineId;
  index: number;
  side: 'floor' | 'ceiling';
  constraint: ConstraintMeta;
}

export function SideView({
  result,
  drawing,
  dispatch,
  selected,
  onSelect,
}: {
  result: SolveResult;
  drawing: DrawingState;
  dispatch: React.Dispatch<Action>;
  selected: { line: LineId; index: number } | null;
  onSelect: (sel: { line: LineId; index: number } | null) => void;
}) {
  const g = result.geometry;
  const frame = frameOf(result);
  const v = makeView(frame.xMin, frame.xMax, frame.zMax, 260);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [liveTouch, setLiveTouch] = useState<Touch | null>(null);

  const toMm = useCallback(
    (e: { clientX: number; clientY: number }): { x: number; z: number } | null => {
      const el = svgRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const x = v.x0 + ((e.clientX - r.left) / r.width) * v.w;
      const z = v.z1 - ((e.clientY - r.top) / r.height) * v.h;
      return { x, z };
    },
    [v],
  );

  const beginDrag = (line: LineId, index: number) => (down: React.PointerEvent) => {
    down.preventDefault();
    onSelect({ line, index });
    const def = LINE_DEFS.find((d) => d.id === line)!;
    // Materialize the full point set so one moved point never orphans the rest.
    const basePts = [...linePoints(line, drawing, result)];
    const apply = (e: PointerEvent, commit: boolean) => {
      const mm = toMm(e);
      if (!mm) return;
      const c = clampLinePoint(def, result, mm.x, mm.z);
      if (!commit) setLiveTouch(c.touching ? { line, index, ...c.touching } : null);
      const pts = [...basePts];
      pts[index] = norm(frame, c.x, c.z);
      dispatch({ type: 'set-line', line, pts, commit });
    };
    const move = (e: PointerEvent) => apply(e, false);
    const up = (e: PointerEvent) => {
      apply(e, true);
      setLiveTouch(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const sideLines = LINE_DEFS.filter((d) => d.view === 'side');

  // Clamp every rendered point live: package changes re-apply the walls.
  const rendered = sideLines.map((def) => {
    const pts = linePoints(def.id, drawing, result).map((p) => {
      const { x, z } = denorm(frame, p);
      return { def, ...clampLinePoint(def, result, x, z) };
    });
    return { def, pts };
  });

  const touchToShow =
    liveTouch ??
    (selected
      ? (() => {
          const r = rendered.find((l) => l.def.id === selected.line);
          const p = r?.pts[selected.index];
          return p?.touching ? { line: selected.line, index: selected.index, ...p.touching } : null;
        })()
      : null);

  return (
    <div className="view-block" data-testid="side-view">
      <div className="view-title">
        SIDE — dashed is the buildable space (thresholds, not a car); solid is yours
      </div>
      {touchToShow && (
        <div className="wall-chip" data-testid="drawing-wall-chip">
          <span className="who">{touchToShow.constraint.label}</span>
          <span className={`tag ${touchToShow.constraint.license}`}>
            {touchToShow.constraint.license}
          </span>
          <span style={{ marginLeft: 6, color: 'var(--ink-soft)' }}>
            {touchToShow.side === 'floor' ? 'holding the line up' : 'holding the line down'}
          </span>
          <div className="why">{touchToShow.constraint.reason}</div>
        </div>
      )}
      <svg
        ref={svgRef}
        className="view-svg"
        viewBox={`0 0 ${v.w} ${v.h}`}
        style={{ aspectRatio: `${v.w} / ${v.h}` }}
        onPointerDown={() => onSelect(null)}
      >
        {/* ground */}
        <line x1={0} y1={v.sy(0)} x2={v.w} y2={v.sy(0)} stroke="var(--ink)" strokeWidth={2} />

        {/* hard points: wheels, boxes, occupants */}
        {[0, g.wheelbase].map((ax) => (
          <g key={ax}>
            <circle cx={v.sx(ax)} cy={v.sy(g.tireRadius)} r={g.tireRadius} fill="rgba(0,0,0,0.05)" stroke="var(--ghost)" strokeWidth={1.5} />
            <circle cx={v.sx(ax)} cy={v.sy(g.tireRadius)} r={g.tireRadius * 0.55} fill="none" stroke="var(--ghost)" />
            <circle cx={v.sx(ax)} cy={v.sy(g.tireRadius)} r={4} fill="var(--ink)" />
          </g>
        ))}
        {[g.frontBox, g.rearBox, g.battery].map(
          (b, i) =>
            b && (
              <rect
                key={i}
                x={v.sx(b.x0)}
                y={v.sy(b.z1)}
                width={b.x1 - b.x0}
                height={b.z1 - b.z0}
                fill="rgba(0,0,0,0.07)"
                stroke="var(--ghost)"
                strokeDasharray="3 3"
              >
                <title>hard mass</title>
              </rect>
            ),
        )}
        {g.occupants.map((o) => (
          <g key={o.row} stroke="var(--ghost)" fill="none" strokeWidth={1.5}>
            <circle
              cx={v.sx(o.headCenter.x)}
              cy={v.sy(o.headCenter.z)}
              r={o.headTopZ - o.headCenter.z}
            />
            <path
              d={`M ${v.sx(o.heel.x)} ${v.sy(o.heel.z)} L ${v.sx(o.hpoint.x)} ${v.sy(o.hpoint.z)} L ${v.sx(o.headCenter.x)} ${v.sy(o.headCenter.z)}`}
            />
            <circle cx={v.sx(o.hpoint.x)} cy={v.sy(o.hpoint.z)} r={5} fill="var(--ink)" stroke="none">
              <title>{`H-point row ${o.row}`}</title>
            </circle>
          </g>
        ))}
        {/* eye + sight cross */}
        <g stroke="var(--ink)" strokeWidth={1}>
          <line x1={v.sx(g.eye.x) - 7} y1={v.sy(g.eye.z)} x2={v.sx(g.eye.x) + 7} y2={v.sy(g.eye.z)} />
          <line x1={v.sx(g.eye.x)} y1={v.sy(g.eye.z) - 7} x2={v.sx(g.eye.x)} y2={v.sy(g.eye.z) + 7} />
        </g>

        {/* the buildable space: dashed thresholds with names on hover */}
        {profilePaths(v, result.envelope.floor).map((p, i) => (
          <path key={`f${i}`} d={p.d} fill="none" stroke="var(--ink)" strokeWidth={1.4} strokeDasharray="7 5">
            <title>{`must stay above — ${p.label}`}</title>
          </path>
        ))}
        {profilePaths(v, result.envelope.ceiling).map((p, i) => (
          <path key={`c${i}`} d={p.d} fill="none" stroke="var(--ink-soft)" strokeWidth={1.2} strokeDasharray="2 5">
            <title>{`must stay below — ${p.label}`}</title>
          </path>
        ))}

        {/* the authored car */}
        {rendered.map(({ def, pts }) => (
          <g key={def.id}>
            <path
              d={smoothPath(pts.map((p) => ({ x: v.sx(p.x), y: v.sy(p.z) })))}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={3}
              strokeLinecap="round"
            />
            {pts.map((p, i) => {
              const isSel = selected?.line === def.id && selected.index === i;
              return (
                <circle
                  key={i}
                  data-testid={`pt-${def.id}-${i}`}
                  cx={v.sx(p.x)}
                  cy={v.sy(p.z)}
                  r={isSel ? 10 : 7}
                  fill={p.touching ? 'var(--accent)' : 'var(--panel)'}
                  stroke={isSel ? 'var(--accent)' : 'var(--ink)'}
                  strokeWidth={2}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    beginDrag(def.id, i)(e);
                  }}
                >
                  <title>
                    {p.touching
                      ? `${def.label} — on ${p.touching.constraint.label}`
                      : def.label}
                  </title>
                </circle>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
