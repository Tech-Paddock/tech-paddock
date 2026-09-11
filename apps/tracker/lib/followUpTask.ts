import { createTask, graphConfigured } from "@/lib/graph";
import { getServiceClient, getSharedClient } from "@/lib/supabase";
import type { ThreadRow } from "@/lib/signals";

/**
 * Turning a stale thread into a To Do task.
 *
 * Shared by the manual button and the daily sweep so both produce the same
 * task. `open_task_id` is written straight through the service client rather
 * than the PATCH route, because PATCH deliberately clears `open_task_id` on
 * every edit — touching a thread should let a fresh task fire next time it goes
 * quiet, which is exactly the opposite of what we want here.
 */

export type TaskResult =
  | { ok: true; taskId: string; title: string }
  | { ok: false; code: "not_configured" | "already_open" | "not_found" | "failed"; error: string };

function buildTitle(company: string, contactName: string | null): string {
  return contactName ? `Follow up — ${contactName} (${company})` : `Follow up — ${company}`;
}

function buildNotes(thread: Pick<ThreadRow, "notes" | "next_action">): string | null {
  const parts = [
    thread.next_action?.trim() && `Next action: ${thread.next_action.trim()}`,
    thread.notes?.trim(),
  ].filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}

export async function createFollowUpTask(
  threadId: string,
  options: { force?: boolean } = {}
): Promise<TaskResult> {
  if (!graphConfigured()) {
    return {
      ok: false,
      code: "not_configured",
      error: "Outlook is not connected, so there is nowhere to file a task.",
    };
  }

  const supabase = getServiceClient();
  const { data: thread, error } = await supabase
    .from("pipeline_threads")
    .select("id, company, contact_id, notes, next_action, open_task_id")
    .eq("id", threadId)
    .maybeSingle();

  if (error) return { ok: false, code: "failed", error: error.message };
  if (!thread) return { ok: false, code: "not_found", error: "No thread with that id." };

  // The sweep must not re-file the same thread every morning; the manual
  // button is allowed to override, since asking for it is deliberate.
  if (thread.open_task_id && !options.force) {
    return { ok: false, code: "already_open", error: "This thread already has an open task." };
  }

  let contactName: string | null = null;
  if (thread.contact_id) {
    const { data: contact } = await getSharedClient()
      .from("contacts")
      .select("name")
      .eq("id", thread.contact_id)
      .maybeSingle();
    contactName = (contact?.name as string) ?? null;
  }

  const title = buildTitle(thread.company as string, contactName);

  try {
    const task = await createTask({
      title,
      notes: buildNotes(thread as Pick<ThreadRow, "notes" | "next_action">),
      dueDate: new Date(),
    });

    // The task exists before the row points at it, so a failed write leaves a
    // stray task rather than a thread claiming a task that was never created.
    const { error: writeError } = await supabase
      .from("pipeline_threads")
      .update({ open_task_id: task.id })
      .eq("id", threadId);

    if (writeError) {
      return {
        ok: false,
        code: "failed",
        error: `Task created in To Do, but recording it failed: ${writeError.message}`,
      };
    }

    return { ok: true, taskId: task.id, title };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, code: "failed", error: message };
  }
}
