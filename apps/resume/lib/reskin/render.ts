import type { Block } from "./blocks";
import {
  extractText,
  hasNumPr,
  replaceParagraphText,
  replaceInlineHeaderLine,
  looksLikeInlineHeaderLine,
  withKeepTogether,
  splitRows,
  splitCells,
  cellParagraphs,
  replaceCellParagraphText,
  replaceLabelledLine,
  spliceCell,
} from "./blocks";
import { matchSectionKey, normalizeForCompare, type SectionKey } from "./sections";
import { looksLikeContact } from "../docx/label";
import type { SourceContent, ChangeLogEntry, ExperienceEntry, CompetencyRow } from "./types";

interface TemplateSection {
  key: SectionKey | "preamble";
  headerBlockIdx: number | null;
  blockIdxs: number[];
}

/** Split the template into sections by header text — the same rule the
 *  extractor uses, so template and input agree on what a section is. */
function segmentTemplate(blocks: Block[]): TemplateSection[] {
  const sections: TemplateSection[] = [];
  let current: TemplateSection = { key: "preamble", headerBlockIdx: null, blockIdxs: [] };

  blocks.forEach((block, idx) => {
    if (block.type === "p") {
      const text = extractText(block.raw).trim();
      if (text && !hasNumPr(block.raw) && matchSectionKey(text)) {
        sections.push(current);
        current = { key: matchSectionKey(text)!, headerBlockIdx: idx, blockIdxs: [] };
        return;
      }
    }
    current.blockIdxs.push(idx);
  });
  sections.push(current);
  return sections;
}

export function renderIntoTemplate(
  templateBlocks: Block[],
  content: SourceContent
): { blocks: Block[]; changeLog: ChangeLogEntry[] } {
  // The body-level <w:sectPr> and any trailing non-content blocks carry page
  // size, margins, columns and the header reference. They must never be routed
  // through a section renderer, which only re-emits paragraphs and tables. Held
  // aside and re-appended verbatim.
  //
  // This is why the output is US Letter when the template is: the page size is
  // not a property anybody copies, it is a block nobody touches.
  let tailStart = templateBlocks.length;
  while (tailStart > 0 && templateBlocks[tailStart - 1].type === "other") tailStart -= 1;
  const bodyBlocks = templateBlocks.slice(0, tailStart);
  const tailBlocks = templateBlocks.slice(tailStart);

  const changeLog: ChangeLogEntry[] = [];
  const output: Block[] = [];

  const sections = segmentTemplate(bodyBlocks);
  // The summary goes in one place. A template with a Summary heading gets it
  // there; the preamble slot is only for a template without one. Filling both,
  // as this once did, wrote the summary into the document twice.
  const hasSummarySection = sections.some((s) => s.key === "summary");

  for (const section of sections) {
    if (section.headerBlockIdx !== null) output.push(bodyBlocks[section.headerBlockIdx]);

    switch (section.key) {
      case "preamble":
        if (hasSummarySection) output.push(...section.blockIdxs.map((i) => bodyBlocks[i]));
        else output.push(...renderSummary(bodyBlocks, section.blockIdxs, content, changeLog));
        break;
      case "summary":
        output.push(...renderSummary(bodyBlocks, section.blockIdxs, content, changeLog));
        break;
      case "careerHighlights":
        output.push(...renderCareerHighlights(bodyBlocks, section.blockIdxs, content, changeLog));
        break;
      case "experience":
        output.push(...renderExperience(bodyBlocks, section.blockIdxs, content, changeLog));
        break;
      case "competencies":
        output.push(...renderCompetencies(bodyBlocks, section.blockIdxs, content, changeLog));
        break;
      case "education":
      case "certifications":
      case "hobbies":
        output.push(...section.blockIdxs.map((i) => bodyBlocks[i]));
        changeLog.push({
          section: sectionLabel(section.key),
          action: "passthrough",
          detail: "Static section — copied from the template unchanged. Edit it in the template.",
        });
        break;
    }
  }

  for (const u of content.unplacedSections ?? []) {
    changeLog.push({
      section: u.heading,
      action: "input-dropped",
      detail: `The source's "${u.heading}" section (${u.lines} ${u.lines === 1 ? "line" : "lines"}) has no section in the template, so it was not carried over. Add one to the template to keep it.`,
    });
  }

  // Never "the input had none". It had some, and they could not be paired
  // without guessing, so none of that text reaches the document (TEC-79).
  const unreadable = content.unreadableHighlights ?? [];
  if (unreadable.length > 0) {
    changeLog.push({
      section: "Career Highlights",
      action: "input-dropped",
      detail: `The source's Career Highlights (${unreadable.length} ${unreadable.length === 1 ? "cell" : "cells"}) could not be read into metric and description pairs, so none of them were carried over and the template's were kept. Fix the source's table so its rows line up.`,
    });
  }

  return { blocks: [...output, ...tailBlocks], changeLog };
}

