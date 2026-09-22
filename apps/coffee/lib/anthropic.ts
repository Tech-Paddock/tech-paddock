import Anthropic from "@anthropic-ai/sdk";
import { BREW_METHODS } from "./methods";
import { validateGuide, type Guide, type RawGuide } from "./guide";
import { coerceSuggestion, type Suggestion } from "./suggestion";
import { SEARCH_MODELS, DEFAULT_SEARCH_MODEL, isEffortFor, type SearchModel } from "./models";
import { toolErrorsIn, unearnedNone } from "./searchRun";

/**
 * Reading a label is transcription and it is already fast, so it stays on the
 * model that is known to do it well. Only the search is under comparison.
 */
const IDENTIFY_MODEL = "claude-sonnet-5";

let client: Anthropic | null = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY must be set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export type BagIdentity = {
  roaster: string | null;
  coffee_name: string | null;
  origin: string | null;
  process: string | null;
  varietal: string | null;
  roast_date: string | null;
};

const IDENTITY_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: Object.fromEntries(
    ["roaster", "coffee_name", "origin", "process", "varietal", "roast_date"].map((k) => [
      k,
      { type: ["string", "null"] },
    ])
  ),
  required: ["roaster", "coffee_name", "origin", "process", "varietal", "roast_date"],
};

/**
 * Read the bag. This step is transcription, not reasoning — low effort is
 * the right setting and keeps the round trip short while you're standing in
 * a kitchen holding the bag.
 */
export async function identifyBag(image: { media_type: string; data: string }): Promise<BagIdentity> {
  const response = await getClient().messages.create({
    model: IDENTIFY_MODEL,
    max_tokens: 1024,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: IDENTITY_SCHEMA },
    },
    system:
      "You read coffee bag labels. Report only text that is actually legible on the bag. " +
      "Use null for anything not printed there — never guess a roaster or a coffee name from " +
      "the design, and never complete a partially visible word.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", ...image } as never },
          {
            type: "text",
            text: "Read this coffee bag. Return the roaster, the coffee name, and the origin, process, varietal and roast date if printed.",
          },
        ],
      },
    ],
  } as never);

  const text = (response as { content: { type: string; text?: string }[] }).content.find((b) => b.type === "text");
  try {
    return JSON.parse(text?.text ?? "{}") as BagIdentity;
  } catch {
    return { roaster: null, coffee_name: null, origin: null, process: null, varietal: null, roast_date: null };
  }
}

const SEARCH_SYSTEM = `You find a roaster's own brewing instructions for a specific coffee.

Work three tiers in order and stop at the first that succeeds:

1. coffee_specific — brewing instructions published for this exact coffee, normally on its
   product page.
2. roaster_generic — if this coffee has none of its own, the roaster's general brew guide,
   found ON THE ROASTER'S OWN SITE ONLY.
3. none — if neither exists, report that. This is a correct and useful answer.

Absolute rules:

- Report only numbers and instructions that appear verbatim on a page you actually read. For
  every parameter you report, give the sentence it came from and the URL it was on.
- Never infer a parameter from general coffee knowledge, from a similar coffee, or from the
  roaster's other products. If the page does not say it, omit it.
- Never take brewing instructions from anywhere but the roaster's own site. Not a blog, not a
  retailer, not a forum, not a review.
- A tier-3 "none" is always better than a plausible guess. You are not being asked to help
  someone brew; you are being asked what this roaster published.

Also report the coffee's own product page URL if you find it, even when the brewing
instructions came from a different page on the same site.`;

/**
 * Tier 1 and 2 in one call.
 *
 * **Nothing is pinned up front.** Until 2026-09-22 a roaster whose domain a
 * previous search had verified had `allowed_domains` set on the search from
 * the start. Joel ended it — *"we should not be prepining any roaster info"* —
 * and the measurement behind that is in the row history: the first Sweet Bloom
 * bag searched unpinned and came back tier 1 with four quotes, the second
 * searched pinned and came back `none`, with no code change in between.
 *
 * The mechanism is that `web_fetch` only fetches URLs already present in the
 * conversation, so search is the sole channel by which any page can enter it.
 * Narrowing that channel to one host does not make the search more careful; it
 * removes the model's only way of reaching the site at all when the pinned
 * query surfaces nothing. **The host check in `validateGuide` is unchanged and
 * is now the whole of the constraint**, which is what it was for every first
 * search this app has ever run — including the one that worked.
 *
 * **A product URL we already hold is handed over instead.** Joel, 2026-09-22:
 * *"Refresh should refer product url."* Naming it in the message is what makes
 * it fetchable, for the same reason above, so a re-search reads the page it
 * already knows about rather than trying to rediscover it. If that page is
 * gone the model searches as it otherwise would — *"I'm fine if the url fails
 * because they've moved or removed their beans"* — so a stale link costs one
 * fetch and never becomes a dead end the bag cannot recover from.
 */
