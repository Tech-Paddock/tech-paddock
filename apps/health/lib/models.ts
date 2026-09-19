/**
 * The two models under comparison, and what each one's request has to look
 * like.
 *
 * **This is Coffee's `apps/coffee/lib/models.ts` duplicated, not shared.** It is
 * flagged in the pull request rather than made quietly: `CLAUDE.md` settles this
 * shape for the theme — "duplicate the pattern locally, name it in your pull
 * request, and let them decide later whether it becomes shared" — and the
 * technical director confirmed in issue #116 that the principle is not
 * theme-specific. **The `packages/shared` work on the ledger is where the real
 * fix lives**, and Health being the second copy is the strongest argument that
 * item has.
 *
 * Deliberately named rather than numbered. This comment cited a ledger item
 * number, which was right when written and wrong within the hour — the ledger
 * renumbered four times on 2026-09-19. Writing today's number here would repeat
 * the mistake in a comment complaining about it, so the work is named and the
 * ledger is left to say where it sits.
 *
 * It is a registry rather than a list of names because the models do not take
 * the same request: the web tool versions differ between them, so a bare model
 * swap is a 400 rather than a swap. Keeping the differences here means picking a
 * model cannot get them wrong.
 */
export const MODELS = {
  "claude-haiku-4-5": {
    label: "Haiku 4.5",
    search: "web_search_20250305",
    fetch: "web_fetch_20250910",
  },
  "claude-sonnet-5": {
    label: "Sonnet 5",
    search: "web_search_20260209",
    fetch: "web_fetch_20260209",
  },
} as const;

export type ModelId = keyof typeof MODELS;

/**
 * **Haiku is the default**, and the whole point of the debug harness is to find
 * out whether it can be the only one.
 *
 * Going cheap here is a considered risk rather than an assumption: every number
 * a model produces is stamped with its provenance and its model, so a bad Haiku
 * estimate is visible in the log rather than indistinguishable from a good one.
 * What it cannot do is quietly replace a number you entered by hand — that is
 * guardrail 3, enforced by the append-only versions rather than by the model.
 */
export const DEFAULT_MODEL: ModelId = "claude-haiku-4-5";

/** The comparison model. Never the default; only the harness reaches for it. */
export const COMPARISON_MODEL: ModelId = "claude-sonnet-5";

/**
 * **No effort is ever sent, to either model.** Sonnet 5 accepts
 * `output_config.effort` and Haiku 4.5 returns a 400 for it outright, so the
 * asymmetry is real — but two models is a clean experiment where two models
 * times five effort levels is a chore, and the plan says so. Recorded here
 * rather than omitted silently, because "why is there no effort dial" is
 * otherwise a question this file looks like it should answer.
 */
export function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && value in MODELS;
}

export const MODEL_IDS = Object.keys(MODELS) as ModelId[];
