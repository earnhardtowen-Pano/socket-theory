import type { ConstraintMeta, SolveResult } from '@pkgprop/core';
import { useState } from 'react';
import { generateFeature, type FeatureMap } from '../model/features.js';
import { stationsOf } from '../model/stations.js';
import {
  clampLinePoint,
  denorm,
  frameOf,
  isBoundPoint,
  isDeletable,
  LINE_DEFS,
  lineTension,
  linePoints,
  nearestSegment,
  norm,
  paramValue,
  smoothPath,
  type DrawingState,
  type LineId,
  type RenderState,
} from '../state/lines.js';
import type { Action, Selection, ViewMode } from '../state/store.js';
import { tick } from './sound.js';
import { ViewportSvg, type Mapper } from './viewport/ViewportSvg.js';
import { MarkerRender } from './render/MarkerRender.js';
import { sunScreenPos } from './render/paint.js';

/**
 * SIDE — the car, and only the car.
 *
 * Nothing shows its control points until you select it. Hovering names the
 * part under the cursor before you commit to grabbing it, and the hit targets
 * are generous whatever the zoom. Missing a grab selects; it never throws the
 * drawing across the screen, because panning now lives on space and the
 * middle button where every canvas tool keeps it.
 */

interface Touch {
  line: LineId;
  index: number;
  side: 'floor' | 'ceiling';
  constraint: ConstraintMeta;
}

const SILHOUETTE: LineId[] = ['hood', 'glass', 'roof', 'backlight', 'deck'];

