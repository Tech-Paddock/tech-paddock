import { describe, expect, it } from "vitest";
import { requestShape } from "@/lib/models";
import { fetchOutcomes, unfetchedRead } from "@/lib/fetchRun";
import { idForNumber } from "@/lib/anthropic";

/**
 * What each model's request has to carry, and the import's third refusal.
 * No API call is made anywhere in this file.
 */

const schema = { type: "object" };

describe("requestShape (TEC-29 item 7)", () => {
  it("never sends effort to Haiku, which rejects it with a 400", () => {
    const shape = requestShape("claude-haiku-4-5", { maxTokens: 2048, effort: "medium", schema });
    expect(shape.max_tokens).toBe(2048);
    expect(shape.output_config).toEqual({ format: { type: "json_schema", schema } });
    expect(JSON.stringify(shape)).not.toContain("effort");
  });

  it("sends Haiku no output_config at all when there is no schema", () => {
    expect(requestShape("claude-haiku-4-5", { maxTokens: 4096, effort: "low" })).toEqual({ max_tokens: 4096 });
  });

  it("gives Sonnet 5 an explicit effort and room to think before it answers", () => {
    const shape = requestShape("claude-sonnet-5", { maxTokens: 2048, effort: "medium", schema });
    expect(shape.output_config).toEqual({ effort: "medium", format: { type: "json_schema", schema } });
    expect(shape.max_tokens).toBeGreaterThan(2048 + 8000);
  });
});

describe("an import that never fetched the page (TEC-29 item 6)", () => {
  const page = { type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: "https://x" } };
  const failed = { type: "web_fetch_tool_result", content: { type: "web_fetch_tool_error", error_code: "url_not_accessible" } };
  const text = { type: "text" };

  it("is refused when no fetch was made — a recipe written from the slug", () => {
    expect(unfetchedRead([text])).toContain("never fetched");
  });

  it("is refused when every fetch failed, and says why", () => {
    expect(unfetchedRead([failed, text])).toContain("url_not_accessible");
  });

  it("passes when a fetch returned a page, whatever else failed", () => {
    expect(unfetchedRead([failed, page, text])).toBeNull();
    expect(fetchOutcomes([failed, page])).toEqual({ fetched: 1, errors: ["url_not_accessible"] });
  });
});

describe("tidy's short line numbers (TEC-29 item 8)", () => {
  const items = [{ id: "uuid-a" }, { id: "uuid-b" }];

  it("map back to the ids they stand for", () => {
    expect(idForNumber(items, 1)).toBe("uuid-a");
    expect(idForNumber(items, "2")).toBe("uuid-b");
  });

  it("map a number that names no line to something validateTidy refuses", () => {
    expect(idForNumber(items, 3)).not.toMatch(/^uuid/);
    expect(idForNumber(items, 0)).not.toMatch(/^uuid/);
    expect(idForNumber(items, 1.5)).not.toMatch(/^uuid/);
  });
});
