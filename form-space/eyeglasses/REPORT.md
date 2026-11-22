# Eyeglasses form space: report

Spec 1 of the Form Space Build Kit, first pass. Space version `eyeglasses-1.0`. Written 2026-11-22.

The page is `index.html`. Everything in this report is either read from the space or from a check that was run. Where something was not checked, it says so.

## The count

- **91 axes, 430 options.**
- **Total versions: 4814108529147093512387826737772783838115328000000000000** (55 digits).
- 44 axes are steps of a number, 47 are lists of names. That is 48% from numbers.
- 50 axes carry a rule.

| Distance | Axes | Options | From numbers |
|---|---:|---:|---:|
| 1. Form, across the room | 23 | 123 | 18 |
| 2. Face, at arm's length | 28 | 150 | 16 |
| 3. Detail, at two inches | 19 | 78 | 5 |
| 4. Light and motion, as light and parts move | 7 | 28 | 3 |
| 5. Use, in use | 9 | 32 | 0 |
| 6. Touch, in the hand | 4 | 16 | 2 |
| 7. Sound, by ear | 1 | 3 | 0 |

Light and motion, Touch and Sound are thin. Sound has one axis. That is a stated result of this pass, and the first job for a depth pass (Spec 6).

## Engine

The engine in `space.js` is Appendix A of the kit. `checks/engine-test.js` compares it with the kit's text token for token: **identical**.
The kit's three tests on the full space: roundTripBad 0, normalizeBad 0, edgesOk true.

Groups of axes tied together by rules:

- controlled by `lenses`, `hold`, `rim`, `mat`, `hinge`, `pads`, `clarity`: 3276 valid combinations, 38 dependent axes
- controlled by `hue`: 13 valid combinations, 1 dependent axis
- controlled by `pcon`: 4 valid combinations, 3 dependent axes
- controlled by `lam`, `fade`: 16 valid combinations, 1 dependent axis
- controlled by `tintd`: 6 valid combinations, 2 dependent axes
- controlled by `rivn`: 5 valid combinations, 1 dependent axis
- controlled by `mirror`: 4 valid combinations, 1 dependent axis

The largest group lists 3,276 combinations. The kit says to stay under a few tens of thousands and notes that 1,365 has been tested. This one is larger than the tested size and passed the three tests.

## Axes at each distance

### 1. Form

| Axis | id | Options | Built from |
|---|---|---|---|
| Lens layout | `lenses` | Two lenses · One shield | names |
| Lens width | `lw` | 50 mm · 40 mm · 44 mm · 47 mm · 53 mm · 56 mm · 59 mm · 62 mm · 34 mm *(extreme)* · 70 mm *(extreme)* | numbers |
| Lens height | `lh` | 38 mm · 25 mm · 29 mm · 33 mm · 42 mm · 46 mm · 50 mm · 55 mm · 18 mm *(extreme)* · 62 mm *(extreme)* | numbers |
| Outline sides | `sides` | Four · Two · Three · Five · Six · Eight | numbers |
| Corner softness | `soft` | 60% · 100% · 80% · 40% · 20% · 5% | numbers |
| Taper | `taper` | Even · Brow wider 6% · Brow wider 12% · Brow wider 20% · Cheek wider 8% | numbers |
| Cheek droop | `droop` | None · 8% · 16% · 26% · 40% *(extreme)* | numbers |
| Outer corner sweep | `sweep` | None · Up 10% · Up 20% · Up 35% · Up 55% *(extreme)* · Down 15% | numbers |
| Brow flatness | `brow` | Natural · Flatter · Flat · Arched | numbers |
| Nose cut | `ncut` | None · 8% · 16% · 26% | numbers |
| Lens tilt | `tilt` | Level · Outer up 5° · Outer up 10° · Outer down 5° · Outer down 10° | numbers |
| Bridge width | `dbl` | 18 mm · 14 mm · 16 mm · 20 mm · 22 mm · 24 mm · 10 mm *(extreme)* · 30 mm *(extreme)* | numbers |
| Wrap | `wrap` | 5° · 0° · 10° · 15° · 20° · 28° | numbers |
| Lens curve | `base` | Base 4 · Flat · Base 2 · Base 6 · Base 8 | numbers |
| Forward tilt | `panto` | 8° · 0° · 4° · 12° · 18° | numbers |
| Front thickness | `fthick` | 4 mm · 1 mm · 2.5 mm · 6 mm · 9 mm | numbers |
| How it stays on | `hold` | Temples · Nose clip only · Strap band · Hand-held handle | names |
| Side attachment height | `epos` | Upper third · Top · Middle · Low | names |
| Corner reach | `endr` | 3 mm · 0 mm · 6 mm · 10 mm · 15 mm | numbers |
| Temple length | `tlen` | 140 mm · 130 mm · 135 mm · 145 mm · 150 mm · 155 mm | numbers |
| Bend behind the ear | `tbend` | Drop 45° · Straight · Drop 25° · Drop 70° · Full curl | numbers |
| How high it sits | `sit` | On the bridge · High · Down the nose | names |
| Top line | `topline` | Follows the lenses · One straight line · One arc · Dips at the centre | names |

