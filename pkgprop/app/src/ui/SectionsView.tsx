import type { SolveResult } from '@pkgprop/core';
import { sectionAt } from '@pkgprop/geometry';
import { buildCarBody } from '../model/body.js';
import type { FeatureMap } from '../model/features.js';
import type { DrawingState } from '../state/lines.js';
import type { Action } from '../state/store.js';
import { ViewportSvg, type Mapper } from './viewport/ViewportSvg.js';

/**
 * SECTIONS — the car cut across, at the stations that decide its character.
 *
 * Side and plan together still do not say what a car looks like: two cars with
 * identical silhouettes and identical outlines read as a taut coupe or a
 * slab-sided van, and all of the difference is here.
 *
 * These are the same sections the loft uses, evaluated by the same function
 * against the same tables, so what you judge here is what gets built — not a
 * separate drawing that can drift out of agreement with the surface.
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
  let build: ReturnType<typeof buildCarBody> | null = null;
  try {
    build = buildCarBody(result, drawing, features);
  } catch {
    build = null;
  }
  const cuts = build ? cutsOf(result) : [];
  const drawn = build
    ? cuts.map((c) => ({ cut: c, geo: sectionAt(build!.input, c.x, 44) }))
    : [];
  const maxHalf = Math.max(
    1,
    ...drawn.flatMap((d) => [...d.geo.body, ...(d.geo.greenhouse ?? [])].map((p) => p.y)),
  );
  const maxTop = Math.max(
    1,
    ...drawn.flatMap((d) => [...d.geo.body, ...(d.geo.greenhouse ?? [])].map((p) => p.z)),
  );

  const selectSection = (): void =>
    dispatch({ type: 'select', selection: { kind: 'feature', id: 'section-body' } });

  return (
    <div className="view-block" data-testid="sections-view">
      <div className="view-title">
        <span>SECTIONS</span>
        <span className="view-note">
          the same cuts the surface is lofted from · click one to shape it
        </span>
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
          fitBox={{ x0: -maxHalf * 1.18, x1: maxHalf * 1.18, y0: -60, y1: maxTop * 1.12 }}
          rulerEdge="bottom"
          stations={[]}
          testid="sections-viewport"
          minHeightPx={320}
          maxHeightPx={540}
        >
          {(m: Mapper) => {
            const path = (pts: readonly { y: number; z: number }[]): string => {
              const right = pts.map((p) => `${m.sx(p.y)} ${m.sy(p.z)}`).join(' L ');
              const left = [...pts].reverse().map((p) => `${m.sx(-p.y)} ${m.sy(p.z)}`).join(' L ');
              return `M ${left} L ${right}`;
            };
            return (
              <>
                <line x1={0} y1={m.sy(0)} x2={m.pxW} y2={m.sy(0)} className="ground-line" />
                <line x1={m.sx(0)} y1={0} x2={m.sx(0)} y2={m.pxH} className="grid-line" strokeDasharray="3 4" />
                {drawn.map(({ cut, geo }, i) => {
                  const lead = i === drawn.length - 1;
                  const d = path(geo.body);
                  const gd = geo.greenhouse ? path(geo.greenhouse) : null;
                  return (
                    <g key={cut.id}>
                      <path
                        d={d}
                        className="feature-hit"
                        data-testid={`section-${cut.id}`}
                        onPointerDownCapture={selectSection}
                      >
                        <title>{`${cut.label} at ${Math.round(cut.x)}mm`}</title>
                      </path>
                      <path
                        d={d}
                        className={lead ? 'section-lead' : 'section-ghost'}
                        style={{ pointerEvents: 'none' }}
                      />
                      {gd && (
                        <path
                          d={gd}
                          className={lead ? 'section-glass' : 'section-ghost'}
                          style={{ pointerEvents: 'none' }}
                        />
                      )}
                      {lead && (
                        <text
                          x={m.sx(Math.max(...geo.body.map((p) => p.y))) + 8}
                          y={m.sy(geo.body[Math.floor(geo.body.length / 2)]?.z ?? 0)}
                          className="feature-label"
                        >
                          {cut.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </>
            );
          }}
        </ViewportSvg>
      )}
    </div>
  );
}
