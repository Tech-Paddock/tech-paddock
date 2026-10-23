import { describe, expect, it } from "vitest";
import * as models from "@/lib/models";

describe("the one model", () => {
  it("is Claude Sonnet 5.5 at effort medium (TEC-133)", () => {
    // Changing either is the owner's call; this test changes with it.
    expect(models.MODEL).toBe("claude-sonnet-5-5");
    expect(models.EFFORT).toBe("medium");
  });

  it("uses the dynamic-filtering web tools, which Sonnet 5.5 supports", () => {
    expect(models.WEB_SEARCH_TOOL).toBe("web_search_20260209");
    expect(models.WEB_FETCH_TOOL).toBe("web_fetch_20260209");
  });

  it("exports no registry to pick from", () => {
    // The picker and the effort dial derived from these. Their return would
    // be a choice again.
    for (const gone of ["SEARCH_MODELS", "DEFAULT_SEARCH_MODEL", "DEFAULT_EFFORT", "MODEL_LABELS", "effortsFor", "isEffortFor", "isSearchModel"]) {
      expect(models, gone).not.toHaveProperty(gone);
    }
  });

  it("still names the models older rows recorded", () => {
    // A bag keeps its guide_model and a suggestion its model; the page names
    // them as they were.
    expect(models.modelLabel("claude-sonnet-5-5")).toBe("Sonnet 5.5");
    expect(models.modelLabel("claude-sonnet-5")).toBe("Sonnet 5");
    expect(models.modelLabel("claude-haiku-4-5")).toBe("Haiku 4.5");
    expect(models.modelLabel("claude-something-new")).toBe("claude-something-new");
  });
});
