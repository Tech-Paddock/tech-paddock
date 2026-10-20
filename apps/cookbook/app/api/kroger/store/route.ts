import { NextRequest, NextResponse } from "next/server";
import { isLocationId, isZip, searchStores } from "@/lib/kroger";
import { withAccessToken } from "@/lib/krogerConnection";
import { writeStore } from "@/lib/krogerStore";
import { errorResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

/** King Soopers stores near a ZIP, through Kroger's Locations API. */
export async function GET(request: NextRequest) {
  const zip = request.nextUrl.searchParams.get("zip")?.trim() ?? "";
  if (!isZip(zip)) return NextResponse.json({ error: "A five-digit ZIP, please." }, { status: 400 });
  try {
    const stores = await withAccessToken((accessToken) => searchStores(accessToken, zip));
    return NextResponse.json({ stores });
  } catch (e) {
    return errorResponse(e, "Couldn't find stores.");
  }
}

/** Pick one, once. Saved on the connection; a reconnect keeps it. */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!isLocationId(body.locationId)) return NextResponse.json({ error: "Which store?" }, { status: 400 });
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : body.locationId;
  try {
    await writeStore(body.locationId, name);
    return NextResponse.json({ store: { locationId: body.locationId, name } });
  } catch (e) {
    return errorResponse(e, "Couldn't save the store.");
  }
}
