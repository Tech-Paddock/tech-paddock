import { NextResponse } from "next/server";
import { StorageError, downloadDocx } from "./storage";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Hand back exactly the bytes that were stored, as a download.
 *
 * Three routes serve a stored `.docx` — a template, a render's output, a
 * render's input — and the difference between them is one column name. Keeping
 * the headers, the storage failure mapping and the filename rule in one place
 * is what stops the third one being written slightly differently from the first
 * two. The quote stripping is the example: it guarded the template route alone
 * until this file existed, and a `"` in the filename ends the header value
 * early wherever it appears.
 *
 * `preferredName` is for the template route, which knows the name the file was
 * uploaded under. Without one the storage key's last segment is used, which
 * carries the timestamp prefix — accurate, and the best available.
 *
 * Never a fresh render of the same inputs: the point of keeping the file is
 * answering what was actually sent.
 */
export async function serveDocx(path: string, preferredName?: string | null) {
  try {
    const bytes = await downloadDocx(path);
    const name = preferredName ?? path.split("/").pop() ?? "resume.docx";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": DOCX_TYPE,
        "Content-Disposition": contentDisposition(name),
      },
    });
  } catch (err) {
    if (err instanceof StorageError) {
      return NextResponse.json({ code: "storage_error", error: err.message }, { status: 502 });
    }
    throw err;
  }
}

/**
 * An attachment header that survives any filename a person can type.
 *
 * **A header value is a ByteString**: the Headers API throws on any character
 * above U+00FF, so an en dash or a curly apostrophe in an uploaded name — both
 * of which Word and macOS insert on their own — turned the template download
 * into a 500. RFC 6266 carries the real name percent-encoded in `filename*`,
 * which every current browser prefers, and a plain-ASCII `filename` beside it
 * for anything that does not read the starred form.
 *
 * The fallback also drops `"` and `\`, which would end or escape the quoted
 * value early, and control characters, which have no business in a header.
 */
export function contentDisposition(name: string): string {
  const fallback =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "")
      .trim() || "resume.docx";
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
