/**
 * The one model every call in Cookbook runs on, and the one effort level
 * (TEC-133, 2026-10-22).
 *
 * Drafting (Ask Claude), reading a link, reading a file, pricing every way in,
 * re-pricing an edit and Tidy all go out as exactly this. There is no picker and
 * no effort dial anywhere, and the draft and edit routes ignore a `model` an
 * older copy of the page still sends. Changing either is the owner's call and
 * needs `tests/models.test.ts` to change with it.
 *
 * **Every request is built here** (`requestShape`), so no call site can name a
 * model, an effort or a thinking setting of its own. What Sonnet 5.5 refuses
 * with a 400, and so nothing here or at a call site sends: `thinking:
 * {type: "disabled"}`, `budget_tokens`, a non-default `temperature` / `top_p` /
 * `top_k`, a forced `tool_choice` (`any` / `tool`), and an assistant prefill.
 * Thinking is adaptive by default and left that way. Its default effort is
 * `high`, so `medium` is always sent explicitly.
 *
 * It lives apart from `anthropic.ts` so the page can name a model without
 * importing the SDK into the browser bundle. It started as a copy of Coffee's
 * `apps/coffee/lib/models.ts`; the copies are small and have diverged, and
 * whether they become shared is the technical director's call.
 *
 * **No `web_search` version, unlike Coffee's and Health's.** Nothing in this app
 * searches: the only tool call is fetching the one page you pasted, and this app
 * never reads a published number at all.
 */
export const MODEL = "claude-sonnet-5-5" as const;

export const EFFORT = "medium" as const;

export type ModelId = typeof MODEL;

/** The fetch tool for this model. Tool versions are per model, so this changes with `MODEL`. */
export const WEB_FETCH_TOOL = "web_fetch_20260209";

/**
 * Thinking tokens count against `max_tokens`. The headroom is for the thinking,
 * not a bigger answer — the answer is the same JSON either way — so a budget that
 * fits the JSON is not spent thinking before a word of it arrives.
 */
export const THINKING_HEADROOM = 12000;

/**
 * The model, its budget and its `output_config` for one request. Spread into
 * every `messages.create`, including a resumed `pause_turn`.
 */
export function requestShape(opts: { maxTokens: number; schema?: Record<string, unknown> }): {
  model: ModelId;
  max_tokens: number;
  output_config: Record<string, unknown>;
} {
  const format = opts.schema ? { format: { type: "json_schema", schema: opts.schema } } : {};
  return {
    model: MODEL,
    max_tokens: opts.maxTokens + THINKING_HEADROOM,
    output_config: { effort: EFFORT, ...format },
  };
}

/**
 * Display names, including models no call uses any more: a kept recipe keeps the
 * model that priced it (provenance never moves), and the book names it as it
 * was. This is a lookup for reading rows, not a choice.
 */
const LABELS: Record<string, string> = {
  [MODEL]: "Sonnet 5.5",
  "claude-sonnet-5": "Sonnet 5",
  "claude-haiku-4-5": "Haiku 4.5",
};

/** The label for a recorded model id; an id this file has never named shows as itself. */
export function modelLabel(id: string): string {
  return LABELS[id] ?? id;
}

/**
 * Is this a model a draft may say priced it? Today's, or one this app used
 * before TEC-133 — a draft made before a deploy and kept after it still names
 * the model that really priced it.
 */
export function isRecordedModel(value: unknown): value is string {
  return typeof value === "string" && value in LABELS;
}
