import { NextResponse } from "next/server";
import { getServiceClient, getTrackerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Render history, newest first, with the job each one went to. */
export async function GET() {
  const { data, error } = await getServiceClient()
    .from("renders")
    .select("id, created_at, submitted_at, thread_id, coverage, content_hash, template_id, output_file_path")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ code: "db_error", error: error.message }, { status: 500 });

  const renders = data ?? [];
  const threadIds = [...new Set(renders.map((r) => r.thread_id).filter((id): id is string => !!id))];

  // The job lives on the tracker thread and is never duplicated here, so a
  // render is only self-describing once joined back to it.
  let threads: Record<string, { company: string; stage: string }> = {};
  if (threadIds.length > 0) {
    const { data: rows, error: threadError } = await getTrackerClient()
      .from("pipeline_threads")
      .select("id, company, stage")
      .in("id", threadIds);
    // Swallowing this would render every row as "No job recorded", which looks
    // like missing data rather than a broken cross-schema read.
    if (threadError) {
      return NextResponse.json(
        { code: "tracker_error", error: `Couldn't read tracker threads: ${threadError.message}` },
        { status: 502 }
      );
    }
    threads = Object.fromEntries((rows ?? []).map((t) => [t.id as string, { company: t.company, stage: t.stage }]));
  }

  return NextResponse.json({
    renders: renders.map((r) => ({ ...r, thread: r.thread_id ? threads[r.thread_id] ?? null : null })),
  });
}
