import { describe, expect, it } from "vitest";
import {
  percentToPpm,
  ppmToPercent,
  extractionYield,
  band,
  blankBrew,
  repeatOf,
  waterFor,
  ratioFor,
  withDose,
  withRatio,
  withWater,
  parseGrams,
  parseRatio,
  fromGuide,
  openingBrew,
  parseBrewTime,
  formatBrewTime,
  formatGrindSetting,
  TDS_TARGET,
  YIELD_TARGET,
} from "@/lib/brews";
import { DEFAULT_GRINDER } from "@/lib/brewers";

describe("TDS units", () => {
  it("converts both ways around one number", () => {
    expect(percentToPpm(1.38)).toBe(13800);
    expect(ppmToPercent(13800)).toBe(1.38);
    expect(percentToPpm(1)).toBe(10000);
  });

  it("round-trips without drifting", () => {
    // The two units are stored as one value and derived, so a reading that
    // survives a round trip is the point rather than a nicety.
    for (const pct of [0.8, 1.15, 1.35, 1.38, 2.05]) {
      expect(ppmToPercent(percentToPpm(pct))).toBe(pct);
    }
  });
});

describe("extractionYield", () => {
  it("computes the Sweet Bloom example", () => {
    // 18.5g in, ~280g in the cup, 1.38% TDS.
    expect(extractionYield({ doseG: 18.5, beverageG: 280, tdsPercent: 1.38 })).toBe(20.89);
  });

  it("answers null when any measurement is missing", () => {
    // A partial brew is not a yield of zero. It is not a yield.
    expect(extractionYield({ doseG: 18.5, beverageG: 280, tdsPercent: null })).toBeNull();
    expect(extractionYield({ doseG: null, beverageG: 280, tdsPercent: 1.38 })).toBeNull();
    expect(extractionYield({ doseG: 18.5, beverageG: null, tdsPercent: 1.38 })).toBeNull();
  });

  it("refuses nonsense rather than dividing by zero", () => {
    expect(extractionYield({ doseG: 0, beverageG: 280, tdsPercent: 1.38 })).toBeNull();
    expect(extractionYield({ doseG: -5, beverageG: 280, tdsPercent: 1.38 })).toBeNull();
  });

  it("shows why beverage mass is not water in", () => {
    // Same brew, measured off the kettle instead of the cup: 305g rather than
    // the ~280g that reaches the glass. It reads as over-extracted while the
    // coffee has not changed at all.
    const fromCup = extractionYield({ doseG: 18.5, beverageG: 280, tdsPercent: 1.38 })!;
    const fromKettle = extractionYield({ doseG: 18.5, beverageG: 305, tdsPercent: 1.38 })!;
    expect(band(fromCup, YIELD_TARGET)).toBe("in");
    expect(band(fromKettle, YIELD_TARGET)).toBe("over");
  });
});

describe("band", () => {
  it("places a reading against the target window", () => {
    expect(band(1.05, TDS_TARGET)).toBe("under");
    expect(band(1.25, TDS_TARGET)).toBe("in");
    expect(band(1.5, TDS_TARGET)).toBe("over");
    expect(band(null, TDS_TARGET)).toBeNull();
  });

  it("counts the boundaries as inside", () => {
    expect(band(YIELD_TARGET.low, YIELD_TARGET)).toBe("in");
    expect(band(YIELD_TARGET.high, YIELD_TARGET)).toBe("in");
  });
});

