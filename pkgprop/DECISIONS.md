# DECISIONS

Running log of decisions made without asking, per brief §5.7. Newest last.

1. **Project lives in `pkgprop/` at repo root.** The repo already carries the
   owner's Socket Theory portfolio (README, demonstrator, vehicles). The brief
   assumes a dedicated repo; rather than overwrite the portfolio README or mix
   trees, the whole monorepo (including its own README) sits under `pkgprop/`.
   Everything in the brief's `/core`-style paths maps to `pkgprop/core` etc.

2. **Seed reconstructed from brief.** `seed/pkgprop-v0.jsx` was not in the repo.
   The four seed contracts (fraction-of-bounds sliders, wall attribution on
   contact, license ledger, envelope-as-threshold drawing) are implemented from
   their descriptions in brief §1. Logged as OPEN_QUESTIONS #1 for the owner.

3. **pnpm workspaces, TypeScript strict, ESM, Vitest.** Node 22 environment.
   All internal units millimeters; angles stored in degrees at the registry
   surface (human-readable) and converted to radians only inside math.

4. **License lint is a Vitest test using the TypeScript AST.** It walks every
   file in `core/src/constraints/` and fails on any numeric literal outside a
   tiny structural allowlist (0, 1, -1, 2, 0.5 — array indices, halving,
   sign flips). Every real-world number must arrive via the parameter registry.
   Registered in CI as part of the standard test run, so the build is red the
   moment an unlicensed constant appears.

5. **Bounds are computed as contribution sets.** Each solved quantity collects
   lower-bound and upper-bound contributions from named constraints; the bound
   is max(lowers)/min(uppers) and the argmax/argmin IS the attribution. There is
   no stored string naming a wall anywhere — attribution falls out of the solve,
   live, per Law 3.
