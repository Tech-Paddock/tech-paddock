/**
 * How each guide tier presents itself: a word and a colour.
 *
 * Kept apart from `lib/guide.ts` on purpose. That file decides which tier a
 * search earned and refuses anything without a backing quote; this one only
 * decides how the answer is worded and lit. A presentation change must never
 * be able to reach the validation, and the way to guarantee that is for them
 * not to share a file.
 *
 * **The labels name where the instructions were found, never who they were
 * written for.** That is the only part a search can establish — Sweet Bloom
 * print one house recipe on every product page, so a tier-1 result means "this
 * was on the coffee's own page", not "the roaster wrote it for this lot".
 * `RULES.md` §2 is the long version. Wording that claims the second thing is
 * the one change that must not be made here.
 */

import type { GuideStatus } from "@/lib/guide";

export type GuideTone = "found" | "generic" | "missing" | "pending";

export type GuidePresentation = {
  label: string;
  tone: GuideTone;
  /** The indicator's fill. `--found` is Coffee's own; the rest are livery tokens. */
  dot: string;
};

const PRESENTATION: Record<GuideStatus, GuidePresentation> = {
  coffee_specific: {
    label: "Found Brew Guide on Page",
    tone: "found",
    dot: "bg-[var(--found)]",
  },
  roaster_generic: {
    label: "Non-Specific Roaster Brew Guide",
    tone: "generic",
    dot: "bg-warn",
  },
  none: {
    label: "No Recipe Found",
    tone: "missing",
    dot: "bg-urgent",
  },
  // The fourth state, and not one of the three lights. A bag saved before its
  // search has run has not failed to find anything — it has not looked yet,
  // and a red dot would report a result that does not exist.
  not_searched: {
    label: "Not searched yet",
    tone: "pending",
    dot: "bg-line",
  },
};

export function guidePresentation(status: GuideStatus): GuidePresentation {
  // A status the database grew that this file has not caught up with reads as
  // "not searched" rather than throwing or rendering an empty chip: an unknown
  // answer and a negative answer must not look the same.
  return PRESENTATION[status] ?? PRESENTATION.not_searched;
}
