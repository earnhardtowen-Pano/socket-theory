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

6. **Chains re-read the registry inside every trace.** Passing a precomputed
   number into a contribution severs its attribution chain (an EV roof
   conflict must point at battery thickness). `chains.ts` holds the shared
   derivations as functions over the registry, called inside traces only.

7. **The rake-floor monotonicity that is guaranteed is in the clearance
   radius.** Tangency angle rises strictly as demanded clearance grows, and
   the farthest legal header pulls forward — that is the property test.
   Monotonicity in cowl or head position alone is not globally true
   (two competing terms) and is not claimed.

8. **The rear-vision ceiling starts at the backlight, not the eye.** The
   glass transmits the view; only the opaque deck ducks under the sight
   line. Backlight base is an ASSUMED station aft of the last hip. Without
   this the ceiling clipped the driver's own head sphere, which was wrong.

9. **An inverted band pins the control to its lower wall.** Demands
   (occupants, structure) outrank targets (style caps) when a band inverts;
   the geometry stays physical and the conflict chip reports the broken
   target. Nothing silently clamps — the chip is the report.

10. **A `backlight` line was added to the characteristic set.** The brief's
    eight side-view lines leave the silhouette open between roof and deck;
    the backlight closes it under the same clamp contract.

11. **Ten-minute defaults.** Default control fractions and the default style
    ceilings were tuned so FR·2 (and MR·2) open with zero conflicts. Configs
    that genuinely do not fit under the default targets (EV three-row under a
    2950 wheelbase cap) open with honest conflicts naming the knobs.

12. **Playwright pins the environment's Chromium** via launchOptions when
    `/opt/pw-browsers/chromium` exists, since the registry-installed browser
    version differs from the runner image.