export async function searchBrewGuide(params: {
  roaster: string;
  coffeeName: string;
  /** A product page a previous search found, read first when we have one. */
  productUrl?: string | null;
  model?: SearchModel;
  effort?: string | null;
}): Promise<Guide> {
  const model = params.model ?? DEFAULT_SEARCH_MODEL;
  const spec = SEARCH_MODELS[model];
  // Only a level this model accepts is sent. Anything else is dropped rather
  // than passed through, because the request would fail rather than degrade.
  const effort = isEffortFor(model, params.effort) ? params.effort : null;

  const tools: Record<string, unknown>[] = [
    { type: spec.search, name: "web_search", max_uses: 6 },
    { type: spec.fetch, name: "web_fetch", max_uses: 6 },
  ];

  const known = params.productUrl?.trim() || null;

  const messages: Record<string, unknown>[] = [
    {
      role: "user",
      content:
        `Roaster: ${params.roaster}\nCoffee: ${params.coffeeName}\n` +
        (known ? `Known product page: ${known}\n` : "") +
        `\nFind this roaster's brewing instructions for this coffee, working the three tiers in order. ` +
        (known
          ? `Read the known product page above first — fetch it directly. If it no longer loads or no ` +
            `longer describes this coffee, the roaster has moved or removed it: search for the current ` +
            `page as you otherwise would, and do not report anything from the old URL. `
          : `Establish the roaster's official site first, and read brewing instructions only from it. `) +
        `When you are done, give your answer as a JSON object with these keys: status (one of ` +
        `"coffee_specific", "roaster_generic", "none"), product_url, guide_url, params (an object ` +
        `with any of: method, ratio, dose, water, temp, grind, time — all strings, omit what the ` +
        `page does not state), and quotes (an array of {field, text, url}, one per reported ` +
        `parameter, each quoting the page verbatim). Put nothing after the JSON.`,
    },
  ];

  let raw = "";
  let answered = false;
  const toolErrors: string[] = [];
  // Server tools can end a turn with stop_reason "pause_turn" rather than a
  // result. Resume by handing the paused turn back; without this the answer is
  // silently truncated instead of erroring. Ten, because ten is where the
  // server's own sampling loop pauses — a lower cap here just cuts off a search
  // that was still working.
  for (let i = 0; i < 10; i++) {
    const response = (await getClient().messages.create({
      model,
      max_tokens: 8192,
      // Omitted rather than defaulted for a model that has no effort control:
      // sending it anyway is a 400, not a no-op.
      ...(effort ? { output_config: { effort } } : {}),
      system: SEARCH_SYSTEM,
      tools,
      messages,
    } as never)) as { stop_reason: string; content: { type: string; text?: string; content?: unknown }[] };

    toolErrors.push(...toolErrorsIn(response.content));

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");
    answered = true;
    break;
  }

  // Running out of resumes is not an answer. Left as it was, the empty string
  // parsed to {} and came out as a confident tier-3 `none` — a search that was
  // cut off mid-flight, recorded as "this roaster publishes nothing".
  if (!answered) {
    throw new Error("The search was still working after 10 turns and was stopped before it answered.");
  }

  const guide = validateGuide(parseGuideJson(raw), null);

  // A `none` reached past a tool that failed is not an answer about the
  // roaster. Thrown rather than returned, so the route records why on the row
  // and leaves the bag's guide untouched — the rule itself is in
  // `lib/searchRun.ts`, where it can be tested without an API call.
  const unearned = unearnedNone(guide.status, toolErrors);
  if (unearned) throw new Error(unearned);

  return guide;
}

/** The model is asked for bare JSON but answers after a search narrative often enough to matter. */
function parseGuideJson(text: string): RawGuide {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1), text];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate.trim());
      if (parsed && typeof parsed === "object") return parsed as RawGuide;
    } catch {
      // Try the next shape.
    }
  }
  return {};
}

