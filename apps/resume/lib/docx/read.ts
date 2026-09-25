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

/**
 * How many bytes the archive actually inflates to, counted by inflating it —
 * stopping as soon as the count passes `limit`, so a bomb is never held whole.
 *
 * **The count this replaced trusted the archive.** It summed the uncompressed
 * size each entry *declares*, which is a number in the file and costs an
 * attacker nothing to understate; the real inflation then ran to completion
 * before anything compared the two. Counting the bytes as they come out of the
 * decompressor is the only figure the uploader does not choose.
 */
type StreamHelper = {
  on(event: "data", cb: (chunk: Uint8Array) => void): StreamHelper;
  on(event: "error", cb: (err: Error) => void): StreamHelper;
  on(event: "end", cb: () => void): StreamHelper;
  pause(): StreamHelper;
  resume(): StreamHelper;
};

export async function inflatedBytes(zip: JSZip, limit: number): Promise<number> {
  let total = 0;
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    await new Promise<void>((resolve, reject) => {
      // Documented in JSZip's API (`JSZipObject#internalStream`) and missing from
      // its type definitions; it streams the decompressor's output and pauses.
      const stream = (entry as unknown as { internalStream(type: "uint8array"): StreamHelper }).internalStream(
        "uint8array"
      );
      stream
        .on("data", (chunk: Uint8Array) => {
          total += chunk.length;
          if (total > limit) {
            stream.pause();
            resolve();
          }
        })
        .on("error", reject)
        .on("end", () => resolve())
        .resume();
    });
    if (total > limit) break;
  }
  return total;
}

/**
 * Refuse an archive that inflates past `limit`. Both readers call this before
 * reading a part: the untrusted upload goes through `loadDocx` in the reskin
 * engine first, and guarding only this file's reader left the upload itself
 * unguarded while the renderer's own output was checked.
 */
export async function assertInflatesWithin(zip: JSZip, limit = MAX_INFLATED_BYTES): Promise<void> {
  let inflated: number;
  try {
    inflated = await inflatedBytes(zip, limit);
  } catch {
    throw new DocxReadError("not_a_docx", "That file isn't a readable .docx — part of the archive is corrupt.");
  }
  if (inflated > limit) {
    throw new DocxReadError(
      "inflated_too_large",
      `That archive expands to more than ${(limit / 1024 / 1024).toFixed(0)}MB, far larger than any resume. Refusing to read it.`
    );
  }
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

  await assertInflatesWithin(zip, maxInflatedBytes);

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
