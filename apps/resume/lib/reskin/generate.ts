import { getBodyInner, loadDocx, saveWithDocumentXml, withBodyInner } from "./container";
import { joinBody, splitBody } from "./blocks";
import { extractSourceContent } from "./extract";
import { renderIntoTemplate } from "./render";
import type { ChangeLogEntry, SourceContent } from "./types";
import { compareLines, type ContentCheck } from "../docx/compare";
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
  const lines: string[] = [];
  if (content.summary) lines.push(content.summary);
  for (const h of content.careerHighlights ?? []) lines.push(h.stat, h.desc);
  for (const c of content.competencies ?? []) lines.push(c.label, c.items);
  for (const e of content.experience) {
    lines.push(e.company, e.title, e.date, ...e.bullets);
  }
  return lines.filter((l) => l.trim() !== "");
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
export function checkContent(content: SourceContent, finished: Para[]): ContentCheck {
  const check = compareLines(linesTaken(content), finished);
  const notRead = content.unreadableHighlights ?? [];
  return notRead.length > 0 ? { ...check, notRead } : check;
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
  const source = await loadDocx(sourceBytes, "the tailored resume");

  const content = extractSourceContent(splitBody(getBodyInner(source.documentXml).bodyInner));
  const { blocks, changeLog } = renderIntoTemplate(
    splitBody(getBodyInner(template.documentXml).bodyInner),
    content
  );

  const documentXml = withBodyInner(template.documentXml, joinBody(blocks));
  return { docx: await saveWithDocumentXml(template, documentXml), changeLog, content };
}
