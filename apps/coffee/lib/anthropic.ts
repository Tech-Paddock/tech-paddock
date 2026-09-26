import Anthropic from "@anthropic-ai/sdk";
import { BREW_METHODS } from "./methods";
import { coerceSuggestion, type Suggestion } from "./suggestion";
import { SEARCH_MODELS, DEFAULT_SEARCH_MODEL, isEffortFor, type SearchModel } from "./models";
import { concludeSearch, readTurn, SearchFailed, type ResultBlock, type SearchOutcome } from "./searchRun";
import { SEARCH_BUDGET_MS } from "./searchClock";
import {
  combineReads,
  galleryImagesIn,
  imageGuide,
  isFetchableUrl,
  RECIPE_CARD_SCHEMA,
  shouldReadImages,
  type ImageRead,
} from "./recipeImage";

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
export async function identifyBag(image: {
  media_type: Anthropic.Base64ImageSource["media_type"];
  data: string;
}): Promise<BagIdentity> {
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
          { type: "image", source: { type: "base64", ...image } },
          {
            type: "text",
            text: "Read this coffee bag. Return the roaster, the coffee name, and the origin, process, varietal and roast date if printed.",
          },
        ],
      },
    ],
  });

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
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
 * **A product URL the bag already holds is handed over instead.** Joel,
 * 2026-09-22: *"Refresh should refer product url."* Naming it in the message is
 * what makes it fetchable, for the same reason above. It is read off the row by
 * the route rather than supplied by the caller, and there is one message either
 * way — *"Research is a trigger"*, not a second kind of search. If the page is
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
}): Promise<SearchOutcome> {
  const model = params.model ?? DEFAULT_SEARCH_MODEL;
  const spec = SEARCH_MODELS[model];
  // Only a level this model accepts is sent. Anything else is dropped rather
  // than passed through, because the request would fail rather than degrade.
  const effort = isEffortFor(model, params.effort) ? params.effort : null;

  const tools: Anthropic.ToolUnion[] = [
    { type: spec.search, name: "web_search", max_uses: 6 },
    { type: spec.fetch, name: "web_fetch", max_uses: 6 },
  ];

  const known = params.productUrl?.trim() || null;

  // One message, whether or not a product page is known. The URL is a fact
  // about the bag that is present or absent, not a second mode of searching:
  // a prompt that branched would make a re-search a different process from the
  // first search, which is the thing Joel ruled out on 2026-09-22.
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        `Roaster: ${params.roaster}\nCoffee: ${params.coffeeName}\n` +
        (known ? `Known product page for this coffee: ${known}\n` : "") +
        `\nFind this roaster's brewing instructions for this coffee, working the three tiers in order. ` +
        `Establish the roaster's official site and read brewing instructions only from it. ` +
        (known
          ? `A known product page is given above: fetch it directly and start there. If it no longer ` +
            `loads or no longer describes this coffee, the roaster has moved or removed it — search ` +
            `for the current page as you otherwise would, and report nothing from the old URL. `
          : "") +
        `When you are done, give your answer as a JSON object with these keys: status (one of ` +
        `"coffee_specific", "roaster_generic", "none"), product_url, guide_url, params (an object ` +
        `with any of: method, ratio, dose, water, temp, grind, time — all strings, omit what the ` +
        `page does not state), and quotes (an array of {field, text, url}, one per reported ` +
        `parameter, each quoting the page verbatim). Put nothing after the JSON.`,
    },
  ];

  // The search's own clock, inside the route's `maxDuration` — see
  // `lib/searchClock.ts`. It spans every resumed turn, so ten turns cannot add
  // up to more time than the platform will give the function.
  const deadline = AbortSignal.timeout(SEARCH_BUDGET_MS);

  // Every block of every turn: the tool results are the evidence of what the
  // run did, and `concludeSearch` reads them rather than the answer's word.
  const blocks: ResultBlock[] = [];
  let text: string | null = null;

  // Server tools can end a turn with stop_reason "pause_turn" rather than a
  // result. Resume by handing the paused turn back; without this the answer is
  // silently truncated instead of erroring. Ten, because ten is where the
  // server's own sampling loop pauses — a lower cap here just cuts off a search
  // that was still working.
  for (let i = 0; i < 10; i++) {
    const request: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: searchMaxTokens(effort),
      // Omitted rather than defaulted for a model that has no effort control:
      // sending it anyway is a 400, not a no-op.
      ...(effort ? { output_config: { effort } } : {}),
      // Each resume re-sends the whole conversation, fetched pages included.
      // Caching the prefix makes a resume pay for what is new rather than for
      // everything read so far. Top-level, so the breakpoint moves to the end
      // of the conversation on each turn by itself.
      cache_control: { type: "ephemeral" },
      system: SEARCH_SYSTEM,
      tools,
      messages,
    };

    let response: Anthropic.Message;
    try {
      response = await getClient().messages.create(request, { signal: deadline });
    } catch (error) {
      if (deadline.aborted) {
        throw new SearchFailed(
          `The search was still working after ${Math.round(SEARCH_BUDGET_MS / 1000)} seconds and was stopped before it answered.`
        );
      }
      throw error;
    }

    blocks.push(...(response.content as ResultBlock[]));

    const turn = readTurn(response as { stop_reason: string | null; content: ResultBlock[] });
    if (turn.resume) {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    text = turn.text;
    break;
  }

  // Running out of resumes is not an answer. Left as it was, the empty string
  // parsed to {} and came out as a confident tier-3 `none` — a search that was
  // cut off mid-flight, recorded as "this roaster publishes nothing".
  if (text === null) {
    throw new SearchFailed("The search was still working after 10 turns and was stopped before it answered.");
  }

  // Validation, the tool failures and the stale link are all decided in
  // `lib/searchRun.ts`, where they can be tested without an API call. A `none`
  // the run could not earn is thrown from there, so the route records why on
  // the row and leaves the bag's guide untouched.
  const outcome = concludeSearch(text, blocks, params.roaster);

  // A recipe printed as a picture never reached the model above: `web_fetch`
  // reads a page as text. So below tier 1, with a product page known, the
  // page's gallery is read too (TEC-47), inside the same clock. Which answer
  // the bag keeps is decided in `lib/recipeImage.ts`.
  if (!shouldReadImages(outcome.guide)) return outcome;
  return combineReads(outcome, await readRecipeImages(outcome.guide.product_url as string, deadline));
}

