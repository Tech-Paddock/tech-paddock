import type { DocxParts } from "./read";
import type { Para } from "./paragraphs";
import { isHeadingLike, isKnownHeading } from "./headings";

export type AtsFinding = {
  code: string;
  severity: "blocking" | "warning";
  message: string;
};

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
    // Headings a parser is likely to recognise — creative ones cost matches — are
    // the vocabulary in `./headings`, the same one the renderer reads sections by.
    .filter((p) => isHeadingLike(p, paras) && !isKnownHeading(p.text))
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
