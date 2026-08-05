import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The license lint — Law 4 enforced in CI.
 *
 * Unlicensed constants are the disease this tool exists to cure. This test
 * walks the TypeScript AST of every constraint file and fails the build if a
 * numeric literal appears there. Real-world numbers must arrive through the
 * parameter registry, where they carry a license.
 *
 * A tiny structural allowlist remains: 0, 1, 2, 0.5 — array indexing,
 * halving, doubling, sign flips. Nothing about a car is in that list.
 * (Note `-1` is not in the list and does not need to be: it parses as a unary
 * minus applied to the literal 1, so the AST never sees a `-1` literal.)
 *
 * TWO THINGS THIS TEST MUST NEVER DO, both of which it used to do:
 *
 * 1. Scan one hardcoded directory. Roots are a list, and Phase 1 adds the car
 *    module's directory here rather than rewriting the test.
 * 2. Pass while checking nothing. The old guard was `files.length > 5`, a
 *    number that happened to match the eleven files then present. Move the
 *    constraints and the lint would have gone green over an empty directory —
 *    the enforcement mechanism for Law 4, silently disarmed. The manifest
 *    below is checked both ways: a file that disappears fails, and a file that
 *    appears without being listed fails. Adding a constraint file means
 *    admitting it here.
 */

const ALLOWED = new Set([0, 1, 2, 0.5]);

const here = dirname(fileURLToPath(import.meta.url));

/** Every directory whose numbers must come from the registry. Recursive. */
const SCAN_ROOTS = [join(here, '..', 'src', 'constraints')];

/** The files the lint expects to find, relative to their root. */
const MANIFEST = [
  'chains.ts',
  'chassis.ts',
  'ctx.ts',
  'envelope.ts',
  'metas.ts',
  'occupants.ts',
  'plan.ts',
  'structure.ts',
  'tires.ts',
  'vision.ts',
  'windshield.ts',
];

interface Offense {
  file: string;
  line: number;
  text: string;
}

/** Every .ts file under `dir`, at any depth, as paths relative to `dir`. */
function walk(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else if (entry.endsWith('.ts')) out.push(rel);
  }
  return out;
}

function scanFile(path: string): Offense[] {
  const source = readFileSync(path, 'utf8');
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const offenses: Offense[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isNumericLiteral(node)) {
      const value = Number(node.text);
      if (!ALLOWED.has(value)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        offenses.push({ file: path, line: line + 1, text: node.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return offenses;
}

const found: { root: string; rel: string; full: string }[] = [];
const missingRoots: string[] = [];
for (const root of SCAN_ROOTS) {
  if (!existsSync(root)) {
    missingRoots.push(root);
    continue;
  }
  for (const rel of walk(root)) found.push({ root, rel, full: join(root, rel) });
}

describe('license lint (Law 4, CI rule)', () => {
  it('every scan root exists', () => {
    expect(
      missingRoots,
      `A scan root is gone, so the lint would check nothing. If constraint ` +
        `code moved, point SCAN_ROOTS at its new home:\n` +
        missingRoots.map((r) => `  ${relative(here, r)}`).join('\n'),
    ).toEqual([]);
  });

  it('the files on disk are exactly the files the manifest expects', () => {
    const onDisk = found.map((f) => f.rel).sort();
    const expected = [...MANIFEST].sort();
    const gone = expected.filter((f) => !onDisk.includes(f));
    const unlisted = onDisk.filter((f) => !expected.includes(f));
    expect(
      { gone, unlisted },
      `The lint's manifest and the tree disagree.\n` +
        (gone.length ? `  Listed but missing (moved? renamed?): ${gone.join(', ')}\n` : '') +
        (unlisted.length ? `  Present but unlisted (add it to MANIFEST): ${unlisted.join(', ')}\n` : ''),
    ).toEqual({ gone: [], unlisted: [] });
  });

  for (const { rel, full } of found) {
    it(`${rel} contains no unlicensed constants`, () => {
      const offenses = scanFile(full);
      const report = offenses
        .map((o) => `  ${rel}:${o.line} — bare number ${o.text}`)
        .join('\n');
      expect(
        offenses,
        `Unlicensed constants found. Every real-world number must come from the registry:\n${report}`,
      ).toHaveLength(0);
    });
  }
});
