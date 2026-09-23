import Anthropic from "@anthropic-ai/sdk";
import { MODELS, DEFAULT_MODEL, type ModelId } from "./models";
import { parseMacros, type Macros } from "./macros";
import { FILE_TYPES, type RecipeFile } from "./upload";

/**
 * The five model calls this app makes, and the reasoning for each one's model.
 *
 * `CLAUDE.md`: model choice is per task, and the choice and the reason are
 * recorded at the call site. These are those call sites.
 *
 * **None of them sends `output_config`.** The JSON shape is asked for in the
 * prompt and validated in code afterwards. That is the conservative path on
 * purpose: `effort` moving under `output_config` has caught this project once,
 * Haiku 4.5 rejects the key where Sonnet 5 accepts it, and the import call
 * carries a server tool where a response format is awkward anyway. Validating in
 * code is required regardless — a model response is untrusted input — so the
 * structured-output parameter would buy tidiness rather than safety.
 *
 * **Nothing here writes anything.** Every function returns a draft or a
 * proposal; the write is a separate, deliberate approval.
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

/**
 * Server tools can end a turn with `stop_reason: "pause_turn"` rather than a
 * result. Resuming means handing the paused turn back. **Without this the answer
 * is silently truncated rather than erroring**, which here would mean a
 * confidently wrong recipe instead of a visible failure.
 */
async function runWithTools(params: {
  model: ModelId;
  system: string;
  tools: unknown[];
  content: string;
  maxTokens: number;
}): Promise<string> {
  const messages: Record<string, unknown>[] = [{ role: "user", content: params.content }];

  for (let i = 0; i < 6; i++) {
    const response = (await getClient().messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      tools: params.tools,
      messages,
    } as never)) as { stop_reason: string; content: { type: string; text?: string }[] };

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    return textOf(response);
  }
  return "";
}

export type RecipeFields = {
  name: string;
  servings: number;
  ingredients: string[];
  method: string | null;
};

// ---------------------------------------------------------------------------
// 1 · Pricing a dish — the judgement, and the only call all three ways in make
// ---------------------------------------------------------------------------

export type RecipeEstimate = { macros: Macros; note: string | null };

const RECIPE_MACRO_SYSTEM = `You estimate the calories and macronutrients of a whole cooked dish.

- **Report the WHOLE recipe, not one serving.** Everything the ingredient list puts in the pot.
  Dividing happens elsewhere and dividing twice is the failure mode.
- Work from the ingredients. Where an amount is vague — "a drizzle of oil", "season to taste" —
  assume what a cook would actually use and say so in the note.
- Cooking losses are real but small for macros; do not model them. Water is not a macro.
- **Ignore any nutrition figures you were shown or can remember for this dish.** The number you
  report is your own arithmetic over this ingredient list, which is what makes it comparable with
  every other recipe in this book.
- Be honest about the width of the estimate in the note rather than hedging the numbers themselves.
  A number you have quietly padded is worse than a number with a caveat beside it.`;

/**
 * **The one judgement in this app, and so the one place the model picker means
 * anything.** Reading the book calls nothing; keeping a draft calls nothing.
 *
 * No tools: this is arithmetic over a list that is already in hand, and a search
 * here would invite exactly the published-panel number the whole design throws
 * away.
 */
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

// ---------------------------------------------------------------------------
// 2 · Writing one you described
// ---------------------------------------------------------------------------

const GENERATE_SYSTEM = `You invent one recipe a home cook can actually make tonight.

- **Answer the constraint you were given**, not the recipe you would rather write. If they said
  high protein, chicken and twenty minutes, all three are requirements.
- Ordinary ingredients and ordinary equipment. No sous vide, no overnight anything unless asked.
- **Amounts are specific.** "2 tbsp olive oil", not "some olive oil" — the macros are estimated from
  this list afterwards, so a vague line becomes a vague number.
- **The method is numbered steps, one per line, separated by real newlines** — "1. …\n2. …".
  Steps run together in one paragraph are unreadable on a phone at a worktop, which is where this
  gets read. Plain sentences, short enough to follow without scrolling back.
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

// ---------------------------------------------------------------------------
// 3 · Reading one off a page
// ---------------------------------------------------------------------------

const IMPORT_SYSTEM = `You read one web page and extract the recipe on it.

