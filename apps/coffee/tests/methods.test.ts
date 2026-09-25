import { describe, expect, it } from "vitest";
import { normalizeMethod, isBrewMethod, BREW_METHODS } from "@/lib/methods";

describe("normalizeMethod", () => {
  it("maps a roaster's wording onto the vocabulary", () => {
    expect(normalizeMethod("Hario V60")).toBe("v60");
    expect(normalizeMethod("Brewed on a Chemex")).toBe("chemex");
    expect(normalizeMethod("AeroPress")).toBe("aeropress");
    expect(normalizeMethod("Kalita Wave 185")).toBe("kalita");
  });

  it("does not let a generic word swallow a specific method", () => {
    // "press" appears in both, and filter language appears alongside most
    // pour-over recipes — the specific match has to win.
    expect(normalizeMethod("French press")).toBe("french-press");
    expect(normalizeMethod("Cold brew, 18 hours")).toBe("cold-brew");
    expect(normalizeMethod("Espresso — 18g in, 36g out")).toBe("espresso");
  });

  it("falls back to v60 only for unqualified filter language", () => {
    expect(normalizeMethod("Pour Over")).toBe("v60");
    expect(normalizeMethod("pourover")).toBe("v60");
  });

  it("does not round wording that names no brewer to Batch or a V60", () => {
    // "brewer" and "machine" used to mean Batch, and bare "drip" a V60, so
    // both of these were placed on the roaster's behalf when neither says
    // which brewer. Something said and unplaceable is "other".
    expect(normalizeMethod("any pour-over brewer")).toBe("other");
    expect(normalizeMethod("drip coffee maker")).toBe("other");
    expect(normalizeMethod("Brew on whatever you have")).toBe("other");
  });

  it("still places named batch brewing, and a named brewer beside generic words", () => {
    expect(normalizeMethod("Batch brew, 60g per litre")).toBe("batch");
    expect(normalizeMethod("Auto-drip")).toBe("batch");
    expect(normalizeMethod("Hario V60 brewer")).toBe("v60");
    expect(normalizeMethod("Espresso machine")).toBe("espresso");
  });

  it("distinguishes unrecognizable text from no text", () => {
    // "other" means they said something we couldn't place, which is worth
    // storing; null means they said nothing, which is not.
    expect(normalizeMethod("Brew it however you like")).toBe("other");
    expect(normalizeMethod("")).toBeNull();
    expect(normalizeMethod(null)).toBeNull();
    expect(normalizeMethod(undefined)).toBeNull();
  });

  it("only accepts vocabulary values", () => {
    for (const m of BREW_METHODS) expect(isBrewMethod(m)).toBe(true);
    expect(isBrewMethod("V60")).toBe(false);
    expect(isBrewMethod("percolator")).toBe(false);
    expect(isBrewMethod(null)).toBe(false);
  });
});
