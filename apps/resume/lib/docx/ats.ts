import type { DocxParts } from "./read";
import type { Para } from "./paragraphs";

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

  if (parts.headerFooterParts.length > 0) {
    findings.push({
      code: "header_footer_content",
      severity: "blocking",
      message: `Content lives in ${parts.headerFooterParts.join(", ")}. Many parsers skip headers and footers entirely, so contact details there can vanish completely. Put them in the document body.`,
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

/** Headings are the largest recurring run size below the name, and never list items. */
function isHeadingLike(p: Para, all: Para[]): boolean {
  if (!p.text.trim() || p.listId || p.inTable) return false;
  const sizes = all.map((x) => x.size).filter((s): s is number => s !== null);
  if (sizes.length === 0 || p.size === null) return false;
  const distinct = [...new Set(sizes)].sort((a, b) => b - a);
  return distinct.length > 1 && p.size === distinct[1];
}
