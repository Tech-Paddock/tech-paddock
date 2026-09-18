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
    const name = (preferredName ?? path.split("/").pop() ?? "resume.docx").replace(/"/g, "");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": DOCX_TYPE,
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (err) {
    if (err instanceof StorageError) {
      return NextResponse.json({ code: "storage_error", error: err.message }, { status: 502 });
    }
    throw err;
  }
}
