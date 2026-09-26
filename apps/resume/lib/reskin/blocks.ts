/**
 * Surgical, string-level OOXML editing.
 *
 * We deliberately do NOT parse `word/document.xml` into a generic XML DOM and
 * re-serialize it. A parser round-trip silently normalises things Word cares
 * about — attribute order, self-closing tags, whitespace — across parts of the
 * document nobody intended to touch.
 *
 * Instead: find the exact substring of a paragraph or table to change, and
 * replace only that substring, byte for byte. **That is what makes "keep the
 * template's formatting, replace the text" true at the file level** rather than
 * approximately true at the level of whatever properties somebody remembered to
 * model. The renderer this replaced modelled seventeen of them and invented the
 * rest; every defect it had was a property nobody had thought to carry.
 */

export type Block =
  | { type: "p"; raw: string }
  | { type: "tbl"; raw: string }
  /** sectPr, body-level bookmarks — anything that is not a paragraph or table. */
  | { type: "other"; raw: string };

/** Split the `<w:body>` inner XML into ordered top-level blocks. */
export function splitBody(bodyInnerXml: string): Block[] {
  const blocks: Block[] = [];
  const re = /<w:p\b[\s\S]*?<\/w:p>|<w:tbl>[\s\S]*?<\/w:tbl>|<w:sectPr\b[\s\S]*?<\/w:sectPr>/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyInnerXml))) {
    if (m.index > lastIndex) {
      const gap = bodyInnerXml.slice(lastIndex, m.index).trim();
      if (gap) blocks.push({ type: "other", raw: gap });
    }
    const raw = m[0];
    if (raw.startsWith("<w:p")) blocks.push({ type: "p", raw });
    else if (raw.startsWith("<w:tbl")) blocks.push({ type: "tbl", raw });
    else blocks.push({ type: "other", raw });
    lastIndex = re.lastIndex;
  }
  const tail = bodyInnerXml.slice(lastIndex).trim();
  if (tail) blocks.push({ type: "other", raw: tail });
  return blocks;
}

export function joinBody(blocks: Block[]): string {
  return blocks.map((b) => b.raw).join("");
}

/**
 * Every visible text run in a block, in document order.
 *
 * The tag-name boundary matters. `<w:t[^>]*>` also matches `<w:tabs>`,
 * `<w:tblPr>`, `<w:textAlignment>` and `<w:top>` — anything starting `w:t` — and
 * swallows whole spans of unrelated XML as if it were run text. Requiring
 * whitespace or `>` straight after `w:t` matches only the real element.
 * `lib/docx/ats.ts` carries the same rule for the same reason.
 */
const TEXT_RUN_RE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

/**
 * Run text and run-level tabs, in document order.
 *
 * **`<w:tab/>` means two things and the parent decides which** — the trap
 * `RULES.md` names. Inside a run it is a tab character; inside
 * `<w:pPr><w:tabs>` it declares a tab *stop* and carries no text at all. So
 * paragraph properties are cut away first, and only what is left is read.
 *
 * Dropping run-level tabs, as this once did, glued the fields of a positioned
 * line together: `Acme Corp⇥Jan 2020 – Present` read as company "Acme CorpJan"
 * and date "2020 – Present", at 100% coverage, because the glued text still
 * arrived.
 */
const TEXT_OR_TAB_RE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>/g;

export function extractText(raw: string): string {
  const withoutProps = raw.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/g, "");
  return decodeXmlEntities(
    [...withoutProps.matchAll(TEXT_OR_TAB_RE)].map((m) => (m[1] === undefined ? "\t" : m[1])).join("")
  );
}

/** A run's `<w:t>` text alone — exactly what `replaceRunText` overwrites. */
function runOwnText(runRaw: string): string {
  return decodeXmlEntities([...runRaw.matchAll(TEXT_RUN_RE)].map((m) => m[1]).join(""));
}

export function getStyleId(raw: string): string | null {
  const m = raw.match(/<w:pStyle w:val="([^"]*)"/);
  return m ? m[1] : null;
}

export function hasNumPr(raw: string): boolean {
  return /<w:numPr>/.test(raw);
}

export function isBold(raw: string): boolean {
  return /<w:b\s*\/>/.test(raw);
}

export function isItalic(raw: string): boolean {
  return /<w:i\s*\/>/.test(raw);
}

/** A paragraph's ordered `<w:r>` runs. */
const RUN_RE = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;

export function splitRuns(paragraphRaw: string): string[] {
  return paragraphRaw.match(RUN_RE) ?? [];
}

/**
 * Rewrite each run of a paragraph **where it sits**, leaving everything between
 * the runs exactly as it was.
 *
 * The run-granular rewrites used to rebuild a paragraph as its `pPr` followed by
 * its rewritten runs, which kept the runs and dropped whatever wrapped them — so
 * a `<w:hyperlink>` on a rewritten line lost its link while its text survived
 * (TEC-66), and a bookmark or a content control around a run went the same way.
 * A link is the template's, like the line's tab stops and its fonts: it is
 * carried through, not modelled. The `pPr` holds no runs, so it is never touched.
 */
