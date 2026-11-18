import { NextResponse } from "next/server";
import { secretWarning, SECRET_EXPIRES } from "@/lib/calendar/expiry";
import { credentials } from "@/lib/calendar/graph";
import { supabaseStore } from "@/lib/calendar/store";

export const dynamic = "force-dynamic";

/**
 * What /more shows: whether Outlook is connected, how many events wait, the last
 * error, and the secret's expiry warning. Never the token, and no event text.
 */
export async function GET() {
  const base = { configured: credentials() !== null, secret_expires: SECRET_EXPIRES, warning: secretWarning(new Date()) };
  try {
    return NextResponse.json({ ...base, ...(await supabaseStore().status()) });
  } catch {
    // Most often `calendar` missing from the dashboard's exposed-schemas list (supabase/README.md, "A new schema inherits nothing").
    return NextResponse.json(
      { ...base, error: "The calendar database is not reachable. If this reads as a permissions failure, check that `calendar` is in the Supabase exposed-schemas list." },
      { status: 503 },
    );
  }
}
