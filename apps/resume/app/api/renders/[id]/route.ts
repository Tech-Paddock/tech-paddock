import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, getTrackerClient } from "@/lib/supabase";

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
      const { error } = await tracker
        .from("pipeline_threads")
        .update({
          company: body.company.trim(),
          last_touch_date: touch,
          ...(notes ? { notes } : {}),
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
          notes: notes || null,
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

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ code, error }, { status });
}
