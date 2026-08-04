import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The license lint — Law 4 enforced in CI.
 *
 * Unlicensed constants are the disease this tool exists to cure. This test
 * walks the TypeScript AST of every file in core/src/constraints and fails
 * the build if a numeric literal appears there. Real-world numbers must
 * arrive through the parameter registry, where they carry a license.
 *
 * A tiny structural allowlist remains: 0, 1, 2, 0.5 — array indexing,
 * halving, doubling, sign flips. Nothing about a car is in that list.
 */

const ALLOWED = new Set([0, 1, 2, 0.5]);

const constraintsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'constraints',
);

interface Offense {
  file: string;
  line: number;
  text: string;
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

describe('license lint (Law 4, CI rule)', () => {
  const files = readdirSync(constraintsDir).filter((f) => f.endsWith('.ts'));

  it('finds the constraint files', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    it(`${file} contains no unlicensed constants`, () => {
      const offenses = scanFile(join(constraintsDir, file));
      const report = offenses
        .map((o) => `  ${file}:${o.line} — bare number ${o.text}`)
        .join('\n');
      expect(
        offenses,
        `Unlicensed constants found. Every real-world number must come from the registry:\n${report}`,
      ).toHaveLength(0);
    });
  }
});
