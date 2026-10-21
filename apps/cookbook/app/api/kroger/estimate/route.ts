import { NextResponse } from "next/server";
import { runEstimate } from "@/lib/dealRun";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * Calculate estimated total (TEC-121): every open line × its quantity at the
 * chosen store, promo first, for the chosen Pickup/Delivery mode. **Unpriced
 * lines are counted and named, never $0**, and the figure is an estimate.
 * A POST because it renews the Kroger sign-in. Nothing is stored. No model.
 */
export async function POST() {
  try {
    return NextResponse.json(await runEstimate());
  } catch (e) {
    return errorResponse(e, "Couldn't calculate the estimate.");
  }
}