describe("repeatOf", () => {
  const previous = {
    brewer: "v60-switch",
    brew_method: "45s bloom, two pours",
    grinder: "Fellow Ode 2",
    grind_setting: "4.5",
    dose_g: "18.50",
    beverage_g: "280.00",
    tds_percent: "1.38",
    rating: 4,
    notes: "Jammy, slightly hollow at the end.",
  };

  it("carries the settings forward", () => {
    expect(repeatOf(previous)).toMatchObject({
      brewer: "v60-switch",
      brew_method: "45s bloom, two pours",
      grinder: "Fellow Ode 2",
      grind_setting: "4.5",
      // The fixture's "18.50" is how Postgres returns numeric(6,2); the form
      // shows the number you typed.
      dose_g: "18.5",
    });
  });

  it("carries no reading forward", () => {
    // The whole reason the settings repeat is so one change at a time is
    // legible. A reading that repeated would describe a cup nobody poured —
    // and beverage mass and TDS both feed the generated extraction yield.
    const draft = repeatOf(previous);
    expect(draft.beverage_g).toBe("");
    expect(draft.notes).toBe("");
    expect(draft).not.toHaveProperty("tds_percent");
    expect(draft).not.toHaveProperty("rating");
  });

  it("is a blank form when there is no previous brew", () => {
    expect(repeatOf(null)).toEqual(blankBrew());
    expect(repeatOf(undefined)).toEqual(blankBrew());
  });

  it("keeps the default grinder when the last brew recorded none", () => {
    // A brew logged without a grinder says nothing about which one is on the
    // counter, and there is only one.
    expect(repeatOf({ ...previous, grinder: null }).grinder).toBe(DEFAULT_GRINDER);
  });

  it("stringifies a numeric dose, because the form holds strings", () => {
    expect(repeatOf({ dose_g: 18.5 }).dose_g).toBe("18.5");
    expect(repeatOf({ dose_g: null }).dose_g).toBe("");
  });

  it("shows a stored measurement the way it was typed, not the way it was stored", () => {
    // Postgres hands numeric(6,2) back with its scale, so the row says
    // "18.00". A repeated brew should open on 18, which is what you typed.
    expect(repeatOf({ dose_g: "18.00" }).dose_g).toBe("18");
    expect(repeatOf({ dose_g: "18.00", water_g: "306.00" })).toMatchObject({
      dose_g: "18",
      water_g: "306",
      ratio: "17",
    });
    expect(repeatOf({ dose_g: "18.50" }).dose_g).toBe("18.5");
  });

  it("starts blank with the grinder already chosen", () => {
    expect(blankBrew().grinder).toBe(DEFAULT_GRINDER);
    expect(blankBrew().brewer).toBe("");
  });
});

describe("ratio and water", () => {
  it("turns a ratio into water at a dose", () => {
    expect(waterFor(18, 17)).toBe(306);
    expect(waterFor(15, 16)).toBe(240);
  });

  it("turns water into a ratio at a dose", () => {
    expect(ratioFor(18, 306)).toBe(17);
  });

  it("rounds the ratio to a whole number", () => {
    // Joel, 2026-09-20: "Whole numbers only for recipe." 1:17 is what you
    // brew to; 1:16.7 is a description of what the scale happened to say.
    expect(ratioFor(18, 300)).toBe(17);
    expect(ratioFor(20, 290)).toBe(15);
  });

  it("is null wherever a number is missing or not a number", () => {
    expect(waterFor(null, 17)).toBeNull();
    expect(waterFor(18, null)).toBeNull();
    expect(waterFor(0, 17)).toBeNull();
    expect(ratioFor(18, 0)).toBeNull();
    expect(ratioFor(-18, 300)).toBeNull();
  });

  it("rounds water to whole grams, because that is what a scale resolves", () => {
    expect(waterFor(18, 16.7)).toBe(301);
  });
});

describe("editing the three linked fields", () => {
  const base = { ...blankBrew(), dose_g: "18", ratio: "17", water_g: "306" };

  it("holds the ratio when the dose changes, and moves the water", () => {
    // Scaling a recipe is the whole reason to brew to a ratio: the strength
    // stays and the water follows.
    expect(withDose(base, "20")).toMatchObject({ dose_g: "20", ratio: "17", water_g: "340" });
  });

  it("re-derives the ratio when the dose changes and no ratio was set", () => {
    const noRatio = { ...blankBrew(), water_g: "300" };
    expect(withDose(noRatio, "20")).toMatchObject({ water_g: "300", ratio: "15" });
  });

  it("moves the water when the ratio changes", () => {
    expect(withRatio(base, "16")).toMatchObject({ ratio: "16", water_g: "288" });
  });

  it("moves the ratio when the water changes", () => {
    expect(withWater(base, "270")).toMatchObject({ water_g: "270", ratio: "15" });
  });

  it("keeps what was typed even when the other field cannot be computed", () => {
    const empty = blankBrew();
    expect(withRatio(empty, "17")).toMatchObject({ ratio: "17", water_g: "" });
    expect(withWater(empty, "300")).toMatchObject({ water_g: "300", ratio: "" });
    // Half-typed numbers must survive, or the field cannot be typed into.
    expect(withRatio(base, "1").ratio).toBe("1");
  });
});

