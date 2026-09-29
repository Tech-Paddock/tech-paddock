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
 * written for.** That is the only part a search can establish — a roaster
 * that printed one house recipe on every product page would validate as tier
 * 1 too, so a tier-1 result means "this was on the coffee's own page", not
 * "the roaster wrote it for this lot".
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

/**
 * A recipe the roaster printed as a picture (TEC-46), and the picture it came off.
 *
 * The values were copied off an image rather than quoted from the page's
 * text, so they are a reading — only as checkable as the picture. The image
 * sits with the quotes, under the status disclosure, as the evidence for the
 * values (Joel, 2026-09-29), and the caption asks for the check
 * rather than vouching.
 */
export const IMAGE_SOURCE_PRESENTATION = {
  caption: "Copied off this image on the roaster's page — check the numbers against it.",
  alt: "The roaster's recipe image the values were copied from",
  quoteNote: "read off the image",
} as const;

/**
 * The two sections of a bag's recipe, one above the other (Joel, 2026-09-29).
 *
 * The roaster's section holds whatever the search found — including nothing —
 * and Claude's holds its own suggestion. Both are always there, so the
 * headings are what keep them apart: each names whose it is.
 */
export const RECIPE_SECTIONS = {
  roaster: "Roaster's Recipe",
  claude: "Claude's Suggested Recipe",
} as const;

/**
 * The one thing on this screen that nobody published.
 *
 * It sits in the same card as the three tiers and must never read as a fourth
 * one. So it carries no tier colour — the light above it still answers "what
 * did the roaster say", whatever that answer is — and the wording names Claude
 * in the label itself rather than in small print underneath, because the
 * label is the part that gets read.
 *
 * The test beside this file checks that. A suggestion that quietly starts
 * reading like a found recipe is the single way this feature could damage the
 * thing the app is for, and it would happen through wording, here.
 */
export const SUGGESTION_PRESENTATION = {
  label: RECIPE_SECTIONS.claude,
  // Offered on every bag now, beside a found guide too, so the note cannot
  // say the roaster published nothing — on most bags that would be false.
  note: "Claude's own starting point. It is not the roaster's, and nothing on a page says it.",
  /** Deliberately not a tier colour. This is not a fourth light. */
  dot: "bg-ink/40",
} as const;
