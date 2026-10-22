import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/respond";
import { exportBatch } from "@/lib/brandBatch";
import { readPreferences } from "@/lib/preferences";

export const dynamic = "force-dynamic";

/**
 * Your brands as a file (TEC-51): the Paste a batch format, so the file pastes
 * straight back in. **The table was the only copy of these rows**; this is the
 * second. Behind the password gate like every route; never cached.
 */
export async function GET() {
  try {
    const rows = exportBatch(await readPreferences());
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(`${JSON.stringify(rows, null, 2)}\n`, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="cookbook-brands-${day}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e, "Couldn't export your brands.");
  }
}
