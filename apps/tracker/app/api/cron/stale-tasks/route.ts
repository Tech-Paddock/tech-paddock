import { NextRequest, NextResponse } from "next/server";
import { loadDashboard } from "@/lib/dashboard";
import { createFollowUpTask } from "@/lib/followUpTask";
import { graphConfigured } from "@/lib/graph";

export const dynamic = "force-dynamic";

/**
 * The daily sweep: anything past its decay threshold with no open task gets one.
 *
 * It reuses the dashboard's decay list rather than re-querying on
 * `last_touch_date`, so a thread the dashboard considers alive never gets
 * chased by a task — the two cannot disagree about what is stale, and a thread
 * with a meeting already booked is left alone.
 *
 * `open_task_id` clears whenever a thread is edited, so a thread that goes
 * quiet again after being worked gets a fresh task next time round.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!graphConfigured()) {
    return NextResponse.json({ skipped: "Outlook is not connected", created: 0 });
  }

  const data = await loadDashboard();
  const candidates = data.decay.filter((d) => !d.thread.open_task_id);

  const created: string[] = [];
  const failed: { company: string; error: string }[] = [];

  // Sequential on purpose: Graph rate-limits, and this runs once a day over a
  // handful of threads, so there is nothing to gain from flooding it.
  for (const { thread } of candidates) {
    const result = await createFollowUpTask(thread.id);
    if (result.ok) created.push(result.title);
    else if (result.code !== "already_open") failed.push({ company: thread.company, error: result.error });
  }

  return NextResponse.json({
    considered: candidates.length,
    created: created.length,
    titles: created,
    ...(failed.length ? { failed } : {}),
    ...(data.degraded.length ? { degraded: data.degraded } : {}),
  });
}
