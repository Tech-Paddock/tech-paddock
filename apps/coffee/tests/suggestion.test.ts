import { describe, expect, it } from "vitest";
import { coerceSuggestion, suggestionColumns, SUGGESTION_FIELDS } from "../lib/suggestion";

const AT = new Date("2026-09-19T12:00:00.000Z");

describe("coerceSuggestion", () => {
  it("keeps the parameters and the reasoning, and records what made it", () => {
    const suggestion = coerceSuggestion(
      {
        method: "Hario V60",
        params: { ratio: "1:16", dose: "18 g", water: "288 g", temp: "94°C", grind: "medium-fine", time: "2:45" },
        rationale: "A washed Ethiopian takes a slightly finer grind than the house ratio.",
      },
      "claude-sonnet-5",
      AT
    );

    expect(suggestion).toEqual({
      method: "v60",
      params: { ratio: "1:16", dose: "18 g", water: "288 g", temp: "94°C", grind: "medium-fine", time: "2:45" },
      rationale: "A washed Ethiopian takes a slightly finer grind than the house ratio.",
      model: "claude-sonnet-5",
      generated_at: "2026-09-19T12:00:00.000Z",
    });
  });

  // This is the rule the feature lives on. A suggestion has no page behind it,
  // so anything shaped like evidence of one is dropped rather than carried —
  // the format this app proves honesty with must not be available to the one
  // thing that was invented.
  it("drops anything that would pass a suggestion off as something read", () => {
    const suggestion = coerceSuggestion(
      {
        method: "v60",
        params: { ratio: "1:16" },
        status: "coffee_specific",
        product_url: "https://roaster.example/coffee",
        guide_url: "https://roaster.example/brew",
        quotes: [{ field: "ratio", text: "Use 1:16.", url: "https://roaster.example/brew" }],
      },
      "claude-sonnet-5",
      AT
    );

    expect(suggestion).not.toBeNull();
    expect(Object.keys(suggestion!).sort()).toEqual(["generated_at", "method", "model", "params", "rationale"]);
  });

  // The same vocabulary and the same distinction the roaster's own method
  // gets: "other" is a method we could not place, null is no method at all,
  // and neither is rounded to the nearest thing that looks close.
  it("places a method on the shared vocabulary, or says it could not", () => {
    expect(coerceSuggestion({ method: "Hario V60 02" }, "m", AT)?.method).toBe("v60");
    expect(coerceSuggestion({ method: "siphon", params: { ratio: "1:17" } }, "m", AT)?.method).toBe("other");
    expect(coerceSuggestion({ method: "  ", params: { ratio: "1:17" } }, "m", AT)?.method).toBeNull();
  });

  it("is nothing when there is nothing usable, rather than an empty recipe", () => {
    expect(coerceSuggestion({ params: {}, rationale: "It depends." }, "m", AT)).toBeNull();
    expect(coerceSuggestion({ params: { ratio: "  " } }, "m", AT)).toBeNull();
    expect(coerceSuggestion(null, "m", AT)).toBeNull();
    expect(coerceSuggestion("1:16", "m", AT)).toBeNull();
  });

  it("keeps only the fields it names", () => {
    const suggestion = coerceSuggestion(
      { method: "v60", params: Object.fromEntries([...SUGGESTION_FIELDS, "my_rating"].map((f) => [f, "x"])) },
      "m",
      AT
    );
    expect(Object.keys(suggestion!.params).sort()).toEqual([...SUGGESTION_FIELDS].sort());
  });
});

describe("suggestionColumns", () => {
  // The only way a suggestion reaches the database, so a widening mistake has
  // to pass through here. Checked rather than trusted, because the failure it
  // prevents — a generated number in a guide_* column — is silent and
  // permanent once a row carries it.
  it("can only ever write suggested_* columns", () => {
    for (const columns of [
      suggestionColumns(coerceSuggestion({ method: "v60" }, "m", AT)),
      suggestionColumns(null, "The generation failed."),
      suggestionColumns(null),
    ]) {
      expect(Object.keys(columns).every((k) => k.startsWith("suggested_"))).toBe(true);
    }
  });

  it("records a failure as a failure, not as a bag with no suggestion", () => {
    expect(suggestionColumns(null, "overloaded")).toEqual({ suggested_recipe: null, suggested_error: "overloaded" });
    expect(suggestionColumns(null)).toEqual({ suggested_recipe: null, suggested_error: null });
  });
});
