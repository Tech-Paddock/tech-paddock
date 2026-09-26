import { getBodyInner, loadDocx, saveWithDocumentXml, withBodyInner } from "./container";
import { joinBody, splitBody } from "./blocks";
import { extractSourceContent } from "./extract";
import { renderIntoTemplate } from "./render";
import type { ChangeLogEntry, SourceContent } from "./types";

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
  // Not placed anywhere, and that is the point: they are source text, so the
  // check must look for them and name them when they are missing (TEC-79).
  lines.push(...(content.unreadableHighlights ?? []));
  for (const c of content.competencies ?? []) lines.push(c.label, c.items);
  for (const e of content.experience) {
    lines.push(e.company, e.title, e.date, ...e.bullets);
  }
  return lines.filter((l) => l.trim() !== "");
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