/**
 * Transcribing a printed card is the label reader's job in another shape, so
 * it runs on the same model, at `effort: "low"`, with a JSON schema — and, like
 * the label reader, with no web tools: it reads the images it is handed and
 * nothing else.
 */
const RECIPE_CARD_MODEL = "claude-sonnet-5";

const RECIPE_CARD_SYSTEM = `You copy brewing recipes off images from a coffee roaster's product page.

Some roasters print their recipe as a picture — a recipe card, a table, a label — instead of as
text. You are shown the images from one product page, numbered. If any of them prints a brewing
recipe, copy it out. If none does, return an empty list. An empty list is a correct and useful
answer.

Absolute rules:

- Copy only what is printed. Never fill in, infer, convert, calculate or complete a value. If a
  value is not printed, it is null.
- For every value you report, give in the matching _printed key the exact text it was copied from,
  as printed, including its label if it has one (for example "dose 139.5g").
- One entry per recipe. A card with two columns (say, batch and espresso) is two entries. Put the
  column's printed heading in heading, or null if it has none.
- image is the number of the image the recipe is printed on.
- water is the water that goes into the brew. A yield, a beverage weight or an espresso's "out"
  is not water: leave water null rather than put one of those there.
- method is the brew method or brewer as printed. grind is a grind size or setting, not the name
  of a grinder.
- Ignore anything that is not a brewing recipe: tasting notes, prices, origin details.`;

/** Image types the API takes. Anything else on a gallery is skipped. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Under the API's per-image ceiling with room to spare once base64 adds a third. */
const MAX_IMAGE_BYTES = 3_500_000;

/** A product page is text; one bigger than this is not one worth reading. */
const MAX_PAGE_BYTES = 3_000_000;

const FETCH_HEADERS = {
  // Some storefronts refuse a request that does not look like a browser.
  "user-agent": "Mozilla/5.0 (compatible; PaddockCoffee/1.0; +https://coffee.techpaddock.io)",
  accept: "text/html,application/xhtml+xml,image/avif,image/webp,image/*;q=0.9,*/*;q=0.8",
};

/** One fetch, bounded by its own timeout and by the search's clock. */
function bounded(signal: AbortSignal, ms: number): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
}

/**
 * Read the product page's gallery for a printed recipe.
 *
 * **Never throws.** Every way this can fail is an `ImageRead` of kind
 * `failed`, which the caller records as a warning beside the text search's
 * answer: the search already has an answer, and a card that could not be read
 * must neither erase it nor pass as "there was no card".
 *
 * The server fetches the page and the images itself, because the model's
 * `web_fetch` returns text only — which is the whole reason this exists.
 */
