/* Car form space: axes and rules. The address engine is kit/engine.js.
 *
 * Every axis sits under the distance at which a person notices it.
 * The order of AXES is the order of the digits in an address, Form first.
 *
 * Axis fields
 *   id, name   stable id and plain name
 *   d          distance, 1 Form .. 7 Sound
 *   say        one line on what it is
 *   o          option labels, the most ordinary first (the default)
 *   n          the number behind each option, when the axis is a quantity
 *   k          a stable key for each option, when the axis is a list of names
 *   on, when   the rule: which axes it depends on, and the options allowed
 *   why        the reason for the rule, in one line
 *   nw         options not in current practice (as far as memory serves)
 *   ex         options outside the ordinary range, kept and marked extreme
 *   lang       true when the axis carries character (used by Language)
 *   look       where a small drawing should look to show this axis
 *   help       other choices the gate changes so this axis can be judged
 *   sound      true when the page can play this axis
 */
(function (root) {
  'use strict';
  const ENGINE = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
    ? require('../kit/engine.js') : root.FS_ENGINE;

  const VERSION = 'car-1.0';

  const DIST = [
    { n: 1, name: 'Form', at: 'across the street' },
    { n: 2, name: 'Face', at: "at arm's length" },
    { n: 3, name: 'Detail', at: 'at two inches' },
    { n: 4, name: 'Light and motion', at: 'as light and parts move' },
    { n: 5, name: 'Use', at: 'in use' },
    { n: 6, name: 'Touch', at: 'in the hand' },
    { n: 7, name: 'Sound', at: 'by ear' }
  ];

  // Option keys of the axes that rules read. Rules use these indexes.
  const POWER = { front: 0, mid: 1, rear: 2, electric: 3 };
  const GRILLE = { hbars: 0, vbars: 1, mesh: 2, dots: 3, blank: 4, none: 5 };
  const ROOFOP = { fixed: 0, sunroof: 1, glass: 2, soft: 3 };
  const HANDLE = { pull: 0, flush: 1, flap: 2, none: 3 };

  const NA = [0];
  const HEIGHTS = [1450, 1150, 1250, 1350, 1550, 1650, 1780, 1900, 1050, 2100];
  const WHEELS = [660, 580, 620, 700, 740, 800, 520, 880];
  const mm = x => x + ' mm';
  const deg = x => x + '°';
  const pct = x => Math.round(x * 100) + '%';
  const signed = x => (x === 0 ? 'Level' : x > 0 ? '+' + x + ' mm' : '−' + (-x) + ' mm');
  const SIDES = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 8: 'Eight' };
  const HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  const HUE_NAMES = ['red', 'orange', 'yellow', 'lime', 'green', 'spring', 'cyan', 'azure', 'blue', 'violet', 'magenta', 'rose'];
  const hueLabels = first => [first].concat(HUES.map((h, i) => h + '° ' + HUE_NAMES[i]));

  const needGrille = why => ({ on: ['grille'], when: v => (v.grille === GRILLE.none ? NA : null), why: why || 'No grille, nothing to shape.' });

  const Q = (id, name, d, say, vals, fmt, extra) =>
    Object.assign({ id, name, d, say, n: vals, o: vals.map(fmt) }, extra || {});
  const K = (id, name, d, say, pairs, extra) =>
    Object.assign({ id, name, d, say, k: pairs.map(p => p[0]), o: pairs.map(p => p[1]) }, extra || {});
  const SIDE = { v: 'side' }, FRONT = { v: 'front' }, REAR = { v: 'rear' }, TOP = { v: 'top' };
  const at = (v, a, w, aspect) => ({ v, at: a, w, aspect });

  const AXES = [
    // ------------------------------------------------------------ 1. FORM
    Q('wb', 'Wheelbase', 1, 'Distance between the axles.',
      [2700, 2300, 2450, 2550, 2850, 3000, 3200, 2000, 3600], mm, { ex: [7, 8], look: SIDE }),
    Q('fo', 'Front overhang', 1, 'Length ahead of the front axle.',
      [850, 600, 720, 980, 1100, 450], mm, { ex: [5], look: SIDE }),
    Q('ro', 'Rear overhang', 1, 'Length behind the rear axle.',
      [950, 600, 750, 1100, 1300, 450], mm, { ex: [5], look: SIDE }),
    Q('height', 'Height', 1, 'Roof peak above the ground.',
      HEIGHTS, mm, { ex: [8, 9], look: SIDE }),
    Q('width', 'Width', 1, 'Body width.',
      [1820, 1600, 1700, 1900, 1980, 2050, 1480], mm, { ex: [6], look: FRONT }),
    Q('wheel', 'Wheel size', 1, 'Wheel with tyre, across.',
      WHEELS, mm,
      {
        ex: [6, 7], on: ['height'],
        // nearest to the ordinary size first, so that is what a forbidden choice falls back to
        when: v => WHEELS.map((w, i) => i).filter(i => WHEELS[i] <= 0.52 * HEIGHTS[v.height]).sort((p, q) => Math.abs(WHEELS[p] - 660) - Math.abs(WHEELS[q] - 660)),
        why: 'A wheel taller than about half the body cannot fit under it.', look: SIDE
      }),
    Q('clear', 'Ground clearance', 1, 'Height of the sill above the ground.',
      [150, 100, 125, 180, 210, 250, 70, 320], mm, { ex: [6, 7], look: SIDE }),
    Q('archgap', 'Arch gap', 1, 'Space between the tyre and the wheel arch.',
      [50, 25, 80, 120], mm, { look: SIDE }),
    Q('track', 'Wheel inset', 1, 'How far the wheels sit inside the body side, seen from the front.',
      [40, 0, 80, 130, -30], x => (x === 0 ? 'Flush' : x > 0 ? x + ' mm in' : (-x) + ' mm out'), { look: FRONT }),
    Q('tumble', 'Tumblehome', 1, 'How far the cabin leans in toward the roof, seen from the front.',
      [180, 60, 120, 260, 340], mm, { look: FRONT }),
    Q('cowl', 'Cabin position', 1, 'How far the base of the windscreen sits behind the front axle.',
      [300, -250, 0, 150, 450, 650], x => (x === 0 ? 'On the axle' : x > 0 ? x + ' mm behind' : (-x) + ' mm ahead'),
      {
        on: ['power'], when: v => (v.power === POWER.mid ? [1, 2, 3] : null),
        why: 'A motor between the axles moves the cabin forward.', look: SIDE
      }),
    Q('nose', 'Nose height', 1, 'Height of the front edge of the bonnet, against the base of the windscreen.',
      [0.78, 0.55, 0.66, 0.88, 0.97], pct, { look: SIDE }),
    Q('nrake', 'Nose rake', 1, 'How far the front face leans.',
      [12, 0, 25, 40, 55, -8], x => (x === 0 ? 'Upright' : x > 0 ? x + '° back' : (-x) + '° forward'), { look: SIDE }),
    Q('bonnet', 'Bonnet bow', 1, 'How much the bonnet arcs between nose and windscreen.',
      [0.3, 0, 0.6, 1], pct, { look: SIDE }),
    Q('screen', 'Windscreen angle', 1, 'Angle of the windscreen from the horizontal.',
      [32, 22, 27, 38, 46, 56, 68, 82], deg, { look: SIDE }),
    Q('peak', 'Roof peak position', 1, 'Where along the roof its highest point sits.',
      [0.4, 0.2, 0.6, 0.8], pct, { look: SIDE, help: { crown: 3 } }),
    Q('crown', 'Roof bow', 1, 'How much the roof arcs.',
      [40, 0, 80, 140], mm, { look: SIDE }),
    Q('roofend', 'Roof length', 1, 'Where the roof stops, as a share of the way from the top of the windscreen to the tail.',
      [0.72, 0.45, 0.58, 0.84, 0.93, 1], pct, { look: SIDE }),
    Q('rdrop', 'Roof drop', 1, 'How far the roof has fallen from its peak by the time it stops.',
      [50, 0, 110, 190, 280], mm, { look: SIDE }),
    Q('fall', 'Fall angle', 1, 'Angle at which the back falls away from the end of the roof.',
      [30, 14, 20, 40, 52, 66, 80, 90], deg, { look: SIDE }),
    Q('tailh', 'Tail height', 1, 'Height of the top of the tail against the belt line.',
      [0, -120, -60, 70, 150], signed, { look: SIDE }),
    Q('trake', 'Tail rake', 1, 'How the tail face leans.',
      [8, 0, 18, 30, -10], x => (x === 0 ? 'Upright' : x > 0 ? x + '° in at the top' : (-x) + '° out at the top'), { look: SIDE }),
    K('bed', 'Load bed', 1, 'A closed tail, or an open bed behind a separate cabin.',
      [['closed', 'Closed'], ['open', 'Open bed']],
      {
        on: ['roofend', 'fall'], when: v => ((v.roofend === 1 || v.roofend === 2) && v.fall >= 5 ? null : NA),
        why: 'A pickup has an open bed and a separate cabin: the roof must stop early and the back of the cabin drop steeply.',
        look: SIDE
      }),
    Q('plan', 'Corner roundness', 1, 'How rounded the four corners are, seen from above.',
      [0.5, 0.15, 0.85], pct, { look: TOP }),
    Q('waist', 'Waist', 1, 'How far the body pinches in between the wheels, seen from above.',
      [0, 40, 90], mm, { look: TOP }),

    // ------------------------------------------------------------ 2. FACE
    Q('nround', 'Nose roundness', 2, 'How rounded the corner between the front face and the bonnet is.',
      [0.5, 0.12, 0.3, 0.75, 1], pct, { lang: true, look: at('side', 'nose', 1700) }),
    Q('tround', 'Tail roundness', 2, 'How rounded the top corner of the tail is.',
      [0.4, 0.1, 0.7, 1], pct, { lang: true, look: at('side', 'tail', 1900) }),
    Q('belt', 'Belt height', 2, 'Height of the bottom of the side glass, as a share of body height.',
      [0.62, 0.52, 0.57, 0.67, 0.72], pct, { look: SIDE }),
    Q('brise', 'Belt rise', 2, 'How far the belt line rises toward the rear.',
      [40, 0, 90, 150, -40], signed, { look: SIDE }),
    Q('kick', 'Rear pillar kick', 2, 'A kick in the belt line at the last pillar.',
      [0, 60, 130, -60], signed, { look: at('side', 'glass', 2600, 0.45) }),
    Q('pillars', 'Pillars', 2, 'Pillars seen from the side.',
      [3, 2, 4], x => ({ 2: 'Two, no centre pillar', 3: 'Three', 4: 'Four' })[x], { look: at('side', 'glass', 2600, 0.45) }),
    Q('prake', 'Rear pillar rake', 2, 'Whether the back edge of the side glass stands upright or leans with the back.',
      [0.5, 0, 1], x => ({ 0: 'Upright', 0.5: 'Half way', 1: 'Parallel to the back' })[x], { look: at('side', 'glass', 2600, 0.45) }),
    Q('rail', 'Roof rail depth', 2, 'Depth of roof above the side glass.',
      [90, 50, 140, 210], mm, { look: at('side', 'glass', 2600, 0.45) }),
    K('float', 'Roof and pillars', 2, 'Whether the roof joins the body or floats on dark pillars.',
      [['joined', 'Joined'], ['float', 'Floating, dark rear pillar'], ['wrap', 'All pillars dark'], ['visor', 'Dark front pillar']],
      { lang: true, look: at('side', 'glass', 2600, 0.45) }),
    Q('tint', 'Glass tint', 2, 'How dark the glass is.',
      [0.45, 0.25, 0.65, 0.85], pct, { look: at('side', 'glass', 2600, 0.45) }),
    Q('rim', 'Rim size', 2, 'Rim against the whole wheel.',
      [0.68, 0.55, 0.62, 0.74, 0.8, 0.86], pct, { look: at('side', 'wheelF', 1000) }),
    Q('spokes', 'Spoke count', 2, 'Spokes on each wheel.',
      [5, 3, 4, 6, 7, 8, 10, 12, 15, 20], String, { look: at('side', 'wheelF', 1000) }),
    K('spoke', 'Spoke shape', 2, 'The shape of each spoke.',
      [['straight', 'Straight'], ['taper', 'Tapered'], ['split', 'Split in two'], ['turbine', 'Swept'], ['disc', 'Solid disc']],
      { lang: true, look: at('side', 'wheelF', 1000) }),
    Q('dish', 'Wheel dish', 2, 'How deep the wheel face sits inside its rim.',
      [0.3, 0, 0.6, 1], pct, { look: at('side', 'wheelF', 1000) }),
    K('wfin', 'Wheel finish', 2, 'Colour and finish of the wheels.',
      [['silver', 'Silver'], ['dark', 'Dark grey'], ['black', 'Black'], ['body', 'Body colour'], ['cut', 'Machined face'], ['bronze', 'Bronze']],
      { lang: true, look: at('side', 'wheelF', 1000) }),
    Q('hlw', 'Headlamp width', 2, 'Width of one headlamp.',
      [320, 180, 240, 420, 520, 640], mm, { look: FRONT }),
    Q('hlh', 'Headlamp height', 2, 'Height of one headlamp.',
      [110, 40, 70, 160, 220, 300], mm, { look: FRONT }),
    Q('hlsides', 'Headlamp sides', 2, 'Sides of the lamp outline before its corners are softened.',
      [4, 2, 3, 5, 6, 8], x => SIDES[x], { lang: true, look: at('front', 'lamp', 900), help: { hlh: 4, hlsoft: 3 } }),
    Q('hlsoft', 'Headlamp corner softness', 2, 'How far the lamp corners are rounded.',
      [0.5, 1, 0.75, 0.25, 0.05], pct, { lang: true, look: at('front', 'lamp', 900), help: { hlh: 3 } }),
    Q('hlslant', 'Headlamp slant', 2, 'The outer end of the lamp raised or lowered.',
      [6, 0, 14, 24, -8], x => (x === 0 ? 'Level' : x > 0 ? 'Outer up ' + x + '°' : 'Outer down ' + (-x) + '°'),
      { lang: true, look: at('front', 'lamp', 900) }),
    Q('hlpos', 'Headlamp position', 2, 'Where the lamps sit between the bonnet edge and the bumper.',
      [0.12, 0, 0.3, 0.5, 0.75], pct, { look: FRONT }),
    K('hlsplit', 'Headlamp layout', 2, 'One lamp a side, or split.',
      [['single', 'Single'], ['split', 'Slim upper, main lamp below'], ['stack', 'Stacked pair'], ['twin', 'Twin side by side']],
      { lang: true, look: FRONT }),
    K('bar', 'Front light bar', 2, 'A lit bar across the face.',
      [['none', 'None'], ['between', 'Between the lamps'], ['full', 'Across the whole face']], { look: FRONT }),
    Q('socket', 'Socket depth', 2, 'How far lamps and grille are set back into the body.',
      [20, 0, 50, 90, 140], mm, { lang: true, look: at('front', 'lamp', 900), help: { hlh: 3 } }),
    Q('brow', 'Brow ridge', 2, 'How far the body overhangs the top of each lamp.',
      [0, 15, 35, 60], mm, { lang: true, look: at('front', 'lamp', 900), help: { hlh: 3 } }),
    Q('aper', 'Aperture ratio', 2, 'How much of each lamp opening the lit element fills.',
      [0.85, 1, 0.65, 0.45], pct, { lang: true, look: at('front', 'lamp', 900), help: { hlh: 3 } }),
    K('grille', 'Grille', 2, 'The pattern in the grille, or none.',
      [['hbars', 'Horizontal bars'], ['vbars', 'Upright bars'], ['mesh', 'Mesh'], ['dots', 'Dots'], ['blank', 'Blank panel'], ['none', 'None']],
      { lang: true, look: FRONT }),
    Q('grw', 'Grille width', 2, 'Grille width against body width.',
      [0.45, 0.25, 0.65, 0.85], pct, Object.assign({ look: FRONT }, needGrille())),
    Q('grh', 'Grille height', 2, 'Height of the grille.',
      [160, 60, 110, 240, 340, 460], mm, Object.assign({ look: FRONT }, needGrille())),
    Q('grsoft', 'Grille corner softness', 2, 'How far the grille corners are rounded.',
      [0.4, 1, 0.7, 0.15, 0.03], pct, Object.assign({ lang: true, look: at('front', 'grille', 1300), help: { grh: 3 } }, needGrille())),
    Q('grtaper', 'Grille taper', 2, 'Wider at the top or at the bottom.',
      [0, 0.15, 0.3, -0.15, -0.3], x => (x === 0 ? 'Even' : x > 0 ? 'Top wider ' + pct(x) : 'Bottom wider ' + pct(-x)),
      Object.assign({ lang: true, look: at('front', 'grille', 1300), help: { grh: 3 } }, needGrille())),
    Q('grpos', 'Grille position', 2, 'Where the grille sits between the bonnet edge and the bumper.',
      [0.3, 0.08, 0.55, 0.8], pct, Object.assign({ look: FRONT }, needGrille())),
    Q('grsplit', 'Grille parts', 2, 'One opening, or split.',
      [1, 2, 3], x => ['', 'One', 'Two', 'Three'][x], Object.assign({ look: at('front', 'grille', 1300) }, needGrille())),
    K('lower', 'Lower opening', 2, 'Openings low in the front bumper.',
      [['slot', 'Wide slot'], ['none', 'None'], ['centre', 'Centre intake'], ['three', 'Centre and side intakes'], ['mouth', 'Full-width mouth']],
      {
        on: ['power', 'grille'],
        when: v => (v.power === POWER.front && v.grille >= GRILLE.blank ? [0, 2, 3, 4] : null),
        why: 'No radiator means the grille can go. An engine in front needs air: with no grille the lower opening must stay.',
        look: FRONT
      }),
    K('bcrease', 'Bonnet lines', 2, 'Lines pressed into the bonnet.',
      [['two', 'Two soft lines'], ['none', 'None'], ['centre', 'Centre crease'], ['bulge', 'Raised centre'], ['vents', 'Vents']],
      { look: TOP }),
    Q('tlw', 'Tail lamp width', 2, 'Width of one tail lamp.',
      [300, 160, 450, 620], mm, { look: REAR }),
    Q('tlh', 'Tail lamp height', 2, 'Height of one tail lamp.',
      [120, 50, 200, 320], mm, { look: REAR }),
    Q('tlsoft', 'Tail lamp corner softness', 2, 'How far the tail lamp corners are rounded.',
      [0.4, 1, 0.7, 0.1], pct, { lang: true, look: at('rear', 'lamp', 900), help: { tlh: 2 } }),
    Q('tlpos', 'Tail lamp position', 2, 'How far below the top of the tail the lamps sit.',
      [0.1, 0, 0.3, 0.55], pct, { look: REAR }),
    K('tbar', 'Rear light bar', 2, 'A lit bar across the tail.',
      [['none', 'None'], ['between', 'Between the lamps'], ['full', 'Full width']], { look: REAR }),
    K('plater', 'Rear plate', 2, 'Where the rear number plate sits.',
      [['tail', 'On the tail'], ['bumper', 'Low in the bumper'], ['offset', 'On the tail, to one side']], { look: REAR }),
    Q('outlets', 'Exhaust outlets', 2, 'Exhaust outlets under the tail.',
      [2, 0, 1, 4], x => (x ? String(x) : 'None'),
      {
        on: ['power'], when: v => (v.power === POWER.electric ? [1] : null),
        why: 'No engine, no exhaust.', look: at('rear', 'bumper', 1500, 0.4)
      }),
    K('outshape', 'Outlet shape', 2, 'The shape of each outlet.',
      [['round', 'Round'], ['oval', 'Oval'], ['rect', 'Rectangular'], ['trap', 'Trapezoid']],
      {
        on: ['outlets'], when: v => (v.outlets === 1 ? NA : null),
        why: 'No outlets, no shape.', look: at('rear', 'bumper', 1500, 0.4)
      }),
    K('spoiler', 'Spoiler', 2, 'A lip or wing at the tail.',
      [['none', 'None'], ['lip', 'Lip'], ['duck', 'Ducktail'], ['wing', 'Wing on struts'], ['roof', 'Roof spoiler']], { look: at('side', 'tail', 1900) }),
    Q('hue', 'Paint hue', 2, 'Hue of the paint, in steps of 30°.',
      [-1].concat(HUES), (x, i) => hueLabels('Neutral')[i], { lang: true, look: SIDE }),
    Q('tone', 'Paint tone', 2, 'Lightness of the paint.',
      [0.6, 0.1, 0.24, 0.42, 0.78, 0.93], x => ({ 0.1: 'Deep', 0.24: 'Dark', 0.42: 'Mid', 0.6: 'Light', 0.78: 'Pale', 0.93: 'Near white' })[x],
      { lang: true, look: SIDE }),
    Q('sat', 'Colour strength', 2, 'How strong the hue is.',
      [0.55, 0.25, 0.9], x => ({ 0.55: 'Rich', 0.25: 'Muted', 0.9: 'Vivid' })[x],
      { lang: true, on: ['hue'], when: v => (v.hue === 0 ? NA : null), why: 'A neutral paint has no hue to strengthen.', look: SIDE }),
    K('finish', 'Paint finish', 2, 'The finish of the paint.',
      [['solid', 'Solid'], ['metallic', 'Metallic'], ['pearl', 'Pearl'], ['matte', 'Matte'], ['satin', 'Satin']],
      { lang: true, look: at('side', 'door', 1800) }),
    K('roofc', 'Roof colour', 2, 'A second colour on the roof and pillars.',
      [['body', 'Body colour'], ['black', 'Black'], ['white', 'White'], ['silver', 'Silver'], ['contrast', 'Contrast tone']],
      {
        lang: true, on: ['roofop'], when: v => (v.roofop === ROOFOP.soft ? NA : null),
        why: 'A soft top is cloth, with its own colour.', look: SIDE
      }),
    K('stripes', 'Stripes over the top', 2, 'Stripes running nose to tail over bonnet and roof.',
      [['none', 'None'], ['twin', 'Twin centre stripes'], ['offset', 'One offset stripe']],
      { look: TOP }),
    K('sidestripe', 'Side stripes', 2, 'Stripes along the side.',
      [['none', 'None'], ['low', 'Low side stripe'], ['pin', 'Belt pinstripe']],
      { look: SIDE }),
    K('clad', 'Lower cladding', 2, 'Dark plastic along the sills and arches.',
      [['body', 'Body colour'], ['sill', 'Dark sills'], ['arches', 'Dark sills and arches'], ['contrast', 'Contrast lower body']],
      { lang: true, look: SIDE }),
    Q('shoulder', 'Shoulder line height', 2, 'How far below the belt the main line runs.',
      [80, 30, 150, 240], mm, { look: at('side', 'door', 2600, 0.45) }),
    K('shline', 'Shoulder line path', 2, 'The path of the main line along the side.',
      [['straight', 'Straight'], ['rising', 'Rising to the rear'], ['arched', 'Arched'], ['dropping', 'Dropping to the rear'], ['haunch', 'Swelling over the rear wheel']],
      { lang: true, look: SIDE }),
    Q('lines', 'Lines along the doors', 2, 'How many pressed lines run along the side.',
      [1, 0, 2], x => ['None', 'One', 'Two'][x], { lang: true, look: at('side', 'door', 2600, 0.45) }),
    K('sill', 'Sill line', 2, 'The line along the bottom of the doors.',
      [['straight', 'Straight'], ['rising', 'Rising to the rear'], ['scoop', 'Scooped'], ['step', 'Stepped out']],
      { look: at('side', 'door', 2600, 0.45) }),
    Q('arch', 'Arch shape', 2, 'Wheel arch from round to square.',
      [0, 0.35, 0.7, 1], x => ({ 0: 'Round', 0.35: 'Flattened', 0.7: 'Squared', 1: 'Square' })[x], { lang: true, look: at('side', 'wheelF', 1300) }),
    Q('flare', 'Arch flare', 2, 'How far the arches stand out from the body side.',
      [0, 20, 50, 90], mm, { look: at('side', 'wheelF', 1300) }),

    // ---------------------------------------------------------- 3. DETAIL
    K('hlin', 'Headlamp internals', 3, 'What sits inside the lamp.',
      [['proj', 'One projector'], ['twin', 'Two projectors'], ['bowl', 'Reflector bowl'], ['matrix', 'Grid of points'], ['strip', 'Strip only']],
      { look: at('front', 'lamp', 600), help: { hlh: 3 } }),
    Q('grden', 'Grille texture', 3, 'How fine the grille pattern is.',
      [1, 0.5, 2], x => ({ 1: 'Medium', 0.5: 'Coarse', 2: 'Fine' })[x],
      {
        on: ['grille'], when: v => (v.grille <= GRILLE.dots ? null : NA),
        why: 'A blank panel has no pattern to make finer.', look: at('front', 'grille', 900), help: { grh: 3 }
      }),
    K('grsur', 'Grille surround', 3, 'The frame round the grille.',
      [['none', 'None'], ['bright', 'Bright'], ['dark', 'Dark'], ['body', 'Body colour, thick']],
      Object.assign({ look: at('front', 'grille', 1300), help: { grh: 3 } }, needGrille('No grille, no surround.'))),
    K('cuts', 'Door cut lines', 3, 'How the gaps between doors run.',
      [['vert', 'Upright'], ['lean', 'Leaning'], ['arch', 'Following the arch']], { look: at('side', 'door', 2600, 0.45) }),
    K('hpos', 'Handle position', 3, 'Where the door handles sit.',
      [['shoulder', 'On the shoulder line'], ['belt', 'At the belt'], ['mid', 'Mid door']],
      {
        on: ['handle'], when: v => (v.handle === HANDLE.none ? NA : null),
        why: 'No handles, no position.', look: at('side', 'door', 1800)
      }),
    K('mirror', 'Mirrors', 3, 'Mirrors, or cameras in their place.',
      [['door', 'On the door'], ['pillar', 'At the pillar base'], ['camera', 'Cameras on stalks'], ['none', 'None']],
      { nw: [3], look: at('side', 'mirror', 900) }),
    K('trim', 'Bright work', 3, 'Finish of the window surround and small trim.',
      [['dark', 'Dark'], ['bright', 'Bright'], ['body', 'Body colour'], ['satin', 'Satin']], { lang: true, look: at('side', 'glass', 1800) }),
    K('frame', 'Window frames', 3, 'Whether the door glass sits in a frame.',
      [['framed', 'Framed'], ['frameless', 'Frameless']], { look: at('side', 'glass', 1800) }),
    K('filler', 'Fuel or charge door', 3, 'Where the filler door sits.',
      [['rear', 'Rear wing'], ['front', 'Front wing'], ['none', 'Hidden']], { look: SIDE }),
    K('badge', 'Badge, left blank', 3, 'A blank badge shape. No real badge is ever drawn.',
      [['round', 'Roundel'], ['none', 'None'], ['shield', 'Shield'], ['bar', 'Bar']], { look: at('front', 'grille', 900) }),
    K('platef', 'Front plate', 3, 'Where the front number plate sits.',
      [['low', 'Low, centre'], ['none', 'None'], ['high', 'High, centre'], ['offset', 'To one side']], { look: FRONT }),
    K('antenna', 'Antenna', 3, 'The antenna on the roof.',
      [['fin', 'Fin'], ['none', 'None'], ['mast', 'Mast']], { look: at('side', 'roofR', 1500) }),
    K('tyre', 'Tyre wall', 3, 'Marks on the tyre wall.',
      [['plain', 'Plain'], ['white', 'White band'], ['line', 'Coloured line']], { look: at('side', 'wheelF', 1000) }),
    K('caliper', 'Brake calipers', 3, 'Colour of the calipers behind the spokes.',
      [['grey', 'Grey'], ['red', 'Red'], ['yellow', 'Yellow'], ['blue', 'Blue']], { look: at('side', 'wheelF', 800) }),
    K('diffuser', 'Rear lower panel', 3, 'The panel under the rear bumper.',
      [['plain', 'Plain'], ['fins', 'Diffuser fins'], ['skid', 'Skid plate']], { look: at('rear', 'bumper', 1500, 0.4) }),
    K('tlin', 'Tail lamp internals', 3, 'What sits inside the tail lamp.',
      [['blade', 'Light blade'], ['dots', 'Dots'], ['blocks', 'Blocks'], ['panel', 'Glowing panel']],
      { look: at('rear', 'lamp', 600), help: { tlh: 2 } }),

    // ------------------------------------------------ 4. LIGHT AND MOTION
    K('drl', 'Front light signature', 4, 'The shape that lights by day.',
      [['top', 'Line along the top'], ['ring', 'Outline'], ['hook', 'Hook'], ['dots', 'Dots'], ['none', 'None']],
      { lang: true, look: at('front', 'lamp', 900), help: { hlh: 3 } }),
    K('tsig', 'Rear light signature', 4, 'The shape the tail lamp lights.',
      [['outline', 'Outline'], ['line', 'One line'], ['blades', 'Upright blades'], ['fill', 'Whole lamp']],
      { lang: true, look: at('rear', 'lamp', 900), help: { tlh: 2 } }),
    K('sculpt', 'Surface', 4, 'How reflections run along the side.',
      [['taut', 'Taut'], ['soft', 'Soft'], ['hollow', 'Hollowed'], ['flat', 'Flat']], { lang: true, look: at('side', 'door', 2600, 0.45) }),
    K('shade', 'Changing shade', 4, 'Bodywork that changes shade. Shown with panels in two states.',
      [['fixed', 'Fixed'], ['panels', 'Changes panel by panel']], { nw: [1], look: SIDE }),
    K('dooropen', 'Door opening', 4, 'How the doors open. Shown dashed, from above and from the front.',
      [['swing', 'Swing out'], ['scissor', 'Scissor up'], ['gull', 'Gullwing'], ['coach', 'Rear-hinged'], ['slide', 'Sliding']],
      {
        on: ['roofop'], when: v => (v.roofop === ROOFOP.soft ? [0, 1, 3, 4] : null),
        why: 'A gullwing door hinges on a fixed roof.', look: TOP
      }),
    K('roofop', 'Roof opening', 4, 'How the roof opens.',
      [['fixed', 'Fixed'], ['sunroof', 'Sunroof'], ['glass', 'Glass roof'], ['soft', 'Soft top']], { look: TOP }),
    K('aero', 'Moving aero', 4, 'Aero parts that move. Shown dashed in their raised position.',
      [['none', 'None'], ['wing', 'Rear wing rises'], ['brake', 'Air brake']], { look: at('side', 'tail', 1900) }),
    K('glowp', 'Glowing panels', 4, 'Body panels that light up.',
      [['none', 'None'], ['face', 'Lit face panel'], ['sills', 'Lit sills']], { nw: [1, 2], look: SIDE }),

    // ------------------------------------------------------------- 5. USE
    Q('doors', 'Side doors', 5, 'Doors on each side.',
      [2, 1], x => (x === 2 ? 'Two a side' : 'One a side'), { look: SIDE }),
    Q('seats', 'Seat rows', 5, 'Rows of seats, seen through the glass.',
      [2, 1, 3], x => ['', 'One row', 'Two rows', 'Three rows'][x], { look: at('side', 'glass', 2600, 0.45), help: { tint: 1 } }),
    K('rails', 'Roof rails', 5, 'Rails on the roof for carrying loads.',
      [['none', 'None'], ['flush', 'Flush rails'], ['raised', 'Raised rails'], ['bars', 'Rails and crossbars']],
      {
        on: ['roofop'], when: v => (v.roofop === ROOFOP.soft ? NA : null),
        why: 'A soft top carries no rails.', look: at('side', 'glass', 2600, 0.45)
      }),
    K('tow', 'Towing', 5, 'What the car carries for towing.',
      [['none', 'None'], ['bar', 'Tow bar'], ['hooks', 'Recovery hooks']], { look: SIDE }),
    K('solar', 'Solar roof', 5, 'Solar cells in the roof.',
      [['none', 'None'], ['cells', 'Solar cells']],
      {
        nw: [1], on: ['roofop'], when: v => (v.roofop === ROOFOP.fixed ? null : NA),
        why: 'Solar cells need a fixed, closed roof panel.', look: TOP
      }),
    K('sensor', 'Sensor pod', 5, 'A pod of driving sensors.',
      [['none', 'None'], ['roof', 'On the roof'], ['screen', 'Behind the windscreen']], { look: FRONT }),
    K('spare', 'Spare wheel', 5, 'Where the spare wheel is carried.',
      [['none', 'Out of sight'], ['tail', 'On the tail']], { look: at('side', 'tail', 1900) }),

    // ----------------------------------------------------------- 6. TOUCH
    K('handle', 'Door handles', 6, 'What the hand meets on the door.',
      [['pull', 'Proud pull'], ['flush', 'Flush'], ['flap', 'Flap'], ['none', 'None, touch pad']], { look: at('side', 'door', 1300) }),
    Q('doorth', 'Door thickness', 6, 'Thickness of the door, seen from above with the door open.',
      [140, 90, 200, 260], mm, { look: at('top', 'door', 1900) }),

    // ----------------------------------------------------------- 7. SOUND
    K('power', 'Power', 7, 'Where the engine is, or none. Heard before it is seen.',
      [['front', 'Engine in front'], ['mid', 'Engine between the axles'], ['rear', 'Engine at the rear'], ['electric', 'Electric, no engine']],
      { sound: true, look: TOP }),
    Q('seals', 'Door seals', 7, 'The sound of a door shutting, shown as the seals that make it.',
      [2, 1, 3], x => ['', 'One, a clack', 'Two, a thud', 'Three, a soft thump'][x], { sound: true, look: at('top', 'door', 1100) })
  ];

  [['power', POWER], ['grille', GRILLE], ['roofop', ROOFOP], ['handle', HANDLE]].forEach(([id, tab]) => {
    const a = AXES.find(x => x.id === id);
    Object.keys(tab).forEach(key => {
      if (a.k[tab[key]] !== key) throw new Error('index table out of step with axis ' + id);
    });
  });

  const SPACE = ENGINE.buildSpace(AXES);
  const BY = {};
  AXES.forEach((a, i) => { a.i = i; BY[a.id] = a; });

  // ---------------------------------------------------------- language
  // A language picks one value for each axis that carries character, under
  // these agreements. pick(list) returns one item at random.
  const LANGUAGE = {
    agreements: [
      'One corner softness runs from front to back: lamps, grille, tail lamps, arches, nose and tail move together.',
      'Sharp graphics take taut surfaces and a pressed line. Soft graphics take soft surfaces.',
      'Front and rear light signatures match.',
      'Deep sockets take a brow and a smaller lit element. Flush lamps take neither.',
      'One trim finish runs through wheels, bright work and cladding.'
    ],
    describe(v) {
      const n = id => BY[id].n[v[id]], lab = id => BY[id].o[v[id]];
      const edge = n('hlsoft') >= 0.75 ? 'Soft' : n('hlsoft') >= 0.25 ? 'Even' : 'Sharp';
      const sock = n('socket') >= 90 ? 'Deep sockets' : n('socket') >= 20 ? 'Shallow sockets' : 'Flush';
      const h = n('hue'), temp = h < 0 ? 'Neutral' : (h >= 90 && h <= 270) ? 'Cool' : 'Warm';
      return [edge, sock, temp, lab('tone'), lab('finish'), lab('sculpt')];
    },
    roll(pick, v) {
      const p = {};
      const N = (id, vals) => { const i = BY[id].n.indexOf(pick(vals)); if (i >= 0) p[id] = i; };
      const Kk = (id, keys) => { const i = BY[id].k.indexOf(pick(keys)); if (i >= 0) p[id] = i; };
      const edge = pick(['soft', 'even', 'sharp']), depth = pick(['flush', 'shallow', 'deep']);
      const temp = pick(['warm', 'cool', 'neutral', 'neutral']), dark = Math.random() < 0.5;
      // 1. one corner softness front to back
      N('hlsoft', { soft: [1, 0.75], even: [0.5, 0.25], sharp: [0.25, 0.05] }[edge]);
      N('grsoft', { soft: [1, 0.7], even: [0.4, 0.15], sharp: [0.15, 0.03] }[edge]);
      N('tlsoft', { soft: [1, 0.7], even: [0.4], sharp: [0.1] }[edge]);
      N('arch', { soft: [0], even: [0, 0.35], sharp: [0.7, 1] }[edge]);
      N('nround', { soft: [0.75, 1], even: [0.3, 0.5], sharp: [0.12, 0.3] }[edge]);
      N('tround', { soft: [0.7, 1], even: [0.4], sharp: [0.1] }[edge]);
      N('hlsides', { soft: [4, 2], even: [4, 4, 6], sharp: [4, 3, 5, 6, 8] }[edge]);
      N('hlslant', BY.hlslant.n); N('grtaper', BY.grtaper.n);
      Kk('hlsplit', BY.hlsplit.k); Kk('grille', BY.grille.k); Kk('spoke', BY.spoke.k);
      // 2. sharp graphics take taut surfaces and a pressed line
      Kk('sculpt', { soft: ['soft', 'hollow'], even: ['taut', 'soft'], sharp: ['taut', 'flat'] }[edge]);
      N('lines', { soft: [0, 1], even: [1], sharp: [1, 2] }[edge]);
      Kk('shline', BY.shline.k);
      // 3. front and rear signatures match
      const sig = pick([['top', 'line'], ['ring', 'outline'], ['hook', 'blades'], ['dots', 'fill']]);
      Kk('drl', [sig[0]]); Kk('tsig', [sig[1]]);
      // 4. deep sockets take a brow and a smaller lit element
      N('socket', { flush: [0], shallow: [20, 50], deep: [90, 140] }[depth]);
      N('brow', { flush: [0], shallow: [0, 15], deep: [35, 60] }[depth]);
      N('aper', { flush: [1], shallow: [0.85], deep: [0.65, 0.45] }[depth]);
      // 5. one trim finish throughout
      Kk('trim', dark ? ['dark'] : ['bright', 'satin']);
      Kk('wfin', dark ? ['dark', 'black'] : ['silver', 'cut', 'bronze']);
      Kk('clad', dark ? ['sill', 'arches', 'body'] : ['body', 'contrast']);
      Kk('float', dark ? ['float', 'wrap', 'visor'] : ['joined', 'float']);
      // colour
      N('hue', { warm: [0, 30, 60, 330], cool: [150, 180, 210, 240, 270], neutral: [-1] }[temp]);
      N('tone', BY.tone.n); N('sat', BY.sat.n); Kk('finish', BY.finish.k);
      Kk('roofc', ['body', 'body', 'black', 'white', 'contrast']);
      return p;
    }
  };

  const THING = {
    id: 'car', title: 'Car Form Space', name: 'Cars', one: 'car', many: 'cars',
    views: [['side', 'Side'], ['front', 'Front'], ['rear', 'Rear'], ['top', 'Top']],
    main: 'side', room: 'street', tall: ['front', 'rear'],
    thumbs: {
      side: { o: { view: 'side' }, w: 118, h: 45 }, top: { o: { view: 'top' }, w: 118, h: 48 },
      front: { o: { view: 'front' }, w: 74, h: 64 }, rear: { o: { view: 'rear' }, w: 74, h: 64 },
      street: { o: { view: 'street' }, w: 118, h: 50 }
    },
    sheet: ['roofend', 'fall'],
    notes: [
      'Room shows the car on the street beside a figure 1.75 m tall.',
      'Lamps are drawn lit. Dashed lines show parts that move: an open door, a raised wing.',
      'Badges are blank shapes. No real badge or maker’s grille is drawn.'
    ],
    test: { step: 'wb', pick: ['spokes', 6, '10'], other: 'width', back: 'fo', rule: ['grille', 5, 'grw'], hold: 'wb', lang: 'hlsoft' }
  };

  const api = { VERSION, DIST, AXES, BY, SPACE, THING, LANGUAGE, buildSpace: ENGINE.buildSpace, testSpace: ENGINE.testSpace };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FS_SPACE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
