import type { DocxParts } from "./read";
import type { Para } from "./paragraphs";
import { isHeadingLike, isKnownHeading } from "./headings";

export type AtsFinding = {
  code: string;
  severity: "blocking" | "warning";
  message: string;
};

/**
 * Mechanical check of the ATS rules in `apps/resume/RULES.md`. One table is permitted —
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
  // the user's templates are the opposite case: the part is there, invisible in
  // Word, and still full of the name and phone number. Read the text.
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

  const glyph = oddBulletGlyphs(parts.numbering, paras);
  if (glyph.length > 0) {
    findings.push({
      code: "bullet_glyph",
      severity: "warning",
      message: `Bullet glyph a parser may misread: ${glyph.join("; ")}. Use a plain "•", "-" or "–" in a text font.`,
    });
  }

  return findings;
}

/** Symbol-font families whose characters are drawn by code point, not by meaning:
 *  a parser that ignores the font reads the bullet as a stray letter. Symbol
 *  itself is Word's default bullet and parsers know it, so it is not listed. */
const SYMBOL_FONT = /^(wingdings(\s*[23])?|webdings)$/i;

/**
 * The bullet levels the document actually uses whose glyph is a picture or sits
 * in Wingdings/Webdings. Levels no paragraph uses are ignored: Word's default
 * multilevel list carries Wingdings at a deeper level whether or not it is ever
 * used, and warning about it would be a false positive. Warning only (TEC-168).
 */
export function oddBulletGlyphs(numbering: string | null, paras: Para[]): string[] {
  if (!numbering) return [];
  const used = new Set<string>();
  for (const p of paras) if (p.listId !== null) used.add(`${p.listId}:${p.listLevel ?? "0"}`);
  if (used.size === 0) return [];

  const abstractOf = new Map<string, string>();
  for (const m of numbering.matchAll(/<w:num\s[^>]*?w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
    const a = m[2].match(/<w:abstractNumId\s+w:val="(\d+)"/);
    if (a) abstractOf.set(m[1], a[1]);
  }
  const abstracts = new Map<string, string>();
  for (const m of numbering.matchAll(/<w:abstractNum\s[^>]*?w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
    abstracts.set(m[1], m[2]);
  }

  const out: string[] = [];
  for (const key of [...used].sort()) {
    const [numId, ilvl] = key.split(":");
    const body = abstracts.get(abstractOf.get(numId) ?? "");
    const lvl = body?.match(new RegExp(`<w:lvl\\s[^>]*?w:ilvl="${ilvl}"[^>]*>([\\s\\S]*?)</w:lvl>`))?.[1];
    if (!lvl || !/<w:numFmt\s+w:val="bullet"/.test(lvl)) continue;
    if (/<w:lvlPicBulletId/.test(lvl)) {
      out.push(`list ${numId} level ${ilvl} is a picture`);
      continue;
    }
    const font = lvl.match(/<w:rFonts\s[^>]*?w:ascii="([^"]*)"/)?.[1];
    if (font && SYMBOL_FONT.test(font.trim())) out.push(`list ${numId} level ${ilvl} is set in ${font}`);
  }
  return out;
}

/** Text content of a header or footer part, with markup stripped. Matches only
 *  <w:t>, never <w:tab> or <w:tbl>, which share the prefix. */
export function headerFooterText(xml: string | undefined): string {
  if (!xml) return "";
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("").trim();
}