const LABELS: Record<string, string> = {
  preamble: "Preamble",
  summary: "Summary",
  careerHighlights: "Career Highlights",
  experience: "Professional Experience",
  competencies: "Core Competencies",
  education: "Education",
  certifications: "Certifications",
  hobbies: "Hobbies",
};
const sectionLabel = (key: SectionKey | "preamble") => LABELS[key] ?? key;

// ---- Summary --------------------------------------------------------------

/**
 * Prose reads as a summary; a name or a credentials line does not. Eight words
 * is below every summary either real template has carried and above every name,
 * and the lines in between — `Certified Administrator · Certified Business
 * Analyst`, `name@example.com · 555.0100 · linkedin.com/in/x` — are already
 * excluded as contact lines by their separators.
 */
const SUMMARY_MIN_WORDS = 8;

/** The preamble paragraph the input's summary belongs in, or null if there is none. */
function summarySlot(blocks: Block[], idxs: number[]): number | null {
  let best: { idx: number; length: number } | null = null;
  for (const idx of idxs) {
    const block = blocks[idx];
    if (block.type !== "p") continue;
    const text = extractText(block.raw).trim();
    if (!text || looksLikeContact(text)) continue;
    if (text.split(/\s+/).length < SUMMARY_MIN_WORDS) continue;
    if (!best || text.length > best.length) best = { idx, length: text.length };
  }
  return best === null ? null : best.idx;
}

/**
 * Replace the summary, and leave every other preamble paragraph alone.
 *
 * **The rule this replaced was "the first non-empty paragraph", and it held only
 * while the name and contact block lived in `word/header1.xml`.** That placement
 * is the template's worst ATS defect — many parsers never read a header — so the
 * fix is to move the block into the body, and the moment it moves, the first
 * non-empty paragraph is the name. The old rule would have written the summary
 * over it and deleted it, *silently*: coverage checks that the input's text
 * arrived, never that the template's survived, so nothing on screen would have
 * said the name was gone.
 *
 * The slot is therefore chosen rather than assumed. Where nothing qualifies, the
 * template has no summary paragraph and the input's summary is reported as
 * unplaced instead of being forced into a paragraph that means something else —
 * the content check then counts it missing, which is the honest answer.
 */
function renderSummary(
  blocks: Block[],
  idxs: number[],
  content: SourceContent,
  log: ChangeLogEntry[]
): Block[] {
  if (!content.summary) {
    log.push({
      section: "Summary",
      action: "not-found-in-input",
      detail: "No summary in the input — the template's was kept.",
    });
    return idxs.map((i) => blocks[i]);
  }

  const slot = summarySlot(blocks, idxs);
  if (slot === null) {
    log.push({
      section: "Summary",
      action: "not-found-in-input",
      detail:
        "The template has no summary paragraph above its first heading, so the input's summary was not placed. Add one to the template.",
    });
    return idxs.map((i) => blocks[i]);
  }

  log.push({ section: "Summary", action: "replaced", detail: "Replaced from the input." });
  return idxs.map((i) =>
    i === slot ? { type: "p" as const, raw: replaceParagraphText(blocks[i].raw, content.summary!) } : blocks[i]
  );
}

// ---- Career Highlights ----------------------------------------------------