### 2. Face

| Axis | id | Options | Built from |
|---|---|---|---|
| Rim | `rim` | Full rim · Brow, wire below · Brow, cord below · Lower rim only · Rimless | names |
| Rim thickness | `rimt` | 3 mm · 0.9 mm · 1.6 mm · 2.2 mm · 4.5 mm · 6.5 mm · 9 mm · 12 mm *(extreme)* | numbers |
| Brow weight | `rbrow` | Even · Brow ×1.5 · Brow ×2.2 · Brow ×3 · Lower ×1.5 | numbers |
| Outer corner weight | `rcorner` | None · +30% · +70% · +120% | numbers |
| Outer contour | `outer` | Follows the lens · Squarer · Much squarer · Rounder | numbers |
| Bridge bars | `bbars` | One · Two · Three | numbers |
| Bridge height | `bh` | Upper third · Top · Middle · Low | names |
| Bridge arch | `barch` | Gentle · Straight · High · Dipped | numbers |
| Bridge bar depth | `bdepth` | Follows the rim · 1 mm · 2.5 mm · 5 mm · 8 mm | numbers |
| Bridge underside | `bunder` | Saddle · Keyhole · Flat | names |
| Material | `mat` | Acetate · Metal · Injected plastic · Printed nylon · Wood · Horn · Carbon weave | names |
| Frame hue | `hue` | Neutral · 0° red · 30° orange · 60° yellow · 90° lime · 120° green · 150° spring · 180° cyan · 210° azure · 240° blue · 270° violet · 300° magenta · 330° rose | numbers |
| Frame tone | `tone` | Deep · Dark · Mid · Light · Pale · Near white | numbers |
| Colour strength | `sat` | Rich · Muted · Vivid | numbers |
| Pattern contrast | `pcon` | None · Low · Medium · High | numbers |
| Blotch size | `blotch` | 3 mm · 0.7 mm · 1.6 mm · 6 mm · 10 mm | numbers |
| Blotch stretch | `pdir` | Round · Along ×3 · Along ×8 · Diagonal ×3 · Upright ×3 | names |
| Pattern colour | `pcol` | Lighter · Darker · Amber · Opposite hue · Clear windows | names |
| Layers | `lam` | One layer · Brow layer · Front and back · Edge stripe | names |
| Fade | `fade` | None · To lighter · To clear · To the second colour | names |
| Second colour | `col2` | Lighter · Darker · Hue +30° · Hue +90° · Hue +180° · Black · White · Clear | names |
| Temple depth | `tdepth` | 6 mm · 1.2 mm · 3 mm · 9 mm · 13 mm · 18 mm | numbers |
| Temple taper | `ttaper` | Slight · None · Strong · Widening | numbers |
| Temple line | `tline` | Straight · Arched · Dropped · Stepped | names |
| Temple colour | `tcol` | Same as the front · Hardware metal · Contrast tone · Contrast tips | names |
| Tint density | `tintd` | Clear · 10% · 25% · 50% · 75% · 90% | numbers |
| Tint hue | `tinth` | Grey · 0° red · 30° orange · 60° yellow · 90° lime · 120° green · 150° spring · 180° cyan · 210° azure · 240° blue · 270° violet · 300° magenta · 330° rose | numbers |
| Tint gradient | `tgrad` | Even · Fades down · Fades to clear · Dark top and bottom | names |

### 3. Detail

