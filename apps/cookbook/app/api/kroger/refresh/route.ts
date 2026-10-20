import { NextResponse } from "next/server";
import { runRefresh } from "@/lib/refreshRun";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * Refresh: renew the King Soopers sign-in and check every remembered product's
 * price and stock at the chosen store (Joel, 2026-10-20). **No model call, and
 * no cron** — the list tab calls this in the background when the last refresh
 * is over a week old, and *Refresh now* calls it on demand.
 *
 * The body says what was updated, flagged or failed, in words. **A refresh that
 * failed outright is an error status with a sentence**, never a 200 that reads
 * as "nothing changed".
 */
export async function POST() {
  try {
    return NextResponse.json(await runRefresh());
  } catch (e) {
    return errorResponse(e, "The refresh failed, and nothing was checked.");
  }
}