**The rule that matters more than the extraction.** If you could not read the page — it did not
fetch, it is paywalled, it 404'd, it blocked you, or it turned out not to be a recipe — then set
"read" to false and leave everything else null. **Do not reconstruct a recipe from the URL.** A slug
like /recipes/classic-beef-chili is enough to write a convincing chilli from nothing, and a recipe
invented from a link is indistinguishable from one that was really there, right up until someone
cooks it.

When you did read it:

- Take the ingredients and the method as written. Keep the amounts.
- Strip everything that is not the recipe: the story above it, the ads, the comments, the newsletter
  box, the affiliate links.
- Keep the page's own name for the dish and its own serving count. If the page does not say how many
  it serves, say 0 and someone will be asked.
- **Ignore any nutrition panel on the page.** The numbers are worked out here from the ingredients.
  Do not copy them and do not mention them.`;

export type RecipeImport = { read: boolean; fields: RecipeFields | null; reason: string | null };

/**
 * Read a recipe off a page.
 *
 * **A page that could not be read is refused rather than guessed, and that is
 * enforced twice.** The prompt asks for `read: false`; the check below
 * independently rejects anything claimed as read that produced no ingredients.
 * Two enforcements rather than one because a prompt can only ask, and this is
 * Coffee's trap wearing an apron — there the rule exists because *"you would
 * actually brew it"*, and here you would actually cook it.
 *
 * **Only the recipe is kept.** The page's own nutrition panel, if it has one, is
 * discarded and the macros are re-estimated from the ingredients — Joel:
 * *"Only retain recipe. Then calculate macros and cals."* So `source_url` records
 * where the method came from, never where a number did.
 */
export async function importRecipe(params: {
  url: string;
  model?: ModelId;
}): Promise<RecipeImport> {
  const model = params.model ?? DEFAULT_MODEL;

  const raw = await runWithTools({
    model,
    system: IMPORT_SYSTEM,
    // The fetch tool version differs between the two models; lib/models.ts is
    // what stops a model swap becoming a 400.
    tools: [{ type: MODELS[model].fetch, name: "web_fetch", max_uses: 3 }],
    maxTokens: 4096,
    content:
      `Fetch this page and extract the recipe: ${params.url}\n\n` +
      `Return a JSON object: {"read": boolean, "reason": string or null, "name": string or null, ` +
      `"servings": number or null, "ingredients": [string] or null, "method": string or null}. ` +
      `Put nothing after the JSON.`,
  });

  const parsed = looseJson<Record<string, unknown>>(raw);
  const reason = typeof parsed?.reason === "string" ? parsed.reason.trim() || null : null;

  if (!parsed || parsed.read !== true) {
    return { read: false, fields: null, reason: reason ?? "That page could not be read." };
  }

  // The second enforcement. A page genuinely read has ingredients; a model that
  // says `read: true` and produces none has answered from the URL.
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

// ---------------------------------------------------------------------------
// 3b · Reading one off a file — a photo, a screenshot, a PDF
// ---------------------------------------------------------------------------

const FILE_SYSTEM = `You read one recipe from a file: a photo of a cookbook page or a recipe card, a
screenshot, or a PDF.

**The rule that matters more than the extraction.** If you cannot read the recipe — the photo is
blurred, cropped, too dark, the handwriting is illegible, or the file is not a recipe at all — then
set "read" to false, say why in "reason", and leave everything else null. **Do not fill gaps with a
plausible recipe.** A title and a photo of the finished dish are enough to write a convincing one
from nothing, and a recipe invented from a picture is indistinguishable from one that was really
there, right up until someone cooks it. A recipe you can only half read is a refusal, not a draft.

When you did read it:

- Take the ingredients and the method as written. Keep the amounts exactly as they appear.
- Keep the recipe's own name and its own serving count. If it does not say how many it serves, say 0
  and someone will be asked.
