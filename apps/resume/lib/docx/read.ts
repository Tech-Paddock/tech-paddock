import JSZip from "jszip";

export type DocxParts = {
  document: string;
  styles: string | null;
  numbering: string | null;
  /** Header/footer part names. Their presence is itself an ATS finding. */
  headerFooterParts: string[];
  partNames: string[];
};

/**
 * A .docx is a zip of XML parts. `docx` (npm) only writes, so reading one back
 * means unzipping it ourselves — both for the template's formatting and for the
 * Jobright upload's content.
 */
export async function readDocxParts(data: ArrayBuffer | Uint8Array | Buffer): Promise<DocxParts> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new DocxReadError("not_a_docx", "That file isn't a readable .docx — a PDF or Word 97 .doc renamed to .docx will land here too.");
  }

  const document = await zip.file("word/document.xml")?.async("string");
  if (!document) {
    throw new DocxReadError("no_document_part", "The .docx has no word/document.xml, so there's nothing to read.");
  }

  const partNames = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  return {
    document,
    styles: (await zip.file("word/styles.xml")?.async("string")) ?? null,
    numbering: (await zip.file("word/numbering.xml")?.async("string")) ?? null,
    headerFooterParts: partNames.filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n)),
    partNames,
  };
}

export class DocxReadError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "DocxReadError";
  }
}
