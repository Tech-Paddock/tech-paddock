import type { Block } from "./blocks";
import { extractText, isBold, isItalic, hasNumPr, splitRows, splitCells, cellParagraphs } from "./blocks";
import { matchSectionKey, splitCompanyAndTitleDate, type SectionKey } from "./sections";
import { isHeadingCandidate, isKnownHeading, rankSizes } from "../docx/headings";
import { extractParagraphs, type Para } from "../docx/paragraphs";
import type { SourceContent, ExperienceEntry, CompetencyRow, StatCell, UnplacedSection } from "./types";

interface RawExpLine {
  text: string;
  bulleted: boolean;
  bold: boolean;
  italic: boolean;
}

/**
 * Pull plain content out of any resume-shaped document body.
 *
 * Sections are identified by heading **text**, not by Word style, because source
 * files do not reliably use heading styles — Jobright's `styles.xml` defines no
 * named styles whatsoever. The alias list is specific enough that a non-bulleted
 * line whose whole text equals one of them is a heading rather than body copy.
 */
export function extractSourceContent(blocks: Block[]): SourceContent {
  const isUnknownHeading = unknownHeadingTest(blocks);
  // "unplaced" is a heading this template has no section for. Everything under
  // it is counted and reported rather than collected.
  let currentSection: SectionKey | "unplaced" | null = null;
  const unplaced: UnplacedSection[] = [];
  const summaryParts: string[] = [];
  const expLines: RawExpLine[] = [];
  let careerHighlights: StatCell[] | null = null;
  const careerHighlightLines: string[] = [];
  let competencies: CompetencyRow[] | null = null;
  const competencyPlainRows: CompetencyRow[] = [];

  for (const block of blocks) {
    if (block.type === "p") {
      const text = extractText(block.raw).trim();
      if (!text) continue;

      if (!hasNumPr(block.raw)) {
        const key = matchSectionKey(text);
        if (key) {
          currentSection = key;
          continue;
        }
        // A heading with no section here — "Projects" after Experience. It ends
        // the section before it, which used to run on and read every project as
        // another job. Front matter is left alone: nothing is collected there,
        // and the name block is exactly where a large one-off line lives.
        if (currentSection !== null && (isKnownHeading(text) || isUnknownHeading(block))) {
          currentSection = "unplaced";
          unplaced.push({ heading: text, lines: 0 });
          continue;
        }
      }

      switch (currentSection) {
        case "unplaced":
          unplaced[unplaced.length - 1].lines += 1;
          break;
        case null:
          // Front matter — the name and contact block. Deliberately dropped: the
          // template's own header is always kept, and pulling a second copy of
          // the contact line into the body is how it ends up twice.
          break;
        case "summary":
          summaryParts.push(text);
          break;
        case "experience":
          expLines.push({
            text,
            bulleted: hasNumPr(block.raw),
            bold: isBold(block.raw),
            italic: isItalic(block.raw),
          });
          break;
        case "education":
        case "certifications":
        case "hobbies":
          // Static sections, copied from the template and never read from the
          // input. Recognised here only so Experience and Competencies stop
          // collecting once we reach them.
          break;
        case "competencies": {
          const m = text.match(/^([^:]{2,40}):\s*(.+)$/);
          if (m) competencyPlainRows.push({ label: m[1].trim(), items: m[2].trim() });
          else if (competencyPlainRows.length > 0) {
            competencyPlainRows[competencyPlainRows.length - 1].items += ", " + text;
          }
          break;
        }
        case "careerHighlights":
          // A table in the template, but Jobright exports it as a markdown pipe
          // table pasted in as ordinary paragraphs. Collect now, parse below.
          careerHighlightLines.push(text);
          break;
      }
    } else if (block.type === "tbl") {
      if (currentSection === "careerHighlights") careerHighlights = statCellsFromTable(block.raw);
      else if (currentSection === "competencies") competencies = competencyRowsFromTable(block.raw);
      else if (currentSection === "unplaced") unplaced[unplaced.length - 1].lines += 1;
    }
  }

  if (careerHighlights === null && careerHighlightLines.length > 0) {
    careerHighlights = parsePipeTable(careerHighlightLines) ?? parseColonPairs(careerHighlightLines);
  }
  if (competencies === null && competencyPlainRows.length > 0) {
    competencies = competencyPlainRows;
  }

  return {
    summary: summaryParts.length ? summaryParts.join(" ") : null,
    careerHighlights,
    experience: groupExperienceEntries(expLines),
    competencies,
    ...(unplaced.length > 0 ? { unplacedSections: unplaced } : {}),
  };
}

/**
 * Is this block a heading the vocabulary does not know?
 *
 * Text alone cannot say — an unknown heading is by definition not in the list —
 * so this asks the question `lib/docx/headings.ts` already answers for the lint
 * and the outline: set at the document's recurring heading size, with no date
 * range and no interior tab. Italic is excluded as well: a job title set at the
 * heading size is italic in every source seen, and a heading never has been, so
 * a title line cannot end Experience early.
 */