interface StatCellRaw {
  cellRaw: string;
  stat: string;
  desc: string;
}

function statCellsRaw(tableRaw: string): StatCellRaw[] {
  const cells: StatCellRaw[] = [];
  for (const row of splitRows(tableRaw)) {
    for (const cellRaw of splitCells(row)) {
      const paras = cellParagraphs(cellRaw).map((p) => extractText(p).trim());
      if (paras.length >= 2) cells.push({ cellRaw, stat: paras[0], desc: paras[1] });
    }
  }
  return cells;
}

/**
 * The one section with a diff check: if every highlight already matches the
 * template, the table is left **completely** untouched rather than rewritten to
 * the same values. A rewrite that changes nothing is still a rewrite, and the
 * only way to guarantee a byte is unchanged is not to write it.
 */
function renderCareerHighlights(
  blocks: Block[],
  idxs: number[],
  content: SourceContent,
  log: ChangeLogEntry[]
): Block[] {
  const out: Block[] = [];
  for (const idx of idxs) {
    const block = blocks[idx];
    if (block.type !== "tbl") {
      out.push(block);
      continue;
    }
    const highlights = content.careerHighlights;
    if (content.unreadableHighlights) {
      // The input had highlights this could not read. The template's stay, and
      // the drop is logged once, below, whatever shape the template has.
      out.push(block);
      continue;
    }
    if (!highlights || highlights.length === 0) {
      out.push(block);
      log.push({
        section: "Career Highlights",
        action: "kept-unchanged",
        detail: "The input had no Career Highlights — the template's were kept.",
      });
      continue;
    }

    const templateCells = statCellsRaw(block.raw);
    const unchanged =
      templateCells.length === highlights.length &&
      templateCells.every(
        (tc, i) =>
          normalizeForCompare(tc.stat) === normalizeForCompare(highlights[i].stat) &&
          normalizeForCompare(tc.desc) === normalizeForCompare(highlights[i].desc)
      );

    if (unchanged) {
      out.push(block);
      log.push({
        section: "Career Highlights",
        action: "kept-unchanged",
        detail: `All ${highlights.length} match the template — left untouched.`,
      });
      continue;
    }

    let newRaw = block.raw;
    templateCells.forEach((tc, i) => {
      const cc = highlights[i];
      if (!cc) return;
      let cell = replaceCellParagraphText(tc.cellRaw, 0, cc.stat);
      cell = replaceCellParagraphText(cell, 1, cc.desc);
      newRaw = spliceCell(newRaw, tc.cellRaw, cell);
    });
    out.push({ type: "tbl", raw: newRaw });
    log.push({
      section: "Career Highlights",
      action: "replaced",
      detail: "Changed from the template — updated with the input's text.",
    });

    // A count mismatch is never silent. The table's cells are its layout, so a
    // cell is neither added nor removed here — but which highlights went where
    // is a change-log line each. A template cell the input did not reach ships
    // the template's own figure; an input highlight with no cell does not ship.
    for (let i = highlights.length; i < templateCells.length; i += 1) {
      log.push({
        section: "Career Highlights",
        action: "not-found-in-input",
        detail: `Highlight ${i + 1} keeps the template's own text ("${templateCells[i].stat}") — the input has ${highlights.length}.`,
      });
    }
    for (let i = templateCells.length; i < highlights.length; i += 1) {
      log.push({
        section: "Career Highlights",
        action: "input-dropped",
        detail: `Highlight ${i + 1} ("${highlights[i].stat}") has no cell in the template's table, so it was dropped — the template has ${templateCells.length}.`,
      });
    }
  }
  return out;
}

// ---- Core Competencies ----------------------------------------------------

const LIST_SEPARATORS = [" · ", " • ", " | ", " / ", " – ", " — "];

const detectListSeparator = (templateCellText: string) =>
  LIST_SEPARATORS.find((s) => templateCellText.includes(s)) ?? null;

/**
 * Swap ", " for the template's own separator, leaving commas inside parentheses
 * alone — "Salesforce configuration (objects, fields, security model)" is one
 * item, not three.
 */
