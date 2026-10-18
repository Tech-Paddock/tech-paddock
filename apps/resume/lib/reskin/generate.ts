import { getBodyInner, loadDocx, saveWithDocumentXml, withBodyInner } from "./container";
import { joinBody, splitBody } from "./blocks";
import { extractSourceContent } from "./extract";
import { renderIntoTemplate } from "./render";
import type { ChangeLogEntry, SourceContent } from "./types";
import { compareLines, type ContentCheck, type MissingLine } from "../docx/compare";
import type { Para } from "../docx/paragraphs";

export type ReskinResult = {
  docx: Buffer;
  changeLog: ChangeLogEntry[];
  content: SourceContent;
};

/**
 * Every line the engine took out of the source, which is the right thing to
 * check the output against.
 *
 * Not the same as the source's text: the name and contact block and the static
 * sections are deliberately left behind, so checking the whole source would
 * report the tool's own design as content loss.
 */
export function linesTaken(content: SourceContent): string[] {
  return sectionedLines(content).map((l) => l.text);
}

/**
 * `linesTaken`, each with the section it was taken from.
 *
 * Professional Experience contributes **every line of each entry as the input
 * has it**, not just the fields read out of them. Checking only company, title,
 * date and bullets let a location line or a one-line role description vanish
 * at 100% coverage — the overstatement this check exists to prevent (TEC-107).
 * The fields are kept beside the lines: they are substrings of them, so they
 * can only ever agree.
 */
export function sectionedLines(content: SourceContent): { text: string; section: string }[] {
  const lines: { text: string; section: string }[] = [];
  const add = (section: string, ...texts: string[]) => {
    for (const text of texts) if (text.trim() !== "") lines.push({ text, section });
  };
  if (content.summary) add("Summary", content.summary);
  for (const h of content.careerHighlights ?? []) add("Career Highlights", h.stat, h.desc);
  for (const c of content.competencies ?? []) add("Core Competencies", c.label, c.items);
  for (const e of content.experience) {
    add("Professional Experience", e.company, e.title, e.date, ...e.bullets);
    add("Professional Experience", ...(e.lines ?? []).map((l) => l.text));
  }
  return lines;
}

/**
 * The content check for one reformat: the lines it took, looked for in the
 * finished document, plus the source text it refused to read, named.
 *
 * Refused text is not in `linesTaken` — it was never taken, so it is not lost in
 * copying and does not fail the verdict (Joel, 2026-09-29, TEC-87). But it did
 * not arrive either, and a report silent about it would read as a source with
 * no highlights: the overstatement TEC-79 fixed. So it rides in `notRead`.
 * Both routes call this, so Reformat and Diagnostics cannot disagree.
 */
export function checkContent(content: SourceContent, finished: Para[], changeLog?: ChangeLogEntry[]): ContentCheck {
  const sectioned = sectionedLines(content);
  const check = compareLines(
    sectioned.map((l) => l.text),
    finished
  );
  const notRead = content.unreadableHighlights ?? [];
  const withDetail =
    changeLog && check.missing.length > 0 ? { ...check, missingDetail: explainMissing(check.missing, sectioned, changeLog) } : check;
  return notRead.length > 0 ? { ...withDetail, notRead } : withDetail;
}

/** The change-log actions that say a section lost or never received input. */
const LOSS_ACTIONS = new Set(["input-dropped", "not-found-in-input"]);

/**
 * For each missing line: the section it was taken from, and the render's own
 * reason it is not there (TEC-105).
 *
 * The reason is the change-log entry that names that line, where one does; then
 * the section's own loss entry; and only then a plain statement that the text
 * is not in the document. **Nothing here re-derives a placement** — it reads
 * what the renderer wrote down while it worked.
 */
function explainMissing(
  missing: string[],
  sectioned: { text: string; section: string }[],
  changeLog: ChangeLogEntry[]
): MissingLine[] {
  const sectionOf = new Map<string, string>();
  for (const l of sectioned) if (!sectionOf.has(l.text.trim())) sectionOf.set(l.text.trim(), l.section);

  return missing.map((line) => {
    const section = sectionOf.get(line) ?? "Unknown section";
    const named = changeLog.find((c) => c.lines?.some((l) => l.trim() === line));
    const loss = changeLog.find((c) => c.section === section && LOSS_ACTIONS.has(c.action));
    const reason =
      named?.detail ||
      loss?.detail ||
      `Its text does not appear in the finished document, and the template's ${section} had no place the renderer could put it.`;
    return { line, section, reason };
  });
}

/**
 * Pour the source document's text into the template's formatting.
 *
 * The template is the substrate, not a description of one: its zip is opened,
 * only the body of `word/document.xml` is rewritten block by block, and the same
 * zip is written back out. Everything that defines how the document looks —
 * `styles.xml`, `numbering.xml`, `theme1.xml`, `fontTable.xml`, `settings.xml`,
 * the headers, the section properties, any embedded fonts — is carried through
 * untouched, because it is never read in the first place.
 *
 * Deterministic: the same two files produce the same bytes every time, which is
 * what makes a saved render a trustworthy record of what was actually sent.
 */
export async function reskin(templateBytes: Buffer | Uint8Array, sourceBytes: Buffer | Uint8Array): Promise<ReskinResult> {
  const template = await loadDocx(templateBytes, "the template");
  const source = await loadDocx(sourceBytes, "the Input Resume");

  const content = extractSourceContent(splitBody(getBodyInner(source.documentXml).bodyInner));
  const { blocks, changeLog } = renderIntoTemplate(
    splitBody(getBodyInner(template.documentXml).bodyInner),
    content
  );

  const documentXml = withBodyInner(template.documentXml, joinBody(blocks));
  return { docx: await saveWithDocumentXml(template, documentXml), changeLog, content };
}