export const METHOD_VOCABULARY = BREW_METHODS;

/**
 * Reading a label is transcription; retrieving a guide is retrieval; this is
 * the only call in the app that is asked for a judgement. Sonnet 5 is Joel's
 * choice, made on 2026-09-19 when he asked for the feature, and it is fixed
 * rather than selectable: the search offers a model picker because which model
 * *retrieves* well enough is an open question with a right answer somewhere.
 * There is no comparable right answer here, so a dial would only produce
 * suggestions that are not comparable with each other.
 */
const SUGGEST_MODEL = "claude-sonnet-5";

/**
 * `medium`, not the default `high`. The reasoning asked for is short — a
 * handful of known attributes onto a starting point — and the output is six
 * strings and a sentence. `high` bought nothing on a task this shaped, and
 * this call runs unattended at the end of a search that has already taken
 * minutes.
 */
const SUGGEST_EFFORT = "medium";

const SUGGESTION_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    method: { type: ["string", "null"] },
    params: {
      type: "object" as const,
      additionalProperties: false,
      properties: Object.fromEntries(
        ["ratio", "dose", "water", "temp", "grind", "time"].map((k) => [k, { type: ["string", "null"] }])
      ),
      required: ["ratio", "dose", "water", "temp", "grind", "time"],
    },
    rationale: { type: ["string", "null"] },
  },
  required: ["method", "params", "rationale"],
};

const SUGGEST_SYSTEM = `You are suggesting a starting point for brewing a coffee whose roaster
published no brewing instructions anywhere on their own site. A search has already been run and
found nothing; you are not being asked to find anything.

This is explicitly your own recommendation, and it will be shown as yours. Do not claim, imply or
invent that a roaster, a retailer or any page says any of it. Do not cite a source. Do not name a
URL. If you happen to recall this specific coffee, still give your own recommendation rather than
reporting what you remember somebody publishing.

Work from what the bag says — origin, process, varietal, roast date — and from general practice for
that kind of coffee. Give a conventional, forgiving starting point that someone can dial in from,
not a clever one.

Use the units a roaster would print: grams, a 1:N ratio, degrees C, a time as m:ss, and a grind
described in words rather than microns unless a number is genuinely standard for the method.

Give a one-sentence rationale that says what about this coffee moved the numbers. If nothing about
it did, say that plainly instead of inventing a reason.`;

/**
 * A recipe of Claude's own, for a bag whose roaster published none.
 *
 * Deliberately has no web tools. Giving it search would make the result a
 * blend of remembered practice and something half-read on a page, and the
 * whole value of the separation between this and `guide_*` is that you can
 * say which one you are looking at. This one has read nothing, by
 * construction.
 */
export async function suggestRecipe(bag: {
  roaster: string;
  coffeeName: string;
  origin?: string | null;
  process?: string | null;
  varietal?: string | null;
  roastDate?: string | null;
}): Promise<Suggestion | null> {
  const known = [
    `Roaster: ${bag.roaster}`,
    `Coffee: ${bag.coffeeName}`,
    bag.origin ? `Origin: ${bag.origin}` : null,
    bag.process ? `Process: ${bag.process}` : null,
    bag.varietal ? `Varietal: ${bag.varietal}` : null,
    bag.roastDate ? `Roasted: ${bag.roastDate}` : null,
  ].filter(Boolean);

  const response = await getClient().messages.create({
    model: SUGGEST_MODEL,
    max_tokens: 2048,
    output_config: {
      effort: SUGGEST_EFFORT,
      format: { type: "json_schema", schema: SUGGESTION_SCHEMA },
    },
    system: SUGGEST_SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `${known.join("\n")}\n\n` +
          `No brewing instructions were found for this coffee on the roaster's own site. ` +
          `Suggest a starting point for brewing it.`,
      },
    ],
  } as never);

  const text = (response as { content: { type: string; text?: string }[] }).content.find((b) => b.type === "text");
  let raw: unknown = null;
  try {
    raw = JSON.parse(text?.text ?? "null");
  } catch {
    // A response that did not come back as the schema asked is nothing, not a
    // half-recipe. coerceSuggestion says the same thing about a null.
  }
  return coerceSuggestion(raw, SUGGEST_MODEL);
}
