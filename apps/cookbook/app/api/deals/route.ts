import { NextResponse } from "next/server";
import { readDealBoard } from "@/lib/dealBoard";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * The Deals tab's board (TEC-132): every saved product with a recent price,
 * coloured against its own last twelve weeks. **Read only, no Kroger call, no
 * model call, no token**: it reads what the nightly scan and the list tab's
 * deal scan recorded. Behind the gate like every route; the nightly scan is
 * `/api/cron/prices`.
 */
export async function GET() {
  try {
    return NextResponse.json(await readDealBoard());
  } catch (e) {
    return errorResponse(e, "Couldn't read the deals.");
  }
}
