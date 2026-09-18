import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, getTrackerClient } from "@/lib/supabase";
import { StorageError, removeDocx } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Body = {
  company?: string;
  role?: string;
  jobUrl?: string;
  contactId?: string | null;
  submittedAt?: string | null;
  threadId?: string | null;
};

/**
 * Record where a render went.
 *
 * The document artifacts never change — parsed content, coverage and the file
 * are written once. Only the application metadata is editable, because a resume
 * is usually rendered days before it is actually sent.
 *
 * Naming a company creates or updates the tracker thread, which is the canonical
 * record of the application; this route only stores the link to it.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const supabase = getServiceClient();

  const { data: render, error: loadError } = await supabase
    .from("renders")
    .select("id, thread_id")
    .eq("id", params.id)
    .maybeSingle();
  if (loadError) return fail(500, "db_error", loadError.message);
  if (!render) return fail(404, "not_found", "No render with that id.");

  let threadId: string | null = body.threadId ?? (render.thread_id as string | null);

  if (body.company?.trim()) {
    const tracker = getTrackerClient();
    const notes = [body.role && `Role: ${body.role}`, body.jobUrl && `Posting: ${body.jobUrl}`]
      .filter(Boolean)
      .join("\n");
    const touch = (body.submittedAt ?? new Date().toISOString()).slice(0, 10);

    if (threadId) {
      const { data: existing, error: readError } = await tracker
        .from("pipeline_threads")
        .select("notes")
        .eq("id", threadId)
        .maybeSingle();
      if (readError) return fail(502, "tracker_error", `Couldn't read the tracker thread: ${readError.message}`);

      // notes is a running log, so append rather than overwrite.
      const entry = [`${touch} — resume sent`, notes].filter(Boolean).join("\n");
      const merged = [existing?.notes, entry].filter(Boolean).join("\n\n");

      const { error } = await tracker
        .from("pipeline_threads")
        .update({
          company: body.company.trim(),
          last_touch_date: touch,
          notes: merged,
          // Touching a thread clears its open Google Task, so the stale check can
          // raise a fresh one next time it goes cold. The tracker's own edit path
          // does the same.
          open_task_id: null,
          ...(body.contactId !== undefined ? { contact_id: body.contactId } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", threadId);
      if (error) return fail(502, "tracker_error", `Couldn't update the tracker thread: ${error.message}`);
    } else {
      const { data, error } = await tracker
        .from("pipeline_threads")
        .insert({
          company: body.company.trim(),
          stage: "Applied",
          last_touch_date: touch,
          next_action: "Follow up",
          notes: [`${touch} — resume sent`, notes].filter(Boolean).join("\n"),
          contact_id: body.contactId ?? null,
        })
        .select("id")
        .single();
      if (error) return fail(502, "tracker_error", `Couldn't create the tracker thread: ${error.message}`);
      threadId = data.id as string;
    }
  }

  const { data, error } = await supabase
    .from("renders")
    .update({
      thread_id: threadId,
      ...(body.submittedAt !== undefined ? { submitted_at: body.submittedAt } : {}),
    })
    .eq("id", params.id)
    .select("id, submitted_at, thread_id")
    .single();

  if (error) return fail(500, "db_error", error.message);
  return NextResponse.json({ render: data });
}

/**
 * Delete a render, and the two files it points at.
 *
 * **Archiving is the normal way one leaves the list; this is for the test runs.**
 * Joel asked for it on 2026-09-17 with fifteen of them on screen — and asked for
 * exactly this much: one at a time, no cascade, no bulk tool. *"i don't mind
 * clicking though it no need to build in complexity for a 1 off."*
 *
 * The tracker thread is deliberately **not** touched. It is the record of an
 * application, owned by the Pipeline Tracker and reachable from it; deleting a
 * render here would silently delete somebody else's row. The thread simply stops
 * having a resume attached.
 *
 * Row first, then the objects — the same order the template route uses, and for
 * the same reason. The reverse leaves a row pointing at bytes that are gone,
 * which breaks the download; this way a failure only strands an object nothing
 * references.
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServiceClient();

  const { data: target, error: findError } = await supabase
    .from("renders")
    .select("id, source_file_path, output_file_path")
    .eq("id", params.id)
    .maybeSingle();
  if (findError) return fail(500, "db_error", findError.message);
  if (!target) return fail(404, "not_found", "No render with that id.");

  const { error } = await supabase.from("renders").delete().eq("id", params.id);
  if (error) return fail(500, "db_error", error.message);

  for (const path of [target.source_file_path, target.output_file_path]) {
    if (typeof path !== "string" || !path) continue;
    try {
      await removeDocx(path);
    } catch (err) {
      if (!(err instanceof StorageError)) throw err;
      // The render is gone as far as the app is concerned. Saying so beats
      // reporting a failure the user cannot act on and would retry pointlessly.
      console.error("render row deleted but its file remains", path, err);
    }
  }

  return NextResponse.json({ deleted: params.id });
}

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ code, error }, { status });
}
