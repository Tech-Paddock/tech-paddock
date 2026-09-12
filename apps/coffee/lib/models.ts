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
  "claude-haiku-4-5": {
    search: "web_search_20250305",
    fetch: "web_fetch_20250910",
    // Empty, not "unset": this model returns a 400 for output_config.effort,
    // so there is no level that can be offered for it.
    efforts: [],
  },
  "claude-sonnet-4-6": {
    search: "web_search_20260209",
    fetch: "web_fetch_20260209",
    // No xhigh — it arrived a generation later.
    efforts: ["low", "medium", "high", "max"],
  },
  "claude-sonnet-5": {
    search: "web_search_20260209",
    fetch: "web_fetch_20260209",
    efforts: ["low", "medium", "high", "xhigh", "max"],
  },
} as const;

export type Effort = (typeof SEARCH_MODELS)[keyof typeof SEARCH_MODELS]["efforts"][number];

/** The API's own default, so leaving it alone changes nothing. */
export const DEFAULT_EFFORT = "high";

/**
 * Which levels this model will actually accept. The empty list is the whole
 * reason this is model-derived rather than a fixed dropdown: offering a level
 * for a model that rejects the parameter turns the toggle into a 400.
 */
export function effortsFor(model: SearchModel): readonly string[] {
  return SEARCH_MODELS[model].efforts;
}

export function isEffortFor(model: SearchModel, value: unknown): value is Effort {
  return typeof value === "string" && (effortsFor(model) as readonly string[]).includes(value);
}

export type SearchModel = keyof typeof SEARCH_MODELS;

/**
 * Start at the cheapest and work up; which one retrieves well enough is the
 * open question this registry exists to answer.
 *
 * Haiku is a safe place to start specifically because the guard is not in the
 * model. `validateGuide` enforces quote-backing in code, so a weaker model
 * cannot invent a brewing recipe — it can only fail to find one and report
 * `none`. The risk of going cheap here is degraded recall, not a wrong recipe
 * you would actually brew. That would not be true of a tool whose correctness
 * depended on the model's judgement, and it is why this dial exists at all.
 */
export const DEFAULT_SEARCH_MODEL: SearchModel = "claude-haiku-4-5";

export const MODEL_LABELS: Record<SearchModel, string> = {
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-sonnet-5": "Sonnet 5",
};

export function isSearchModel(value: unknown): value is SearchModel {
  return typeof value === "string" && value in SEARCH_MODELS;
}
