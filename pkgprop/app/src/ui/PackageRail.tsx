import { type ControlId, type SolveResult } from '@pkgprop/core';
import { ARCHITECTURES, SEATING_CONFIGS, TIRE_CHOICES, type PackageState } from '@pkgprop/data';
import { useState } from 'react';
import {
  LINE_DEFS,
  lineTension,
  linePoints,
  PAINT_CHIPS,
  type DrawingState,
  type RenderState,
} from '../state/lines.js';
import type { Action, ViewMode } from '../state/store.js';
import { ControlSlider, CONTROL_LABELS } from './ControlSlider.js';

/**
 * The rail, folded. Everything is still one keystroke away, but a first look
 * shows the car's identity and one open group — not thirteen sliders.
 */

interface Group {
  readonly id: string;
  readonly label: string;
  readonly controls: readonly ControlId[];
}

const GROUPS: readonly Group[] = [
  { id: 'stance', label: 'STANCE', controls: ['wheelbase', 'front_overhang', 'rear_overhang', 'overall_width', 'rocker_z'] },
  { id: 'cabin', label: 'CABIN', controls: ['h30', 'heel_x', 'roof_z', 'belt_z'] },
  { id: 'front', label: 'FRONT', controls: ['cowl_z', 'hood_z', 'header_x'] },
  { id: 'tail', label: 'TAIL', controls: ['deck_z'] },
];

function useFolds(): [Record<string, boolean>, (id: string) => void] {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('pkgprop.folds');
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      // Fall through to the default fold state.
    }
    return { setup: true, stance: true };
  });
  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem('pkgprop.folds', JSON.stringify(next));
      } catch {
        // Not remembering the fold state is survivable.
      }
      return next;
    });
  };
  return [open, toggle];
}

function Fold({
  id,
  label,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  summary: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`fold ${open ? 'open' : ''}`} data-testid={`fold-${id}`}>
      <button className="fold-head" onClick={() => onToggle(id)}>
        <span className="fold-caret">{open ? '−' : '+'}</span>
        <span className="fold-label">{label}</span>
        {!open && <span className="fold-summary">{summary}</span>}
      </button>
      {open && <div className="fold-body">{children}</div>}
    </section>
  );
}

