import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Read-only: the Draft page shows a banner when this flags drift. The check
// itself runs on login (lib/modelCheck.ts), not here.
export async function GET() {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("model_status")
    .select("checked_at, pinned_model, newly_detected, drift_detected")
    .eq("id", 1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: data ?? null });
}
