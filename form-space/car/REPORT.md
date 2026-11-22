# Cars: form space report

Spec 1 of the Form Space Build Kit, first pass. Space version `car-1.0`. Written 2026-11-22.

The page is `index.html`. Everything in this report is either read from the space or from a check that was run. Where something was not checked, it says so.

## The count

- **118 axes, 531 options.**
- **Total versions: 4966493480425514757340351093493613091989119356108800000000000000000000000** (73 digits).
- 68 axes are steps of a number, 50 are lists of names. That is 58% from numbers.
- 20 axes carry a rule.

| Distance | Axes | Options | From numbers |
|---|---:|---:|---:|
| 1. Form, across the street | 25 | 142 | 24 |
| 2. Face, at arm's length | 58 | 269 | 39 |
| 3. Detail, at two inches | 16 | 56 | 1 |
| 4. Light and motion, as light and parts move | 8 | 30 | 0 |
| 5. Use, in use | 7 | 19 | 2 |
| 6. Touch, in the hand | 2 | 8 | 1 |
| 7. Sound, by ear | 2 | 7 | 1 |

Distances with fewer than eight axes: Use (7), Touch (2), Sound (2). That is a stated result of this pass, and the first job for a depth pass (Spec 6).

## Engine

The engine is `kit/engine.js`, Appendix A of the kit. `kit/engine-test.js` compares it with the kit's text token for token: **identical**.
The kit's three tests on the full space: roundTripBad 0, normalizeBad 0, edgesOk true.

Groups of axes tied together by rules:

- controlled by `height`: 10 valid combinations, 1 dependent axis
- controlled by `grille`, `power`, `outlets`: 78 valid combinations, 11 dependent axes
- controlled by `roofend`, `fall`: 48 valid combinations, 1 dependent axis
- controlled by `hue`: 13 valid combinations, 1 dependent axis
- controlled by `roofop`: 4 valid combinations, 4 dependent axes
- controlled by `handle`: 4 valid combinations, 1 dependent axis

## Axes at each distance

### 1. Form

| Axis | id | Options | Built from |
|---|---|---|---|
| Wheelbase | `wb` | 2700 mm · 2300 mm · 2450 mm · 2550 mm · 2850 mm · 3000 mm · 3200 mm · 2000 mm *(extreme)* · 3600 mm *(extreme)* | numbers |
| Front overhang | `fo` | 850 mm · 600 mm · 720 mm · 980 mm · 1100 mm · 450 mm *(extreme)* | numbers |
| Rear overhang | `ro` | 950 mm · 600 mm · 750 mm · 1100 mm · 1300 mm · 450 mm *(extreme)* | numbers |
| Height | `height` | 1450 mm · 1150 mm · 1250 mm · 1350 mm · 1550 mm · 1650 mm · 1780 mm · 1900 mm · 1050 mm *(extreme)* · 2100 mm *(extreme)* | numbers |
| Width | `width` | 1820 mm · 1600 mm · 1700 mm · 1900 mm · 1980 mm · 2050 mm · 1480 mm *(extreme)* | numbers |
| Wheel size | `wheel` | 660 mm · 580 mm · 620 mm · 700 mm · 740 mm · 800 mm · 520 mm *(extreme)* · 880 mm *(extreme)* | numbers |
| Ground clearance | `clear` | 150 mm · 100 mm · 125 mm · 180 mm · 210 mm · 250 mm · 70 mm *(extreme)* · 320 mm *(extreme)* | numbers |
| Arch gap | `archgap` | 50 mm · 25 mm · 80 mm · 120 mm | numbers |
| Wheel inset | `track` | 40 mm in · Flush · 80 mm in · 130 mm in · 30 mm out | numbers |
| Tumblehome | `tumble` | 180 mm · 60 mm · 120 mm · 260 mm · 340 mm | numbers |
| Cabin position | `cowl` | 300 mm behind · 250 mm ahead · On the axle · 150 mm behind · 450 mm behind · 650 mm behind | numbers |
| Nose height | `nose` | 78% · 55% · 66% · 88% · 97% | numbers |
| Nose rake | `nrake` | 12° back · Upright · 25° back · 40° back · 55° back · 8° forward | numbers |
| Bonnet bow | `bonnet` | 30% · 0% · 60% · 100% | numbers |
| Windscreen angle | `screen` | 32° · 22° · 27° · 38° · 46° · 56° · 68° · 82° | numbers |
| Roof peak position | `peak` | 40% · 20% · 60% · 80% | numbers |
| Roof bow | `crown` | 40 mm · 0 mm · 80 mm · 140 mm | numbers |
| Roof length | `roofend` | 72% · 45% · 58% · 84% · 93% · 100% | numbers |
| Roof drop | `rdrop` | 50 mm · 0 mm · 110 mm · 190 mm · 280 mm | numbers |
| Fall angle | `fall` | 30° · 14° · 20° · 40° · 52° · 66° · 80° · 90° | numbers |
| Tail height | `tailh` | Level · −120 mm · −60 mm · +70 mm · +150 mm | numbers |
| Tail rake | `trake` | 8° in at the top · Upright · 18° in at the top · 30° in at the top · 10° out at the top | numbers |
| Load bed | `bed` | Closed · Open bed | names |
| Corner roundness | `plan` | 50% · 15% · 85% | numbers |
| Waist | `waist` | 0 mm · 40 mm · 90 mm | numbers |

