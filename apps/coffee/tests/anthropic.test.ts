import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Every request this app sends goes through one `messages.create`. Capture
// them all and answer from a queue, so the test reads what would have gone on
// the wire without calling the API.
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

const { identifyBag, searchBrewGuide, readRecipeImages, suggestRecipe } = await import("@/lib/anthropic");

const reply = (text: string, stop_reason = "end_turn") => ({
  stop_reason,
  // Sonnet 5.5 thinks by default; the answer is read by block type, after it.
  content: [
    { type: "thinking", thinking: "", signature: "x" },
    { type: "text", text },
  ],
});

const IDENTITY = JSON.stringify({ roaster: "R", coffee_name: "C", origin: null, process: null, varietal: null, roast_date: null });
const SUGGESTION = JSON.stringify({ method: "pour over", params: { ratio: "1:16", dose: "15g", water: null, temp: null, grind: null, time: null }, rationale: null });
const NONE = JSON.stringify({ status: "none", product_url: null, guide_url: null, params: {}, quotes: [] });
const CARDS = JSON.stringify({ recipes: [] });

/** Run every model call the app makes, once each. */
async function everyCall() {
  replies.push(reply(IDENTITY));
  await identifyBag({ media_type: "image/jpeg", data: "AAAA" });

  // A paused turn and its resume: the resumed request is held to the same terms.
  replies.push({ stop_reason: "pause_turn", content: [{ type: "text", text: "" }] }, reply(NONE));
  await searchBrewGuide({ roaster: "R", coffeeName: "C", productUrl: "https://roaster.example/shop/c" });

  replies.push(reply(CARDS));
  const read = await readRecipeImages("https://roaster.example/shop/c", AbortSignal.timeout(5_000));
  expect(read.kind).toBe("read");

  replies.push(reply(SUGGESTION));
  await suggestRecipe({ roaster: "R", coffeeName: "C" });
}

beforeEach(() => {
  sent.length = 0;
  replies.length = 0;
  process.env.ANTHROPIC_API_KEY = "test";
  // The recipe-card read fetches the product page and its gallery itself.
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.endsWith(".jpg")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    return new Response(`<div class="product-gallery"><img src="/p/card.jpg"></div>`, { headers: { "content-type": "text/html" } });
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("every model request", () => {
  it("covers the label reader, both search turns, the recipe card and the suggestion", async () => {
    await everyCall();
    expect(sent).toHaveLength(5);
  });

  it("goes out as claude-sonnet-5-5 at effort medium", async () => {
    await everyCall();
    for (const [i, body] of sent.entries()) {
      expect(body.model, `request ${i}`).toBe("claude-sonnet-5-5");
      expect((body.output_config as { effort?: string })?.effort, `request ${i}`).toBe("medium");
    }
  });

  it("carries none of the parameters Sonnet 5.5 rejects", async () => {
    await everyCall();
    for (const [i, body] of sent.entries()) {
      // `thinking` is left to the model's adaptive default: `disabled` and
      // `budget_tokens` are 400s, and nothing here needs it off.
      for (const key of ["thinking", "budget_tokens", "temperature", "top_p", "top_k"]) {
        expect(body, `request ${i}: ${key}`).not.toHaveProperty(key);
      }
      // Forced tool use is a 400; `auto`, the default, is all that may be sent.
      if ("tool_choice" in body) expect((body.tool_choice as { type: string }).type, `request ${i}`).toBe("auto");
    }
  });

  it("never prefills the answer", async () => {
    await everyCall();
    const roles = sent.map((body) => (body.messages as Array<{ role: string }>).map((m) => m.role));
    // Request 2 resumes a pause_turn by handing the paused turn back
    // unchanged, which the API continues; it is not a prefill. Every other
    // request is one user message.
    expect(roles).toEqual([["user"], ["user"], ["user", "assistant"], ["user"], ["user"]]);
  });

  it("gives the search the dynamic-filtering web tools", async () => {
    await everyCall();
    for (const body of [sent[1], sent[2]]) {
      expect((body.tools as Array<{ type: string }>).map((t) => t.type)).toEqual(["web_search_20260209", "web_fetch_20260209"]);
    }
    // The label reader, the card copy-out and the suggestion read nothing.
    for (const body of [sent[0], sent[3], sent[4]]) expect(body).not.toHaveProperty("tools");
  });
});

describe("a response that did not finish", () => {
  it("is an error from the label reader, not an empty label", async () => {
    replies.push(reply("", "refusal"));
    await expect(identifyBag({ media_type: "image/jpeg", data: "AAAA" })).rejects.toThrow(/declined/);
    replies.push(reply('{"roaster": "R', "max_tokens"));
    await expect(identifyBag({ media_type: "image/jpeg", data: "AAAA" })).rejects.toThrow(/max_tokens/);
  });

  it("is an error from the suggestion, not 'nothing usable'", async () => {
    replies.push(reply("", "refusal"));
    await expect(suggestRecipe({ roaster: "R", coffeeName: "C" })).rejects.toThrow(/declined/);
  });

  it("is a failed card read, not 'no card'", async () => {
    replies.push(reply("", "refusal"));
    const read = await readRecipeImages("https://roaster.example/shop/c", AbortSignal.timeout(5_000));
    expect(read).toEqual({ kind: "failed", message: "the image reader declined to read them" });
  });

  it("is a failed search, not a none", async () => {
    replies.push(reply("", "refusal"));
    await expect(searchBrewGuide({ roaster: "R", coffeeName: "C" })).rejects.toThrow(/declined/);
  });
});
