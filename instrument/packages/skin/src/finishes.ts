/**
 * Finishes — what a surface IS, not just what colour it is.
 *
 * `assign-material` carries a name and a colour and nothing else, and that was
 * enough while nothing looked at the answer. The moment a renderer did, it had
 * to guess: it sniffed substrings out of the name — "does it contain 'glass'?"
 * — and a car whose paint happened to be called "Glasgow Grey" would have been
 * rendered as a window. A guess in the renderer is a guess in the picture.
 *
 * So the classes live here, once, and everything reads them from one place.
 *
 * WHY A CLASS AND NOT JUST A ROUGHNESS. Because the class answers questions a
 * BRDF cannot. Which panels are structure and which are skin — so a body does
 * not read as one streamlined blob with a chassis somewhere inside it. Which
 * are glazing — so the greenhouse can be checked for conforming to the body
 * rather than leaning against it. Which are tyre, so a mass ledger can find
 * the unsprung. The finish parameters ride along because they are a property
 * of the same decision.
 *
 * THE TWO SILVERS are the defaults, and they are two on purpose:
 *
 *   body-in-white   a skin panel nobody has painted yet — light, coated
 *   chassis         structure — darker, matte, and unmistakably not skin
 *
 * A car with neither assigned renders as one grey object, which is exactly
 * the failure this exists to stop. The unpainted skin is what a panel LOOKS
 * like before a colour decision; the chassis silver is what steel looks like
 * when nobody has decided anything about it because there is nothing to
 * decide.
 *
 * ADDING ONE. Put it in CATALOGUE with its class. Do not invent a class: the
 * six are the ones the tool can do something different with, and a seventh
 * that nothing branches on is a comment pretending to be data.
 *
 * WHY HERE AND NOT IN @car/types, WHERE IT STARTED. Because @car/types is a
 * LICENSED package and a roughness is not a claim about the world. It went
 * there first and the honesty police threw thirty-three violations at it,
 * every one of them correct: `assumed(0.82, "ratio", ...)` on a clearcoat
 * would say nothing true and would bury the numbers in that package that
 * genuinely ARE assumptions. Same split @car/skin's own header describes —
 * arithmetic and vocabulary here, claims next door.
 */

/** What a surface is. Six, because the tool treats six differently. */
export type SurfaceClass =
  | "skin"        // the outer panels — the thing being designed
  | "structure"   // rails, crossmembers, pillars, the tunnel: what carries load
  | "glazing"     // screen, backlight, side glass — TERTIARY, and must conform
  | "trim"        // interior, undertray, seals: present, not styled
  | "tyre"
  | "wheel";

export interface Finish {
  readonly name: string;
  /** sRGB hex, with the hash. */
  readonly color: string;
  readonly surfaceClass: SurfaceClass;
  /** 0 mirror, 1 matte. */
  readonly rough: number;
  /** 0 dielectric, 1 metal. */
  readonly metal: number;
  /** How much clearcoat sits over it. Paint 1, bare structure 0. */
  readonly coat: number;
  /** 1 opaque. Only glazing is below it. */
  readonly opacity: number;
}

const f = (
  name: string, color: string, surfaceClass: SurfaceClass,
  rough: number, metal: number, coat: number, opacity = 1,
): Finish => ({ name, color, surfaceClass, rough, metal, coat, opacity });

/**
 * The standard finishes, by name. A car may assign any name it likes; one that
 * is not here falls back to unpainted skin, which is visible as a decision
 * nobody made rather than as a silent default paint.
 */
export const CATALOGUE: Readonly<Record<string, Finish>> = {
  // ── the two silvers ──────────────────────────────────────────────────────
  "body-in-white": f("body-in-white", "#c9ccd0", "skin", 0.55, 0.55, 0.35),
  "chassis": f("chassis", "#7e838a", "structure", 0.78, 0.85, 0.0),

  // ── skin ─────────────────────────────────────────────────────────────────
  "Classic Red": f("Classic Red", "#a8202b", "skin", 0.82, 1.0, 1.0),
  "Brilliant Black": f("Brilliant Black", "#101114", "skin", 0.80, 1.0, 1.0),
  "Crystal White": f("Crystal White", "#e8e9ea", "skin", 0.84, 0.55, 1.0),
  "body panel": f("body panel", "#8d1b24", "skin", 0.82, 1.0, 1.0),

  // ── structure ────────────────────────────────────────────────────────────
  "screen frame": f("screen frame", "#8e9196", "structure", 0.42, 0.9, 0.25),
  "roll hoop": f("roll hoop", "#6f747b", "structure", 0.55, 0.9, 0.0),

  // ── glazing: tertiary, and the only class that is not opaque ─────────────
  "windscreen": f("windscreen", "#2a3338", "glazing", 0.03, 0.05, 0.5, 0.24),
  "backlight": f("backlight", "#232b30", "glazing", 0.03, 0.05, 0.5, 0.22),
  "side glass": f("side glass", "#252d33", "glazing", 0.03, 0.05, 0.5, 0.24),

  // ── trim ─────────────────────────────────────────────────────────────────
  "cockpit trim": f("cockpit trim", "#232428", "trim", 0.92, 0.0, 0.0),
  "undertray": f("undertray", "#17181a", "trim", 0.97, 0.0, 0.0),
  "folding top": f("folding top", "#26262a", "trim", 0.95, 0.0, 0.0),

  // ── the corners ──────────────────────────────────────────────────────────
  "185/60R14": f("185/60R14", "#131315", "tyre", 0.88, 0.0, 0.12),
  "alloy": f("alloy", "#b9bdc2", "wheel", 0.30, 1.0, 0.0),
};

/** The fallback: an unpainted skin panel. */
export const UNPAINTED: Finish = CATALOGUE["body-in-white"]!;

/**
 * The finish a material name wears.
 *
 * An unknown name is unpainted skin AND KEEPS ITS OWN COLOUR — a car that
 * names its paint something this file has never heard of should still come out
 * that colour; only the class and the surface parameters fall back.
 */
export function finishOf(name: string, color?: string): Finish {
  const known = CATALOGUE[name];
  if (known) return known;
  return color === undefined ? UNPAINTED : { ...UNPAINTED, name, color };
}

/** Everything in one class, for a lens or a view that wants only structure. */
export function finishesOfClass(surfaceClass: SurfaceClass): Finish[] {
  return Object.values(CATALOGUE).filter((k) => k.surfaceClass === surfaceClass);
}
