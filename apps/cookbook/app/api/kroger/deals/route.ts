import { NextRequest, NextResponse } from "next/server";
import { readLatestScan } from "@/lib/dealStore";
import { runDealScan } from "@/lib/dealRun";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * The deal scan (TEC-121), run from the list tab. **No model call, and no coupons
 * read** — Kroger's public API has none; coupons are staged separately
 * (`lib/couponStore.ts`). The nightly scan is a different route
 * (`/api/cron/prices`).
 *
 * GET is the latest scan, or `null` for never: the list tab decides from its
 * `ran_at` whether opening it should start another. POST runs one and
 * **appends** it. **No token in either body**; `tests/kroger.test.ts` checks.
 */
export async function GET() {
  try {
    return NextResponse.json({ latest: await readLatestScan() });
  } catch (e) {
    return errorResponse(e, "Couldn't read the last deal scan.");
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const trigger = body.trigger === "opened" ? "opened" : "manual";
  try {
    return NextResponse.json(await runDealScan(trigger));
  } catch (e) {
    return errorResponse(e, "The deal scan failed, and nothing was saved.");
  }
}
