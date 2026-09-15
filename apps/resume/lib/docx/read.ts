import JSZip from "jszip";

export type DocxParts = {
  document: string;
  styles: string | null;
  numbering: string | null;
  /** Header/footer part names. */
  headerFooterParts: string[];
  /** Header/footer XML, keyed by part name. Two things need the content rather
   *  than the name: the ATS audit, which must report a header that actually
   *  carries text and stay quiet about the empty part Word leaves behind, and
   *  spec extraction, which finds the name and contact sizes here when a
   *  template keeps that block in its header. */
  headerFooterXml: Record<string, string>;
  partNames: string[];
};

/**
 * A .docx is a few hundred KB expanded - the checked-in fixtures total 900KB,
 * at roughly 40x compression. This ceiling leaves generous headroom while
 * refusing an archive that is small on disk and enormous once inflated, which
 * would otherwise be read into memory before anything could object.
 */
export const MAX_INFLATED_BYTES = 64 * 1024 * 1024;

export function inflatedSize(zip: JSZip): number | null {
  let total = 0;
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    // Directory entries carry no size. Counting them as "unknown" made this
    // return null for every real archive, which silently disabled the check.
    if (entry.dir) continue;
    // Not public API, so treat a genuinely missing size as unknown rather than
    // as zero — better to skip the check than to under-count and allow a bomb.
    const size = (entry as { _data?: { uncompressedSize?: number } })?._data?.uncompressedSize;
    if (typeof size !== "number") return null;
    total += size;
  }
  return total;
}

export async function readDocxParts(
  data: ArrayBuffer | Uint8Array | Buffer,
  maxInflatedBytes = MAX_INFLATED_BYTES
): Promise<DocxParts> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new DocxReadError("not_a_docx", "That file isn't a readable .docx — a PDF or Word 97 .doc renamed to .docx will land here too.");
  }

  const inflated = inflatedSize(zip);
  if (inflated !== null && inflated > maxInflatedBytes) {
    throw new DocxReadError(
      "inflated_too_large",
      `That archive expands to ${(inflated / 1024 / 1024).toFixed(0)}MB, far larger than any resume. Refusing to read it.`
    );
  }

  const document = await zip.file("word/document.xml")?.async("string");
  if (!document) {
    throw new DocxReadError("no_document_part", "The .docx has no word/document.xml, so there's nothing to read.");
  }

  const partNames = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const headerFooterParts = partNames.filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n));
  const headerFooterXml: Record<string, string> = {};
  for (const name of headerFooterParts) {
    headerFooterXml[name] = (await zip.file(name)?.async("string")) ?? "";
  }

  return {
    document,
    styles: (await zip.file("word/styles.xml")?.async("string")) ?? null,
    numbering: (await zip.file("word/numbering.xml")?.async("string")) ?? null,
    headerFooterParts,
    headerFooterXml,
    partNames,
  };
}

export class DocxReadError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "DocxReadError";
  }
}
