import { NextRequest, NextResponse } from "next/server";
import { connectionStatus } from "@/lib/krogerConnection";
import { deleteConnectionRow, writeModality } from "@/lib/krogerStore";
import { isModality } from "@/lib/modality";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/**
 * The King Soopers connection as the list tab sees it (TEC-90): whether this
 * deployment is set up (and if not, which variable is missing, in words),
 * whether it is connected, which store, and when it last refreshed.
 * **Never a token** — `tests/kroger.test.ts` reads this body for one.
 */
export async function GET() {
  try {
    return NextResponse.json(await connectionStatus());
  } catch (e) {
    return errorResponse(e, "Couldn't read the King Soopers connection.");
  }
}

/** Pickup or Delivery (TEC-121), remembered on the connection between visits. */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!isModality(body.modality)) return NextResponse.json({ error: "Pickup or delivery?" }, { status: 400 });
  try {
    await writeModality(body.modality);
    return NextResponse.json({ modality: body.modality });
  } catch (e) {
    return errorResponse(e, "Couldn't save pickup or delivery.");
  }
}

/** Disconnect: the sealed token and the store go. Kroger's side is revoked at Kroger. */
export async function DELETE() {
  try {
    await deleteConnectionRow();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't disconnect King Soopers.");
  }
}