- If the file holds more than one recipe, take the one that is most complete and name it.
- The method is numbered steps, one per line, separated by real newlines — "1. …\\n2. …".
- **Ignore any nutrition panel.** The numbers are worked out here from the ingredients. Do not copy
  them and do not mention them.`;

/**
 * Read a recipe off a file the person uploaded.
 *
 * **The same two enforcements as reading a page**, for the same reason: the
 * prompt asks for `read: false`, and the check below independently rejects a
 * file claimed as read that produced no ingredients. A photo of a finished dish
 * with its name in the corner is this path's version of a URL slug.
 *
 * **The model is the one you picked**, as for every other way in. Reading print
 * is well within Haiku; reading someone's handwriting is where Sonnet may earn
 * its cost, and the picker is already there for exactly that call.
 *
 * **The file goes to the model and nowhere else.** See `lib/upload.ts`.
 */
export async function readRecipeFile(params: {
  file: RecipeFile;
  model?: ModelId;
}): Promise<RecipeImport> {
  const model = params.model ?? DEFAULT_MODEL;
  const { mediaType, data } = params.file;

  const block =
    FILE_TYPES[mediaType] === "document"
      ? { type: "document", source: { type: "base64", media_type: mediaType, data } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data } };

  const response = (await getClient().messages.create({
    model,
    max_tokens: 4096,
    system: FILE_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          block,
          {
            type: "text",
            text:
              `Extract the recipe from this file.\n\n` +
              `Return a JSON object: {"read": boolean, "reason": string or null, "name": string or null, ` +
              `"servings": number or null, "ingredients": [string] or null, "method": string or null}. ` +
              `Put nothing after the JSON.`,
          },
        ],
      },
    ],
  } as never)) as { content: { type: string; text?: string }[] };

  const parsed = looseJson<Record<string, unknown>>(textOf(response));
  const reason = typeof parsed?.reason === "string" ? parsed.reason.trim() || null : null;

  if (!parsed || parsed.read !== true) {
    return { read: false, fields: null, reason: reason ?? "That file could not be read." };
  }

  const fields = readRecipeFields(parsed, { allowUnknownServings: true });
  if (!fields || fields.ingredients.length === 0) {
    return {
      read: false,
      fields: null,
      reason: reason ?? "Nothing in that file looked like a recipe with ingredients.",
    };
  }

  return { read: true, fields, reason: null };
}

/** Shared shape-reading, so two callers cannot disagree about what a recipe is. */
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
    ? raw.ingredients.map((i) => (typeof i === "string" ? i.trim() : "")).filter((i) => i.length > 0)
    : [];

  if (!opts.allowUnknownServings && ingredients.length === 0) return null;

  const method = typeof raw.method === "string" ? raw.method.trim() || null : null;
  return { name, servings, ingredients, method };
}

// ---------------------------------------------------------------------------
// 4 · Tidying the shopping list
// ---------------------------------------------------------------------------

/**
 * **Pinned to Haiku, and not under comparison.** Merging "2 cloves garlic" and
 * "1 tbsp minced garlic" into one line is recognition, not judgement, and
 * `validateTidy` checks the result in code either way — so a weaker model can
 * fail to tidy but cannot lose your eggs. That guard is exactly why this is the
 * cheap model: the risk of going cheap here is a list that stays messy, not one
 * that is wrong.
 */
const TIDY_MODEL: ModelId = "claude-haiku-4-5";

const TIDY_SYSTEM = `You consolidate a shopping list.

- Merge lines that name the same thing, even when they are worded or measured differently — "2
  cloves garlic" and "1 tbsp minced garlic" are both garlic.
- When you merge, the note should say what a shopper needs: a total where the amounts add up, and
  both amounts where they do not.
- Keep lines separate when they are genuinely different products. Whole milk and double cream are
  not the same thing; neither are fresh and dried herbs.
- **Never drop a line.** Every id you are given must appear in exactly one line's absorbed list. A
  shorter list is not the goal; an accurate one is.
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
        absorbed: Array.isArray(o.absorbed)
          ? o.absorbed.filter((x): x is string => typeof x === "string")
          : [],
      };
    })
    .filter((l) => l.name.length > 0);
}
