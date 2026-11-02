import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Tidy's routes and the house style on every way in (TEC-201). The model is
 * mocked (a queue of replies, as `anthropic.test.ts`) and so is the database
 * (`@/lib/recipes`, `@/lib/tidyStore`), so each test reads what would have been
 * sent and what would have been written. No recipe data, only invented text.
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

const row = {
  id: "r1",
  name: "Onion pot",
  servings: 4,
  origin: "imported",
  source: null,
  model: null,
  source_url: null,
  ingredients: ["1 cup onions, chopped", "2 tablespoons olive oil"],
  method: "Cook the onions in the oil.",
  note: null,
  created_at: "2026-11-01T00:00:00Z",
  kcal: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  total_minutes: null,
  prep_minutes: null,
  cook_minutes: null,
  meal: null,
  mains: [],
  cuisine: null,
  equipment: [],
  diet: [],
  tags: [],
  rating: 3,
  house_style_at: null,
  has_original: true,
};
const IMPORTED = { ingredients: row.ingredients, directions: row.method, yield_text: "" };

const updateRecipe = vi.fn(async (id: string, edit: Record<string, unknown>, reprice: unknown, opts: unknown) => ({ ...row, id, ...edit, reprice, opts }));
const saveRecipe = vi.fn();
const saveDraft = vi.fn(async () => {});
const deleteDraft = vi.fn(async () => {});
const revertRecipe = vi.fn(async (id: string, fields: Record<string, unknown>) => ({ ...row, id, ...fields, kcal: null }));
let storedDraft: Record<string, unknown> | null = null;
let storedOriginal: unknown = IMPORTED;

vi.mock("@/lib/recipes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/recipes")>()),
  getRecipe: async () => row,
  listRecipes: async () => [row],
  nameTaken: async () => false,
  nameTakenByOther: async () => false,
  updateRecipe: (...args: Parameters<typeof updateRecipe>) => updateRecipe(...args),
  saveRecipe: (...args: unknown[]) => saveRecipe(...args),
}));

vi.mock("@/lib/tidyStore", () => ({
  listDrafts: async () => [],
  getDraft: async () => storedDraft,
  saveDraft: (...args: unknown[]) => (saveDraft as (...a: unknown[]) => Promise<void>)(...args),
  deleteDraft: (...args: unknown[]) => (deleteDraft as (...a: unknown[]) => Promise<void>)(...args),
  deleteDrafts: async () => {},
  getOriginal: async () => storedOriginal,
  getOriginals: async () => new Map([["r1", storedOriginal]]),
  revertRecipe: (...args: unknown[]) => (revertRecipe as (...a: unknown[]) => Promise<unknown>)(...(args as [string, Record<string, unknown>])),
}));

const reply = (text: string, stop_reason = "end_turn") => ({
  stop_reason,
  content: [
    { type: "thinking", thinking: "", signature: "x" },
    { type: "text", text },
  ],
});

const STYLED = JSON.stringify({ ingredients: ["1 cup onion", "2 tbsp olive oil"], method: "1. Chop the onion.\n2. Cook it in the oil.", servings: 6 });
const MACROS = JSON.stringify({ kcal: 900, protein_g: 10, carbs_g: 90, fat_g: 60, note: null });

const post = (path: string, body: unknown) =>
  new NextRequest(`http://x${path}`, { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  sent.length = 0;
  replies.length = 0;
  updateRecipe.mockClear();
  saveRecipe.mockClear();
  saveDraft.mockClear();
  deleteDraft.mockClear();
  revertRecipe.mockClear();
  storedDraft = null;
  storedOriginal = IMPORTED;
  process.env.ANTHROPIC_API_KEY = "test";
});