| Axis | id | Options | Built from |
|---|---|---|---|
| Hinge | `hinge` | Barrel · Hidden · Wire coil · None, flexing metal | names |
| Barrel count | `barrels` | 3 · 5 · 7 | numbers |
| Screw head | `screw` | Slot · Cross · Star · Hidden | names |
| Front rivets | `rivn` | 2 · None · 1 · 3 · 4 | numbers |
| Rivet shape | `rivs` | Round · Diamond · Bar · Triangle · Star | names |
| Nose rest | `pads` | Moulded into the front · Pads on wire arms · Fixed pads · One-piece saddle strip | names |
| Pad size | `padsz` | 13 mm · 9 mm · 11 mm · 15 mm · 18 mm | numbers |
| Pad proportion | `padr` | Oval · Round · Long | numbers |
| Rimless mount | `mount` | Two holes a side · One hole a side · Notch and clamp | names |
| Lens edge finish | `ledge` | Matte · Polished · Faceted | names |
| Lens edge thickness | `lthick` | 2 mm · 1.2 mm · 3.5 mm · 5.5 mm · 8 mm | numbers |
| Rim edge | `bevel` | Rounded · Flat, sharp edge · Chamfered · Knife ridge | names |
| Finish | `finish` | Gloss · Satin · Matte · Brushed · Hammered | names |
| Hardware metal | `hw` | Silver · Gold · Rose gold · Gunmetal · Black · Copper | names |
| Temple core wire | `core` | Not shown · Plain · Engraved | names |
| Engraving | `engr` | None · Line · Double line · Wave · Dots | names |
| Size print | `print` | None · Size · Size and rule | names |
| Temple tip | `tipn` | Plain · Paddle · Ball · Hook | names |
| Temple openings | `tcut` | Solid · One slot · Row of holes · Open outline | names |

### 4. Light and motion

| Axis | id | Options | Built from |
|---|---|---|---|
| Mirror | `mirror` | None · 30% · 70% · 100% | numbers |
| Mirror colour | `mirh` | Silver · Gold · Red · Green · Blue · Violet · Pink | numbers |
| Glare coating | `coat` | Uncoated · Green · Blue · Violet · Gold | names |
| Frame see-through | `clarity` | Opaque · Translucent · Clear | numbers |
| Tint behaviour | `adapt` | Fixed · Darkens in sun · Switched on command *(new)* | names |
| Glow | `glow` | None · Glows in the dark · Reading lights | names |
| Folding | `fold` | Fold flat · Fold crossed · Front folds in half too | names |

### 5. Use

| Axis | id | Options | Built from |
|---|---|---|---|
| Lens type | `seg` | Single vision · D segment · Round segment · Full-width line · Three zones · Electronic focus zone *(new)* · Set by a dial | names |
| Sun clip | `clip` | None · Clip-on, down · Clip-on, flipped up | names |
| Side shields | `side` | None · Soft cups · Clear · Mesh | names |
| Retainer | `cord` | None · Cord · Chain | names |
| Speakers | `audio` | None · Open-ear speakers · Bone conduction | names |
| Display | `disp` | None · One eye · Both eyes | names |
| Camera | `cam` | None · One corner · Both corners | names |
| Lens vents | `vent` | None · Slots at the top · Holes at the side | names |
| Temple adjustment | `adj` | None · Telescoping length · Ratchet tilt | names |

### 6. Touch

| Axis | id | Options | Built from |
|---|---|---|---|
| Pad material | `padm` | Clear, soft · Clear, hard · Metal · Frame material | names |
| Tip covering | `tipg` | Bare · Sleeve · Ribbed rubber · Wrapped cord | names |
| Hinge spring | `spring` | Firm stop · Springs 10° · Springs 25° | numbers |
| Temple thickness | `tthick` | 3.5 mm · 1 mm · 2 mm · 5 mm · 7 mm | numbers |

### 7. Sound

| Axis | id | Options | Built from |
|---|---|---|---|
| Hinge sound | `snap` | Quiet · Soft click · Sharp snap | names |

## Rules

Each rule reads "the options allowed on this axis depend on those axes". Taste is never a rule.