function reformatListSeparators(text: string, sep: string): string {
  let depth = 0;
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth = Math.max(0, depth - 1);
    if (c === "," && depth === 0 && text[i + 1] === " ") {
      out += sep;
      i += 1; // consume the space
    } else {
      out += c;
    }
  }
  return out;
}

function replaceRowLabelItems(rowRaw: string, label: string, items: string): string {
  const cells = splitCells(rowRaw);
  if (cells.length < 2) return rowRaw;
  let newRow = spliceCell(
    rowRaw,
    cells[0],
    replaceCellParagraphText(cells[0], 0, label.endsWith(":") ? label : `${label}:`)
  );
  const sep = detectListSeparator(extractText(cells[1]));
  const formatted = sep ? reformatListSeparators(items, sep) : items;
  newRow = spliceCell(newRow, cells[1], replaceCellParagraphText(cells[1], 0, formatted));
  return newRow;
}

/**
 * Core Competencies arrives in either shape, and the shape is the template's to
 * decide.
 *
 * **A table here is the template's one blocking ATS defect that is also easy to
 * fix**: `CLAUDE.md` allows exactly one table, Career Highlights, whose content
 * is repeated in the body bullets so a parser that drops it loses nothing. Core
 * Competencies as a second table is keyword coverage a parser may scramble or
 * skip, and those keywords are the whole point of the section.
 *
 * So the template's own table was flattened into `Label:⇥items` paragraphs. The
 * renderer reads both because a template is a file Joel edits, not a shape this
 * code gets to assume — and because the alternative was worse than a defect: the
 * table branch simply passed paragraphs through, so a flattened template would
 * have rendered the *template's* competencies on every job while the input's were
 * dropped, with a clean 100% coverage report over text that never arrived.
 */
function renderCompetencies(
  blocks: Block[],
  idxs: number[],
  content: SourceContent,
  log: ChangeLogEntry[]
): Block[] {
  const rowsContent = content.competencies;
  if (!rowsContent || rowsContent.length === 0) {
    log.push({
      section: "Core Competencies",
      action: "not-found-in-input",
      detail: "No competencies in the input — the template's were kept.",
    });
    return idxs.map((i) => blocks[i]);
  }
  return idxs.some((i) => blocks[i].type === "tbl")
    ? renderCompetenciesTable(blocks, idxs, rowsContent, log)
    : renderCompetenciesParagraphs(blocks, idxs, rowsContent, log);
}

/** One paragraph per row, written at run granularity so the label keeps its weight. */
function writeCompetencyLine(templateRaw: string, row: CompetencyRow, log: ChangeLogEntry[]): string {
  const label = row.label.endsWith(":") ? row.label : `${row.label}:`;
  const sep = detectListSeparator(extractText(templateRaw));
  const items = sep ? reformatListSeparators(row.items, sep) : row.items;

  const inline = replaceLabelledLine(templateRaw, label, items);
  if (inline.unplaced.length === 0) return inline.raw;

  // The same trade as the experience header line, for the same reason: the
  // template's line does not supply a run per field, so it is written whole and
  // the label's own weight is lost. A row in the wrong weight beats a row that
  // never arrives.
  log.push({
    section: "Core Competencies",
    action: "replaced",
    detail: `${row.label}: the template's line has no separate run for the ${inline.unplaced.join(" or ")}, so it was written whole and the label's own formatting was not kept.`,
  });
  const gap = /<w:tab\s*\/>/.test(templateRaw) ? "\t" : " ";
  return replaceParagraphText(templateRaw, `${label}${gap}${items}`);
}

