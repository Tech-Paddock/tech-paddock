import { NextResponse } from "next/server";
import { failure } from "@/lib/api";
import { readMore } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Goals, lists and every routine: the quiet second page. */
export async function GET() {
  try {
    return NextResponse.json(await readMore(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