### 2. Face

| Axis | id | Options | Built from |
|---|---|---|---|
| Nose roundness | `nround` | 50% · 12% · 30% · 75% · 100% | numbers |
| Tail roundness | `tround` | 40% · 10% · 70% · 100% | numbers |
| Belt height | `belt` | 62% · 52% · 57% · 67% · 72% | numbers |
| Belt rise | `brise` | +40 mm · Level · +90 mm · +150 mm · −40 mm | numbers |
| Rear pillar kick | `kick` | Level · +60 mm · +130 mm · −60 mm | numbers |
| Pillars | `pillars` | Three · Two, no centre pillar · Four | numbers |
| Rear pillar rake | `prake` | Half way · Upright · Parallel to the back | numbers |
| Roof rail depth | `rail` | 90 mm · 50 mm · 140 mm · 210 mm | numbers |
| Roof and pillars | `float` | Joined · Floating, dark rear pillar · All pillars dark · Dark front pillar | names |
| Glass tint | `tint` | 45% · 25% · 65% · 85% | numbers |
| Rim size | `rim` | 68% · 55% · 62% · 74% · 80% · 86% | numbers |
| Spoke count | `spokes` | 5 · 3 · 4 · 6 · 7 · 8 · 10 · 12 · 15 · 20 | numbers |
| Spoke shape | `spoke` | Straight · Tapered · Split in two · Swept · Solid disc | names |
| Wheel dish | `dish` | 30% · 0% · 60% · 100% | numbers |
| Wheel finish | `wfin` | Silver · Dark grey · Black · Body colour · Machined face · Bronze | names |
| Headlamp width | `hlw` | 320 mm · 180 mm · 240 mm · 420 mm · 520 mm · 640 mm | numbers |
| Headlamp height | `hlh` | 110 mm · 40 mm · 70 mm · 160 mm · 220 mm · 300 mm | numbers |
| Headlamp sides | `hlsides` | Four · Two · Three · Five · Six · Eight | numbers |
| Headlamp corner softness | `hlsoft` | 50% · 100% · 75% · 25% · 5% | numbers |
| Headlamp slant | `hlslant` | Outer up 6° · Level · Outer up 14° · Outer up 24° · Outer down 8° | numbers |
| Headlamp position | `hlpos` | 12% · 0% · 30% · 50% · 75% | numbers |
| Headlamp layout | `hlsplit` | Single · Slim upper, main lamp below · Stacked pair · Twin side by side | names |
| Front light bar | `bar` | None · Between the lamps · Across the whole face | names |
| Socket depth | `socket` | 20 mm · 0 mm · 50 mm · 90 mm · 140 mm | numbers |
| Brow ridge | `brow` | 0 mm · 15 mm · 35 mm · 60 mm | numbers |
| Aperture ratio | `aper` | 85% · 100% · 65% · 45% | numbers |
| Grille | `grille` | Horizontal bars · Upright bars · Mesh · Dots · Blank panel · None | names |
| Grille width | `grw` | 45% · 25% · 65% · 85% | numbers |
| Grille height | `grh` | 160 mm · 60 mm · 110 mm · 240 mm · 340 mm · 460 mm | numbers |
| Grille corner softness | `grsoft` | 40% · 100% · 70% · 15% · 3% | numbers |
| Grille taper | `grtaper` | Even · Top wider 15% · Top wider 30% · Bottom wider 15% · Bottom wider 30% | numbers |
| Grille position | `grpos` | 30% · 8% · 55% · 80% | numbers |
| Grille parts | `grsplit` | One · Two · Three | numbers |
| Lower opening | `lower` | Wide slot · None · Centre intake · Centre and side intakes · Full-width mouth | names |
| Bonnet lines | `bcrease` | Two soft lines · None · Centre crease · Raised centre · Vents | names |
| Tail lamp width | `tlw` | 300 mm · 160 mm · 450 mm · 620 mm | numbers |
| Tail lamp height | `tlh` | 120 mm · 50 mm · 200 mm · 320 mm | numbers |
| Tail lamp corner softness | `tlsoft` | 40% · 100% · 70% · 10% | numbers |
| Tail lamp position | `tlpos` | 10% · 0% · 30% · 55% | numbers |
| Rear light bar | `tbar` | None · Between the lamps · Full width | names |
| Rear plate | `plater` | On the tail · Low in the bumper · On the tail, to one side | names |
| Exhaust outlets | `outlets` | 2 · None · 1 · 4 | numbers |
| Outlet shape | `outshape` | Round · Oval · Rectangular · Trapezoid | names |
| Spoiler | `spoiler` | None · Lip · Ducktail · Wing on struts · Roof spoiler | names |
| Paint hue | `hue` | Neutral · 0° red · 30° orange · 60° yellow · 90° lime · 120° green · 150° spring · 180° cyan · 210° azure · 240° blue · 270° violet · 300° magenta · 330° rose | numbers |
| Paint tone | `tone` | Light · Deep · Dark · Mid · Pale · Near white | numbers |
| Colour strength | `sat` | Rich · Muted · Vivid | numbers |
| Paint finish | `finish` | Solid · Metallic · Pearl · Matte · Satin | names |
| Roof colour | `roofc` | Body colour · Black · White · Silver · Contrast tone | names |
| Stripes over the top | `stripes` | None · Twin centre stripes · One offset stripe | names |
| Side stripes | `sidestripe` | None · Low side stripe · Belt pinstripe | names |
| Lower cladding | `clad` | Body colour · Dark sills · Dark sills and arches · Contrast lower body | names |
| Shoulder line height | `shoulder` | 80 mm · 30 mm · 150 mm · 240 mm | numbers |
| Shoulder line path | `shline` | Straight · Rising to the rear · Arched · Dropping to the rear · Swelling over the rear wheel | names |
| Lines along the doors | `lines` | One · None · Two | numbers |
| Sill line | `sill` | Straight · Rising to the rear · Scooped · Stepped out | names |
| Arch shape | `arch` | Round · Flattened · Squared · Square | numbers |
| Arch flare | `flare` | 0 mm · 20 mm · 50 mm · 90 mm | numbers |

