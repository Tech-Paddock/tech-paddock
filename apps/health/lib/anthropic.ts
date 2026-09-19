import Anthropic from "@anthropic-ai/sdk";
import { MODELS, DEFAULT_MODEL, type ModelId } from "./models";
import { MEALS, mealForHour, isMeal, type Meal } from "./meals";
import { parseMacros, type Macros } from "./macros";

/**
 * The two model calls this app makes, and the reasoning for each one's model.
 *
 * `CLAUDE.md`: model choice is per task and the choice and the reason are
 * recorded at the call site. These are those call sites.
 *
 * **Neither call sends `output_config`.** The JSON shape is asked for in the
 * prompt and validated in code afterwards. That is deliberately the
 * conservative path: `effort` moving under `output_config` has already caught
 * this project once, Haiku 4.5 rejects that key outright where Sonnet 5 accepts
 * it, and the estimate call carries server tools where a response format is
 * awkward anyway. Validating in code is required regardless — a model response
 * is untrusted input — so the structured-output parameter would buy tidiness
 * rather than safety.
 */

let client: Anthropic | null = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY must be set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** The model is asked for bare JSON and answers after a narrative often enough to matter. */
export function looseJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const braced = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  for (const candidate of [fenced?.[1], braced, text]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate.trim());
      if (parsed && typeof parsed === "object") return parsed as T;
    } catch {
      // Try the next shape.
    }
  }
  return null;
}

function textOf(response: { content: { type: string; text?: string }[] }): string {
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}

// ---------------------------------------------------------------------------
// 1 · Parsing a dictation into items
// ---------------------------------------------------------------------------

export type ParsedItem = { name: string; quantity: number };
export type ParsedDictation = { meal: Meal; items: ParsedItem[] };

/**
 * **Pinned to Haiku, and not under comparison.**
 *
 * Turning "a number one from Chick-fil-A and a cookie" into two named items is
 * transcription with a little structure, not judgement — it is a Haiku job at
 * any setting, and offering Sonnet for it would buy nothing while doubling the
 * latency of the one step you actually wait on. Coffee draws the same line,
 * putting its model toggle on `/api/search` and never on `/api/identify`.
 *
 * The judgement in this app is entirely in the macro estimate below, which is
 * where the comparison lives.
 */
const PARSE_MODEL: ModelId = "claude-haiku-4-5";

const PARSE_SYSTEM = `You turn a spoken food log into a list of items.

Rules that decide the output:

- **One item per thing that was ordered, not per component.** A Chick-fil-A #1 is ONE item even
  though it is a sandwich, fries and a drink — do not split it. "A number one and a cookie" is two
  items.
- **The name carries the whole specification.** "large fry" and "medium fry" are different names,
  not one name with a size. Include the brand or restaurant when it was said, because the macros
  depend on it.
- **Quantity is a count, not a size.** Two large fries is quantity 2 of "large fry".
- **A serving counts the same way.** "Two servings of my chilli" is quantity 2 of "my chilli" —
  drop the word servings from the name, because the recipe book already knows what a serving is.
- Write names the way a person would say them back, in title case where that reads naturally. Do
  not invent detail that was not said, and do not expand an abbreviation you are not sure of.
- Pick the meal from what was said first, and from the clock only when the words do not say.`;

export async function parseDictation(params: {
  text: string;
  /** The speaker's local hour, so the clock can be the fallback for the meal slot. */
  hour: number;
}): Promise<ParsedDictation> {
  const fallbackMeal = mealForHour(params.hour);

  const response = (await getClient().messages.create({
    model: PARSE_MODEL,
    max_tokens: 2048,
    system: PARSE_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `It is hour ${params.hour} locally, which is normally ${fallbackMeal}.\n\n` +
          `What was said:\n${params.text}\n\n` +
          `Return a JSON object: {"meal": one of ${MEALS.map((m) => `"${m}"`).join(", ")}, ` +
          `"items": [{"name": string, "quantity": number}]}. Put nothing after the JSON.`,
      },
    ],
  } as never)) as { content: { type: string; text?: string }[] };

  const raw = looseJson<{ meal?: unknown; items?: unknown }>(textOf(response));

  const items: ParsedItem[] = Array.isArray(raw?.items)
    ? raw.items
        .map((i) => {
          const o = i as { name?: unknown; quantity?: unknown };
          const name = typeof o.name === "string" ? o.name.trim() : "";
          const q = typeof o.quantity === "number" ? o.quantity : Number(o.quantity);
          return { name, quantity: Number.isFinite(q) && q > 0 ? q : 1 };
        })
        .filter((i) => i.name.length > 0)
    : [];

  return { meal: isMeal(raw?.meal) ? raw.meal : fallbackMeal, items };
}

