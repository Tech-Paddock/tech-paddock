import type { Para } from "./paragraphs";

/**
 * What counts as a section heading, and what counts as an employment entry line.
 *
 * **This exists because the same question was being answered in three places and
 * one of them got it wrong.** `ats.ts` decided whether a heading was one a parser
 * would recognise, `outline.ts` decided which paragraphs opened a section, and
 * `label.ts` decided which line began a job — each with its own rule. On Joel's
 * template `outline.ts` reported **Professional Experience as zero lines** and
 * his five jobs as five sibling sections, because its rule was run size alone and
 * his headings and entry lines are both 11pt.
 *
 * That is the drift `CLAUDE.md` names: one fact with three homes, and no way to
 * fix it once. It is one home now.
 */

/** The sections the renderer knows how to fill or carry through. */
export type SectionKey =
  | "summary"
  | "careerHighlights"
  | "experience"
  | "competencies"
  | "education"
  | "certifications"
  | "hobbies";

/**
 * **The one heading vocabulary** — every heading text this app recognises, and
 * the section each one opens.
 *
 * It was three lists: the renderer's aliases in `reskin/sections.ts`, the ATS
 * lint's `KNOWN_HEADINGS`, and — by run shape rather than by text — the spec
 * extractor's idea of what was not a heading. They had already disagreed: the
 * lint knew "Projects" and the renderer did not, so a source's Projects section
 * was read as more jobs under Experience.
 *
 * `null` is a heading a parser recognises that this template has no section
 * for. It still ends the section before it — which is the point — and whatever
 * sits under it is reported as not carried over rather than being folded into
 * whatever came first.
 */
const SECTION_HEADINGS: Record<string, SectionKey | null> = {
  summary: "summary",
  "professional summary": "summary",
  objective: "summary",
  "career highlights": "careerHighlights",
  highlights: "careerHighlights",
  "professional experience": "experience",
  experience: "experience",
  "work experience": "experience",
  employment: "experience",
  "core competencies": "competencies",
  skills: "competencies",
  "technical skills": "competencies",
  // "Education & Certifications" as one heading maps to education; the split
  // headings each get their own section.
  "education & certifications": "education",
  "education and certifications": "education",
  education: "education",
  certifications: "certifications",
  "certifications & licenses": "certifications",
  "licenses & certifications": "certifications",
  hobbies: "hobbies",
  interests: "hobbies",
  projects: null,
  volunteer: null,
};

export function normalizeHeadingText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/:$/, "");
}

/** Own keys only: a paragraph reading "constructor" is not a heading. */
const lookup = (text: string): SectionKey | null | undefined => {
  const key = normalizeHeadingText(text);
  return Object.prototype.hasOwnProperty.call(SECTION_HEADINGS, key) ? SECTION_HEADINGS[key] : undefined;
};

/** A heading a parser would recognise — the ATS lint's question, and the extractor's. */
export function isKnownHeading(text: string): boolean {
  return lookup(text) !== undefined;
}

/** The section a heading opens, or null for text that opens none this app fills. */
export function sectionKeyOf(text: string): SectionKey | null {
  return lookup(text) ?? null;
}

/**
 * A date range, in the shapes a resume writes one.
 *
 * Moved here from the old labeller, `label.ts` (retired in TEC-63), which was a
 * consumer of this idea rather than its owner: it is the single strongest signal that a line is a job entry and not a
 * section heading, so it belongs with the rule that uses it.
 */
export const DATE_RANGE =
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|\d{4})\s*[–—-]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|Present|Current|\d{4})/i;

/**
 * `Company   Title ⇥ Dates` — one job, on one line.
 *
 * **The date range is what makes it a job**, not the tab. A `Systems:⇥Alpha
 * Suite · Beta Cloud` competency row is tabbed the same way and is not a job, so
 * counting tabs here reported three jobs under Core Competencies. A regression
 * test holds that line.
 */
export function isEntryLine(p: Para): boolean {
  const text = p.text.trim();
  if (!text || p.listId || p.inTable) return false;
  return DATE_RANGE.test(text);
}

/**
 * Could this paragraph be a section heading at all, before size is considered?
 *
 * **Deliberately not `!isEntryLine`, and the difference is the point.** "Is this
 * a job?" and "could this be a heading?" are different questions with different
 * answers, and the tab is why: a heading is a bare label, so an interior tab
 * positioning a second field rules one out — whether the line is a job, a
 * competency row, or anything else laid out against a tab stop. Only the date
 * range makes it a *job*.
 *
 * Size cannot decide this on its own, which is the whole reason this file
 * exists: Joel's template sets its headings and its entry lines at the same
 * point size. The leading tab many templates put before a heading is trimmed
 * off first, so it decides nothing.
 */
export function isHeadingCandidate(p: Para): boolean {
  const text = p.text.trim();
  if (!text || p.listId || p.inTable) return false;
  return !DATE_RANGE.test(text) && !text.includes("\t");
}

export type SizeRanks = {
  /** The name. Null when it is not in the body — a header-only contact block. */
  title: number | null;
  /** The size the section headings are set in. */
  heading: number | null;
};

/**
 * Rank the two sizes that matter, by **recurrence rather than position**.
 *
 * A name appears once; headings repeat. So the headings are the largest recurring
 * size among paragraphs that could be headings, and the name is the largest size
 * appearing exactly once above them.
 *
 * **This replaced two different rules that were broken in two different ways**,
 * which is most of the argument for having one:
 *
 * - `ats.ts` took the second-largest size in the *whole* document, tables
 *   included, and then classified only the non-table paragraphs. On the template
 *   in use that second rank is a Career Highlights metric, a size no candidate
 *   has, so the check silently matched nothing — indistinguishable from a clean
 *   document.
 * - `outline.ts` ranked over the right population and got the heading size
 *   right, then failed to exclude entry lines — which share that size. Hence
 *   `Professional Experience — 0 lines`.
 *
 * **The title half is defensive and nothing observed needed it.** Every template
 * here puts the name in the body as the single largest size, so "largest" and
 * "largest appearing once" agree on all three; they diverge only where the body
 * has no name, and `title` is then correctly null rather than a heading. Stating
 * it as one rule beats two that happen to coincide.
 *
 * Counted over heading candidates only, so the population being ranked is the
 * same one being classified — the mistake `ats.ts` made.
 */
export function rankSizes(paras: Para[]): SizeRanks {
  const counts = new Map<number, number>();
  for (const p of paras) {
    if (!isHeadingCandidate(p) || p.size === null) continue;
    counts.set(p.size, (counts.get(p.size) ?? 0) + 1);
  }

  const sizes = [...counts.entries()];
  const recurring = sizes.filter(([, n]) => n > 1).map(([size]) => size);
  const heading = recurring.length === 0 ? null : Math.max(...recurring);

  const once = sizes.filter(([, n]) => n === 1).map(([size]) => size);
  const aboveHeading = heading === null ? once : once.filter((s) => s > heading);
  const title = aboveHeading.length === 0 ? null : Math.max(...aboveHeading);

  return { title, heading };
}

/** Is this paragraph a section heading, given the whole document to rank against? */
export function isHeadingLike(p: Para, all: Para[]): boolean {
  if (!isHeadingCandidate(p) || p.size === null) return false;
  return p.size === rankSizes(all).heading;
}
