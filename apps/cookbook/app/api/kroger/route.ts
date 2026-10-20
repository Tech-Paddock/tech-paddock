import { NextResponse } from "next/server";
import { connectionStatus } from "@/lib/krogerConnection";
import { deleteConnectionRow } from "@/lib/krogerStore";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * The King Soopers connection as the list tab sees it (TEC-90): whether this
 * deployment is set up (and if not, which variable is missing, in words),
 * whether Joel is connected, which store, and when it last refreshed.
 * **Never a token** — `tests/kroger.test.ts` reads this body for one.
 */
export async function GET() {
  try {
    return NextResponse.json(await connectionStatus());
  } catch (e) {
    return errorResponse(e, "Couldn't read the King Soopers connection.");
  }
}

/** Disconnect: the sealed token and the store go. Kroger's side is Joel's to revoke there if he wants. */
export async function DELETE() {
  try {
    await deleteConnectionRow();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't disconnect King Soopers.");
  }
}
