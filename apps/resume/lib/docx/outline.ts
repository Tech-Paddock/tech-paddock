import type { Para } from "./paragraphs";
import { isEntryLine, isHeadingCandidate, rankSizes } from "./headings";

export type OutlineSection = {
  heading: string;
  /** Paragraphs belonging to this section, excluding the heading itself. */
  lines: number;
  bullets: number;
  /** `Company Title Dates` lines — jobs. Zero everywhere but Experience. */
  entries: number;
};

export type Outline = {
  /** The name. Null when it is not in the body at all. */
  title: string | null;
  sections: OutlineSection[];
  /** Anything before the first heading: contact line, summary blurb. */
  preamble: string[];
};

/**
 * What the parser understood the document to be. Shown after every upload, so a
 * misread is visible rather than silent.
 *
 * **It was misreading, and saying so confidently.** Deciding what a heading is by
 * run size alone made Joel's five job lines into five sibling sections and left
 * `Professional Experience` holding **zero lines**, because his headings and his
 * entry lines are both 11pt. A page whose only job is to show what was understood
 * is the worst place to be wrong, and it had no way to be fixed once: the same
 * question was answered separately here, in the ATS lint and in the labeller.
 * `./headings` is the one home now, and this file asks it.
 *
 * `entries` exists because the bug was accidentally informative — a per-job
 * breakdown is worth seeing, and fixing the structure should not cost it.
 */
export function outlineOf(paras: Para[]): Outline {
  const withText = paras.filter((p) => p.text.trim());
  const { title: titleSize, heading: headingSize } = rankSizes(withText);

  const title =
    titleSize === null
      ? null
      : withText.find((p) => p.size === titleSize && isHeadingCandidate(p))?.text.trim() ?? null;

  const isHeading = (p: Para) => headingSize !== null && p.size === headingSize && isHeadingCandidate(p);

  const sections: OutlineSection[] = [];
  const preamble: string[] = [];
  let current: OutlineSection | null = null;

  for (const p of withText) {
    const text = p.text.trim();
    if (p.size === titleSize && text === title) continue;
    if (isHeading(p)) {
      current = { heading: text, lines: 0, bullets: 0, entries: 0 };
      sections.push(current);
      continue;
    }
    if (!current) {
      preamble.push(text);
      continue;
    }
    current.lines += 1;
    if (p.listId) current.bullets += 1;
    if (isEntryLine(p)) current.entries += 1;
  }

  return { title, sections, preamble };
}
