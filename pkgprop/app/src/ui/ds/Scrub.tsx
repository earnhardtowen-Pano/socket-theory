import { useEffect, useRef, useState } from 'react';

/**
 * The scrubber — one control, and it replaces every slider in the tool.
 *
 * A slider is a bad instrument for a number that matters. Its resolution is
 * whatever the panel is wide, it cannot be nudged without hunting for a
 * handle, and reading it back means eyeballing a thumb against a track. The
 * hardware answer — an encoder — has none of those problems: you grab the
 * value itself, push it as far as you like, and the travel per pixel is a
 * property of your hand rather than of the layout.
 *
 * So: drag anywhere on the row. Shift is fine (a tenth of the travel), Alt is
 * coarse (ten times). Click without moving and it becomes a text field, which
 * is the only honest way to enter an exact number. Arrows nudge, shift-arrow
 * strides, Home and End land on the walls. The meter underneath is a readout,
 * not a target — it shows where
 * the value sits in its live band, and where its walls are, and it never
 * takes a click, so it can never be mistaken for the thing you drag.
 */

export interface ScrubProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  /** Value change per pixel of drag. Defaults to one band per ~320 px. */
  readonly perPx?: number;
  readonly unit?: string;
  readonly decimals?: number;
  /** Marks on the meter: the walls this value is pressed against. */
  readonly walls?: readonly { at: number; label: string; side: 'lower' | 'upper' }[];
  /** True while the value is sitting on a wall — the meter goes hot. */
  readonly touching?: boolean;
  readonly hint?: string;
  /** Show this instead of the number — for values that read as words. */
  readonly display?: string;
  readonly testid?: string;
  onChange(value: number, commit: boolean): void;
}

const fmt = (n: number, d: number): string => (d > 0 ? n.toFixed(d) : String(Math.round(n)));

/**
 * How far the pointer may travel before a press stops being a click.
 *
 * A hand resting on a mouse button moves a pixel or two. Below this it is a
 * click and means "let me type"; above it, it is a drag and means "scrub".
 * One number for both decisions, so a twitch cannot do both.
 */
const DRAG_SLOP = 3;

export function Scrub({
  label,
  value,
  min,
  max,
  perPx,
  unit,
  decimals = 0,
  walls = [],
  touching = false,
  hint,
  display,
  testid,
  onChange,
}: ScrubProps) {
  const [typing, setTyping] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const drag = useRef<{ x: number; base: number; moved: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editing = typing !== null;

  /**
   * Select the whole value when the field OPENS, and never again.
   *
   * This used to depend on `typing`, which is the field's text rather than a
   * flag — so every keystroke changed the dependency, the effect re-ran, and
   * the whole field got re-selected. The next character then replaced
   * everything before it, and only the last one you typed survived. Typing
   * 2800 into the wheelbase committed 0, which silently clamped to the band's
   * lower wall. Every number in this tool is three or four digits, so the
   * type-an-exact-value path — the entire reason the field exists — could not
   * be used at all.
   */
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const span = Math.max(1e-9, max - min);
  const step = perPx ?? span / 320;
  const clamp = (n: number): number => Math.min(max, Math.max(min, n));

  const onPointerDown = (e: React.PointerEvent): void => {
    if (typing !== null) return;
    e.preventDefault();
    drag.current = { x: e.clientX, base: value, moved: false };
    setLive(true);
    const move = (ev: PointerEvent): void => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.x;
      // One threshold decides both questions — "has this become a drag" and
      // "was this a click" — so a two-pixel twitch cannot both scrub the value
      // and then open the type-in box on release.
      if (Math.abs(dx) > DRAG_SLOP) d.moved = true;
      if (!d.moved) return;
      // Fine and coarse are where a scrubber earns its keep: the same gesture
      // covers a whole band or a single millimetre without changing tools.
      const gain = ev.shiftKey ? 0.1 : ev.altKey ? 10 : 1;
      onChange(clamp(d.base + dx * step * gain), false);
    };
    const up = (ev: PointerEvent): void => {
      const d = drag.current;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      drag.current = null;
      setLive(false);
      if (d && !d.moved) {
        // A press that never moved was a click, and a click means "let me
        // type it".
        setTyping(fmt(value, decimals));
        return;
      }
      const dx = ev.clientX - (d?.x ?? 0);
      const gain = ev.shiftKey ? 0.1 : ev.altKey ? 10 : 1;
      onChange(clamp((d?.base ?? value) + dx * step * gain), true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const k = e.key;
    // Home and End put the value on its walls. Finding out what a wall says is
    // the single most common thing anyone does here, and hunting for the end
    // of a band with a drag to do it is silly.
    if (k === 'Home' || k === 'End') {
      e.preventDefault();
      onChange(k === 'Home' ? min : max, true);
      return;
    }
    if (k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'ArrowLeft' && k !== 'ArrowRight') return;
    e.preventDefault();
    const dir = k === 'ArrowUp' || k === 'ArrowRight' ? 1 : -1;
    const grain = e.shiftKey ? span / 20 : span / 200;
    onChange(clamp(value + dir * grain), true);
  };

  const commitTyped = (): void => {
    if (typing === null) return;
    const text = typing.trim();
    setTyping(null);
    // An empty field is a cancelled edit, not a request for zero. `Number('')`
    // is 0, so clearing the box and tabbing away used to slam the control onto
    // its lower wall — which looks exactly like the tool deciding something on
    // your behalf.
    if (text === '') return;
    const n = Number(text);
    if (Number.isFinite(n)) onChange(clamp(n), true);
  };

  const t = (value - min) / span;
  const pct = (n: number): number => Math.min(100, Math.max(0, ((n - min) / span) * 100));

  return (
    <div className={`scrub ${live ? 'live' : ''} ${touching ? 'touching' : ''}`} data-testid={testid}>
      <div
        className="scrub-row"
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
      >
        <span className="scrub-label">{label}</span>
        {typing !== null ? (
          <input
            ref={inputRef}
            className="scrub-input"
            value={typing}
            inputMode="decimal"
            onChange={(e) => setTyping(e.currentTarget.value)}
            onBlur={commitTyped}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitTyped();
              if (e.key === 'Escape') setTyping(null);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="scrub-value">
            {display ?? fmt(value, decimals)}
            {unit ? <em>{unit}</em> : null}
          </span>
        )}
      </div>
      <div className="scrub-meter" aria-hidden="true">
        <span className="scrub-fill" style={{ width: `${Math.min(100, Math.max(0, t * 100))}%` }} />
        {walls.map((w) => (
          <span
            key={`${w.side}-${w.at}`}
            className={`scrub-wall ${w.side}`}
            style={{ left: `${pct(w.at)}%` }}
            title={w.label}
          />
        ))}
        <span className="scrub-head" style={{ left: `${Math.min(100, Math.max(0, t * 100))}%` }} />
      </div>
      {hint ? <p className="scrub-hint">{hint}</p> : null}
    </div>
  );
}
