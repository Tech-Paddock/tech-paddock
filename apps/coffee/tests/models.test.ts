import { describe, expect, it } from "vitest";
import { SEARCH_MODELS, MODEL_LABELS, DEFAULT_SEARCH_MODEL, DEFAULT_EFFORT, effortsFor, isEffortFor, isSearchModel, type SearchModel } from "@/lib/models";

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

  it("offers no effort level for Haiku 4.5, which rejects the parameter", () => {
    // Not a preference. `output_config.effort` is a 400 on this model, so an
    // empty list is the honest answer and the toggle has to respect it.
    expect(effortsFor("claude-haiku-4-5")).toEqual([]);
    for (const level of ["low", "medium", "high", "xhigh", "max"]) {
      expect(isEffortFor("claude-haiku-4-5", level), level).toBe(false);
    }
  });

  it("offers xhigh only on the model that has it", () => {
    // xhigh arrived a generation after Sonnet 4.6, so offering it there would
    // be a 400 raised by a dropdown.
    expect(isEffortFor("claude-sonnet-5", "xhigh")).toBe(true);
    expect(isEffortFor("claude-sonnet-4-6", "xhigh")).toBe(false);
    expect(isEffortFor("claude-sonnet-4-6", "max")).toBe(true);
  });

  it("refuses a level no model has", () => {
    for (const model of Object.keys(SEARCH_MODELS) as SearchModel[]) {
      expect(isEffortFor(model, "highest"), model).toBe(false);
      expect(isEffortFor(model, ""), model).toBe(false);
      expect(isEffortFor(model, null), model).toBe(false);
    }
  });

  it("defaults to a level every effort-capable model accepts", () => {
    for (const model of Object.keys(SEARCH_MODELS) as SearchModel[]) {
      if (effortsFor(model).length === 0) continue;
      expect(isEffortFor(model, DEFAULT_EFFORT), model).toBe(true);
    }
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
