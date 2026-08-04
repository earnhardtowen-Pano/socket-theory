import type { ConstraintMeta, SolveResult } from '@pkgprop/core';
import { useState } from 'react';
import { stationsOf } from '../model/stations.js';
import {
  clampLinePoint,
  denorm,
  frameOf,
  isBoundPoint,
  LINE_DEFS,
  linePoints,
  norm,
  paramValue,
  smoothPath,
  type DrawingState,
  type LineId,
} from '../state/lines.js';
import type { Action } from '../state/store.js';
import { ViewportSvg, type Mapper } from './viewport/ViewportSvg.js';

/**
 * SIDE — the envelope ghosts dashed behind; the authored car reads as one
 * silhouette on top. Drag a control point into a wall and the wall names
 * itself. Law 2, rendered literally.
 */

interface Touch {
  line: LineId;
  index: number;
  side: 'floor' | 'ceiling';
  constraint: ConstraintMeta;
}

/** The silhouette chain, welded at render into one heavy path. */
const SILHOUETTE: LineId[] = ['hood', 'glass', 'roof', 'backlight', 'deck'];

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
  const [liveTouch, setLiveTouch] = useState<Touch | null>(null);
  const headR = paramValue(result, 'anthro_head_radius', 110);

  const sideLines = LINE_DEFS.filter((d) => d.view === 'side');
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

  const beginDrag =
    (m: Mapper, line: LineId, index: number) => (down: React.PointerEvent) => {
      down.preventDefault();
      down.stopPropagation();
      onSelect({ line, index });
      const def = LINE_DEFS.find((d) => d.id === line)!;
      const basePts = [...linePoints(line, drawing, result)];
      const apply = (e: PointerEvent, commit: boolean) => {
        const w = m.toWorld(e.clientX, e.clientY);
        const c = clampLinePoint(def, result, w.x, w.y);
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

  // One heavy stroke, but smoothed per line so hard corners (roof→backlight)
  // stay corners instead of spline overshoot.
  const silhouettePath = (m: Mapper) =>
    SILHOUETTE.map((id) => {
      const line = rendered.find((l) => l.def.id === id);
      if (!line) return '';
      return smoothPath(line.pts.map((p) => ({ x: m.sx(p.x), y: m.sy(p.z) })));
    }).join(' ');

  return (
    <div className="view-block" data-testid="side-view">
      <div className="view-title">
        <span>SIDE</span>
        <span className="view-note">dashed is the buildable space — thresholds, not a car</span>
      </div>
      {touchToShow && (
        <div className="wall-chip floating" data-testid="drawing-wall-chip">
          <span className="who">{touchToShow.constraint.label}</span>
          <span className={`tag ${touchToShow.constraint.license}`}>
            {touchToShow.constraint.license}
          </span>
          <span className="dir">
            {touchToShow.side === 'floor' ? 'holding the line up' : 'holding the line down'}
          </span>
          <div className="why">{touchToShow.constraint.reason}</div>
        </div>
      )}
      <ViewportSvg
        view="side"
        yUp
        fitBox={{ x0: frame.xMin - 140, x1: frame.xMax + 140, y0: -90, y1: frame.zMax + 110 }}
        rulerEdge="top"
        stations={stationsOf(result)}
        onBackgroundDown={() => onSelect(null)}
        minHeightPx={320}
        maxHeightPx={600}
      >
        {(m) => (
          <>
            {/* ground */}
            <line x1={0} y1={m.sy(0)} x2={m.pxW} y2={m.sy(0)} className="ground-line" />

            {/* hard points: wheels, masses, occupants */}
            {[0, g.wheelbase].map((ax) => (
              <g key={ax} className="wheel">
                <circle cx={m.sx(ax)} cy={m.sy(g.tireRadius)} r={g.tireRadius / m.mmPerPx} className="wheel-tire" />
                <circle
                  cx={m.sx(ax)}
                  cy={m.sy(g.tireRadius)}
                  r={(g.tireRadius * 0.62) / m.mmPerPx}
                  className="wheel-rim"
                />
                {Array.from({ length: 5 }, (_, i) => {
                  const a = (i / 5) * Math.PI * 2 + Math.PI / 10;
                  const r1 = (g.tireRadius * 0.16) / m.mmPerPx;
                  const r2 = (g.tireRadius * 0.56) / m.mmPerPx;
                  return (
                    <line
                      key={i}
                      x1={m.sx(ax) + r1 * Math.cos(a)}
                      y1={m.sy(g.tireRadius) + r1 * Math.sin(a)}
                      x2={m.sx(ax) + r2 * Math.cos(a)}
                      y2={m.sy(g.tireRadius) + r2 * Math.sin(a)}
                      className="wheel-spoke"
                    />
                  );
                })}
                <circle cx={m.sx(ax)} cy={m.sy(g.tireRadius)} r={2.4} className="wheel-hub" />
              </g>
            ))}
            {[g.frontBox, g.rearBox, g.battery].map(
              (b, i) =>
                b && (
                  <rect
                    key={i}
                    x={m.sx(b.x0)}
                    y={m.sy(b.z1)}
                    width={(b.x1 - b.x0) / m.mmPerPx}
                    height={(b.z1 - b.z0) / m.mmPerPx}
                    className="hard-mass"
                  >
                    <title>hard mass</title>
                  </rect>
                ),
            )}
            {g.occupants.map((o) => (
              <g key={o.row} className="occupant">
                <circle
                  cx={m.sx(o.headCenter.x)}
                  cy={m.sy(o.headCenter.z)}
                  r={headR / m.mmPerPx}
                />
                <path
                  d={`M ${m.sx(o.heel.x)} ${m.sy(o.heel.z)} L ${m.sx(o.hpoint.x)} ${m.sy(o.hpoint.z)} L ${m.sx(o.headCenter.x)} ${m.sy(o.headCenter.z)}`}
                />
                <circle cx={m.sx(o.hpoint.x)} cy={m.sy(o.hpoint.z)} r={3.4} className="hpoint">
                  <title>{`H-point row ${o.row}`}</title>
                </circle>
              </g>
            ))}
            <g className="eye-cross">
              <line x1={m.sx(g.eye.x) - 6} y1={m.sy(g.eye.z)} x2={m.sx(g.eye.x) + 6} y2={m.sy(g.eye.z)} />
              <line x1={m.sx(g.eye.x)} y1={m.sy(g.eye.z) - 6} x2={m.sx(g.eye.x)} y2={m.sy(g.eye.z) + 6} />
            </g>

            {/* thresholds */}
            {result.envelope.floor.segments.map((s, i) => (
              <path key={`f${i}`} d={segPath(m, s)} className="threshold-floor">
                <title>{`must stay above — ${s.constraint.label}`}</title>
              </path>
            ))}
            {result.envelope.ceiling.segments.map((s, i) => (
              <path key={`c${i}`} d={segPath(m, s)} className="threshold-ceiling">
                <title>{`must stay below — ${s.constraint.label}`}</title>
              </path>
            ))}

            {/* the authored car: one welded silhouette + feature lines */}
            <path d={silhouettePath(m)} className="line-silhouette" />
            {rendered
              .filter((l) => !SILHOUETTE.includes(l.def.id))
              .map(({ def, pts }) => (
                <path
                  key={def.id}
                  d={smoothPath(pts.map((p) => ({ x: m.sx(p.x), y: m.sy(p.z) })))}
                  className="line-feature"
                />
              ))}

            {/* control points */}
            {rendered.map(({ def, pts }) =>
              pts.map((p, i) => {
                if (isBoundPoint(def.id, i, pts.length)) {
                  return (
                    <rect
                      key={`${def.id}${i}`}
                      x={m.sx(p.x) - 2.5}
                      y={m.sy(p.z) - 2.5}
                      width={5}
                      height={5}
                      className="hard-pt"
                    >
                      <title>{`${def.label} — welded to the cowl hard point`}</title>
                    </rect>
                  );
                }
                const isSel = selected?.line === def.id && selected.index === i;
                return (
                  <circle
                    key={`${def.id}${i}`}
                    data-testid={`pt-${def.id}-${i}`}
                    cx={m.sx(p.x)}
                    cy={m.sy(p.z)}
                    r={isSel ? 7 : 4.5}
                    className={`ctl-pt ${p.touching ? 'touching' : ''} ${isSel ? 'selected' : ''}`}
                    onPointerDown={beginDrag(m, def.id, i)}
                  >
                    <title>
                      {p.touching ? `${def.label} — on ${p.touching.constraint.label}` : def.label}
                    </title>
                  </circle>
                );
              }),
            )}
          </>
        )}
      </ViewportSvg>
    </div>
  );
}

function segPath(m: Mapper, s: import('@pkgprop/core').Segment): string {
  if (s.kind === 'line') {
    return `M ${m.sx(s.x0)} ${m.sy(s.z0)} L ${m.sx(s.x1)} ${m.sy(s.z1)}`;
  }
  const steps = 32;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = s.x0 + ((s.x1 - s.x0) * i) / steps;
    const dx = x - s.cx;
    const under = s.r * s.r - dx * dx;
    if (under < 0) continue;
    const z = s.cz + Math.sqrt(under);
    parts.push(`${parts.length === 0 ? 'M' : 'L'} ${m.sx(x).toFixed(1)} ${m.sy(z).toFixed(1)}`);
  }
  return parts.join(' ');
}
