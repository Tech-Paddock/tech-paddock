import { describe, expect, it } from "vitest";
import { MY_BREWERS, MY_BREWER_LABELS, isMyBrewer, myBrewerFor, DEFAULT_GRINDER, GRINDERS } from "@/lib/brewers";
import { normalizeMethod } from "@/lib/methods";

describe("your brewers", () => {
  it("is the five on the shelf and nothing else", () => {
    expect([...MY_BREWERS]).toEqual(["v60-02", "v60-switch", "kalita-wave", "cold-brew", "aeropress"]);
    for (const b of MY_BREWERS) expect(MY_BREWER_LABELS[b]).toBeTruthy();
  });

  it("refuses a brewer you do not own", () => {
    // The roaster's vocabulary is broader on purpose, so its values must not
    // pass validation on your side of the table.
    for (const bad of ["chemex", "espresso", "origami", "v60", "", null, 3]) {
      expect(isMyBrewer(bad), String(bad)).toBe(false);
    }
    expect(isMyBrewer("v60-02")).toBe(true);
  });
});

describe("myBrewerFor", () => {
  it("carries the roaster's brewer across only where you own the same thing", () => {
    expect(myBrewerFor("kalita")).toBe("kalita-wave");
    expect(myBrewerFor("aeropress")).toBe("aeropress");
    expect(myBrewerFor("cold-brew")).toBe("cold-brew");
  });

  it("leaves a bare V60 for you to choose, because you own two", () => {
    // The roaster said V60. You have an 02 and a Switch, and they brew
    // differently — picking one on their authority would be inventing.
    expect(myBrewerFor("v60")).toBeNull();
  });

  it("does not round a brewer you lack to the nearest one you have", () => {
    // Sweet Bloom publishes on Origami. Defaulting that to a V60 because it
    // is also a cone is the same species of guess this tool refuses about
    // brewing parameters.
    for (const theirs of ["origami", "chemex", "espresso", "french-press", "moka", "batch", "other", null, undefined]) {
      expect(myBrewerFor(theirs), String(theirs)).toBeNull();
    }
  });
});

describe("the roaster's vocabulary stays broad", () => {
  it("places Origami, which every bag in the library actually uses", () => {
    // All three bags came back "other" before this alias existed — correctly,
    // since ORIGAMI AIR was unplaceable rather than a V60 in disguise.
    expect(normalizeMethod("ORIGAMI AIR")).toBe("origami");
  });

  it("still places what it always placed", () => {
    expect(normalizeMethod("Hario V60")).toBe("v60");
    expect(normalizeMethod("french press")).toBe("french-press");
    expect(normalizeMethod("Chemex")).toBe("chemex");
  });

  it("keeps saying 'other' for something it cannot place, and null for silence", () => {
    expect(normalizeMethod("brewed in a sock")).toBe("other");
    expect(normalizeMethod("")).toBeNull();
    expect(normalizeMethod(null)).toBeNull();
  });
});

describe("grinders", () => {
  it("defaults to the one on the shelf", () => {
    expect(GRINDERS).toContain(DEFAULT_GRINDER);
    expect(DEFAULT_GRINDER).toBe("Fellow Ode 2");
  });
});
