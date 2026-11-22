# PROGRESS: eyeglasses form space

Kit: Form Space Build Kit (Nov 21, 2026). A new session needs that doc attached again. It is not stored in this repo.

## The reading taken

The kit arrived with no command line. Reading taken: **Run Spec 1 for: eyeglasses**, because the kit says to build eyeglasses first. Nothing else has been started.

## Environment (checked, not assumed)

- Can run code: yes (Node 22, Python 3).
- Can turn SVG into images and look at them: yes (headless Chromium through Playwright, then read the PNG).
- Can open a page in a browser: yes, headless, at 390 px wide.
- Web: not used. Spec 1 needs none. `items.md` is from memory, unverified.

## Decisions

- Folder: `form-space/eyeglasses/`. A later Spec 5 run would add `form-space/kit/`.
- The engine in `space.js` is Appendix A, token for token. `checks/appendix-a.js` is the copy taken from the PDF text, and `checks/engine-test.js` compares the two.
- Version label for stored addresses: see `VERSION` in `space.js`.

## Stages

- [x] 1. Itemize: `items.md`, 225 items
- [x] 2. Axes: 91 axes, 430 options, 44 built from numbers, 47 named
- [x] 3. Rules: 50, each with its reason in `space.js` (`why`)
- [x] 4. Addresses: total 4814108529147093512387826737772783838115328000000000000 (55 digits). Engine identical to Appendix A. roundTripBad 0, normalizeBad 0, edgesOk true (`node checks/engine-test.js`)
- [ ] 5. Drawing
- [ ] 6. The gate
- [ ] 7. The page
- [ ] 8. Report

## Next

Stage 5: write `draw.js`. Read Appendix B first.
