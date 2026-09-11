import { NextResponse } from "next/server";
import { createFollowUpTask } from "@/lib/followUpTask";

export const dynamic = "force-dynamic";

/** The manual "create a task" button, available on any thread at any time. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  // Asking for a task explicitly overrides the open-task guard; that guard
  // exists to stop the daily sweep repeating itself, not to stop you.
  const result = await createFollowUpTask(params.id, { force: true });

  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : result.code === "not_configured" ? 503 : 502;
    return NextResponse.json({ code: result.code, error: result.error }, { status });
  }

  return NextResponse.json({ taskId: result.taskId, title: result.title }, { status: 201 });
}