### 3. Detail

| Axis | id | Options | Built from |
|---|---|---|---|
| Headlamp internals | `hlin` | One projector · Two projectors · Reflector bowl · Grid of points · Strip only | names |
| Grille texture | `grden` | Medium · Coarse · Fine | numbers |
| Grille surround | `grsur` | None · Bright · Dark · Body colour, thick | names |
| Door cut lines | `cuts` | Upright · Leaning · Following the arch | names |
| Handle position | `hpos` | On the shoulder line · At the belt · Mid door | names |
| Mirrors | `mirror` | On the door · At the pillar base · Cameras on stalks · None *(new)* | names |
| Bright work | `trim` | Dark · Bright · Body colour · Satin | names |
| Window frames | `frame` | Framed · Frameless | names |
| Fuel or charge door | `filler` | Rear wing · Front wing · Hidden | names |
| Badge, left blank | `badge` | Roundel · None · Shield · Bar | names |
| Front plate | `platef` | Low, centre · None · High, centre · To one side | names |
| Antenna | `antenna` | Fin · None · Mast | names |
| Tyre wall | `tyre` | Plain · White band · Coloured line | names |
| Brake calipers | `caliper` | Grey · Red · Yellow · Blue | names |
| Rear lower panel | `diffuser` | Plain · Diffuser fins · Skid plate | names |
| Tail lamp internals | `tlin` | Light blade · Dots · Blocks · Glowing panel | names |

