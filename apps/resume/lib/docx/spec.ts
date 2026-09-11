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

  const prose = paras.filter((p) => p.text.trim() && !p.inTable && !p.listId);
  const halfPoints = [...new Set(prose.map((p) => p.size).filter((s): s is number => s !== null))].sort(
    (a, b) => b - a
  );
  const pt = (halfPoint: number | undefined, fallback: number) =>
    halfPoint === undefined ? fallback : halfPoint / 2;

  if (halfPoints.length > 0) {
    spec.nameSize = pt(halfPoints[0], spec.nameSize);
    spec.headingSize = pt(halfPoints[1], spec.headingSize);
    // Body is the size that appears most often across all text, not the next
    // one down — a template can have several near-body sizes.
    const counts = new Map<number, number>();
    for (const p of paras) if (p.size !== null && p.text.trim()) counts.set(p.size, (counts.get(p.size) ?? 0) + 1);
    const commonest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (commonest !== undefined) spec.bodySize = commonest / 2;
    spec.entrySize = pt(halfPoints[2], spec.bodySize + 0.5);
    spec.contactSize = pt(halfPoints[halfPoints.length - 1], spec.contactSize);
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

  const spacing = /<w:spacing\b[^>]*w:after="(\d+)"[^>]*>/.exec(parts.document);
  if (spacing) spec.spacing = { ...spec.spacing, after: Number(spacing[1]) };

  return spec;
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
