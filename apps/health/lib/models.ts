/**
 * The one model this app calls, and what its request has to look like (TEC-133).
 *
 * Every call — the parse and the estimate — goes out as Claude Sonnet 5.5 at
 * effort `medium`. There is no picker, no effort dial and no comparison; changing
 * either is the owner's call and needs a test (`tests/models.test.ts` pins it).
 *
 * **Still a registry entry rather than a bare string**, because models differ in
 * what they accept: the web tool versions, whether effort is allowed, whether
 * thinking can be turned off. Keeping the request shape next to the model id
 * means a future swap has to change both together, here, instead of a one-word
 * edit that turns into a 400.
 *
 * What Sonnet 5.5 refuses, so nothing here or at a call site sends it:
 * `thinking: {type: "disabled"}`, `budget_tokens`, non-default `temperature` /
 * `top_p` / `top_k`, forced `tool_choice` (`any` / `tool`), and an assistant
 * prefill. Thinking is adaptive by default and left that way. Its effort
 * default is `high`, so `medium` is always sent explicitly.
 *
 * This file started as a copy of Coffee's `apps/coffee/lib/models.ts`; the two
 * have diverged and Health's is its own.
 */
export const MODEL = "claude-sonnet-5-5" as const;
export const EFFORT = "medium" as const;

export const MODEL_SPEC = {
  label: "Sonnet 5.5",
  search: "web_search_20260209",
  fetch: "web_fetch_20260209",
} as const;

export type ModelId = typeof MODEL;

/**
 * The fields every request starts from. Spread into each `messages.create`, so
 * the model and its effort cannot be set anywhere else.
 */
export function requestBase(): { model: ModelId; output_config: { effort: typeof EFFORT } } {
  return { model: MODEL, output_config: { effort: EFFORT } };
}

/**
 * Display names for every model a stored number may name. Past rows keep the
 * model that produced them (provenance never moves), so the models this app
 * used before TEC-133 stay readable here even though nothing calls them.
 */
const LABELS: Record<string, string> = {
  [MODEL]: MODEL_SPEC.label,
  "claude-sonnet-5": "Sonnet 5",
  "claude-haiku-4-5": "Haiku 4.5",
};

/** The label for a recorded model id; an id this file has never named shows as itself. */
export function modelLabel(id: string): string {
  return LABELS[id] ?? id;
}