function mapRunsInPlace(paragraphRaw: string, rewrite: (run: string) => string): string {
  // A replacer function, never a replacement string: `$&` in résumé text would
  // otherwise be interpreted (see `spliceFirst`).
  return paragraphRaw.replace(RUN_RE, (run) => rewrite(run));
}

export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Ampersand last: decoding it first would turn "&amp;lt;" into "<" rather
    // than the literal "&lt;" the document actually contains.
    .replace(/&amp;/g, "&");
}

export function encodeXmlEntities(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Splice `replacement` in where `needle` sits, without `String.replace`.
 *
 * `String.replace` interprets `$&`, `` $` ``, `$'` and `$$` inside the
 * *replacement* even when the pattern is a plain string, so a résumé containing
 * one of those would corrupt the XML around it. A tool whose headline section is
 * dollar figures should not have a `$` hazard in its rewrite path.
 */
function spliceFirst(haystack: string, needle: string, replacement: string): string {
  const at = haystack.indexOf(needle);
  if (at === -1) return haystack;
  return haystack.slice(0, at) + replacement + haystack.slice(at + needle.length);
}

/**
 * Replace a paragraph's visible text, keeping its `pPr` — alignment, borders,
 * tab stops, list numbering, spacing — and the first run's `rPr` — font, size,
 * weight, colour — completely untouched. Every other run is dropped so the new
 * text is not duplicated.
 *
 * A paragraph with no runs at all (a blank line) gets a bare run with no `rPr`,
 * matching the empty paragraphs around it.
 */
export function replaceParagraphText(raw: string, newText: string): string {
  const pPrMatch = raw.match(/^<w:p\b[^>]*>(?:\s*<w:pPr>[\s\S]*?<\/w:pPr>)?/);
  const head = pPrMatch ? pPrMatch[0] : raw.slice(0, raw.indexOf(">") + 1);
  const rest = raw.slice(head.length, raw.length - "</w:p>".length);

  const firstRunMatch = rest.match(/<w:r(?:\s[^>]*)?>(?:\s*<w:rPr>[\s\S]*?<\/w:rPr>)?/);
  const escaped = encodeXmlEntities(newText);

  if (!firstRunMatch) {
    return `${head}<w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
  }

  // "<w:r>" or "<w:r><w:rPr>…</w:rPr>" — the run's formatting, kept verbatim.
  return `${head}${firstRunMatch[0]}<w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
}

/** Replace one run's text, keeping its `rPr`. */
export function replaceRunText(runRaw: string, newText: string): string {
  return runRaw.replace(TEXT_RUN_RE, () => `<w:t xml:space="preserve">${encodeXmlEntities(newText)}</w:t>`);
}

/**
 * Empty a run's text. Used when one field spans several runs: the first run in
 * the field keeps the new text and the rest are cleared, so it is not repeated.
 */
export function clearRunText(runRaw: string): string {
  return replaceRunText(runRaw, "");
}

/**
 * Replace a run's text, carrying over whatever trailing whitespace it had.
 *
 * **The whitespace at the end of a run is usually the gap to the next field, and
 * it belongs to the template.** `Salesforce: ` and `Sr. Administrator ` both
 * hold their separator that way, and overwriting the run drops it — the first
 * renders as `Platform:Alpha Suite`, the second matters more than it looks:
 * where a `<w:tab/>` is the only thing between the title and the date, the two
 * fields are separated by no character at all, and an extractor that
 * concatenates `<w:t>` elements without handling tabs — which is most of the
 * simple ones — reads `AdministratorNov 2022`. A trailing space is invisible
 * against a right tab stop and survives every extractor.
 */
function replaceRunTextKeepingGap(runRaw: string, newText: string): string {
  const trailing = runOwnText(runRaw).match(/\s+$/)?.[0] ?? "";
  return replaceRunText(runRaw, `${newText}${trailing}`);
}

/**
 * Some templates pack company, title and date onto one line against a right tab
 * stop — **Acme Corp** *Consultant*⇥*Jan 2020 – Present* — with each field set
 * differently. Replacing the paragraph whole would collapse all three onto the
 * first run's formatting and lose the distinction.
 *
 * So classify each run by whether it falls after the tab and whether it is
 * italic, and rewrite only the first run of each field: the same "keep the
 * formatting, replace the text" rule applied at run granularity.
 */
export function replaceInlineHeaderLine(
  paragraphRaw: string,
  company: string,
  title: string,
  date: string
): { raw: string; unplaced: string[] } {
  let seenTab = false;
  let companyDone = false;
  let titleDone = false;
  let dateDone = false;

  const raw = mapRunsInPlace(paragraphRaw, (run) => {
    if (/<w:tab\s*\/>/.test(run)) {
      seenTab = true;
      return run;
    }
    if (extractText(run).trim() === "") return run; // spacer run — untouched

    if (seenTab) {
      if (dateDone) return clearRunText(run);
      dateDone = true;
      return replaceRunTextKeepingGap(run, date);
    }
    if (isItalic(run)) {
      if (titleDone) return clearRunText(run);
      titleDone = true;
      return replaceRunTextKeepingGap(run, title);
    }
    if (companyDone) return clearRunText(run);
    companyDone = true;
    return replaceRunTextKeepingGap(run, company);
  });

  // Which fields found no run to live in.
  //
  // **The original returned only the XML, and that let a field vanish.** Run
  // classification needs one non-empty run per field; a paragraph that does not
  // supply them — every run but the first left empty, which is exactly what a
  // scrubbed fixture looks like — silently produced a line carrying the company
  // and nothing else. Reporting it lets the caller fall back rather than ship a
  // job with no title and no dates.
  const unplaced: string[] = [];
  if (company && !companyDone) unplaced.push("company");
  if (title && !titleDone) unplaced.push("title");
  if (date && !dateDone) unplaced.push("date");

  return { raw, unplaced };
}

/** Does this paragraph carry company, title and date on one line? */
export function looksLikeInlineHeaderLine(raw: string): boolean {
  return /<w:tab\s*\/>/.test(raw) && isItalic(raw);
}

/**
 * A `Label:⇥items` line — what Core Competencies becomes once its table is gone.
 *
 * The same run-granular rule as the experience header line, and here for the
 * same reason: the label is bold and the items are not, so writing the line
 * whole would set the items in the label's weight. Only the first run of each
 * field is rewritten; the tab and any spacer runs are left exactly as they are.
 *
 * Reports what it could not place rather than dropping it, so the caller can
 * fall back to writing the line whole. A row that arrives in the wrong weight is
 * a formatting loss; a row that does not arrive is a correctness one.
 */
export function replaceLabelledLine(
  paragraphRaw: string,
  label: string,
  items: string
): { raw: string; unplaced: string[] } {
  let labelDone = false;
  let itemsDone = false;

  const raw = mapRunsInPlace(paragraphRaw, (run) => {
    if (/<w:tab\s*\/>/.test(run)) return run;
    if (extractText(run).trim() === "") return run; // spacer run — untouched
    if (!labelDone) {
      labelDone = true;
      return replaceRunTextKeepingGap(run, label);
    }
    if (itemsDone) return clearRunText(run);
    itemsDone = true;
    return replaceRunTextKeepingGap(run, items);
  });

  const unplaced: string[] = [];
  if (label && !labelDone) unplaced.push("label");
  if (items && !itemsDone) unplaced.push("items");

  return { raw, unplaced };
}

/**
 * Add Word's keep-lines-together and keep-with-next, so a job entry — its header
 * and every bullet — moves to the next page whole rather than splitting across
 * one. Chain `keepNext` on every paragraph of the entry except the last.
 *
 * Idempotent, and inserts right after `<w:pPr>` (and after a leading
 * `<w:pStyle>` if there is one), which is where the OOXML schema expects them.
 * An entry taller than a page still breaks; Word relaxes this rather than
 * looping, and there is nothing to be done about that.
 */
export function withKeepTogether(paragraphRaw: string, keepNext: boolean): string {
  let toInsert = "";
  if (keepNext && !/<w:keepNext\s*\/>/.test(paragraphRaw)) toInsert += "<w:keepNext/>";
  if (!/<w:keepLines\s*\/>/.test(paragraphRaw)) toInsert += "<w:keepLines/>";
  if (!toInsert) return paragraphRaw;

  if (/<w:pPr\s*\/>/.test(paragraphRaw)) {
    return paragraphRaw.replace(/<w:pPr\s*\/>/, `<w:pPr>${toInsert}</w:pPr>`);
  }
  if (/<w:pPr>/.test(paragraphRaw)) {
    return paragraphRaw.replace(/<w:pPr>(\s*<w:pStyle\b[^>]*\/>)?/, (m) => m + toInsert);
  }
  return paragraphRaw.replace(/^(<w:p\b[^>]*>)/, `$1<w:pPr>${toInsert}</w:pPr>`);
}

// ---- Tables ---------------------------------------------------------------

export function splitRows(tableRaw: string): string[] {
  return tableRaw.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? [];
}

export function splitCells(rowRaw: string): string[] {
  return rowRaw.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? [];
}

export function cellParagraphs(cellRaw: string): string[] {
  return cellRaw.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
}

/**
 * Replace the text of the nth paragraph inside a cell, keeping the cell's own
 * properties — shading, margins, vertical alignment, width — untouched.
 *
 * Matched by counting rather than by string, because paragraphs repeat verbatim
 * inside a cell (two blank ones, for instance) and replacing the first match
 * would rewrite the wrong one.
 */
export function replaceCellParagraphText(cellRaw: string, paraIndex: number, newText: string): string {
  const paras = cellParagraphs(cellRaw);
  if (paraIndex >= paras.length) return cellRaw;
  const replaced = replaceParagraphText(paras[paraIndex], newText);
  let count = -1;
  return cellRaw.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (match) => {
    count += 1;
    return count === paraIndex ? replaced : match;
  });
}

/** Swap one cell for a rewritten copy of itself, by position rather than pattern. */
export function spliceCell(containerRaw: string, cellRaw: string, newCellRaw: string): string {
  return spliceFirst(containerRaw, cellRaw, newCellRaw);
}
