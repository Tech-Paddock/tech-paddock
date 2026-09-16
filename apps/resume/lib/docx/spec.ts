import type { DocxParts } from "./read";
import type { Para, Run } from "./paragraphs";
import { looksLikeContact } from "./label";

/**
 * How one run of text is set.
 *
 * `size` is points and `color` is six hex digits; either may be null, meaning the
 * template left it to the document default and so does the output. Used for the
 * runs that share a paragraph with other runs — the employer/title/dates line and
 * the Career Highlights cells — where a per-role size and colour is the only way
 * to describe them.
 */
export type RunStyle = {
  size: number | null;
  color: string | null;
  bold: boolean;
  italic: boolean;
};

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
  contactColor: string | null;
  /** The colour every run inherits when it sets none of its own — Word's
   *  docDefaults. Null leaves the output on Word's own default, which is black;
   *  that is what made a template set in near-black render as pure black. */
  defaultColor: string | null;
  /** The employer, job title and dates, which share one paragraph in the template
   *  and are told apart only by their runs. */
  entry: { company: RunStyle; title: RunStyle; dates: RunStyle };
  /** The two halves of a Career Highlights cell. */
  highlight: { metric: RunStyle; description: RunStyle };
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

const PLAIN: RunStyle = { size: null, color: null, bold: false, italic: false };

// Named so the default employer size and `entrySize` cannot drift apart. They are
// the same number by definition: the employer *is* the entry size.
const ENTRY_SIZE = 11;