### 4. Light and motion

| Axis | id | Options | Built from |
|---|---|---|---|
| Front light signature | `drl` | Line along the top · Outline · Hook · Dots · None | names |
| Rear light signature | `tsig` | Outline · One line · Upright blades · Whole lamp | names |
| Surface | `sculpt` | Taut · Soft · Hollowed · Flat | names |
| Changing shade | `shade` | Fixed · Changes panel by panel *(new)* | names |
| Door opening | `dooropen` | Swing out · Scissor up · Gullwing · Rear-hinged · Sliding | names |
| Roof opening | `roofop` | Fixed · Sunroof · Glass roof · Soft top | names |
| Moving aero | `aero` | None · Rear wing rises · Air brake | names |
| Glowing panels | `glowp` | None · Lit face panel *(new)* · Lit sills *(new)* | names |

### 5. Use

| Axis | id | Options | Built from |
|---|---|---|---|
| Side doors | `doors` | Two a side · One a side | numbers |
| Seat rows | `seats` | Two rows · One row · Three rows | numbers |
| Roof rails | `rails` | None · Flush rails · Raised rails · Rails and crossbars | names |
| Towing | `tow` | None · Tow bar · Recovery hooks | names |
| Solar roof | `solar` | None · Solar cells *(new)* | names |
| Sensor pod | `sensor` | None · On the roof · Behind the windscreen | names |
| Spare wheel | `spare` | Out of sight · On the tail | names |

### 6. Touch

| Axis | id | Options | Built from |
|---|---|---|---|
| Door handles | `handle` | Proud pull · Flush · Flap · None, touch pad | names |
| Door thickness | `doorth` | 140 mm · 90 mm · 200 mm · 260 mm | numbers |

### 7. Sound

| Axis | id | Options | Built from |
|---|---|---|---|
| Power | `power` | Engine in front · Engine between the axles · Engine at the rear · Electric, no engine | names |
| Door seals | `seals` | Two, a thud · One, a clack · Three, a soft thump | numbers |

## Rules

Each rule reads "the options allowed on this axis depend on those axes". Taste is never a rule.

