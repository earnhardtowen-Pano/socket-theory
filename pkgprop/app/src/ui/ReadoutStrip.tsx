import type { SolveResult } from '@pkgprop/core';

const SHOW = [
  'overall_length',
  'tire_diameter',
  'floor_z',
  'eye_z',
  'ground_sight_actual',
  'rake_floor_deg',
  'rake_deg',
] as const;

/** Labeled readouts along the bottom — every number tagged, per Law 4. */
export function ReadoutStrip({ result }: { result: SolveResult }) {
  return (
    <div className="readout-strip" data-testid="readouts">
      {SHOW.map((id) => {
        const r = result.readouts.find((x) => x.id === id);
        if (!r) return null;
        const value =
          r.unit === 'deg' ? (Math.round(r.value * 10) / 10).toFixed(1) : String(Math.round(r.value));
        return (
          <div className="readout" key={id} title={`${r.derivation} — DERIVED`}>
            <div className="k">{r.label}</div>
            <div className="v">
              {value}
              <span className="unit"> {r.unit}</span>
            </div>
          </div>
        );
      })}
      <div className="readout">
        <div className="k">walls holding controls</div>
        <div className="v">
          {Object.values(result.controls).filter((c) => c.touching).length}
          <span className="unit"> touching</span>
        </div>
      </div>
    </div>
  );
}
