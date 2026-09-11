import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { BUCKET } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Check = { name: string; ok: boolean; detail: string };

/**
 * Says which dependency is unhappy, so a misconfigured deploy reads as
 * something specific rather than a generic 500.
 *
 * This exists for the standup: five environment variables are set by hand in
 * the Vercel dashboard, the build succeeds whether or not they are right
 * (they are read per request, not at build time), and the first thing that
 * would otherwise surface a mistake is a failed bag scan with an opaque
 * error.
 *
 * It sits behind the password gate, like the reformatter's. That means it can
 * only be reached once APP_PASSWORD_HASH and SESSION_SECRET are already
 * working — which is fine, because reaching it at all proves those two, and
 * the three it does check are the ones with no other cheap signal.
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

  const broken = checks.filter((c) => !c.ok);

  return NextResponse.json(
    { ok: broken.length === 0, checks },
    { status: broken.length === 0 ? 200 : 503 }
  );
}

const probes: Record<string, () => Promise<Omit<Check, "name">>> = {
  async database() {
    const { error } = await getServiceClient().from("bags").select("id").limit(1);
    return error
      ? { ok: false, detail: error.message }
      : { ok: true, detail: "coffee schema reachable" };
  },

  async storage() {
    // Listing an empty prefix is the cheapest call that proves the bucket
    // exists and the service key can reach it.
    const { error } = await getServiceClient().storage.from(BUCKET).list("", { limit: 1 });
    return error ? { ok: false, detail: error.message } : { ok: true, detail: `bucket ${BUCKET} reachable` };
  },

  /**
   * Presence and shape only — deliberately not a live API call. A request
   * would cost money, and it could fail for reasons that have nothing to do
   * with whether the variable was set correctly, which is the only question
   * being asked here. Reported honestly as "set", never as "working".
   */
  async anthropic_key() {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return { ok: false, detail: "ANTHROPIC_API_KEY is not set" };
    if (!key.startsWith("sk-ant-")) {
      return { ok: false, detail: "ANTHROPIC_API_KEY is set but does not look like an Anthropic key" };
    }
    return { ok: true, detail: "set (not verified against the API)" };
  },
};