| Axis | Depends on | Reason |
|---|---|---|
| Wheel size (`wheel`) | `height` | A wheel taller than about half the body cannot fit under it. |
| Cabin position (`cowl`) | `power` | A motor between the axles moves the cabin forward. |
| Load bed (`bed`) | `roofend`, `fall` | A pickup has an open bed and a separate cabin: the roof must stop early and the back of the cabin drop steeply. |
| Grille width (`grw`) | `grille` | No grille, nothing to shape. |
| Grille height (`grh`) | `grille` | No grille, nothing to shape. |
| Grille corner softness (`grsoft`) | `grille` | No grille, nothing to shape. |
| Grille taper (`grtaper`) | `grille` | No grille, nothing to shape. |
| Grille position (`grpos`) | `grille` | No grille, nothing to shape. |
| Grille parts (`grsplit`) | `grille` | No grille, nothing to shape. |
| Lower opening (`lower`) | `power`, `grille` | No radiator means the grille can go. An engine in front needs air: with no grille the lower opening must stay. |
| Exhaust outlets (`outlets`) | `power` | No engine, no exhaust. |
| Outlet shape (`outshape`) | `outlets` | No outlets, no shape. |
| Colour strength (`sat`) | `hue` | A neutral paint has no hue to strengthen. |
| Roof colour (`roofc`) | `roofop` | A soft top is cloth, with its own colour. |
| Grille texture (`grden`) | `grille` | A blank panel has no pattern to make finer. |
| Grille surround (`grsur`) | `grille` | No grille, no surround. |
| Handle position (`hpos`) | `handle` | No handles, no position. |
| Door opening (`dooropen`) | `roofop` | A gullwing door hinges on a fixed roof. |
| Roof rails (`rails`) | `roofop` | A soft top carries no rails. |
| Solar roof (`solar`) | `roofop` | Solar cells need a fixed, closed roof panel. |

## What is new

Options marked as not in current practice, as far as memory serves (unverified, no web was used):

- Mirrors: None
- Changing shade: Changes panel by panel
- Glowing panels: Lit face panel, Lit sills
- Solar roof: Solar cells

Options kept outside the ordinary range and marked extreme:

- Wheelbase: 2000 mm, 3600 mm
- Front overhang: 450 mm
- Rear overhang: 450 mm
- Height: 1050 mm, 2100 mm
- Width: 1480 mm
- Wheel size: 520 mm, 880 mm
- Ground clearance: 70 mm, 320 mm

Body types are not a list. Saloon, hatchback, estate, fastback, van and pickup all come from roof length, fall angle, tail height and cabin position, so every shape between them exists too: a roof that stops at 58% and falls at 66 degrees has no name and has an address.

The three numbers of Socket Theory are axes here: socket depth (how far lamps and grille sit back), brow ridge (how far the body overhangs each lamp) and aperture ratio (how much of the opening is lit). They are drawn in the front and rear views as shade, an overhanging lid and a smaller lit element. Whether a deep socket reads as a face is not something this build tests.

Parts taken from other fields in this pass, each as an option: panels that change shade, lit body panels, solar cells in the roof, cameras in place of mirrors, sensor pods, grids of light points. None has numbers or sources yet. That is Spec 4.

## What the gate found

`kit/gate.js`, final run:

- **Random addresses:** 3000 addresses, 30000 drawings (every view, full and low detail). Failures (threw, or contained "NaN", "undefined" or "Infinity"): **0**.
- **XML:** 5000 drawings parsed in a browser and checked for repeated ids. Bad: **0**.
- **Identical pictures:** 424 options compared with the first allowed option in the same setting. Identical: **0**. Fewer than 30 differing pixels: 2 (Towing / Recovery hooks, 18 px; Fuel or charge door / Hidden, 28 px). Options no setting allows: 0.
- **Result: pass.**

How "identical" was judged. Each option is drawn and turned into pixels, then compared with its default at the distance its axis belongs to. Form axes are compared on the whole view at 180 px wide, so a Form axis has to show in a thumbnail. Other axes are compared at 360 px on the view or close crop named in the axis's `look`. A pixel counts as different above 12 levels out of 255.

16 axes are compared with extra choices changed, because they cannot be judged at default. This is a departure from "the rest stay at default" and is stated here:

- Roof peak position: with Roof bow = 140 mm
- Headlamp sides: with Headlamp height = 220 mm, Headlamp corner softness = 25%
- Headlamp corner softness: with Headlamp height = 160 mm
- Socket depth: with Headlamp height = 160 mm
- Brow ridge: with Headlamp height = 160 mm
- Aperture ratio: with Headlamp height = 160 mm
- Grille corner softness: with Grille height = 240 mm
- Grille taper: with Grille height = 240 mm
- Tail lamp corner softness: with Tail lamp height = 200 mm
- Headlamp internals: with Headlamp height = 160 mm
- Grille texture: with Grille height = 240 mm
- Grille surround: with Grille height = 240 mm
- Tail lamp internals: with Tail lamp height = 200 mm
- Front light signature: with Headlamp height = 160 mm
- Rear light signature: with Tail lamp height = 200 mm
- Seat rows: with Glass tint = 25%

