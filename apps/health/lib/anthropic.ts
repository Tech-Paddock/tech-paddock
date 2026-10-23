import Anthropic from "@anthropic-ai/sdk";
import { MODEL_SPEC, requestBase } from "./models";
import { MEALS, mealForHour, isMeal, type Meal } from "./meals";
import { parseMacros, type Macros } from "./macros";
import { urlsReadIn, earnedUrl, type ResultBlock } from "./webEvidence";

/**
 * The two model calls this app makes. Both go out as the one model in
 * `lib/models.ts` (Sonnet 5.5, effort `medium`) through `requestBase()`; neither
 * call site names a model or an effort (TEC-133).
 *
 * **Neither call asks for a response format.** `output_config` carries only the
 * effort. The JSON shape is asked for in the prompt and validated in code
 * afterwards: the estimate call carries server tools where a response format is
 * awkward, and validating in code is required regardless — a model response is
 * untrusted input — so the structured-output parameter would buy tidiness
 * rather than safety. Nothing is prefilled, and thinking is left adaptive.
 *
 * `max_tokens` covers the adaptive thinking as well as the answer, which is why
 * it is well above what the JSON alone needs: a turn that hits the cap is a
 * `max_tokens` stop and fails the line rather than truncating it.
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

/**
 * The answer's text. Joined with nothing, not a newline: a cited answer arrives
 * split across several text blocks at the citation boundaries, sometimes
 * mid-token, and a newline inside a JSON number or key breaks the parse.
 */
export function textOf(content: { type: string; text?: string }[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

/**
 * A turn that stopped for any reason but finishing has no answer worth reading:
 * `max_tokens` is a truncated JSON, `refusal` is no JSON at all. Say which,
 * rather than letting it surface as "did not return usable macros". There is no
 * fallback model: a refusal fails the line, so no number is stamped with a model
 * that did not make it.
 */
function assertFinished(stop: string | null, what: string): void {
  if (stop === "end_turn" || stop === "stop_sequence") return;
  throw new Error(`${what} stopped early (${stop ?? "no stop reason"}), so there is no answer to read.`);
}

// ---------------------------------------------------------------------------
// 1 · Parsing a dictation into items
// ---------------------------------------------------------------------------

export type ParsedItem = { name: string; quantity: number };
export type ParsedDictation = { meal: Meal; items: ParsedItem[] };

const PARSE_SYSTEM = `You turn a spoken food log into a list of items.

Rules that decide the output:

- **One item per thing that was ordered, not per component.** A Chick-fil-A #1 is ONE item even
  though it is a sandwich, fries and a drink — do not split it. "A number one and a cookie" is two
  items.
- **The name carries the whole specification.** "large fry" and "medium fry" are different names,
  not one name with a size. Include the brand or restaurant when it was said, because the macros
  depend on it.
- **Quantity is a count, not a size.** Two large fries is quantity 2 of "large fry".
- Write names the way a person would say them back, in title case where that reads naturally. Do
  not invent detail that was not said, and do not expand an abbreviation you are not sure of.
- Pick the meal from what was said first, and from the clock only when the words do not say.`;

export async function parseDictation(params: {
  text: string;
  /** The speaker's local hour, so the clock can be the fallback for the meal slot. */
  hour: number;
}): Promise<ParsedDictation> {
  const fallbackMeal = mealForHour(params.hour);

  const response = await getClient().messages.create({
    ...requestBase(),
    max_tokens: 8192,
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
  });
  assertFinished(response.stop_reason, "Reading that");

  const raw = looseJson<{ meal?: unknown; items?: unknown }>(textOf(response.content));

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
  /**
   * Set only when the page it names is among this run's own search or fetch
   * results — checked in code, never taken on the model's word.
   */
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

/** The only judgement in the app: the numbers for a food the table has never seen. */
export async function estimateMacros(params: { name: string }): Promise<Estimate> {
  // The registry's tool versions, typed by the SDK rather than cast. The
  // `_20260209` tools filter results dynamically on this model. `tool_choice`
  // stays the default `auto`: a forced choice is a 400 on Sonnet 5.5.
  const search: Anthropic.ToolUnion = { type: MODEL_SPEC.search, name: "web_search", max_uses: 4 };
  // A nutrition page is a table, not a book. Capping what one fetch brings into
  // context bounds the cost of a page that turns out to be a whole menu.
  const fetchTool: Anthropic.ToolUnion = {
    type: MODEL_SPEC.fetch, name: "web_fetch", max_uses: 4, max_content_tokens: 20000,
  };
  const tools = [search, fetchTool];

  const messages: Anthropic.MessageParam[] = [
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
  let stop: string | null = null;
  // Every block the run produced, across paused turns, so the pages it read can
  // be checked against the page it cites.
  const seen: ResultBlock[] = [];
  // Server tools can end a turn with stop_reason "pause_turn" rather than a
  // result. Resume by handing the paused turn back; without this the answer is
  // silently truncated rather than erroring — which in this app would mean a
  // confidently wrong number instead of a visible failure.
  for (let i = 0; i < 6; i++) {
    const response = await getClient().messages.create({
      ...requestBase(),
      max_tokens: 16000,
      system: ESTIMATE_SYSTEM,
      tools,
      messages,
    });
    seen.push(...response.content);
    stop = response.stop_reason;

    if (stop === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    raw = textOf(response.content);
    break;
  }
  assertFinished(stop, `The estimate for "${params.name}"`);

  const parsed = looseJson<Record<string, unknown>>(raw);
  const macros = parseMacros(parsed);
  if (!macros) {
    throw new Error(`${MODEL_SPEC.label} did not return usable macros for "${params.name}".`);
  }

  const claimed = typeof parsed?.source_url === "string" ? parsed.source_url.trim() : "";
  const source_url = earnedUrl(claimed, urlsReadIn(seen));
  let note = typeof parsed?.note === "string" && parsed.note.trim() ? parsed.note.trim() : null;
  if (claimed && !source_url) {
    // Said so on the line, because a quietly dropped citation looks the same
    // as a model that never claimed one.
    note = [note, "It cited a page it did not read this run, so this is labelled an estimate."]
      .filter(Boolean).join(" ");
  }
  return { macros, source_url, note };
}
