import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { runPriceNight } from "@/lib/priceRun";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";
// A few hundred products is a handful of Kroger requests; this is headroom.
export const maxDuration = 60;

/**
 * The nightly price scan (TEC-132). **Vercel Cron calls this with GET**, at
 * 09:00 UTC (03:00 Denver in daylight time, 02:00 in standard), sending
 * `Authorization: Bearer <CRON_SECRET>` itself once the variable is set.
 *
 * **The gate lets exactly this path through without a session, and only with
 * that header** (`proxy.ts`); this route checks the secret again itself, so the
 * gate is never the only lock. No model call, no account token. The body is
 * counts: no token, no secret.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runPriceNight());
  } catch (e) {
    return errorResponse(e, "The nightly price scan failed.");
  }
}