The ten options that differ least from their default (share of pixels changed):

| Axis | Option | Pixels changed | Share |
|---|---|---:|---:|
| Towing | Recovery hooks | 18 | 0.034% |
| Fuel or charge door | Hidden | 28 | 0.054% |
| Towing | Tow bar | 31 | 0.059% |
| Bonnet lines | None | 39 | 0.061% |
| Fuel or charge door | Front wing | 62 | 0.119% |
| Bonnet lines | Centre crease | 92 | 0.144% |
| Glowing panels | Lit face panel | 84 | 0.161% |
| Roof and pillars | Floating, dark rear pillar | 106 | 0.182% |
| Door opening | Sliding | 157 | 0.245% |
| Door cut lines | Following the arch | 144 | 0.247% |

What earlier runs of the gate caught, all fixed:

- First run: 11 options drew the same as their default. Nose roundness (all four): the rounding was capped by the first sample point along the bonnet. Side stripes (both): they were on an axis whose look was the top view, so they could not be seen there; they are now an axis of their own, looked at from the side. Door thickness and door seals (five options): the close crop pointed at the wrong side of the car.
- Second run: tail roundness, two options identical. The corner was limited by the short tail face. Nose and tail corners are now true fillets sized from the lengths of the two edges that meet.
- Nose and tail roundness were listed under Form and passed only faintly at thumbnail size (6 to 24 pixels). They were moved to Face, where a person notices them, and are judged on a close crop.

What looking at the sheets caught, all fixed:

- Wheel arches stopped short of the sill, leaving a spur of body in front of and behind each wheel. They now run down to the sill.
- Headlamp projectors read as cartoon pupils. They are now drawn as a lens in a ring.
- A large brow with a thin lamp covered the whole lamp, leaving a black bar. The brow now covers at most 38% of the lamp height.
- A low grille ran over the lower opening and the plate. The grille now keeps to the space above the lower opening.
- The centre intake was hidden behind the front plate. Enlarged.
- Light bars were too thin to see at whole-car scale. Thickened.
- Metallic flake and pearl were heavy enough to read as texture. Reduced.
- Headlamp sides could not be told apart at 50% corner softness. The gate and the sheet now show them at 25%.
- The scale bar and the size stamp sat on top of the drawing on the page. The drawing now stops above them.
- The message for a mistyped number is a 73-digit number with no spaces and pushed the page wider than the screen. It now wraps.

## The page

`kit/page-test.js` opens `index.html` at 390 px wide in a headless browser and uses every control. 23 steps, 0 failed, 0 console errors. **Pass.**

- ok: opens on a drawing
- ok: no sideways scroll
- ok: next and previous change the number
- ok: go to a typed number
- ok: a bad number shows a message, no dialog
- ok: Anywhere jumps
- ok: every view draws
- ok: Room shows it in place
- ok: Loupe can be dragged
- ok: every axis has a row under its distance
- ok: arrows step an axis and its strip draws
- ok: tapping a strip picture picks that option
- ok: an axis in another view switches the view on, the next one off
- ok: Hold keeps an axis through Anywhere
- ok: Drift walks and stops
- ok: a rule greys an axis and says why
- ok: Sheet: two axes as a grid, tap to go
- ok: Language: roll, hold, release
- ok: Keep, the pile, Near my keeps, Remove
- ok: state is saved on the device
- ok: About opens in the page
- ok: a sound plays without error
- ok: still no sideways scroll

