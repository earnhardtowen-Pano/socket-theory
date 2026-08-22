/**
 * Boundary and determinism lints.
 *
 * 1. Blind-solver import rule: @car/pack may import only schema, num, demand
 *    (and its own files). The demand/port records carry no part-type field, the
 *    import rule removes the temptation, and the rename-fuzz behavioral test in
 *    @car/pack's suite is the third layer.
 *
 * 2. Determinism bans below the render seam: no Date.now / new Date /
 *    performance.now / Math.random anywhere in the model cone; no
 *    implementation-defined Math transcendentals outside @car/num (the
 *    sanctioned wrappers); no JSON.stringify inside files named *hash*.
 */

import ts from "typescript";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { listTsFiles, type LintViolation } from "./constants-lint.js";

const PACK_ALLOWED_IMPORTS = ["@car/schema", "@car/num", "@car/demand", "./", "../", "node:"];

export function scanPackImports(packSrcDir: string): LintViolation[] {
  const violations: LintViolation[] = [];
  for (const file of listTsFiles(packSrcDir)) {
    const text = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const spec = stmt.moduleSpecifier.text;
        const ok = PACK_ALLOWED_IMPORTS.some((p) => spec.startsWith(p));
        if (!ok) {
          const { line } = sf.getLineAndCharacterOfPosition(stmt.getStart());
          violations.push({
            file,
            line: line + 1,
            text: spec,
            rule: "blind-solver: @car/pack may import only schema/num/demand",
          });
        }
      }
    }
  }
  return violations;
}

/** Implementation-defined Math members — banned raw outside @car/num. */
const BANNED_MATH = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
  "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
  "exp", "expm1", "log", "log2", "log10", "log1p",
  "pow", "cbrt", "hypot", "random",
]);

export function scanDeterminism(
  modelConeDirs: readonly string[],
  numSrcDir: string,
): LintViolation[] {
  const violations: LintViolation[] = [];
  for (const dir of modelConeDirs) {
    for (const file of listTsFiles(dir)) {
      if (file.endsWith(".test.ts")) continue;
      const inNum = file.startsWith(numSrcDir);
      const isHashFile = basename(file).includes("hash");
      const text = readFileSync(file, "utf8");
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
      const flag = (node: ts.Node, rule: string, snippet: string): void => {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        violations.push({ file, line: line + 1, text: snippet, rule });
      };
      const visit = (node: ts.Node): void => {
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
          const obj = node.expression.text;
          const member = node.name.text;
          if (obj === "Math" && BANNED_MATH.has(member) && !inNum) {
            flag(node, "determinism: raw Math transcendental/random outside @car/num", `Math.${member}`);
          }
          if (obj === "Date" && member === "now") {
            flag(node, "determinism: wall clock in the model cone", "Date.now");
          }
          if (obj === "performance" && member === "now") {
            flag(node, "determinism: wall clock in the model cone", "performance.now");
          }
          if (obj === "JSON" && member === "stringify" && isHashFile) {
            flag(node, "determinism: JSON.stringify must not feed hashing", "JSON.stringify");
          }
        }
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
            node.expression.text === "Date" && (!node.arguments || node.arguments.length === 0)) {
          flag(node, "determinism: argless new Date in the model cone", "new Date()");
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }
  return violations;
}