export const DEFAULT_SPEC: TemplateSpec = {
  font: "Calibri",
  bodySize: 10,
  headingSize: 11,
  nameSize: 16,
  contactSize: 9,
  entrySize: ENTRY_SIZE,
  headingBold: true,
  headingColor: null,
  nameColor: null,
  contactColor: null,
  defaultColor: null,
  // Null sizes and colours are what the renderer did before it could read any of
  // this: the employer bold at entrySize, the title italic, everything else on the
  // document default. So a template with no entry line to measure renders exactly
  // as it always has.
  entry: {
    company: { ...PLAIN, size: ENTRY_SIZE, bold: true },
    title: { ...PLAIN, italic: true },
    dates: { ...PLAIN },
  },
  highlight: { metric: { ...PLAIN, bold: true }, description: { ...PLAIN } },
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
  // Through normalizeSpec rather than a spread of DEFAULT_SPEC, which shares its
  // nested objects: `spec.entry.company = …` would then write into the defaults
  // themselves and every later extraction would inherit it.
  const spec: TemplateSpec = normalizeSpec(null);

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

  // An entry line's first run is the employer, which Joel's template sets at the
  // heading size. Without excluding those, "the first paragraph at the heading
  // size" can be an employer rather than a heading — true today only because a
  // heading happens to come first in the document.
  const headings = prose.filter((p) => p.size !== null && p.size / 2 === spec.headingSize && !isEntryLine(p));
  if (headings.length > 0) spec.headingBold = headings[0].bold;

  // ——— Colour ———
  //
  // Nothing here was read before, so every output was black whatever the template
  // said. Word's docDefaults is the colour a run inherits when it sets none, and
  // it is where a template like Joel's puts its near-black body colour.
  const docDefaults = /<w:docDefaults\b[\s\S]*?<\/w:docDefaults>/.exec(parts.styles ?? "")?.[0] ?? "";
  spec.defaultColor = hexColor(attr(docDefaults, "w:color", "w:val"));
  const inheritedSize = Number(attr(docDefaults, "w:sz", "w:val"));
  // Points, or null when the template states no default. Used to resolve a run
  // that carries no size of its own — the job title in Joel's template gets its
  // 10.5pt from here and nowhere else.
  const inherited = Number.isFinite(inheritedSize) && inheritedSize > 0 ? inheritedSize / 2 : null;

  spec.headingColor = dominantColor(headings);
  const namePara = prose.find((p) => p.size !== null && p.size / 2 === spec.nameSize);
  if (namePara) spec.nameColor = dominantColor([namePara]);
  const contactPara = prose.find((p) => looksLikeContact(p.text));
  if (contactPara) spec.contactColor = dominantColor([contactPara]);

  // With the name and contact in a page header there is no body paragraph to read
  // them off, so take the header's own colours in document order.
  if (nameFromHeader) {
    const headerColors = Object.values(parts.headerFooterXml ?? {})
      .flatMap((xml) => [...xml.matchAll(/<w:color\s+w:val="([0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase()));
    if (headerColors.length > 0) {
      spec.nameColor = headerColors[0];
      spec.contactColor = headerColors[headerColors.length - 1];
    }
  }

  // ——— The employer / title / dates trio ———
  //
  // All three share one paragraph, so the only way to tell them apart is by run:
  // the employer is the first, the title is the italic one, the dates are the
  // last. Measured from the template's own first entry line rather than assumed,
  // because they are three different sizes and two different colours.
  // The ranked size is the fallback, in place before anything is measured, so a
  // template with no entry line in it still renders the employer as it always has.
  spec.entry.company = { ...spec.entry.company, size: spec.entrySize };
  const entryLine = prose.find(isEntryLine);
  if (entryLine) {
    const runs = entryLine.runs.filter((r) => r.text.trim());
    const italic = runs.find((r) => r.italic);
    spec.entry = {
      company: styleOf(runs[0], inherited, spec.defaultColor),
      title: styleOf(italic, inherited, spec.defaultColor),
      dates: styleOf(runs[runs.length - 1], inherited, spec.defaultColor),
    };
    // Keep the two in step. `entrySize` was the ranked guess at the employer's
    // size and is now only the fallback for when there is no entry line to
    // measure; leaving it disagreeing with the measurement would be one field
    // saying 10pt while the document says 11.
    if (spec.entry.company.size !== null) spec.entrySize = spec.entry.company.size;
  }

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

  // ——— The Career Highlights cell ———
  //
  // Read from the first table, which is the one table the output reproduces. In a
  // columns template the metric and its description are two paragraphs in one
  // cell; in a rows template they are two cells in one row. So this has to come
  // after the layout is known.
  const cellAt = (row: number, cell: number) =>
    paras.filter((p) => p.cell?.table === 0 && p.cell.row === row && p.cell.cell === cell && p.text.trim());
  const firstCell = cellAt(0, 0);
  const metricRun = firstCell[0]?.runs.find((r) => r.text.trim());
  const descriptionRun =
    spec.highlightsLayout === "columns"
      ? firstCell[1]?.runs.find((r) => r.text.trim())
      : cellAt(0, 1)[0]?.runs.find((r) => r.text.trim());
  if (metricRun) spec.highlight.metric = styleOf(metricRun, inherited, spec.defaultColor);
  if (descriptionRun) spec.highlight.description = styleOf(descriptionRun, inherited, spec.defaultColor);

  const spacing = /<w:spacing\b[^>]*w:after="(\d+)"[^>]*>/.exec(parts.document);
  if (spacing) spec.spacing = { ...spec.spacing, after: Number(spacing[1]) };

  return spec;
}

/** Six hex digits or nothing. `auto` is Word deciding for itself, which is not a
 *  colour, and copying it into the output as one would be a guess. */
const hexColor = (raw: string | null): string | null =>
  raw && /^[0-9A-Fa-f]{6}$/.test(raw) ? raw.toUpperCase() : null;

/**
 * The employer / title / dates line, recognised by its shape rather than by
 * position or by matching a date.
 *
 * Three runs in one paragraph, the first bold and a later one italic, is what
 * every entry line in Joel's template looks like and what no heading, contact
 * line or bullet looks like. Recognising it matters twice: it is where the trio's
 * sizes and colours are read from, and it has to be kept out of the heading
 * ranking, since its first run is set at the heading size.
 */
export function isEntryLine(p: Para): boolean {
  if (p.listId || p.inTable) return false;
  const runs = p.runs.filter((r) => r.text.trim());
  return runs.length >= 2 && runs[0].bold && runs.slice(1).some((r) => r.italic);
}

/**
 * The colour most of a set of paragraphs is set in.
 *
 * Weighted by how much text each colour covers, not by how many runs carry it. A
 * run boundary is a Word artifact — this template splits "Salesforce Certified
 * Administrator" across two runs mid-word — so counting runs would let an
 * arbitrary split outvote the colour of the line. Needed because a line can be
 * more than one colour while the output renders it as a single run: Joel's contact
 * line sets the email and the LinkedIn in the accent colour and the phone number
 * in grey, and one of those has to win.
 *
 * Runs with no colour of their own are not votes. They inherit the document
 * default, which is carried separately as `defaultColor`.
 */
export function dominantColor(paras: Para[]): string | null {
  const weigh = (linksCount: boolean) => {
    const weights = new Map<string, number>();
    for (const p of paras) {
      for (const run of p.runs) {
        const length = run.text.trim().length;
        if (length === 0 || run.color === null) continue;
        if (run.inHyperlink && !linksCount) continue;
        weights.set(run.color, (weights.get(run.color) ?? 0) + length);
      }
    }
    return [...weights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  // A link is coloured because it is a link. Joel's contact line hyperlinks the
  // email and the LinkedIn in the accent colour and underlines both, and sets the
  // city and the phone number in grey — so by length the accent wins, and the
  // output would render the whole line, phone number included, in link blue. The
  // colour of the line is the colour of the text that is not a link. A line that
  // is nothing but links still has one, which is why the links are a fallback
  // rather than excluded outright.
  return weigh(false) ?? weigh(true);
}

/**
 * One run's size and colour, with what it inherits already resolved.
 *
 * A run that states no size is not sizeless — it is the document default, which
 * is how the job title in Joel's template is 10.5pt while saying nothing at all.
 * Resolving it here means the builder emits an explicit value and needs no notion
 * of inheritance; leaving it null would put the title on the body size instead.
 */
export function styleOf(run: Run | undefined, inheritedSize: number | null, inheritedColor: string | null): RunStyle {
  if (!run) return { ...PLAIN };
  return {
    size: run.size === null ? inheritedSize : run.size / 2,
    color: run.color ?? inheritedColor,
    bold: run.bold,
    italic: run.italic,
  };
}

/**
 * Fill in whatever a stored spec is missing.
 *
 * `resume.templates.spec` is JSON with no version, written by whichever release
 * uploaded the template. A spec stored before the colour fields existed has no
 * `entry` object at all, and reading `spec.entry.company` off it throws rather
 * than degrading — so every stored spec goes through here before it reaches the
 * builder, and an old template keeps rendering exactly as it did. Its colours
 * appear when it is re-uploaded, which is the only thing that can read them out
 * of the file.
 */
export function normalizeSpec(raw: unknown): TemplateSpec {
  const stored = (raw ?? {}) as Partial<TemplateSpec>;
  const run = (value: RunStyle | undefined, fallback: RunStyle): RunStyle => ({ ...fallback, ...(value ?? {}) });
  const entrySize = typeof stored.entrySize === "number" ? stored.entrySize : DEFAULT_SPEC.entrySize;
  return {
    ...DEFAULT_SPEC,
    ...stored,
    margins: { ...DEFAULT_SPEC.margins, ...(stored.margins ?? {}) },
    spacing: { ...DEFAULT_SPEC.spacing, ...(stored.spacing ?? {}) },
    entry: {
      // A spec stored before `entry` existed rendered the employer at entrySize,
      // so that is what it has to keep rendering at — not the body size, which is
      // what a null would fall back to.
      company: run(stored.entry?.company, { ...DEFAULT_SPEC.entry.company, size: entrySize }),
      title: run(stored.entry?.title, DEFAULT_SPEC.entry.title),
      dates: run(stored.entry?.dates, DEFAULT_SPEC.entry.dates),
    },
    highlight: {
      metric: run(stored.highlight?.metric, DEFAULT_SPEC.highlight.metric),
      description: run(stored.highlight?.description, DEFAULT_SPEC.highlight.description),
    },
  };
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