Views: Side, Front, Rear, Top. Room shows it in place for scale. The loupe drags and magnifies four times. State is saved on the device. No pop-up dialogs. The only outside files are two font families, and the test ran with them blocked.

The Language agreements:

1. One corner softness runs from front to back: lamps, grille, tail lamps, arches, nose and tail move together.
2. Sharp graphics take taut surfaces and a pressed line. Soft graphics take soft surfaces.
3. Front and rear light signatures match.
4. Deep sockets take a brow and a smaller lit element. Flush lamps take neither.
5. One trim finish runs through wheels, bright work and cladding.

The 29 axes a language holds: Nose roundness, Tail roundness, Roof and pillars, Spoke shape, Wheel finish, Headlamp sides, Headlamp corner softness, Headlamp slant, Headlamp layout, Socket depth, Brow ridge, Aperture ratio, Grille, Grille corner softness, Grille taper, Tail lamp corner softness, Paint hue, Paint tone, Colour strength, Paint finish, Roof colour, Lower cladding, Shoulder line path, Lines along the doors, Arch shape, Bright work, Front light signature, Rear light signature, Surface.

## What was looked at, and what was not

Looked at, by turning sheets into images and reading them:

- First pass, before the fixes above: all 27 per-axis sheets, covering all 118 axes and every option, and the random sheets for side, front and rear views (24 addresses each).
- Second pass, on the final drawing code: 2 per-axis sheets covering 10 axes (Nose roundness, Tail roundness, Belt height, Belt rise, Rear pillar kick, Headlamp position, Headlamp layout, Front light bar, Socket depth, Brow ridge), and the random top sheet, which had not been seen before.
- Close-ups of 26 chosen settings: the default in four views, ten body types built from the numbers (saloon, estate, hatchback, coupe, pickup, van, mid-engine wedge, tall wagon, micro), and twelve face, lamp, paint and street settings.
- Page screenshots at 390 px: opening state, an axis strip, Room, Sheet.

Not looked at:

- 108 of the 118 axes were not looked at again after the last fixes. The fixes touched lamps, grille position, light bars, paint finish, and the nose and tail corners.
- The random side, front and rear sheets were not looked at again after the fixes.
- Options were looked at one axis at a time with the rest at default. Combinations were seen only in the 24 random addresses and the chosen settings.
- Most Detail axes were seen as close crops on sheets, not through the page's loupe.
- The low-detail drawings were seen only as strips in page screenshots.
- Page screenshots not looked at: Anywhere, the Front, Rear and Top views, Loupe, the rule message, Language, Keeps, and both wide layouts.

Not checked at all:

- The sounds (engine and door). The test confirms they run without an error. Nobody heard them, and nobody compared them with a real car.
- A real phone. The page test uses a headless desktop browser set to 390 px with touch emulation.
- Any browser other than Chromium.
- The page with its fonts loaded. The test blocks them, so every screenshot shows fallback fonts.
- Whether any version can be built, is legal on a road, what it costs, or whether it is good. Out of scope in the kit.
- Eyeglasses were not moved onto the shared kit folder. They still run from their own copy of the engine and page, unchanged.

## Known weak spots

- The views share one set of lengths, heights and widths, so wheelbase, height, width, lamp sizes and positions agree between them. The surfaces between those points do not: the front and rear views are a flat elevation with a simple shoulder and roof, and do not show the plan curve of the nose, the depth of the bonnet, or how the tail falls away.
- The top view is a diagram. Glass, roof and bonnet are placed from the side-view lengths, with fixed shapes between them.
- There is no three-quarter view, which is how cars are usually judged. Spec 6 stage 7 is where a real three-dimensional body would go.
- Surface is drawn as bands of light and shade along the side. It is a sign for a surface, not a surface.
- Socket depth is drawn as shade at the top of the opening. With no side-on section through the lamp, depth and brow can be confused.
- Door opening, moving aero and changing shade are shown as dashed ghosts or as two states at once. Nothing moves.
- The engine is shown as a dashed box in the top view. That is a drawing convention for something heard, and it is the weakest link between an axis and what a person notices.
- Paint tone and hue default to a light neutral grey, so axes that add dark parts (cladding, dark pillars) read well and axes that add light parts read less well. The gate tests each option in one setting, not in all.
- A random address looks crowded. Most axes list the plain option first, so a uniformly random car has most extras switched on at once: stripes, a wing, a spare wheel, a mast. Nothing is filtered, as the kit asks. Hold all on a distance, or a Language, narrows what Anywhere changes.
- Some extreme combinations fold badly: a 2 m wheelbase with long overhangs and a 2.1 m height, or a steep fall from a short roof with a high tail. They draw without error and look wrong. They are in the space and are not hidden.
- A tapered upright grille can resemble the grille of a real maker. Grille shape comes only from width, height, softness, taper and split. No maker's shape is stored, and badges are blank.

