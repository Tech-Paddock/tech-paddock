import { NextResponse } from "next/server";
import { getServiceClient, getTrackerClient } from "@/lib/supabase";
import { BUCKET } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Check = { name: string; ok: boolean; detail: string };

/**
 * Says which dependency is unhappy, so a failure in the app reads as something
 * specific rather than a generic 500. Everything the reformatter needs at
 * runtime is checked here.
 */
export async function GET() {
  const checks: Check[] = [];

  for (const [name, run] of Object.entries(probes)) {
    try {
      checks.push({ name, ...(await run()) });
    } catch (error) {
      checks.push({ name, ok: false, detail: error instanceof Error ? error.message : "threw" });
    }
  }

  // A missing template is a setup step, not a broken dependency — it should not
  // make the app look down.
  const degradedOnly = new Set(["active_template"]);
  const broken = checks.filter((c) => !c.ok && !degradedOnly.has(c.name));

  return NextResponse.json(
    { ok: broken.length === 0, checks },
    { status: broken.length === 0 ? 200 : 503 }
  );
}

const probes: Record<string, () => Promise<Omit<Check, "name">>> = {
  async database() {
    const { error } = await getServiceClient().from("templates").select("id").limit(1);
    return error ? { ok: false, detail: error.message } : { ok: true, detail: "resume schema reachable" };
  },

  async storage() {
    // Listing an empty prefix is the cheapest call that proves the bucket exists
    // and the key can reach it.
    const { error } = await getServiceClient().storage.from(BUCKET).list("templates", { limit: 1 });
    return error ? { ok: false, detail: error.message } : { ok: true, detail: `bucket ${BUCKET} reachable` };
  },

  async tracker() {
    const { error } = await getTrackerClient().from("pipeline_threads").select("id").limit(1);
    return error ? { ok: false, detail: error.message } : { ok: true, detail: "tracker schema reachable" };
  },

  async active_template() {
    const { data, error } = await getServiceClient()
      .from("templates")
      .select("name, version")
      .eq("is_active", true)
      .maybeSingle();
    if (error) return { ok: false, detail: error.message };
    return data
      ? { ok: true, detail: `${data.name} (v${data.version})` }
      : { ok: false, detail: "none set — upload one on the Templates tab" };
  },
};