describe("reading a roaster's own wording", () => {
  it("takes a mass out of the way roasters write one", () => {
    expect(parseGrams("18g")).toBe(18);
    expect(parseGrams("18 grams")).toBe(18);
    expect(parseGrams("300 g water")).toBe(300);
    expect(parseGrams("18-20g")).toBe(18);
  });

  it("refuses a string with a colon, which is a ratio or a time", () => {
    // Reading "1:17" as one gram of coffee is exactly the confident nonsense
    // this app exists not to produce.
    expect(parseGrams("1:17")).toBeNull();
    expect(parseGrams("2:40")).toBeNull();
  });

  it("is null for nothing, and for text carrying no number", () => {
    expect(parseGrams(null)).toBeNull();
    expect(parseGrams(undefined)).toBeNull();
    expect(parseGrams("to taste")).toBeNull();
  });

  it("divides a ratio rather than reading the second half off", () => {
    expect(parseRatio("1:17")).toBe(17);
    expect(parseRatio("1 : 16.5")).toBe(16.5);
    expect(parseRatio("60:1000")).toBe(16.7);
    expect(parseRatio("2:1")).toBe(0.5);
  });

  it("is null for a ratio that is not one", () => {
    expect(parseRatio(null)).toBeNull();
    expect(parseRatio("golden ratio")).toBeNull();
    expect(parseRatio("0:17")).toBeNull();
  });
});

describe("fromGuide", () => {
  it("takes the roaster's three numbers as they stand", () => {
    expect(fromGuide({ dose: "18g", water: "300g", ratio: "1:17" })).toEqual({
      dose_g: "18",
      water_g: "300",
      ratio: "17",
    });
  });

  it("derives the water from a ratio when they published only a ratio and a dose", () => {
    expect(fromGuide({ dose: "18g", ratio: "1:17" })).toEqual({
      dose_g: "18",
      water_g: "306",
      ratio: "17",
    });
  });

  it("keeps a lone ratio, so typing a dose fills the water", () => {
    // Sweet Bloom publish 1:17 and no dose. The ratio is still the thing they
    // decided, and it has to survive to the form for the dose to act on.
    expect(fromGuide({ ratio: "1:17" })).toEqual({ ratio: "17" });
  });

  it("is empty when the roaster published nothing usable", () => {
    expect(fromGuide(null)).toEqual({});
    expect(fromGuide({})).toEqual({});
    expect(fromGuide({ dose: "to taste" })).toEqual({});
  });
});

describe("openingBrew", () => {
  const previous = { brewer: "v60-02", dose_g: 18, water_g: 300 };
  const guide = { dose: "22g", water: "374g", ratio: "1:17" };

  it("prefers your last brew over what the roaster published", () => {
    // What you did on this bag is the dial-in; their number is where it
    // started. Overwriting yours would undo the last attempt every time.
    const { draft, source } = openingBrew(previous, guide);
    expect(draft).toMatchObject({ dose_g: "18", water_g: "300", ratio: "17" });
    expect(source).toBe("repeat");
  });

  it("falls back to the roaster field by field", () => {
    const { draft } = openingBrew({ brewer: "v60-02", dose_g: 18 }, { ratio: "1:17" });
    expect(draft.dose_g).toBe("18");
    // Their ratio filled the gap the repeat left, and the water follows from
    // your dose and their ratio together.
    expect(draft.ratio).toBe("17");
    expect(draft.water_g).toBe("306");
  });

  it("opens on the roaster's recipe for the first brew of a bag", () => {
    const { draft, source } = openingBrew(null, guide);
    expect(draft).toMatchObject({ dose_g: "22", water_g: "374", ratio: "17" });
    expect(source).toBe("guide");
  });

  it("is blank, and says so, when there is neither", () => {
    const { draft, source } = openingBrew(null, null);
    expect(draft).toEqual(blankBrew());
    expect(source).toBe("blank");
  });

  it("carries no reading from either source", () => {
    const { draft } = openingBrew({ ...previous, brewer: "v60-02" }, guide);
    expect(draft.beverage_g).toBe("");
    expect(draft.notes).toBe("");
  });
});

