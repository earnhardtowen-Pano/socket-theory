# PROGRESS: car form space

Kit: Form Space Build Kit (Nov 21, 2026). A new session needs that doc attached again. It is not stored in this repo.

## State

**Spec 1 for car is complete (first pass).** All eight stages are done and every "Done when" line holds.

| Done when | Result |
|---|---|
| All three engine tests pass | roundTripBad 0, normalizeBad 0, edgesOk true |
| 3,000 random addresses draw with zero errors | 0 failures in 30,000 drawings |
| No option is flagged as invisible | 0 of 424 |
| The page works at 390 px with no console errors | 23 of 23 steps, 0 errors |
| `REPORT.md` exists and names its gaps | yes, 55 gaps listed |

## The reading taken

The request was "Write cars now", after Spec 1 for eyeglasses. Reading taken: **Run Spec 1 for: car**. The outside of the car only. The inside is listed in `items.md` as one gap.

## Environment (checked, not assumed)

- Can run code: yes (Node 22, Python 3).
- Can turn SVG into images and look at them: yes (headless Chromium through Playwright, then read the PNG).
- Can open a page in a browser: yes, headless, at 390 px wide.
- Web: not used. Everything factual is from memory, unverified.

## Files

The car is built on a shared folder, `form-space/kit/`. A new thing needs only `items.md`, `space.js` and `draw.js`.

| File | What it is |
|---|---|
| `car/items.md` | Stage 1. 188 items under the seven distances, each tagged with the axis that says it or `[gap]` |
| `car/space.js` | Axes, rules, the Language agreements, and what the page needs to know about this thing (`THING`) |
| `car/draw.js` | Choices to SVG in mm: side, front, rear, top, street. Low-detail mode for thumbnails. The sounds |
| `car/index.html` | The built page. Open it in any browser |
| `car/REPORT.md` | Stage 8, written by `kit/report.js` from the check results |
| `car/checks/` | Results, rendered sheets, page screenshots, and `looked-at.json` (kept by hand) |
| `kit/engine.js` | The engine, Appendix A unchanged. `kit/appendix-a.js` is the kit's text to compare against |
| `kit/draw-util.js` | Colour, paths, rounded corners, outlines from numbers |
| `kit/page.html`, `kit/ui.js` | The page, shared |
| `kit/build.js`, `engine-test.js`, `gate.js`, `page-test.js`, `report.js`, `shot.js` | Build and checks, each taking a thing folder |

## How to rerun everything

From `form-space/`:

```
node kit/engine-test.js car --json   # engine identical to the kit, three tests
node kit/gate.js car                 # 3,000 random draws, XML, identical test, sheets
node kit/build.js car                # car/index.html
node kit/page-test.js car            # the page at 390 px
node kit/report.js car               # car/REPORT.md
```

`car/checks/looked-at.json` is kept by hand. Update it whenever sheets are looked at, or the report will claim looks that did not happen.

## Decisions

- The body is held as fixed points: lengths along the car, heights and half-widths. The side view uses length and height, front and rear use width and height, top uses length and width. Dimensions agree across views. Surfaces between the points do not (see the report).
- Body types are numbers, not names: roof length, fall angle, tail height, cabin position. One named axis, Load bed, is allowed only where the roof stops early and the back drops steeply.
- Socket depth, brow ridge and aperture ratio from Socket Theory are Face axes and are held by Language.
- Badges are blank shapes. No maker's grille shape is stored.
- Nose and tail roundness sit under Face, not Form. They cannot be seen in a thumbnail.
- An axis may name helper choices (`help`) for the gate. The report lists all 16.
- Axis ids must not be `gap`, `out`, `derived` or start with `part`, because `items.md` uses those as tags.
- Version label for stored addresses: `car-1.0`.
- The page is published as a private artifact: https://claude.ai/artifact/2uNxFG1joQF7nrJPynRT9p . To update it, run `node kit/build.js car --body <file>` and publish that file to the same URL.

## Not done

- **Eyeglasses are not on the kit.** `eyeglasses/` still runs from its own copy of the engine, page and checks, unchanged and passing. Moving it over is Spec 5 stage 2 (port, then prove every count and test is unchanged).
- No shared axes file yet. `hue`, `tone`, `sat` and `finish` have the same ids in both things but different option lists.

## Next

Any of these, in the kit's order:

1. **Spec 5** to finish the kit: port eyeglasses, shared axes, the gallery.
2. **Spec 2 for car** (census and misses). Needs web access to do properly.
3. **Spec 6 for car** (depth pass). Depth score now: 124 of 188 items covered (66%), 58% of axes from numbers, axes per distance 25 / 58 / 16 / 8 / 7 / 2 / 2, all options looked at once and 10 of 118 axes again after the last fixes. Use, Touch and Sound are under eight axes. Stage 7 (one body in three dimensions, projected into every view) is the biggest single gain.
