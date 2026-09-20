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
 *
 * **No `effort` is ever sent, to either model.** Sonnet 5 accepts
 * `output_config.effort` and Haiku 4.5 rejects it outright, so the asymmetry is
 * real and the conservative path is to send neither. `effort` moving under
 * `output_config` has already caught this project once.
 */
export const DEFAULT_MODEL: ModelId = "claude-haiku-4-5";

export function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && value in MODELS;
}

export const MODEL_IDS = Object.keys(MODELS) as ModelId[];