export function SideView({
  result,
  drawing,
  features,
  render,
  mode,
  selection,
  dispatch,
}: {
  result: SolveResult;
  drawing: DrawingState;
  features: FeatureMap;
  render: RenderState;
  mode: ViewMode;
  selection: Selection;
  dispatch: React.Dispatch<Action>;
}) {
  const g = result.geometry;
  const frame = frameOf(result);
  const [liveTouch, setLiveTouch] = useState<Touch | null>(null);
  const [hover, setHover] = useState<{ kind: 'line' | 'feature'; id: string } | null>(null);
  const headR = paramValue(result, 'anthro_head_radius', 110);
  const isRender = mode === 'RENDER';

  const sideLines = LINE_DEFS.filter((d) => d.view === 'side');
  const rendered = sideLines.map((def) => {
    const pts = linePoints(def.id, drawing, result).map((p) => {
      const { x, z } = denorm(frame, p);
      return clampLinePoint(def, result, x, z);
    });
    return { def, pts, tension: lineTension(def.id, drawing) };
  });

  // Parametric features generate their own curves from their parameters.
  const featureGeo = Object.values(features).map((f) => ({
    feature: f,
    geo: generateFeature(f, result),
  }));

  const ptsById: Record<string, readonly { x: number; z: number }[]> = {};
  for (const r of rendered) ptsById[r.def.id] = r.pts;
  for (const { feature, geo } of featureGeo) {
    ptsById[feature.slot === 'front' ? 'arch_front' : 'arch_rear'] = geo.curve;
  }

  const selectedLine = selection?.kind === 'line' ? selection.id : null;
  const selectedFeature = selection?.kind === 'feature' ? selection.id : null;

  const touchToShow =
    liveTouch ??
    (selection?.kind === 'line' && selection.point !== null
      ? (() => {
          const r = rendered.find((l) => l.def.id === selection.id);
          const p = r?.pts[selection.point];
          return p?.touching
            ? { line: selection.id, index: selection.point, ...p.touching }
            : null;
        })()
      : null);
  const flashId = touchToShow?.constraint.id ?? null;

  const beginPointDrag =
    (m: Mapper, line: LineId, index: number) => (down: React.PointerEvent) => {
      down.preventDefault();
      down.stopPropagation();
      dispatch({ type: 'select', selection: { kind: 'line', id: line, point: index } });
      const def = LINE_DEFS.find((d) => d.id === line)!;
      const basePts = [...linePoints(line, drawing, result)];
      let lastWall: string | null = null;
      const apply = (e: PointerEvent, commit: boolean) => {
        const w = m.toWorld(e.clientX, e.clientY);
        const c = clampLinePoint(def, result, w.x, w.y);
        if (!commit) {
          setLiveTouch(c.touching ? { line, index, ...c.touching } : null);
          const id = c.touching?.constraint.id ?? null;
          if (id && id !== lastWall) tick();
          lastWall = id;
        }
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

  /** A feature handle writes one parameter; the drag axis says which way. */
  const beginHandleDrag =
    (m: Mapper, featureId: string, param: string, axis: 'x' | 'z' | 'radial') =>
    (down: React.PointerEvent) => {
      down.preventDefault();
      down.stopPropagation();
      const f = features[featureId];
      if (!f) return;
      const start = m.toWorld(down.clientX, down.clientY);
      const base = f.params[param] ?? 0;
      const axleX = f.slot === 'rear' ? g.wheelbase : 0;
      const apply = (e: PointerEvent, commit: boolean) => {
        const w = m.toWorld(e.clientX, e.clientY);
        let next = base;
        if (axis === 'z') next = base + (w.y - start.y);
        else if (axis === 'x') next = base - (w.x - start.x);
        else next = base + Math.hypot(w.x - axleX, w.y) - Math.hypot(start.x - axleX, start.y);
        dispatch({ type: 'set-feature-param', id: featureId, key: param, value: next, commit });
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

  const addPoint = (m: Mapper, line: LineId) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const def = LINE_DEFS.find((d) => d.id === line)!;
    const base = [...linePoints(line, drawing, result)];
    const host = (e.currentTarget as SVGElement).ownerSVGElement!;
    const box = host.getBoundingClientRect();
    const screen = base.map((p) => {
      const { x, z } = denorm(frame, p);
      return { x: m.sx(x), y: m.sy(z) };
    });
    const near = nearestSegment(screen, e.clientX - box.left, e.clientY - box.top);
    if (!near) return;
    const w = m.toWorld(e.clientX, e.clientY);
    const c = clampLinePoint(def, result, w.x, w.y);
    const pts = [...base];
    pts.splice(near.index + 1, 0, norm(frame, c.x, c.z));
    dispatch({ type: 'set-line', line, pts, commit: true });
    dispatch({ type: 'select', selection: { kind: 'line', id: line, point: near.index + 1 } });
    tick();
  };

  const removePoint = (line: LineId, index: number, count: number) => {
    if (!isDeletable(line, index, count)) return;
    const pts = [...linePoints(line, drawing, result)];
    pts.splice(index, 1);
    dispatch({ type: 'set-line', line, pts, commit: true });
    dispatch({ type: 'select', selection: { kind: 'line', id: line, point: null } });
    tick();
  };

  const dragSun = (m: Mapper) => (down: React.PointerEvent) => {
    down.preventDefault();
    down.stopPropagation();
    const frameTop = result.bounds.roof_z.upper?.value ?? g.roofZ;
    const span = g.tailX - g.bumperX;
    const cx = (g.bumperX + g.tailX) / 2;
    const apply = (e: PointerEvent, commit: boolean) => {
      const w = m.toWorld(e.clientX, e.clientY);
      const sunAz = Math.max(-1, Math.min(1, (w.x - cx) / (span * 0.72)));
      const sunEl = Math.max(0, Math.min(1, (w.y / frameTop - 0.35) / 1.15));
      dispatch({ type: 'set-render', patch: { sunAz, sunEl }, commit });
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

  const silhouettePath = (m: Mapper) =>
    rendered
      .filter((l) => SILHOUETTE.includes(l.def.id))
      .map((l) => smoothPath(l.pts.map((p) => ({ x: m.sx(p.x), y: m.sy(p.z) })), l.tension))
      .join(' ');

  const frameTop = result.bounds.roof_z.upper?.value ?? g.roofZ;
  const hoverLabel =
    hover?.kind === 'feature'
      ? `${features[hover.id]?.slot ?? ''} wheel opening`
      : hover?.kind === 'line'
        ? LINE_DEFS.find((d) => d.id === hover.id)?.label
        : null;

  return (
    <div className="view-block" data-testid="side-view">
      <div className="view-title">
        <span>SIDE</span>
        <span className="mode-chips">
          {(['DRAFT', 'RENDER'] as ViewMode[]).map((mv) => (
            <button
              key={mv}
              className={`chip ${mode === mv ? 'active' : ''}`}
              data-testid={`mode-${mv}`}
              onClick={() => dispatch({ type: 'mode', mode: mv })}
            >
              {mv}
            </button>
          ))}
        </span>
        <span className="view-note">
          {isRender
            ? 'drag the sun · the light follows'
            : 'click a part to shape it · space-drag to pan'}
        </span>
      </div>

      {touchToShow && (
        <div className="wall-chip overlay" data-testid="drawing-wall-chip">
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
        onBackgroundDown={() => dispatch({ type: 'select', selection: null })}
        minHeightPx={320}
        maxHeightPx={600}
        hideChrome={isRender}
      >
        {(m) => (
          <>
            {isRender ? (
              <>
                <MarkerRender input={{ result, drawing, render, pts: ptsById }} m={m} />
                <SunHandle m={m} render={render} g={g} frameTop={frameTop} onDown={dragSun(m)} />
              </>
            ) : (
              <>
                <line x1={0} y1={m.sy(0)} x2={m.pxW} y2={m.sy(0)} className="ground-line" />

                {[0, g.wheelbase].map((ax) => (
                  <g key={ax} className="wheel">
                    <circle cx={m.sx(ax)} cy={m.sy(g.tireRadius)} r={g.tireRadius / m.mmPerPx} className="wheel-tire" />
                    <circle
                      cx={m.sx(ax)}
                      cy={m.sy(g.tireRadius)}
                      r={(g.tireRadius * 0.62) / m.mmPerPx}
                      className="wheel-rim"
                    />
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
                      />
                    ),
                )}
                {g.occupants.map((o) => (
                  <g key={o.row} className="occupant">
                    <circle cx={m.sx(o.headCenter.x)} cy={m.sy(o.headCenter.z)} r={headR / m.mmPerPx} />
                    <path
                      d={`M ${m.sx(o.heel.x)} ${m.sy(o.heel.z)} L ${m.sx(o.hpoint.x)} ${m.sy(o.hpoint.z)} L ${m.sx(o.headCenter.x)} ${m.sy(o.headCenter.z)}`}
                    />
                    <circle cx={m.sx(o.hpoint.x)} cy={m.sy(o.hpoint.z)} r={3.4} className="hpoint" />
                  </g>
                ))}

                {result.envelope.floor.segments.map((s, i) => (
                  <path
                    key={`f${i}`}
                    d={segPath(m, s)}
                    className={`threshold-floor ${flashId === s.constraint.id ? 'flash' : ''}`}
                  >
                    <title>{`must stay above — ${s.constraint.label}`}</title>
                  </path>
                ))}
                {result.envelope.ceiling.segments.map((s, i) => (
                  <path
                    key={`c${i}`}
                    d={segPath(m, s)}
                    className={`threshold-ceiling ${flashId === s.constraint.id ? 'flash' : ''}`}
                  >
                    <title>{`must stay below — ${s.constraint.label}`}</title>
                  </path>
                ))}

                <path d={silhouettePath(m)} className="line-silhouette" />
                {rendered
                  .filter((l) => !SILHOUETTE.includes(l.def.id))
                  .map(({ def, pts, tension }) => (
                    <path
                      key={def.id}
                      d={smoothPath(pts.map((p) => ({ x: m.sx(p.x), y: m.sy(p.z) })), tension)}
                      className="line-feature"
                    />
                  ))}

                {/* line hit strokes: click selects, double-click adds a point */}
                {rendered.map(({ def, pts, tension }) => {
                  const d = smoothPath(pts.map((p) => ({ x: m.sx(p.x), y: m.sy(p.z) })), tension);
                  const isHov = hover?.kind === 'line' && hover.id === def.id;
                  const isSel = selectedLine === def.id;
                  return (
                    <g key={`hit-${def.id}`}>
                      {(isHov || isSel) && (
                        <path d={d} className={`feature-curve ${isSel ? 'selected' : 'hovered'}`} />
                      )}
                      <path
                        d={d}
                        className="feature-hit"
                        data-testid={`line-${def.id}`}
                        onPointerEnter={() => setHover({ kind: 'line', id: def.id })}
                        onPointerLeave={() => setHover(null)}
                        onPointerDownCapture={(e) => {
                          e.stopPropagation();
                          dispatch({ type: 'select', selection: { kind: 'line', id: def.id, point: null } });
                        }}
                        onDoubleClick={addPoint(m, def.id)}
                      />
                    </g>
                  );
                })}

                {/* parametric features: wheel openings drawn from their arcs */}
                {featureGeo.map(({ feature, geo }) => {
                  const d = smoothPath(
                    geo.curve.map((p) => ({ x: m.sx(p.x), y: m.sy(p.z) })),
                    1,
                  );
                  const isSel = selectedFeature === feature.id;
                  const isHov = hover?.kind === 'feature' && hover.id === feature.id;
                  return (
                    <g key={feature.id}>
                      <path
                        d={d}
                        className={`feature-curve ${isSel ? 'selected' : ''} ${isHov ? 'hovered' : ''}`}
                      />
                      <path
                        d={d}
                        className="feature-hit"
                        data-testid={`feature-${feature.id}`}
                        onPointerEnter={() => setHover({ kind: 'feature', id: feature.id })}
                        onPointerLeave={() => setHover(null)}
                        onPointerDownCapture={(e) => {
                          e.stopPropagation();
                          dispatch({ type: 'select', selection: { kind: 'feature', id: feature.id } });
                        }}
                      />
                      {isSel &&
                        geo.handles.map((h) => (
                          <g key={h.id}>
                            <circle
                              cx={m.sx(h.at.x)}
                              cy={m.sy(h.at.z)}
                              r={13}
                              className="handle-hit"
                              onPointerDown={beginHandleDrag(m, feature.id, h.param, h.axis)}
                            >
                              <title>{h.label}</title>
                            </circle>
                            <circle cx={m.sx(h.at.x)} cy={m.sy(h.at.z)} r={5.5} className="handle" />
                          </g>
                        ))}
                    </g>
                  );
                })}

                {/* points, only for the line in your hand */}
                {rendered
                  .filter(({ def }) => selectedLine === def.id)
                  .map(({ def, pts }) =>
                    pts.map((p, i) => {
                      if (isBoundPoint(def.id, i, pts.length)) {
                        return (
                          <rect
                            key={`${def.id}${i}`}
                            x={m.sx(p.x) - 3}
                            y={m.sy(p.z) - 3}
                            width={6}
                            height={6}
                            className="hard-pt"
                          >
                            <title>welded to the cowl hard point</title>
                          </rect>
                        );
                      }
                      const held = selection?.kind === 'line' && selection.point === i;
                      return (
                        <g key={`${def.id}${i}`}>
                          <circle
                            cx={m.sx(p.x)}
                            cy={m.sy(p.z)}
                            r={13}
                            fill="transparent"
                            style={{ cursor: 'grab' }}
                            data-testid={`pt-${def.id}-${i}`}
                            onPointerDown={(e) => {
                              if (e.altKey) {
                                e.preventDefault();
                                e.stopPropagation();
                                removePoint(def.id, i, pts.length);
                                return;
                              }
                              beginPointDrag(m, def.id, i)(e);
                            }}
                          >
                            <title>{`${def.label} — drag to move, alt-click to remove`}</title>
                          </circle>
                          <circle
                            cx={m.sx(p.x)}
                            cy={m.sy(p.z)}
                            r={held ? 6.5 : 5}
                            className={`ctl-pt ${p.touching ? 'touching' : ''} ${held ? 'selected' : ''}`}
                            style={{ pointerEvents: 'none' }}
                          />
                        </g>
                      );
                    }),
                  )}

                {hoverLabel && !selection && <HoverTag m={m} label={hoverLabel} />}
              </>
            )}
          </>
        )}
      </ViewportSvg>
    </div>
  );
}

function HoverTag({ m, label }: { m: Mapper; label: string }) {
  return (
    <text x={12} y={m.pxH - 12} className="feature-label">
      {label}
    </text>
  );
}

function SunHandle({
  m,
  render,
  g,
  frameTop,
  onDown,
}: {
  m: Mapper;
  render: RenderState;
  g: SolveResult['geometry'];
  frameTop: number;
  onDown: (e: React.PointerEvent) => void;
}) {
  const sun = sunScreenPos(render, { x0: g.bumperX, x1: g.tailX, zTop: frameTop });
  return (
    <circle
      data-testid="sun-grab"
      cx={m.sx(sun.x)}
      cy={m.sy(sun.z)}
      r={30}
      fill="transparent"
      style={{ cursor: 'grab' }}
      onPointerDown={onDown}
    />
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
