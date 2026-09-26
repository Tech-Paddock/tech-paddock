/**
 * The one list behind the Resume tab.
 *
 * **The view is merged; the tables are not.** Joel settled that on 2026-09-17 —
 * *"Merge the view"* — and the distinction is the whole design. `templates` are
 * files: one row, one document, a version and a house style. `renders` are
 * *events*: one row holding two documents, a coverage figure, a content hash and
 * a link to the job it went to. Folding those into one table would have to throw
 * away whichever half did not fit.
 *
 * So `/api/resumes` projects both into this shape instead. Three kinds, because
 * three is what you actually look for — the house style, what you fed in, what
 * came out — and a render contributes two rows because it really is two files.
 * Both of a render's rows carry the same `id`, which is the render's: deleting
 * either deletes the event and both its files, and the confirmation says so.
 */

export type ResumeKind = "template" | "input" | "output";

export type ResumeFile = {
  /** Unique per row. A render's two rows share `id`, so `id` cannot be the key. */
  key: string;
  kind: ResumeKind;
  /** The record this file belongs to: a template id, or a render id for both of a render's files. */
  id: string;
  name: string;
  createdAt: string;
  downloadHref: string;

  /** Templates only; null or false on the other two kinds. */
  version: number | null;
  active: boolean;
  archived: boolean;

  /** Renders only; null on templates. */
  company: string | null;
  stage: string | null;
  coverage: number | null;
  submittedAt: string | null;
};

export const KIND_LABEL: Record<ResumeKind, string> = {
  template: "Template",
  input: "Input",
  output: "Output",
};

/**
 * What to call a stored file.
 *
 * Storage keys are `<prefix>/<epoch-ms>-<slug>` (see `lib/storage.ts`), and the
 * epoch is there to keep two uploads of the same filename apart, not to be read.
 * Ten digits is the floor deliberately: a slug that happens to start with a year
 * and a dash — `2026-analyst.docx` — keeps its prefix.
 */
export function fileLabel(path: string | null | undefined, fallback: string): string {
  const base = path?.split("/").pop();
  if (!base) return fallback;
  return base.replace(/^\d{10,}-/, "") || fallback;
}

/** Newest first; within one moment, the template, then what came out, then what went in. */
const KIND_ORDER: Record<ResumeKind, number> = { template: 0, output: 1, input: 2 };

export function sortResumeFiles(files: ResumeFile[]): ResumeFile[] {
  return [...files].sort((a, b) => {
    const byTime = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (byTime !== 0) return byTime;
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  });
}