| Axis | Depends on | Reason |
|---|---|---|
| Side attachment height (`epos`) | `rim`, `hold` | The side attachment needs rim at its height: a lower rim reaches the middle and below, a cord-held lens the middle and above. A nose clip has nothing at the side. |
| Corner reach (`endr`) | `hold` | A nose clip has no corners to reach out. |
| Temple length (`tlen`) | `hold` | Only exists when there are temples. |
| Bend behind the ear (`tbend`) | `hold` | Only exists when there are temples. |
| Top line (`topline`) | `rim` | A top line is made of upper rim, so it needs one. |
| Rim thickness (`rimt`) | `rim` | A rimless lens has no rim to be thick. |
| Brow weight (`rbrow`) | `rim` | Weight can only shift between brow and lower rim where both exist; a brow piece can only be heavier at the brow. |
| Outer corner weight (`rcorner`) | `rim` | The corner weight is upper rim. |
| Outer contour (`outer`) | `rim` | Only a full rim has a whole outer contour. |
| Bridge bars (`bbars`) | `lenses` | A single shield lens has no bridge gap. |
| Bridge height (`bh`) | `lenses`, `rim` | A shield has no bridge gap. Elsewhere the bridge needs rim at its height. |
| Bridge bar depth (`bdepth`) | `lenses`, `rim` | A shield has no bridge bar. A rimless bridge is a wire or thin bar. |
| Bridge underside (`bunder`) | `lenses`, `rim` | The underside is cut from bridge material; a shield or a wire has none. |
| Colour strength (`sat`) | `hue` | A neutral frame has no hue to strengthen. |
| Blotch size (`blotch`) | `pcon` | No pattern, no blotches. |
| Blotch stretch (`pdir`) | `pcon` | No pattern, no blotches. |
| Pattern colour (`pcol`) | `pcon` | No pattern, no blotches. |
| Second colour (`col2`) | `lam`, `fade` | A second colour needs a layer or a fade that uses it. |
| Temple depth (`tdepth`) | `hold` | Only exists when there are temples. |
| Temple taper (`ttaper`) | `hold` | Only exists when there are temples. |
| Temple line (`tline`) | `hold` | Only exists when there are temples. |
| Temple colour (`tcol`) | `hold` | Only exists when there are temples. |
| Tint hue (`tinth`) | `tintd` | A clear lens has no tint to colour. |
| Tint gradient (`tgrad`) | `tintd` | A clear lens has no tint to fade. |
| Hinge (`hinge`) | `hold` | Only exists when there are temples. |
| Barrel count (`barrels`) | `hold`, `hinge` | Barrels belong to a barrel hinge. |
| Screw head (`screw`) | `hold`, `hinge` | Only a barrel hinge shows a screw. |
| Rivet shape (`rivs`) | `rivn` | No rivets, no shape. |
| Nose rest (`pads`) | `rim` | A rimless front has no material to mould a nose rest from, or to fix pads to. |
| Pad size (`padsz`) | `pads` | Only separate pads have a size. |
| Pad proportion (`padr`) | `pads` | Only separate pads have a proportion. |
| Rimless mount (`mount`) | `rim` | Only a rimless lens is drilled or notched. |
| Lens edge finish (`ledge`) | `rim` | The lens edge shows only where no rim covers it. |
| Rim edge (`bevel`) | `rim` | A rimless lens has no rim edge. |
| Temple core wire (`core`) | `hold`, `clarity` | A core wire shows only through a see-through temple. |
| Size print (`print`) | `hold` | Only exists when there are temples. |
| Temple tip (`tipn`) | `hold` | Only exists when there are temples. |
| Temple openings (`tcut`) | `hold` | Only exists when there are temples. |
| Mirror colour (`mirh`) | `mirror` | No mirror, no mirror colour. |
| Frame see-through (`clarity`) | `mat` | Metal, wood and carbon let no light through. Printed nylon and horn pass a little. |
| Folding (`fold`) | `hold`, `hinge` | Folding needs a hinge. |
| Side shields (`side`) | `hold` | Side shields hang between front and temple or strap. |
| Retainer (`cord`) | `hold` | Only exists when there are temples. |
| Speakers (`audio`) | `hold` | Only exists when there are temples. |
| Temple adjustment (`adj`) | `hold` | Only exists when there are temples. |
| Pad material (`padm`) | `pads` | Only separate pads have their own material. |
| Tip covering (`tipg`) | `hold` | Only exists when there are temples. |
| Hinge spring (`spring`) | `hold`, `hinge` | A spring sits in a barrel or hidden hinge. |
| Temple thickness (`tthick`) | `hold` | Only exists when there are temples. |
| Hinge sound (`snap`) | `hold`, `hinge` | A hinge sound needs a hinge. |

## What is new

Options marked as not in current practice, as far as memory serves (unverified, no web was used):

