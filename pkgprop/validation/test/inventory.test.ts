import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ARCHITECTURES, GLOBAL_PARAMS, SEATING_CONFIGS, parseTire } from '@pkgprop/data';

/**
 * INVENTORY.md, checked against the code it describes.
 *
 * The document makes ninety-odd `file:line` claims and quotes reason strings
 * and notes verbatim. Those are exactly the claims that rot: the moment Phase 1
 * moves a constraint, every line number in the inventory is a lie, and a
 * document that lies about where things are is worse than no document.
 *
 * So the inventory is a checked artifact. If this test fails after a refactor,
 * the inventory needs updating — that is the point, not an inconvenience.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const inventory = read('INVENTORY.md');
const metasSrc = read('core/src/constraints/metas.ts');

/** Constraint ids, with the row factory's template flattened to `{N}`. */
const constraintIds = [...metasSrc.matchAll(/^\s+id: [`'](.+?)[`'],/gm)]
  .map((m) => m[1]!)
  .map((s) => s.replace('${row}', '{N}'));

/**
 * Parameter ids from the real data package, not from a regex over the source.
 * A regex also matches the architecture preset ids (`fr`, `mr`, …), which are
 * not parameters and inflated the count by five.
 */
const paramIds = [
  ...GLOBAL_PARAMS,
  ...ARCHITECTURES.flatMap((a) => a.params),
  ...SEATING_CONFIGS.flatMap((s) => s.params),
  ...parseTire('245/40R19').params,
].map((p) => p.id);

/** Every source and doc file, comment markers stripped and whitespace flattened. */
function corpus(): string {
  const acc: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(root, dir))) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      const rel = dir ? `${dir}/${entry}` : entry;
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx|md)$/.test(entry) && rel !== 'INVENTORY.md') acc.push(read(rel));
    }
  };
  walk('');
  // JSDoc line markers must go, or any quote spanning two comment lines can
  // never match no matter how faithfully it was copied.
  return acc.join('\n').replace(/^[ \t]*\*[ \t]?/gm, '').replace(/\s+/g, ' ');
}

const SOURCE = corpus();

describe('INVENTORY.md describes the code that is actually here', () => {
  it('names every constraint in metas.ts', () => {
    const absent = constraintIds.filter((id) => !inventory.includes(id));
    expect(absent, `constraints missing from the inventory: ${absent.join(', ')}`).toEqual([]);
    expect(constraintIds.length).toBe(33);
  });

  it('invents no constraint that does not exist', () => {
    const looksLikeConstraint =
      /^(front_crush|rear_crush|style_[a-z_]+|seat_band|dash_[a-z_]+|footwell|wheelbase_budget|occupant_roof[a-z_{}N]*|sight_[a-z_]+|tire_clearance|hood_over_[a-z_]+|engine_[a-z_]+|cargo_under_deck|door_stack|head_tangency|upright_glass|longest_glass|rear_seat_structure|mid_engine_bay|battery_fit|ground_clearance|cabin_floor|wheels_on_track|shoulder_room)$/;
    const named = [...new Set([...inventory.matchAll(/`([a-z][a-z0-9_]{4,})`/g)].map((m) => m[1]!))];
    const ghosts = named.filter(
      (id) => looksLikeConstraint.test(id) && !constraintIds.includes(id) && !paramIds.includes(id),
    );
    expect(ghosts, `named but nonexistent: ${ghosts.join(', ')}`).toEqual([]);
  });

  it('invents no parameter that does not exist', () => {
    const named = [...new Set([...inventory.matchAll(/`([a-z]+_[a-z0-9_]+)`/g)].map((m) => m[1]!))];
    const paramLike = named.filter((n) =>
      /^(anthro|arch|structure|tire|glass|vision|seat|style|body|door|cargo|chassis|unit)_/.test(n),
    );
    const ghosts = paramLike.filter((n) => !paramIds.includes(n) && !constraintIds.includes(n));
    expect(ghosts, `named but nonexistent: ${ghosts.join(', ')}`).toEqual([]);
  });

  it('every file:line reference resolves to a line that exists', () => {
    const roots = ['core/src/constraints/', 'core/src/', 'app/src/model/features/', 'app/src/state/', ''];
    const broken: string[] = [];
    let checked = 0;
    for (const [, file, lineNo] of inventory.matchAll(/`?([a-zA-Z0-9_/.]+\.tsx?):(\d+)/g)) {
      let text: string | null = null;
      for (const r of roots) {
        try {
          text = read(r + file!);
          break;
        } catch {
          /* keep looking */
        }
      }
      if (text === null) {
        broken.push(`${file} — no such file`);
        continue;
      }
      const lines = text.split('\n').length;
      if (Number(lineNo) > lines) broken.push(`${file}:${lineNo} — file has ${lines} lines`);
      checked += 1;
    }
    expect(broken, `stale references:\n  ${broken.join('\n  ')}`).toEqual([]);
    expect(checked).toBeGreaterThan(50);
  });

  it('every quote marked verbatim is verbatim', () => {
    // An elided quote ("a … b") is legitimate; each surviving fragment must
    // still appear in the source exactly as written.
    const quotes = [...inventory.matchAll(/\*"([^"]{18,})"\*/g)].map((m) =>
      m[1]!.replace(/\s+/g, ' '),
    );
    const fragments = quotes
      .flatMap((q) => q.split('…').map((f) => f.trim()))
      .filter((f) => f.length >= 12);
    const misquoted = fragments.filter((f) => !SOURCE.includes(f));
    expect(
      misquoted,
      `These are presented as verbatim but do not appear in the source. ` +
        `Usually an added full stop or a reflowed line:\n  ${misquoted.join('\n  ')}`,
    ).toEqual([]);
    expect(fragments.length).toBeGreaterThan(10);
  });

  it('the parameter counts it reports are the counts the registry has', () => {
    const distinct = new Set(paramIds);
    expect(distinct.size).toBe(59);
    expect(inventory).toContain('59 distinct parameters');
  });
});