describe("brew time", () => {
  it("reads m:ss as whole seconds", () => {
    expect(parseBrewTime("3:00")).toBe(180);
    expect(parseBrewTime("2:45")).toBe(165);
    expect(parseBrewTime(" 0:30 ")).toBe(30);
    expect(parseBrewTime("12:05")).toBe(725);
  });

  it("refuses a bare number rather than guessing which unit it is", () => {
    // "3" is three minutes to one person and three seconds to another, and
    // nothing in the string settles it. This is the same refusal
    // lib/dates.ts makes about 05/06/2026.
    expect(parseBrewTime("3")).toBeNull();
    expect(parseBrewTime("180")).toBeNull();
  });

  it("refuses a seconds field that is not a seconds field", () => {
    expect(parseBrewTime("2:75")).toBeNull();
    expect(parseBrewTime("2:5")).toBeNull();
    expect(parseBrewTime("about 3:00")).toBeNull();
    expect(parseBrewTime("0:00")).toBeNull();
    expect(parseBrewTime("")).toBeNull();
    expect(parseBrewTime(null)).toBeNull();
  });

  it("writes whole seconds back as m:ss", () => {
    expect(formatBrewTime(180)).toBe("3:00");
    expect(formatBrewTime(165)).toBe("2:45");
    expect(formatBrewTime(30)).toBe("0:30");
    // Postgres hands an integer column back as a number, but a client that
    // stringifies it must not render "NaN:NaN".
    expect(formatBrewTime("725")).toBe("12:05");
  });

  it("has nothing to say about a brew that was not timed", () => {
    expect(formatBrewTime(null)).toBeNull();
    expect(formatBrewTime(undefined)).toBeNull();
    expect(formatBrewTime("")).toBeNull();
    expect(formatBrewTime(0)).toBeNull();
    expect(formatBrewTime("not a number")).toBeNull();
  });

  it("round-trips what was typed", () => {
    for (const text of ["3:00", "2:45", "0:15", "10:00"]) {
      expect(formatBrewTime(parseBrewTime(text))).toBe(text);
    }
  });

  it("does not carry into the next brew, because it is a reading", () => {
    // Settings repeat; readings do not. What gets logged here is what the
    // timer said, and repeating it would write down a stopwatch nobody
    // started — the same line beverage mass, TDS and rating already sit on.
    expect(repeatOf({ brewer: "v60-02", dose_g: 18, water_g: 306 }).time).toBe("");
    expect(openingBrew(null, { dose: "18g", ratio: "1:17" }).draft.time).toBe("");
  });
});

describe("grind setting", () => {
  it("rounds to one decimal place, because the dial is stepped in tenths", () => {
    expect(formatGrindSetting("4.5")).toBe("4.5");
    expect(formatGrindSetting("4.53")).toBe("4.5");
    expect(formatGrindSetting("4")).toBe("4.0");
    expect(formatGrindSetting("4.96")).toBe("5.0");
  });

  it("is blank for nothing, and passes non-numeric text through", () => {
    expect(formatGrindSetting(null)).toBe("");
    expect(formatGrindSetting(undefined)).toBe("");
    expect(formatGrindSetting("")).toBe("");
    expect(formatGrindSetting("  ")).toBe("");
    expect(formatGrindSetting("fine")).toBe("fine");
  });

  it("normalizes an unformatted setting on repeat", () => {
    expect(repeatOf({ grind_setting: "4" }).grind_setting).toBe("4.0");
    expect(repeatOf({ grind_setting: "4.5" }).grind_setting).toBe("4.5");
    expect(repeatOf({ grind_setting: null }).grind_setting).toBe("");
  });
});
