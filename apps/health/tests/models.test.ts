import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * One model everywhere (TEC-133): every request this app sends goes out as
 * Claude Sonnet 5.5 at effort `medium`, with nothing Sonnet 5.5 refuses.
 * Changing the model or the effort is the owner's call, and this file is the
 * test `CLAUDE.md` asks for. Invented food only.
 */

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: (...a: unknown[]) => create(...a) };
  },
}));

process.env.ANTHROPIC_API_KEY = "test-key-not-real";

import { parseDictation, estimateMacros } from "@/lib/anthropic";
import { MODEL, EFFORT, MODEL_SPEC, modelLabel } from "@/lib/models";

/** What Sonnet 5.5 returns a 400 for, or what would defeat the one-model rule. */
const REFUSED_TOP_LEVEL = ["thinking", "temperature", "top_p", "top_k", "tool_choice", "budget_tokens", "fallbacks", "betas"];

function assertOneModel(request: Record<string, unknown>) {
  expect(request.model).toBe("claude-sonnet-5-5");
  expect(request.output_config).toEqual({ effort: "medium" });
  for (const key of REFUSED_TOP_LEVEL) expect(request).not.toHaveProperty(key);
  // No prefill: the request a turn starts from ends with the user.
  const messages = request.messages as { role: string }[];
  expect(messages[0].role).toBe("user");
}

const reply = (content: unknown[], stop_reason = "end_turn") => ({ content, stop_reason });

beforeEach(() => create.mockReset());

describe("the registry", () => {
  it("is Sonnet 5.5 at medium, with the tool versions that model takes", () => {
    expect(MODEL).toBe("claude-sonnet-5-5");
    expect(EFFORT).toBe("medium");
    expect(MODEL_SPEC.search).toBe("web_search_20260209");
    expect(MODEL_SPEC.fetch).toBe("web_fetch_20260209");
  });

  it("still names the models past lines recorded", () => {
    expect(modelLabel("claude-haiku-4-5")).toBe("Haiku 4.5");
    expect(modelLabel("claude-sonnet-5")).toBe("Sonnet 5");
    expect(modelLabel("claude-sonnet-5-5")).toBe("Sonnet 5.5");
    expect(modelLabel("some-unknown-model")).toBe("some-unknown-model");
  });
});

describe("the parse", () => {
  it("goes out as Sonnet 5.5 at medium, with nothing it refuses", async () => {
    create.mockResolvedValue(reply([
      { type: "thinking", thinking: "" },
      { type: "text", text: '{"meal":"lunch","items":[{"name":"Oat bar","quantity":1}]}' },
    ]));
    const parsed = await parseDictation({ text: "an oat bar", hour: 12 });
    expect(parsed.items).toEqual([{ name: "Oat bar", quantity: 1 }]);
    expect(create).toHaveBeenCalledTimes(1);
    const request = create.mock.calls[0][0];
    assertOneModel(request);
    expect(request).not.toHaveProperty("tools");
  });

  it("a refusal fails loudly instead of reading as no items", async () => {
    create.mockResolvedValue(reply([], "refusal"));
    await expect(parseDictation({ text: "an oat bar", hour: 12 })).rejects.toThrow(/refusal/);
  });
});

describe("the estimate", () => {
  const answer = { type: "text", text: '{"kcal":210,"protein_g":5,"carbs_g":30,"fat_g":8,"source_url":null,"note":"One bar."}' };

  it("goes out as Sonnet 5.5 at medium, on every resumed turn, with the 20260209 web tools", async () => {
    create
      .mockResolvedValueOnce(reply([{ type: "server_tool_use", id: "s1", name: "web_search", input: {} }], "pause_turn"))
      .mockResolvedValueOnce(reply([answer]));
    const estimate = await estimateMacros({ name: "Oat bar" });
    expect(estimate.macros).toEqual({ kcal: 210, protein_g: 5, carbs_g: 30, fat_g: 8 });
    expect(create).toHaveBeenCalledTimes(2);
    for (const [request] of create.mock.calls) {
      assertOneModel(request);
      const tools = request.tools as { type: string }[];
      expect(tools.map((t) => t.type)).toEqual(["web_search_20260209", "web_fetch_20260209"]);
    }
  });

  it.each(["refusal", "max_tokens"])("a %s stop fails the line rather than inventing numbers", async (stop) => {
    create.mockResolvedValue(reply([answer], stop));
    await expect(estimateMacros({ name: "Oat bar" })).rejects.toThrow(new RegExp(stop));
  });

  it("takes no model argument", () => {
    // A picker would need one. The signature is the guard: one parameter, the name.
    expect(estimateMacros.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Nothing outside lib/models.ts chooses a model, and nothing offers a choice.
// ---------------------------------------------------------------------------

const APP = resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

const code = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

describe("one place sets the model", () => {
  const files = [...sourceFiles(join(APP, "app")), ...sourceFiles(join(APP, "lib"))];

  it("the walk is not vacuous", () => {
    expect(files.some((f) => f.endsWith("lib/anthropic.ts"))).toBe(true);
  });

  it("no file but lib/models.ts names a model id or an effort level", () => {
    const offenders = files
      .filter((f) => !f.endsWith("lib/models.ts"))
      .filter((f) => /["'`]claude-[a-z0-9-]+["'`]|\beffort\s*:/.test(code(f)))
      .map((f) => relative(APP, f));
    expect(offenders).toEqual([]);
  });

  it("only lib/anthropic.ts talks to the API, and every create spreads requestBase()", () => {
    const clients = files.filter((f) => /@anthropic-ai\/sdk/.test(code(f))).map((f) => relative(APP, f));
    expect(clients).toEqual(["lib/anthropic.ts"]);
    const src = code(join(APP, "lib/anthropic.ts"));
    const creates = src.match(/messages\.create\(\{/g) ?? [];
    const based = src.match(/messages\.create\(\{\s*\.\.\.requestBase\(\),/g) ?? [];
    expect(creates.length).toBeGreaterThan(0);
    expect(based.length).toBe(creates.length);
    expect(src).not.toMatch(/^\s*model\s*[:,]/m);
  });

  it("no route takes a model from the request, and the comparison is gone", () => {
    // A stored line's `model` is provenance (approving records what produced a
    // draft); what is refused is a request choosing the model to call.
    for (const f of files.filter((p) => p.includes("/app/api/"))) {
      expect(code(f), relative(APP, f)).not.toMatch(/\bbody\.model\b|\bmodel\s*:\s*body\./);
    }
    expect(code(join(APP, "lib/log.ts"))).not.toMatch(/params\.model\b/);
    for (const gone of ["app/debug", "app/api/debug", "lib/harness.ts"]) {
      expect(existsSync(join(APP, gone)), gone).toBe(false);
    }
  });
});
