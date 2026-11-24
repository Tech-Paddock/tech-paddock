import { NextResponse } from "next/server";
import { failure } from "@/lib/api";
import { fetchCalendarWeek } from "@/lib/calendar-client";
import { isDay } from "@/lib/days";
import { readWeek } from "@/lib/db";
import { Invalid } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One week in one read: `?start=YYYY-MM-DD`, the browser's own Sunday.
 *
 * The chores and the calendar are read side by side and answered side by side.
 * A calendar that failed comes back as `events: {ok: false, error}`, never as an
 * empty list, and never fails the chores; a database that failed is a 500 and
 * the browser keeps what it last had, marked stale.
 */
export async function GET(request: Request) {
  const start = new URL(request.url).searchParams.get("start");
  if (!isDay(start)) return failure(new Invalid("start must be YYYY-MM-DD"), "load");
  try {
    const [week, events] = await Promise.all([readWeek(start), fetchCalendarWeek(request, start)]);
    return NextResponse.json({ start, ...week, events }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e, "load");
  }
}
