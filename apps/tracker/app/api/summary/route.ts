import { NextResponse } from "next/server";
import { loadDashboard } from "@/lib/dashboard";
import { toSummary } from "@/lib/summary";

export const dynamic = "force-dynamic";

/**
 * The roll-up the hub renders on its landing page.
 *
 * Deliberately narrow: counts and singles, never rows. The hub is a glance, and
 * handing it thread arrays is how a hub slowly turns into a worse copy of the
 * tool it links to. The tracker's own dashboard calls `loadDashboard` directly
 * for the full lists.
 *
 * Called server-to-server by the hub with INTERNAL_API_SECRET, the same way the
 * tracker already calls the Message Editor's /api/draft — the hub renders this
 * on the server so the glance is there on arrival, and there is no browser
 * session on that request to carry.
 */
export async function GET() {
  try {
    const now = new Date();
    const summary = toSummary(await loadDashboard(now), now);
    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ code: "summary_failed", error: message }, { status: 500 });
  }
}
