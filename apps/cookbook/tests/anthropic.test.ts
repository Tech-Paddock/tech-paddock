import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { NextRequest } from "next/server";

/**
 * Every request Cookbook sends (TEC-133): one model, effort medium, nothing
 * Sonnet 5.5 rejects. The SDK is replaced by a recorder that answers from a
 * queue, so the test reads what would have gone on the wire without calling
 * the API. The database is mocked for the edit route. No macro estimate is
 * among the calls (TEC-223): the nightly Cowork job writes the macros.
 */

const sent: Array<Record<string, unknown>> = [];
const replies: Array<Record<string, unknown>> = [];

vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = {
      create: async (body: Record<string, unknown>) => {
        sent.push(structuredClone(body));
        const reply = replies.shift();
        if (!reply) throw new Error("no reply queued");
        return reply;
      },
    };
  }
  return { default: Anthropic };
});

const STORED = {
  id: "r1",
  name: "Weeknight chilli",
  servings: 4,
  ingredients: ["500g beef mince"],
  method: null,
};

vi.mock("@/lib/recipes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recipes")>()),
  nameTaken: async () => false,
  getRecipe: async () => STORED,
  nameTakenByOther: async () => false,
  updateRecipe: async (_id: string, edit: unknown, clearMacros: unknown) => ({ ...STORED, ...(edit as object), clearMacros }),
}));

const { generateRecipe, importRecipe, readRecipeFile, styleRecipe, tidyList } = await import("@/lib/anthropic");

const reply = (text: string, stop_reason = "end_turn") => ({
  stop_reason,
  // Sonnet 5.5 thinks by default; the answer is read by block type, after it.
  content: [
    { type: "thinking", thinking: "", signature: "x" },
    { type: "text", text },
  ],
});

const RECIPE = JSON.stringify({ name: "Chilli", servings: 4, ingredients: ["500g beef mince"], method: "1. Cook." });
const READ = JSON.stringify({ read: true, reason: null, name: "Chilli", servings: 4, ingredients: ["500g beef mince"], method: "1. Cook." });
const TIDY = JSON.stringify({ lines: [{ name: "garlic", note: null, absorbed: [1, 2] }] });
const recipe = { name: "Chilli", servings: 4, ingredients: ["500g beef mince"], method: null };
const STYLED = JSON.stringify({ ingredients: ["500g beef mince"], method: "1. Cook.", servings: null });

/** Run every model call the app makes, once each. */
async function everyCall() {
  replies.push(reply(RECIPE));
  await generateRecipe({ brief: "chilli" });

  // A paused turn and its resume: the resumed request is held to the same terms.
  replies.push(
    { stop_reason: "pause_turn", content: [{ type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: "https://x" } }] },
    reply(READ)
  );
  const page = await importRecipe({ url: "https://x" });
  expect(page.read).toBe(true);

  replies.push(reply(READ));
  await readRecipeFile({ file: { mediaType: "image/jpeg", data: "AAAA" } });

  replies.push(reply(TIDY));
  await tidyList([
    { id: "a", name: "2 cloves garlic", note: null },
    { id: "b", name: "1 tbsp minced garlic", note: null },
  ]);

  replies.push(reply(STYLED));
  await styleRecipe(recipe);
}

function expectOneModel(body: Record<string, unknown>, at: string) {
  expect(body.model, at).toBe("claude-sonnet-5-5");
  expect((body.output_config as { effort?: string } | undefined)?.effort, at).toBe("medium");
  // What Sonnet 5.5 answers with a 400, and the prefill it no longer takes.
  for (const key of ["thinking", "temperature", "top_p", "top_k", "tool_choice"]) {
    expect(body, `${at}: ${key}`).not.toHaveProperty(key);
  }
  expect(JSON.stringify(body), at).not.toContain("budget_tokens");
  const messages = body.messages as { role: string }[];
  // A resumed turn ends on the paused assistant turn, which is not a prefill.
  if (messages.length === 1) expect(messages[0].role, at).toBe("user");
}

beforeEach(() => {
  sent.length = 0;
  replies.length = 0;
  process.env.ANTHROPIC_API_KEY = "test";
});

