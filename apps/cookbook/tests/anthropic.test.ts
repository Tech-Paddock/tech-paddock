import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Every request Cookbook sends (TEC-133): one model, effort medium, nothing
 * Sonnet 5.5 rejects. The SDK is replaced by a recorder that answers from a
 * queue, so the test reads what would have gone on the wire without calling
 * the API. The database is mocked for the edit route.
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
  updateRecipe: async (_id: string, edit: unknown, reprice: unknown) => ({ ...STORED, ...(edit as object), reprice }),
}));

const { estimateRecipeMacros, generateRecipe, importRecipe, readRecipeFile, tidyList } = await import("@/lib/anthropic");

const reply = (text: string, stop_reason = "end_turn") => ({
  stop_reason,
  // Sonnet 5.5 thinks by default; the answer is read by block type, after it.
  content: [
    { type: "thinking", thinking: "", signature: "x" },
    { type: "text", text },
  ],
});

const MACROS = JSON.stringify({ kcal: 2400, protein_g: 180, carbs_g: 120, fat_g: 100, note: null });
const RECIPE = JSON.stringify({ name: "Chilli", servings: 4, ingredients: ["500g beef mince"], method: "1. Cook." });
const READ = JSON.stringify({ read: true, reason: null, name: "Chilli", servings: 4, ingredients: ["500g beef mince"], method: "1. Cook." });
const TIDY = JSON.stringify({ lines: [{ name: "garlic", note: null, absorbed: [1, 2] }] });
const recipe = { name: "Chilli", servings: 4, ingredients: ["500g beef mince"], method: null };

/** Run every model call the app makes, once each. */
async function everyCall() {
  replies.push(reply(MACROS));
  await estimateRecipeMacros({ recipe });

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
  it("covers pricing, Ask Claude, both turns of a link, a file and Tidy", async () => {
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
    replies.push(reply(MACROS, stop));
    await expect(estimateRecipeMacros({ recipe })).rejects.toThrow(message);
    // One request: no retry on another model, no second try.
    expect(sent).toHaveLength(1);
  });
});

describe("a stale `model` from an installed copy of the page", () => {
  it("is ignored by the draft route, and the draft names the one model", async () => {
    const { POST } = await import("@/app/api/recipes/draft/route");
    replies.push(reply(RECIPE), reply(MACROS));
    const response = await POST(
      new NextRequest("http://x/api/recipes/draft", {
        method: "POST",
        body: JSON.stringify({ mode: "generate", brief: "chilli", model: "claude-haiku-4-5" }),
      })
    );
    expect(response.status).toBe(200);
    expect((await response.json()).draft.model).toBe("claude-sonnet-5-5");
    expect(sent.map((b) => b.model)).toEqual(["claude-sonnet-5-5", "claude-sonnet-5-5"]);
  });

  it("is ignored by the edit route, and the re-price records the one model", async () => {
    const { POST } = await import("@/app/api/recipes/edit/route");
    replies.push(reply(MACROS));
    const response = await POST(
      new NextRequest("http://x/api/recipes/edit", {
        method: "POST",
        body: JSON.stringify({
          id: "r1",
          model: "claude-haiku-4-5",
          edit: { name: "Weeknight chilli", servings: 4, ingredients: ["750g beef mince"], method: null, meta: {} },
        }),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.repriced).toBe(true);
    expect(body.recipe.reprice.model).toBe("claude-sonnet-5-5");
    expectOneModel(sent[0], "edit re-price");
  });
});
