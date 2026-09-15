import type { DocxParts } from "./read";
import type { Para } from "./paragraphs";

/** The formatting captured from a template, and the only thing the builder reads. */
export type TemplateSpec = {
  font: string;
  /** Points. */
  bodySize: number;
  headingSize: number;
  nameSize: number;
  contactSize: number;
  entrySize: number;
  headingBold: boolean;
  headingColor: string | null;
  nameColor: string | null;
  /** Inches. */
  margins: { top: number; right: number; bottom: number; left: number };
  spacing: { before: number; after: number; line: number | null };
  bulletGlyph: string;
  /** Career Highlights is the one section permitted to be a table. */
  highlightsStyle: "table" | "list";
  /** How that table is laid out. "columns" is one row with a cell per highlight,
   *  metric stacked above its description — the shape Joel's template uses.
   *  "rows" is one row per highlight, metric beside description. */
  highlightsLayout: "columns" | "rows";
};

const TWIPS_PER_INCH = 1440;
const attr = (xml: string, tag: string, name: string): string | null => {
  const m = new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`).exec(xml);
  return m ? m[1] : null;
};

export const DEFAULT_SPEC: TemplateSpec = {
  font: "Calibri",
  bodySize: 10,
  headingSize: 11,
  nameSize: 16,
  contactSize: 9,
  entrySize: 11,
  headingBold: true,
  headingColor: null,
  nameColor: null,
  margins: { top: 0.625, right: 0.75, bottom: 0.625, left: 0.75 },
  spacing: { before: 40, after: 40, line: null },
  bulletGlyph: "•",
  highlightsStyle: "table",
  highlightsLayout: "rows",
};

/**
 * Read a template's formatting into a spec.
 *
 * Sizes are ranked, never hardcoded — the two documents this has to cope with
 * use completely different scales. Ranking ignores table and list text, since a
 * template may set its Career Highlights metrics larger than its own headings.
 */
export function extractSpec(parts: DocxParts, paras: Para[]): TemplateSpec {
  const spec: TemplateSpec = { ...DEFAULT_SPEC };

  const fontName =
    attr(parts.styles ?? "", "w:rFonts", "w:ascii") ?? attr(parts.document, "w:rFonts", "w:ascii");
  if (fontName) spec.font = fontName;

  // A template may keep the name and contact block in a page header. The body
  // then has no paragraph larger than its own headings, so ranking alone reads
  // the heading size as the name size and every size collapses onto one value —
  // a render with no visual hierarchy at all, the name set in body text.
  // Take those two sizes from the header when that is where they live.
  const headerSizes = Object.values(parts.headerFooterXml ?? {})
    .flatMap((xml) => [...xml.matchAll(/<w:sz\s+w:val="(\d+)"/g)].map((m) => Number(m[1])))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);

  const prose = paras.filter((p) => p.text.trim() && !p.inTable && !p.listId);
  const halfPoints = [...new Set(prose.map((p) => p.size).filter((s): s is number => s !== null))].sort(
    (a, b) => b - a
  );
  const pt = (halfPoint: number | undefined, fallback: number) =>
    halfPoint === undefined ? fallback : halfPoint / 2;

  // When the name lives in the header, the body's largest prose size is the
  // heading, not the name — so every body rank shifts up one. Without this the
  // heading takes the rank below it and comes out smaller than body text.
  const nameFromHeader = headerSizes.length > 0;
  const rank = (n: number) => halfPoints[nameFromHeader ? n - 1 : n];

  if (halfPoints.length > 0) {
    spec.nameSize = pt(halfPoints[0], spec.nameSize);
    spec.headingSize = pt(rank(1), spec.headingSize);
    // Body is the size that appears most often across all text, not the next
    // one down — a template can have several near-body sizes.
    const counts = new Map<number, number>();
    for (const p of paras) if (p.size !== null && p.text.trim()) counts.set(p.size, (counts.get(p.size) ?? 0) + 1);
    const commonest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (commonest !== undefined) spec.bodySize = commonest / 2;
    spec.entrySize = pt(rank(2), spec.bodySize + 0.5);
    spec.contactSize = pt(halfPoints[halfPoints.length - 1], spec.contactSize);
  }

  // The header wins for these two only. Heading, body and entry still come from
  // the body, which is the only place they appear.
  if (nameFromHeader) {
    spec.nameSize = headerSizes[0] / 2;
    spec.contactSize = headerSizes[headerSizes.length - 1] / 2;
  }

  const heading = prose.find((p) => p.size !== null && p.size / 2 === spec.headingSize);
  if (heading) spec.headingBold = heading.bold;

  const pgMar = /<w:pgMar\b[^>]*>/.exec(parts.document)?.[0] ?? "";
  const inches = (name: string, fallback: number) => {
    const raw = attr(pgMar, "w:pgMar", name);
    const n = raw === null ? NaN : Number(raw) / TWIPS_PER_INCH;
    return Number.isFinite(n) && n >= 0 && n < 3 ? n : fallback;
  };
  spec.margins = {
    top: inches("w:top", spec.margins.top),
    right: inches("w:right", spec.margins.right),
    bottom: inches("w:bottom", spec.margins.bottom),
    left: inches("w:left", spec.margins.left),
  };

  spec.bulletGlyph = pickBulletGlyph(parts.numbering);

  spec.highlightsStyle = /<w:tbl>/.test(parts.document) ? "table" : "list";
  spec.highlightsLayout = firstTableLayout(parts.document);

  const spacing = /<w:spacing\b[^>]*w:after="(\d+)"[^>]*>/.exec(parts.document);
  if (spacing) spec.spacing = { ...spec.spacing, after: Number(spacing[1]) };

  return spec;
}

/**
 * Read the shape of the template's first table.
 *
 * Career Highlights is the first table in Joel's template and the only one the
 * output is allowed to reproduce. One row of several cells means each highlight
 * is a column with its metric stacked above its description; anything else is
 * read as a row per highlight. Measured rather than assumed, so a template that
 * changes shape moves the output with it instead of needing a code change.
 */
export function firstTableLayout(documentXml: string): "columns" | "rows" {
  const table = /<w:tbl>[\s\S]*?<\/w:tbl>/.exec(documentXml)?.[0];
  if (!table) return "rows";
  const rows = [...table.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
  if (rows.length !== 1) return "rows";
  const cells = (rows[0].match(/<w:tc>/g) ?? []).length;
  return cells > 1 ? "columns" : "rows";
}

// Only plain, universally available bullet characters. Word templates commonly
// carry a Symbol-font U+F0B7 or a numbering placeholder here, and a private-use
// codepoint renders as a missing-glyph box in anything but Word. The ATS rule
// asks for a plain bullet, so anything unrecognised falls back to one.
const SAFE_GLYPHS = new Set(["\u2022", "\u25E6", "\u25AA", "\u2023"]);

export function pickBulletGlyph(numberingXml: string | null): string {
  if (!numberingXml) return "\u2022";
  for (const match of numberingXml.matchAll(/<w:lvlText\b[^>]*w:val="([^"]*)"/g)) {
    if (SAFE_GLYPHS.has(match[1])) return match[1];
  }
  return "\u2022";
}
