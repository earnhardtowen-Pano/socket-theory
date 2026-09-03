# Thursday — where the run stands and what resumes

Written at the v1 close-out (owner directive: v1 usable now, major work resumes
Thursday). Everything below is on branch
`claude/panoramic-car-design-authoring-2ls5f7`, tags `gate/g1` and `v1`.

## V1, usable today

- **The tool**: https://claude.ai/code/artifact/fbf98210-dfcf-473f-8116-e33bd5c0601c
  (owner-private artifact; same URL updates in place). Locally:
  `cd instrument && npm install && npm run dev`.
- Works end to end: side/plan/front/section/inspect views on the mm grid;
  tape box (typed AT/DEPTH — exact values, clause 8), tape line splits with
  T-junctions, push-pull through welds, PINCH (clause 20's contact-point
  gesture, accent control handles), crease, smooth/crude toggle, zebra;
  UNDO (replay-minus-last, floored at the chassis seed); SAVE/OPEN
  (device storage + a real `.car.json` via the mediated download); NEW;
  PRINT (in-browser conforming mesh + closed check; hands over the STL as
  `.stl.txt` — the host allowlist has no `.stl`; rename for the slicer).
- Tally at v1: 466 tests green across 39 files; typecheck strict-clean;
  honesty lints green; gate/g1 evidence in GATE-G1.md.

## Resumes Thursday (in order)

1. **G2 — the chassis solve made visible**: wire car1 (`@car/fixtures`, cited
   MX-5 ND) and the shoebox V16 through `@car/pack` via the type factories
   (`@car/types` index is in); assert expected hard points within the ±15 mm
   ASSUMED tolerance; publish hard points into the shell grids as
   requirement-linked snaps; mass ledger readout in the ledger strip;
   GATE-G2.md + `gate/g2` tag. All parts exist — this is wiring.
2. **P3 — G3**: flow solve as a two-variant bake-off (tangent-live /
   curvature-on-release per amendment A7), judged by zebra + CI, promoted by
   measurement; groove engraving (visual first); aero panel lens; STEP of one
   cut (amendment A8 path); five more battery cars (research lane); the
   scripted ten-minute test; GATE-G3.md + tag.
3. **Housekeeping**: apps/preview can fold into the main app; the
   session-limit-killed workflow runs are resumable via
   `Workflow({scriptPath, resumeFromRunId})` but the main-session direct path
   proved faster — prefer it.

## Law pointers

AUTHORING-SPEC.md (statute + amendments A1–A9) · CHARGE.md (the ratified
charge) · DESIGN-NOTES.md (constructed-vs-retrieved log, the max protocol,
integration findings) · GATE-G1.md (evidence). Reserved to the owner,
unchanged: crash-band table, tolerance calibration, shelf contents beyond
Panoramic's parts, the marked build interpretations.
