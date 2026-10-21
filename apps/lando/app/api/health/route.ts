import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Check = { name: string; ok: boolean; detail: string };

/** What is reachable from a running deployment, checked rather than assumed. */
export async function GET() {
  const checks: Check[] = [];

  for (const [name, probe] of Object.entries(probes)) {
    try {
      checks.push({ name, ...(await probe()) });
    } catch (e) {
      checks.push({ name, ok: false, detail: (e as Error).message });
    }
  }

  const broken = checks.filter((c) => !c.ok);

  return NextResponse.json(
    { ok: broken.length === 0, checks },
    { status: broken.length === 0 ? 200 : 503 }
  );
}

const probes: Record<string, () => Promise<Omit<Check, "name">>> = {
  /**
   * A real table read: proves the service key works, the `lando` schema exists,
   * and it is on Supabase's exposed-schemas list. **A schema missing from that
   * dashboard list fails here as a permissions error**, which reads like a bad
   * key and is not one.
   */
  async database() {
    const { error } = await getServiceClient().from("events").select("id").limit(1);
    if (!error) return { ok: true, detail: "lando schema reachable" };
    return {
      ok: false,
      detail: `${error.message} — if this reads as a permissions failure, check the exposed-schemas list in the Supabase dashboard before suspecting the key`,
    };
  },

  async sessionSecret() {
    const s = process.env.SESSION_SECRET;
    if (!s) return { ok: false, detail: "SESSION_SECRET is not set" };
    return {
      ok: true,
      detail: "present — this probe cannot tell whether it matches the other apps, and a mismatch reads as a login bug rather than an error",
    };
  },
};
