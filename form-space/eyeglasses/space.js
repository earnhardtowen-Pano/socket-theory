/* Eyeglasses form space: axes, rules and the address engine.
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
 */
(function (root) {
  'use strict';

  const VERSION = 'eyeglasses-1.0';

  const DIST = [
    { n: 1, name: 'Form', at: 'across the room' },
    { n: 2, name: 'Face', at: "at arm's length" },
    { n: 3, name: 'Detail', at: 'at two inches' },
    { n: 4, name: 'Light and motion', at: 'as light and parts move' },
    { n: 5, name: 'Use', at: 'in use' },
    { n: 6, name: 'Touch', at: 'in the hand' },
    { n: 7, name: 'Sound', at: 'by ear' }
  ];

  // Option keys of the axes that rules read. Rules use these indexes.
  const LENSES = { two: 0, shield: 1 };
  const RIM = { full: 0, browwire: 1, browcord: 2, lower: 3, none: 4 };
  const HOLD = { temples: 0, clip: 1, strap: 2, handle: 3 };
  const HINGE = { barrel: 0, hidden: 1, coil: 2, flex: 3 };
  const PADS = { moulded: 0, arms: 1, fixed: 2, strip: 3 };
  const MAT = { acetate: 0, metal: 1, injected: 2, printed: 3, wood: 4, horn: 5, carbon: 6 };

  const NA = [0];
  const mm = x => x + ' mm';
  const deg = x => x + '°';
  const pct = x => Math.round(x * 100) + '%';
  const HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  const HUE_NAMES = ['red', 'orange', 'yellow', 'lime', 'green', 'spring', 'cyan', 'azure', 'blue', 'violet', 'magenta', 'rose'];
  const hueLabels = first => [first].concat(HUES.map((h, i) => h + '° ' + HUE_NAMES[i]));

  // Rules that many axes share.
  const needTemples = {
    on: ['hold'],
    when: v => (v.hold === HOLD.temples ? null : NA),
    why: 'Only exists when there are temples.'
  };
  const needHinge = (ok, why) => ({
    on: ['hold', 'hinge'],
    when: v => (v.hold === HOLD.temples && ok(v.hinge) ? null : NA),
    why
  });

  // Quantity axis: options are steps of a number.
  const Q = (id, name, d, say, vals, fmt, extra) =>
    Object.assign({ id, name, d, say, n: vals, o: vals.map(fmt) }, extra || {});
  // Named axis: options are a list of names, each with a stable key.
  const K = (id, name, d, say, pairs, extra) =>
    Object.assign({ id, name, d, say, k: pairs.map(p => p[0]), o: pairs.map(p => p[1]) }, extra || {});

  const AXES = [
    // ------------------------------------------------------------ 1. FORM
    K('lenses', 'Lens layout', 1, 'Two lenses, or one piece across both eyes.',
      [['two', 'Two lenses'], ['shield', 'One shield']], { look: { v: 'front' } }),
    Q('lw', 'Lens width', 1, 'Width of one lens.',
      [50, 40, 44, 47, 53, 56, 59, 62, 34, 70], mm, { ex: [8, 9], look: { v: 'front' } }),
    Q('lh', 'Lens height', 1, 'Height of one lens.',
      [38, 25, 29, 33, 42, 46, 50, 55, 18, 62], mm, { ex: [8, 9], look: { v: 'front' } }),
    Q('sides', 'Outline sides', 1, 'How many sides the lens outline has before its corners are softened.',
      [4, 2, 3, 5, 6, 8], x => ({ 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 8: 'Eight' })[x],
      { lang: true, look: { v: 'front' } }),
    Q('soft', 'Corner softness', 1, 'How far the corners are rounded. At 100% every outline is round.',
      [0.6, 1, 0.8, 0.4, 0.2, 0.05], pct, { lang: true, look: { v: 'front' } }),
    Q('taper', 'Taper', 1, 'Wider at the brow or wider at the cheek.',
      [0, 0.06, 0.12, 0.2, -0.08],
      x => (x === 0 ? 'Even' : x > 0 ? 'Brow wider ' + pct(x) : 'Cheek wider ' + pct(-x)),
      { lang: true, look: { v: 'front' } }),
    Q('droop', 'Cheek droop', 1, 'How far the lower edge sags toward the cheek.',
      [0, 0.08, 0.16, 0.26, 0.4], x => (x ? pct(x) : 'None'), { ex: [4], lang: true, look: { v: 'front' } }),
    Q('sweep', 'Outer corner sweep', 1, 'The outer corner pulled up or down, as a share of lens height.',
      [0, 0.1, 0.2, 0.35, 0.55, -0.15], x => (x === 0 ? 'None' : x > 0 ? 'Up ' + pct(x) : 'Down ' + pct(-x)),
      { ex: [4], lang: true, look: { v: 'front' } }),
    Q('brow', 'Brow flatness', 1, 'How flat the top of the lens is.',
      [1, 0.8, 0.6, 1.3], x => ({ 1: 'Natural', 0.8: 'Flatter', 0.6: 'Flat', 1.3: 'Arched' })[x],
      { lang: true, look: { v: 'front' } }),
    Q('ncut', 'Nose cut', 1, 'A cut at the lower inner corner of the lens.',
      [0, 0.08, 0.16, 0.26], x => (x ? pct(x) : 'None'), { look: { v: 'front' } }),
    Q('tilt', 'Lens tilt', 1, 'The whole lens turned, outer end up or down.',
      [0, 5, 10, -5, -10], x => (x === 0 ? 'Level' : x > 0 ? 'Outer up ' + deg(x) : 'Outer down ' + deg(-x)),
      { look: { v: 'front' } }),
    Q('dbl', 'Bridge width', 1, 'Distance between the lenses.',
      [18, 14, 16, 20, 22, 24, 10, 30], mm, { ex: [6, 7], look: { v: 'front' } }),
    Q('wrap', 'Wrap', 1, 'How far the front curves round the face, seen from above.',
      [5, 0, 10, 15, 20, 28], deg, { look: { v: 'top' } }),
    Q('base', 'Lens curve', 1, 'How much the lens bulges. Higher is rounder.',
      [4, 0, 2, 6, 8], x => (x ? 'Base ' + x : 'Flat'), { look: { v: 'top' } }),
    Q('panto', 'Forward tilt', 1, 'The front leaning in at the bottom, seen from the side.',
      [8, 0, 4, 12, 18], deg, { look: { v: 'side', at: 'front', w: 80 } }),
    Q('fthick', 'Front thickness', 1, 'Thickness of the front, seen from above.',
      [4, 1, 2.5, 6, 9], mm, { look: { v: 'top', at: 'bridge', w: 90 } }),
    K('hold', 'How it stays on', 1, 'What keeps it on the face.',
      [['temples', 'Temples'], ['clip', 'Nose clip only'], ['strap', 'Strap band'], ['handle', 'Hand-held handle']],
      { look: { v: 'side' } }),
    K('epos', 'Side attachment height', 1, 'Where the temples or strap meet the front.',
      [['upper', 'Upper third'], ['top', 'Top'], ['mid', 'Middle'], ['low', 'Low']],
      {
        on: ['rim', 'hold'],
        when: v => (v.hold === HOLD.clip ? NA : v.rim === RIM.lower ? [2, 3] : v.rim === RIM.browcord ? [0, 1, 2] : null),
        why: 'The side attachment needs rim at its height: a lower rim reaches the middle and below, a cord-held lens the middle and above. A nose clip has nothing at the side.',
        look: { v: 'front' }
      }),
    Q('endr', 'Corner reach', 1, 'How far the corners reach past the lens.',
      [3, 0, 6, 10, 15], mm,
      {
        on: ['hold'], when: v => (v.hold === HOLD.clip ? NA : null),
        why: 'A nose clip has no corners to reach out.', look: { v: 'front' }
      }),
    Q('tlen', 'Temple length', 1, 'Length of a temple, hinge to tip.',
      [140, 130, 135, 145, 150, 155], mm, Object.assign({ look: { v: 'side' } }, needTemples)),
    Q('tbend', 'Bend behind the ear', 1, 'How far the temple turns down behind the ear.',
      [45, 0, 25, 70, 200], x => (x === 0 ? 'Straight' : x === 200 ? 'Full curl' : 'Drop ' + deg(x)),
      Object.assign({ look: { v: 'side' } }, needTemples)),
    K('sit', 'How high it sits', 1, 'Where the front rests on the face.',
      [['bridge', 'On the bridge'], ['high', 'High'], ['low', 'Down the nose']], { look: { v: 'worn' } }),
    K('topline', 'Top line', 1, 'Whether the top of the front follows the lenses or runs as one line.',
      [['follow', 'Follows the lenses'], ['flat', 'One straight line'], ['arc', 'One arc'], ['dip', 'Dips at the centre']],
      {
        on: ['rim'], when: v => (v.rim <= RIM.browcord ? null : NA),
        why: 'A top line is made of upper rim, so it needs one.', look: { v: 'front' }
      }),

    // ------------------------------------------------------------ 2. FACE
    K('rim', 'Rim', 2, 'How much of each lens the frame surrounds.',
      [['full', 'Full rim'], ['browwire', 'Brow, wire below'], ['browcord', 'Brow, cord below'],
        ['lower', 'Lower rim only'], ['none', 'Rimless']], { look: { v: 'front' } }),
    Q('rimt', 'Rim thickness', 2, 'Thickness of the rim seen from the front.',
      [3, 0.9, 1.6, 2.2, 4.5, 6.5, 9, 12], mm,
      {
        ex: [7], lang: true, on: ['rim'], when: v => (v.rim === RIM.none ? NA : null),
        why: 'A rimless lens has no rim to be thick.', look: { v: 'front' }
      }),
    Q('rbrow', 'Brow weight', 2, 'The rim made heavier at the brow, or below.',
      [1, 1.5, 2.2, 3, 0.67], x => (x === 1 ? 'Even' : x > 1 ? 'Brow ×' + x : 'Lower ×1.5'),
      {
        lang: true, on: ['rim'],
        when: v => (v.rim === RIM.full ? null : v.rim <= RIM.browcord ? [0, 1, 2, 3] : NA),
        why: 'Weight can only shift between brow and lower rim where both exist; a brow piece can only be heavier at the brow.',
        look: { v: 'front' }
      }),
    Q('rcorner', 'Outer corner weight', 2, 'Extra rim at the upper outer corner.',
      [0, 0.3, 0.7, 1.2], x => (x ? '+' + pct(x) : 'None'),
      {
        lang: true, on: ['rim'], when: v => (v.rim <= RIM.browcord ? null : NA),
        why: 'The corner weight is upper rim.', look: { v: 'front', at: 'endR', w: 60 }
      }),
    Q('outer', 'Outer contour', 2, 'Whether the outside of the rim follows the lens or takes its own shape.',
      [0, 0.5, 1, -0.6], x => ({ 0: 'Follows the lens', 0.5: 'Squarer', 1: 'Much squarer', '-0.6': 'Rounder' })[x],
      {
        lang: true, on: ['rim'], when: v => (v.rim === RIM.full ? null : NA),
        why: 'Only a full rim has a whole outer contour.', look: { v: 'front' }
      }),
    Q('bbars', 'Bridge bars', 2, 'How many bars join the lenses.',
      [1, 2, 3], x => ['', 'One', 'Two', 'Three'][x],
      {
        on: ['lenses'], when: v => (v.lenses === LENSES.shield ? NA : null),
        why: 'A single shield lens has no bridge gap.', look: { v: 'front', at: 'bridge', w: 80 }
      }),
    K('bh', 'Bridge height', 2, 'Where the bridge sits on the lens.',
      [['upper', 'Upper third'], ['top', 'Top'], ['mid', 'Middle'], ['low', 'Low']],
      {
        on: ['lenses', 'rim'],
        when: v => (v.lenses === LENSES.shield ? NA : v.rim === RIM.lower ? [2, 3] : v.rim === RIM.browcord ? [0, 1, 2] : null),
        why: 'A shield has no bridge gap. Elsewhere the bridge needs rim at its height.',
        look: { v: 'front', at: 'bridge', w: 80 }
      }),
    Q('barch', 'Bridge arch', 2, 'How far the bridge rises between the lenses. On a shield, the height of the nose cut.',
      [0.5, 0, 1.2, -0.5], x => ({ 0.5: 'Gentle', 0: 'Straight', 1.2: 'High', '-0.5': 'Dipped' })[x],
      { look: { v: 'front', at: 'bridge', w: 80 } }),
    Q('bdepth', 'Bridge bar depth', 2, 'Depth of the bridge bar.',
      [0, 1, 2.5, 5, 8], x => (x ? mm(x) : 'Follows the rim'),
      {
        on: ['lenses', 'rim'],
        when: v => (v.lenses === LENSES.shield ? NA : v.rim === RIM.none ? [1, 2] : null),
        why: 'A shield has no bridge bar. A rimless bridge is a wire or thin bar.',
        look: { v: 'front', at: 'bridge', w: 80 }
      }),
    K('bunder', 'Bridge underside', 2, 'The shape cut under the bridge.',
      [['saddle', 'Saddle'], ['keyhole', 'Keyhole'], ['flat', 'Flat']],
      {
        lang: true, on: ['lenses', 'rim'],
        when: v => (v.lenses === LENSES.shield || v.rim === RIM.none ? NA : null),
        why: 'The underside is cut from bridge material; a shield or a wire has none.',
        look: { v: 'front', at: 'bridge', w: 80 }
      }),
    K('mat', 'Material', 2, 'What the frame is made of.',
      [['acetate', 'Acetate'], ['metal', 'Metal'], ['injected', 'Injected plastic'], ['printed', 'Printed nylon'],
        ['wood', 'Wood'], ['horn', 'Horn'], ['carbon', 'Carbon weave']],
      { lang: true, look: { v: 'front', at: 'endR', w: 56 } }),
    Q('hue', 'Frame hue', 2, 'Hue of the frame, in steps of 30°.',
      [-1].concat(HUES), (x, i) => hueLabels('Neutral')[i], { lang: true, look: { v: 'front' } }),
    Q('tone', 'Frame tone', 2, 'Lightness of the frame.',
      [0.1, 0.24, 0.42, 0.6, 0.78, 0.93], x => ({ 0.1: 'Deep', 0.24: 'Dark', 0.42: 'Mid', 0.6: 'Light', 0.78: 'Pale', 0.93: 'Near white' })[x],
      { lang: true, look: { v: 'front' } }),
    Q('sat', 'Colour strength', 2, 'How strong the hue is.',
      [0.55, 0.25, 0.9], x => ({ 0.55: 'Rich', 0.25: 'Muted', 0.9: 'Vivid' })[x],
      {
        lang: true, on: ['hue'], when: v => (v.hue === 0 ? NA : null),
        why: 'A neutral frame has no hue to strengthen.', look: { v: 'front' }
      }),
    Q('pcon', 'Pattern contrast', 2, 'Strength of the mottled pattern in the material.',
      [0, 0.3, 0.6, 1], x => ({ 0: 'None', 0.3: 'Low', 0.6: 'Medium', 1: 'High' })[x],
      { lang: true, look: { v: 'front', at: 'endR', w: 56 } }),
    Q('blotch', 'Blotch size', 2, 'Size of one blotch in the pattern.',
      [3, 0.7, 1.6, 6, 10], mm,
      {
        lang: true, on: ['pcon'], when: v => (v.pcon === 0 ? NA : null),
        why: 'No pattern, no blotches.', look: { v: 'front', at: 'endR', w: 56 }
      }),
    K('pdir', 'Blotch stretch', 2, 'Round blotches, or stretched along a direction into streaks.',
      [['round', 'Round'], ['along3', 'Along ×3'], ['along8', 'Along ×8'], ['diag3', 'Diagonal ×3'], ['vert3', 'Upright ×3']],
      {
        lang: true, on: ['pcon'], when: v => (v.pcon === 0 ? NA : null),
        why: 'No pattern, no blotches.', look: { v: 'front', at: 'endR', w: 56 }
      }),
    K('pcol', 'Pattern colour', 2, 'Colour of the blotches against the frame colour.',
      [['lighter', 'Lighter'], ['darker', 'Darker'], ['amber', 'Amber'], ['opposite', 'Opposite hue'], ['clear', 'Clear windows']],
      {
        lang: true, on: ['pcon'], when: v => (v.pcon === 0 ? NA : null),
        why: 'No pattern, no blotches.', look: { v: 'front', at: 'endR', w: 56 }
      }),
    K('lam', 'Layers', 2, 'Sheets of a second colour laminated into the front.',
      [['one', 'One layer'], ['brow', 'Brow layer'], ['frontback', 'Front and back'], ['stripe', 'Edge stripe']],
      { look: { v: 'front' } }),
    K('fade', 'Fade', 2, 'The colour fading from the top of the front to the bottom.',
      [['none', 'None'], ['lighter', 'To lighter'], ['clear', 'To clear'], ['second', 'To the second colour']],
      { look: { v: 'front' } }),
    K('col2', 'Second colour', 2, 'The second colour, set against the frame colour.',
      [['lighter', 'Lighter'], ['darker', 'Darker'], ['h30', 'Hue +30°'], ['h90', 'Hue +90°'], ['h180', 'Hue +180°'],
        ['black', 'Black'], ['white', 'White'], ['clear', 'Clear']],
      {
        on: ['lam', 'fade'], when: v => (v.lam !== 0 || v.fade === 3 ? null : NA),
        why: 'A second colour needs a layer or a fade that uses it.', look: { v: 'front' }
      }),
    Q('tdepth', 'Temple depth', 2, 'Height of the temple at the hinge, seen from the side.',
      [6, 1.2, 3, 9, 13, 18], mm, Object.assign({ lang: true, look: { v: 'side' } }, needTemples)),
    Q('ttaper', 'Temple taper', 2, 'Depth at the tip against depth at the hinge.',
      [0.6, 1, 0.3, 1.5], x => ({ 0.6: 'Slight', 1: 'None', 0.3: 'Strong', 1.5: 'Widening' })[x],
      Object.assign({ look: { v: 'side' } }, needTemples)),
    K('tline', 'Temple line', 2, 'The path of the temple from hinge to ear.',
      [['straight', 'Straight'], ['arched', 'Arched'], ['dropped', 'Dropped'], ['stepped', 'Stepped']],
      Object.assign({ look: { v: 'side' } }, needTemples)),
    K('tcol', 'Temple colour', 2, 'Temples like the front, or set against it.',
      [['same', 'Same as the front'], ['metal', 'Hardware metal'], ['contrast', 'Contrast tone'], ['black', 'Black']],
      Object.assign({ lang: true, look: { v: 'side' } }, needTemples)),
    Q('tintd', 'Tint density', 2, 'How dark the lenses are.',
      [0, 0.1, 0.25, 0.5, 0.75, 0.9], x => (x ? pct(x) : 'Clear'), { look: { v: 'front', at: 'lensR', w: 84 } }),
    Q('tinth', 'Tint hue', 2, 'Hue of the tint, in steps of 30°.',
      [-1].concat(HUES), (x, i) => hueLabels('Grey')[i],
      {
        on: ['tintd'], when: v => (v.tintd === 0 ? NA : null),
        why: 'A clear lens has no tint to colour.', look: { v: 'front', at: 'lensR', w: 84 }
      }),
    K('tgrad', 'Tint gradient', 2, 'Whether the tint is even or fades down the lens.',
      [['solid', 'Even'], ['down', 'Fades down'], ['downclear', 'Fades to clear'], ['double', 'Dark top and bottom']],
      {
        on: ['tintd'], when: v => (v.tintd === 0 ? NA : null),
        why: 'A clear lens has no tint to fade.', look: { v: 'front', at: 'lensR', w: 84 }
      }),

    // ---------------------------------------------------------- 3. DETAIL
    K('hinge', 'Hinge', 3, 'What joins temple to front.',
      [['barrel', 'Barrel'], ['hidden', 'Hidden'], ['coil', 'Wire coil'], ['flex', 'None, flexing metal']],
      Object.assign({ look: { v: 'top', at: 'hingeR', w: 36 } }, needTemples)),
    Q('barrels', 'Barrel count', 3, 'Knuckles in a barrel hinge.',
      [3, 5, 7], x => String(x),
      Object.assign({ look: { v: 'side', at: 'hinge', w: 30 } },
        needHinge(h => h === HINGE.barrel, 'Barrels belong to a barrel hinge.'))),
    K('screw', 'Screw head', 3, 'The head of the hinge screw.',
      [['slot', 'Slot'], ['cross', 'Cross'], ['star', 'Star'], ['none', 'Hidden']],
      Object.assign({ look: { v: 'top', at: 'hingeR', w: 20 } },
        needHinge(h => h === HINGE.barrel, 'Only a barrel hinge shows a screw.'))),
    Q('rivn', 'Front rivets', 3, 'Rivets on each corner of the front.',
      [2, 0, 1, 3, 4], x => (x ? String(x) : 'None'), { look: { v: 'front', at: 'endR', w: 30 } }),
    K('rivs', 'Rivet shape', 3, 'Shape of each rivet head.',
      [['round', 'Round'], ['diamond', 'Diamond'], ['bar', 'Bar'], ['triangle', 'Triangle'], ['star', 'Star']],
      {
        lang: true, on: ['rivn'], when: v => (v.rivn === 1 ? NA : null),
        why: 'No rivets, no shape.', look: { v: 'front', at: 'endR', w: 24 }
      }),
    K('pads', 'Nose rest', 3, 'What sits on the nose.',
      [['moulded', 'Moulded into the front'], ['arms', 'Pads on wire arms'], ['fixed', 'Fixed pads'], ['strip', 'One-piece saddle strip']],
      {
        on: ['rim'], when: v => (v.rim === RIM.none ? [1, 3] : null),
        why: 'A rimless front has no material to mould a nose rest from, or to fix pads to.',
        look: { v: 'front', at: 'bridge', w: 56 }
      }),
    Q('padsz', 'Pad size', 3, 'Length of a nose pad.',
      [13, 9, 11, 15, 18], mm,
      {
        on: ['pads'], when: v => (v.pads === PADS.arms || v.pads === PADS.fixed ? null : NA),
        why: 'Only separate pads have a size.', look: { v: 'front', at: 'bridge', w: 56 }
      }),
    Q('padr', 'Pad proportion', 3, 'Length of a pad against its width.',
      [1.6, 1, 2.2], x => ({ 1.6: 'Oval', 1: 'Round', 2.2: 'Long' })[x],
      {
        on: ['pads'], when: v => (v.pads === PADS.arms || v.pads === PADS.fixed ? null : NA),
        why: 'Only separate pads have a proportion.', look: { v: 'front', at: 'bridge', w: 56 }
      }),
    K('mount', 'Rimless mount', 3, 'How a rimless lens is held.',
      [['two', 'Two holes a side'], ['one', 'One hole a side'], ['notch', 'Notch and clamp']],
      {
        on: ['rim'], when: v => (v.rim === RIM.none ? null : NA),
        why: 'Only a rimless lens is drilled or notched.', look: { v: 'front', at: 'endR', w: 36 }
      }),
    K('ledge', 'Lens edge finish', 3, 'The finish of a lens edge left bare.',
      [['matte', 'Matte'], ['polished', 'Polished'], ['faceted', 'Faceted']],
      {
        on: ['rim'], when: v => (v.rim >= RIM.browcord ? null : NA),
        why: 'The lens edge shows only where no rim covers it.', look: { v: 'front', at: 'lensR', w: 70 }
      }),
    Q('lthick', 'Lens edge thickness', 3, 'Thickness of the lens at its edge, seen from above.',
      [2, 1.2, 3.5, 5.5, 8], mm, { look: { v: 'top', at: 'lensR', w: 70 } }),
    K('bevel', 'Rim edge', 3, 'How the face of the rim meets its sides.',
      [['rounded', 'Rounded'], ['flat', 'Flat, sharp edge'], ['chamfer', 'Chamfered'], ['knife', 'Knife ridge']],
      {
        lang: true, on: ['rim'], when: v => (v.rim === RIM.none ? NA : null),
        why: 'A rimless lens has no rim edge.', look: { v: 'front', at: 'endR', w: 40 }
      }),
    K('finish', 'Finish', 3, 'The surface finish of the frame.',
      [['gloss', 'Gloss'], ['satin', 'Satin'], ['matte', 'Matte'], ['brushed', 'Brushed'], ['hammered', 'Hammered']],
      { lang: true, look: { v: 'front', at: 'endR', w: 56 } }),
    K('hw', 'Hardware metal', 3, 'Colour of rivets, hinges, pad arms and wire.',
      [['silver', 'Silver'], ['gold', 'Gold'], ['rose', 'Rose gold'], ['gun', 'Gunmetal'], ['black', 'Black'], ['copper', 'Copper']],
      { lang: true, look: { v: 'front', at: 'endR', w: 30 } }),
    K('core', 'Temple core wire', 3, 'The metal core seen through a see-through temple.',
      [['hidden', 'Not shown'], ['plain', 'Plain'], ['engraved', 'Engraved']],
      {
        on: ['hold', 'clarity'], when: v => (v.hold === HOLD.temples && v.clarity > 0 ? null : NA),
        why: 'A core wire shows only through a see-through temple.', look: { v: 'side', at: 'mid', w: 100 }
      }),
    K('engr', 'Engraving', 3, 'Engraved lines on the brow and temples.',
      [['none', 'None'], ['line', 'Line'], ['double', 'Double line'], ['wave', 'Wave'], ['dots', 'Dots']],
      { look: { v: 'side', at: 'hinge', w: 70 } }),
    K('print', 'Size print', 3, 'Size numbers printed on the temple.',
      [['none', 'None'], ['size', 'Size'], ['sizeline', 'Size and rule']],
      Object.assign({ look: { v: 'side', at: 'mid', w: 70 } }, needTemples)),
    K('tipn', 'Temple tip', 3, 'How the temple ends.',
      [['plain', 'Plain'], ['paddle', 'Paddle'], ['ball', 'Ball'], ['hook', 'Hook']],
      Object.assign({ lang: true, look: { v: 'side', at: 'tip', w: 70 } }, needTemples)),
    K('tcut', 'Temple openings', 3, 'Openings cut through the temple.',
      [['solid', 'Solid'], ['slot', 'One slot'], ['holes', 'Row of holes'], ['outline', 'Open outline']],
      Object.assign({ look: { v: 'side', at: 'mid', w: 110 } }, needTemples)),

    // ------------------------------------------------ 4. LIGHT AND MOTION
    Q('mirror', 'Mirror', 4, 'Strength of a mirror coating on the lens.',
      [0, 0.3, 0.7, 1], x => (x ? pct(x) : 'None'), { look: { v: 'front', at: 'lensR', w: 84 } }),
    Q('mirh', 'Mirror colour', 4, 'Colour the mirror reflects.',
      [-1, 45, 0, 130, 220, 280, 320], x => ({ '-1': 'Silver', 45: 'Gold', 0: 'Red', 130: 'Green', 220: 'Blue', 280: 'Violet', 320: 'Pink' })[x],
      {
        on: ['mirror'], when: v => (v.mirror === 0 ? NA : null),
        why: 'No mirror, no mirror colour.', look: { v: 'front', at: 'lensR', w: 84 }
      }),
    K('coat', 'Glare coating', 4, 'The colour a glare coating leaves in reflections.',
      [['none', 'Uncoated'], ['green', 'Green'], ['blue', 'Blue'], ['violet', 'Violet'], ['gold', 'Gold']],
      { look: { v: 'front', at: 'lensR', w: 84 } }),
    Q('clarity', 'Frame see-through', 4, 'Whether light passes through the frame material.',
      [1, 0.72, 0.4], x => ({ 1: 'Opaque', 0.72: 'Translucent', 0.4: 'Clear' })[x],
      {
        lang: true, on: ['mat'],
        when: v => (v.mat === MAT.acetate || v.mat === MAT.injected ? null : v.mat === MAT.printed || v.mat === MAT.horn ? [0, 1] : NA),
        why: 'Metal, wood and carbon let no light through. Printed nylon and horn pass a little.',
        look: { v: 'front', at: 'endR', w: 56 }
      }),
    K('adapt', 'Tint behaviour', 4, 'Whether the tint changes. The front view shows it indoors, the worn view outdoors.',
      [['fixed', 'Fixed'], ['sun', 'Darkens in sun'], ['switch', 'Switched on command']],
      { nw: [2], look: { v: 'worn' } }),
    K('glow', 'Glow', 4, 'Light the frame gives off.',
      [['none', 'None'], ['phos', 'Glows in the dark'], ['leds', 'Reading lights']],
      { look: { v: 'top' } }),
    K('fold', 'Folding', 4, 'How the temples fold. Shown dashed in the top view.',
      [['flat', 'Fold flat'], ['crossed', 'Fold crossed'], ['half', 'Front folds in half too']],
      Object.assign({ look: { v: 'top' } },
        needHinge(h => h !== HINGE.flex, 'Folding needs a hinge.'))),

    // ------------------------------------------------------------- 5. USE
    K('seg', 'Lens type', 5, 'Zones in the lens for near and far.',
      [['single', 'Single vision'], ['dseg', 'D segment'], ['round', 'Round segment'], ['exec', 'Full-width line'],
        ['tri', 'Three zones'], ['efocus', 'Electronic focus zone'], ['dial', 'Set by a dial']],
      { nw: [5], look: { v: 'front', at: 'lensR', w: 84 } }),
    K('clip', 'Sun clip', 5, 'A second pair of dark lenses clipped over the first.',
      [['none', 'None'], ['down', 'Clip-on, down'], ['up', 'Clip-on, flipped up']], { look: { v: 'front' } }),
    K('side', 'Side shields', 5, 'Shields that close the gap at the side.',
      [['none', 'None'], ['cups', 'Soft cups'], ['clear', 'Clear'], ['mesh', 'Mesh']],
      {
        on: ['hold'], when: v => (v.hold === HOLD.temples || v.hold === HOLD.strap ? null : NA),
        why: 'Side shields hang between front and temple or strap.', look: { v: 'side', at: 'hinge', w: 90 }
      }),
    K('cord', 'Retainer', 5, 'A cord or chain from the temple tips.',
      [['none', 'None'], ['cord', 'Cord'], ['chain', 'Chain']],
      Object.assign({ look: { v: 'side' } }, needTemples)),
    K('audio', 'Speakers', 5, 'Sound built into the temples.',
      [['none', 'None'], ['open', 'Open-ear speakers'], ['bone', 'Bone conduction']],
      Object.assign({ look: { v: 'side', at: 'mid', w: 120 } }, needTemples)),
    K('disp', 'Display', 5, 'A display in the lens.',
      [['none', 'None'], ['one', 'One eye'], ['both', 'Both eyes']], { look: { v: 'front', at: 'lensR', w: 90 } }),
    K('cam', 'Camera', 5, 'A camera at the corner of the front.',
      [['none', 'None'], ['one', 'One corner'], ['both', 'Both corners']], { look: { v: 'front', at: 'endR', w: 44 } }),
    K('vent', 'Lens vents', 5, 'Openings in the lens to let air through.',
      [['none', 'None'], ['slots', 'Slots at the top'], ['holes', 'Holes at the side']],
      { look: { v: 'front', at: 'lensR', w: 84 } }),
    K('adj', 'Temple adjustment', 5, 'Built-in adjustment of the temples.',
      [['fixed', 'None'], ['telescope', 'Telescoping length'], ['ratchet', 'Ratchet tilt']],
      Object.assign({ look: { v: 'side' } }, needTemples)),

    // ----------------------------------------------------------- 6. TOUCH
    K('padm', 'Pad material', 6, 'What the nose pads are made of.',
      [['soft', 'Clear, soft'], ['hard', 'Clear, hard'], ['metal', 'Metal'], ['frame', 'Frame material']],
      {
        on: ['pads'], when: v => (v.pads === PADS.arms || v.pads === PADS.fixed ? null : NA),
        why: 'Only separate pads have their own material.', look: { v: 'front', at: 'bridge', w: 40 }
      }),
    K('tipg', 'Tip covering', 6, 'What covers the temple where it grips the ear.',
      [['bare', 'Bare'], ['sleeve', 'Sleeve'], ['ribbed', 'Ribbed rubber'], ['wrapped', 'Wrapped cord']],
      Object.assign({ look: { v: 'side', at: 'tip', w: 80 } }, needTemples)),
    Q('spring', 'Hinge spring', 6, 'How far the temples spring open past straight. Shown dashed in the top view.',
      [0, 10, 25], x => (x ? 'Springs ' + deg(x) : 'Firm stop'),
      Object.assign({ look: { v: 'top', at: 'hingeR', w: 60 } },
        needHinge(h => h === HINGE.barrel || h === HINGE.hidden, 'A spring sits in a barrel or hidden hinge.'))),
    Q('tthick', 'Temple thickness', 6, 'Thickness of the temple, seen from above.',
      [3.5, 1, 2, 5, 7], mm, Object.assign({ look: { v: 'top' } }, needTemples)),

    // ----------------------------------------------------------- 7. SOUND
    K('snap', 'Hinge sound', 7, 'The sound of the hinge closing, shown as the catch that makes it.',
      [['quiet', 'Quiet'], ['click', 'Soft click'], ['snap', 'Sharp snap']],
      Object.assign({ look: { v: 'top', at: 'hingeR', w: 20 } },
        needHinge(h => h !== HINGE.flex, 'A hinge sound needs a hinge.')))
  ];

  // Guard: the index tables above must match the option keys.
  [['lenses', LENSES], ['rim', RIM], ['hold', HOLD], ['hinge', HINGE], ['pads', PADS], ['mat', MAT]].forEach(([id, tab]) => {
    const a = AXES.find(x => x.id === id);
    Object.keys(tab).forEach(key => {
      if (a.k[tab[key]] !== key) throw new Error('index table out of step with axis ' + id);
    });
  });

  /* ==================================================================
   * The address engine. Appendix A of the Form Space Build Kit,
   * unchanged. checks/engine-test.js compares it with the kit's text.
   * ================================================================== */
  /*ENGINE-BEGIN*/
  function buildSpace(AX) {

    AX.forEach(a => { a.all = a.o.map((_, i) => i); });

    // which axes control others
    const ctrl = new Set();
    AX.forEach(a => (a.on || []).forEach(c => ctrl.add(c)));

    // join axes linked by rules into groups
    const par = {};
    AX.forEach(a => { par[a.id] = a.id; });
    const find = x => (par[x] === x ? x : (par[x] = find(par[x])));
    AX.forEach(a => (a.on || []).forEach(c => {
          par[find(c)] = find(a.id);
    }));

    const allowed = (a, v) => {
      if (!a.when) return a.all;
      const r = a.when(v);
      return (r && r.length) ? r : a.all;
    };

    const units = [];
    const seen = new Set();
    AX.forEach(a => {
        if (!a.on && !ctrl.has(a.id)) {
          units.push({ free: a, radix: BigInt(a.o.length) });
          return;
        }
        const r = find(a.id);
        if (seen.has(r)) return;
        seen.add(r);
        const mem = AX.filter(
          m => (m.on || ctrl.has(m.id)) && find(m.id) === r
        );
        const cs = mem.filter(m => ctrl.has(m.id));
        const ord = [];
        const done = new Set();
        while (ord.length < cs.length) {
          let progressed = false;
          for (const c of cs) {
            if (done.has(c.id)) continue;
            if ((c.on || []).every(d => done.has(d))) {
              ord.push(c);
              done.add(c.id);
              progressed = true;
            }
          }
          if (!progressed) throw new Error('rules form a loop');
        }
        const deps = mem.filter(m => !ctrl.has(m.id));
        const combos = [];
        const offs = [];
        const key = {};
        const v = {};
        let tot = 0n;
        (function rec(i) {
            if (i === ord.length) {
              let b = 1n;
              for (const d of deps) b *= BigInt(allowed(d, v).length);
              key[ord.map(c => v[c.id]).join(',')] = combos.length;
              combos.push(ord.map(c => v[c.id]));
              offs.push(tot);
              tot += b;
              return;
            }
            const c = ord[i];
            for (const o of allowed(c, v)) {
              v[c.id] = o;
              rec(i + 1);
            }
            delete v[c.id];
        })(0);
        units.push({ ord, deps, combos, offs, key, radix: tot });
    });

    let total = 1n;
    units.forEach(u => { total *= u.radix; });

    // any set of picks -> the nearest valid set
    function normalize(p) {
      const v = {};
      for (const u of units) {
        if (u.free) {
          const n = u.free.o.length;
          const x = p[u.free.id] | 0;
          v[u.free.id] = (x >= 0 && x < n) ? x : 0;
          continue;

        }
        for (const c of u.ord.concat(u.deps)) {
          const al = allowed(c, v);
          v[c.id] = al.includes(p[c.id]) ? p[c.id] : al[0];
        }
      }
      return v;
    }

    // valid picks -> address
    function rank(v) {
      let n = 0n;
      for (const u of units) {
        let d;
        if (u.free) {
          d = BigInt(v[u.free.id]);
        } else {
          const ci = u.key[u.ord.map(c => v[c.id]).join(',')];
          let inner = 0n;
          for (const x of u.deps) {
            const al = allowed(x, v);
            inner = inner * BigInt(al.length);
            inner += BigInt(al.indexOf(v[x.id]));
          }
          d = u.offs[ci] + inner;
        }
        n = n * u.radix + d;
      }
      return n;
    }

    // address -> picks
    function unrank(n) {
      const v = {};
      for (let i = units.length - 1; i >= 0; i--) {
        const u = units[i];
        const d = n % u.radix;
        n /= u.radix;
        if (u.free) {
          v[u.free.id] = Number(d);
          continue;
        }
        let lo = 0;

        let hi = u.offs.length - 1;
        while (lo < hi) {
          const m = (lo + hi + 1) >> 1;
          if (u.offs[m] <= d) lo = m;
          else hi = m - 1;
        }
        u.ord.forEach((c, j) => { v[c.id] = u.combos[lo][j]; });
        let inner = d - u.offs[lo];
        for (let j = u.deps.length - 1; j >= 0; j--) {
          const x = u.deps[j];
          const al = allowed(x, v);
          const r = BigInt(al.length);
          v[x.id] = al[Number(inner % r)];
          inner /= r;
        }
      }
      return v;
    }

    return { total, units, allowed, normalize, rank, unrank };
  }

  // The three tests.
  // Expect roundTripBad 0, normalizeBad 0, edgesOk true.
  function testSpace(AX, S, N = 20000) {
    const rnd = () => {
      let n = 0n;
      for (let i = 0; i < 12; i++) {
        n = (n << 32n) + BigInt(Math.floor(Math.random() * 2 ** 32));
      }
      return n % S.total;
    };
    let a = 0;
    let b = 0;
    for (let i = 0; i < N; i++) {
      const n = rnd();
      const v = S.unrank(n);
      if (S.rank(v) !== n) a++;
      const w = S.normalize(v);
      for (const x of AX) if (w[x.id] !== v[x.id]) a++;
    }
    for (let i = 0; i < N; i++) {
      const p = {};

      for (const x of AX) {
        p[x.id] = Math.floor(Math.random() * x.o.length);
      }
      const v = S.normalize(p);
      const u = S.unrank(S.rank(v));
      for (const x of AX) if (u[x.id] !== v[x.id]) b++;
    }
    const last = S.total - 1n;
    const edges = S.rank(S.unrank(0n)) === 0n &&
    S.rank(S.unrank(last)) === last;
    return { roundTripBad: a, normalizeBad: b, edgesOk: edges };
  }
  /*ENGINE-END*/

  const SPACE = buildSpace(AXES);
  const BY = {};
  AXES.forEach((a, i) => { a.i = i; BY[a.id] = a; });

  const api = { VERSION, DIST, AXES, BY, SPACE, buildSpace, testSpace };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FS_SPACE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