// ---------------------------------------------------------------------------
// 2 · Estimating macros for something the table has never seen
// ---------------------------------------------------------------------------

export type Estimate = {
  macros: Macros;
  /** Set when the model read a page rather than answering from its own knowledge. */
  source_url: string | null;
  note: string | null;
};

const ESTIMATE_SYSTEM = `You report the calories and macronutrients of one item of food.

Two ways to answer, and the first is better when it is available:

1. **Look it up.** Chains and packaged foods publish their own nutrition data. Search for it, read
   the page, and report what it says. Give the URL you read.
2. **Estimate.** For ordinary food — "two eggs and toast", a home-cooked portion — searching buys
   nothing. Use a typical portion and say so. Report no URL, because you did not read one.

Report the figures for ONE of the item, not for a multiple of it. The quantity is handled elsewhere.

Never report a URL you did not actually read, and never attach a URL to a number that did not come
from that page. A plain estimate honestly labelled is worth more here than a figure wearing a
citation it did not earn.`;

/**
 * **This is the call the model toggle exists for**, and the only judgement in
 * the app. Haiku by default; the debug harness runs both and is how that
 * default gets validated rather than assumed.
 */
export async function estimateMacros(params: {
  name: string;
  model?: ModelId;
}): Promise<Estimate> {
  const model = params.model ?? DEFAULT_MODEL;
  const spec = MODELS[model];

  const tools = [
    { type: spec.search, name: "web_search", max_uses: 4 },
    { type: spec.fetch, name: "web_fetch", max_uses: 4 },
  ];

  const messages: Record<string, unknown>[] = [
    {
      role: "user",
      content:
        `Item: ${params.name}\n\n` +
        `Report its calories and macros. When you are done, give your answer as a JSON object with ` +
        `keys: kcal, protein_g, carbs_g, fat_g (all numbers, for one of the item), source_url ` +
        `(the page you read, or null if you estimated), and note (one short sentence naming the ` +
        `portion you assumed, or null). Put nothing after the JSON.`,
    },
  ];

  let raw = "";
  // Server tools can end a turn with stop_reason "pause_turn" rather than a
  // result. Resume by handing the paused turn back; without this the answer is
  // silently truncated rather than erroring — which in this app would mean a
  // confidently wrong number instead of a visible failure.
  for (let i = 0; i < 6; i++) {
    const response = (await getClient().messages.create({
      model,
      max_tokens: 4096,
      system: ESTIMATE_SYSTEM,
      tools,
      messages,
    } as never)) as { stop_reason: string; content: { type: string; text?: string }[] };

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    raw = textOf(response);
    break;
  }

  const parsed = looseJson<Record<string, unknown>>(raw);
  const macros = parseMacros(parsed);
  if (!macros) {
    throw new Error(`${MODELS[model].label} did not return usable macros for "${params.name}".`);
  }

  const url = typeof parsed?.source_url === "string" ? parsed.source_url.trim() : "";
  return {
    macros,
    source_url: url.startsWith("http") ? url : null,
    note: typeof parsed?.note === "string" && parsed.note.trim() ? parsed.note.trim() : null,
  };
}

// ---------------------------------------------------------------------------
// 3 · Tidying a grocery list
// ---------------------------------------------------------------------------

/**
 * **Pinned to Haiku, and not under comparison.** Merging "2 cloves garlic" and
 * "1 tbsp minced garlic" into one line is recognition, not judgement, and the
 * result is checked in code afterwards either way — `validateTidy` refuses a
 * proposal that drops a line or uses one twice, so a weaker model can fail to
 * tidy but cannot lose your eggs.
 *
 * That guard is why this is the cheap model rather than the careful one: the
 * risk of going cheap here is a list that stays messy, not one that is wrong.
 */
const TIDY_MODEL: ModelId = "claude-haiku-4-5";

const TIDY_SYSTEM = `You consolidate a grocery list.

- Merge lines that name the same thing, even when they are worded differently or measured
  differently — "2 cloves garlic" and "1 tbsp minced garlic" are both garlic.
- When you merge, the note should say what a shopper needs: a total where the amounts add up, and
  both amounts where they do not.
- Keep lines separate when they are genuinely different products. Whole milk and double cream are
  not the same thing; neither are fresh and dried herbs.
- **Never drop a line.** Every id you are given must appear in exactly one line's absorbed list.
  A shorter list is not the goal; an accurate one is.
- Write names the way someone would say them in a shop.`;

export type TidyProposal = { name: string; note: string | null; absorbed: string[] };

