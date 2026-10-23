import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as models from "@/lib/models";
import { fetchOutcomes, unfetchedRead } from "@/lib/fetchRun";
import { idForNumber } from "@/lib/anthropic";

/**
 * The one model and its request shape (TEC-133), and the import's third
 * refusal. No API call is made anywhere in this file; `anthropic.test.ts` reads
 * every request the app would actually send.
 */

const schema = { type: "object" };

describe("the one model (TEC-133)", () => {
  it("is Claude Sonnet 5.5 at effort medium", () => {
    // Changing either is the owner's call; this test changes with it.
    expect(models.MODEL).toBe("claude-sonnet-5-5");
    expect(models.EFFORT).toBe("medium");
    expect(models.WEB_FETCH_TOOL).toBe("web_fetch_20260209");
  });

  it("builds every request: the model, effort medium, and room to think", () => {
    const shape = models.requestShape({ maxTokens: 2048, schema });
    expect(shape.model).toBe("claude-sonnet-5-5");
    expect(shape.output_config).toEqual({ effort: "medium", format: { type: "json_schema", schema } });
    // Thinking counts against max_tokens; the JSON still needs its 2,048.
    expect(shape.max_tokens).toBeGreaterThanOrEqual(2048 + 8000);
    expect(models.requestShape({ maxTokens: 4096 }).output_config).toEqual({ effort: "medium" });
  });

  it("exports no registry to pick from", () => {
    // The pickers derived from these. Their return would be a choice again.
    for (const gone of ["MODELS", "MODEL_IDS", "DEFAULT_MODEL", "isModelId"]) {
      expect(models, gone).not.toHaveProperty(gone);
    }
  });

  it("still names the models older recipes recorded", () => {
    expect(models.modelLabel("claude-sonnet-5-5")).toBe("Sonnet 5.5");
    expect(models.modelLabel("claude-sonnet-5")).toBe("Sonnet 5");
    expect(models.modelLabel("claude-haiku-4-5")).toBe("Haiku 4.5");
    expect(models.modelLabel("claude-something-new")).toBe("claude-something-new");
    expect(models.isRecordedModel("claude-haiku-4-5")).toBe(true);
    expect(models.isRecordedModel("gpt-whatever")).toBe(false);
  });
});

describe("only lib/models.ts names a model or an effort", () => {
  const root = resolve(__dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name)) files.push(path);
    }
  };
  walk(join(root, "app"));
  walk(join(root, "lib"));
  const others = files.filter((f) => relative(root, f) !== join("lib", "models.ts"));

  it("finds the app's source", () => {
    expect(others.some((f) => f.endsWith(join("lib", "anthropic.ts")))).toBe(true);
  });

  it.each([
    ["a model id", /claude-(haiku|sonnet|opus)/],
    ["an effort", /\beffort\s*:/],
    ["a thinking setting", /\bthinking\s*:|budget_tokens/],
    ["a sampling parameter", /\b(temperature|top_p|top_k)\s*:/],
    ["a forced tool choice", /tool_choice/],
    ["a tool version", /web_(fetch|search)_\d{8}/],
  ])("no other file names %s", (_what, pattern) => {
    const hits = others.filter((f) => pattern.test(readFileSync(f, "utf8"))).map((f) => relative(root, f));
    expect(hits).toEqual([]);
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
