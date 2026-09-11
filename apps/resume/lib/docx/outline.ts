import type { Para } from "./paragraphs";

export type OutlineSection = {
  heading: string;
  /** Paragraphs belonging to this section, excluding the heading itself. */
  lines: number;
  bullets: number;
};

export type Outline = {
  /** Largest run in the document — on a resume that is the name. */
  title: string | null;
  sections: OutlineSection[];
  /** Anything before the first heading: contact line, summary blurb. */
  preamble: string[];
};

/**
 * What the parser understood the document to be. Shown to the user after every
 * upload, so a misread is visible rather than silent.
 *
 * Sizes are ranked rather than hardcoded: Jobright uses 25/11/10.5/10pt and the
 * template uses 16/12.5/11/10pt, so absolute values would only ever fit one of
 * them.
 */
export function outlineOf(paras: Para[]): Outline {
  const withText = paras.filter((p) => p.text.trim());

  // Rank sizes over body prose only. The template sets its Career Highlights
  // metrics larger than its section headings, so counting table and list text
  // would crown the wrong size as "heading".
  const ranked = withText.filter((p) => !p.inTable && !p.listId);
  const sizes = [...new Set(ranked.map((p) => p.size).filter((s): s is number => s !== null))].sort((a, b) => b - a);

  const titleSize = sizes[0] ?? null;
  const headingSize = sizes[1] ?? null;

  const title = titleSize === null ? null : withText.find((p) => p.size === titleSize)?.text.trim() ?? null;

  const isHeading = (p: Para) =>
    headingSize !== null && p.size === headingSize && !p.listId && !p.inTable && p.text.trim().length > 0;

  const sections: OutlineSection[] = [];
  const preamble: string[] = [];
  let current: OutlineSection | null = null;

  for (const p of withText) {
    const text = p.text.trim();
    if (p.size === titleSize && text === title) continue;
    if (isHeading(p)) {
      current = { heading: text, lines: 0, bullets: 0 };
      sections.push(current);
      continue;
    }
    if (!current) {
      preamble.push(text);
      continue;
    }
    current.lines += 1;
    if (p.listId) current.bullets += 1;
  }

  return { title, sections, preamble };
}
