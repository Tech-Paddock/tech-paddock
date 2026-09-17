import type { DocxParts } from "./read";
import type { Para } from "./paragraphs";
import { DATE_RANGE } from "./label";

export type AtsFinding = {
  code: string;
  severity: "blocking" | "warning";
  message: string;
};

/** Section headings a parser is likely to recognise. Creative ones cost you matches. */
export const KNOWN_HEADINGS = new Set([
  "summary", "professional summary", "objective",
  "career highlights", "highlights",
  "professional experience", "experience", "work experience", "employment",
  "core competencies", "skills", "technical skills",
  "education", "certifications", "education & certifications",
  "projects", "volunteer", "hobbies", "interests",
]);

/**
 * Mechanical check of the ATS rules in CLAUDE.md. One table is permitted —
 * Career Highlights, whose content is repeated in the body bullets — and any
 * other is blocking. Everything else here is a hard no.
 */
export function auditAts(parts: DocxParts, paras: Para[]): AtsFinding[] {
  const findings: AtsFinding[] = [];
  const xml = parts.document;

  const tables = (xml.match(/<w:tbl>/g) ?? []).length;
  if (tables > 1) {
    findings.push({
      code: "too_many_tables",
      severity: "blocking",
      message: `${tables} tables. Only Career Highlights may be a table — its content is repeated in the body bullets, so a parser that drops it loses nothing. Every other section must be flat paragraphs.`,
    });
  }

  // The finding is about content in a header, not about the part existing. Word
  // keeps header1.xml behind after the text is cleared, and a first-page header
  // with no <w:titlePg/> is not even displayed — so a part-presence check
  // reports a header the author has already emptied and cannot see. Both of
  // Joel's templates are the opposite case: the part is there, invisible in
  // Word, and still full of his name and phone number. Read the text.
  const withText = parts.headerFooterParts.filter((name) => headerFooterText(parts.headerFooterXml[name]) !== "");
  if (withText.length > 0) {
    findings.push({
      code: "header_footer_content",
      severity: "blocking",
      message: `Content lives in ${withText.join(", ")}. Many parsers skip headers and footers entirely, so contact details there can vanish completely. Put them in the document body.`,
    });
  }

  if (/<w:sdt>/.test(xml)) {
    findings.push({
      code: "content_control",
      severity: "blocking",
      message: "A <w:sdt> content control wraps part of the document. Parsers that walk only the body's direct children read the wrapped section as empty — python-docx does exactly this.",
    });
  }

  if (/<w:txbxContent/.test(xml)) {
    findings.push({
      code: "text_box",
      severity: "blocking",
      message: "Text boxes are not read in document order, if at all.",
    });
  }

  const images = paras.filter((p) => p.hasImage).length;
  if (images > 0) {
    findings.push({
      code: "images",
      severity: "warning",
      message: `${images} paragraphs carry an image. Section rules drawn as images should be real paragraph borders instead.`,
    });
  }

  const unknown = paras
    .filter((p) => isHeadingLike(p, paras) && !KNOWN_HEADINGS.has(p.text.trim().toLowerCase()))
    .map((p) => p.text.trim());
  if (unknown.length > 0) {
    findings.push({
      code: "unknown_heading",
      severity: "warning",
      message: `Unrecognised section heading(s): ${unknown.join(", ")}.`,
    });
  }

  return findings;
}

/** Text content of a header or footer part, with markup stripped. Matches only
 *  <w:t>, never <w:tab> or <w:tbl>, which share the prefix. */
export function headerFooterText(xml: string | undefined): string {
  if (!xml) return "";
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("").trim();
}

/**
 * Could this paragraph be a section heading at all, before size is considered?
 *
 * **The entry-line clause is not defensive, it is the whole difficulty.** In
 * Joel's template the section headings and the `Company   Title ⇥ Dates` lines
 * are set at the same point size, so size alone called all five jobs
 * unrecognised headings — five false findings in one document, on a warning
 * whose entire job is to be believed. A check that cries wolf that often is one
 * you learn to ignore, and then it is worth nothing on the day it is right.
 *
 * An entry line is told apart by two things a section heading never has: a date
 * range, or an interior tab holding a right-aligned field. A heading is a bare
 * label. The leading tab both carry is stripped first, so it decides nothing.
 */
function isHeadingCandidate(p: Para): boolean {
  const text = p.text.trim();
  if (!text || p.listId || p.inTable) return false;
  return !DATE_RANGE.test(text) && !text.includes("\t");
}

/**
 * The run size the headings are set in: **the largest one that recurs.**
 *
 * Recurrence is what separates a heading from a name, and it is the part the
 * previous implementation described but did not do — it took the second-largest
 * size in the whole document, headings and table cells alike, then classified
 * only the non-table paragraphs. That worked on one file by coincidence: the
 * Career Highlights metrics happen to be set larger than the headings, so the
 * second rank landed on the headings by luck rather than by rule. Move the name
 * into the body, or change the metrics' size, and it silently ranks something
 * else — or nothing, which reads identically to a clean document.
 *
 * Counting only the paragraphs that could be headings makes the population and
 * the classification the same set. A name appears once; headings repeat. So the
 * largest recurring size is the headings' whether or not the name is in the
 * body — and both of Joel's templates are one of each.
 */
function headingSize(all: Para[]): number | null {
  const counts = new Map<number, number>();
  for (const p of all) {
    if (!isHeadingCandidate(p) || p.size === null) continue;
    counts.set(p.size, (counts.get(p.size) ?? 0) + 1);
  }
  const recurring = [...counts.entries()].filter(([, n]) => n > 1).map(([size]) => size);
  return recurring.length === 0 ? null : Math.max(...recurring);
}

function isHeadingLike(p: Para, all: Para[]): boolean {
  if (!isHeadingCandidate(p) || p.size === null) return false;
  return p.size === headingSize(all);
}
