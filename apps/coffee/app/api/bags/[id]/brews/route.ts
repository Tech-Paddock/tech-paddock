import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { isMyBrewer } from "@/lib/brewers";

export const dynamic = "force-dynamic";

const BREW_FIELDS = ["brewer", "brew_method", "grinder", "grind_setting", "notes"] as const;
// water_g is water into the brew; beverage_g is what came out of it. They
// are different measurements and the bed retains the difference, so one is
// never filled from the other. The ratio is water_g / dose_g and is derived
// on the page, never sent and never stored.
const NUMERIC_FIELDS = ["dose_g", "water_g", "beverage_g", "tds_percent"] as const;

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await getServiceClient()
    .from("brews")
    .select("*")
    .eq("bag_id", params.id)
    .order("brewed_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brews: data ?? [] });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Send a JSON object." }, { status: 400 });
  }

  const row: Record<string, unknown> = { bag_id: params.id };

  for (const key of BREW_FIELDS) {
    const value = body[key];
    if (value === undefined || value === null || value === "") continue;
    row[key] = String(value);
  }

  if (row.brewer && !isMyBrewer(row.brewer)) {
    return NextResponse.json({ error: `"${String(row.brewer)}" isn't one of your brewers.` }, { status: 400 });
  }

  // Measurements are refused rather than coerced. A dose that silently became
  // zero would produce an extraction yield that is arithmetically fine and
  // describes nothing.
  for (const key of NUMERIC_FIELDS) {
    const value = body[key];
    if (value === undefined || value === null || value === "") continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: `${key.replace(/_/g, " ")} must be a number above zero.` }, { status: 400 });
    }
    row[key] = n;
  }

  // Whole seconds, parsed on the page from what was typed as m:ss. Refused
  // rather than coerced for the same reason a dose is: a brew time that
  // silently became 0 or 3 would describe a brew that did not happen.
  if (body.brew_seconds !== undefined && body.brew_seconds !== null && body.brew_seconds !== "") {
    const n = Number(body.brew_seconds);
    if (!Number.isInteger(n) || n <= 0 || n >= 86400) {
      return NextResponse.json({ error: "Brew time must be a whole number of seconds." }, { status: 400 });
    }
    row.brew_seconds = n;
  }

  if (body.rating !== undefined && body.rating !== null && body.rating !== "") {
    const n = Number(body.rating);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return NextResponse.json({ error: "Rating must be a whole number from 1 to 5." }, { status: 400 });
    }
    row.rating = n;
  }

  if (typeof body.brewed_at === "string" && body.brewed_at) row.brewed_at = body.brewed_at;

  // extraction_yield is generated in Postgres and deliberately not accepted
  // here: it is a function of dose, beverage mass and TDS, and a value sent
  // from a client could disagree with the brew it claims to describe.
  const { data, error } = await getServiceClient().from("brews").insert(row).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brew: data }, { status: 201 });
}
