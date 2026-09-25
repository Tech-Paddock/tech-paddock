/**
 * A recipe Claude suggested, for a coffee whose roaster published none.
 *
 * This is the one thing in this app that is deliberately invented, and the
 * whole of its design is about making sure it can never be mistaken for the
 * thing that is not. `RULES.md` §1 refuses a recipe that arrives without the
 * sentence it came from — that rule is about `guide_*`, and it is untouched:
 * `validateGuide` still drops every unbacked parameter, a bag with no guide
 * still reads **No Recipe Found**, and nothing here can write a guide column.
 *
 * What changed is that a `none` no longer has to be the end of it. Joel asked
 * for a suggestion in that case on 2026-09-19, having been asked twice what
 * should happen and where it should live. The answer this file encodes:
 *
 * - **Its own column.** `suggested_recipe`, never `guide_*`. "What did the
 *   roaster say" stays answerable by reading `guide_*` alone, which is the
 *   property the separation exists to protect.
 * - **No quotes, no URLs, ever.** A quote is a claim about a page somebody
 *   published. A suggestion has no page, so a quote on it would be a lie in
 *   the exact format this app uses to prove it is not lying.
 * - **It says who made it, on the bag and on the screen.** The model and the
 *   moment are part of the artifact, not metadata about it.
 *
 * The parameters stay strings, as `guide_*` does: "medium-fine, like table
 * salt" does not survive being parsed into a number, and a suggestion is read
 * by a person standing at a grinder.
 */

import { normalizeMethod, type BrewMethod } from "./methods";

export const SUGGESTION_FIELDS = ["ratio", "dose", "water", "temp", "grind", "time"] as const;

export type SuggestionField = (typeof SUGGESTION_FIELDS)[number];

export type Suggestion = {
  method: BrewMethod | null;
  params: Partial<Record<SuggestionField, string>>;
  /** Why these numbers for this coffee. Shown, because a suggestion you cannot argue with is worse than none. */
  rationale: string | null;
  /** What produced it. A suggestion is only comparable against another if you know what made it. */
  model: string;
  generated_at: string;
};

/** What the model hands back, before any of it is trusted to be the right shape. */
export type RawSuggestion = {
  method?: string | null;
  params?: Partial<Record<SuggestionField, string | null>>;
  rationale?: string | null;
};

/**
 * Reduce a model response to a suggestion, or to nothing.
 *
 * Never throws, and deliberately shaped like `validateGuide` at the edges so
 * the two read as siblings — but it is not the same check and must not be
 * mistaken for one. There is no quote to verify here and there never will be.
 * What this enforces is narrower and it is the part that matters: only the
 * fields named above survive, so a `status`, a `product_url` or a `quotes`
 * array arriving in this payload is dropped rather than carried into a column
 * that means something else.
 */
export function coerceSuggestion(raw: unknown, model: string, now: Date = new Date()): Suggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as RawSuggestion;

  const params: Suggestion["params"] = {};
  for (const field of SUGGESTION_FIELDS) {
    const value = input.params?.[field];
    if (typeof value === "string" && value.trim()) params[field] = value.trim();
  }

  // Onto the same vocabulary the roaster's own method is normalized to, so a
  // suggestion and a guide can be read side by side. Unplaceable is null, not
  // a nearest match.
  const method = typeof input.method === "string" ? normalizeMethod(input.method) : null;

  // Nothing usable is nothing, not an empty recipe. An empty card would read
  // as a suggestion that happened to say very little.
  if (!method && Object.keys(params).length === 0) return null;

  const rationale = typeof input.rationale === "string" && input.rationale.trim() ? input.rationale.trim() : null;

  return { method, params, rationale, model, generated_at: now.toISOString() };
}

/**
 * A suggestion as bag columns.
 *
 * Every key it can return starts with `suggested_`, and that is enforced by a
 * test rather than by care. This function is the only way a suggestion reaches
 * the database, so it is the one place a widening mistake would have to pass
 * through.
 */
export function suggestionColumns(
  suggestion: Suggestion | null,
  error: string | null = null
): { suggested_recipe?: Suggestion | null; suggested_error: string | null } {
  // **A failure writes only the failure.** Until 2026-09-25 it wrote
  // `suggested_recipe: null` as well, so a failed "Ask again" deleted the good
  // suggestion it was asked to replace. The recipe column is now touched only
  // by a suggestion that exists.
  if (!suggestion && error) return { suggested_error: error };
  return {
    suggested_recipe: suggestion,
    suggested_error: error,
  };
}
