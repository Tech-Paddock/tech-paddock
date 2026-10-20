import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { fileLabel, sortResumeFiles, type ResumeFile } from "@/lib/resumes";

export const dynamic = "force-dynamic";

/**
 * Every resume file this app holds, as one typed list.
 *
 * This is the read side of the Resume tab, and the only list the UI loads.
 * `/api/templates` and `/api/renders` still exist — they are the collection
 * endpoints their writes belong to — but nothing on screen is assembled from
 * two of them any more. A screen stitched from several lists is a screen that
 * can be half-refreshed, and that is exactly how the old one came to show nine
 * files while the database held one.
 *
 * Archived templates are included rather than hidden behind a second request.
 * The tab filters them client-side, so switching the filter cannot go stale.
 */
export async function GET() {
  const supabase = getServiceClient();

  const [templates, renders] = await Promise.all([
    supabase
      .from("templates")
      .select("id, version, name, is_active, archived_at, created_at")
      .order("version", { ascending: false }),
    supabase
      .from("renders")
      .select("id, created_at, submitted_at, coverage, source_file_path, output_file_path")
      // No limit. This list is the Resume tab, and it capped renders at fifty
      // with nothing on screen saying so — the fifty-first simply was not there.
      .order("created_at", { ascending: false }),
  ]);

  if (templates.error) return fail(500, "db_error", templates.error.message);
  if (renders.error) return fail(500, "db_error", renders.error.message);

  const renderRows = renders.data ?? [];
  const files: ResumeFile[] = [];

  for (const t of templates.data ?? []) {
    files.push({
      key: `template:${t.id}`,
      kind: "template",
      id: t.id as string,
      name: t.name as string,
      createdAt: t.created_at as string,
      downloadHref: `/api/templates/${t.id}/file`,
      version: t.version as number,
      active: t.is_active === true,
      archived: t.archived_at !== null,
      coverage: null,
      submittedAt: null,
    });
  }

  for (const r of renderRows) {
    const shared = {
      id: r.id as string,
      createdAt: r.created_at as string,
      version: null,
      active: false,
      archived: false,
      coverage: (r.coverage as { percent?: number } | null)?.percent ?? null,
      submittedAt: (r.submitted_at as string | null) ?? null,
    };

    // A render written before storage existed has neither path, and contributes
    // no rows at all — a row whose only action is a download that 404s is worse
    // than an absence.
    if (r.output_file_path) {
      files.push({
        ...shared,
        key: `output:${r.id}`,
        kind: "output",
        name: fileLabel(r.output_file_path as string, "resume.docx"),
        downloadHref: `/api/renders/${r.id}/file`,
      });
    }
    if (r.source_file_path) {
      files.push({
        ...shared,
        key: `input:${r.id}`,
        kind: "input",
        name: fileLabel(r.source_file_path as string, "source.docx"),
        downloadHref: `/api/renders/${r.id}/source`,
      });
    }
  }

  return NextResponse.json({ files: sortResumeFiles(files) });
}

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ code, error }, { status });
}