describe("every model request", () => {
  it("covers Ask Claude, both turns of a link, a file, Tidy of the list and the house style", async () => {
    await everyCall();
    expect(sent).toHaveLength(6);
  });

  it("goes out as claude-sonnet-5-5 at effort medium, with nothing Sonnet 5.5 rejects", async () => {
    await everyCall();
    for (const [i, body] of sent.entries()) expectOneModel(body, `request ${i}`);
  });

  it("leaves room to think on top of the answer", async () => {
    await everyCall();
    for (const body of sent) expect(body.max_tokens as number).toBeGreaterThanOrEqual(2048 + 8000);
  });

  it("fetches with the tool version Sonnet 5.5 takes", async () => {
    await everyCall();
    const tools = sent.flatMap((b) => (b.tools as { type: string }[] | undefined) ?? []);
    expect(tools.map((t) => t.type)).toEqual(["web_fetch_20260209", "web_fetch_20260209"]);
  });
});

describe("a turn that did not finish fails visibly", () => {
  it.each([
    ["refusal", /declined/],
    ["max_tokens", /ran out of room/],
  ])("%s throws a sentence and nothing is kept", async (stop, message) => {
    replies.push(reply(RECIPE, stop));
    await expect(generateRecipe({ brief: "chilli" })).rejects.toThrow(message);
    // One request: no retry on another model, no second try.
    expect(sent).toHaveLength(1);
  });
});

describe("no way in estimates macros", () => {
  it.each([
    ["generate", { mode: "generate", brief: "chilli" }, [reply(RECIPE)]],
    [
      "import",
      { mode: "import", url: "https://x" },
      [{ stop_reason: "pause_turn", content: [{ type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: "https://x" } }] }, reply(READ)],
    ],
    ["file", { mode: "file", file: { mediaType: "image/jpeg", data: "AAAA" } }, [reply(READ)]],
    ["manual", { mode: "manual", name: "Chilli", servings: 4, ingredients: ["500g beef mince"] }, [reply(STYLED)]],
  ])("%s drafts a recipe with macros, source and model all null", async (_name, body, queued) => {
    const { POST } = await import("@/app/api/recipes/draft/route");
    replies.push(...queued);
    const response = await POST(new NextRequest("http://x/api/recipes/draft", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(200);
    const { draft } = await response.json();
    expect(draft.macros).toBeNull();
    expect(draft.source).toBeNull();
    expect(draft.model).toBeNull();
    // Whatever was sent is a write or a read of the recipe, never a macro request.
    for (const request of sent) expect(JSON.stringify(request)).not.toMatch(/WHOLE dish|macronutrients/);
  });

  it("has no estimate route", () => {
    expect(existsSync("app/api/recipes/estimate")).toBe(false);
  });
});

describe("a stale `model` from an installed copy of the page", () => {
  it("is ignored by the draft route: the one model writes the recipe", async () => {
    const { POST } = await import("@/app/api/recipes/draft/route");
    replies.push(reply(RECIPE));
    const response = await POST(
      new NextRequest("http://x/api/recipes/draft", {
        method: "POST",
        body: JSON.stringify({ mode: "generate", brief: "chilli", model: "claude-haiku-4-5" }),
      })
    );
    expect(response.status).toBe(200);
    expect(sent.map((b) => b.model)).toEqual(["claude-sonnet-5-5"]);
  });
});

describe("the edit route", () => {
  const post = async (edit: Record<string, unknown>) => {
    const { POST } = await import("@/app/api/recipes/edit/route");
    return POST(new NextRequest("http://x/api/recipes/edit", { method: "POST", body: JSON.stringify({ id: "r1", edit }) }));
  };
  const base = { name: "Weeknight chilli", servings: 4, ingredients: ["500g beef mince"], method: null, meta: {} };

  it("calls no model, and an ingredient change clears the macros", async () => {
    const response = await post({ ...base, ingredients: ["750g beef mince"] });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.macrosCleared).toBe(true);
    expect(body.recipe.clearMacros).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("clears them on a servings change", async () => {
    const body = await (await post({ ...base, servings: 6 })).json();
    expect(body.recipe.clearMacros).toBe(true);
  });

  it("leaves them alone on any other edit", async () => {
    const body = await (await post({ ...base, name: "Friday chilli", method: "Cook it." })).json();
    expect(body.macrosCleared).toBe(false);
    expect(body.recipe.clearMacros).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
