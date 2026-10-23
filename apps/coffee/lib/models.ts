/**
 * The one model every call in Coffee runs on, and the one effort level.
 *
 * Set once here (TEC-133, 2026-10-22): the label reader, the search, the
 * recipe-card copy-out and the suggestion all send exactly this. There is no
 * picker and no effort dial anywhere, and the search route ignores a `model`
 * or `effort` a caller still sends. Changing either is the owner's call and
 * needs `tests/models.test.ts` to change with it.
 *
 * Sent explicitly, never left to the API: Sonnet 5.5's default effort is
 * `high`, so omitting it would not mean `medium`.
 *
 * It lives apart from `anthropic.ts` so the page can name the model without
 * importing the SDK into the browser bundle.
 */
export const MODEL = "claude-sonnet-5-5";

export const EFFORT = "medium";

/**
 * The web tools for this model: the dynamic-filtering versions, which Sonnet
 * 5.5 supports. They are versioned per model, so they change with `MODEL`.
 */
export const WEB_SEARCH_TOOL = "web_search_20260209";
export const WEB_FETCH_TOOL = "web_fetch_20260209";

/**
 * Display names, including models no call uses any more: a bag or suggestion
 * keeps the model it recorded (`guide_model`, `suggested_recipe.model`), and
 * the page names it as it was. This is a lookup for reading old rows, not a
 * choice.
 */
const LABELS: Record<string, string> = {
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-sonnet-5": "Sonnet 5",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5": "Haiku 4.5",
};

export function modelLabel(model: string): string {
  return LABELS[model] ?? model;
}
