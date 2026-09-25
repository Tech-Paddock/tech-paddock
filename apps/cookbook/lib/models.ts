/**
 * The two models this app will use, and what each one's request has to look
 * like.
 *
 * **This is the third copy of a registry that started in `apps/coffee`**, by way
 * of `apps/health`. It is duplicated rather than shared, on the path `CLAUDE.md`
 * sets out for exactly this — *"duplicate the pattern locally, name it in your
 * pull request, and let them decide later whether it becomes shared"* — and the
 * technical director confirmed in #116 that the principle is not specific to the
 * theme. `packages/shared` landed in #152 and holds five files; whether a sixth
 * belongs there is the technical director's call, not this app's, so this copy is
 * **flagged in the branch handover and in `HANDOFF.md`** rather than made
 * quietly. A copy that is flagged is a decision deferred; a copy that is quiet
 * is drift.
 *
 * It is a registry rather than a list of names because the models do not take the
 * same request: the `web_fetch` tool version differs between them, so a bare
 * model swap is a 400 rather than a swap. Keeping the difference here means
 * picking a model cannot get it wrong.
 *
 * **No `web_search` version, unlike Coffee's and Health's.** Nothing in this app
 * searches: the only tool call is fetching the one page you pasted. Health needs
 * search because it looks up published nutrition for chains and packaged food,
 * and this app never reads a published number at all. Carrying the field would
 * be carrying a capability this app has decided against.
 */
export const MODELS = {
  "claude-haiku-4-5": {
    label: "Haiku 4.5",
    fetch: "web_fetch_20250910",
  },
  "claude-sonnet-5": {
    label: "Sonnet 5",
    fetch: "web_fetch_20260209",
  },
} as const;

export type ModelId = keyof typeof MODELS;

/**
 * **Haiku is the default, and it is a considered risk rather than an
 * assumption.**
 *
 * Every number this app stores is stamped with its source and its model, so a
 * bad Haiku estimate is visible in the book rather than indistinguishable from a
 * good one — and nothing a model produces is stored until you press Keep it.
 * Where the judgement is worth more than the latency, the picker on the screen
 * is right there.
 */
export const DEFAULT_MODEL: ModelId = "claude-haiku-4-5";

export type Effort = "low" | "medium";

/**
 * What a request has to carry for this model: its output budget and its
 * `output_config`.
 *
 * **The two models do not take the same request, and until 2026-09-25 this app
 * pretended they did** (TEC-29 item 7). Sonnet 5 thinks by default — omitting
 * `thinking` runs it adaptive — and at the API's default effort, `high`, so a
 * 2,048-token budget that was generous for Haiku could be spent thinking before
 * a word of JSON arrived. Haiku 4.5 has no thinking unless asked and **rejects
 * `output_config.effort` with a 400**, but accepts `output_config.format`.
 *
 * So: Sonnet 5 gets an explicit effort and room to think; Haiku gets neither,
 * and both get the schema when the caller has one. `effort` lives under
 * `output_config` — it moving there caught this project once.
 */
export function requestShape(
  model: ModelId,
  opts: { maxTokens: number; effort: Effort; schema?: Record<string, unknown> }
): { max_tokens: number; output_config?: Record<string, unknown> } {
  const format = opts.schema ? { format: { type: "json_schema", schema: opts.schema } } : {};
  if (model === "claude-sonnet-5") {
    // Thinking tokens count against max_tokens. The headroom is for the
    // thinking, not a bigger answer — the answer is the same JSON either way.
    return { max_tokens: opts.maxTokens + 12000, output_config: { effort: opts.effort, ...format } };
  }
  return { max_tokens: opts.maxTokens, ...(opts.schema ? { output_config: format } : {}) };
}

export function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && value in MODELS;
}

export const MODEL_IDS = Object.keys(MODELS) as ModelId[];