describe("making a Tidy draft", () => {
  it("makes one model call, saves one draft, and writes no recipe", async () => {
    const { POST } = await import("@/app/api/recipes/tidy/route");
    replies.push(reply(STYLED));
    const response = await POST(post("/api/recipes/tidy", { id: "r1" }));

    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(updateRecipe).not.toHaveBeenCalled();
    expect(saveRecipe).not.toHaveBeenCalled();

    const { draft } = await response.json();
    expect(draft.name).toBe("Onion pot");
    expect(draft.before.ingredients).toEqual(row.ingredients);
    expect(draft.after.ingredients).toEqual(["1 cup onion", "2 tbsp olive oil"]);
    // The imported yield gave no count: the servings are the model's, and marked.
    expect(draft.servings_estimated).toBe(true);
    expect(draft.after.servings).toBe(6);
  });

  it("sends the house style, and the imported text rather than the row", async () => {
    const { POST } = await import("@/app/api/recipes/tidy/route");
    replies.push(reply(STYLED));
    await POST(post("/api/recipes/tidy", { id: "r1" }));
    expect(String(sent[0].system)).toContain("THE HOUSE STYLE");
    expect(JSON.stringify(sent[0].messages)).toContain("1 cup onions, chopped");
  });

  it("throws away a tidy that dropped an ingredient or changed an amount, and saves no draft", async () => {
    const { POST } = await import("@/app/api/recipes/tidy/route");
    replies.push(reply(JSON.stringify({ ingredients: ["1 cup onion"], method: "1. Chop.", servings: 4 })));
    const dropped = await POST(post("/api/recipes/tidy", { id: "r1" }));
    expect(dropped.status).toBe(500);
    expect((await dropped.json()).error).toMatch(/changed the recipe/);

    replies.push(reply(JSON.stringify({ ingredients: ["2 cup onion", "2 tbsp olive oil"], method: "1. Chop.", servings: 4 })));
    const changed = await POST(post("/api/recipes/tidy", { id: "r1" }));
    expect(changed.status).toBe(500);

    expect(saveDraft).not.toHaveBeenCalled();
    expect(updateRecipe).not.toHaveBeenCalled();
  });
});

describe("keeping a Tidy draft", () => {
  const draft = { recipe_id: "r1", ingredients: ["1 cup onion", "2 tbsp olive oil"], method: "1. Chop the onion.", servings: 6, servings_estimated: true };

  it("prices the whole pot at once and writes the tidy with the macros, the model named", async () => {
    storedDraft = draft;
    const { POST } = await import("@/app/api/recipes/tidy/keep/route");
    replies.push(reply(MACROS));
    const response = await POST(post("/api/recipes/tidy/keep", { id: "r1", servings: 5 }));

    expect(response.status).toBe(200);
    expect((await response.json()).estimated).toBe(true);
    expect(sent).toHaveLength(1);
    expect(updateRecipe).toHaveBeenCalledTimes(1);
    const [id, edit, reprice, opts] = updateRecipe.mock.calls[0];
    expect(id).toBe("r1");
    expect(edit).toMatchObject({ name: "Onion pot", servings: 5, ingredients: draft.ingredients });
    expect(reprice).toMatchObject({ macros: { kcal: 900, protein_g: 10, carbs_g: 90, fat_g: 60 }, model: "claude-sonnet-5-5" });
    expect(opts).toEqual({ styled: true });
    expect(deleteDraft).toHaveBeenCalledWith("r1");
  });

  it("a failed estimate still keeps the tidy and says the macros are not estimated", async () => {
    storedDraft = draft;
    const { POST } = await import("@/app/api/recipes/tidy/keep/route");
    replies.push(reply(MACROS, "max_tokens"));
    const response = await POST(post("/api/recipes/tidy/keep", { id: "r1" }));

    expect(response.status).toBe(200);
    expect((await response.json()).estimated).toBe(false);
    expect(updateRecipe).toHaveBeenCalledTimes(1);
    const [, edit, reprice, opts] = updateRecipe.mock.calls[0];
    expect(edit).toMatchObject({ ingredients: draft.ingredients });
    expect(reprice).toBeNull();
    expect(opts).toEqual({ styled: true, clearMacros: true });
    expect(deleteDraft).toHaveBeenCalledWith("r1");
  });
});

