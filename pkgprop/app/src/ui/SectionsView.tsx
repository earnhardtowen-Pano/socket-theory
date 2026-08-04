import type { SolveResult } from '@pkgprop/core';
import { halfSection } from '@pkgprop/geometry';
import { buildCarBody } from '../model/body.js';
import type { FeatureMap } from '../model/features.js';
import type { DrawingState } from '../state/lines.js';
import type { Action } from '../state/store.js';
import { ViewportSvg, type Mapper } from './viewport/ViewportSvg.js';

/**
 * SECTIONS — the car cut across, at the stations that decide its character.
 *
 * Side and plan together still do not say what a car looks like: two cars with
 * identical silhouettes and identical outlines can read as a taut coupe or a
 * slab-sided van, and all of the difference is here. This is the third drawing,
 * and it is the one that drives the loft.
 *
 * Each cut is taken where a designer would take one — over the axles, at the
 * driver, and at the widest point — so the shape can be judged where it
 * matters rather than at an arbitrary interval.
 */

interface Cut {
  readonly id: string;
  readonly label: string;
  readonly x: number;
}

function cutsOf(result: SolveResult): Cut[] {
  const g = result.geometry;
  const hip = g.occupants[0]?.hpoint.x ?? g.wheelbase / 2;
  return [
    { id: 'fa', label: 'front axle', x: 0 },
    { id: 'cwl', label: 'cowl', x: g.cowl.x },
    { id: 'h1', label: 'driver', x: hip },
    { id: 'ra', label: 'rear axle', x: g.wheelbase },
  ];
}

export function SectionsView({
  result,
  drawing,
  features,
  dispatch,
}: {
  result: SolveResult;
  drawing: DrawingState;
  features: FeatureMap;
  dispatch: React.Dispatch<Action>;
}) {
  let build;
  try {
    build = buildCarBody(result, drawing, features);
  } catch {
    build = null;
  }
  const cuts = build ? cutsOf(result) : [];
  const maxHalf = build
    ? Math.max(...cuts.map((c) => build!.input.halfWidth(c.x)), 1)
    : 1;
  const maxTop = build ? Math.max(...cuts.map((c) => build!.input.topZ(c.x)), 1) : 1;

  const selectSection = (): void =>
    dispatch({ type: 'select', selection: { kind: 'feature', id: 'section-body' } });

  return (
    <div className="view-block" data-testid="sections-view">
      <div className="view-title">
        <span>SECTIONS</span>
        <span className="view-note">click a cut to shape the section · one shape, four stations</span>
      </div>
      {!build ? (
        <div className="roadmap-card">
          <h2>SECTIONS</h2>
          <p>The body will not loft yet — draw the plan outline and the rocker first.</p>
        </div>
      ) : (
        <ViewportSvg
          view="sections"
          yUp
          fitBox={{ x0: -maxHalf * 1.15, x1: maxHalf * 1.15, y0: -40, y1: maxTop * 1.1 }}
          rulerEdge="bottom"
          stations={[]}
          testid="sections-viewport"
          minHeightPx={300}
          maxHeightPx={520}
        >
          {(m: Mapper) => (
            <>
              <line x1={0} y1={m.sy(0)} x2={m.pxW} y2={m.sy(0)} className="ground-line" />
              <line
                x1={m.sx(0)}
                y1={0}
                x2={m.sx(0)}
                y2={m.pxH}
                className="grid-line"
                strokeDasharray="3 4"
              />
              {cuts.map((c, i) => {
                const shape = build!.input.shape;
                const half = build!.input.halfWidth(c.x);
                const curve = halfSection(
                  build!.input.topZ(c.x),
                  build!.input.rockerZ(c.x),
                  half,
                  shape,
                  build!.input.beltZ(c.x),
                );
                const pts = curve.sample(56);
                // Both halves, because a section is read as a whole shape —
                // judging symmetry off one side is how you miss a heavy flank.
                const right = pts.map((p) => `${m.sx(p.y)} ${m.sy(p.z)}`).join(' L ');
                const left = [...pts].reverse().map((p) => `${m.sx(-p.y)} ${m.sy(p.z)}`).join(' L ');
                const d = `M ${left} L ${right}`;
                const lead = i === cuts.length - 1;
                return (
                  <g key={c.id} onClick={selectSection} style={{ cursor: 'pointer' }}>
                    {/* The drawn outline carries no fill, so a press inside it
                        would fall through to the canvas. Every other part of
                        this tool is grabbed by a generous invisible stroke;
                        sections work the same way. */}
                    <path
                      d={d}
                      className="feature-hit"
                      data-testid={`section-${c.id}`}
                      onPointerDownCapture={selectSection}
                    >
                      <title>{`${c.label} — half width ${Math.round(half)}mm`}</title>
                    </path>
                    <path
                      d={d}
                      className={lead ? 'section-lead' : 'section-ghost'}
                      style={{ pointerEvents: 'none' }}
                    />
                    {lead && (
                      <text x={m.sx(half) + 8} y={m.sy(build!.input.beltZ(c.x))} className="feature-label">
                        {c.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </>
          )}
        </ViewportSvg>
      )}
    </div>
  );
}
