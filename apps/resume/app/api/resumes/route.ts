import { NextResponse } from "next/server";
import { getServiceClient, getTrackerClient } from "@/lib/supabase";
import { fileLabel, sortResumeFiles, type ResumeFile, type TemplateSpec } from "@/lib/resumes";

export const dynamic = "force-dynamic";

const THREAD_BATCH = 100;

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
      .select("id, version, name, spec, is_active, archived_at, created_at")
      .order("version", { ascending: false }),
    supabase
      .from("renders")
      .select("id, created_at, submitted_at, thread_id, coverage, source_file_path, output_file_path")
      // No limit. This list is the Resume tab, and it capped renders at fifty
      // with nothing on screen saying so — the fifty-first simply was not there.
      .order("created_at", { ascending: false }),
  ]);

  if (templates.error) return fail(500, "db_error", templates.error.message);
  if (renders.error) return fail(500, "db_error", renders.error.message);

  const renderRows = renders.data ?? [];
  const threadIds = [...new Set(renderRows.map((r) => r.thread_id).filter((id): id is string => !!id))];

  // The job lives on the tracker thread and is never duplicated here, so a
  // render only says where it went once joined back to it. A failure is
  // reported rather than swallowed: every row silently reading "no job" looks
  // like missing data, not like a broken cross-schema read.
  //
  // In batches, because the ids travel in the request URL: with no cap on the
  // list, one `in` over every thread would eventually outgrow it.
  const threads: Record<string, { company: string; stage: string }> = {};
  for (let i = 0; i < threadIds.length; i += THREAD_BATCH) {
    const { data, error } = await getTrackerClient()
      .from("pipeline_threads")
      .select("id, company, stage")
      .in("id", threadIds.slice(i, i + THREAD_BATCH));
    if (error) return fail(502, "tracker_error", `Couldn't read tracker threads: ${error.message}`);
    for (const t of data ?? []) threads[t.id as string] = { company: t.company, stage: t.stage };
  }

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
      spec: (t.spec as TemplateSpec | null) ?? null,
      company: null,
      stage: null,
      coverage: null,
      submittedAt: null,
    });
  }

  for (const r of renderRows) {
    const thread = r.thread_id ? threads[r.thread_id as string] ?? null : null;
    const shared = {
      id: r.id as string,
      createdAt: r.created_at as string,
      version: null,
      active: false,
      archived: false,
      spec: null,
      company: thread?.company ?? null,
      stage: thread?.stage ?? null,
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