describe("Revert", () => {
  it("puts back the import, with no model call, and never writes imported_original", async () => {
    const { POST } = await import("@/app/api/recipes/revert/route");
    const response = await POST(post("/api/recipes/revert", { id: "r1" }));

    expect(response.status).toBe(200);
    expect(sent).toHaveLength(0);
    expect(revertRecipe).toHaveBeenCalledWith("r1", { ingredients: row.ingredients, method: row.method, servings: 4 });
    expect(JSON.stringify(revertRecipe.mock.calls)).not.toContain("imported_original");
    expect((await response.json()).recipe.kcal).toBeNull();
  });

  it("refuses a recipe that was not imported", async () => {
    storedOriginal = null;
    const { POST } = await import("@/app/api/recipes/revert/route");
    const response = await POST(post("/api/recipes/revert", { id: "r1" }));
    expect(response.status).toBe(400);
    expect(revertRecipe).not.toHaveBeenCalled();
  });
});

describe("the house style on every way in", () => {
  const draftPost = (body: unknown) => post("/api/recipes/draft", body);
  const RECIPE = JSON.stringify({
    name: "Chilli",
    servings: 4,
    ingredients: ["2 tablespoons olive oil", "1 cup onion"],
    method: "1. Heat the oil at 350 degrees F.",
  });

  it("Ask Claude: the prompt carries it, units come back in one spelling, and the draft is marked styled", async () => {
    const { POST } = await import("@/app/api/recipes/draft/route");
    replies.push(reply(RECIPE), reply(MACROS));
    const { draft } = await (await POST(draftPost({ mode: "generate", brief: "chilli" }))).json();

    expect(String(sent[0].system)).toContain("THE HOUSE STYLE");
    expect(draft.ingredients).toEqual(["2 tbsp olive oil", "1 cup onion"]);
    expect(draft.method).toBe("1. Heat the oil at 350°F.");
    expect(draft.styled).toBe(true);
  });

  it("a link and a file carry it too", async () => {
    const { POST } = await import("@/app/api/recipes/draft/route");
    const READ = JSON.stringify({ read: true, reason: null, name: "Chilli", servings: 4, ingredients: ["1 cup onion"], method: "1. Cook." });

    replies.push(
      { stop_reason: "pause_turn", content: [{ type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: "https://x" } }] },
      reply(READ),
      reply(MACROS)
    );
    const linked = await POST(draftPost({ mode: "import", url: "https://example.com/r" }));
    expect(linked.status).toBe(200);
    expect(String(sent[0].system)).toContain("THE HOUSE STYLE");

    sent.length = 0;
    replies.push(reply(READ), reply(MACROS));
    const filed = await POST(draftPost({ mode: "file", file: { mediaType: "image/jpeg", data: "AAAA" } }));
    expect(filed.status).toBe(200);
    expect(String(sent[0].system)).toContain("THE HOUSE STYLE");
    expect((await filed.json()).draft.styled).toBe(true);
  });

  const typed = { mode: "manual", name: "Onion pot", servings: 4, ingredients: ["1 cup onions, chopped", "2 tablespoons olive oil"], method: "" };

  it("typed: one restyle call, then the pricing call, and the draft keeps every ingredient", async () => {
    const { POST } = await import("@/app/api/recipes/draft/route");
    replies.push(reply(STYLED), reply(MACROS));
    const { draft } = await (await POST(draftPost(typed))).json();

    expect(sent).toHaveLength(2);
    expect(String(sent[0].system)).toContain("THE HOUSE STYLE");
    expect(draft.ingredients).toEqual(["1 cup onion", "2 tbsp olive oil"]);
    expect(draft.ingredients).toHaveLength(typed.ingredients.length);
    expect(draft.servings).toBe(4);
    expect(draft.styled).toBe(true);
    // The pricing call sees the styled text.
    expect(JSON.stringify(sent[1].messages)).toContain("1 cup onion");
  });

  it("typed: a restyle that changed an amount is dropped, and the recipe is saved as typed, with a note", async () => {
    const { POST } = await import("@/app/api/recipes/draft/route");
    replies.push(reply(JSON.stringify({ ingredients: ["1 cup onion", "3 tbsp olive oil"], method: "1. Chop.", servings: null })), reply(MACROS));
    const { draft } = await (await POST(draftPost(typed))).json();

    expect(draft.ingredients).toEqual(typed.ingredients);
    expect(draft.styled).toBe(false);
    expect(draft.note).toMatch(/house style/);
  });
});