function unknownHeadingTest(blocks: Block[]): (block: Block) => boolean {
  const paraOf = new Map<Block, Para>();
  for (const block of blocks) {
    if (block.type !== "p") continue;
    const para = extractParagraphs(block.raw)[0];
    if (para && para.text.trim()) paraOf.set(block, para);
  }
  const { heading } = rankSizes([...paraOf.values()]);
  return (block) => {
    const p = paraOf.get(block);
    return heading !== null && !!p && p.size === heading && !p.italic && isHeadingCandidate(p);
  };
}

function groupExperienceEntries(lines: RawExpLine[]): ExperienceEntry[] {
  type Working = { headerLines: RawExpLine[]; bullets: string[]; bulletsStarted: boolean };
  const entries: Working[] = [];
  let current: Working | null = null;

  for (const line of lines) {
    if (!line.bulleted) {
      if (current === null || current.bulletsStarted) {
        if (current) entries.push(current);
        current = { headerLines: [line], bullets: [], bulletsStarted: false };
      } else {
        current.headerLines.push(line);
      }
    } else {
      if (current === null) current = { headerLines: [], bullets: [], bulletsStarted: false };
      current.bullets.push(line.text);
      current.bulletsStarted = true;
    }
  }
  if (current) entries.push(current);

  return entries.map((e) => ({ ...splitCompanyAndTitleDate(e.headerLines), bullets: e.bullets }));
}

function statCellsFromTable(tableRaw: string): StatCell[] {
  const cells: StatCell[] = [];
  for (const row of splitRows(tableRaw)) {
    for (const cell of splitCells(row)) {
      const paras = cellParagraphs(cell).map((p) => extractText(p).trim());
      if (paras.length >= 2) cells.push({ stat: paras[0], desc: paras[1] });
    }
  }
  return cells;
}

/**
 * Jobright renders Career Highlights as a markdown pipe table — a row of
 * metrics, an alignment row, a row of descriptions — pasted in as paragraphs.
 *
 * Returns null unless the shape is unambiguous and nothing is lost: one row of
 * metrics, one of descriptions, equal cell counts. Null means the template's own
 * Career Highlights stays untouched, which is the right answer when the input
 * cannot be read confidently — a guess here costs keyword coverage.
 */
function parsePipeTable(lines: string[]): StatCell[] | null {
  const rows = lines
    .filter((l) => l.includes("|"))
    .map((l) => {
      const cells = l.split("|").map((c) => c.trim());
      if (cells[0] === "") cells.shift();
      if (cells[cells.length - 1] === "") cells.pop();
      return cells;
    })
    .filter((cells) => cells.length > 0 && !cells.every((c) => /^:?-{2,}:?$/.test(c)));

  if (rows.length < 2) return null;
  const [stats, descs] = rows;
  // Any equal, non-empty pair of rows, rather than exactly four. The original
  // hardcoded four because that is what the template had; a template with three
  // highlights would have silently kept its own text with nothing saying so.
  if (stats.length === 0 || stats.length !== descs.length) return null;
  if (stats.some((s) => !s) || descs.some((d) => !d)) return null;
  return stats.map((stat, i) => ({ stat, desc: descs[i] }));
}

/**
 * The other shape Career Highlights arrive in: one paragraph per highlight,
 * `metric: description`.
 *
 * **Not in the original, and its absence was a silent failure.** The original
 * read only the pipe table and returned null for anything else, and null means
 * "keep the template's highlights" — so a source written this way left the old
 * numbers in place with nothing on screen saying so. The stated intent was
 * always to replace them when they differ; only the reader was too narrow. The
 * repo's own source fixture is written this way.
 *
 * The metric is short by construction — a figure, not a sentence — so a colon
 * far into the line is prose punctuation rather than a separator. 24 characters
 * is the bound the old paragraph labeller used for this.
 */
function parseColonPairs(lines: string[]): StatCell[] | null {
  const pairs: StatCell[] = [];
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon <= 0 || colon > 24) return null;
    const stat = line.slice(0, colon).trim();
    const desc = line.slice(colon + 1).trim();
    if (!stat || !desc) return null;
    pairs.push({ stat, desc });
  }
  return pairs.length > 0 ? pairs : null;
}

function competencyRowsFromTable(tableRaw: string): CompetencyRow[] {
  const rows: CompetencyRow[] = [];
  for (const row of splitRows(tableRaw)) {
    const cells = splitCells(row);
    if (cells.length >= 2) {
      rows.push({
        label: cellParagraphs(cells[0]).map(extractText).join(" ").trim(),
        items: cellParagraphs(cells[1]).map(extractText).join(" ").trim(),
      });
    }
  }
  return rows;
}