function renderCompetenciesParagraphs(
  blocks: Block[],
  idxs: number[],
  rowsContent: CompetencyRow[],
  log: ChangeLogEntry[]
): Block[] {
  // Blank paragraphs in this section are the rule above the next heading and the
  // spacing around it. They are layout, not rows, and keep their places.
  const rowIdxs = idxs.filter((i) => blocks[i].type === "p" && extractText(blocks[i].raw).trim() !== "");
  if (rowIdxs.length === 0) {
    log.push({
      section: "Core Competencies",
      action: "kept-unchanged",
      detail: "No competency lines found in the template — kept as-is.",
    });
    return idxs.map((i) => blocks[i]);
  }

  const rewritten = new Map<number, Block | null>();
  rowIdxs.forEach((idx, i) => {
    const row = rowsContent[i];
    if (!row) {
      rewritten.set(idx, null);
      log.push({
        section: "Core Competencies",
        action: "template-trimmed",
        detail: `Template line ${i + 1} dropped — no matching input row.`,
      });
      return;
    }
    rewritten.set(idx, { type: "p", raw: writeCompetencyLine(blocks[idx].raw, row, log) });
    log.push({ section: "Core Competencies", action: "replaced", detail: `Row ${i + 1} (${row.label}).` });
  });

  const lastRowIdx = rowIdxs[rowIdxs.length - 1];
  const overflow: Block[] = [];
  for (let i = rowIdxs.length; i < rowsContent.length; i += 1) {
    const row = rowsContent[i];
    overflow.push({ type: "p", raw: writeCompetencyLine(blocks[lastRowIdx].raw, row, log) });
    log.push({
      section: "Core Competencies",
      action: "cloned-overflow",
      detail: `Extra row "${row.label}" cloned from the template's last line.`,
    });
  }

  const out: Block[] = [];
  for (const idx of idxs) {
    if (rewritten.has(idx)) {
      const block = rewritten.get(idx);
      if (block) out.push(block);
      if (idx === lastRowIdx) out.push(...overflow);
      continue;
    }
    out.push(blocks[idx]);
  }
  return out;
}

function renderCompetenciesTable(
  blocks: Block[],
  idxs: number[],
  rowsContent: CompetencyRow[],
  log: ChangeLogEntry[]
): Block[] {
  const out: Block[] = [];
  for (const idx of idxs) {
    const block = blocks[idx];
    if (block.type !== "tbl") {
      out.push(block);
      continue;
    }

    const rows = splitRows(block.raw);
    if (rows.length === 0) {
      out.push(block);
      continue;
    }
    const newRows: string[] = [];
    for (let i = 0; i < Math.max(rows.length, rowsContent.length); i += 1) {
      const cc = rowsContent[i];
      if (i < rows.length && cc) {
        newRows.push(replaceRowLabelItems(rows[i], cc.label, cc.items));
        log.push({ section: "Core Competencies", action: "replaced", detail: `Row ${i + 1} (${cc.label}).` });
      } else if (i < rows.length) {
        log.push({
          section: "Core Competencies",
          action: "template-trimmed",
          detail: `Template row ${i + 1} dropped — no matching input row.`,
        });
      } else {
        newRows.push(replaceRowLabelItems(rows[rows.length - 1], cc.label, cc.items));
        log.push({
          section: "Core Competencies",
          action: "cloned-overflow",
          detail: `Extra row "${cc.label}" cloned from the template's last row.`,
        });
      }
    }

    const firstRowIdx = block.raw.indexOf("<w:tr");
    const lastRowEnd = block.raw.lastIndexOf("</w:tr>") + "</w:tr>".length;
    out.push({
      type: "tbl",
      raw: block.raw.slice(0, firstRowIdx) + newRows.join("") + block.raw.slice(lastRowEnd),
    });
  }
  return out;
}

// ---- Professional Experience ----------------------------------------------

interface TemplateExpEntry {
  headerIdxs: number[];
  bulletIdxs: number[];
}

