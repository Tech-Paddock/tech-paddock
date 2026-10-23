import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/respond";
import { exportBatch } from "@/lib/brandBatch";
import { readProducts } from "@/lib/productStore";
import { readPreferences } from "@/lib/preferences";

export const dynamic = "force-dynamic";

/**
 * Your brands as a file (TEC-131): the Paste a batch format, so the file
 * pastes straight back in. Behind the password gate like every route; never
 * cached.
 */
export async function GET() {
  try {
    const [products, words] = await Promise.all([readProducts(), readPreferences()]);
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(`${JSON.stringify(exportBatch(products, words), null, 2)}\n`, {
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
