import { NextResponse } from "next/server";
import { failure } from "@/lib/api";
import { readToday } from "@/lib/db";
import { isDay } from "@/lib/days";
import { Invalid } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** One local day in one read: `?day=YYYY-MM-DD`, the browser's own. */
export async function GET(request: Request) {
  const day = new URL(request.url).searchParams.get("day");
  if (!isDay(day)) return failure(new Invalid("day must be YYYY-MM-DD"));
  try {
    return NextResponse.json(await readToday(day), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
