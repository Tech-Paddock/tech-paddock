import { describe, expect, it } from "vitest";
import { SEARCH_MODELS, MODEL_LABELS, DEFAULT_SEARCH_MODEL, isSearchModel, type SearchModel } from "@/lib/models";

describe("the search model registry", () => {
  it("refuses a model it does not know", () => {
    // A model name that falls through to a default would mean testing one
    // model and reading the results as another's.
    for (const bad of ["claude-opus-5", "haiku", "", null, undefined, 4]) {
      expect(isSearchModel(bad)).toBe(false);
    }
    expect(isSearchModel(DEFAULT_SEARCH_MODEL)).toBe(true);
  });

  it("carries a web search and fetch tool version for every model", () => {
    // The request shapes differ per model, and a missing tool type is a 400
    // at the moment someone picks that model rather than at build time.
    for (const [model, spec] of Object.entries(SEARCH_MODELS)) {
      expect(spec.search, model).toMatch(/^web_search_\d{8}$/);
      expect(spec.fetch, model).toMatch(/^web_fetch_\d{8}$/);
      expect(MODEL_LABELS[model as SearchModel], model).toBeTruthy();
    }
  });

  it("sends no effort to Haiku 4.5, which rejects it", () => {
    // Not a preference. `output_config.effort` is a 400 on this model, so the
    // registry is what stops the search route sending it.
    expect(SEARCH_MODELS["claude-haiku-4-5"].effort).toBeNull();
  });

  it("pairs the dynamic-filtering web tools only with models that have them", () => {
    // web_search_20260209 needs Sonnet 4.6 or better; Haiku 4.5 must stay on
    // the basic variant or the request fails.
    for (const [model, spec] of Object.entries(SEARCH_MODELS)) {
      if (model.startsWith("claude-haiku")) {
        expect(spec.search, model).toBe("web_search_20250305");
      } else {
        expect(spec.search, model).toBe("web_search_20260209");
      }
    }
  });
});
