import Anthropic from "@anthropic-ai/sdk";
import { BREW_METHODS } from "./methods";
import { validateGuide, type Guide, type RawGuide } from "./guide";

const MODEL = "claude-sonnet-5";

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
    model: MODEL,
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
 * Tier 1 and 2 in one call. `allowed_domains` pins the search to the roaster's
 * own site when we know it — the prompt can ask for that, but only this
 * enforces it. The result is then re-checked in validateGuide, because search
 * is not the only way a URL reaches the conversation.
 */
export async function searchBrewGuide(params: {
  roaster: string;
  coffeeName: string;
  roasterDomain?: string | null;
}): Promise<Guide> {
  const tools: Record<string, unknown>[] = [
    {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: 6,
      ...(params.roasterDomain ? { allowed_domains: [params.roasterDomain] } : {}),
    },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
  ];

  const messages: Record<string, unknown>[] = [
    {
      role: "user",
      content:
        `Roaster: ${params.roaster}\nCoffee: ${params.coffeeName}\n\n` +
        `Find this roaster's brewing instructions for this coffee, working the three tiers in order. ` +
        `When you are done, give your answer as a JSON object with these keys: status (one of ` +
        `"coffee_specific", "roaster_generic", "none"), product_url, guide_url, params (an object ` +
        `with any of: method, ratio, dose, water, temp, grind, time — all strings, omit what the ` +
        `page does not state), and quotes (an array of {field, text, url}, one per reported ` +
        `parameter, each quoting the page verbatim). Put nothing after the JSON.` +
        (params.roasterDomain ? "" : `\n\nYou do not have a confirmed domain for this roaster. Establish their official site first, and read brewing instructions only from it.`),
    },
  ];

  let raw = "";
  // Server tools can end a turn with stop_reason "pause_turn" rather than a
  // result. Resume by handing the paused turn back; without this the answer
  // is silently truncated instead of erroring.
  for (let i = 0; i < 6; i++) {
    const response = (await getClient().messages.create({
      model: MODEL,
      max_tokens: 8192,
      output_config: { effort: "high" },
      system: SEARCH_SYSTEM,
      tools,
      messages,
    } as never)) as { stop_reason: string; content: { type: string; text?: string }[] };

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");
    break;
  }

  return validateGuide(parseGuideJson(raw), params.roasterDomain);
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
