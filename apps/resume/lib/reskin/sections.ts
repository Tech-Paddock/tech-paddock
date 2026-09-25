/**
 * Section names, normalised to a canonical key.
 *
 * Matched by text rather than by Word style, because source resumes — Jobright's
 * output very much included — do not reliably use heading styles.
 */

export type SectionKey =
  | "summary"
  | "careerHighlights"
  | "experience"
  | "competencies"
  | "education"
  | "certifications"
  | "hobbies";

const HEADER_ALIASES: Record<string, SectionKey> = {
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
};

export function normalizeHeaderText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/:$/, "");
}

export function matchSectionKey(text: string): SectionKey | null {
  return HEADER_ALIASES[normalizeHeaderText(text)] ?? null;
}

/** Loose prose comparison, for the Career Highlights diff check. */
export function normalizeForCompare(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:]+$/, "");
}

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?";
const DATE_RANGE_RE = new RegExp(
  `\\b(?:${MONTH}\\s+)?\\d{4}\\s*[-–—]\\s*(?:Present|Current|(?:${MONTH}\\s+)?\\d{4})`,
  "i"
);

export interface ExpHeaderLine {
  text: string;
  bold: boolean;
  italic: boolean;
}

/**
 * Given an entry's non-bullet header lines, in whatever order and formatting the
 * source used, decide which is the company and which is the title — **by
 * formatting, not by position.**
 *
 * This is the one place the pipeline does more than move text verbatim, and it
 * earns it: two real source documents ordered "Company · Date" and "Title"
 * differently, so mapping by line position silently swapped company and title.
 * That is a correctness bug rather than a formatting one. The signal that held
 * across both is that the company line is bold and the title line italic. The
 * date is pulled out by pattern from whichever line carries it.
 */
export function splitCompanyAndTitleDate(headerLines: ExpHeaderLine[]): {
  company: string;
  title: string;
  date: string;
} {
  const stripDate = (s: string) => s.replace(DATE_RANGE_RE, "").replace(/[\s|,·•-]+$/, "").trim();

  // A tab separates fields exactly as a line break does — `Acme Corp⇥Jan 2020 –
  // Present` is two fields positioned on one line — so each tabbed segment is
  // read as a line of its own, keeping its line's weight and slant. A segment
  // that is nothing but the date range is spent once the date is taken, and is
  // dropped so it cannot be mistaken for the company or the title.
  const segments = headerLines.flatMap((l) =>
    l.text
      .split("\t")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text) => ({ ...l, text }))
  );

  let date = "";
  for (const line of segments) {
    const m = line.text.match(DATE_RANGE_RE);
    if (m) {
      date = m[0].trim();
      break;
    }
  }

  const lines = segments.filter((l) => stripDate(l.text) !== "");
  const italicLine = lines.find((l) => l.italic);
  const boldLine = lines.find((l) => l.bold && !l.italic) ?? lines.find((l) => l !== italicLine);

  return {
    company: boldLine ? stripDate(boldLine.text) : stripDate(lines[0]?.text ?? ""),
    title: italicLine ? stripDate(italicLine.text) : stripDate(lines[1]?.text ?? ""),
    date,
  };
}