- Tint behaviour: Switched on command
- Lens type: Electronic focus zone

Options kept outside the ordinary range and marked extreme:

- Lens width: 34 mm, 70 mm
- Lens height: 18 mm, 62 mm
- Cheek droop: 40%
- Outer corner sweep: Up 55%
- Bridge width: 10 mm, 30 mm
- Rim thickness: 12 mm

Things that came from numbers and have no name: every lens outline between the named shapes (softness, taper, droop, sweep, brow flatness, nose cut and tilt are separate numbers, so a five-sided lens with a swept corner and a drooped cheek exists), outer contours that differ from the lens by a number, and mottled patterns set by blotch size, stretch and contrast.

Parts taken from other fields in this pass, each as an option: glass that tints on command, open-ear and bone-conduction speakers, a display in the lens, electronic and dial-set focus, flexing metal with no hinge, printed nylon, telescoping and ratchet temples, reading lights. None has numbers or sources yet. That is Spec 4.

## What the gate found

`checks/gate.js`, final run:

- **Random addresses:** 3000 addresses, 24000 drawings (four views, full and low detail). Failures (threw, or contained "NaN", "undefined" or "Infinity"): **0**.
- **XML:** 4000 of those drawings parsed in a browser and checked for repeated ids. Bad: **0**.
- **Identical pictures:** 339 options compared with the first allowed option in the same setting. Identical: **0**. Fewer than 30 differing pixels: 0. Options no setting allows: 0.
- **Result: pass.**

How "identical" was judged. Each option is drawn and turned into pixels, then compared with its default at the distance its axis belongs to. Form axes are compared on the whole view at 180 px wide, so a Form axis has to show in a thumbnail. Other axes are compared at 360 px on the view or close crop named in the axis's `look`. A pixel counts as different above 12 levels out of 255.

Seven axes are compared with extra choices changed, because they cannot be judged at default. This is a departure from "the rest stay at default" and is stated here:

- Colour strength: on a mid tone. It cannot be seen on the default deep tone.
- Pattern colour: on a mid orange tone at medium contrast.
- Second colour: on a mid blue tone.
- Tint hue and tint gradient: at 50% density. The first density that allows them is 10%.
- Blotch size and blotch stretch: at medium contrast.

The ten options that differ least from their default (share of pixels changed):

| Axis | Option | Pixels changed | Share |
|---|---|---:|---:|
| Folding | Front folds in half too | 74 | 0.054% |
| Lens vents | Holes at the side | 135 | 0.158% |
| Temple adjustment | Ratchet tilt | 141 | 0.181% |
| Temple tip | Ball | 157 | 0.183% |
| Engraving | Dots | 194 | 0.226% |
| Camera | One corner | 200 | 0.233% |
| Hinge sound | Soft click | 245 | 0.286% |
| Lens vents | Slots at the top | 252 | 0.294% |
| Size print | Size | 267 | 0.312% |
| Engraving | Line | 274 | 0.32% |

What earlier runs of the gate caught, all fixed:

- 116 of 1,200 drawings failed to parse: the dotted engraving wrote `stroke-width` twice. Random drawing with a "NaN" search did not catch it. The XML check did.
- 13 options drew the same as their default: wood grain on a black frame, and the twelve tint hues at 10% density.

What looking at the sheets caught, all fixed:

- Temple tips showed through the lenses as grey bars in the front view. Removed.
- Rivets sat on the lens beside thin rims, and floated on the lens when a camera took the corner. They now follow the rim and step below a camera.
- The bridge was pushed far back by the lens curve in the top view. The lens curve now stops at the lens edge.
- A brow-only rim left a thin dark line round the rest of the lens. The rim is now drawn only where it has thickness.
- Rimless corners were heavy black blocks with rivets beside the mount. They are now a thin plate with the mount screws on it, and a rimless front has no rivets.
- Lens edge finishes, the core wire, brushed and hammered finishes were too faint to read. Strengthened.
- The temple seen end-on stayed black behind a clear frame. It now follows the frame.
- Display and camera strips cropped to one lens, so "one" and "both" looked the same. They now show the whole front.
- A dipped top line crossed its own underside. Fixed.
- A ball tip scaled with temple depth and became a 25 mm disc. Capped.

## The page

`checks/page-test.js` opens `index.html` at 390 px wide in a headless browser and uses every control. 24 steps, 0 failed, 0 console errors. **Pass.**