function renderExperience(
  blocks: Block[],
  idxs: number[],
  content: SourceContent,
  log: ChangeLogEntry[]
): Block[] {
  const lines = idxs
    .filter((i) => blocks[i].type === "p")
    .map((i) => {
      const text = extractText(blocks[i].raw).trim();
      return { idx: i, bulleted: hasNumPr(blocks[i].raw), isBlank: text.length === 0 };
    });

  // Spacing between entries comes from each header paragraph's own `spacing
  // before`, so blank separator paragraphs are not synthesised. Only blanks
  // trailing the last entry — the gap before the next heading — are kept; a
  // stray blank between entries would double the gap.
  let lastNonBlankPos = -1;
  lines.forEach((l, pos) => {
    if (!l.isBlank) lastNonBlankPos = pos;
  });
  const trailingBlankIdxs = lines.slice(lastNonBlankPos + 1).filter((l) => l.isBlank).map((l) => l.idx);
  const interiorBlanks = lines.slice(0, lastNonBlankPos + 1).filter((l) => l.isBlank).length;
  if (interiorBlanks > 0) {
    log.push({
      section: "Professional Experience",
      action: "template-trimmed",
      detail: `Dropped ${interiorBlanks} blank line(s) between entries — spacing comes from each header's own paragraph spacing.`,
    });
  }

  const entries: TemplateExpEntry[] = [];
  let current: TemplateExpEntry | null = null;
  for (const line of lines.filter((l) => !l.isBlank)) {
    if (!line.bulleted) {
      if (current === null || current.bulletIdxs.length > 0) {
        if (current) entries.push(current);
        current = { headerIdxs: [line.idx], bulletIdxs: [] };
      } else {
        current.headerIdxs.push(line.idx);
      }
    } else {
      if (current === null) current = { headerIdxs: [], bulletIdxs: [] };
      current.bulletIdxs.push(line.idx);
    }
  }
  if (current) entries.push(current);

  const out: Block[] = [];
  if (entries.length === 0) {
    // Nothing in the template to map onto. Keep it verbatim rather than
    // emitting an empty section — silence here would read as "you have no jobs".
    log.push({
      section: "Professional Experience",
      action: "kept-unchanged",
      detail: "No entry layout found in the template — kept as-is.",
    });
    return idxs.map((i) => blocks[i]);
  }

  // Everything in the section that is not a paragraph: the open and close tags
  // of a content control, a bookmark, a table. The entries are regrouped, so
  // these cannot keep their exact places — but they were being dropped, and a
  // dropped `<w:sdt>` opener whose closer sits in the next section is malformed
  // XML. So each is kept, in its original order among the others: those before
  // the first line go before the entries and the rest after. Order among the
  // markers is all well-formedness needs, since a paragraph is a whole element
  // wherever it lands.
  const firstLineIdx = lines.find((l) => !l.isBlank)?.idx ?? Infinity;
  const nonParagraph = idxs.filter((i) => blocks[i].type !== "p");
  const leading = nonParagraph.filter((i) => i < firstLineIdx);
  const trailing = nonParagraph.filter((i) => i > firstLineIdx);
  for (const i of nonParagraph) {
    if (blocks[i].type !== "tbl") continue;
    log.push({
      section: "Professional Experience",
      action: "kept-unchanged",
      detail:
        "A table inside Professional Experience was kept as the template has it. Jobs are never written into a table, so it carries the template's own text — remove it from the template.",
    });
  }
  for (const i of leading) out.push(blocks[i]);

  for (let i = 0; i < Math.max(entries.length, content.experience.length); i += 1) {
    const input = content.experience[i];
    if (i < entries.length && input) {
      out.push(...renderEntry(blocks, entries[i], input, log));
    } else if (i < entries.length) {
      log.push({
        section: "Professional Experience",
        action: "template-trimmed",
        detail: `Template entry ${i + 1} dropped — no matching job in the input.`,
      });
    } else {
      log.push({
        section: "Professional Experience",
        action: "cloned-overflow",
        detail: `${input.company}: extra job cloned from the template's last entry layout.`,
      });
      out.push(...renderEntry(blocks, entries[entries.length - 1], input, log));
    }
  }
  for (const i of trailing) out.push(blocks[i]);
  for (const idx of trailingBlankIdxs) out.push(blocks[idx]);

  return out;
}

