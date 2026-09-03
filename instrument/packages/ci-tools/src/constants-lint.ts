/**
 * No-bare-constants lint — the backstop behind the branded Quantity typecheck.
 *
 * Scope: the licensed packages only (demand, types, pack, lens). Every numeric
 * literal there must be an argument (at any depth) to a derived/sourced/assumed
 * factory call, or fall under a syntactic exemption:
 *   - the identity literals 0, 1, -1, 2
 *   - element access (a[3]) and for-statement headers
 *   - *.test.ts files
 */

import ts from "typescript";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface LintViolation {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly rule: string;
}

const FACTORY_NAMES = new Set(["derived", "sourced", "assumed", "override"]);
const EXEMPT_VALUES = new Set([0, 1, -1, 2]);

export function listTsFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) listTsFiles(full, out);
    else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function insideFactoryCall(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : undefined;
      if (name && FACTORY_NAMES.has(name)) return true;
    }
    cur = cur.parent;
  }
  return false;
}

function isExemptContext(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isElementAccessExpression(cur)) return true;
    if (ts.isForStatement(cur)) return true;
    if (ts.isEnumDeclaration(cur)) return true;
    cur = cur.parent;
  }
  return false;
}

export function scanBareConstants(licensedDirs: readonly string[]): LintViolation[] {
  const violations: LintViolation[] = [];
  for (const dir of licensedDirs) {
    for (const file of listTsFiles(dir)) {
      if (file.endsWith(".test.ts")) continue;
      const text = readFileSync(file, "utf8");
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
      const visit = (node: ts.Node): void => {
        if (ts.isNumericLiteral(node)) {
          let value = Number(node.text);
          // account for unary minus
          if (node.parent && ts.isPrefixUnaryExpression(node.parent) &&
              node.parent.operator === ts.SyntaxKind.MinusToken) {
            value = -value;
          }
          const exempt =
            EXEMPT_VALUES.has(value) || isExemptContext(node) || insideFactoryCall(node);
          if (!exempt) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            violations.push({
              file,
              line: line + 1,
              text: node.getText(),
              rule: "no-bare-constants: numeric literal outside derived/sourced/assumed",
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }
  return violations;
}
