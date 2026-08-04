import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allCases, type CaseSnapshot } from '../src/snapshot.js';

/**
 * The golden file: what the solver says today, frozen.
 *
 * Regenerate deliberately and never automatically —
 *
 *   PKGPROP_REGENERATE_GOLDEN=1 pnpm vitest run validation
 *
 * — so that every diff to `golden.json` is a decision someone made and can be
 * read in review. A snapshot that rewrites itself on failure proves nothing.
 */

const goldenPath = join(dirname(fileURLToPath(import.meta.url)), 'golden.json');
const regenerate = process.env.PKGPROP_REGENERATE_GOLDEN === '1';

const current = allCases();

if (regenerate) {
  mkdirSync(dirname(goldenPath), { recursive: true });
  writeFileSync(goldenPath, `${JSON.stringify(current, null, 2)}\n`);
}

describe('the solver says what it said yesterday', () => {
  it('the golden file exists', () => {
    expect(
      existsSync(goldenPath),
      'No golden.json. Create it with PKGPROP_REGENERATE_GOLDEN=1 pnpm vitest run validation',
    ).toBe(true);
  });

  const golden: CaseSnapshot[] = existsSync(goldenPath)
    ? (JSON.parse(readFileSync(goldenPath, 'utf8')) as CaseSnapshot[])
    : [];
  const byId = new Map(golden.map((c) => [c.id, c]));

  it('covers the same set of configurations', () => {
    expect(current.map((c) => c.id).sort()).toEqual(golden.map((c) => c.id).sort());
  });

  for (const now of current) {
    describe(now.id, () => {
      const was = byId.get(now.id);

      // Split rather than one deep-equal, so a failure says which KIND of
      // thing moved — a number, or who authored it — without reading a diff.
      it('bounds: same values, and the same constraint winning each wall', () => {
        expect(was).toBeDefined();
        expect(now.bounds).toEqual(was?.bounds);
      });

      it('controls land in the same place against the same walls', () => {
        expect(now.controls).toEqual(was?.controls);
      });

      it('readouts unchanged', () => {
        expect(now.readouts).toEqual(was?.readouts);
      });

      it('conflicts unchanged — a config that stops conflicting has changed too', () => {
        expect(now.conflicts).toEqual(was?.conflicts);
      });

      it('geometry unchanged', () => {
        expect(now.geometry).toEqual(was?.geometry);
      });

      it('the buildable envelope is authored by the same constraints', () => {
        expect(now.envelope).toEqual(was?.envelope);
        expect(now.plan).toEqual(was?.plan);
      });

      it('license counts unchanged', () => {
        expect(now.counts).toEqual(was?.counts);
      });
    });
  }
});

/**
 * The severance canary — DECISIONS.md #6.
 *
 * Chains must re-read the registry INSIDE the contribution trace. Hoisting a
 * read above the trace still produces the right number, so nothing fails; the
 * wall just quietly forgets why it stands where it does, and the conflict
 * report loses a resolver the user needed. Until now the whole invariant rested
 * on a comment and a single assertion. These pin it.
 */
/**
 * Walls known to name no parameter at all. **Empty, and it stays empty.**
 *
 * It held `hood_z.upper` through Phase 0: `sight_over_hood` computed entirely
 * from `eye` and `cowl`, two objects built in earlier stages of solve() and
 * handed in as bare numbers, so it read the registry zero times and a hood
 * conflict could name no resolver at all. Registry.publish/inherit closed it —
 * a placed quantity now carries its provenance forward instead of dropping it.
 *
 * Anything appearing here again is a regression, not a fact of life.
 */
const KNOWN_EMPTY_CHAINS: string[] = [];

describe('attribution chains are not severed', () => {
  it('no wall beyond the known-severed list names zero parameters', () => {
    const severed = new Set<string>();
    for (const c of allCases()) {
      for (const [q, b] of Object.entries(c.bounds)) {
        for (const side of ['lower', 'upper'] as const) {
          const w = b[side];
          if (w && w.chain.length === 0) severed.add(`${q}.${side}`);
        }
      }
    }
    const unexpected = [...severed].filter((s) => !KNOWN_EMPTY_CHAINS.includes(s)).sort();
    const fixed = KNOWN_EMPTY_CHAINS.filter((s) => !severed.has(s)).sort();
    expect(
      { unexpected, fixed },
      `A wall computed from no registry read at all. Either its number is a ` +
        `bare constant, or every value it uses was computed outside the trace ` +
        `— which severs attribution (DECISIONS.md #6).\n` +
        (unexpected.length ? `  Newly severed: ${unexpected.join(', ')}\n` : '') +
        (fixed.length ? `  Fixed — remove from KNOWN_EMPTY_CHAINS: ${fixed.join(', ')}\n` : ''),
    ).toEqual({ unexpected: [], fixed: [] });
  });

  it('the EV roof floor still points at the battery that raised it', () => {
    // The canonical case: an EV's battery lifts the floor, which lifts every
    // head, which lifts the roof. If the chain severs anywhere along that
    // path the user is told the roof is bound by an occupant and never learns
    // the battery is why.
    const ev = allCases().find((c) => c.id === 'ev/2');
    expect(ev).toBeDefined();
    const roof = ev?.bounds.roof_z?.lower;
    expect(roof?.constraint).toMatch(/^occupant_roof_row/);
    expect(roof?.chain).toContain('arch_battery_thickness');
    expect(roof?.assumedKnobs).toContain('arch_battery_thickness');
  });

  it('the roof floor carries the whole seated-height derivation, recline included', () => {
    // seatedHeightOf() is rise·cos(back) + head. All three must appear, or the
    // recline model is being read outside the trace and the wall cannot
    // explain why laying the driver back lowered the roof.
    const fr = allCases().find((c) => c.id === 'fr/2');
    const chain = fr?.bounds.roof_z?.lower?.chain ?? [];
    for (const id of ['anthro_shoulder_rise', 'anthro_head_stack', 'seat_back_angle_deg']) {
      expect(chain, `roof floor chain is missing ${id}`).toContain(id);
    }
  });

  it('the windshield ceiling carries the head clearance it is tangent to', () => {
    const fr = allCases().find((c) => c.id === 'fr/2');
    const header = fr?.bounds.header_x?.upper;
    expect(header?.chain).toContain('anthro_head_radius');
  });
});