export async function tidyList(
  items: { id: string; name: string; note: string | null }[]
): Promise<TidyProposal[]> {
  const response = (await getClient().messages.create({
    model: TIDY_MODEL,
    max_tokens: 2048,
    system: TIDY_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `The list:\n${items
            .map((i) => `- id ${i.id}: ${i.name}${i.note ? ` (${i.note})` : ""}`)
            .join("\n")}\n\n` +
          `Return a JSON object: {"lines": [{"name": string, "note": string or null, ` +
          `"absorbed": [id, ...]}]}. Every id above appears in exactly one absorbed list. ` +
          `Put nothing after the JSON.`,
      },
    ],
  } as never)) as { content: { type: string; text?: string }[] };

  const raw = looseJson<{ lines?: unknown }>(textOf(response));
  if (!Array.isArray(raw?.lines)) return [];

  return raw.lines
    .map((l) => {
      const o = l as { name?: unknown; note?: unknown; absorbed?: unknown };
      return {
        name: typeof o.name === "string" ? o.name.trim() : "",
        note: typeof o.note === "string" && o.note.trim() ? o.note.trim() : null,
        absorbed: Array.isArray(o.absorbed) ? o.absorbed.filter((x): x is string => typeof x === "string") : [],
      };
    })
    .filter((l) => l.name.length > 0);
}

// ---------------------------------------------------------------------------
// 4 · Recipes — three ways in, one shape out
// ---------------------------------------------------------------------------

/**
 * Everything below produces the same thing: a draft the book has not accepted
 * yet. Typed, generated or read off a page, it reaches `saveRecipe` through one
 * approval — guardrail 1, in the same shape the meal log uses it.
 *
 * **The macros are always ours.** Joel settled what import does — *"Only
 * retain recipe. Then calculate macros and cals."* — so a recipe's numbers are
 * always an estimate this app made from the ingredients, never a figure lifted
 * off the page. Where a page publishes real nutrition we throw it away. That is
 * a cost, named once, and it buys one rule instead of two and consistency with
 * a book whose macros are static by decision.
 */

export type RecipeFields = {
  name: string;
  servings: number;
  ingredients: string[];
  method: string | null;
};

export type RecipeEstimate = { macros: Macros; note: string | null };

const RECIPE_MACRO_SYSTEM = `You estimate the calories and macronutrients of a whole cooked dish.

- **Report the WHOLE recipe, not one serving.** Everything the ingredient list puts in the pot.
  Dividing happens elsewhere and dividing twice is the failure mode.
- Work from the ingredients. Where an amount is vague — "a drizzle of oil", "season to taste" —
  assume what a cook would actually use and say so in the note.
- Cooking losses are real but small for macros; do not model them. Water is not a macro.
- Be honest about the width of the estimate in the note rather than hedging the numbers
  themselves. A number you have quietly padded is worse than a number with a caveat beside it.`;

/** Macros for a whole dish, from its ingredients. The judgement call, so it takes a model. */
export async function estimateRecipeMacros(params: {
  recipe: RecipeFields;
  model?: ModelId;
}): Promise<RecipeEstimate> {
  const model = params.model ?? DEFAULT_MODEL;
  const { recipe } = params;

  const response = (await getClient().messages.create({
    model,
    max_tokens: 2048,
    system: RECIPE_MACRO_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `Recipe: ${recipe.name}\nIt makes ${recipe.servings} servings.\n\n` +
          `Ingredients:\n${recipe.ingredients.map((i) => `- ${i}`).join("\n")}\n\n` +
          (recipe.method ? `Method:\n${recipe.method}\n\n` : "") +
          `Return a JSON object: {"kcal": number, "protein_g": number, "carbs_g": number, ` +
          `"fat_g": number, "note": string or null} for the WHOLE dish. Put nothing after the JSON.`,
      },
    ],
  } as never)) as { content: { type: string; text?: string }[] };

  const parsed = looseJson<Record<string, unknown>>(textOf(response));
  const macros = parseMacros(parsed);
  if (!macros) {
    throw new Error(`${MODELS[model].label} did not return usable macros for "${recipe.name}".`);
  }
  return { macros, note: typeof parsed?.note === "string" ? parsed.note.trim() || null : null };
}

const GENERATE_SYSTEM = `You invent one recipe a home cook can actually make tonight.

- **Answer the constraint you were given**, not the recipe you would rather write. If they said
  high protein, chicken and twenty minutes, all three are requirements.
- Ordinary ingredients and ordinary equipment. No sous vide, no overnight anything unless asked.
- **Amounts are specific.** "2 tbsp olive oil", not "some olive oil" — the macros are estimated
  from this list afterwards, so a vague line becomes a vague number.
- The method is numbered steps in plain sentences. Short enough to follow from a phone.
- One recipe, not three options.`;

