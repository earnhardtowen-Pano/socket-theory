/**
 * The finish catalogue — the classes, and the two silvers.
 *
 * The point of the file under test is that nothing else has to guess, so these
 * are mostly about what happens to a name the catalogue has never seen.
 */

import { describe, expect, it } from "vitest";
import { CATALOGUE, UNPAINTED, finishOf, finishesOfClass } from "../src/index.js";

describe("finishes", () => {
  it("has two silvers, and they are not the same silver", () => {
    const skin = CATALOGUE["body-in-white"]!;
    const structure = CATALOGUE["chassis"]!;
    expect(skin.surfaceClass).toBe("skin");
    expect(structure.surfaceClass).toBe("structure");
    expect(skin.color).not.toBe(structure.color);
    // Structure is darker and matte: a chassis that reads like a painted panel
    // is the "one streamlined blob" this exists to prevent.
    expect(structure.rough).toBeGreaterThan(skin.rough);
    expect(structure.coat).toBeLessThan(skin.coat);
  });

  it("makes glazing the only class that is not opaque", () => {
    for (const k of Object.values(CATALOGUE)) {
      if (k.surfaceClass === "glazing") expect(k.opacity).toBeLessThan(1);
      else expect(k.opacity).toBe(1);
    }
  });

  it("gives the greenhouse a class of its own", () => {
    const glass = finishesOfClass("glazing").map((k) => k.name).sort();
    expect(glass).toEqual(["backlight", "side glass", "windscreen"]);
  });

  it("falls back to unpainted skin for a name it has never seen", () => {
    expect(finishOf("Glasgow Grey")).toEqual(UNPAINTED);
    expect(finishOf("Glasgow Grey").surfaceClass).toBe("skin");
  });

  it("keeps an unknown name's own colour, and only falls back on the class", () => {
    // A car that names its paint something new should still come out that
    // colour. Only the physics falls back, never the decision.
    const k = finishOf("Glasgow Grey", "#5a6470");
    expect(k.color).toBe("#5a6470");
    expect(k.name).toBe("Glasgow Grey");
    expect(k.surfaceClass).toBe("skin");
    expect(k.rough).toBe(UNPAINTED.rough);
  });

  it("does not sniff substrings — a paint named for glass is still paint", () => {
    // The renderer used to ask "does the name contain 'glass'?". This is that
    // bug, written down so it cannot come back.
    expect(finishOf("Sea Glass Green", "#8fb3a0").surfaceClass).toBe("skin");
    expect(CATALOGUE["side glass"]!.surfaceClass).toBe("glazing");
  });

  it("keys every entry by its own name", () => {
    for (const [key, k] of Object.entries(CATALOGUE)) expect(k.name).toBe(key);
  });
});