function renderEntry(
  blocks: Block[],
  entry: TemplateExpEntry,
  input: ExperienceEntry,
  log: ChangeLogEntry[]
): Block[] {
  const out: Block[] = [];

  const headerRaw = entry.headerIdxs[0] !== undefined ? blocks[entry.headerIdxs[0]].raw : null;
  const inline =
    headerRaw !== null && entry.headerIdxs.length === 1 && looksLikeInlineHeaderLine(headerRaw)
      ? replaceInlineHeaderLine(headerRaw, input.company, input.title, input.date)
      : null;

  if (inline && inline.unplaced.length === 0) {
    // Company, title and date share one line against a right tab stop, and each
    // has a run of its own. Rewritten at run granularity so every field keeps
    // its own weight, slant and colour.
    out.push({ type: "p", raw: inline.raw });
  } else if (headerRaw !== null && entry.headerIdxs.length === 1) {
    // One header paragraph whose runs cannot carry the three fields separately.
    //
    // **Not the original's behaviour, and the original's lost data twice over.**
    // It wrote the company into header line 0 and title and date into header
    // line 1, so a single-line header dropped both; and where the line *did*
    // look inline, run classification could still place only the fields that
    // had a non-empty run, leaving the rest nowhere with nothing saying so.
    //
    // The whole line is composed instead. That costs the per-field weight and
    // slant, which is a formatting loss — and a formatting loss is the cheaper
    // one. Shipping a job with no title is a correctness failure, and this
    // renderer's contract is that text is never lost.
    //
    // The tab is reproduced only where the template's line had one, so the date
    // lands on an existing right tab stop rather than against one that was
    // never there.
    const gap = /<w:tab\s*\/>/.test(headerRaw) ? "\t" : "   ";
    const parts = [input.company, input.title].filter(Boolean).join("   ");
    out.push({
      type: "p",
      raw: replaceParagraphText(headerRaw, input.date ? `${parts}${gap}${input.date}` : parts),
    });
    if (inline) {
      log.push({
        section: "Professional Experience",
        action: "replaced",
        detail: `${input.company}: the template's header line has no separate run for ${inline.unplaced.join(" or ")}, so the line was written whole and its per-field formatting was not kept.`,
      });
    }
  } else {
    if (headerRaw !== null) {
      out.push({ type: "p", raw: replaceParagraphText(headerRaw, input.company) });
    }
    if (entry.headerIdxs[1] !== undefined) {
      const titleDate = input.date ? `${input.title}\t${input.date}` : input.title;
      out.push({ type: "p", raw: replaceParagraphText(blocks[entry.headerIdxs[1]].raw, titleDate) });
    }
  }

  const bulletTemplateRaw = blocks[entry.bulletIdxs[entry.bulletIdxs.length - 1]]?.raw;
  for (let i = 0; i < Math.max(entry.bulletIdxs.length, input.bullets.length); i += 1) {
    if (i < entry.bulletIdxs.length && i < input.bullets.length) {
      out.push({ type: "p", raw: replaceParagraphText(blocks[entry.bulletIdxs[i]].raw, input.bullets[i]) });
    } else if (i < entry.bulletIdxs.length) {
      log.push({
        section: "Professional Experience",
        action: "template-trimmed",
        detail: `${input.company}: template bullet ${i + 1} dropped — no matching input bullet.`,
      });
    } else if (bulletTemplateRaw) {
      out.push({ type: "p", raw: replaceParagraphText(bulletTemplateRaw, input.bullets[i]) });
      log.push({
        section: "Professional Experience",
        action: "cloned-overflow",
        detail: `${input.company}: bullet ${i + 1} cloned from the template's last bullet.`,
      });
    } else {
      // The template's entry has no bullet to clone, so this one has nowhere to
      // go. It used to fall out of the loop with nothing said; the content check
      // would still have counted it missing, but the change log is where the
      // reason lives.
      log.push({
        section: "Professional Experience",
        action: "input-dropped",
        detail: `${input.company}: bullet ${i + 1} dropped — the template's entry has no bullet to clone.`,
      });
    }
  }
  log.push({
    section: "Professional Experience",
    action: "replaced",
    detail: `${input.company} — ${input.title} (${input.date || "no date found"}).`,
  });

  // Keep the whole entry on one page: keepLines on every paragraph, keepNext on
  // all but the last. An entry taller than a page still breaks — Word relaxes
  // this rather than looping, and nothing can be done about that.
  return out.map((b, i) => (b.type === "p" ? { type: "p", raw: withKeepTogether(b.raw, i < out.length - 1) } : b));
}