/** Invent a recipe. Its macros are estimated separately, from what it produced. */
export async function generateRecipe(params: {
  brief: string;
  model?: ModelId;
}): Promise<RecipeFields> {
  const model = params.model ?? DEFAULT_MODEL;

  const response = (await getClient().messages.create({
    model,
    max_tokens: 3072,
    system: GENERATE_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `What they asked for: ${params.brief}\n\n` +
          `Return a JSON object: {"name": string, "servings": number, "ingredients": [string], ` +
          `"method": string}. Put nothing after the JSON.`,
      },
    ],
  } as never)) as { content: { type: string; text?: string }[] };

  const fields = readRecipeFields(looseJson<Record<string, unknown>>(textOf(response)));
  if (!fields) throw new Error(`${MODELS[model].label} did not return a usable recipe.`);
  return fields;
}

const IMPORT_SYSTEM = `You read one web page and extract the recipe on it.

**The rule that matters more than the extraction.** If you could not read the page — it did not
fetch, it is paywalled, it 404'd, it blocked you, or it turned out not to be a recipe — then set
"read" to false and leave everything else null. **Do not reconstruct a recipe from the URL.** A
slug like /recipes/classic-beef-chili is enough to write a convincing chilli from nothing, and a
recipe invented from a link is indistinguishable from one that was really there, right up until
someone cooks it and logs its macros.

When you did read it:

- Take the ingredients and the method as written. Keep the amounts.
- Strip everything that is not the recipe: the story above it, the ads, the comments, the
  newsletter box, the affiliate links.
- Keep the page's own name for the dish and its own serving count. If the page does not say how
  many it serves, say 0 and someone will be asked.
- **Ignore any nutrition panel on the page.** The numbers are worked out separately here from the
  ingredients. Do not copy them and do not mention them.`;

export type RecipeImport = { read: boolean; fields: RecipeFields | null; reason: string | null };

/**
 * Read a recipe off a page.
 *
 * **A failed fetch fails loudly rather than degrading into generation**, which
 * is Coffee's trap wearing an apron: hand a model a URL it cannot open and it
 * will happily write the recipe the slug implies. Coffee's rule exists because
 * *"you would actually brew it"*; here you would actually cook it and log its
 * macros against your day.
 *
 * Two things enforce it rather than one. The prompt asks for `read: false`, and
 * the caller below refuses anything that comes back without real ingredients —
 * because a prompt can only ask.
 */
export async function importRecipe(params: {
  url: string;
  model?: ModelId;
}): Promise<RecipeImport> {
  const model = params.model ?? DEFAULT_MODEL;
  const spec = MODELS[model];

  const messages: Record<string, unknown>[] = [
    {
      role: "user",
      content:
        `Fetch this page and extract the recipe: ${params.url}\n\n` +
        `Return a JSON object: {"read": boolean, "reason": string or null, "name": string or null, ` +
        `"servings": number or null, "ingredients": [string] or null, "method": string or null}. ` +
        `Put nothing after the JSON.`,
    },
  ];

  let raw = "";
  for (let i = 0; i < 6; i++) {
    const response = (await getClient().messages.create({
      model,
      max_tokens: 4096,
      system: IMPORT_SYSTEM,
      tools: [{ type: spec.fetch, name: "web_fetch", max_uses: 3 }],
      messages,
    } as never)) as { stop_reason: string; content: { type: string; text?: string }[] };

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    raw = textOf(response);
    break;
  }

  const parsed = looseJson<Record<string, unknown>>(raw);
  const reason = typeof parsed?.reason === "string" ? parsed.reason.trim() || null : null;

  if (!parsed || parsed.read !== true) {
    return { read: false, fields: null, reason: reason ?? "That page could not be read." };
  }

  // The second enforcement. A page that was genuinely read has ingredients; a
  // model that says `read: true` and produces none has answered from the URL.
  const fields = readRecipeFields(parsed, { allowUnknownServings: true });
  if (!fields || fields.ingredients.length === 0) {
    return {
      read: false,
      fields: null,
      reason: reason ?? "Nothing on that page looked like a recipe with ingredients.",
    };
  }

  return { read: true, fields, reason: null };
}

/** Shared shape-reading, so three callers cannot disagree about what a recipe is. */
function readRecipeFields(
  raw: Record<string, unknown> | null,
  opts: { allowUnknownServings?: boolean } = {}
): RecipeFields | null {
  if (!raw) return null;

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;

  const servingsRaw = typeof raw.servings === "string" ? Number(raw.servings) : raw.servings;
  const servings =
    typeof servingsRaw === "number" && Number.isFinite(servingsRaw) && servingsRaw >= 1
      ? Math.round(servingsRaw)
      : opts.allowUnknownServings
        ? 0
        : 4;

  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients
        .map((i) => (typeof i === "string" ? i.trim() : ""))
        .filter((i) => i.length > 0)
    : [];

  if (!opts.allowUnknownServings && ingredients.length === 0) return null;

  const method = typeof raw.method === "string" ? raw.method.trim() || null : null;
  return { name, servings, ingredients, method };
}
