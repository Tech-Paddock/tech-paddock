/**
 * The search models that can be compared, and what each one's request has to
 * look like.
 *
 * This is a registry rather than a list of names because the models do not
 * take the same request: the dynamic-filtering web tools are not available
 * below Sonnet 4.6, and Haiku 4.5 rejects `output_config.effort` outright. A
 * bare model swap would be a 400, so the differences live here, where picking
 * a model cannot get them wrong.
 *
 * It lives apart from `anthropic.ts` so the page can offer the choice without
 * importing the SDK into the browser bundle.
 */
export const SEARCH_MODELS = {
  "claude-haiku-4-5": { search: "web_search_20250305", fetch: "web_fetch_20250910", effort: null },
  "claude-sonnet-4-6": { search: "web_search_20260209", fetch: "web_fetch_20260209", effort: "high" },
  "claude-sonnet-5": { search: "web_search_20260209", fetch: "web_fetch_20260209", effort: "high" },
} as const;

export type SearchModel = keyof typeof SEARCH_MODELS;

/** Start at the cheapest and work up; which one holds up is the open question. */
export const DEFAULT_SEARCH_MODEL: SearchModel = "claude-haiku-4-5";

export const MODEL_LABELS: Record<SearchModel, string> = {
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-sonnet-5": "Sonnet 5",
};

export function isSearchModel(value: unknown): value is SearchModel {
  return typeof value === "string" && value in SEARCH_MODELS;
}
