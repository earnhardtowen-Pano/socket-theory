# PROGRESS: eyeglasses form space

Kit: Form Space Build Kit (Nov 21, 2026). A new session needs that doc attached again. It is not stored in this repo.

## State

**Spec 1 for eyeglasses is complete (first pass).** All eight stages are done and every "Done when" line holds. Nothing else has been started.

| Done when | Result |
|---|---|
| All three engine tests pass | roundTripBad 0, normalizeBad 0, edgesOk true |
| 3,000 random addresses draw with zero errors | 0 failures in 24,000 drawings |
| No option is flagged as invisible | 0 of 339 |
| The page works at 390 px with no console errors | 24 of 24 steps, 0 errors |
| `REPORT.md` exists and names its gaps | yes, 41 gaps listed |

## The reading taken

The kit arrived with no command line. Reading taken: **Run Spec 1 for: eyeglasses**, because the kit says to build eyeglasses first.

## Environment (checked, not assumed)

- Can run code: yes (Node 22, Python 3).
- Can turn SVG into images and look at them: yes (headless Chromium through Playwright, then read the PNG).
- Can open a page in a browser: yes, headless, at 390 px wide.
- Web: not used. Everything factual is from memory, unverified.

## Files

| File | What it is |
|---|---|
| `items.md` | Stage 1. 225 items under the seven distances, each tagged with the axis that says it or `[gap]` |
| `space.js` | Axes, rules and the engine (Appendix A, unchanged) |
| `draw.js` | Choices to SVG in mm: front, side, top, worn. Low-detail mode for thumbnails |
| `ui.js`, `page.html` | The page |
| `build.js` | Joins them into `index.html` |
| `index.html` | The built page. Open it in any browser |
| `REPORT.md` | Stage 8, written by `checks/report.js` from the check results |
| `checks/` | Scripts, results and rendered sheets |

## How to rerun everything

```
node checks/engine-test.js --json   # engine identical to the kit, three tests
node checks/gate.js                 # 3,000 random draws, XML, identical test, sheets
node build.js                       # index.html
node checks/page-test.js            # the page at 390 px
node checks/report.js               # REPORT.md
```

`checks/looked-at.json` is kept by hand. Update it whenever sheets are looked at, or the report will claim looks that did not happen.

`checks/_shot.js` is a small helper for rendering chosen settings as a close-up sheet.

## Decisions

- Folder: `form-space/eyeglasses/`. A later Spec 5 run would add `form-space/kit/` and move the engine, the page and shared drawing code there.
- Version label for stored addresses: `eyeglasses-1.0` (`VERSION` in `space.js`). Adding or reordering axes changes what a number points to, so bump it then.
- Axis ids meant to be shared across things later (Spec 5 stage 4): `hue`, `tone`, `sat`, `finish`, `soft` (corner softness), `sides`.
- Quantities are listed default first in `space.js` (the engine wants the default first) but the page steps and shows them in ascending order.
- The gate judges Form axes on a whole view at 180 px, so a Form axis must show in a thumbnail. Other axes are judged at 360 px on their own `look`.
- Seven axes are judged with helper choices changed (`HELP` in `checks/gate.js`). Named in the report.
- A rimless front draws no front rivets. The mount takes their place. Temple rivets still follow the rivet count.
- The page is published as a private artifact: https://claude.ai/artifact/MFDVmUG3zjaDvhmB1KPDdv . To update it, run `node build.js --body <file>` and publish that file to the same URL.

## Next

Any of these, in the kit's order:

1. **Spec 2 for eyeglasses** (census and misses). Needs web access to do properly. It gives the first coverage score.
2. **Spec 6 for eyeglasses** (depth pass). Depth score now: 162 of 225 items covered (72%), 48% of axes from numbers, axes per distance 23 / 28 / 19 / 7 / 9 / 4 / 1, share of options looked at by eye: all once, 24 of 91 axes again after the last fixes. Light and motion, Touch and Sound are under eight axes each.
3. **Spec 1 for kettle**, the next thing in the base set.