- ok: opens on a drawing
- ok: no sideways scroll
- ok: next and previous change the number
- ok: go to a typed number
- ok: a bad number shows a message, no dialog
- ok: Anywhere jumps
- ok: views: side, top
- ok: distance: room shows it worn
- ok: distance: loupe can be dragged
- ok: every axis has a row under its distance
- ok: arrows step an axis and its strip draws
- ok: tapping a strip picture picks that option
- ok: an axis in another view switches the view on, the next one off
- ok: Hold keeps an axis through Anywhere
- ok: Drift walks and stops
- ok: a closed distance opens
- ok: a rule greys an axis and says why
- ok: Sheet: two axes as a grid, tap to go
- ok: Language: roll, hold, release
- ok: Keep, the pile, Near my keeps, Remove
- ok: state is saved on the device
- ok: About opens in the page
- ok: the hinge sound plays without error
- ok: still no sideways scroll

Parts of the page: the drawing with front, side and top views and three distances (Room shows it worn on a plain head, Arm's length, and a loupe that drags and magnifies four times); the number with previous, next and go-to; Anywhere; Drift; every axis under its distance with arrows and a strip of its options; Sheet; Hold on any axis and on a whole distance; Language; Keep and Near my keeps. State is saved on the device. No pop-up dialogs. The only outside files are two font families, and the test ran with them blocked.

The Language agreements:

1. A sharp outline takes sharp marks and crisp edges. A soft outline takes round marks and rounded edges.
2. Rim, temple and corner weight move together.
3. Thin rims take metal or carbon. Heavier rims take sheet and moulded materials.
4. Warm colours take warm metal. Cool colours take cool metal.
5. One material, one finish and one pattern run through the whole pair.

The 27 axes a language holds: Outline sides, Corner softness, Taper, Cheek droop, Outer corner sweep, Brow flatness, Rim thickness, Brow weight, Outer corner weight, Outer contour, Bridge underside, Material, Frame hue, Frame tone, Colour strength, Pattern contrast, Blotch size, Blotch stretch, Pattern colour, Temple depth, Temple colour, Rivet shape, Rim edge, Finish, Hardware metal, Temple tip, Frame see-through.

## What was looked at, and what was not

Looked at, by turning sheets into images and reading them:

- First pass, before the fixes listed above: all 25 per-axis sheets, which cover all 91 axes and every option, and all four random sheets (24 addresses in front, side, top and worn views).
- Second pass, on the final drawing code: 6 per-axis sheets covering 24 axes (Wrap, Lens curve, Forward tilt, Front thickness, Rim, Rim thickness, Brow weight, Outer corner weight, Hinge, Barrel count, Screw head, Front rivets, Rimless mount, Lens edge finish, Lens edge thickness, Rim edge, Finish, Hardware metal, Temple core wire, Engraving, Speakers, Display, Camera, Lens vents), and the random front sheet.
- Close-ups at about twice sheet scale of 28 chosen settings, including the default in all four views, rimless, brow with cord, brow with wire, lower rim, shield with strap, a pilot shape, a cat-eye, a tortoiseshell, a nose-clip pair and a hand-held pair.
- Page screenshots at 390 px: opening state, Room, Loupe, an axis strip, Sheet, Language, Keeps. One wide screenshot in the dark theme.

Not looked at:

- 67 of the 91 axes were not looked at again after the last fixes. Their drawing code did not change, apart from the paper colour and the lens-curve depth in side and top views.
- The random side, top and worn sheets were not looked at again after the fixes.
- Options were looked at one axis at a time with the rest at default. Combinations were seen only in the 24 random addresses and the chosen settings.
- Most Detail axes were seen as close crops on sheets, not through the page's loupe.
- The low-detail drawings were seen only as strips in page screenshots, not on sheets of their own.
- Page screenshots not looked at: Anywhere, Side, Top, the opened Detail section, and the wide light theme.

Not checked at all:

- The hinge sound. The test confirms it runs without an error. Nobody heard it.
- A real phone. The page test uses a headless desktop browser set to 390 px with touch emulation.
- Any browser other than Chromium.
- The page with its fonts loaded. The test blocks them, so every screenshot shows fallback fonts.
- The published copy of the page. The same build was tested from a local file; the hosted page was not opened.
- Whether any version can be manufactured, what it costs, or whether it is good. Out of scope in the kit.

## Known weak spots in the drawing

- The four views are built from the same numbers, but not from one set of points in three dimensions. The side view carries the front outline back by wrap and lens curve and tilts it. The top view ignores forward tilt. Views can disagree in small ways. Spec 6 stage 7 fixes this.
- Size print is drawn on the outside of the temple so it can be seen. On real glasses it is inside.
- Tint that changes is shown as two states in two views: indoors in the front view, outdoors in the worn view.
- Folding and spring are shown as dashed ghosts in the top view. There is no folded view.
- The hinge sound is shown as the catch that makes it, and the page can play a made-up click. Nobody has compared it with a real hinge.
- Hardware metal shows only where there is hardware. With no rivets, a hidden hinge and a moulded nose rest, the axis changes nothing visible. The same holds for a few other axes in a few settings (frame colour on a rimless front with no temples shows only on the bridge wire). The gate tests each option in one setting, not in all.
- "Lighter" as a second colour or pattern colour is nearly invisible on a near-white frame, and "darker" on a deep one.
- A random address looks crowded. Most axes list the plain option first, so a uniformly random pair has most extras switched on at once. Nothing is filtered, as the kit asks. Hold all on a distance, or a Language, narrows what Anywhere changes.
- Type on the drawing (the size print) uses the device's monospace font and will differ between devices.

## What eyeglasses can be that this space still cannot say

`items.md` lists 225 things a person can see, hear, feel or do with eyeglasses. 162 are said by an axis (72%), 17 are partly said, 4 follow from other choices, 1 is left out by the kit's rules (logos), and **41 cannot be said at all**:

- Heart, star and other picture-shaped lenses
- Left and right lenses that differ
- Monocle, a single lens
- Scissor glasses, held from below on a forked handle
- Snow goggles cut as a solid mask with a slit (the slit lens is reachable, the mask is not)
- Rivet spectacles, two lenses pivoting on one rivet, no temples
- Four-lens railway spectacles with hinged side lenses
- Which metal it is (titanium, steel, nickel alloy read the same)
- Leather, fabric, cork, stone and denim coverings
- Printed picture or pattern on the lens or front
- Inlays, jewels, stones
- Enamel fill and painted details
- Different tint in each lens (red and cyan paper glasses)
- Opaque lens with pinholes
- Rim-closing screw block on metal rims
- Lens groove and cord groove
- Hinge plates and decorative shields
- Marks etched into the lens
- Polarised lenses (nothing to see on their own)
- Shadow thrown on the face
- Progressive lens (no visible line)
- Impact rating
- Sealing for swimming, skiing, dust
- Front that opens at the bridge on magnets, with a neckband
- Clip-on magnifiers and loupes
- Lenses that swap out
- Foam brow guard
- Case and cloth
- Cords looped over the ears in place of temples
- Temple pressure on the head
- Balance, front-heavy or even
- Whether it can be bent to fit
- Case click
- Tap of the frame on a table
- Sound leaking from the speakers
- Dial-and-cable strap tightening, from sports shoes
- Ball-and-socket temple joints, from camera mounts
- Knitted-to-shape straps, from footwear
- Paper-like display on the temple, from e-readers
- Solar cells in the frame, from watches
- Inflatable or foam-printed nose rest, from footwear midsoles

Partly said:

- Goggles with a sealed, padded frame (partly: lenses, hold, wrap)
- The folded silhouette (drawn only as a ghost in the top view) (partly: fold)
- Antique bridge forms named by letter (W, X, C, K) (partly: barch)
- Gold-filled and plated frames (partly: mat, hue, tone, hw)
- Temple rivets (they follow the front count) (partly: rivn)
- Milled facets across an acetate front (partly: bevel)
- Grain direction of wood and horn (partly: mat)
- Coatings that shift colour with angle (partly: mirh)
- Indicator light beside a camera (partly: cam)
- Magnetic clip (reads the same as a clip-on) (partly: clip)
- Prescription strength (eyes look bigger or smaller behind the lens) (partly: lthick)
- Low-bridge fit (partly: pads)
- Soft one-piece children's frames (partly: hold)
- Surface feel (partly: finish)
- Edge sharpness under the finger (partly: bevel)
- Warmth of the material (partly: mat)
- Chain noise (partly: cord)

Beyond the list: nothing here has been checked against real glasses. There is no census, so there is no coverage score. That is Spec 2.