export async function readRecipeImages(productUrl: string, signal: AbortSignal): Promise<ImageRead> {
  try {
    if (!isFetchableUrl(productUrl)) return { kind: "skipped" };

    const page = await fetch(productUrl, { headers: FETCH_HEADERS, redirect: "follow", cache: "no-store", signal: bounded(signal, 20_000) });
    if (!page.ok) return { kind: "failed", message: `the product page returned ${page.status}` };
    const type = page.headers.get("content-type") ?? "";
    if (!/html/i.test(type)) return { kind: "failed", message: `the product page is not HTML (${type || "no type"})` };
    // A redirect lands wherever it lands; the check that it is still the
    // roaster's site is `validateGuide`'s, against this URL.
    const reachedUrl = page.url || productUrl;
    const html = (await page.text()).slice(0, MAX_PAGE_BYTES);

    const gallery = galleryImagesIn(html, reachedUrl).filter((i) => isFetchableUrl(i.url));
    // A page with no gallery has no card to read. That is an answer, not a failure.
    if (gallery.length === 0) return { kind: "read", guide: imageGuide({ recipes: [] }, { url: productUrl, reachedUrl }, []).guide, espresso: false };

    const loaded = (
      await Promise.all(
        gallery.map(async (image) => {
          try {
            const res = await fetch(image.url, { headers: FETCH_HEADERS, cache: "no-store", signal: bounded(signal, 15_000) });
            const mediaType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
            if (!res.ok || !IMAGE_TYPES.has(mediaType)) return null;
            const bytes = Buffer.from(await res.arrayBuffer());
            if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
            return { image, mediaType: mediaType as Anthropic.Base64ImageSource["media_type"], data: bytes.toString("base64") };
          } catch {
            return null;
          }
        })
      )
    ).filter((x): x is NonNullable<typeof x> => x !== null);

    if (loaded.length === 0) {
      return { kind: "failed", message: `none of the ${gallery.length} gallery image${gallery.length === 1 ? "" : "s"} loaded` };
    }

    const content: Anthropic.ContentBlockParam[] = loaded.flatMap((l, i) => [
      { type: "text" as const, text: `Image ${i + 1}:` },
      { type: "image" as const, source: { type: "base64" as const, media_type: l.mediaType, data: l.data } },
    ]);
    content.push({
      type: "text",
      text: "These are the images from one coffee's product page. Copy out any brewing recipe printed on them.",
    });

    const response = await getClient().messages.create(
      {
        model: RECIPE_CARD_MODEL,
        max_tokens: 2048,
        output_config: { effort: "low", format: { type: "json_schema", schema: RECIPE_CARD_SCHEMA } },
        system: RECIPE_CARD_SYSTEM,
        messages: [{ role: "user", content }],
      },
      { signal }
    );
    if (response.stop_reason !== "end_turn") {
      return { kind: "failed", message: `the image reader stopped early (${response.stop_reason ?? "no reason given"})` };
    }

    const answer = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    let copyOut: unknown;
    try {
      copyOut = JSON.parse(answer?.text ?? "");
    } catch {
      return { kind: "failed", message: "the image reader's answer was not the JSON it was asked for" };
    }

    // Only the images actually shown are passed on, in the order they were
    // numbered, so an image number in the answer resolves to what was read.
    return {
      kind: "read",
      ...imageGuide(copyOut, { url: productUrl, reachedUrl }, loaded.map((l) => l.image)),
    };
  } catch (error) {
    if (signal.aborted) return { kind: "failed", message: "the search's time ran out before they were read" };
    return { kind: "failed", message: error instanceof Error ? error.message : "an unknown error" };
  }
}

/**
 * Room for the answer. At `xhigh` and `max` the model thinks more, and the
 * thinking comes out of this same budget — 8192 left a long search able to
 * spend its whole allowance thinking and stop at `max_tokens` before it wrote
 * the JSON. 16000 stays under the SDK's non-streaming ceiling (about 21,000),
 * past which it refuses the request and demands streaming.
 */
function searchMaxTokens(effort: string | null): number {
  return effort === "xhigh" || effort === "max" ? 16_000 : 8192;
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
}, signal?: AbortSignal): Promise<Suggestion | null> {
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
  }, { signal });

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  let raw: unknown = null;
  try {
    raw = JSON.parse(text?.text ?? "null");
  } catch {
    // A response that did not come back as the schema asked is nothing, not a
    // half-recipe. coerceSuggestion says the same thing about a null.
  }
  return coerceSuggestion(raw, SUGGEST_MODEL);
}