## What cars can be that this space still cannot say

`items.md` lists 188 things a person can see, hear, feel or do. 124 are said by an axis (66%), 4 are partly said, 3 follow from other choices, 2 are left out by the kit's rules, and **55 cannot be said at all**:

- Three wheels, or six
- Open wheels standing clear of the body
- Separate wings and running boards
- A boat tail, or a tail that tapers to a point in plan
- No roof at all, with a low screen or none
- A roof bar or hoop with open panels (targa)
- A tall roof or a pop-up roof
- Left and right sides that differ
- A front wider than the rear, or the reverse
- A stepped roof or a double-bubble roof
- A cab that tilts, or a body in two hinged parts
- A small extra window behind the rear door, or an oval one in the pillar
- Side glass split by a bar, or a low second window in the door
- Wire wheels, steel wheels with hubcaps, covered rear wheels
- Lamps that pop up or hide behind covers
- Extra lamps: fog lamps, spot lamps, roof lamps
- A scoop or an air intake standing up from the bonnet
- Upright tail lamps running up the pillars
- Exhausts that exit at the side or through the bumper centre
- Two-tone paint split along the side, wood panels, wraps and pictures
- Side vents, gills and scoops behind the wheels
- Bumpers as separate bars, with overriders
- How wide and how even the gaps between panels are
- Wheel nuts, centre caps and valve stems
- Tyre tread and the print on the tyre wall
- Wipers and washer jets
- Parking sensors, cameras and radar panels in the bumpers
- Door seals, drip rails and the join between roof and side
- Side repeaters, reflectors and marker lamps
- Mud flaps and the lining of the arches
- Paint depth, orange peel and how panels line up
- Indicators that sweep, lamps that play a welcome
- Lamps that swivel with the steering
- How the bonnet and the boot open
- Suspension that rises and lowers
- Grille shutters that open and close
- How the car sits when it brakes, turns and pulls away
- How the load space opens: lid, hatch, split tailgate, side doors
- A load space in the nose
- Steps, grab handles, a winch, a snorkel, a roof tent
- Charging: where the cable goes and what shows while it charges
- The whole inside: seats, wheel, screens, controls
- How heavy the door feels and how it swings
- How the handle moves under the hand
- How the bonnet, boot and filler door feel to open
- The exhaust note, by count and kind of cylinders
- Tyre noise and wind noise
- The horn, the indicators, the locks
- The sound an electric car plays at low speed
- Fabric skin stretched over a frame, from tents and aircraft
- Airless tyres with open spokes, from site machinery
- Woven and knitted body panels, from footwear
- Panels that clip on and off without tools, from luggage and phones
- A canopy that lifts in one piece, from aircraft
- Skin that heals small scratches, from phone coatings

Partly said:

- Bumpers in a different colour from the body (partly: clad)
- How the paint changes with the angle of light (partly: finish)
- A hard roof that folds away (partly: roofop)
- How the paint feels (partly: finish)

Left out by the kit's rules:

- A grille shape that is a maker's mark
- Maker's marks and model names

Beyond the list: nothing here has been checked against real examples. There is no census, so there is no coverage score. That is Spec 2.
