import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { configProblems } from "@/lib/kroger";
import { CRON_SECRET_MIN_LENGTH } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";

type Check = { name: string; ok: boolean; detail: string };

/**
 * What is reachable from a running deployment, checked rather than assumed.
 *
 * Deliberately not a live Anthropic call: a request would cost money on every
 * probe and could fail for reasons that say nothing about this deployment.
 * Presence and shape only.
 */
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
   * The cheapest call that proves three things at once: the service key works,
   * the `cookbook` schema exists, and it is on Supabase's exposed-schemas list.
   *
   * **A schema missing from that dashboard list fails here as a permissions
   * error**, which reads like a bad key and is not one. That step is outside
   * this repo and is the step `supabase/README.md` lists for a new schema, and the one that gets missed, so this
   * probe is the thing that tells you it was. It bit `coffee` for an hour on
   * 2026-09-12 with the key suspected the whole time.
   */
  async database() {
    // A one-row read of a table this app owns, as Coffee does. Until 2026-09-25
    // this called `rpc("version")`, and no such function exists in `cookbook`,
    // so the probe failed on every deploy and blamed the dashboard (TEC-29).
    const { error } = await getServiceClient().from("recipes").select("id").limit(1);
    if (!error) return { ok: true, detail: "cookbook schema reachable" };
    return {
      ok: false,
      detail: `${error.message} — if this reads as a permissions failure, check the exposed-schemas list in the Supabase dashboard before suspecting the key`,
    };
  },

  async anthropicKey() {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return { ok: false, detail: "ANTHROPIC_API_KEY is not set" };
    if (!key.startsWith("sk-ant-")) return { ok: false, detail: "ANTHROPIC_API_KEY is set but does not look like a key" };
    return { ok: true, detail: "present, shape looks right — not called" };
  },

  /**
   * Send to cart's three variables (TEC-90): present, and the key the right
   * length. Never a call to Kroger, and never a value — names only.
   */
  async kroger() {
    const problems = configProblems();
    if (problems.length > 0) return { ok: false, detail: problems.join("; ") };
    return { ok: true, detail: "KROGER_CLIENT_ID, KROGER_CLIENT_SECRET and KROGER_TOKEN_KEY present — Kroger not called" };
  },

  async sessionSecret() {
    const s = process.env.SESSION_SECRET;
    if (!s) return { ok: false, detail: "SESSION_SECRET is not set" };
    return {
      ok: true,
      detail: "present — this probe cannot tell whether it matches the other apps, and a mismatch reads as a login bug rather than an error",
    };
  },

  /**
   * The nightly price scan's secret (TEC-132): set, and long enough for the gate
   * and the route to accept it. Presence and length only — never the value, and
   * never a call to the route. Unset or short, Vercel Cron's call is a 401 every
   * night and nothing else breaks.
   */
  async cronSecret() {
    const s = process.env.CRON_SECRET;
    if (!s) return { ok: false, detail: "CRON_SECRET is not set — the nightly price scan is refused" };
    if (s.length < CRON_SECRET_MIN_LENGTH) {
      return { ok: false, detail: `CRON_SECRET is set but under ${CRON_SECRET_MIN_LENGTH} characters — the gate and the route refuse it` };
    }
    return { ok: true, detail: `present, ${CRON_SECRET_MIN_LENGTH}+ characters — the route not called` };
  },
};
