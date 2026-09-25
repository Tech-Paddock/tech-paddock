import JSZip from "jszip";
import { DocxReadError } from "../docx/read";

/**
 * The template's own zip, held open so the output can be written back into it.
 *
 * **This is the whole reason the output keeps the template's formatting.** Only
 * `word/document.xml` is ever rewritten; `styles.xml`, `numbering.xml`,
 * `theme1.xml`, `fontTable.xml`, `settings.xml`, the headers and any embedded
 * fonts are carried through untouched, so nothing in them can be lost by being
 * modelled badly — they are never modelled at all.
 */
export interface DocxContainer {
  zip: JSZip;
  documentXml: string;
}

const DOCUMENT_PART = "word/document.xml";

/**
 * Throws `DocxReadError` rather than a local error type, so the API routes keep
 * mapping an unreadable upload to a 422 through the handler they already have.
 */
export async function loadDocx(bytes: ArrayBuffer | Uint8Array | Buffer, label = "upload"): Promise<DocxContainer> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new DocxReadError("not_a_docx", `${label} isn't a Word .docx — it could not be read as a zip archive.`);
  }
  const file = zip.file(DOCUMENT_PART);
  if (!file) {
    throw new DocxReadError("not_a_docx", `${label} has no ${DOCUMENT_PART}, so it isn't a Word .docx.`);
  }
  return { zip, documentXml: await file.async("string") };
}

/**
 * Write a modified `document.xml` back into a copy of the container.
 *
 * Mutating `original.zip` in place is safe because every caller loads it fresh
 * from the stored bytes; there is no shared cached copy to corrupt.
 */
export async function saveWithDocumentXml(original: DocxContainer, newDocumentXml: string): Promise<Buffer> {
  // The entry keeps the template's own timestamp, and JSZip is told not to
  // invent a `word/` folder entry. Either one stamps the current time into the
  // archive, so the same two inputs gave different bytes and a different
  // `content_hash` from one second to the next — and a render is only a
  // trustworthy record if the same inputs give the same file. The folder entry
  // was also a part the template never had.
  const date = original.zip.file(DOCUMENT_PART)?.date;
  original.zip.file(DOCUMENT_PART, newDocumentXml, { createFolders: false, ...(date ? { date } : {}) });
  return original.zip.generateAsync({ type: "nodebuffer" });
}

export function getBodyInner(documentXml: string): { before: string; bodyInner: string; after: string } {
  const start = documentXml.indexOf("<w:body>");
  const end = documentXml.indexOf("</w:body>");
  if (start === -1 || end === -1) {
    throw new DocxReadError("not_a_docx", "That document has no <w:body> — it isn't a readable Word file.");
  }
  const bodyStart = start + "<w:body>".length;
  return {
    before: documentXml.slice(0, bodyStart),
    bodyInner: documentXml.slice(bodyStart, end),
    after: documentXml.slice(end),
  };
}

export function withBodyInner(documentXml: string, newBodyInner: string): string {
  const { before, after } = getBodyInner(documentXml);
  return before + newBodyInner + after;
}