export function PackageRail({
  pkg,
  drawing,
  render,
  mode,
  result,
  dispatch,
}: {
  pkg: PackageState;
  drawing: DrawingState;
  render: RenderState;
  mode: ViewMode;
  result: SolveResult;
  dispatch: React.Dispatch<Action>;
}) {
  const [open, toggle] = useFolds();
  const tire = pkg.tire ?? ARCHITECTURES.find((a) => a.id === pkg.architecture)?.tire;
  const mm = (id: ControlId) => Math.round(result.controls[id]?.value ?? 0);
  const arch = ARCHITECTURES.find((a) => a.id === pkg.architecture);

  const summaries: Record<string, string> = {
    setup: `${arch?.label ?? ''} · ${pkg.seating} seats · ${tire}`,
    stance: `wb ${mm('wheelbase')} · front ${mm('front_overhang')} · rear ${mm('rear_overhang')}`,
    cabin: `H30 ${mm('h30')} · roof ${mm('roof_z')} · belt ${mm('belt_z')}`,
    front: `cowl ${mm('cowl_z')} · hood ${mm('hood_z')}`,
    tail: `deck ${mm('deck_z')}`,
    lines: `${LINE_DEFS.length} lines`,
    render: `${Math.round(render.tint * 100)}% tint · sun ${Math.round(render.sunEl * 90)}°`,
  };

  return (
    <div className="rail" data-testid="package-rail">
      <Fold id="setup" label="SETUP" summary={summaries.setup!} open={open.setup ?? false} onToggle={toggle}>
        <div className="section-label">ARCHITECTURE</div>
        <div className="choice-row">
          {ARCHITECTURES.map((a) => (
            <button
              key={a.id}
              className={`chip ${a.id === pkg.architecture ? 'active' : ''}`}
              title={a.description}
              onClick={() => dispatch({ type: 'set-architecture', id: a.id })}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="section-label">SEATS</div>
        <div className="choice-row">
          {SEATING_CONFIGS.map((s) => (
            <button
              key={s.id}
              className={`chip ${s.id === pkg.seating ? 'active' : ''}`}
              title={s.label}
              onClick={() => dispatch({ type: 'set-seating', id: s.id })}
            >
              {s.id}
            </button>
          ))}
        </div>
        <div className="section-label">TIRE</div>
        <div className="choice-row">
          <select
            value={tire}
            aria-label="tire designation"
            onChange={(e) => dispatch({ type: 'set-tire', designation: e.currentTarget.value })}
          >
            {[...new Set([tire, ...TIRE_CHOICES])].filter(Boolean).map((t) => (
              <option key={t} value={t as string}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </Fold>

      {mode === 'RENDER' && (
        <Fold id="render" label="RENDER" summary={summaries.render!} open={open.render ?? true} onToggle={toggle}>
          <div className="section-label">PAINT</div>
          <div className="choice-row">
            {PAINT_CHIPS.map((c) => (
              <button
                key={c.id}
                className={`chip swatch ${Math.abs(render.hue - c.hue) < 2 && Math.abs(render.sat - c.sat) < 0.02 ? 'active' : ''}`}
                onClick={() => dispatch({ type: 'set-render', patch: { hue: c.hue, sat: c.sat }, commit: true })}
              >
                <span
                  className="swatch-dot"
                  style={{ background: `hsl(${c.hue} ${Math.round(c.sat * 100)}% 52%)` }}
                />
                {c.label}
              </button>
            ))}
          </div>
          <PlainSlider
            label="glass tint"
            value={render.tint}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v, commit) => dispatch({ type: 'set-render', patch: { tint: v }, commit })}
          />
          <PlainSlider
            label="sun height"
            value={render.sunEl}
            format={(v) => `${Math.round(v * 90)}°`}
            onChange={(v, commit) => dispatch({ type: 'set-render', patch: { sunEl: v }, commit })}
          />
          <PlainSlider
            label="sun along the car"
            value={(render.sunAz + 1) / 2}
            format={(v) => (v < 0.47 ? 'behind' : v > 0.53 ? 'ahead' : 'overhead')}
            onChange={(v, commit) =>
              dispatch({ type: 'set-render', patch: { sunAz: v * 2 - 1 }, commit })
            }
          />
        </Fold>
      )}

      {GROUPS.map((grp) => (
        <Fold
          key={grp.id}
          id={grp.id}
          label={grp.label}
          summary={summaries[grp.id]!}
          open={open[grp.id] ?? false}
          onToggle={toggle}
        >
          {grp.controls.map((id) => (
            <ControlSlider key={id} id={id} result={result} dispatch={dispatch} />
          ))}
        </Fold>
      ))}

      <Fold id="lines" label="LINES" summary={summaries.lines!} open={open.lines ?? false} onToggle={toggle}>
        <div className="hint-line">double-click a line to add a point · alt-click a point to remove it</div>
        {LINE_DEFS.map((def) => {
          const count = linePoints(def.id, drawing, result).length;
          const authored = drawing.lines[def.id] !== undefined;
          return (
            <div className="line-row" key={def.id} data-testid={`line-row-${def.id}`}>
              <div className="line-row-head">
                <span className="line-name">{def.label}</span>
                <span className="line-meta">{count} pts</span>
                {authored && (
                  <button
                    className="reset"
                    title="back to the package default"
                    onClick={() => dispatch({ type: 'reset-line', line: def.id })}
                  >
                    reset
                  </button>
                )}
              </div>
              <PlainSlider
                label="curve"
                compact
                value={lineTension(def.id, drawing)}
                format={(v) => (v < 0.05 ? 'straight' : v > 0.95 ? 'full' : v.toFixed(2))}
                onChange={(v, commit) =>
                  dispatch({ type: 'set-tension', line: def.id, tension: v, commit })
                }
              />
            </div>
          );
        })}
      </Fold>
    </div>
  );
}

function PlainSlider({
  label,
  value,
  format,
  onChange,
  compact,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  onChange: (v: number, commit: boolean) => void;
  compact?: boolean;
}) {
  return (
    <div className={`control plain ${compact ? 'compact' : ''}`}>
      <div className="control-head">
        <span className="control-name">{label}</span>
        <span className="control-value">{format(value)}</span>
      </div>
      <input
        type="range"
        className="plain-range"
        min={0}
        max={1000}
        value={Math.round(value * 1000)}
        aria-label={label}
        onChange={(e) => onChange(Number(e.currentTarget.value) / 1000, false)}
        onPointerUp={(e) => onChange(Number(e.currentTarget.value) / 1000, true)}
        onKeyUp={(e) => onChange(Number(e.currentTarget.value) / 1000, true)}
      />
    </div>
  );
}

export { CONTROL_LABELS };
