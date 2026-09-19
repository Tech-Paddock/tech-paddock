import { NextRequest, NextResponse } from "next/server";
import { readDay } from "@/lib/log";
import { LookupError } from "@/lib/items";

export const dynamic = "force-dynamic";

/** A day, with every line resolved to the version that applied on that day. */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Ask for a date as YYYY-MM-DD." }, { status: 400 });
  }

  try {
    return NextResponse.json(await readDay(date));
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't read that day." },
      { status: 500 }
    );
  }
}
